// 单元测试：会话代理本身（假 socket / 假 HTTP / 假时钟，绝不碰网络）。
//
// 覆盖：配对证明推导与 accepted 路径、错误验证码的 attemptsLeft 与锁定、
// 本地拒绝非法验证码（不消耗固定机次数）、租约续期与过期、断线退避重连决策、
// 快照 revision 防护、publishCourse 在 hash 不一致/上传失败时中止、
// 提交去重与落盘回执、学生事件转发、socket 异常不泄漏。

const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');

const { ERROR_CODES, PAIRING_MAX_ATTEMPTS, PROTOCOL_VERSION, createPairingProof } = require('@lumesync/classroom-protocol');

const {
    createSessionAgent,
    SessionAgentError,
    SESSION_AGENT_ERROR_CODES
} = require('..');
const { createFakeClock, createFakeHub } = require('./fake-hub');
const { writeCourseFile, makeTempDir, sleep } = require('./helpers');

const DEVICE_KEY = 'teacher-laptop-0001';
const HUB_TARGET = { classroomId: 'classroom-fake', address: '127.0.0.1', port: 41234 };

function createAgent(fakeHub, overrides = {}) {
    return createSessionAgent({
        mode: 'relay',
        deviceKey: DEVICE_KEY,
        deviceName: '教师笔记本',
        logger: fakeHub.logger,
        now: fakeHub.clock.now,
        scheduler: fakeHub.clock.scheduler,
        random: () => 0.5,
        socketFactory: fakeHub.factory,
        requestTimeoutMs: 2000,
        connectTimeoutMs: 2000,
        renew: { jitterRatio: 0 },
        reconnect: { jitterRatio: 0, baseMs: 100, maxMs: 800 },
        ...overrides
    });
}

/** 走完配对（验证码从"屏幕"拿），返回 agent。 */
async function pairAgent(fakeHub, overrides = {}) {
    const agent = createAgent(fakeHub, overrides);
    await agent.connect(HUB_TARGET);
    const request = await agent.requestPairing();
    await agent.submitPairingCode(fakeHub.state.code);
    return { agent, request };
}

test('配对：验证码 → HMAC 证明 → teacher:pair.accepted → 用设备凭证重连', async () => {
    const fakeHub = createFakeHub();
    const agent = createAgent(fakeHub);
    const events = [];
    for (const name of ['pairing', 'status', 'snapshot']) agent.on(name, (payload) => events.push({ name, payload }));

    const connected = await agent.connect(HUB_TARGET);
    assert.equal(connected.pairingOnly, true, '没有设备凭证时 Hub 只给配对候选连接');
    assert.equal(connected.classroomId, 'classroom-fake', '教室身份来自 session:accepted 的 classroomId');
    assert.equal(agent.getState().paired, false);

    const request = await agent.requestPairing();
    assert.ok(request.requestId);
    assert.match(request.nonce, /^[0-9a-f]{16}$/);
    assert.ok(request.expiresAt > fakeHub.clock.now());
    assert.equal(request.attemptsLeft, PAIRING_MAX_ATTEMPTS);
    assert.match(request.message, /固定机屏幕/);

    // 代理必须能在不知道验证码的情况下先建请求；验证码只由调用方（屏幕）提供
    assert.equal(fakeHub.state.pairRequests, 1);

    const paired = await agent.submitPairingCode(` ${fakeHub.state.code} `);
    assert.equal(paired.paired, true);
    assert.equal(paired.classroomId, 'classroom-fake');
    assert.equal(fakeHub.state.verifies, 1, '证明通过了契约的 verifyPairingProof');
    assert.equal(agent.getState().paired, true);
    assert.equal(agent.getState().connected, true);
    assert.equal(agent.getState().pairingOnly, false);
    assert.equal(agent.getState().revision, fakeHub.state.revision, '重连后拿到了权威快照');
    assert.equal(agent.getState().pairing, null);

    // 第二次连接（重连后）必须带设备凭证与同一个 clientId
    assert.equal(fakeHub.sockets.length, 2);
    const hostSocket = fakeHub.lastSocket();
    assert.equal(hostSocket.auth.token, 'fake-device-token');
    assert.equal(hostSocket.auth.clientId, DEVICE_KEY);
    assert.equal(hostSocket.auth.role, 'host');
    assert.equal(hostSocket.options.reconnection, false, '重连由代理自己管理，关闭 socket.io 内置重连');
    // 协议版本必须声明在握手 auth 里（Hub 读 handshake.auth.protocolVersion）。
    // 绝不能放进 socket.io 顶层选项：它会被透传给 node ws 的 WebSocket 协议版本，
    // 传契约版本 1 会让真实握手直接失效（只有真实 Hub 才暴露得出来）。
    assert.equal(hostSocket.auth.protocolVersion, PROTOCOL_VERSION);
    assert.equal('protocolVersion' in hostSocket.options, false, '顶层 protocolVersion 会撞上 node ws 的选项');

    const kinds = events.filter((entry) => entry.name === 'pairing').map((entry) => entry.payload.kind);
    assert.deepEqual(kinds, ['challenged', 'accepted', 'reconnected']);
    assert.ok(events.some((entry) => entry.name === 'snapshot'));
    assert.ok(events.some((entry) => entry.name === 'status' && entry.payload.status === 'connected'));

    // 硬性约束：验证码绝不进入日志或状态
    assert.equal(fakeHub.logger.text().includes(fakeHub.state.code), false, '日志里不能出现验证码');
    assert.equal(JSON.stringify(agent.getState()).includes(fakeHub.state.code), false, '状态里不能出现验证码');
    assert.equal(JSON.stringify(events).includes(fakeHub.state.code), false, '事件里不能出现验证码');
});

