// 验证码配对：验证码只出现在固定机屏幕，失败的计数与锁定由契约负责。
//
// 覆盖：正确的握手证明、错误验证码的递减与 5 次锁定、锁定/过期后必须重新发起、
// 证明重放被拒、nonce 不匹配不消耗次数、同一教室只保留一个活动请求。

const test = require('node:test');
const assert = require('node:assert/strict');

const { PROTOCOL_VERSION, createPairingProof, ERROR_CODES, RELAY_STATES } = require('@lumesync/classroom-protocol');
const { connect, fetchJson, pairTeacher, readScreen, startTeachingSession, startTestHub } = require('./helpers');

const DEVICE_KEY = 'device-key-pairing-01';

async function pairingClient(hub, { clientId = 'pair-client', protocolVersion = PROTOCOL_VERSION } = {}) {
    const client = connect(hub.port, { role: 'host', clientId, protocolVersion });
    await client.waitForAccepted();
    return client;
}

test('配对快乐路径：challenge 不含验证码，验证码只能从屏幕读到', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    const client = await pairingClient(hub);
    t.after(() => client.close());

    const challenge = await client.emitWithAck('teacher:pair.request', {
        requestId: 'req-happy',
        deviceKey: DEVICE_KEY,
        deviceName: '教师笔记本'
    });
    assert.equal(challenge.ok, true);
    assert.equal(challenge.requestId, 'req-happy');
    assert.equal(challenge.classroomId, hub.config.classroomId);
    assert.match(challenge.nonce, /^[0-9a-f]{32}$/);
    assert.equal(typeof challenge.expiresAt, 'number');
    assert.equal(Object.prototype.hasOwnProperty.call(challenge, 'code'), false, 'challenge 不能带 code 字段');
    assert.ok(!/^\d{8}$/.test(String(challenge.proof || '')), 'challenge 不能回传验证码');

    // 固定机状态与发现报文都进入「正在连接」，但都不含验证码
    const status = await fetchJson(hub, '/api/hub/status');
    assert.equal(status.body.relay.state, RELAY_STATES.PAIRING);
    assert.equal(status.body.relay.pairing.requestId, 'req-happy');
    assert.equal(Object.prototype.hasOwnProperty.call(status.body.relay.pairing, 'code'), false);

    const screen = await readScreen(hub);
    const code = screen.body.pairing.code;
    assert.match(code, /^\d{8}$/);
    assert.equal(screen.body.pairing.deviceName, '教师笔记本');

    const proof = await createPairingProof({
        code,
        classroomId: hub.config.classroomId,
        requestId: 'req-happy',
        deviceKey: DEVICE_KEY,
        nonce: challenge.nonce
    });
    const verified = await client.emitWithAck('teacher:pair.verify', {
        requestId: 'req-happy',
        nonce: challenge.nonce,
        proof
    });
    assert.equal(verified.ok, true);
    assert.equal(verified.classroomId, hub.config.classroomId);
    assert.match(verified.deviceToken, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.ok(new Date(verified.expiresAt).getTime() > Date.now());
    // 「已配对但尚未取得租约」：配对请求停留在已验证，租约为空（state 在取得租约时才进入 teaching）
    assert.equal(hub.relay.getState(), RELAY_STATES.PAIRING);
    assert.equal(hub.relay.status().relay.pairing.status, 'verified');
    assert.equal(hub.relay.describeLease().state, 'idle');
    assert.equal(hub.relay.status().pairedDevices, 1);
    // 屏幕侧不再显示验证码：已验证的请求不会再被演示
    const afterScreen = await readScreen(hub);
    assert.equal(afterScreen.body.pairing.status, 'verified');
});

