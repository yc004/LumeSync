const test = require('node:test');
const assert = require('node:assert/strict');

const {
    PAIRING_CODE_DIGITS,
    PAIRING_MAX_ATTEMPTS,
    generatePairingCode,
    isWellFormedCode,
    createPairingRequest,
    verifyPairingCode,
    createPairingProof,
    verifyPairingProof,
    describePairingRequestForScreen,
    describePairingRequestPublic,
    createLeaseRegistry,
    createRelayState,
    RELAY_STATES,
    DNS_SD_SERVICE_TYPE,
    ERROR_CODES,
    authorizeEvent,
    createInboundGuard
} = require('../index.js');

const T0 = 1_800_000_000_000;

test('验证码是 8 位数字且由随机数生成', () => {
    const codes = new Set();
    for (let index = 0; index < 200; index += 1) {
        const code = generatePairingCode();
        assert.match(code, /^\d{8}$/);
        assert.equal(isWellFormedCode(code), true);
        codes.add(code);
    }
    assert.ok(codes.size > 150, '验证码不应大量重复');
    assert.equal(PAIRING_CODE_DIGITS, 8);
});

test('验证码绑定教室、请求与设备，且不会出现在对外描述里', () => {
    const request = createPairingRequest({
        classroomId: 'room-1',
        requestId: 'req-1',
        deviceKey: 'device-key-abcdef',
        deviceName: '教师笔记本',
        now: T0
    });
    assert.equal(request.classroomId, 'room-1');
    assert.equal(request.attemptsLeft, PAIRING_MAX_ATTEMPTS);
    assert.equal(request.verified, false);

    const screen = describePairingRequestForScreen(request);
    assert.equal(screen.code, request.code, '固定机屏幕需要显示验证码');

    const publicView = describePairingRequestPublic(request);
    assert.equal(publicView.code, undefined, '对外描述绝不能包含验证码');
    assert.equal(JSON.stringify(publicView).includes(request.code), false);
});

test('输入错误递减次数，用尽后锁定且不能靠重连重置', () => {
    let request = createPairingRequest({ classroomId: 'room-1', requestId: 'req-1', deviceKey: 'k'.repeat(12), now: T0 });
    for (let attempt = 1; attempt <= PAIRING_MAX_ATTEMPTS; attempt += 1) {
        const wrong = String(Number(request.code) + 1).padStart(8, '0');
        const result = verifyPairingCode(request, wrong, T0);
        assert.equal(result.ok, false);
        request = result.request;
        assert.equal(request.attemptsLeft, PAIRING_MAX_ATTEMPTS - attempt);
    }
    assert.equal(request.status, 'locked');

    // 已经锁定的请求，即使输入正确也不放行
    const afterLock = verifyPairingCode(request, request.code, T0);
    assert.equal(afterLock.ok, false);
    assert.equal(afterLock.code, ERROR_CODES.PAIRING_ATTEMPTS_EXCEEDED);
});

test('验证码过期后立即失效', () => {
    const request = createPairingRequest({ classroomId: 'room-1', requestId: 'req-1', deviceKey: 'k'.repeat(12), now: T0 });
    const result = verifyPairingCode(request, request.code, T0 + 3 * 60 * 1000 + 1);
    assert.equal(result.ok, false);
    assert.equal(result.code, ERROR_CODES.PAIRING_CODE_EXPIRED);
    assert.equal(result.request.status, 'expired');
});

test('正确验证码通过后不可重复使用', () => {
    const request = createPairingRequest({ classroomId: 'room-1', requestId: 'req-1', deviceKey: 'k'.repeat(12), now: T0 });
    const ok = verifyPairingCode(request, request.code, T0);
    assert.equal(ok.ok, true);
    assert.equal(ok.request.verified, true);
    assert.equal(ok.request.attemptsLeft, 0);

    const replay = verifyPairingCode(ok.request, request.code, T0);
    assert.equal(replay.ok, false);
    assert.equal(replay.code, ERROR_CODES.PAIRING_REQUEST_UNKNOWN);
});