test('配对：错误验证码得到带 attemptsLeft 的类型化错误，第 5 次锁定并要求重新发起', async () => {
    const fakeHub = createFakeHub({ code: '00000000' });
    const agent = createAgent(fakeHub);
    await agent.connect(HUB_TARGET);
    await agent.requestPairing();

    for (let attempt = 1; attempt <= PAIRING_MAX_ATTEMPTS; attempt += 1) {
        const wrong = String(attempt).padStart(8, '0'); // 00000001, 00000002 ... 都与 00000000 不同
        const error = await agent.submitPairingCode(wrong).then(() => null, (err) => err);
        assert.ok(error instanceof SessionAgentError, '必须是类型化错误');
        assert.equal(error instanceof Error, true);
        const expectedLeft = PAIRING_MAX_ATTEMPTS - attempt;
        assert.equal(error.attemptsLeft, expectedLeft, `第 ${attempt} 次失败后剩余 ${expectedLeft} 次`);
        if (attempt < PAIRING_MAX_ATTEMPTS) {
            assert.equal(error.code, ERROR_CODES.PAIRING_CODE_INVALID);
        } else {
            assert.equal(error.code, ERROR_CODES.PAIRING_ATTEMPTS_EXCEEDED);
            assert.equal(error.attemptsLeft, 0);
        }
    }

    // 次数用尽：本地配对请求被清空，必须重新 requestPairing
    assert.equal(agent.getState().pairing, null);
    const afterLock = await agent.submitPairingCode('00000000').then(() => null, (err) => err);
    assert.equal(afterLock.code, SESSION_AGENT_ERROR_CODES.NO_PAIRING_REQUEST);

    // 重新发起后验证码必须重新在固定机屏幕上出现（新 nonce / 新 requestId）
    const second = await agent.requestPairing();
    assert.notEqual(second.requestId, 'pair-reused');
    assert.equal(fakeHub.state.attemptsLeft, PAIRING_MAX_ATTEMPTS);
    const paired = await agent.submitPairingCode(fakeHub.state.code);
    assert.equal(paired.paired, true);
});

test('配对：本地就能看出不是 8 位数字时不消耗固定机的尝试次数', async () => {
    const fakeHub = createFakeHub();
    const agent = createAgent(fakeHub);
    await agent.connect(HUB_TARGET);
    await agent.requestPairing();

    const error = await agent.submitPairingCode('abc').then(() => null, (err) => err);
    assert.equal(error.code, ERROR_CODES.PAIRING_CODE_INVALID);
    assert.equal(error.attemptsLeft, PAIRING_MAX_ATTEMPTS);
    assert.equal(fakeHub.state.verifies, 0, '非法输入没有发到 Hub');
    assert.equal(fakeHub.state.attemptsLeft, PAIRING_MAX_ATTEMPTS);

    const long = await agent.submitPairingCode('123456789').then(() => null, (err) => err);
    assert.equal(long.code, ERROR_CODES.PAIRING_CODE_INVALID);
    assert.equal(fakeHub.state.verifies, 0);
});

test('配对：claim 次数用尽后 Hub 报 relay_busy 也要原样透出契约码', async () => {
    const fakeHub = createFakeHub();
    fakeHub.ackOverrides['teacher:pair.request'] = () => ({ ok: false, code: ERROR_CODES.RELAY_BUSY, message: '该教室已有待验证的连接请求' });
    const agent = createAgent(fakeHub);
    await agent.connect(HUB_TARGET);
    const error = await agent.requestPairing().then(() => null, (err) => err);
    assert.equal(error.code, ERROR_CODES.RELAY_BUSY);
    assert.equal(agent.getState().pairing, null);
});

test('租约：取得的 epoch 与到期时间来自 Hub，续租保持同一租约，释放后清除凭证', async () => {
    const fakeHub = createFakeHub();
    const { agent } = await pairAgent(fakeHub);
    const leaseEvents = [];
    agent.on('lease', (payload) => leaseEvents.push(payload));

    const lease = await agent.acquireLease();
    assert.equal(lease.epoch, 1, '首次授课租约为 epoch 1');
    assert.equal(lease.leaseId, 'lease-1-fakeid');
    assert.equal(lease.expiresAt, fakeHub.clock.now() + 60000);
    assert.equal(agent.getState().lease.epoch, 1);

    // 续租由自动调度触发（TTL 一半处，抖动为 0）；另有租约到期定时器（TTL + 宽限）
    assert.deepEqual(fakeHub.clock.pendingDelays(), [30000, 60025], '续租定时器在 TTL 一半处，到期定时器在 TTL 之后');
    await fakeHub.clock.advance(30000);
    assert.equal(fakeHub.state.leaseRenewals, 1, '到点自动续租一次');
    const renewed = leaseEvents.find((entry) => entry.kind === 'renewed');
    assert.ok(renewed);
    assert.equal(renewed.source, 'auto');
    assert.equal(renewed.epoch, 1, '自动续租不会改变 epoch');

    const manual = await agent.renewLease({ reason: 'manual-test' });
    assert.equal(manual.renewals, 2);

    const released = await agent.releaseLease();
    assert.equal(released.released, true);
    assert.equal(released.epoch, 1);
    assert.equal(agent.getState().lease, null);
    assert.equal(agent.getState().paired, false, 'Hub 释放租约即作废设备凭证，本机同步清除');
    assert.ok(leaseEvents.some((entry) => entry.kind === 'released'));
    await assert.rejects(() => agent.renewLease(), (error) => error.code === ERROR_CODES.LEASE_NOT_HELD);
});

