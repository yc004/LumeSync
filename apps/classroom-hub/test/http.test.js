// HTTP 面：健康检查、协议描述、会话引导、公开状态、固定机屏幕与授权边界。
//
// 关键断言：
//   - 验证码只出现在 GET /api/hub/screen（本机 + 管理凭证），其余任何响应都不含；
//   - 非回环请求即使带管理凭证也被拒绝（屏幕内容与 host 引导都如此）；
//   - 未知路由不回显内部信息；
//   - 没有可用屏幕时明确返回 relay_no_screen，而不是降级成无验证码连接。

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    ADMIN_HEADERS,
    PROTOCOL_VERSION,
    fetchJson,
    postJson,
    readScreen,
    startTestHub,
    pairTeacher
} = require('./helpers');
const { describeProtocol, DNS_SD_SERVICE_TYPE } = require('..');
const { INBOUND_EVENTS, OUTBOUND_EVENTS, RELAY_STATES, ERROR_CODES } = require('@lumesync/classroom-protocol');

test('GET /api/health 返回模式、协议版本与教室标识', async (t) => {
    const hub = await startTestHub({ mode: 'direct' });
    t.after(() => hub.stop());

    const { status, body } = await fetchJson(hub, '/api/health');
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.app, 'LumeSync Hub');
    assert.equal(body.mode, 'direct');
    assert.equal(body.protocolVersion, PROTOCOL_VERSION);
    assert.equal(body.classroomId, hub.config.classroomId);
    assert.equal(body.pid, process.pid);
});

test('GET /api/protocol 的描述来自契约表（含 relay 事件与 scope）', async (t) => {
    const hub = await startTestHub({ mode: 'direct' });
    t.after(() => hub.stop());

    const { status, body } = await fetchJson(hub, '/api/protocol');
    assert.equal(status, 200);
    assert.equal(body.protocolVersion, PROTOCOL_VERSION);
    assert.deepEqual(body.scopes, ['classroom', 'relay']);

    const described = describeProtocol();
    assert.deepEqual(body.inboundEvents.map((entry) => entry.name).sort(), Object.keys(INBOUND_EVENTS).sort());
    assert.deepEqual(body.outboundEvents.map((entry) => entry.name).sort(), Object.keys(OUTBOUND_EVENTS).sort());

    const pairRequest = body.inboundEvents.find((entry) => entry.name === 'teacher:pair.request');
    assert.deepEqual(pairRequest.roles, ['host']);
    assert.equal(pairRequest.scope, 'relay');
    assert.equal(pairRequest.status, 'planned');
});

test('未知路由返回 404 且不回显内部信息', async (t) => {
    const hub = await startTestHub({ mode: 'direct' });
    t.after(() => hub.stop());

    const missing = await fetchJson(hub, '/api/definitely-not-a-route');
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, ERROR_CODES.RESOURCE_NOT_FOUND);
    const serialized = JSON.stringify(missing.body);
    assert.ok(!serialized.includes('at '), '不应包含堆栈');
    assert.ok(!serialized.includes(hub.config.hostToken), '不应包含凭证');
    assert.ok(!serialized.includes('apps/classroom-hub'), '不应包含源码路径');
});

test('viewer 引导签发短期凭证，host 引导在直接模式下要求本机管理凭证', async (t) => {
    const hub = await startTestHub({ mode: 'direct' });
    t.after(() => hub.stop());

    const viewer = await postJson(hub, '/api/session/bootstrap', { role: 'viewer', clientId: 'student-1' });
    assert.equal(viewer.status, 200);
    assert.equal(viewer.body.role, 'viewer');
    assert.equal(viewer.body.classroomId, hub.config.classroomId);
    assert.match(viewer.body.token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.ok(new Date(viewer.body.expiresAt).getTime() > Date.now());

    const hostNoCredential = await postJson(hub, '/api/session/bootstrap', { role: 'host' });
    assert.equal(hostNoCredential.status, 403);
    assert.equal(hostNoCredential.body.code, ERROR_CODES.HOST_AUTHORIZATION_REQUIRED);

    const host = await postJson(hub, '/api/session/bootstrap', { role: 'host' }, ADMIN_HEADERS);
    assert.equal(host.status, 200);
    assert.equal(host.body.role, 'host');
    assert.equal(host.body.token, hub.config.hostToken);

    const unsupported = await postJson(hub, '/api/session/bootstrap', { role: 'principal' });
    assert.equal(unsupported.status, 400);
    assert.equal(unsupported.body.code, ERROR_CODES.ROLE_UNKNOWN);
});

test('中继模式不通过公开接口发放 host 凭证', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    const host = await postJson(hub, '/api/session/bootstrap', { role: 'host' }, ADMIN_HEADERS);
    assert.equal(host.status, 403);
    assert.equal(host.body.code, ERROR_CODES.HOST_AUTHORIZATION_REQUIRED);

    // 学生引导与模式无关：学生始终连固定地址。
    const viewer = await postJson(hub, '/api/session/bootstrap', { role: 'viewer', clientId: 'student-2' });
    assert.equal(viewer.status, 200);
    assert.equal(viewer.body.role, 'viewer');
});

