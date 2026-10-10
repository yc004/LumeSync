#!/usr/bin/env node
// 学生课堂 UI 构建脚本。
//
// 设计约束（见 docs/architecture/target-architecture.md §6 模块归属）：
//   - 正式课堂页由学生端仓库拥有，教师服务只分发构建产物。
//   - 产物是不可变的版本化目录 dist/<version>/…，配合 dist/manifest.json 与
//     dist/current.json，消费方（教师服务）无需 glob 目录即可解析当前版本。
//   - 纯 Node（ESM），不引入新依赖；页面仍在浏览器里由 Babel Standalone 编译，
//     因此这里做的是"打包 + 记录哈希"，不是编译，服务启动也不依赖 Babel。
//
// 版本号 = `<package.json version>-<构建输入内容 sha256 前 12 位>`。
// 构建输入（src/ 下的字节）不变时版本不变，重复构建是幂等的。

import { createHash } from 'node:crypto';
import {
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    rmSync,
    writeFileSync
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '..');
const srcDir = join(packageRoot, 'src');
const distDir = join(packageRoot, 'dist');
const manifestPath = join(distDir, 'manifest.json');
const currentPath = join(distDir, 'current.json');

const ENTRY_FILE = 'index.html';
const MANIFEST_FILE = 'manifest.json';
const CURRENT_FILE = 'current.json';
const APP_SCRIPT_SOURCE = 'classroom-app.js';
const APP_SCRIPT_REFERENCE = `src="${APP_SCRIPT_SOURCE}"`;
const PROTOCOL_CLIENT_REFERENCE = '/protocol-client.js';
const VERSION_DIR_PATTERN = /^\d+\.\d+\.\d+-[0-9a-f]{12}$/;

// 构建输入清单：src 文件 → dist/<version>/ 文件。
const BUILD_INPUTS = [
    { name: ENTRY_FILE, transform: rewriteIndexHtml },
    { name: APP_SCRIPT_SOURCE }
];

function computeVersion(packageVersion, inputs) {
    const hash = createHash('sha256');
    hash.update(`lumesync-student-ui\0${packageVersion}\0`);
    for (const input of [...inputs].sort((a, b) => a.name.localeCompare(b.name))) {
        hash.update(`${input.name}\0${input.bytes.byteLength}\0`);
        hash.update(input.bytes);
    }
    return `${packageVersion}-${hash.digest('hex').slice(0, 12)}`;
}

// 把 src/index.html 里的相对脚本引用重写成版本化的绝对 URL。
// 已构建的 HTML 不允许再被重写（否则版本路径会被二次替换）。
function rewriteIndexHtml(text, version) {
    const occurrences = text.split(APP_SCRIPT_REFERENCE).length - 1;
    if (occurrences !== 1) {
        throw new Error(
            `src/${ENTRY_FILE} 必须恰好包含一处 ${APP_SCRIPT_REFERENCE}，实际 ${occurrences} 处；` +
            '构建脚本依赖这一处引用注入版本号。'
        );
    }

    const versionedReference = `/classroom/${version}/${APP_SCRIPT_SOURCE}`;
    const rewritten = text.split(APP_SCRIPT_REFERENCE).join(`src="${versionedReference}"`);

    const protocolIndex = rewritten.indexOf(PROTOCOL_CLIENT_REFERENCE);
    if (protocolIndex === -1) {
        throw new Error(`src/${ENTRY_FILE} 必须引入 ${PROTOCOL_CLIENT_REFERENCE}（协议版本全局）`);
    }
    const appIndex = rewritten.indexOf(versionedReference);
    if (protocolIndex > appIndex) {
        throw new Error(`${PROTOCOL_CLIENT_REFERENCE} 必须在课堂页脚本之前加载`);
    }

    return Buffer.from(rewritten, 'utf8');
}

function readTextInput(name) {
    const bytes = readFileSync(join(srcDir, name));
    // 保留 BOM：以 utf8 解码后 U+FEFF 仍在字符串头部，重新编码会写回同样的字节。
    return { bytes, text: bytes.toString('utf8') };
}

function sha256(buffer) {
    return createHash('sha256').update(buffer).digest('hex');
}

function pruneStaleVersions(targetDist, currentVersion) {
    if (!existsSync(targetDist)) return [];
    const removed = [];
    for (const entry of readdirSync(targetDist, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (entry.name === currentVersion) continue;
        if (!VERSION_DIR_PATTERN.test(entry.name)) continue;
        rmSync(join(targetDist, entry.name), { recursive: true, force: true });
        removed.push(entry.name);
    }
    return removed;
}

export function buildClassroomUi(options = {}) {
    const targetDist = options.distDir || distDir;
    const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));

    const inputs = BUILD_INPUTS.map(({ name, transform }) => {
        const { bytes, text } = readTextInput(name);
        return { name, bytes, text, transform };
    });

    const version = computeVersion(pkg.version, inputs);
    const versionDir = join(targetDist, version);
    const files = [];

    for (const input of inputs) {
        const output = input.transform ? input.transform(input.text, version) : input.bytes;
        const outputPath = join(versionDir, input.name);
        mkdirSync(dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, output);
        files.push({
            path: input.name,
            size: output.byteLength,
            sha256: sha256(output)
        });
    }

    files.sort((a, b) => a.path.localeCompare(b.path));

    const manifest = { version, files, entry: ENTRY_FILE };
    const pointer = {
        version,
        dir: version,
        entry: ENTRY_FILE,
        manifest: MANIFEST_FILE
    };

    mkdirSync(targetDist, { recursive: true });
    writeFileSync(join(targetDist, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    writeFileSync(join(targetDist, CURRENT_FILE), `${JSON.stringify(pointer, null, 2)}\n`, 'utf8');

    const pruned = pruneStaleVersions(targetDist, version);

    return {
        version,
        distDir: targetDist,
        versionDir,
        manifestPath: join(targetDist, MANIFEST_FILE),
        currentPath: join(targetDist, CURRENT_FILE),
        manifest,
        pointer,
        pruned
    };
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
    try {
        const result = buildClassroomUi();
        console.log(`[student-ui] built version ${result.version} -> ${result.versionDir}`);
        for (const file of result.manifest.files) {
            console.log(`[student-ui]   ${file.path} ${file.size} bytes sha256=${file.sha256}`);
        }
        for (const stale of result.pruned) {
            console.log(`[student-ui] pruned stale version ${stale}`);
        }
    } catch (err) {
        console.error(`[student-ui] build failed: ${err.message}`);
        process.exit(1);
    }
}

export { computeVersion, distDir, manifestPath, currentPath, packageRoot, rewriteIndexHtml };
