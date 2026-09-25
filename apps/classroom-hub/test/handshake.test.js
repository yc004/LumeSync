// Socket 握手：身份、协议协商、快照与契约守卫。
//
// 覆盖两种模式：
//   direct —— host token 直连 + viewer 凭证；与教师服务的握手语义一致。
//   relay  —— viewer 凭证可用；host 必须用配对签发的设备凭证；
//             没有凭证的连接只能是 pairing-only（不发快照、不在教师房间、只能发 teacher:pair.*）。

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    PROTOCOL_VERSION,
    ERROR_CODES,
    bootstrapViewer,
    connect,
    connectHost,
    fetchJson,
    hostAuth,
    pairTeacher,
    startTestHub,
    viewerAuth,
    startTeachingSession
} = require('./helpers');

test('直接模式：host 与 viewer 握手后都拿到 session:accepted 与快照', async (t) => {
    const hub = await startTestHub({ mode: 'direct' });
    t.after(() => hub.stop());

    const viewerSession = await bootstrapViewer(hub, 'student-a');
    const viewer = connect(hub.port, viewerAuth(viewerSession));
    t.after(() => viewer.close());
    const host = connect(hub.port, hostAuth(hub));
    t.after(() => host.close());

    const viewerAccepted = await viewer.waitForAccepted();
    assert.equal(viewerAccepted.protocolVersion, PROTOCOL_VERSION);
    assert.equal(viewerAccepted.payload.role, 'viewer');
    assert.equal(viewerAccepted.payload.clientId, 'student-a');
    assert.equal(viewerAccepted.payload.mode, 'direct');
    assert.equal(viewerAccepted.payload.legacy, false);
    assert.equal(viewerAccepted.classroomId, hub.config.classroomId);

    const viewerSnapshot = await viewer.waitFor('classroom:snapshot');
    assert.equal(viewerSnapshot.sessionId, viewerAccepted.sessionId);
    assert.equal(typeof viewerSnapshot.revision, 'number');
    assert.equal(viewerSnapshot.currentCourseId, null);

    const hostAccepted = await host.waitForAccepted();
    assert.equal(hostAccepted.payload.role, 'host');
    assert.equal(hostAccepted.sessionId, viewerAccepted.sessionId);

    // 学生上线事件只发给教师房间
    const status = await host.waitFor('student-status');
    assert.equal(typeof status.count, 'number');
});

test('legacy 客户端（不声明版本）被接受并被标记', async (t) => {
    const hub = await startTestHub({ mode: 'direct' });
    t.after(() => hub.stop());

    const session = await bootstrapViewer(hub, 'student-legacy');
    const client = connect(hub.port, { role: 'viewer', clientId: session.clientId, token: session.token });
    t.after(() => client.close());

    const accepted = await client.waitForAccepted();
    assert.equal(accepted.payload.legacy, true);
    assert.equal(accepted.payload.clientVersion, 0);
    assert.equal(accepted.protocolVersion, PROTOCOL_VERSION);
});

test('版本过新的客户端收到 protocol-rejected 并断开', async (t) => {
    const hub = await startTestHub({ mode: 'direct' });
    t.after(() => hub.stop());

    const session = await bootstrapViewer(hub, 'student-future');
    const client = connect(hub.port, viewerAuth(session, PROTOCOL_VERSION + 1));
    t.after(() => client.close());

    const rejected = await client.waitFor('protocol-rejected');
    assert.equal(rejected.payload.code, 'protocol_version_unsupported');
    assert.equal(rejected.payload.protocolVersion, PROTOCOL_VERSION);
    assert.equal(await client.waitForDisconnect(), 'io server disconnect');
});