test('验证码错误递减尝试次数，第 5 次锁定并要求重新发起', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    const client = await pairingClient(hub);
    t.after(() => client.close());

    const challenge = await client.emitWithAck('teacher:pair.request', { requestId: 'req-attempts', deviceKey: DEVICE_KEY });
    assert.equal(challenge.ok, true);

    const attempt = async (code) => {
        const proof = await createPairingProof({
            code,
            classroomId: hub.config.classroomId,
            requestId: 'req-attempts',
            deviceKey: DEVICE_KEY,
            nonce: challenge.nonce
        });
        return client.emitWithAck('teacher:pair.verify', { requestId: 'req-attempts', nonce: challenge.nonce, proof });
    };

    const wrongCode = '00000000';
    const screen = await readScreen(hub);
    assert.notEqual(screen.body.pairing.code, wrongCode, '用例要求一个不等于真实验证码的输入');

    for (const expectedLeft of [4, 3, 2, 1]) {
        const rejected = await attempt(wrongCode);
        assert.equal(rejected.ok, false);
        assert.equal(rejected.code, ERROR_CODES.PAIRING_CODE_INVALID);
        assert.equal(rejected.attemptsLeft, expectedLeft);
        assert.match(rejected.message, new RegExp(`剩余 ${expectedLeft} 次`));
    }

    const locked = await attempt(wrongCode);
    assert.equal(locked.ok, false);
    assert.equal(locked.code, ERROR_CODES.PAIRING_ATTEMPTS_EXCEEDED);
    assert.equal(locked.attemptsLeft, 0);

    // 锁定后请求作废、课堂回到等待连接；同一 requestId 不能再验证
    const afterLock = await attempt(wrongCode);
    assert.equal(afterLock.code, ERROR_CODES.PAIRING_REQUEST_UNKNOWN);
    assert.equal(hub.relay.getState(), RELAY_STATES.IDLE);
    assert.equal(hub.relay.status().relay.pairing, null);
    assert.equal(hub.relay.status().pairedDevices, 0);

    // 重新发起后计数从满额开始
    const second = await client.emitWithAck('teacher:pair.request', { requestId: 'req-attempts-2', deviceKey: DEVICE_KEY });
    assert.equal(second.ok, true);
    const screen2 = await readScreen(hub);
    assert.equal(screen2.body.pairing.attemptsLeft, 5);
    assert.notEqual(screen2.body.pairing.code, screen.body.pairing.code, '新请求必须生成新的验证码');
});

test('配对成功后同一证明（重放）被拒绝', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    const paired = await pairTeacher(hub, { deviceKey: DEVICE_KEY, requestId: 'req-replay' });
    assert.equal(paired.verified.ok, true);

    const replayer = await pairingClient(hub, { clientId: 'replayer' });
    t.after(() => replayer.close());

    const proof = await createPairingProof({
        code: paired.code,
        classroomId: hub.config.classroomId,
        requestId: 'req-replay',
        deviceKey: DEVICE_KEY,
        nonce: paired.challenge.nonce
    });
    const replay = await replayer.emitWithAck('teacher:pair.verify', {
        requestId: 'req-replay',
        nonce: paired.challenge.nonce,
        proof
    });
    assert.equal(replay.ok, false);
    assert.equal(replay.code, ERROR_CODES.PAIRING_REQUEST_UNKNOWN);

    // 已验证但尚未取得租约的请求不允许被别的设备顶掉
    const other = await pairingClient(hub, { clientId: 'other-device' });
    t.after(() => other.close());
    const busy = await other.emitWithAck('teacher:pair.request', { requestId: 'req-other-device', deviceKey: 'device-key-other' });
    assert.equal(busy.ok, false);
    assert.equal(busy.code, ERROR_CODES.RELAY_BUSY);
});

test('验证码绑定请求与设备：旧验证码不能给另一台设备配对', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    const session = await startTeachingSession(hub, { deviceKey: DEVICE_KEY, requestId: 'req-bind' });
    t.after(() => session.client.close());
    const oldCode = session.code;

    // 结束授课：租约释放，本次配对授权同时作废
    const released = await session.client.emitWithAck('teacher:lease.release', {
        leaseId: session.lease.leaseId,
        epoch: session.lease.epoch
    });
    assert.equal(released.ok, true);
    assert.equal(hub.relay.getState(), RELAY_STATES.IDLE);
    assert.equal(hub.relay.status().pairedDevices, 0);

    const other = await pairingClient(hub, { clientId: 'other-device' });
    t.after(() => other.close());
    const challenge = await other.emitWithAck('teacher:pair.request', { requestId: 'req-other', deviceKey: 'device-key-other' });
    assert.equal(challenge.ok, true);
    const screen = await readScreen(hub);
    assert.notEqual(screen.body.pairing.code, oldCode, '新请求必须生成新的验证码');

    const stolenProof = await createPairingProof({
        code: oldCode,
        classroomId: hub.config.classroomId,
        requestId: 'req-other',
        deviceKey: 'device-key-other',
        nonce: challenge.nonce
    });
    const stolenVerify = await other.emitWithAck('teacher:pair.verify', {
        requestId: 'req-other',
        nonce: challenge.nonce,
        proof: stolenProof
    });
    assert.equal(stolenVerify.ok, false);
    assert.equal(stolenVerify.code, ERROR_CODES.PAIRING_CODE_INVALID);
    assert.equal(stolenVerify.attemptsLeft, 4);
});