test('租约：epoch 变化会单独广播，Hub 拒绝续租时把控制权交回课堂', async () => {
    const fakeHub = createFakeHub();
    const { agent } = await pairAgent(fakeHub);
    const leaseEvents = [];
    const statuses = [];
    agent.on('lease', (payload) => leaseEvents.push(payload));
    agent.on('status', (payload) => statuses.push(payload.status));

    await agent.acquireLease();
    // Hub 侧换成了别的 deviceKey 持有的租约（交接）：本机既不是持有者，也不再是 epoch 持有者
    fakeHub.state.epoch = 4;
    fakeHub.state.lease = { leaseId: 'lease-4-otherid', epoch: 4, expiresAt: fakeHub.clock.now() + 60000, classroomId: 'classroom-fake' };
    const error = await agent.renewLease().then(() => null, (err) => err);
    assert.equal(error.code, ERROR_CODES.LEASE_NOT_HELD);
    assert.equal(agent.getState().lease, null, '失去控制权后本地不再保留租约');
    assert.ok(statuses.includes('lease-expired'));
    assert.ok(leaseEvents.some((entry) => entry.kind === 'expired'));
    assert.equal(fakeHub.state.lease.epoch, 4, 'Hub 侧的租约不受影响');
});

test('租约：lease_epoch_stale 回执同样把控制权交回课堂（course:publish 只带 epoch）', async () => {
    const fakeHub = createFakeHub();
    const { agent } = await pairAgent(fakeHub);
    await agent.acquireLease();
    const statuses = [];
    const leaseEvents = [];
    agent.on('status', (payload) => statuses.push(payload.status));
    agent.on('lease', (payload) => leaseEvents.push(payload));

    fakeHub.ackOverrides['teacher:lease.renew'] = () => ({ ok: false, code: ERROR_CODES.LEASE_EPOCH_STALE, message: '租约代次已过期' });
    const stale = await agent.renewLease().then(() => null, (err) => err);
    assert.equal(stale.code, ERROR_CODES.LEASE_EPOCH_STALE);
    assert.equal(agent.getState().lease, null);
    assert.ok(statuses.includes('lease-expired'));
    assert.ok(leaseEvents.some((entry) => entry.kind === 'expired'));
});

test('断线：保留租约直到 TTL、按退避重连、重连后重新拉快照并续租（不重新获取）', async () => {
    const fakeHub = createFakeHub();
    const { agent } = await pairAgent(fakeHub);
    await agent.acquireLease();
    const statuses = [];
    agent.on('status', (payload) => statuses.push(payload));

    const before = fakeHub.state.lease;
    assert.equal(agent.__internals.dropConnection('transport close'), true);
    assert.equal(agent.getState().connected, false);
    assert.equal(agent.getState().lease.epoch, 1, '断线期间租约仍在本地保留（TTL 内）');
    assert.ok(statuses.some((entry) => entry.status === 'disconnected' && entry.leaseKept === true && entry.leaseExpiresAt === before.expiresAt));

    // 退避：第一次 100ms，第二次 200ms（抖动为 0），上限 800ms
    const reconnecting = statuses.find((entry) => entry.status === 'reconnecting');
    assert.equal(reconnecting.delayMs, 100);
    assert.equal(reconnecting.attempt, 1);
    assert.equal(fakeHub.clock.pendingDelays()[0], 100, '重连定时器排在租约定时器之前（100ms < 30s）');

    await fakeHub.clock.advance(100);
    assert.equal(agent.getState().connected, true, '退避到点后重连成功');
    assert.equal(agent.getState().reconnectAttempt, 0, '连接成功后重置退避计数');
    assert.equal(fakeHub.state.leaseRenewals, 1, '重连后立即续租同一条租约');
    assert.equal(fakeHub.state.lease.leaseId, before.leaseId);
    assert.equal(fakeHub.state.epoch, 1, '重连不会获取新租约（epoch 不变）');
    const refresh = fakeHub.eventsSent('request-classroom-snapshot');
    assert.ok(refresh.length >= 1, '重连后必须重新拉取权威快照');
    assert.ok(statuses.some((entry) => entry.status === 'connected' && entry.reconnected === true && entry.attempt === 1));

    // 第二次断线：上一次重连成功时退避已重置，所以是新一轮的第一次尝试；
    // 本次重连先失败一次，退避才按 100 → 200 → 400 指数增长。
    fakeHub.setFailures({ connectError: true });
    agent.__internals.dropConnection('transport close');
    const second = statuses.filter((entry) => entry.status === 'reconnecting').pop();
    assert.equal(second.attempt, 1, '成功重连会重置退避，新一轮从最小延迟开始');
    assert.equal(second.delayMs, 100);

    await fakeHub.clock.advance(100);   // 第 1 次重连失败（瞬时网络错误）
    const third = statuses.filter((entry) => entry.status === 'reconnecting').pop();
    assert.equal(third.attempt, 2);
    assert.equal(third.delayMs, 200, '退避按 factor=2 翻倍');

    await fakeHub.clock.advance(200);   // 第 2 次重连也失败
    const fourth = statuses.filter((entry) => entry.status === 'reconnecting').pop();
    assert.equal(fourth.attempt, 3);
    assert.equal(fourth.delayMs, 400);

    // 网络恢复：按当前退避到点重连成功，且仍然不重新获取租约（epoch 保持 1）
    fakeHub.setFailures({ connectError: false });
    await fakeHub.clock.advance(400);
    assert.equal(agent.getState().connected, true, '瞬时网络失败不改变凭证，退避后即可重连');
    assert.equal(agent.getState().lease.epoch, 1);
    assert.equal(fakeHub.state.epoch, 1, '重连不会产生新租约');
});