test('凭证不正确时 identity-rejected 并断开', async (t) => {
    const hub = await startTestHub({ mode: 'direct' });
    t.after(() => hub.stop());

    const viewer = connect(hub.port, { role: 'viewer', clientId: 'nobody', token: 'not-a-token' });
    t.after(() => viewer.close());
    const viewerRejected = await viewer.waitFor('identity-rejected');
    assert.equal(viewerRejected.code, ERROR_CODES.VIEWER_AUTH_FAILED);

    const host = connect(hub.port, { role: 'host', clientId: 'nobody', token: 'wrong-host-token' });
    t.after(() => host.close());
    const hostRejected = await host.waitFor('identity-rejected');
    assert.equal(hostRejected.code, ERROR_CODES.HOST_AUTH_FAILED);
});

test('中继模式：没有凭证的 host 连接只能是 pairing-only，拿不到课堂快照', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    const client = connect(hub.port, { role: 'host', clientId: 'laptop-x', protocolVersion: PROTOCOL_VERSION });
    t.after(() => client.close());

    const accepted = await client.waitForAccepted();
    assert.equal(accepted.payload.pairingOnly, true);
    assert.equal(accepted.payload.mode, 'relay');

    // 配对专用连接不能拉快照，也不能发课堂命令
    const snapshotAck = await client.emitWithAck('request-classroom-snapshot');
    assert.equal(snapshotAck.ok, false);
    assert.equal(snapshotAck.code, ERROR_CODES.EVENT_UNKNOWN);
    assert.equal(client.seen('classroom:snapshot'), false);

    const commandAck = await client.emitWithAck('classroom:command', {
        type: 'slide:set',
        leaseId: 'lease-1-abcdefgh',
        epoch: 1,
        requestId: 'cmd-x',
        payload: { slideIndex: 5 }
    });
    assert.equal(commandAck.code, ERROR_CODES.EVENT_UNKNOWN);
    assert.equal(hub.classroom.getSlideIndex(), 0);
});

test('中继模式：host token 不再等于 host 权限；配对签发的设备凭证才可连', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    const withHostToken = connect(hub.port, hostAuth(hub));
    t.after(() => withHostToken.close());
    const rejected = await withHostToken.waitFor('identity-rejected');
    assert.equal(rejected.code, ERROR_CODES.HOST_AUTH_FAILED);

    const paired = await pairTeacher(hub, { deviceKey: 'device-handshake-1' });
    const host = connect(hub.port, {
        role: 'host',
        clientId: 'device-handshake-1',
        token: paired.verified.deviceToken,
        protocolVersion: PROTOCOL_VERSION
    });
    t.after(() => host.close());
    const accepted = await host.waitForAccepted();
    assert.equal(accepted.payload.role, 'host');
    assert.equal(accepted.payload.pairingOnly, false);
    assert.equal(accepted.payload.clientId, 'device-handshake-1');
    const snapshot = await host.waitFor('classroom:snapshot');
    assert.equal(snapshot.sessionId, accepted.sessionId);
});

test('中继模式的 viewer 握手与学生端一致', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    const session = await bootstrapViewer(hub, 'student-relay');
    const viewer = connect(hub.port, viewerAuth(session));
    t.after(() => viewer.close());
    const accepted = await viewer.waitForAccepted();
    assert.equal(accepted.payload.role, 'viewer');
    assert.equal(accepted.payload.mode, 'relay');
    await viewer.waitFor('classroom:snapshot');
});

test('viewer 发送 host 专属命令被契约拒绝，且课堂状态不变', async (t) => {
    const hub = await startTestHub({ mode: 'direct' });
    t.after(() => hub.stop());

    const session = await bootstrapViewer(hub, 'student-2');
    const viewer = connect(hub.port, viewerAuth(session));
    t.after(() => viewer.close());
    await viewer.waitForAccepted();

    const before = hub.classroom.getRevision();
    const ack = await viewer.emitWithAck('sync-slide', { slideIndex: 7 });
    assert.equal(ack.ok, false);
    assert.equal(ack.code, ERROR_CODES.EVENT_FORBIDDEN);
    assert.equal(hub.classroom.getSlideIndex(), 0);
    assert.equal(hub.classroom.getRevision(), before);

    const relayAck = await viewer.emitWithAck('teacher:lease.acquire', {});
    assert.equal(relayAck.code, ERROR_CODES.EVENT_FORBIDDEN);
});

