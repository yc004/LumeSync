// 课堂协议接入的端到端测试：真实 Socket.IO 服务 + 真实客户端。
//
// 覆盖点：版本协商（含 legacy 与拒绝分支）、session:accepted、快照 revision、
// 角色越权拒绝、payload 校验拒绝。这些是"共享契约真的接上了"的证据，
// 而不是只测契约包自身的纯函数。

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const { Server } = require('socket.io');
const { io: createClient } = require('socket.io-client');

process.env.LUMESYNC_HOST_TOKEN = `test-host-${crypto.randomBytes(24).toString('hex')}`;
process.env.LUMESYNC_VIEWER_TOKEN_SECRET = `test-viewer-${crypto.randomBytes(24).toString('hex')}`;

const runtime = require('../src/socket');
const classroomState = require('../src/classroom-state');
const protocol = require('../src/protocol');
const { loadCoreModule } = require('../src/core-paths');

const { createViewerSessionToken } = loadCoreModule('identity');

function startTestServer() {
    const server = http.createServer();
    const io = new Server(server, { pingInterval: 5000, pingTimeout: 8000 });

    runtime.setupSocketHandlers(io, {
        setCurrentCourseId: (courseId) => classroomState.changeCourse(courseId),
        setCurrentSlideIndex: (slideIndex) => classroomState.changeSlide(slideIndex),
        getCurrentCourseId: () => classroomState.getCourseId(),
        getCurrentSlideIndex: () => classroomState.getSlideIndex(),
        getCourseCatalog: () => ({ courses: [], folders: [] }),
        ensureCourseDependenciesCached: null
    });

    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            resolve({ server, io, port: server.address().port });
        });
    });
}

function stopTestServer({ server, io }) {
    return new Promise((resolve) => {
        io.close(() => server.close(() => resolve()));
    });
}

function viewerAuth(clientId = 'student-1') {
    return {
        role: 'viewer',
        clientId,
        token: createViewerSessionToken({
            clientId,
            secret: process.env.LUMESYNC_VIEWER_TOKEN_SECRET,
            ttlSec: 300
        })
    };
}

function hostAuth(clientId = 'teacher-1') {
    return { role: 'host', clientId, token: process.env.LUMESYNC_HOST_TOKEN };
}

function connect(port, auth) {
    const socket = createClient(`http://127.0.0.1:${port}`, {
        auth,
        transports: ['websocket'],
        reconnection: false,
        forceNew: true
    });

    // 服务端在握手后紧接着推送快照，监听器必须从连接那一刻就开始记录，
    // 否则会漏掉已经到达的事件。
    const received = [];
    const waiters = [];
    let disconnectReason = null;

    socket.onAny((event, payload) => {
        received.push({ event, payload });
        for (const waiter of waiters.slice()) {
            if (waiter.event !== event) continue;
            waiters.splice(waiters.indexOf(waiter), 1);
            clearTimeout(waiter.timer);
            waiter.resolve(payload);
        }
    });
    socket.on('disconnect', (reason) => { disconnectReason = reason; });

    return {
        socket,
        connectError: new Promise((resolve) => socket.on('connect_error', resolve)),
        waitFor(event, timeoutMs = 4000) {
            // 每次消费一条匹配事件，便于连续等待同一事件的后续广播。
            const index = received.findIndex((entry) => entry.event === event);
            if (index >= 0) return Promise.resolve(received.splice(index, 1)[0].payload);
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
                waiters.push({ event, resolve, reject, timer });
            });
        },
        waitForDisconnect(timeoutMs = 4000) {
            if (disconnectReason) return Promise.resolve(disconnectReason);
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('timeout waiting for disconnect')), timeoutMs);
                socket.once('disconnect', (reason) => { clearTimeout(timer); resolve(reason); });
            });
        },
        emitWithAck(event, payload, timeoutMs = 4000) {
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error(`timeout waiting for ack of ${event}`)), timeoutMs);
                socket.emit(event, payload, (ack) => { clearTimeout(timer); resolve(ack); });
            });
        },
        close() { socket.close(); }
    };
}

test('viewer 握手成功后收到 session:accepted 与带 revision 的快照', async (t) => {
    const ctx = await startTestServer();
    t.after(() => stopTestServer(ctx));

    const client = connect(ctx.port, { ...viewerAuth('student-a'), protocolVersion: protocol.PROTOCOL_VERSION });
    t.after(() => client.close());
    const socket = client.socket;

    const accepted = await client.waitFor('session:accepted');
    assert.equal(accepted.protocolVersion, protocol.PROTOCOL_VERSION);
    assert.match(accepted.sessionId, /[0-9a-f-]{36}/);
    assert.equal(typeof accepted.revision, 'number');
    assert.equal(accepted.payload.role, 'viewer');
    assert.equal(accepted.payload.clientId, 'student-a');
    assert.equal(accepted.payload.legacy, false);

    const snapshot = await client.waitFor('classroom:snapshot');
    assert.equal(snapshot.protocolVersion, protocol.PROTOCOL_VERSION);
    assert.equal(snapshot.sessionId, accepted.sessionId);
    assert.ok(snapshot.revision >= accepted.revision);
});

test('不声明版本的旧客户端按 legacy 接受并被告知', async (t) => {
    const ctx = await startTestServer();
    t.after(() => stopTestServer(ctx));

    const client = connect(ctx.port, viewerAuth('student-legacy'));
    t.after(() => client.close());

    const accepted = await client.waitFor('session:accepted');
    assert.equal(accepted.payload.legacy, true);
    assert.equal(accepted.payload.clientVersion, 0);
    assert.equal(accepted.protocolVersion, protocol.PROTOCOL_VERSION);
});

