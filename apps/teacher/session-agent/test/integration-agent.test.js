// 集成测试：教师端会话代理 ↔ **真实**教室 Hub。
//
// 与单元测试的分工：单元测试用假 socket / 假 Hub 验证代理自己的决策与错误处理；
// 这里只有**发现传输**是注入的（绝不起组播），其余全部是真的：
//   真实 Express + 真实 Socket.IO + 真实 course-format + 真实 HTTP 引导凭证。
// 覆盖两种模式：
//   中继模式（教室固定机）——发现 → 配对 → 授课租约 → 上传发布课件 → 课堂命令 → 提交落盘 → 结束会话；
//   直接模式（教师电脑本机 Hub）——host token 直连、命令落在契约声明的旧事件名上。
//
// 这也是三端集成"教师端 ↔ Hub"这一段的第一次实测；学生端仍用真实 socket.io-client
// 与真实 /api/session/bootstrap，不走教师服务的旧页面。

const test = require('node:test');
const assert = require('node:assert/strict');

const { RELAY_STATES } = require('@lumesync/classroom-protocol');

const { createSessionAgent, SESSION_AGENT_ERROR_CODES } = require('..');
const {
    createFakeDiscoveryTransport,
    startTestHub,
    readScreenCode,
    connectViewer,
    relayRecord,
    writeCourseFile,
    makeTempDir,
    sleep
} = require('./helpers');

const DEVICE_KEY = 'teacher-laptop-0001';
const TIMEOUT_MS = 8000;

/** 等待代理的一条业务事件；带超时，避免用例在失败时挂死。 */
function waitForEvent(agent, event, { timeoutMs = 4000, predicate = null } = {}) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            off();
            reject(new Error(`等待 ${event} 事件超时`));
        }, timeoutMs);
        const off = agent.on(event, (payload) => {
            if (predicate && !predicate(payload)) return;
            clearTimeout(timer);
            off();
            resolve(payload);
        });
    });
}

/** 教师端侧的浏览传输：browse 时返回指向本机 Hub 的发现记录（生产是 bonjour-service）。 */
function createAgentBrowserTransport(getText) {
    const calls = [];
    return {
        calls,
        async browse(options) {
            calls.push({ type: 'browse', options });
            return [relayRecord(getText())];
        },
        async destroy() {
            calls.push({ type: 'destroy' });
        }
    };
}