test('断线：租约在离线期间到期时广播 lease-expired，且重连后不静默重新获取', async () => {
    const fakeHub = createFakeHub();
    const { agent } = await pairAgent(fakeHub);
    await agent.acquireLease();
    const statuses = [];
    const leaseEvents = [];
    agent.on('status', (payload) => statuses.push(payload));
    agent.on('lease', (payload) => leaseEvents.push(payload));

    // 真正的"离线"：连接尝试持续失败（瞬时网络错误），退避重连一直在进行但接不上
    fakeHub.setFailures({ connectError: true });
    agent.__internals.dropConnection('transport close');

    // 离线超过 TTL：本地租约时钟走完，控制权交回课堂
    await fakeHub.clock.advance(60026);

    assert.equal(agent.getState().lease, null);
    assert.equal(agent.getState().connected, false, '离线期间不会假装已连接');
    assert.ok(statuses.some((entry) => entry.status === 'lease-expired'), '课堂进入等待教师');
    assert.ok(leaseEvents.some((entry) => entry.kind === 'expired' && entry.reason === 'ttl-elapsed'));

    // 网络恢复后重连成功，但绝不能自动 acquire 新租约
    const acquiresBefore = fakeHub.eventsSent('teacher:lease.acquire').length;
    fakeHub.setFailures({ connectError: false });
    await fakeHub.clock.advance(20000);
    assert.equal(agent.getState().connected, true);
    assert.equal(fakeHub.eventsSent('teacher:lease.acquire').length, acquiresBefore, '不静默重新获取租约');
    assert.equal(agent.getState().lease, null);
});

test('断线：设备凭证被撤销（交接）后停止重试，改为等待重新配对', async () => {
    const fakeHub = createFakeHub();
    const { agent } = await pairAgent(fakeHub);
    await agent.acquireLease();
    const statuses = [];
    const errors = [];
    const pairingEvents = [];
    agent.on('status', (payload) => statuses.push(payload));
    agent.on('error', (error) => errors.push(error));
    agent.on('pairing', (payload) => pairingEvents.push(payload));

    // 固定机管理员撤销/交接：租约与设备凭证同时作废
    fakeHub.setFailures({ rejectCredentialed: true });
    fakeHub.state.lease = null;
    agent.__internals.dropConnection('transport close');
    await fakeHub.clock.advance(100);
    await fakeHub.clock.flush();

    assert.equal(agent.getState().connected, false, '带旧凭证无法再接入');
    assert.equal(agent.getState().paired, false, '本机清除了已失效的设备凭证');
    assert.ok(statuses.some((entry) => entry.status === 'pairing-required'), '回到"需要重新配对"状态');
    assert.ok(errors.some((error) => error.code === SESSION_AGENT_ERROR_CODES.IDENTITY_REJECTED));
    assert.ok(pairingEvents.some((entry) => entry.kind === 'credential-cleared' && entry.reason === 'host_auth_failed'));

    // 停止重试：再推进很久也不会产生新的连接尝试
    const socketsBefore = fakeHub.sockets.length;
    await fakeHub.clock.advance(60000);
    assert.equal(fakeHub.sockets.length, socketsBefore, '不无限重试无效凭证');
    assert.equal(agent.getState().reconnectAttempt, 0, '退避计数被重置，等待重新配对');

    // 管理员恢复凭证策略（模拟交接完成、教室空闲），重新配对仍可成功
    fakeHub.setFailures({ rejectCredentialed: false });
    const request = await agent.connect(HUB_TARGET);
    assert.equal(request.pairingOnly, true);
    const pairing = await agent.requestPairing();
    assert.ok(pairing.requestId);
    const paired = await agent.submitPairingCode(fakeHub.state.code);
    assert.equal(paired.paired, true);
});