test('版本过新的客户端收到 protocol-rejected 并被断开', async (t) => {
    const ctx = await startTestServer();
    t.after(() => stopTestServer(ctx));

    const client = connect(ctx.port, { ...viewerAuth('student-future'), protocolVersion: protocol.PROTOCOL_VERSION + 1 });
    t.after(() => client.close());

    const rejected = await client.waitFor('protocol-rejected');
    assert.equal(rejected.payload.code, 'protocol_version_unsupported');
    assert.equal(rejected.payload.protocolVersion, protocol.PROTOCOL_VERSION);

    const reason = await client.waitForDisconnect();
    assert.equal(reason, 'io server disconnect');
});

test('非法版本号同样被拒绝', async (t) => {
    const ctx = await startTestServer();
    t.after(() => stopTestServer(ctx));

    const client = connect(ctx.port, { ...viewerAuth('student-bad-version'), protocolVersion: 'v1' });
    t.after(() => client.close());

    const rejected = await client.waitFor('protocol-rejected');
    assert.equal(rejected.payload.code, 'protocol_version_invalid');
});

test('无凭证连接被 identity-rejected 拒绝', async (t) => {
    const ctx = await startTestServer();
    t.after(() => stopTestServer(ctx));

    const client = connect(ctx.port, { role: 'viewer', clientId: 'nobody', token: 'not-a-token' });
    t.after(() => client.close());

    const rejected = await client.waitFor('identity-rejected');
    assert.equal(rejected.code, 'viewer_auth_failed');
});

test('viewer 发送 host 专属命令会被契约拒绝且不改变课堂状态', async (t) => {
    const ctx = await startTestServer();
    t.after(() => stopTestServer(ctx));

    classroomState.changeCourse('lesson-before');
    const before = classroomState.getRevision();
    const client = connect(ctx.port, { ...viewerAuth('student-2'), protocolVersion: protocol.PROTOCOL_VERSION });
    t.after(() => client.close());
    await client.waitFor('session:accepted');

    const ack = await client.emitWithAck('sync-slide', { slideIndex: 7 });
    assert.equal(ack.ok, false);
    assert.equal(ack.code, 'event_forbidden');
    assert.equal(classroomState.getSlideIndex(), 0);
    assert.equal(classroomState.getRevision(), before);

    const endAck = await client.emitWithAck('end-course', {});
    assert.equal(endAck.code, 'event_forbidden');
    assert.equal(classroomState.getCourseId(), 'lesson-before');
});

test('payload 不符合契约时被拒绝，并给出字段原因', async (t) => {
    const ctx = await startTestServer();
    t.after(() => stopTestServer(ctx));

    const client = connect(ctx.port, { ...hostAuth(), protocolVersion: protocol.PROTOCOL_VERSION });
    t.after(() => client.close());
    await client.waitFor('session:accepted');

    const missing = await client.emitWithAck('select-course', {});
    assert.equal(missing.ok, false);
    assert.equal(missing.code, 'event_payload_invalid');
    assert.match(missing.message, /courseId/);

    const negativeSlide = await client.emitWithAck('sync-slide', { slideIndex: -2 });
    assert.equal(negativeSlide.code, 'event_payload_invalid');
});

test('host 的合法命令照常生效并广播新 revision', async (t) => {
    const ctx = await startTestServer();
    t.after(() => stopTestServer(ctx));

    // classroom-state 是进程内单例，测试之间显式重置，避免相互影响。
    classroomState.changeCourse(null);
    classroomState.changeSlide(0);
    const client = connect(ctx.port, { ...hostAuth(), protocolVersion: protocol.PROTOCOL_VERSION });
    t.after(() => client.close());
    await client.waitFor('session:accepted');

    // 连接时的快照还没有课程。
    const initial = await client.waitFor('classroom:snapshot');
    assert.equal(initial.currentCourseId, null);

    client.socket.emit('select-course', { courseId: 'lesson-after' });
    const payload = await client.waitFor('course-changed');

    assert.equal(payload.courseId, 'lesson-after');
    assert.equal(classroomState.getCourseId(), 'lesson-after');
    assert.equal(typeof payload.revision, 'number');

    // 重连/主动拉取时必须拿到权威状态，而不是依赖错过的广播。
    client.socket.emit('request-classroom-snapshot');
    const snapshot = await client.waitFor('classroom:snapshot');
    assert.equal(snapshot.currentCourseId, 'lesson-after');
    assert.equal(snapshot.currentSlideIndex, 0);
    assert.ok(snapshot.revision >= payload.revision);
});

test('未声明事件被拒绝（不会静默落到空处理器）', async (t) => {
    const ctx = await startTestServer();
    t.after(() => stopTestServer(ctx));

    const client = connect(ctx.port, { ...hostAuth(), protocolVersion: protocol.PROTOCOL_VERSION });
    t.after(() => client.close());
    await client.waitFor('session:accepted');

    const ack = await client.emitWithAck('definitely-not-an-event', {});
    assert.equal(ack.ok, false);
    assert.equal(ack.code, 'event_unknown');
});

test('/api/protocol 描述与契约包一致', () => {
    const described = protocol.describeProtocol();
    assert.equal(described.protocolVersion, protocol.PROTOCOL_VERSION);
    assert.deepEqual(described.supportedVersions, protocol.SUPPORTED_PROTOCOL_VERSIONS);
    const names = described.inboundEvents.map((entry) => entry.name);
    assert.ok(names.includes('session:hello'));
    assert.ok(names.includes('sync-slide'));
    assert.ok(names.includes('student:submit'));
    assert.equal(described.plannedRenames['select-course'], 'course:select');
});
