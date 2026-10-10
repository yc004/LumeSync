// 学生课堂页源码契约测试。
//
// 页面仍在浏览器里由 Babel Standalone 编译（教师测试保留同样的编译检查），
// 这里只断言"归位过程中不能丢"的行为：协议版本来源、viewer 身份、
// 权威快照的 revision 守卫、syncFollow 语义和原生桥调用。

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = join(packageRoot, 'src/classroom-app.js');
const htmlPath = join(packageRoot, 'src/index.html');

const source = readFileSync(sourcePath, 'utf8');
const html = readFileSync(htmlPath, 'utf8');

test('课堂页保留 BOM，并从 /protocol-client.js 读取协议版本', () => {
    const bytes = readFileSync(sourcePath);
    assert.deepEqual(
        [...bytes.subarray(0, 3)],
        [0xef, 0xbb, 0xbf],
        'src/classroom-app.js 必须保留原有 UTF-8 BOM'
    );
    assert.match(source, /protocolVersion: window\.LumeSyncProtocol\?\.protocolVersion/);
    // 协议版本由服务端生成的 /protocol-client.js 提供，页面不得写死版本字面量。
    assert.doesNotMatch(source, /protocolVersion:\s*['"]\d+\.\d+/);
});

test('课堂页以 viewer 身份连接 Socket.IO 并声明协议版本', () => {
    assert.match(source, /role: 'viewer'/);
    assert.match(source, /token: String\(session\.token\)/);
    assert.match(source, /clientId: String\(session\.clientId\)/);
    assert.match(source, /window\.io\(\{ auth \}\)/);
});

test('课堂页消费权威快照，保留 revision 守卫与 syncFollow 语义', () => {
    assert.match(source, /socket\.on\('classroom:snapshot'/);
    assert.match(source, /socket\.on\('session:accepted'/);
    assert.match(source, /socket\.on\('protocol-rejected'/);
    assert.match(source, /socket\.on\('identity-rejected'/);
    assert.match(source, /snapshotRevisionRef/);
    assert.match(source, /revision < snapshotRevisionRef\.current/);
    // 关闭跟随后，快照不得把学生拉到教师页码。
    assert.match(source, /settingsRef\.current\?\.syncFollow && nextSlide !== currentSlideRef\.current/);
});

test('课堂页仍通过 studentHost 桥接截图、设备信息、电源与密码', () => {
    assert.match(source, /bridge\.takeScreenshot/);
    assert.match(source, /socket\.emit\('student:device-info'/);
    assert.match(source, /socket\.emit\('student:power-control:client-ack'/);
    assert.match(source, /socket\.on\('student:power-control'/);
    assert.match(source, /socket\.on\('set-admin-password'/);
    assert.match(source, /electronAPI\?\.setAdminPassword/);
});

test('页面 HTML 依赖宿主提供的资源，并先加载协议全局再加载课堂页脚本', () => {
    for (const hostAsset of ['/lib/tailwindcss.js', '/lib/babel.min.js', '/socket.io/socket.io.js', '/protocol-client.js', '/render-engine.js']) {
        assert.notEqual(html.indexOf(hostAsset), -1, `index.html 必须引用宿主资源 ${hostAsset}`);
    }

    const protocolIndex = html.indexOf('/protocol-client.js');
    const renderEngineIndex = html.indexOf('/render-engine.js');
    const appIndex = html.indexOf('src="classroom-app.js"');
    assert.notEqual(appIndex, -1, 'index.html 必须引用构建脚本会重写为版本化 URL 的 classroom-app.js');
    assert.ok(protocolIndex < renderEngineIndex, '/protocol-client.js 必须在 /render-engine.js 之前');
    assert.ok(protocolIndex < appIndex, '/protocol-client.js 必须在课堂页脚本之前');

    // 教师仓库不再托管学生页面，源码不得再引用旧路径。
    assert.equal(html.includes('/student-app.js'), false);
});