test('命令：Hub 无响应时给出 agent_request_timeout，而不是挂死', async () => {
    const fakeHub = createFakeHub();
    const { agent } = await pairAgent(fakeHub);
    await agent.acquireLease();
    fakeHub.ackOverrides['classroom:command'] = () => null; // 不回执
    const clock = fakeHub.clock;
    const pending = agent.sendCommand('slide:set', { slideIndex: 1 }).then(() => null, (err) => err);
    await clock.advance(2000);
    const error = await pending;
    assert.equal(error.code, SESSION_AGENT_ERROR_CODES.REQUEST_TIMEOUT);
    assert.match(error.message, /classroom:command/);
});

test('快照：同一会话的低 revision 快照被丢弃，Hub 重启（sessionId 变化）时接受并放弃失效租约', async () => {
    const fakeHub = createFakeHub();
    const { agent } = await pairAgent(fakeHub);
    await agent.acquireLease();
    const snapshots = [];
    agent.on('snapshot', (payload) => snapshots.push(payload));

    const good = fakeHub.snapshot();
    fakeHub.state.revision += 1;
    const newer = { ...good, revision: fakeHub.state.revision, currentCourseId: 'lesson-A' };
    fakeHub.broadcast('classroom:snapshot', newer);
    assert.equal(snapshots.length, 1);
    assert.equal(agent.getState().courseId, 'lesson-A');

    // 乱序广播：更旧的 revision 必须被忽略
    fakeHub.broadcast('classroom:snapshot', { ...good, revision: good.revision, currentCourseId: 'lesson-OLD' });
    assert.equal(snapshots.length, 1, '过期快照不产生事件');
    assert.equal(agent.getState().courseId, 'lesson-A', '本地状态没有被旧快照覆盖');

    // 不符合契约 schema 的快照只报错、不改状态
    fakeHub.broadcast('classroom:snapshot', { revision: 'x' });
    assert.equal(agent.getState().courseId, 'lesson-A');

    // Hub 重启：sessionId 变化 → 接受新会话并广播 session-reset，租约失效
    const statuses = [];
    agent.on('status', (payload) => statuses.push(payload));
    const leaseEvents = [];
    agent.on('lease', (payload) => leaseEvents.push(payload));
    fakeHub.broadcast('classroom:snapshot', {
        protocolVersion: 1,
        sessionId: 'fake-session-2',
        revision: 0,
        currentCourseId: null,
        currentSlideIndex: 0,
        hostSettings: {}
    });
    assert.equal(agent.getState().sessionId, 'fake-session-2');
    assert.ok(statuses.some((entry) => entry.status === 'session-reset'));
    assert.ok(leaseEvents.some((entry) => entry.kind === 'expired' && entry.reason === 'hub-session-reset'));
});

test('命令：中继模式带 leaseId + epoch + requestId，命令后本地 revision 与 Hub 一致', async () => {
    const fakeHub = createFakeHub();
    const { agent } = await pairAgent(fakeHub);
    await agent.acquireLease();
    const lease = agent.getState().lease;

    const result = await agent.selectCourse('lesson-42');
    assert.equal(result.ok, true);
    assert.equal(result.revision, fakeHub.state.revision);
    assert.equal(agent.getState().courseId, 'lesson-42');
    assert.equal(fakeHub.state.courseId, 'lesson-42');

    const sent = fakeHub.eventsSent('classroom:command')[0].payload;
    assert.equal(sent.type, 'course:select');
    assert.equal(sent.leaseId, lease.leaseId);
    assert.equal(sent.epoch, lease.epoch);
    assert.ok(sent.requestId, '每条命令都要带 requestId（幂等去重）');
    assert.deepEqual(sent.payload, { courseId: 'lesson-42' });

    await agent.setSlide(5);
    assert.equal(fakeHub.state.slideIndex, 5);
    await agent.updateSettings({ syncFollow: false });
    assert.equal(fakeHub.state.hostSettings.syncFollow, false);
    await agent.endCourse();
    assert.equal(fakeHub.state.courseId, null);
    assert.equal(agent.getState().slideIndex, 0);

    // 未取得租约时必须本地拒绝，不发到 Hub
    const other = createAgent(createFakeHub());
    await other.connect(HUB_TARGET);
    const error = await other.sendCommand('slide:set', { slideIndex: 1 }).then(() => null, (err) => err);
    assert.equal(error.code, ERROR_CODES.LEASE_NOT_HELD);
});

test('命令：lease_epoch_stale 回执 → 类型化错误 + 放弃本地租约（Hub 状态不变）', async () => {
    const fakeHub = createFakeHub();
    const { agent } = await pairAgent(fakeHub);
    await agent.acquireLease();
    const revisionBefore = fakeHub.state.revision;
    fakeHub.ackOverrides['classroom:command'] = () => ({
        ok: false,
        code: ERROR_CODES.LEASE_EPOCH_STALE,
        message: '控制命令的租约代次已过期',
        revision: revisionBefore
    });
    const statuses = [];
    agent.on('status', (payload) => statuses.push(payload.status));

    const error = await agent.sendCommand('slide:set', { slideIndex: 9 }).then(() => null, (err) => err);
    assert.equal(error.code, ERROR_CODES.LEASE_EPOCH_STALE);
    assert.equal(agent.getState().lease, null, 'epoch 过期后本地不再认为持有租约');
    assert.ok(statuses.includes('lease-expired'));
    assert.equal(fakeHub.state.slideIndex, 0, '假 Hub 的课堂状态没有被改动');
    assert.equal(fakeHub.state.revision, revisionBefore);
});

