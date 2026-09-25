// .lume ZIP 包的读取、校验、写入与内容 hash。
//
// 使用 JSZip（与浏览器运行时同一实现），因此同一份代码可以在教师服务、
// 编辑器预览和浏览器里复用。所有路径、大小和压缩比都在解包前检查，
// 课件视为可能不可信的输入。

const JSZip = require('jszip');

const {
    LIMITS,
    CourseFormatError,
    isSafeRelativePath,
    validateManifest,
    normalizeManifest
} = require('./manifest');

const MANIFEST_NAME = 'manifest.json';
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

function toHex(buffer) {
    return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * SHA-256 十六进制摘要。
 * 优先用 Web Crypto（浏览器与 Node 18+ 都有），不可用时回退到 Node 的 crypto，
 * 这样同一个包在教师服务、构建脚本和未来的网页编辑器里都能算 hash。
 */
async function sha256Hex(bytes) {
    const subtle = globalThis.crypto?.subtle;
    if (subtle && typeof subtle.digest === 'function') {
        const digest = await subtle.digest('SHA-256', bytes);
        return toHex(digest);
    }
    const nodeCrypto = require('crypto');
    return nodeCrypto.createHash('sha256').update(bytes).digest('hex');
}

function looksLikeZip(input) {
    if (!input || input.length < 4) return false;
    return ZIP_MAGIC.every((byte, index) => input[index] === byte);
}

function toUint8Array(input) {
    if (input instanceof Uint8Array) return input;
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    return null;
}

/** 通过魔数区分 ZIP 课件、旧脚本课件与未知内容。 */
function detectCourseFormat(input) {
    const bytes = toUint8Array(input);
    if (bytes && looksLikeZip(bytes)) return 'lume-zip';
    if (typeof input === 'string') {
        return input.includes('window.CourseData') ? 'legacy-script' : 'unknown';
    }
    if (bytes) {
        const text = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 65536))).toString('utf8');
        if (text.includes('window.CourseData')) return 'legacy-script';
    }
    return 'unknown';
}

function entrySize(entry) {
    const data = entry && entry._data;
    if (!data) return { uncompressedSize: null, compressedSize: null };
    return {
        uncompressedSize: Number.isFinite(data.uncompressedSize) ? data.uncompressedSize : null,
        compressedSize: Number.isFinite(data.compressedSize) ? data.compressedSize : null
    };
}

function fail(code, message, details) {
    return { ok: false, code, errors: [{ path: 'package', code, message }], warnings: [], details: details || {} };
}

/**
 * 读取并校验 .lume 包。
 *
 * @param {Buffer|Uint8Array|ArrayBuffer} input ZIP 内容
 * @param {object} [options]
 * @param {boolean} [options.strictSchemaVersion] 传给 manifest 校验，默认 true
 * @param {object} [options.limits] 覆盖默认上限
 * @returns {Promise<object>} 成功时含 manifest/entries/readFile/readText
 */
async function readLumePackage(input, options = {}) {
    const limits = { ...LIMITS, ...(options.limits || {}) };
    const bytes = toUint8Array(input);
    if (!bytes) {
        return fail('package_input_invalid', '需要 Buffer、Uint8Array 或 ArrayBuffer');
    }
    if (!looksLikeZip(bytes)) {
        return fail('package_not_a_zip', '内容不是 ZIP 包；旧脚本 .lume 需要先迁移');
    }

    let zip;
    try {
        zip = await JSZip.loadAsync(bytes, { checkCRC32: false, createFolders: false });
    } catch (error) {
        return fail('package_unreadable', `ZIP 解析失败：${error.message}`);
    }

    const warnings = [];
    const entryNames = [];
    let totalUncompressed = 0;

    for (const entry of Object.values(zip.files)) {
        if (entry.dir) continue;
        // 用打包时写入的原始名做路径校验：JSZip 会把 `a/../b` 归一成 `b`、
        // 也会保留绝对路径，若只看归一后的名字，同步/异步两条读取路径会得出不同结论。
        const rawName = entry.unsafeOriginalName || entry.name;
        if (!isSafeRelativePath(rawName)) {
            return fail('package_entry_path_unsafe', `ZIP 内条目路径不安全：${rawName}`, { entry: rawName });
        }
        const name = entry.name;
        const { uncompressedSize, compressedSize } = entrySize(entry);
        if (uncompressedSize !== null && uncompressedSize > limits.maxEntryUncompressedBytes) {
            return fail('package_entry_too_large', `条目 ${name} 解压后超过单文件上限`, {
                entry: name, size: uncompressedSize, limit: limits.maxEntryUncompressedBytes
            });
        }
        if (uncompressedSize !== null && compressedSize) {
            const ratio = uncompressedSize / Math.max(1, compressedSize);
            if (ratio > limits.maxCompressionRatio) {
                return fail('package_compression_ratio_exceeded', `条目 ${name} 压缩比 ${ratio.toFixed(0)} 超过上限`, {
                    entry: name, ratio, limit: limits.maxCompressionRatio
                });
            }
        }
        if (uncompressedSize !== null) totalUncompressed += uncompressedSize;
        entryNames.push(name);
        if (entryNames.length > limits.maxEntries) {
            return fail('package_too_many_entries', `ZIP 条目数超过上限 ${limits.maxEntries}`);
        }
    }

    if (totalUncompressed > limits.maxTotalUncompressedBytes) {
        return fail('package_too_large', 'ZIP 解压后总大小超过上限', {
            size: totalUncompressed, limit: limits.maxTotalUncompressedBytes
        });
    }

    const manifestEntry = zip.file(MANIFEST_NAME);
    if (!manifestEntry) {
        return fail('manifest_missing', 'ZIP 根目录缺少 manifest.json');
    }
    const { uncompressedSize: manifestSize } = entrySize(manifestEntry);
    if (manifestSize !== null && manifestSize > limits.maxManifestBytes) {
        return fail('manifest_too_large', `manifest.json 超过 ${limits.maxManifestBytes} 字节`);
    }

    let manifestText;
    try {
        manifestText = await manifestEntry.async('string');
    } catch (error) {
        return fail('manifest_unreadable', `manifest.json 读取失败：${error.message}`);
    }
    if (manifestText.length > limits.maxManifestBytes) {
        return fail('manifest_too_large', `manifest.json 超过 ${limits.maxManifestBytes} 字节`);
    }

    let manifest;
    try {
        manifest = JSON.parse(manifestText);
    } catch (error) {
        return fail('manifest_invalid_json', `manifest.json 不是合法 JSON：${error.message}`);
    }

    const validation = validateManifest(manifest, {
        entryNames,
        strictSchemaVersion: options.strictSchemaVersion !== false
    });
    warnings.push(...validation.warnings);
    if (!validation.ok) {
        return { ok: false, code: 'manifest_invalid', errors: validation.errors, warnings, entryNames };
    }

    const normalized = normalizeManifest(validation.value);

    async function readFile(name, type = 'uint8array') {
        if (!isSafeRelativePath(name)) {
            throw new CourseFormatError('package_entry_path_unsafe', `条目路径不安全：${name}`);
        }
        const entry = zip.file(name);
        if (!entry) {
            throw new CourseFormatError('package_entry_not_found', `ZIP 内不存在条目：${name}`);
        }
        const { uncompressedSize } = entrySize(entry);
        if (uncompressedSize !== null && uncompressedSize > limits.maxEntryUncompressedBytes) {
            throw new CourseFormatError('package_entry_too_large', `条目过大，拒绝解压：${name}`);
        }
        const content = await entry.async(type);
        if (content && content.length !== undefined && content.length > limits.maxEntryUncompressedBytes) {
            throw new CourseFormatError('package_entry_too_large', `条目解压后过大：${name}`);
        }
        return content;
    }

    return {
        ok: true,
        code: null,
        errors: [],
        warnings,
        manifest: normalized,
        rawManifest: manifest,
        entries: entryNames.slice().sort(),
        totalUncompressedBytes: totalUncompressed,
        readFile,
        readText: (name) => readFile(name, 'string')
    };
}

