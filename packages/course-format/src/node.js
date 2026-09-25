// Node 专用的文件系统辅助（浏览器端不要引用本子路径）。
//
// 保存课件时先写临时文件再改名，保证目标 .lume 不会被半截内容覆盖；
// 这也是目标设计里"原子替换完整 ZIP"的最小实现。

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const zlib = require('zlib');

const {
    CourseFormatError,
    LIMITS,
    isSafeRelativePath,
    validateManifest,
    normalizeManifest
} = require('./manifest');
const { readLumePackage, writeLumePackage, detectCourseFormat, looksLikeZip } = require('./package');
const { migrateLegacyCourse } = require('./migrate');

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MANIFEST_NAME = 'manifest.json';

function findEndOfCentralDirectory(buffer) {
    const minOffset = Math.max(0, buffer.length - 0xffff - 22);
    for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
        if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
    }
    return -1;
}

/**
 * 同步读取 ZIP 课件里的 manifest（不依赖 JSZip 的异步 API）。
 *
 * 课程目录扫描是同步的（routes/scanCourses），因此格式库必须提供同步入口，
 * 否则调用方会像过去那样各自实现一份 ZIP 解析。这里与异步路径共用同一套
 * 路径、大小和 manifest 校验规则。
 *
 * @returns {{ok: boolean, code: string|null, manifest: object|null, entryNames: string[], errors: Array, warnings: Array}}
 */
function readLumeManifestSync(input, options = {}) {
    const limits = { ...LIMITS, ...(options.limits || {}) };
    let buffer;
    if (Buffer.isBuffer(input)) {
        buffer = input;
    } else {
        const stat = fs.statSync(input);
        if (stat.size > limits.maxPackageBytes) {
            return failure('package_too_large', `包文件超过上限 ${limits.maxPackageBytes} 字节：${input}`);
        }
        buffer = fs.readFileSync(input);
    }
    const failure = (code, message) => ({
        ok: false,
        code,
        manifest: null,
        entryNames: [],
        errors: [{ path: 'package', code, message }],
        warnings: []
    });

    if (!looksLikeZip(buffer)) return failure('package_not_a_zip', '内容不是 ZIP 包');

    const eocdOffset = findEndOfCentralDirectory(buffer);
    if (eocdOffset < 0) return failure('package_unreadable', '找不到 ZIP 中央目录');

    const centralDirSize = buffer.readUInt32LE(eocdOffset + 12);
    const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);
    const centralDirEnd = Math.min(buffer.length, centralDirOffset + centralDirSize);

    const entryNames = [];
    let totalUncompressed = 0;
    let manifestEntry = null;
    let offset = centralDirOffset;

    while (offset + 46 <= centralDirEnd && buffer.readUInt32LE(offset) === CENTRAL_SIGNATURE) {
        const compressionMethod = buffer.readUInt16LE(offset + 10);
        const compressedSize = buffer.readUInt32LE(offset + 20);
        const uncompressedSize = buffer.readUInt32LE(offset + 24);
        const fileNameLength = buffer.readUInt16LE(offset + 28);
        const extraLength = buffer.readUInt16LE(offset + 30);
        const commentLength = buffer.readUInt16LE(offset + 32);
        const localHeaderOffset = buffer.readUInt32LE(offset + 42);
        const name = buffer.slice(offset + 46, offset + 46 + fileNameLength).toString('utf8');

        // 目录条目（以 / 结尾）由打包器自动生成，不参与路径与大小统计。
        if (name.endsWith('/')) {
            offset += 46 + fileNameLength + extraLength + commentLength;
            continue;
        }
        // 与异步读取器一致：直接校验 ZIP 里的原始名，不做反斜杠替换或 `..` 归一，
        // 否则同一个包在编辑器（异步）与服务端扫描（同步）会得出不同结论。
        if (!isSafeRelativePath(name)) {
            return failure('package_entry_path_unsafe', `ZIP 内条目路径不安全：${name}`);
        }
        if (uncompressedSize > limits.maxEntryUncompressedBytes) {
            return failure('package_entry_too_large', `条目 ${name} 解压后超过单文件上限`);
        }
        if (compressedSize > 0 && uncompressedSize / compressedSize > limits.maxCompressionRatio) {
            return failure('package_compression_ratio_exceeded', `条目 ${name} 压缩比超过上限`);
        }
        totalUncompressed += uncompressedSize;
        if (totalUncompressed > limits.maxTotalUncompressedBytes) {
            return failure('package_too_large', 'ZIP 解压后总大小超过上限');
        }
        entryNames.push(name);
        if (entryNames.length > limits.maxEntries) {
            return failure('package_too_many_entries', `ZIP 条目数超过上限 ${limits.maxEntries}`);
        }
        if (name === MANIFEST_NAME) {
            manifestEntry = { compressionMethod, compressedSize, uncompressedSize, localHeaderOffset };
        }

        offset += 46 + fileNameLength + extraLength + commentLength;
    }

    if (!manifestEntry) return failure('manifest_missing', 'ZIP 根目录缺少 manifest.json');
    if (manifestEntry.uncompressedSize > limits.maxManifestBytes) {
        return failure('manifest_too_large', `manifest.json 超过 ${limits.maxManifestBytes} 字节`);
    }

    let manifestText;
    try {
        if (buffer.readUInt32LE(manifestEntry.localHeaderOffset) !== LOCAL_SIGNATURE) {
            return failure('package_unreadable', 'manifest.json 的本地文件头损坏');
        }
        const localNameLength = buffer.readUInt16LE(manifestEntry.localHeaderOffset + 26);
        const localExtraLength = buffer.readUInt16LE(manifestEntry.localHeaderOffset + 28);
        const dataOffset = manifestEntry.localHeaderOffset + 30 + localNameLength + localExtraLength;
        const compressed = buffer.slice(dataOffset, dataOffset + manifestEntry.compressedSize);
        const raw = manifestEntry.compressionMethod === 0
            ? compressed
            : manifestEntry.compressionMethod === 8
                ? zlib.inflateRawSync(compressed, { maxOutputLength: limits.maxManifestBytes })
                : null;
        if (!raw) return failure('package_unreadable', `不支持的压缩方式 ${manifestEntry.compressionMethod}`);
        manifestText = raw.toString('utf8');
    } catch (error) {
        return failure('manifest_unreadable', `manifest.json 读取失败：${error.message}`);
    }

    let manifest;
    try {
        manifest = JSON.parse(manifestText);
    } catch (error) {
        return failure('manifest_invalid_json', `manifest.json 不是合法 JSON：${error.message}`);
    }

    const validation = validateManifest(manifest, {
        entryNames,
        strictSchemaVersion: options.strictSchemaVersion !== false
    });
    if (!validation.ok) {
        return {
            ok: false,
            code: 'manifest_invalid',
            manifest: null,
            entryNames,
            errors: validation.errors,
            warnings: validation.warnings
        };
    }

    return {
        ok: true,
        code: null,
        manifest: normalizeManifest(validation.value),
        entryNames,
        errors: [],
        warnings: validation.warnings
    };
}