test('publishCourse：hash 不一致或上传失败都中止，绝不发 course:publish', async () => {
    const dir = await makeTempDir();
    const course = await writeCourseFile({ dir, id: 'lesson-publish' });
    const otherHash = `sha256:${'b'.repeat(64)}`;

    // 1) Hub 返回的 courseHash 与本地不一致 → 中止
    const fakeHub = createFakeHub();
    const requests = [];
    const { agent } = await pairAgent(fakeHub, {
        httpRequest: async (url, options) => {
            requests.push({ url, options });
            return { status: 200, ok: true, body: { ok: true, courseId: 'lesson-publish', courseHash: otherHash } };
        }
    });
    await agent.acquireLease();
    const mismatch = await agent.publishCourse({ courseId: 'lesson-publish', filePath: course.filePath }).then(() => null, (err) => err);
    assert.equal(mismatch.code, ERROR_CODES.COURSE_HASH_MISMATCH);
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /\/api\/courses\/stage\/lesson-publish\?courseHash=sha256%3A/);
    assert.equal(requests[0].options.method, 'PUT');
    assert.equal(requests[0].options.headers.authorization, 'Bearer fake-device-token');
    assert.equal(Buffer.isBuffer(requests[0].options.body), true, '上传的是原始 .lume 字节');
    assert.equal(fakeHub.eventsSent('course:stage').length, 0);
    assert.equal(fakeHub.eventsSent('course:publish').length, 0);
    assert.equal(agent.getState().courseId, null);

    // 2) 上传被 Hub 拒绝（413 stage_capacity_exceeded）→ 中止并透出契约码
    const rejectingHub = createFakeHub();
    const { agent: rejectingAgent } = await pairAgent(rejectingHub, {
        httpRequest: async () => ({ status: 413, ok: false, body: { ok: false, code: ERROR_CODES.STAGE_CAPACITY_EXCEEDED, message: '请求体超过上限' } })
    });
    await rejectingAgent.acquireLease();
    const failed = await rejectingAgent.publishCourse({ courseId: 'lesson-publish', filePath: course.filePath }).then(() => null, (err) => err);
    assert.equal(failed.code, ERROR_CODES.STAGE_CAPACITY_EXCEEDED);
    assert.equal(rejectingHub.eventsSent('course:stage').length, 0);
    assert.equal(rejectingHub.eventsSent('course:publish').length, 0);

    // 3) 网络异常 → 类型化 agent_upload_failed
    const brokenHub = createFakeHub();
    const { agent: brokenAgent } = await pairAgent(brokenHub, {
        httpRequest: async () => { throw new Error('ECONNREFUSED'); }
    });
    await brokenAgent.acquireLease();
    const network = await brokenAgent.publishCourse({ courseId: 'lesson-publish', filePath: course.filePath }).then(() => null, (err) => err);
    assert.equal(network.code, SESSION_AGENT_ERROR_CODES.UPLOAD_FAILED);
    assert.match(network.message, /ECONNREFUSED/);
});

test('publishCourse：本地课件不合法（不是 ZIP）时用 course-format 的码中止，且不上传', async () => {
    const dir = await makeTempDir();
    const badPath = `${dir}/broken.lume`;
    await fsp.writeFile(badPath, 'console.log("legacy script course")', 'utf8');
    const fakeHub = createFakeHub();
    let uploads = 0;
    const { agent } = await pairAgent(fakeHub, {
        httpRequest: async () => { uploads += 1; return { status: 200, ok: true, body: { ok: true } }; }
    });
    await agent.acquireLease();
    const error = await agent.publishCourse({ courseId: 'broken', filePath: badPath }).then(() => null, (err) => err);
    assert.equal(error.code, 'package_not_a_zip');
    assert.equal(uploads, 0);
    assert.equal(fakeHub.eventsSent('course:publish').length, 0);
});

test('publishCourse：成功路径返回 courseHash + revision，并广播 course-published', async () => {
    const dir = await makeTempDir();
    const course = await writeCourseFile({ dir, id: 'lesson-ok' });
    const fakeHub = createFakeHub();
    const published = [];
    const { agent } = await pairAgent(fakeHub, {
        httpRequest: async (url, options) => ({
            status: 200,
            ok: true,
            body: { ok: true, courseId: 'lesson-ok', courseHash: new URL(url).searchParams.get('courseHash') }
        })
    });
    agent.on('course-published', (payload) => published.push(payload));
    await agent.acquireLease();

    const result = await agent.publishCourse({ courseId: 'lesson-ok', filePath: course.filePath });
    assert.match(result.courseHash, /^sha256:[0-9a-f]{64}$/);
    assert.equal(result.revision, fakeHub.state.revision);
    assert.equal(result.sizeBytes, course.bytes);
    assert.equal(fakeHub.state.courseId, 'lesson-ok');

    const stage = fakeHub.eventsSent('course:stage')[0].payload;
    const publish = fakeHub.eventsSent('course:publish')[0].payload;
    assert.equal(stage.courseHash, result.courseHash);
    assert.equal(publish.courseHash, result.courseHash);
    assert.equal(publish.epoch, agent.getState().lease.epoch);

    // Hub 的 course:published 广播（信封带 revision）→ course-published 事件
    fakeHub.broadcast('course:published', {
        protocolVersion: 1,
        classroomId: 'classroom-fake',
        sessionId: fakeHub.state.sessionId,
        requestId: publish.requestId,
        revision: result.revision,
        payload: { courseId: 'lesson-ok', courseHash: result.courseHash, previousCourseHash: null }
    });
    assert.equal(published.length, 1);
    assert.equal(published[0].courseHash, result.courseHash);
});