test('payload 不符合契约时被拒绝并给出字段原因', async (t) => {
    const hub = await startTestHub({ mode: 'direct' });
    t.after(() => hub.stop());

    const host = connect(hub.port, hostAuth(hub));
    t.after(() => host.close());
    await host.waitForAccepted();

    const missing = await host.emitWithAck('select-course', {});
    assert.equal(missing.ok, false);
    assert.equal(missing.code, ERROR_CODES.EVENT_PAYLOAD_INVALID);
    assert.match(missing.message, /courseId/);

    const negativeSlide = await host.emitWithAck('sync-slide', { slideIndex: -2 });
    assert.equal(negativeSlide.code, ERROR_CODES.EVENT_PAYLOAD_INVALID);
});

test('未声明事件被拒绝（不会静默落到空处理器）', async (t) => {
    const hub = await startTestHub({ mode: 'direct' });
    t.after(() => hub.stop());

    const host = connect(hub.port, hostAuth(hub));
    t.after(() => host.close());
    await host.waitForAccepted();

    const ack = await host.emitWithAck('definitely-not-an-event', {});
    assert.equal(ack.ok, false);
    assert.equal(ack.code, ERROR_CODES.EVENT_UNKNOWN);
});

test('session:hello 可以重新拉取握手与权威快照', async (t) => {
    const hub = await startTestHub({ mode: 'direct' });
    t.after(() => hub.stop());

    const host = connect(hub.port, hostAuth(hub));
    t.after(() => host.close());
    await host.waitForAccepted();
    await host.waitFor('classroom:snapshot');   // 先消费连接时的快照
    hub.classroom.changeCourse('lesson-hello');

    host.socket.emit('session:hello');
    const accepted = await host.waitFor('session:accepted');
    const snapshot = await host.waitFor('classroom:snapshot');
    assert.equal(snapshot.currentCourseId, 'lesson-hello');
    assert.ok(snapshot.revision >= accepted.revision);
});

test('教师断开连接不会立即释放租约（等 TTL 过期）', async (t) => {
    let clock = 1_800_000_000_000;
    const hub = await startTestHub({ mode: 'relay', now: () => clock, leaseTtlMs: 60_000 });
    t.after(() => hub.stop());

    const session = await startTeachingSession(hub, { deviceKey: 'device-ttl-1' });
    session.client.close();
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 断线后租约仍在有效期内：课堂保持授课中，命令仍被接受
    const described = hub.relay.describeLease();
    assert.equal(described.state, 'teaching');
    const reconnected = await connectHost(hub, session.deviceToken, 'device-ttl-1');
    t.after(() => reconnected.client.close());
    const ack = await reconnected.client.emitWithAck('classroom:command', {
        type: 'slide:set',
        leaseId: session.lease.leaseId,
        epoch: session.lease.epoch,
        requestId: 'cmd-after-reconnect',
        payload: { slideIndex: 2 }
    });
    assert.equal(ack.ok, true);

    // 超过 TTL：租约过期，课堂回到等待教师，设备凭证同时失效
    clock += 61_000;
    const changes = hub.sweep();
    assert.equal(changes.some((change) => change.type === 'lease-expired'), true);
    assert.equal(hub.relay.describeLease().state, 'awaiting-teacher');
    const status = await fetchJson(hub, '/api/hub/status');
    assert.equal(status.body.lease.state, 'awaiting-teacher');
    assert.equal(status.body.pairedDevices, 0);

    const stale = connect(hub.port, { role: 'host', clientId: 'device-ttl-1', token: session.deviceToken, protocolVersion: PROTOCOL_VERSION });
    t.after(() => stale.close());
    const rejected = await stale.waitFor('identity-rejected');
    assert.equal(rejected.code, ERROR_CODES.HOST_AUTH_FAILED);
});