/** 同步校验磁盘上的 .lume，供课程扫描与导入前检查使用。 */
function lintLumeFileSync(filePath, options = {}) {
    let buffer;
    try {
        const limits = { ...LIMITS, ...(options.limits || {}) };
        const stat = fs.statSync(filePath);
        if (stat.size > limits.maxPackageBytes) {
            return {
                ok: false,
                code: 'package_too_large',
                manifest: null,
                entryNames: [],
                errors: [{ path: 'package', code: 'package_too_large', message: `包文件超过上限 ${limits.maxPackageBytes} 字节` }],
                warnings: []
            };
        }
        buffer = fs.readFileSync(filePath);
    } catch (error) {
        return {
            ok: false,
            code: 'package_unreadable',
            manifest: null,
            entryNames: [],
            errors: [{ path: 'package', code: 'package_unreadable', message: error.message }],
            warnings: []
        };
    }

    if (detectCourseFormat(buffer) === 'legacy-script') {
        return {
            ok: false,
            code: 'legacy_script_course',
            manifest: null,
            entryNames: [],
            errors: [{ path: 'package', code: 'legacy_script_course', message: '旧脚本课件需要先迁移为 ZIP 课件' }],
            warnings: []
        };
    }

    return readLumeManifestSync(buffer, options);
}