test('中继模式闭环：发现 → 配对 → 租约 → 上传发布课件 → 课堂命令 → 提交落盘 → 结束会话', async (t) => {
    const hubTransport = createFakeDiscoveryTransport();
    let hub = null;
    const agentTransport = createAgentBrowserTransport(() => ({
        id: hub.config.classroomId,
        name: hub.config.classroomName,
        label: '空闲',
        state: 'free',
        port: hub.port,
        addresses: ['127.0.0.1']
    }));

    hub = await startTestHub({
        mode: 'relay',
        classroomName: '集成测试教室',
        discoveryTransport: hubTransport
    });
    t.after(() => hub.stop());

    const workDir = await makeTempDir();
    const agent = createSessionAgent({
        mode: 'relay',
        deviceKey: DEVICE_KEY,
        deviceName: '教师笔记本',
        classroomsDir: workDir,
        discoveryTransport: agentTransport,
        requestTimeoutMs: TIMEOUT_MS,
        connectTimeoutMs: TIMEOUT_MS
    });
    t.after(() => agent.endSession());

    const statuses = [];
    const pairingKinds = [];
    agent.on('status', (payload) => statuses.push(payload.status));
    agent.on('pairing', (payload) => pairingKinds.push(payload.kind));

    // --- 1) 发现：按协议主版本合并出可连接教室，并落盘登记表（搜索不到时可手动连接）
    const classrooms = await agent.discover({ timeoutMs: 50 });
    assert.equal(classrooms.length, 1);
    assert.equal(classrooms[0].classroomId, hub.config.classroomId);
    assert.equal(classrooms[0].name, '集成测试教室');
    assert.equal(classrooms[0].address, '127.0.0.1');
    assert.equal(classrooms[0].port, hub.port);
    assert.equal(classrooms[0].online, true);
    assert.equal(agentTransport.calls.filter((call) => call.type === 'browse').length, 1);

    const known = await agent.listKnownClassrooms();
    assert.equal(known.length, 1);
    assert.equal(known[0].classroomId, hub.config.classroomId);

    // --- 2) 连接：没有设备凭证时固定机只给配对候选连接
    const connected = await agent.connect({
        classroomId: classrooms[0].classroomId,
        address: classrooms[0].address,
        port: classrooms[0].port
    });
    assert.equal(connected.pairingOnly, true);
    assert.equal(connected.classroomId, hub.config.classroomId);
    assert.equal(agent.getState().paired, false);
    assert.ok(statuses.includes('pairing-required'));

    // --- 3) 配对：代理只建请求，验证码由教师在固定机屏幕上读取后回填
    const request = await agent.requestPairing();
    assert.match(request.requestId, /^pair-/);
    assert.match(request.nonce, /^[0-9a-f]{32}$/);
    assert.ok(request.expiresAt > Date.now());
    const code = await readScreenCode(hub);
    assert.match(code, /^\d{8}$/);

    const paired = await agent.submitPairingCode(code);
    assert.equal(paired.paired, true);
    assert.equal(agent.getState().paired, true);
    assert.equal(agent.getState().pairingOnly, false, '配对候选连接必须换成带凭证的连接');
    assert.equal(agent.getState().sessionId, hub.classroom.getSessionId(), '换成凭证连接后拿到权威快照');
    assert.equal(agent.getState().revision, hub.classroom.getRevision());
    assert.equal(hub.relay.status().pairedDevices, 1);
    assert.deepEqual(pairingKinds, ['challenged', 'accepted', 'reconnected']);
    // 硬性约束：验证码不进入代理状态
    assert.equal(JSON.stringify(agent.getState()).includes(code), false);

    // --- 4) 授课租约：唯一持有者，epoch 来自 Hub
    const lease = await agent.acquireLease();
    assert.equal(lease.epoch, 1);
    assert.equal(agent.getState().lease.epoch, 1);
    assert.equal(hub.relay.describeLease().lease.epoch, 1);
    assert.equal(hub.relay.describeLease().state, RELAY_STATES.TEACHING);
    assert.equal(hub.relay.getState(), RELAY_STATES.TEACHING);

    // 教室的发现报文应该反映"授课中"，让别的老师看到这间教室被占用
    await sleep(50);
    const published = hubTransport.lastRecord();
    assert.ok(published, 'Hub 应已发布发现报文');
    assert.equal(published.port, hub.port);
    assert.equal(published.txt.state, 'busy');

    // --- 5) 课件：真实 .lume 上传 + 真实 hash 校验 + course:publish 切课
    const course = await writeCourseFile({ dir: workDir, id: 'lesson-int-1', title: '集成测试课件' });
    const publishedCourse = await agent.publishCourse({ courseId: 'lesson-int-1', filePath: course.filePath });
    assert.match(publishedCourse.courseHash, /^sha256:[0-9a-f]{64}$/);
    assert.equal(publishedCourse.sizeBytes, course.bytes);
    assert.equal(hub.classroom.getCourseId(), 'lesson-int-1');
    assert.equal(agent.getState().courseId, 'lesson-int-1');

    // --- 6) 学生接入后，课堂命令经 Hub 广播给学生
    const viewer = await connectViewer(hub, 'student-int-1');
    t.after(() => viewer.close());

    const changedPromise = viewer.waitFor('course-changed');
    const snapshotPromise = viewer.waitFor('classroom:snapshot');
    const selected = await agent.selectCourse('lesson-int-1');
    assert.equal(selected.ok, true);
    assert.equal(hub.classroom.getCourseId(), 'lesson-int-1');
    const changed = await changedPromise;
    assert.equal(changed.courseId, 'lesson-int-1');
    const snapshot = await snapshotPromise;
    assert.equal(snapshot.currentCourseId, 'lesson-int-1');

    const slidePromise = viewer.waitFor('sync-slide');
    await agent.setSlide(2);
    const slide = await slidePromise;
    assert.equal(slide.slideIndex, 2);
    assert.equal(hub.classroom.getSlideIndex(), 2);

    await agent.updateSettings({ syncFollow: false, monitorEnabled: true });
    assert.equal(hub.classroom.getHostSettings().syncFollow, false);
    assert.equal(hub.classroom.getHostSettings().monitorEnabled, true);

    // --- 7) 提交：Hub 先入队（不是最终成功），教师确认落盘后学生才拿到成功
    const forwardedPromise = waitForEvent(agent, 'submission', { timeoutMs: TIMEOUT_MS });
    const queued = await viewer.emitWithAck('student:submit', {
        submissionId: 'sub-int-1',
        courseId: 'lesson-int-1',
        fileName: 'homework.zip',
        content: 'base64-encoded-homework',
        mergeFile: false
    }, TIMEOUT_MS);
    assert.equal(queued.ok, true);
    assert.equal(queued.status, 'queued');

    const forwarded = await forwardedPromise;
    assert.equal(forwarded.submissionId, 'sub-int-1');
    assert.equal(forwarded.fileName, 'homework.zip');
    assert.equal(forwarded.clientId, 'student-int-1');
    assert.equal(agent.getState().pendingSubmissions, 1);
    assert.equal(viewer.seen('student:submit:result'), false, '未确认落盘前不能给学生最终成功');

    const resultPromise = viewer.waitFor('student:submit:result');
    const delivered = await agent.ackSubmission('sub-int-1');
    assert.equal(delivered.delivered, true);
    assert.equal(agent.getState().pendingSubmissions, 0);
    const finalResult = await resultPromise;
    assert.equal(finalResult.submissionId, 'sub-int-1');
    assert.equal(finalResult.success, true);

    // --- 8) 结束授课：释放租约、作废设备凭证、固定机回到空闲
    const ended = await agent.endSession();
    assert.equal(ended.released, true);
    assert.equal(ended.epoch, 1);
    assert.equal(ended.pendingSubmissions, 0);
    assert.equal(ended.releaseError, null);
    assert.equal(hub.relay.getState(), RELAY_STATES.IDLE);
    assert.equal(hub.relay.status().pairedDevices, 0, '每次授课一次验证码授权：释放即作废凭证');
    assert.equal(agent.getState().closed, true);

    // 关闭后所有入口都拒绝
    await assert.rejects(
        () => agent.sendCommand('course:end', {}),
        (error) => error.code === SESSION_AGENT_ERROR_CODES.CLOSED
    );
});