test('格式不合法的验证码也被记为一次失败', () => {
    const request = createPairingRequest({ classroomId: 'room-1', requestId: 'req-1', deviceKey: 'k'.repeat(12), now: T0 });
    const result = verifyPairingCode(request, 'abc', T0);
    assert.equal(result.code, ERROR_CODES.PAIRING_CODE_INVALID);
    assert.equal(result.request.attemptsLeft, PAIRING_MAX_ATTEMPTS - 1);
});

test('握手证明只有用同一验证码与 nonce 才能通过', async () => {
    const request = createPairingRequest({ classroomId: 'room-1', requestId: 'req-1', deviceKey: 'device-key-abcdef', now: T0 });
    const nonce = 'nonce-1234567890';

    const proof = await createPairingProof({
        code: request.code,
        classroomId: request.classroomId,
        requestId: request.requestId,
        deviceKey: request.deviceKey,
        nonce
    });
    assert.match(proof, /^[0-9a-f]{64}$/);

    assert.equal((await verifyPairingProof({ request, proof, nonce })).ok, true);
    assert.equal((await verifyPairingProof({ request, proof, nonce: 'other-nonce' })).code, ERROR_CODES.PAIRING_PROOF_INVALID);

    const wrongCodeRequest = { ...request, code: String(Number(request.code) + 1).padStart(8, '0') };
    assert.equal((await verifyPairingProof({ request: wrongCodeRequest, proof, nonce })).ok, false);
});

test('固定机状态机：关闭、无屏幕、空闲、验证中、授课中与错误', () => {
    const relay = createRelayState({ classroomId: 'room-1', name: '三年级一班', port: 3000, now: () => T0 });

    // 关闭：不发布服务、不接收配对
    assert.equal(relay.getState(), RELAY_STATES.DISABLED);
    assert.equal(relay.discoveryTxt({ protocolVersion: 1 }), null);
    assert.equal(relay.requestPairing({ requestId: 'r1', deviceKey: 'k'.repeat(12) }).code, ERROR_CODES.RELAY_DISABLED);

    // 打开：等待连接
    assert.equal(relay.enable().ok, true);
    assert.equal(relay.getState(), RELAY_STATES.IDLE);
    const txt = relay.discoveryTxt({ protocolVersion: 1 });
    assert.equal(txt.label, '空闲');
    assert.equal(txt.state, 'free');
    assert.equal(txt.id, 'room-1');
    // 发现报文绝不包含验证码等敏感字段
    assert.equal(JSON.stringify(txt).includes('code'), false);

    // 请求连接 → 验证中，同一时刻只保留一个活动验证码
    const first = relay.requestPairing({ requestId: 'r1', deviceKey: 'k'.repeat(12), deviceName: '教师笔记本' });
    assert.equal(first.ok, true);
    assert.match(first.screen.code, /^\d{8}$/);
    assert.equal(first.request.code, undefined);
    assert.equal(relay.getState(), RELAY_STATES.PAIRING);
    assert.equal(relay.discoveryTxt({ protocolVersion: 1 }).label, '正在连接');
    const second = relay.requestPairing({ requestId: 'r2', deviceKey: 'other-key-1234' });
    assert.equal(second.code, ERROR_CODES.RELAY_BUSY);

    // 验证成功 → 授予租约 → 授课中
    const wrongCode = String(Number(first.screen.code) + 1).padStart(8, '0');
    assert.equal(relay.submitCode({ requestId: 'r1', code: wrongCode }).ok, false);
    assert.equal(relay.submitCode({ requestId: 'r1', code: first.screen.code }).ok, true);
    assert.equal(relay.completePairing({ leaseGranted: true }).state, RELAY_STATES.TEACHING);
    assert.equal(relay.discoveryTxt({ protocolVersion: 1 }).label, '授课中');
    assert.equal(relay.requestPairing({ requestId: 'r3', deviceKey: 'k3'.repeat(6) }).code, ERROR_CODES.RELAY_BUSY);

    // 结束授课 → 回到等待连接
    relay.releaseTeaching();
    assert.equal(relay.getState(), RELAY_STATES.IDLE);
    assert.equal(relay.discoveryTxt({ protocolVersion: 1 }).label, '空闲');

    // 故障：从发现列表消失并保留原因，不静默降级
    relay.fail('screen-offline');
    assert.equal(relay.discoveryTxt({ protocolVersion: 1 }), null);
    assert.equal(relay.requestPairing({ requestId: 'r4', deviceKey: 'k4'.repeat(6) }).code, 'screen-offline');
    assert.equal(relay.screenPayload().errorReason, 'screen-offline');
});