test('nonce 与本次 challenge 不一致时被拒绝且不消耗尝试次数', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    const client = await pairingClient(hub);
    t.after(() => client.close());

    const challenge = await client.emitWithAck('teacher:pair.request', { requestId: 'req-nonce', deviceKey: DEVICE_KEY });
    const screen = await readScreen(hub);
    const proof = await createPairingProof({
        code: screen.body.pairing.code,
        classroomId: hub.config.classroomId,
        requestId: 'req-nonce',
        deviceKey: DEVICE_KEY,
        nonce: 'ffffffffffffffffffffffffffffffff'
    });
    const rejected = await client.emitWithAck('teacher:pair.verify', {
        requestId: 'req-nonce',
        nonce: 'ffffffffffffffffffffffffffffffff',
        proof
    });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.code, ERROR_CODES.PAIRING_PROOF_INVALID);

    const status = await fetchJson(hub, '/api/hub/status');
    assert.equal(status.body.relay.pairing.attemptsLeft, 5, 'nonce 不匹配不算一次验证码输入');
    assert.notEqual(challenge.nonce, 'ffffffffffffffffffffffffffffffff');
});

test('同一教室只保留一个活动请求，第二台设备被明确拒绝', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    const first = await pairingClient(hub, { clientId: 'first' });
    t.after(() => first.close());
    const second = await pairingClient(hub, { clientId: 'second' });
    t.after(() => second.close());

    const ok = await first.emitWithAck('teacher:pair.request', { requestId: 'req-first', deviceKey: DEVICE_KEY });
    assert.equal(ok.ok, true);

    const busy = await second.emitWithAck('teacher:pair.request', { requestId: 'req-second', deviceKey: 'device-key-second' });
    assert.equal(busy.ok, false);
    assert.equal(busy.code, ERROR_CODES.RELAY_BUSY);

    // 屏幕上的仍然是第一个请求
    const screen = await readScreen(hub);
    assert.equal(screen.body.pairing.requestId, 'req-first');
});

test('验证码过期后必须重新发起（过期由契约的 TTL 判定）', async (t) => {
    let clock = 1_800_000_000_000;
    const hub = await startTestHub({ mode: 'relay', now: () => clock });
    t.after(() => hub.stop());

    const client = await pairingClient(hub);
    t.after(() => client.close());

    const challenge = await client.emitWithAck('teacher:pair.request', { requestId: 'req-expire', deviceKey: DEVICE_KEY });
    const screen = await readScreen(hub);
    const proof = await createPairingProof({
        code: screen.body.pairing.code,
        classroomId: hub.config.classroomId,
        requestId: 'req-expire',
        deviceKey: DEVICE_KEY,
        nonce: challenge.nonce
    });

    clock += 3 * 60 * 1000 + 1000;   // 契约的 PAIRING_TTL_MS = 3 分钟
    const expired = await client.emitWithAck('teacher:pair.verify', { requestId: 'req-expire', nonce: challenge.nonce, proof });
    assert.equal(expired.ok, false);
    assert.equal(expired.code, ERROR_CODES.PAIRING_CODE_EXPIRED);
    assert.equal(hub.relay.getState(), RELAY_STATES.IDLE);

    // 清理后同一请求也不能再用
    hub.sweep();
    assert.equal((await fetchJson(hub, '/api/hub/status')).body.relay.pairing, null);
});

test('直接模式不接受远程配对', async (t) => {
    const hub = await startTestHub({ mode: 'direct' });
    t.after(() => hub.stop());

    // 直接模式的 host 用 host token 直连，但配对事件在中继之外没有意义
    const client = connect(hub.port, { role: 'host', clientId: 'teacher-1', token: hub.config.hostToken, protocolVersion: PROTOCOL_VERSION });
    t.after(() => client.close());
    await client.waitForAccepted();

    const rejected = await client.emitWithAck('teacher:pair.request', { requestId: 'req-direct', deviceKey: DEVICE_KEY });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.code, ERROR_CODES.RELAY_DISABLED);
});