test('中继模式：配对候选连接拿不到租约，直接发命令也被拒', async (t) => {
    let hub = null;
    const agentTransport = createAgentBrowserTransport(() => ({
        id: hub.config.classroomId,
        name: hub.config.classroomName,
        port: hub.port,
        addresses: ['127.0.0.1']
    }));
    hub = await startTestHub({ mode: 'relay', discoveryTransport: createFakeDiscoveryTransport() });
    t.after(() => hub.stop());

    const agent = createSessionAgent({
        mode: 'relay',
        deviceKey: DEVICE_KEY,
        discoveryTransport: agentTransport,
        requestTimeoutMs: TIMEOUT_MS
    });
    t.after(() => agent.endSession());

    await agent.connect({ address: '127.0.0.1', port: hub.port });

    const notPaired = await agent.acquireLease().then(() => null, (error) => error);
    assert.equal(notPaired.code, SESSION_AGENT_ERROR_CODES.NOT_PAIRED);

    const noLease = await agent.selectCourse('lesson-x').then(() => null, (error) => error);
    assert.equal(noLease.code, 'lease_not_held');
    assert.equal(hub.classroom.getCourseId(), null, 'Hub 侧课堂状态没有被改动');
});

test('中继模式：错误验证码从真实 Hub 拿到 attemptsLeft 递减，第 5 次锁定', async (t) => {
    let hub = null;
    const agentTransport = createAgentBrowserTransport(() => ({
        id: hub.config.classroomId,
        name: hub.config.classroomName,
        port: hub.port,
        addresses: ['127.0.0.1']
    }));
    hub = await startTestHub({ mode: 'relay', discoveryTransport: createFakeDiscoveryTransport() });
    t.after(() => hub.stop());

    const agent = createSessionAgent({
        mode: 'relay',
        deviceKey: DEVICE_KEY,
        discoveryTransport: agentTransport,
        requestTimeoutMs: TIMEOUT_MS
    });
    t.after(() => agent.endSession());

    await agent.connect({ address: '127.0.0.1', port: hub.port });
    await agent.requestPairing();
    const realCode = await readScreenCode(hub);
    const wrong = realCode === '00000000' ? '00000001' : '00000000';

    for (let attempt = 1; attempt <= 4; attempt += 1) {
        const error = await agent.submitPairingCode(wrong).then(() => null, (err) => err);
        assert.equal(error.attemptsLeft, 5 - attempt, `第 ${attempt} 次失败后剩余 ${5 - attempt} 次`);
    }
    const locked = await agent.submitPairingCode(wrong).then(() => null, (err) => err);
    assert.equal(locked.attemptsLeft, 0);
    assert.equal(agent.getState().pairing, null, '次数用尽后本地必须重新发起配对');
    assert.equal(agent.getState().paired, false);

    // 重新发起后屏幕会给新的验证码，配对仍可成功
    await agent.requestPairing();
    const newCode = await readScreenCode(hub);
    const paired = await agent.submitPairingCode(newCode);
    assert.equal(paired.paired, true);
});