test('提交：submission:forwarded 与旧事件名按 submissionId 去重，ackSubmission 后才算最终成功', async () => {
    const fakeHub = createFakeHub();
    const { agent } = await pairAgent(fakeHub);
    const submissions = [];
    const statuses = [];
    agent.on('submission', (payload) => submissions.push(payload));
    agent.on('status', (payload) => statuses.push(payload));

    const payload = {
        submissionId: 'sub-1',
        courseId: 'lesson-1',
        clientIp: '192.168.1.20',
        clientId: 'student-1',
        fileName: 'homework.zip',
        content: 'base64-content',
        sizeBytes: 128,
        receivedAt: fakeHub.clock.now(),
        queueSize: 1
    };
    // 直接模式的 Hub 会同时发两个事件名：代理只应上报一次
    fakeHub.broadcast('submission:forwarded', payload);
    fakeHub.broadcast('student:submit', payload);
    assert.equal(submissions.length, 1, '同一 submissionId 只上报一次');
    assert.equal(submissions[0].submissionId, 'sub-1');
    assert.equal(agent.getState().pendingSubmissions, 1);
    assert.equal(agent.getPendingSubmissions()[0].fileName, 'homework.zip');

    // 未确认落盘前，Hub 不会给学生最终成功；代理侧也只是"待落盘"
    assert.equal(fakeHub.eventsSent('submission:delivered').length, 0);

    const ack = await agent.ackSubmission('sub-1');
    assert.equal(ack.delivered, true);
    assert.equal(ack.pendingCount, 0);
    assert.equal(agent.getState().pendingSubmissions, 0);
    const delivered = fakeHub.eventsSent('submission:delivered')[0].payload;
    assert.equal(delivered.submissionId, 'sub-1');
    assert.ok(delivered.deliveredAt);

    // Hub 的落盘回执（广播给教师房间）也会清掉待同步计数
    fakeHub.broadcast('submission:forwarded', { ...payload, submissionId: 'sub-2' });
    assert.equal(agent.getState().pendingSubmissions, 1);
    fakeHub.broadcast('submission:delivered:ack', { submissionId: 'sub-2', pendingCount: 0 });
    assert.equal(agent.getState().pendingSubmissions, 0);
    assert.ok(statuses.some((entry) => entry.status === 'submission-delivered'));

    // 队列满：Hub 拒绝时代理把契约码原样透出
    fakeHub.ackOverrides['submission:delivered'] = () => ({ ok: false, code: ERROR_CODES.QUEUE_ITEM_UNKNOWN, message: '队列中没有该提交' });
    const error = await agent.ackSubmission('sub-404').then(() => null, (err) => err);
    assert.equal(error.code, ERROR_CODES.QUEUE_ITEM_UNKNOWN);
});

test('断线重连后同一待落盘提交可以重新通知教师界面', async () => {
    const fakeHub = createFakeHub();
    const { agent } = await pairAgent(fakeHub);
    await agent.acquireLease();
    const received = [];
    agent.on('submission', (payload) => received.push(payload));

    const payload = { submissionId: 'sub-replay', content: 'homework' };
    fakeHub.broadcast('submission:forwarded', payload);
    fakeHub.broadcast('submission:forwarded', payload);
    assert.equal(received.length, 1, '同一连接内重复通知仍去重');

    agent.__internals.dropConnection('transport close');
    await fakeHub.clock.advance(100);
    assert.equal(agent.getState().connected, true);
    fakeHub.broadcast('submission:forwarded', { ...payload, replayed: true });
    assert.equal(received.length, 2, '新连接应再次提醒尚未确认落盘的提交');
    assert.equal(agent.getState().pendingSubmissions, 1);
});

test('学生事件：契约声明的事件被转发成 student-event，host 命令类事件不会被误订阅', async () => {
    const fakeHub = createFakeHub();
    const { agent } = await pairAgent(fakeHub);
    const events = [];
    agent.on('student-event', (payload) => events.push(payload));

    fakeHub.broadcast('student-alert', { message: '学生切出全屏', clientId: 'student-1' });
    fakeHub.broadcast('vote:submit', { voteId: 'v1', option: 'A' });
    fakeHub.broadcast('student-status', { count: 3, action: 'join' });
    assert.deepEqual(events.map((entry) => entry.type), ['student-alert', 'vote:submit', 'student-status']);
    assert.equal(events[0].payload.message, '学生切出全屏');

    // 提交有专门处理器（挂在 socket 上，沿用直接模式的兼容事件名 student:submit），
    // 因此不会被通用转发通道当成普通学生事件再上报一次。
    assert.equal(fakeHub.lastSocket().handlers.has('student:submit'), true, '提交处理器挂在 socket 的 student:submit 上');
    assert.equal(agent.__internals.emitter.listenerCount('student:submit'), 0, '原始 student:submit 不进入业务事件通道');
    assert.equal(agent.getState().revision > 0, true);
});

