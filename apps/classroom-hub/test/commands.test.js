// 类型化课堂命令（classroom:command）：Hub 是唯一写入者，只有持有租约的教师能改状态。
//
// 覆盖：命令 -> 广播 + revision 快照、viewer 收到对应事件、过期 epoch/非持有者不改状态、
// requestId 幂等去重、直接模式的旧事件名、中继模式拒绝旧事件名。

const test = require('node:test');
const assert = require('node:assert/strict');

const { ERROR_CODES } = require('@lumesync/classroom-protocol');
const {
    bootstrapViewer,
    connect,
    hostAuth,
    startTeachingSession,
    startTestHub,
    viewerAuth
} = require('./helpers');

async function command(client, lease, type, payload, requestId) {
    return client.emitWithAck('classroom:command', {
        type,
        leaseId: lease.leaseId,
        epoch: lease.epoch,
        requestId,
        payload
    });
}

test('slide:set 广播给 viewer 并递增 revision', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    const session = await startTeachingSession(hub, { deviceKey: 'device-cmd-1' });
    t.after(() => session.client.close());

    const studentSession = await bootstrapViewer(hub, 'student-cmd-1');
    const student = connect(hub.port, viewerAuth(studentSession));
    t.after(() => student.close());
    await student.waitForAccepted();
    const initial = await student.waitFor('classroom:snapshot');

    const ack = await command(session.client, session.lease, 'slide:set', { slideIndex: 4 }, 'cmd-slide-1');
    assert.equal(ack.ok, true);
    assert.equal(ack.type, 'slide:set');
    assert.equal(ack.revision, initial.revision + 1);

    const broadcast = await student.waitFor('sync-slide');
    assert.equal(broadcast.slideIndex, 4);
    assert.equal(broadcast.revision, ack.revision);

    const snapshot = await student.waitFor('classroom:snapshot');
    assert.equal(snapshot.currentSlideIndex, 4);
    assert.equal(snapshot.revision, ack.revision);
    assert.equal(hub.classroom.getSlideIndex(), 4);
});

test('course:select / settings:update / course:end 都走同一写入路径', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    const session = await startTeachingSession(hub, { deviceKey: 'device-cmd-2' });
    t.after(() => session.client.close());

    const selected = await command(session.client, session.lease, 'course:select', { courseId: 'lesson-cmd' }, 'cmd-course');
    assert.equal(selected.ok, true);
    const changed = await session.client.waitFor('course-changed');
    assert.equal(changed.courseId, 'lesson-cmd');
    assert.equal(changed.slideIndex, 0);
    assert.equal(hub.classroom.getCourseId(), 'lesson-cmd');

    const settings = await command(session.client, session.lease, 'settings:update', {
        syncFollow: false,
        monitorEnabled: true,
        monitorIntervalSec: 3.2,
        notASetting: 'ignored'
    }, 'cmd-settings');
    assert.equal(settings.ok, true);
    const settingsBroadcast = await session.client.waitFor('host-settings');
    assert.equal(settingsBroadcast.syncFollow, false);
    assert.equal(settingsBroadcast.monitorEnabled, true);
    assert.equal(settingsBroadcast.monitorIntervalSec, 3, '按教师服务同样的规则归一为 0.5 秒粒度');
    assert.equal(hub.classroom.getHostSettings().notASetting, undefined, '未在契约设置表里的字段被忽略');

    const ended = await command(session.client, session.lease, 'course:end', {}, 'cmd-end');
    assert.equal(ended.ok, true);
    const endedBroadcast = await session.client.waitFor('course-ended');
    assert.equal(endedBroadcast.revision, ended.revision);
    assert.equal(hub.classroom.getCourseId(), null);
    assert.equal(hub.classroom.getHostSettings().monitorEnabled, false);
});

test('过期 epoch 与错误 leaseId 的命令被拒绝且不改状态', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    const session = await startTeachingSession(hub, { deviceKey: 'device-cmd-3' });
    t.after(() => session.client.close());
    await command(session.client, session.lease, 'slide:set', { slideIndex: 1 }, 'cmd-first');
    const before = hub.classroom.getRevision();

    const stale = await command(session.client, { leaseId: session.lease.leaseId, epoch: session.lease.epoch + 1 }, 'slide:set', { slideIndex: 9 }, 'cmd-stale');
    assert.equal(stale.ok, false);
    assert.equal(stale.code, ERROR_CODES.LEASE_EPOCH_STALE);
    assert.equal(stale.revision, before);
    assert.equal(hub.classroom.getSlideIndex(), 1);
    assert.equal(hub.classroom.getRevision(), before);

    const foreign = await command(session.client, { leaseId: 'lease-7-someoneelse', epoch: session.lease.epoch }, 'slide:set', { slideIndex: 9 }, 'cmd-foreign');
    assert.equal(foreign.ok, false);
    assert.equal(foreign.code, ERROR_CODES.LEASE_NOT_HELD);
    assert.equal(hub.classroom.getSlideIndex(), 1);

    // 契约守卫在进入处理器之前就按 enum 拒绝未知命令类型（Hub 控制器里还有一层防御）
    const badType = await command(session.client, session.lease, 'course:explode', {}, 'cmd-bad-type');
    assert.equal(badType.ok, false);
    assert.equal(badType.code, ERROR_CODES.EVENT_PAYLOAD_INVALID);
    assert.match(badType.message, /type/);

    const badPayload = await command(session.client, session.lease, 'slide:set', { slideIndex: -1 }, 'cmd-bad-payload');
    assert.equal(badPayload.ok, false);
    assert.equal(badPayload.code, ERROR_CODES.REQUEST_INVALID);
    assert.equal(hub.classroom.getRevision(), before);
});

