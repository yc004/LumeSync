// 提交转发：先入队、教师确认落盘后才给学生最终成功，队列满时必须明确拒绝。
//
// 设计约束（teacher-cross-platform-relay.md §4）：
//   - 「中继已接收」与「教师电脑已保存」必须区分；
//   - 队列有容量上限，满时明确拒绝（queue_full），不能静默丢弃；
//   - submission:delivered 之后才释放副本并回最终成功。

const test = require('node:test');
const assert = require('node:assert/strict');

const { ERROR_CODES } = require('@lumesync/classroom-protocol');
const {
    bootstrapViewer,
    connect,
    connectHost,
    hostAuth,
    pairTeacher,
    startTeachingSession,
    startTestHub,
    viewerAuth
} = require('./helpers');

test('学生提交先入队并转发给教师，最终成功要等教师确认落盘', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    const session = await startTeachingSession(hub, { deviceKey: 'device-submit-1' });
    t.after(() => session.client.close());

    const studentSession = await bootstrapViewer(hub, 'student-submit-1');
    const student = connect(hub.port, viewerAuth(studentSession));
    t.after(() => student.close());
    await student.waitForAccepted();

    const accepted = await student.emitWithAck('student:submit', {
        submissionId: 'sub-1',
        courseId: 'lesson-submit',
        fileName: 'answer.txt',
        content: '答案 A'
    });
    assert.equal(accepted.ok, true);
    assert.equal(accepted.status, 'queued');
    assert.equal(accepted.queueSize, 1);
    assert.equal(accepted.success, undefined, '入队回执不能带最终成功标记');

    const forwarded = await session.client.waitFor('submission:forwarded');
    assert.equal(forwarded.submissionId, 'sub-1');
    assert.equal(forwarded.courseId, 'lesson-submit');
    assert.equal(forwarded.content, '答案 A');
    assert.equal(forwarded.clientId, 'student-submit-1');
    assert.equal(typeof forwarded.receivedAt, 'number');

    assert.equal(hub.submissions.stats().pendingCount, 1);
    assert.equal(student.seen('student:submit:result'), false, '尚未落盘时不能先给最终成功');

    const delivered = await session.client.emitWithAck('submission:delivered', { submissionId: 'sub-1' });
    assert.equal(delivered.ok, true);
    assert.equal(delivered.pendingCount, 0);

    const finalResult = await student.waitFor('student:submit:result');
    assert.equal(finalResult.submissionId, 'sub-1');
    assert.equal(finalResult.success, true);
    assert.equal(hub.submissions.stats().pendingCount, 0);
    assert.equal(hub.relay.getQueue().get('sub-1'), null, '确认落盘后释放队列副本');
});

test('队列满时明确拒绝（queue_full），不静默丢弃', async (t) => {
    const hub = await startTestHub({ mode: 'relay', queueCapacity: 1 });
    t.after(() => hub.stop());

    const session = await startTeachingSession(hub, { deviceKey: 'device-submit-2' });
    t.after(() => session.client.close());

    const first = connect(hub.port, viewerAuth(await bootstrapViewer(hub, 'student-a')));
    const second = connect(hub.port, viewerAuth(await bootstrapViewer(hub, 'student-b')));
    t.after(() => { first.close(); second.close(); });
    await first.waitForAccepted();
    await second.waitForAccepted();

    const ok = await first.emitWithAck('student:submit', { submissionId: 'sub-full-1', content: 'x' });
    assert.equal(ok.ok, true);
    const forwarded = await session.client.waitFor('submission:forwarded');
    assert.equal(forwarded.submissionId, 'sub-full-1');

    const rejected = await second.emitWithAck('student:submit', { submissionId: 'sub-full-2', content: 'y' });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.code, ERROR_CODES.QUEUE_FULL);
    assert.equal(rejected.success, false);
    assert.equal(rejected.capacity, 1);
    assert.equal(rejected.size, 1);

    // 学生同时收到一条明确的结果事件（不是超时或静默丢弃）
    const resultEvent = await second.waitFor('student:submit:result');
    assert.equal(resultEvent.code, ERROR_CODES.QUEUE_FULL);
    assert.equal(resultEvent.success, false);

    // 队列里只有第一条，第二条既没入队也没转发
    assert.equal(hub.submissions.stats().pendingCount, 1);
    assert.equal(session.client.seen('submission:forwarded'), false);
});

test('重复 submissionId 幂等入队并重新转发', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    const session = await startTeachingSession(hub, { deviceKey: 'device-submit-3' });
    t.after(() => session.client.close());
    const student = connect(hub.port, viewerAuth(await bootstrapViewer(hub, 'student-dup')));
    t.after(() => student.close());
    await student.waitForAccepted();

    const first = await student.emitWithAck('student:submit', { submissionId: 'sub-dup', content: 'v1' });
    assert.equal(first.ok, true);
    assert.equal(first.duplicate, false);
    await session.client.waitFor('submission:forwarded');

    const second = await student.emitWithAck('student:submit', { submissionId: 'sub-dup', content: 'v1' });
    assert.equal(second.ok, true);
    assert.equal(second.duplicate, true);
    assert.equal(second.queueSize, 1, '重复投递不占新容量');

    // 仍会再转发一次：教师电脑可能刚刚才上线，教师侧以 submissionId 去重
    const forwardedAgain = await session.client.waitFor('submission:forwarded');
    assert.equal(forwardedAgain.submissionId, 'sub-dup');
    assert.equal(hub.submissions.stats().pendingCount, 1);
});