/**
 * 生成 .lume 包。条目顺序固定（manifest.json 在最前，其余按名称排序），
 * 时间戳可固定，便于生成可复现的包和稳定的 hash。
 *
 * @param {object} input
 * @param {object} input.manifest
 * @param {Record<string, string|Uint8Array|Buffer>|Map<string, any>} input.files
 * @param {object} [options]
 * @param {Date|string|number} [options.date] 固定条目时间
 * @param {'uint8array'|'nodebuffer'|'base64'} [options.outputType]
 */
async function writeLumePackage({ manifest, files }, options = {}) {
    const fileMap = files instanceof Map ? files : new Map(Object.entries(files || {}));
    const names = Array.from(fileMap.keys());
    const entryNames = [MANIFEST_NAME, ...names];

    for (const name of names) {
        if (!isSafeRelativePath(name)) {
            throw new CourseFormatError('package_entry_path_unsafe', `条目路径不安全：${name}`);
        }
    }

    const normalized = normalizeManifest(manifest);
    const validation = validateManifest(normalized, { entryNames, strictSchemaVersion: true });
    if (!validation.ok) {
        const summary = validation.errors.map((item) => `${item.path}: ${item.message}`).join('; ');
        throw new CourseFormatError('manifest_invalid', `manifest 校验失败：${summary}`, { errors: validation.errors });
    }

    const zip = new JSZip();
    const date = options.date ? new Date(options.date) : new Date();
    zip.file(MANIFEST_NAME, `${JSON.stringify(validation.value, null, 2)}\n`, { date, createFolders: false });
    for (const name of names.slice().sort((a, b) => a.localeCompare(b, 'en'))) {
        const content = fileMap.get(name);
        zip.file(name, content, {
            date,
            createFolders: false,
            binary: typeof content !== 'string'
        });
    }

    return zip.generateAsync({
        type: options.outputType || 'uint8array',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 },
        platform: 'UNIX',
        streamFiles: false
    });
}

/**
 * 内容 hash：对（路径, 内容 sha256）排序后整体再 hash。
 * 不依赖 ZIP 元数据，因此重新打包（时间、压缩级别不同）也得到同一 hash。
 */
async function computeCourseHash(input, options = {}) {
    const pkg = options.package || await readLumePackage(input, options);
    if (!pkg.ok) {
        throw new CourseFormatError(pkg.code || 'package_invalid', '无法计算课件 hash：包无效');
    }
    const lines = [];
    for (const name of pkg.entries) {
        const content = await pkg.readFile(name);
        const digest = await sha256Hex(content);
        lines.push(`${name}\t${digest}`);
    }
    const total = await sha256Hex(new TextEncoder().encode(lines.join('\n')));
    return { algorithm: 'sha256', hash: `sha256:${total}`, entryCount: lines.length };
}

module.exports = {
    MANIFEST_NAME,
    looksLikeZip,
    detectCourseFormat,
    readLumePackage,
    writeLumePackage,
    computeCourseHash,
    toUint8Array
};