test('固定机没有可用屏幕时拒绝开启中继', () => {
    const relay = createRelayState({ classroomId: 'room-2', name: '无屏教室', port: 3000, canDisplayCode: false });
    const result = relay.enable();
    assert.equal(result.ok, false);
    assert.equal(result.code, ERROR_CODES.RELAY_NO_SCREEN);
    assert.equal(relay.getState(), RELAY_STATES.ERROR);
    assert.equal(relay.discoveryTxt({ protocolVersion: 1 }), null);
});

test('授课租约：单租约、续租校验、epoch 递增与超时', () => {
    let clock = T0;
    const leases = createLeaseRegistry({ leaseTtlMs: 60_000, now: () => clock });

    const first = leases.acquire({ classroomId: 'room-1', sessionId: 's1', deviceKey: 'device-A', deviceName: 'A' });
    assert.equal(first.ok, true);
    assert.equal(first.lease.epoch, 1);

    // 另一位教师不能抢占
    const steal = leases.acquire({ classroomId: 'room-1', sessionId: 's2', deviceKey: 'device-B' });
    assert.equal(steal.code, ERROR_CODES.LEASE_ALREADY_HELD);

    // 续租必须带对 leaseId 与 epoch
    assert.equal(leases.renew({ classroomId: 'room-1', leaseId: 'other', epoch: 1 }).code, ERROR_CODES.LEASE_NOT_HELD);
    assert.equal(leases.renew({ classroomId: 'room-1', leaseId: first.lease.leaseId, epoch: 2 }).code, ERROR_CODES.LEASE_EPOCH_STALE);
    assert.equal(leases.renew({ classroomId: 'room-1', leaseId: first.lease.leaseId, epoch: 1 }).ok, true);

    // 命令必须来自当前租约持有者
    assert.equal(leases.authorizeCommand({ classroomId: 'room-1', leaseId: first.lease.leaseId, epoch: 1 }).ok, true);
    assert.equal(leases.authorizeCommand({ classroomId: 'room-1', leaseId: first.lease.leaseId, epoch: 0 }).code, ERROR_CODES.LEASE_EPOCH_STALE);

    // 释放后交接：epoch 递增，旧租约的命令失效
    assert.equal(leases.release({ classroomId: 'room-1', leaseId: first.lease.leaseId, epoch: 1 }).ok, true);
    const second = leases.acquire({ classroomId: 'room-1', sessionId: 's2', deviceKey: 'device-B' });
    assert.equal(second.lease.epoch, 2);
    assert.equal(leases.authorizeCommand({ classroomId: 'room-1', leaseId: first.lease.leaseId, epoch: 1 }).code, ERROR_CODES.LEASE_NOT_HELD);

    // 教师长时间离线：租约过期 → 等待教师
    clock += 61_000;
    const described = leases.describe('room-1');
    assert.equal(described.state, 'awaiting-teacher');
    assert.equal(leases.authorizeCommand({ classroomId: 'room-1', leaseId: second.lease.leaseId, epoch: 2 }).code, ERROR_CODES.LEASE_EXPIRED);
    assert.equal(leases.snapshot('room-1'), null, '过期租约应被清理');
});