test('对未知 submissionId 的落盘回执被拒绝', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    const session = await startTeachingSession(hub, { deviceKey: 'device-submit-4' });
    t.after(() => session.client.close());

    const unknown = await session.client.emitWithAck('submission:delivered', { submissionId: 'sub-never' });
    assert.equal(unknown.ok, false);
    assert.equal(unknown.code, ERROR_CODES.QUEUE_ITEM_UNKNOWN);
});

test('教师离线时提交仍留在队列（不虚报成功），重新上线后可再次领取', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    const paired = await pairTeacher(hub, { deviceKey: 'device-submit-5' });
    const { client: host, accepted } = await connectHost(hub, paired.verified.deviceToken, 'device-submit-5');
    const lease = await host.emitWithAck('teacher:lease.acquire', {});
    assert.equal(lease.ok, true);

    const student = connect(hub.port, viewerAuth(await bootstrapViewer(hub, 'student-offline')));
    t.after(() => student.close());
    await student.waitForAccepted();

    host.close();   // 教师电脑断线，租约按 TTL 保留
    await new Promise((resolve) => setTimeout(resolve, 50));

    const queued = await student.emitWithAck('student:submit', { submissionId: 'sub-offline', content: 'z' });
    assert.equal(queued.ok, true);
    assert.equal(queued.status, 'queued');
    assert.equal(hub.submissions.stats().pendingCount, 1);
    assert.equal(student.seen('student:submit:result'), false, '教师离线时不能显示为已收取');

    const reconnected = await connectHost(hub, paired.verified.deviceToken, 'device-submit-5');
    t.after(() => reconnected.client.close());
    const renewed = await reconnected.client.emitWithAck('teacher:lease.renew', {
        leaseId: lease.leaseId,
        epoch: lease.epoch
    });
    assert.equal(renewed.ok, true);
    const replayed = await reconnected.client.waitFor('submission:forwarded');
    assert.equal(replayed.submissionId, 'sub-offline');
    assert.equal(replayed.replayed, true);
    const list = hub.relay.getQueue().list({ status: 'pending' });
    assert.equal(list.length, 1);
    assert.equal(list[0].submissionId, 'sub-offline');
    assert.ok(accepted.sessionId);

    const delivered = await reconnected.client.emitWithAck('submission:delivered', { submissionId: 'sub-offline' });
    assert.equal(delivered.ok, true);
    const result = await student.waitFor('student:submit:result');
    assert.equal(result.success, true);
});

test('已配对但未持有租约的教师不能接收学生提交或确认落盘', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    const paired = await pairTeacher(hub, { deviceKey: 'device-no-lease' });
    const { client: host } = await connectHost(hub, paired.verified.deviceToken, 'device-no-lease');
    t.after(() => host.close());
    const student = connect(hub.port, viewerAuth(await bootstrapViewer(hub, 'student-no-lease')));
    t.after(() => student.close());
    await student.waitForAccepted();

    const queued = await student.emitWithAck('student:submit', { submissionId: 'sub-no-lease', content: 'private' });
    assert.equal(queued.ok, true);
    assert.equal(host.seen('submission:forwarded'), false);
    const alert = await student.emitWithAck('student-alert', { type: 'fullscreen-exit' });
    assert.equal(alert.ok, true);
    assert.equal(host.seen('student-alert'), false, '普通学生事件也不能发给无租约连接');

    const rejected = await host.emitWithAck('submission:delivered', { submissionId: 'sub-no-lease' });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.code, ERROR_CODES.LEASE_EXPIRED);
    assert.equal(hub.submissions.stats().pendingCount, 1);

    const lease = await host.emitWithAck('teacher:lease.acquire', {});
    assert.equal(lease.ok, true);
    const replayed = await host.waitFor('submission:forwarded');
    assert.equal(replayed.submissionId, 'sub-no-lease');
    assert.equal(replayed.replayed, true);
    await student.emitWithAck('student-alert', { type: 'tab-hidden' });
    const forwardedAlert = await host.waitFor('student-alert');
    assert.equal(forwardedAlert.type, 'tab-hidden');
});

test('直接模式：兼容旧事件名 student:submit / student:submit:ack', async (t) => {
    const hub = await startTestHub({ mode: 'direct' });
    t.after(() => hub.stop());

    const host = connect(hub.port, hostAuth(hub));
    t.after(() => host.close());
    await host.waitForAccepted();
    const student = connect(hub.port, viewerAuth(await bootstrapViewer(hub, 'student-direct-submit')));
    t.after(() => student.close());
    await student.waitForAccepted();

    const ack = await student.emitWithAck('student:submit', { submissionId: 'sub-direct', content: 'd' });
    assert.equal(ack.ok, true);
    assert.equal(ack.status, 'queued');

    // 旧事件名与新事件名都发给教师，教师侧以 submissionId 去重
    const legacy = await host.waitFor('student:submit');
    assert.equal(legacy.submissionId, 'sub-direct');
    const forwarded = await host.waitFor('submission:forwarded');
    assert.equal(forwarded.submissionId, 'sub-direct');

    const delivered = await host.emitWithAck('student:submit:ack', { submissionId: 'sub-direct', success: true });
    assert.equal(delivered.ok, true);
    const result = await student.waitFor('student:submit:result');
    assert.equal(result.submissionId, 'sub-direct');
    assert.equal(result.success, true);
});
