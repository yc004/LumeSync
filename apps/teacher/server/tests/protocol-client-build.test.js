// /protocol-client.js 生成测试。
//
// 页面不能直接 import 契约包，只能读服务端生成的全局对象，
// 因此必须保证生成内容与契约包一致，且不会写入过期的版本号。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const protocol = require('@lumesync/classroom-protocol');
const { buildProtocolClient } = require('../src/teacher-shell-build');

test('生成的 protocol-client.js 与契约包版本一致', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lume-protocol-client-'));
    try {
        const { outputPath, skipped } = buildProtocolClient({ publicRoot: dir, skipIfFresh: false });
        assert.equal(skipped, false);
        assert.equal(fs.existsSync(outputPath), true);

        const source = fs.readFileSync(outputPath, 'utf8');
        const context = { window: {} };
        vm.createContext(context);
        vm.runInContext(source, context, { filename: outputPath });

        const injected = context.window.LumeSyncProtocol;
        assert.equal(injected.protocolVersion, protocol.PROTOCOL_VERSION);
        // 生成内容在 vm 的另一 realm 里，数组比较走 JSON 而不是 deepStrictEqual。
        assert.equal(
            JSON.stringify(injected.supportedVersions),
            JSON.stringify(protocol.SUPPORTED_PROTOCOL_VERSIONS)
        );
        assert.equal(injected.handshake.client, 'session:hello');
        assert.equal(injected.handshake.accepted, 'session:accepted');
        assert.equal(injected.handshake.rejected, 'protocol-rejected');
        assert.equal(injected.roles.includes('host'), true);
        assert.equal(injected.roleAliases.teacher, 'host');

        const names = injected.inboundEvents.map((entry) => entry.name);
        assert.ok(names.includes('sync-slide'));
        assert.ok(names.includes('student:submit'));
        assert.equal(injected.plannedRenames['select-course'], 'course:select');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('内容新鲜时跳过重新生成', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lume-protocol-fresh-'));
    try {
        const first = buildProtocolClient({ publicRoot: dir, skipIfFresh: false });
        const second = buildProtocolClient({ publicRoot: dir });
        assert.equal(first.outputPath, second.outputPath);
        assert.equal(second.skipped, true);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('页面 HTML 引入 protocol-client.js', () => {
    const publicDir = path.join(__dirname, '../../shared/public');
    // 学生课堂页已归位到学生端仓库，由 @lumesync/student-ui 构建成版本化产物。
    const studentIndexPath = path.join(__dirname, '../../../student/ui/classroom/src/index.html');
    for (const page of [path.join(publicDir, 'index.html'), studentIndexPath]) {
        const html = fs.readFileSync(page, 'utf8');
        assert.match(html, /<script src="\/protocol-client\.js"><\/script>/, `${page} 必须引入协议全局`);
    }
});