test('GET /api/hub/status 暴露状态但不含验证码/凭证', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    const before = await fetchJson(hub, '/api/hub/status');
    assert.equal(before.status, 200);
    assert.equal(before.body.mode, 'relay');
    assert.equal(before.body.relay.state, RELAY_STATES.IDLE);
    assert.equal(before.body.relay.discoveryLabel, '空闲');
    assert.equal(before.body.relay.pairing, null);
    assert.equal(before.body.lease.state, 'idle');
    assert.equal(before.body.queue.capacity > 0, true);
    assert.equal(before.body.stage.versions, 0);
    assert.equal(before.body.discovery.serviceType, DNS_SD_SERVICE_TYPE);
    assert.equal(before.body.discovery.published, true);

    const paired = await pairTeacher(hub, { deviceKey: 'device-status-check' });
    const code = paired.code;

    const after = await fetchJson(hub, '/api/hub/status');
    assert.equal(after.body.relay.state, RELAY_STATES.PAIRING);
    assert.equal(after.body.relay.discoveryLabel, '正在连接');
    // 公开配对信息有请求编号与剩余次数，但没有验证码
    assert.equal(after.body.relay.pairing.requestId, paired.requestId);
    assert.equal(typeof after.body.relay.pairing.attemptsLeft, 'number');
    const serialized = JSON.stringify(after.body);
    assert.ok(!serialized.includes(code), '状态接口不能包含验证码');
    assert.ok(!serialized.includes('"code"'), '状态接口不能出现验证码字段');
    assert.ok(!serialized.includes(paired.verified.deviceToken), '状态接口不能包含设备凭证');
});

test('GET /api/hub/screen 只有本机 + 管理凭证能读到验证码', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    const withoutCredential = await fetchJson(hub, '/api/hub/screen');
    assert.equal(withoutCredential.status, 403);
    assert.equal(withoutCredential.body.code, ERROR_CODES.HOST_AUTHORIZATION_REQUIRED);

    const wrongCredential = await fetchJson(hub, '/api/hub/screen', { headers: { 'X-LumeSync-Host-Token': 'nope' } });
    assert.equal(wrongCredential.status, 403);

    const unauthorizedPairing = await fetchJson(hub, '/api/hub/screen', { headers: ADMIN_HEADERS });
    assert.equal(unauthorizedPairing.status, 200);
    assert.equal(unauthorizedPairing.body.pairing, null);

    const paired = await pairTeacher(hub, { deviceKey: 'device-screen-check' });
    const screen = await readScreen(hub);
    assert.equal(screen.status, 200);
    assert.equal(screen.body.state, RELAY_STATES.PAIRING);
    assert.equal(screen.body.pairing.requestId, paired.requestId);
    assert.match(screen.body.pairing.code, /^\d{8}$/);
    assert.equal(screen.body.pairing.deviceName, '教师笔记本');
});

test('非回环请求即使带管理凭证也被拒绝（屏幕与 host 引导）', async (t) => {
    // 注入 isLoopback=false 模拟局域网来源：真实实现拒绝非本机地址，这里验证规则本身。
    const hub = await startTestHub({ mode: 'relay', isLoopback: () => false });
    t.after(() => hub.stop());

    const screen = await fetchJson(hub, '/api/hub/screen', { headers: ADMIN_HEADERS });
    assert.equal(screen.status, 403);

    const bootstrap = await postJson(hub, '/api/session/bootstrap', { role: 'host' }, ADMIN_HEADERS);
    assert.equal(bootstrap.status, 403);
});

test('没有可用屏幕时明确返回 relay_no_screen，而不是降级', async (t) => {
    const hub = await startTestHub({ mode: 'relay', canDisplayCode: false });
    t.after(() => hub.stop());

    const screen = await readScreen(hub);
    assert.equal(screen.status, 409);
    assert.equal(screen.body.code, ERROR_CODES.RELAY_NO_SCREEN);

    const status = await fetchJson(hub, '/api/hub/status');
    assert.equal(status.body.relay.state, RELAY_STATES.ERROR);
    assert.equal(status.body.relay.errorReason, ERROR_CODES.RELAY_NO_SCREEN);
    assert.equal(status.body.relay.discoveryLabel, null);
    assert.equal(status.body.discovery.published, false);

    // 服务本身继续提供：屏幕不可用不是进程级故障。
    const health = await fetchJson(hub, '/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.ok, true);
});

test('直接模式没有中继屏幕', async (t) => {
    const hub = await startTestHub({ mode: 'direct' });
    t.after(() => hub.stop());

    const screen = await readScreen(hub);
    assert.equal(screen.status, 409);
    assert.equal(screen.body.code, ERROR_CODES.RELAY_DISABLED);
});

test('请求体过大与非法 JSON 给出契约错误码', async (t) => {
    const hub = await startTestHub({ mode: 'relay', stageMaxBytes: 2048 });
    t.after(() => hub.stop());

    const tooLarge = await fetchJson(hub, '/api/courses/stage/lesson-1?courseHash=sha256:' + '0'.repeat(64), {
        method: 'PUT',
        headers: { 'content-type': 'application/zip', ...ADMIN_HEADERS },
        body: Buffer.alloc(4096, 1)
    });
    assert.equal(tooLarge.status, 413);
    assert.equal(tooLarge.body.code, ERROR_CODES.STAGE_CAPACITY_EXCEEDED);

    const badJson = await fetchJson(hub, '/api/session/bootstrap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json'
    });
    assert.equal(badJson.status, 400);
    assert.equal(badJson.body.code, ERROR_CODES.REQUEST_INVALID);
});