test('同一 requestId 的命令只应用一次（幂等去重）', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    const session = await startTeachingSession(hub, { deviceKey: 'device-cmd-4' });
    t.after(() => session.client.close());

    const first = await command(session.client, session.lease, 'slide:set', { slideIndex: 3 }, 'cmd-idem');
    assert.equal(first.ok, true);
    const revisionAfterFirst = hub.classroom.getRevision();

    const second = await command(session.client, session.lease, 'slide:set', { slideIndex: 8 }, 'cmd-idem');
    assert.equal(second.ok, true);
    assert.equal(second.duplicate, true);
    assert.equal(second.revision, first.revision);
    assert.equal(hub.classroom.getSlideIndex(), 3);
    assert.equal(hub.classroom.getRevision(), revisionAfterFirst);
});

test('配对但未取得租约的连接不能控制课堂', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    const session = await startTeachingSession(hub, { deviceKey: 'device-cmd-5' });
    t.after(() => session.client.close());

    // 第二位教师的设备（授课中无法配对，这里用未配对连接验证守卫）
    const intruder = connect(hub.port, { role: 'host', clientId: 'intruder' });
    t.after(() => intruder.close());
    await intruder.waitForAccepted();
    const ack = await intruder.emitWithAck('classroom:command', {
        type: 'slide:set',
        leaseId: session.lease.leaseId,
        epoch: session.lease.epoch,
        requestId: 'cmd-intruder',
        payload: { slideIndex: 6 }
    });
    assert.equal(ack.ok, false);
    assert.equal(ack.code, ERROR_CODES.EVENT_UNKNOWN, '配对候选连接只能发 teacher:pair.*');
    assert.equal(hub.classroom.getSlideIndex(), 0);
});

test('直接模式：旧事件名（select-course / sync-slide / end-course）直接生效', async (t) => {
    const hub = await startTestHub({ mode: 'direct' });
    t.after(() => hub.stop());

    const host = connect(hub.port, hostAuth(hub));
    t.after(() => host.close());
    await host.waitForAccepted();
    await host.waitFor('classroom:snapshot');

    const studentSession = await bootstrapViewer(hub, 'student-direct');
    const student = connect(hub.port, viewerAuth(studentSession));
    t.after(() => student.close());
    await student.waitForAccepted();

    host.socket.emit('select-course', { courseId: 'lesson-direct' });
    const changed = await student.waitFor('course-changed');
    assert.equal(changed.courseId, 'lesson-direct');

    const slideAck = await host.emitWithAck('sync-slide', { slideIndex: 2 });
    assert.equal(slideAck.ok, true);
    assert.equal(slideAck.type, 'slide:set');
    const slide = await student.waitFor('sync-slide');
    assert.equal(slide.slideIndex, 2);

    const endAck = await host.emitWithAck('end-course', {});
    assert.equal(endAck.ok, true);
    await student.waitFor('course-ended');
    assert.equal(hub.classroom.getCourseId(), null);
});

test('中继模式拒绝旧事件名，要求带租约的 classroom:command', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    const session = await startTeachingSession(hub, { deviceKey: 'device-cmd-6' });
    t.after(() => session.client.close());

    const legacy = await session.client.emitWithAck('sync-slide', { slideIndex: 5 });
    assert.equal(legacy.ok, false);
    assert.equal(legacy.code, ERROR_CODES.LEASE_NOT_HELD);
    assert.equal(hub.classroom.getSlideIndex(), 0);

    const typed = await command(session.client, session.lease, 'slide:set', { slideIndex: 5 }, 'cmd-relay-only');
    assert.equal(typed.ok, true);
});

test('没有 ack 回调时命令仍然生效，拒绝时学生看到权威快照', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    const session = await startTeachingSession(hub, { deviceKey: 'device-cmd-7' });
    t.after(() => session.client.close());

    session.client.socket.emit('classroom:command', {
        type: 'slide:set',
        leaseId: session.lease.leaseId,
        epoch: session.lease.epoch,
        requestId: 'cmd-no-ack',
        payload: { slideIndex: 11 }
    });
    // 没有 ack 时以广播的快照确认已应用（sync-slide 只发给学生房间）
    const applied = await session.client.waitFor('classroom:snapshot');
    assert.equal(applied.currentSlideIndex, 11);
    assert.equal(hub.classroom.getSlideIndex(), 11);

    session.client.socket.emit('classroom:command', {
        type: 'slide:set',
        leaseId: session.lease.leaseId,
        epoch: session.lease.epoch + 1,
        requestId: 'cmd-no-ack-stale',
        payload: { slideIndex: 12 }
    });
    const snapshot = await session.client.waitFor('classroom:snapshot');
    assert.equal(snapshot.currentSlideIndex, 11);
    assert.equal(hub.classroom.getSlideIndex(), 11);
});