/** 读取磁盘上的 .lume 并校验。 */
async function readLumeFile(filePath, options = {}) {
    const limits = { ...LIMITS, ...(options.limits || {}) };
    const stat = await fsp.stat(filePath);
    if (stat.size > limits.maxPackageBytes) {
        throw new CourseFormatError('package_too_large', `包文件超过上限 ${limits.maxPackageBytes} 字节：${filePath}`);
    }
    const buffer = await fsp.readFile(filePath);
    const result = await readLumePackage(buffer, options);
    return { ...result, filePath, fileSize: buffer.length };
}

/** 原子写入 .lume。 */
async function writeLumeFile(filePath, coursePackage, options = {}) {
    const target = path.resolve(filePath);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    const outputType = 'nodebuffer';
    const buffer = await writeLumePackage(coursePackage, { ...options, outputType });
    const tempPath = `${target}.tmp-${process.pid}-${Date.now()}`;
    try {
        await fsp.writeFile(tempPath, buffer);
        await fsp.rename(tempPath, target);
    } catch (error) {
        await fsp.rm(tempPath, { force: true }).catch(() => {});
        throw error;
    }
    return { filePath: target, bytes: buffer.length };
}

/**
 * 迁移单个旧 .lume 文件。
 * 默认不覆盖原文件：输出为 `<name>.migrated.lume`，与既有脚本行为一致。
 */
async function migrateLegacyLumeFile(inputPath, explicitOutputPath, options = {}) {
    const input = path.resolve(inputPath || '');
    if (!input) throw new CourseFormatError('input_required', '必须提供输入路径');
    let stat;
    try {
        stat = await fsp.stat(input);
    } catch (_) {
        throw new CourseFormatError('input_not_found', `找不到输入文件：${input}`);
    }
    if (!stat.isFile()) throw new CourseFormatError('input_not_a_file', `输入不是文件：${input}`);
    if (path.extname(input).toLowerCase() !== '.lume') {
        throw new CourseFormatError('input_not_lume', '输入必须是 .lume 文件');
    }

    const output = explicitOutputPath
        ? path.resolve(explicitOutputPath)
        : input.replace(/\.lume$/i, '.migrated.lume');
    if (output.toLowerCase() === input.toLowerCase()) {
        throw new CourseFormatError('output_must_differ', '输出路径必须与输入不同，原文件需保留备份');
    }

    const source = await fsp.readFile(input, 'utf8');
    if (detectCourseFormat(source) === 'lume-zip') {
        throw new CourseFormatError('input_already_zip', '输入已经是 ZIP 课件，无需迁移');
    }

    const baseName = path.basename(input, '.lume');
    const result = await migrateLegacyCourse(source, { baseName, ...options });
    await fsp.writeFile(output, Buffer.from(result.buffer));
    return {
        inputPath: input,
        outputPath: output,
        title: result.title,
        manifestId: result.id,
        sourceHash: result.sourceHash
    };
}

/** 递归收集目录下需要迁移的旧 .lume（跳过 ZIP 课件）。同步接口，便于脚本直接遍历。 */
function collectLegacyLumeFiles(targetPath) {
    const resolved = path.resolve(targetPath || '');
    if (!resolved) throw new CourseFormatError('input_required', '必须提供路径');
    const stat = fs.statSync(resolved);

    const isLegacy = (filePath) => {
        const fd = fs.openSync(filePath, 'r');
        try {
            const header = Buffer.alloc(4);
            fs.readSync(fd, header, 0, 4, 0);
            const isZip = header[0] === 0x50 && header[1] === 0x4b;
            return !isZip;
        } finally {
            fs.closeSync(fd);
        }
    };

    if (stat.isFile()) {
        if (path.extname(resolved).toLowerCase() !== '.lume') return [];
        return isLegacy(resolved) ? [resolved] : [];
    }

    const results = [];
    const stack = [resolved];
    while (stack.length > 0) {
        const current = stack.pop();
        const entries = fs.readdirSync(current, { withFileTypes: true })
            .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
        for (const entry of entries) {
            const absolute = path.join(current, entry.name);
            if (entry.isDirectory()) {
                stack.push(absolute);
                continue;
            }
            if (path.extname(entry.name).toLowerCase() !== '.lume') continue;
            if (!isLegacy(absolute)) continue;
            results.push(absolute);
        }
    }
    return results.sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

module.exports = {
    readLumeManifestSync,
    lintLumeFileSync,
    readLumeFile,
    writeLumeFile,
    migrateLegacyLumeFile,
    collectLegacyLumeFiles
};