test('直接模式：host token 直连本机 Hub，命令落在契约声明的旧事件名上', async (t) => {
    const hub = await startTestHub({ mode: 'direct' });
    t.after(() => hub.stop());
    const workDir = await makeTempDir();

    const agent = createSessionAgent({
        mode: 'direct',
        deviceKey: DEVICE_KEY,
        hubUrl: `http://127.0.0.1:${hub.port}`,
        hostToken: hub.config.hostToken,
        classroomsDir: workDir,
        requestTimeoutMs: TIMEOUT_MS
    });
    t.after(() => agent.endSession());

    const connected = await agent.connect();
    assert.equal(connected.pairingOnly, false);
    assert.equal(connected.role, 'host');
    assert.equal(connected.revision, hub.classroom.getRevision());

    const selected = await agent.selectCourse('lesson-direct-1');
    assert.equal(selected.ok, true);
    assert.equal(selected.event, 'select-course', '直接模式必须用契约已声明的旧事件名');
    assert.equal(hub.classroom.getCourseId(), 'lesson-direct-1');

    await agent.setSlide(4);
    assert.equal(hub.classroom.getSlideIndex(), 4);

    await agent.updateSettings({ syncFollow: false, renderScale: 1.25, 无关字段: true });
    assert.equal(hub.classroom.getHostSettings().syncFollow, false);
    assert.equal(hub.classroom.getHostSettings().renderScale, 1.25);

    // 直接模式没有 annotation:clear 的对应事件：明确报错，不静默丢弃
    const unsupported = await agent.sendCommand('annotation:clear', {}).then(() => null, (error) => error);
    assert.equal(unsupported.code, SESSION_AGENT_ERROR_CODES.MODE_UNSUPPORTED);

    // discover 只在教室中继模式可用
    const discovery = await agent.discover().then(() => null, (error) => error);
    assert.equal(discovery.code, SESSION_AGENT_ERROR_CODES.MODE_UNSUPPORTED);

    await agent.endCourse();
    assert.equal(hub.classroom.getCourseId(), null);
    assert.equal(hub.classroom.getSlideIndex(), 0);
    assert.equal(agent.getState().courseId, null);

    const ended = await agent.endSession();
    assert.equal(ended.released, false, '直接模式没有中继租约');
    assert.equal(agent.getState().closed, true);
});