test('管理员撤销租约后 epoch 继续递增', () => {
    const leases = createLeaseRegistry({ now: () => T0 });
    const first = leases.acquire({ classroomId: 'room-1', sessionId: 's1', deviceKey: 'device-A' });
    assert.equal(leases.revoke({ classroomId: 'room-1', reason: 'admin-revoked' }).revoked, true);
    const second = leases.acquire({ classroomId: 'room-1', sessionId: 's2', deviceKey: 'device-B' });
    assert.equal(second.lease.epoch, first.lease.epoch + 1);
});

test('中继事件只对允许 scope 的连接开放', () => {
    const payload = { requestId: 'req-1', deviceKey: 'device-key-abcdef' };

    // 直接模式的教师服务：中继事件按未声明处理
    assert.equal(authorizeEvent('host', 'teacher:pair.request', payload).code, ERROR_CODES.EVENT_UNKNOWN);

    // 教室 Hub：允许 classroom + relay
    const allowed = authorizeEvent('host', 'teacher:pair.request', payload, { scopes: ['classroom', 'relay'] });
    assert.equal(allowed.ok, true);
    assert.equal(allowed.entry.scope, 'relay');

    // 学生（viewer）不能发起配对或发布课件
    assert.equal(authorizeEvent('viewer', 'course:publish', {}, { scopes: ['relay'] }).code, ERROR_CODES.EVENT_FORBIDDEN);

    // 守卫中间件同样按 scope 拒绝
    const guard = createInboundGuard({ role: 'host', scopes: ['classroom'] });
    let error = null;
    guard(['teacher:lease.acquire', {}], (err) => { error = err; });
    assert.ok(error instanceof Error);
    assert.equal(error.data.code, ERROR_CODES.EVENT_UNKNOWN);
});

test('中继路径的 markVerified / recordFailure 与验证码路径共用同一套失效规则', () => {
    const relay = createRelayState({ classroomId: 'room-1', name: '三年级一班', port: 3000, now: () => T0 });
    relay.enable();

    const first = relay.requestPairing({ requestId: 'r1', deviceKey: 'k'.repeat(12) });
    assert.equal(first.ok, true);

    // 证明校验失败：算一次失败
    const failed = relay.recordFailure({ requestId: 'r1' });
    assert.equal(failed.code, ERROR_CODES.PAIRING_PROOF_INVALID);
    assert.equal(failed.attemptsLeft, PAIRING_MAX_ATTEMPTS - 1);
    assert.equal(relay.getState(), RELAY_STATES.PAIRING, '还有剩余次数时保持验证中');

    // 证明校验成功：标记已验证，不再需要把验证码再提交一次
    assert.equal(relay.markVerified({ requestId: 'r1' }).ok, true);
    assert.equal(relay.completePairing({ leaseGranted: true }).state, RELAY_STATES.TEACHING);

    // 次数用尽：请求作废并回到空闲
    relay.releaseTeaching();
    relay.requestPairing({ requestId: 'r2', deviceKey: 'k2'.repeat(6) });
    let last = null;
    for (let attempt = 1; attempt <= PAIRING_MAX_ATTEMPTS; attempt += 1) {
        last = relay.recordFailure({ requestId: 'r2' });
    }
    assert.equal(last.code, ERROR_CODES.PAIRING_ATTEMPTS_EXCEEDED);
    assert.equal(relay.getState(), RELAY_STATES.IDLE);
    assert.equal(relay.submitCode({ requestId: 'r2', code: '00000000' }).code, ERROR_CODES.PAIRING_REQUEST_UNKNOWN);
});

test('对未知请求调用 markVerified / recordFailure 会被拒绝', () => {
    const relay = createRelayState({ classroomId: 'room-1', name: '教室', port: 3000, now: () => T0 });
    relay.enable();
    assert.equal(relay.markVerified({ requestId: 'nope' }).code, ERROR_CODES.PAIRING_REQUEST_UNKNOWN);
    assert.equal(relay.recordFailure({ requestId: 'nope' }).code, ERROR_CODES.PAIRING_REQUEST_UNKNOWN);
});

test('发现服务类型与设计文档一致', () => {
    assert.equal(DNS_SD_SERVICE_TYPE, '_lumesync-relay._tcp.local');
});
