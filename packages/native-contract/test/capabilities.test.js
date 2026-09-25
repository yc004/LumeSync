const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
    HOST_ACTIONS,
    VIEWER_ACTIONS,
    authorizeAction,
    getActionSpec,
    listActions,
    NATIVE_TO_PAGE_KINDS
} = require('../index.js');

const REPO_ROOT = path.resolve(__dirname, '../../..');

function shellPath(repo) {
    return path.join(REPO_ROOT, 'repos', repo, 'native', 'shell', 'src', 'main.cpp');
}

// 从 C++ 壳里读出 HandleRpc / HandleEvent 实际分派的动作名，
// 让"契约里写了"与"壳里真的处理了"不能各自漂移。
function extractNativeActions(source, functionName) {
    const start = source.indexOf(`void ${functionName}(`);
    assert.notEqual(start, -1, `未找到 ${functionName}`);
    const rest = source.slice(start);
    const end = rest.indexOf('\n  }');
    const body = end === -1 ? rest : rest.slice(0, end);
    return Array.from(body.matchAll(/action == L"([A-Za-z:]+)"/g)).map((match) => match[1]).sort();
}

function expected(role, kind) {
    return Object.entries(role === 'host' ? HOST_ACTIONS : VIEWER_ACTIONS)
        .filter(([, spec]) => spec.kind === kind && spec.nativeDispatch)
        .map(([action]) => action)
        .sort();
}

function assertParity(repo, role) {
    const file = shellPath(repo);
    if (!fs.existsSync(file)) {
        test.skip?.(`${repo} 子模块未检出，跳过原生分派对照`);
        return;
    }
    const source = fs.readFileSync(file, 'utf8');
    assert.deepEqual(extractNativeActions(source, 'HandleRpc'), expected(role, 'rpc'), `${repo} 的 RPC 动作与契约不一致`);
    assert.deepEqual(extractNativeActions(source, 'HandleEvent'), expected(role, 'event'), `${repo} 的事件动作与契约不一致`);
}

test('教师壳的实际分派动作与契约一致', () => assertParity('teacher', 'host'));
test('学生壳的实际分派动作与契约一致', () => assertParity('student', 'viewer'));

test('未声明的动作被拒绝', () => {
    const result = authorizeAction('host', 'formatDisk');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'native_action_unknown');
    assert.equal(authorizeAction('viewer', 'importCourse').code, 'native_action_not_implemented');
});

test('kind 不匹配的动作被拒绝', () => {
    const result = authorizeAction('host', 'classStarted', 'rpc');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'native_action_kind_mismatch');
    assert.equal(authorizeAction('viewer', 'powerControl', 'event').code, 'native_action_kind_mismatch');
});

test('未实现的占位动作被拒绝，不能当作学生端能力', () => {
    for (const action of ['getSettings', 'saveSettings', 'importCourse', 'exportCourse', 'openLogDir', 'getLogDir', 'selectSubmissionDir']) {
        const spec = getActionSpec('viewer', action);
        assert.equal(spec.transport, 'local-stub', `${action} 应标记为 local-stub`);
        assert.equal(spec.implemented, false, `${action} 不应标记为已实现`);
        assert.equal(authorizeAction('viewer', action).code, 'native_action_not_implemented');
    }
    assert.equal(getActionSpec('host', 'selectSubmissionDir').implemented, false);
});

test('危险动作被标注风险等级', () => {
    assert.equal(getActionSpec('viewer', 'powerControl').risk, 'system');
    assert.equal(getActionSpec('viewer', 'setAutostart').risk, 'system');
    assert.equal(getActionSpec('host', 'exportCourse').risk, 'write');
    assert.equal(getActionSpec('host', 'getConfig').risk, 'read');
});

test('能力清单可按角色与 kind 过滤', () => {
    const hostRpc = listActions('host', { kind: 'rpc' });
    assert.ok(hostRpc.includes('getConfig'));
    assert.ok(!hostRpc.includes('classStarted'));
    assert.ok(!hostRpc.includes('selectSubmissionDir'), '未实现的动作默认不出现在可用清单里');
    assert.ok(listActions('host', { kind: 'rpc', includeUnimplemented: true }).includes('selectSubmissionDir'));
    assert.equal(listActions('nobody').length, 0);
});

test('原生到页面的消息类型清单固定', () => {
    assert.deepEqual(NATIVE_TO_PAGE_KINDS.slice().sort(), ['rpc-result', 'window-maximized', 'window-unmaximized']);
});

test('每个动作都带中文说明与合法 transport', () => {
    for (const table of [HOST_ACTIONS, VIEWER_ACTIONS]) {
        for (const [action, spec] of Object.entries(table)) {
            assert.ok(spec.summary && spec.summary.length > 0, `${action} 缺少说明`);
            assert.ok(['native', 'local', 'local-stub'].includes(spec.transport), `${action} 的 transport 非法`);
            assert.ok(['rpc', 'event'].includes(spec.kind), `${action} 的 kind 非法`);
            assert.equal(typeof spec.nativeDispatch, 'boolean', `${action} 缺少 nativeDispatch`);
        }
    }
});