test('endSession：释放租约、关闭连接、清除凭证，并报告待同步提交数量', async () => {
    const fakeHub = createFakeHub();
    const { agent } = await pairAgent(fakeHub);
    await agent.acquireLease();
    fakeHub.broadcast('submission:forwarded', { submissionId: 'sub-pending', courseId: 'c1', fileName: 'a.zip' });

    const statuses = [];
    agent.on('status', (payload) => statuses.push(payload));
    const result = await agent.endSession();
    assert.equal(result.released, true);
    assert.equal(result.epoch, 1);
    assert.equal(result.pendingSubmissions, 1, '离开前要能告诉 UI 还有几份没落盘');
    assert.equal(result.releaseError, null);
    assert.equal(fakeHub.state.lease, null, 'Hub 回到空闲');
    assert.equal(fakeHub.lastSocket().closed, true);
    const state = agent.getState();
    assert.equal(state.closed, true);
    assert.equal(state.paired, false);
    assert.equal(state.status, 'closed');
    assert.ok(statuses.some((entry) => entry.status === 'closed'));

    // 关闭后所有入口都拒绝
    await assert.rejects(() => agent.connect(HUB_TARGET), (error) => error.code === SESSION_AGENT_ERROR_CODES.CLOSED);
    await assert.rejects(() => agent.sendCommand('course:end', {}), (error) => error.code === SESSION_AGENT_ERROR_CODES.CLOSED);
    await assert.rejects(() => agent.ackSubmission('x'), (error) => error.code === SESSION_AGENT_ERROR_CODES.CLOSED);
});

test('连接：带无效设备凭证时明确报错并降级为配对候选连接（不静默使用旧凭证）', async () => {
    const fakeHub = createFakeHub();
    const fresh = createAgent(fakeHub);
    await fresh.connect(HUB_TARGET);
    await fresh.requestPairing();
    await fresh.submitPairingCode(fakeHub.state.code);
    assert.equal(fresh.getState().paired, true);

    // 固定机管理员撤销/交接：带凭证的握手被 identity-rejected（不带凭证仍可按配对候选连接接入）
    fakeHub.setFailures({ rejectCredentialed: true });
    fresh.__internals.dropConnection('transport close');

    const errors = [];
    fresh.on('error', (error) => errors.push(error));
    const reopened = await fresh.connect(HUB_TARGET);
    assert.equal(reopened.pairingOnly, true, '凭证被拒绝后按配对候选连接重开');
    assert.equal(fresh.getState().paired, false, '旧凭证被清除');
    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, SESSION_AGENT_ERROR_CODES.IDENTITY_REJECTED);
});

test('连接：教室身份不一致时拒绝，避免把命令发到错误的教室', async () => {
    const fakeHub = createFakeHub();
    const agent = createAgent(fakeHub);
    const error = await agent.connect({
        classroomId: 'classroom-other',
        address: '127.0.0.1',
        port: 41234
    }).then(() => null, (err) => err);
    assert.equal(error.code, SESSION_AGENT_ERROR_CODES.CLASSROOM_MISMATCH);
    assert.equal(agent.getState().connected, false);
});

test('连接：握手阶段 identity-rejected / protocol-rejected 变成类型化错误，不泄漏 socket 对象', async () => {
    const rejected = createFakeHub({ handshakeFailure: 'identity-rejected' });
    const agent = createAgent(rejected);
    const error = await agent.connect(HUB_TARGET).then(() => null, (err) => err);
    assert.equal(error.code, SESSION_AGENT_ERROR_CODES.IDENTITY_REJECTED);
    assert.equal(JSON.stringify(error).includes('fake-'), false);
    assert.equal(error.details.code, 'host_auth_failed');

    const badProtocol = createFakeHub({ handshakeFailure: 'protocol-rejected' });
    const second = createAgent(badProtocol);
    const secondError = await second.connect(HUB_TARGET).then(() => null, (err) => err);
    assert.equal(secondError.code, SESSION_AGENT_ERROR_CODES.PROTOCOL_REJECTED);
});

test('事件监听器异常不影响课堂流程，也不会递归触发 error 监听器', async () => {
    const fakeHub = createFakeHub();
    const { agent } = await pairAgent(fakeHub);
    const errors = [];
    agent.on('snapshot', () => { throw new Error('UI 渲染失败'); });
    agent.on('error', (error) => errors.push(error));
    fakeHub.broadcast('classroom:snapshot', { ...fakeHub.snapshot(), revision: fakeHub.state.revision + 1 });
    await sleep(5);
    assert.equal(errors.length, 0, '监听器异常只记日志，不变成 error 事件');
    assert.match(fakeHub.logger.text(), /监听器异常/);
    assert.equal(agent.getState().status !== 'closed', true);
});
