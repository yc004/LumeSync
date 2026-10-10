// 构建产物测试。
//
// 学生课堂 UI 是版本化静态产物，教师服务只按 dist/current.json 分发；
// 这里用真实的构建脚本（含 CLI 路径）验证目录布局、manifest 哈希、
// HTML 重写、exports 解析和重复构建的确定性。

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildClassroomUi, computeVersion, rewriteIndexHtml } from '../scripts/build.mjs';

const require = createRequire(import.meta.url);
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(packageRoot, 'dist');
const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const readJson = (filePath) => JSON.parse(readFileSync(filePath, 'utf8'));

test('CLI 构建产出 dist/<version>/…、manifest.json 与 current.json', () => {
    const result = spawnSync(process.execPath, [join(packageRoot, 'scripts', 'build.mjs')], {
        cwd: packageRoot,
        encoding: 'utf8'
    });
    assert.equal(result.status, 0, `构建脚本退出码非 0：${result.stderr}`);

    const current = readJson(join(distDir, 'current.json'));
    const manifest = readJson(join(distDir, 'manifest.json'));

    assert.match(current.version, /^\d+\.\d+\.\d+-[0-9a-f]{12}$/);
    assert.equal(current.dir, current.version);
    assert.equal(current.entry, 'index.html');
    assert.equal(current.manifest, 'manifest.json');

    assert.equal(manifest.version, current.version);
    assert.equal(manifest.entry, 'index.html');
    assert.deepEqual(manifest.files.map((file) => file.path), ['classroom-app.js', 'index.html']);

    const versionDir = join(distDir, current.version);
    assert.ok(existsSync(versionDir), `缺少版本目录 ${versionDir}`);
    for (const file of manifest.files) {
        const bytes = readFileSync(join(versionDir, file.path));
        assert.equal(bytes.byteLength, file.size, `${file.path} 的 manifest 大小与实际不符`);
        assert.equal(sha256(bytes), file.sha256, `${file.path} 的 manifest sha256 与实际不符`);
    }

    // 过期版本目录会被清理，dist 下只保留当前版本和两个指针文件。
    assert.deepEqual(
        readdirSync(distDir).sort(),
        [current.version, 'current.json', 'manifest.json'].sort()
    );
});

test('构建产物是源文件的拷贝，BOM 与内容一致', () => {
    const built = readFileSync(join(distDir, readJson(join(distDir, 'current.json')).version, 'classroom-app.js'));
    const source = readFileSync(join(packageRoot, 'src', 'classroom-app.js'));
    assert.deepEqual(built, source);
    assert.deepEqual([...built.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
});

test('构建后的 HTML 引用版本化脚本，且 /protocol-client.js 在前', () => {
    const current = readJson(join(distDir, 'current.json'));
    const html = readFileSync(join(distDir, current.version, 'index.html'), 'utf8');
    const versionedReference = `/classroom/${current.version}/classroom-app.js`;

    assert.match(html, new RegExp(`<script type="text/babel" src="${versionedReference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"></script>`));
    assert.equal(html.includes('src="classroom-app.js"'), false, '构建后不得残留未版本化的脚本引用');

    const protocolIndex = html.indexOf('/protocol-client.js');
    const appIndex = html.indexOf(versionedReference);
    const renderEngineIndex = html.indexOf('/render-engine.js');
    assert.notEqual(protocolIndex, -1, '构建后的 HTML 必须引入 /protocol-client.js');
    assert.ok(protocolIndex < appIndex, '/protocol-client.js 必须在课堂页脚本之前');
    assert.ok(protocolIndex < renderEngineIndex, '/protocol-client.js 必须在 /render-engine.js 之前');

    // 宿主仍然提供依赖与渲染引擎，只有课堂页本身是学生端产物。
    for (const hostAsset of ['/lib/tailwindcss.js', '/render-engine.js', '/socket.io/socket.io.js']) {
        assert.notEqual(html.indexOf(hostAsset), -1, `构建后的 HTML 必须保留宿主资源 ${hostAsset}`);
    }
});

test('重复构建得到相同版本与相同产物（确定性）', () => {
    const first = buildClassroomUi();
    const firstHtml = readFileSync(join(first.versionDir, 'index.html'));
    const second = buildClassroomUi();

    assert.equal(second.version, first.version);
    assert.deepEqual(second.manifest, first.manifest);
    assert.deepEqual(readFileSync(join(second.versionDir, 'index.html')), firstHtml);
});

test('版本号是构建输入的内容哈希，而不是时间戳', () => {
    const base = [{ name: 'classroom-app.js', bytes: Buffer.from('a') }];
    const same = [{ name: 'classroom-app.js', bytes: Buffer.from('a') }];
    const changed = [{ name: 'classroom-app.js', bytes: Buffer.from('b') }];

    assert.equal(computeVersion('1.0.0', base), computeVersion('1.0.0', same));
    assert.notEqual(computeVersion('1.0.0', base), computeVersion('1.0.0', changed));
    assert.notEqual(computeVersion('1.0.0', base), computeVersion('1.0.1', base));
    assert.match(computeVersion('1.0.0', base), /^1\.0\.0-[0-9a-f]{12}$/);
});

test('HTML 缺少可重写的脚本引用时构建显式失败', () => {
    assert.throws(() => rewriteIndexHtml('<html></html>', '1.0.0-000000000000'), /classroom-app\.js/);
    assert.throws(
        () => rewriteIndexHtml('<script src="classroom-app.js"></script>', '1.0.0-000000000000'),
        /protocol-client\.js/
    );
});

test('exports 暴露 ./dist 与 ./manifest，消费方可直接 require.resolve', () => {
    assert.equal(pkg.exports['./dist'], './lib/paths.cjs');
    assert.equal(pkg.exports['./manifest'], './dist/manifest.json');

    const pathsEntry = require.resolve('@lumesync/student-ui/dist');
    assert.equal(pathsEntry, join(packageRoot, 'lib', 'paths.cjs'));

    const paths = require(pathsEntry);
    assert.equal(paths.distDir, distDir);
    assert.equal(paths.manifestPath, join(distDir, 'manifest.json'));
    assert.equal(paths.currentPath, join(distDir, 'current.json'));
    assert.ok(existsSync(paths.buildScriptPath), 'paths.cjs 必须指向真实存在的构建脚本');

    const current = paths.readCurrent();
    const manifest = paths.readManifest();
    assert.equal(current.version, manifest.version);
    assert.ok(existsSync(paths.entryPath(manifest.version, manifest.entry)), '入口文件必须存在');
    assert.throws(() => paths.versionDir('../escape'), /Invalid student UI version/);
});
