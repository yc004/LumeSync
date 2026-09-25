// 授课租约：唯一持有者、续租、过期 epoch、释放与交接。
//
// 契约负责租约本身（单教室单租约、epoch 递增、TTL），Hub 负责把租约与状态机、
// 设备凭证、广播串起来。这些用例都通过真实 Socket 驱动。

const test = require('node:test');
const assert = require('node:assert/strict');

const { ERROR_CODES, RELAY_STATES } = require('@lumesync/classroom-protocol');
const {
    connect,
    connectHost,
    fetchJson,
    pairTeacher,
    startTeachingSession,
    startTestHub,
    stageCourse,
    buildCoursePackage
} = require('./helpers');

test('配对后取得唯一授课租约，重复获取是幂等的', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    const session = await startTeachingSession(hub, { deviceKey: 'device-lease-1' });
    t.after(() => session.client.close());

    assert.equal(session.lease.epoch, 1);
    assert.match(session.lease.leaseId, /^lease-\d+-[a-z0-9]+$/);
    assert.equal(hub.relay.getState(), RELAY_STATES.TEACHING);
    assert.equal(hub.relay.describeLease().state, 'teaching');
    assert.equal(hub.relay.status().relay.discoveryLabel, '授课中');

    // 同一设备重复获取：返回同一个租约，不递增 epoch
    const again = await session.client.emitWithAck('teacher:lease.acquire', {});
    assert.equal(again.ok, true);
    assert.equal(again.reused, true);
    assert.equal(again.leaseId, session.lease.leaseId);
    assert.equal(again.epoch, session.lease.epoch);

    const status = await fetchJson(hub, '/api/hub/status');
    assert.equal(status.body.lease.state, 'teaching');
    assert.equal(status.body.lease.lease.epoch, 1);
    // 公开状态不含租约凭证字段
    assert.equal(status.body.lease.lease.leaseId, undefined);
    assert.equal(status.body.lease.lease.deviceKey, undefined);
    assert.equal(status.body.pairedDevices, 1);
});

test('续租成功、过期 epoch 与错误租约被拒绝', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    const session = await startTeachingSession(hub, { deviceKey: 'device-lease-2' });
    t.after(() => session.client.close());

    const renewed = await session.client.emitWithAck('teacher:lease.renew', {
        leaseId: session.lease.leaseId,
        epoch: session.lease.epoch
    });
    assert.equal(renewed.ok, true);
    assert.equal(renewed.renewals, 1);
    assert.ok(renewed.expiresAt >= session.lease.expiresAt);

    const stale = await session.client.emitWithAck('teacher:lease.renew', {
        leaseId: session.lease.leaseId,
        epoch: session.lease.epoch + 1
    });
    assert.equal(stale.ok, false);
    assert.equal(stale.code, ERROR_CODES.LEASE_EPOCH_STALE);

    const foreign = await session.client.emitWithAck('teacher:lease.renew', {
        leaseId: 'lease-9-foreignid',
        epoch: session.lease.epoch
    });
    assert.equal(foreign.ok, false);
    assert.equal(foreign.code, ERROR_CODES.LEASE_NOT_HELD);
});

test('授课期间其他教师无法配对，释放后新教师获得更高 epoch', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    const first = await startTeachingSession(hub, { deviceKey: 'device-lease-first' });
    t.after(() => first.client.close());

    // 第二位教师：授课中不产生新验证码
    const second = connect(hub.port, { role: 'host', clientId: 'pair-second', protocolVersion: 1 });
    t.after(() => second.close());
    await second.waitForAccepted();
    const busy = await second.emitWithAck('teacher:pair.request', { requestId: 'req-second', deviceKey: 'device-lease-second' });
    assert.equal(busy.ok, false);
    assert.equal(busy.code, ERROR_CODES.RELAY_BUSY);

    // 现任教师释放
    const released = await first.client.emitWithAck('teacher:lease.release', {
        leaseId: first.lease.leaseId,
        epoch: first.lease.epoch
    });
    assert.equal(released.ok, true);
    assert.equal(released.epoch, 1);
    assert.equal(hub.relay.getState(), RELAY_STATES.IDLE);
    assert.equal(hub.relay.describeLease().state, 'idle');

    // 释放后现任教师的设备凭证立即作废（下一次授课要重新配对）
    const stale = connect(hub.port, { role: 'host', clientId: 'device-lease-first', token: first.deviceToken, protocolVersion: 1 });
    t.after(() => stale.close());
    const rejected = await stale.waitFor('identity-rejected');
    assert.equal(rejected.code, ERROR_CODES.HOST_AUTH_FAILED);

    // 新教师配对并取得 epoch 2
    const secondSession = await startTeachingSession(hub, { deviceKey: 'device-lease-second', requestId: 'req-second-2' });
    t.after(() => secondSession.client.close());
    assert.equal(secondSession.lease.epoch, 2);
    assert.ok(secondSession.lease.epoch > first.lease.epoch);

    // 旧教师的命令（旧 leaseId + 旧 epoch）被拒绝且不改变状态
    const before = hub.classroom.getRevision();
    const oldCommand = await secondSession.client.emitWithAck('classroom:command', {
        type: 'slide:set',
        leaseId: first.lease.leaseId,
        epoch: first.lease.epoch,
        requestId: 'cmd-from-old-teacher',
        payload: { slideIndex: 42 }
    });
    assert.equal(oldCommand.ok, false);
    assert.equal(oldCommand.code, ERROR_CODES.LEASE_NOT_HELD);
    assert.equal(hub.classroom.getSlideIndex(), 0);
    assert.equal(hub.classroom.getRevision(), before);
});

test('租约 TTL 过期后课堂进入等待教师，设备凭证失效', async (t) => {
    let clock = 1_800_000_000_000;
    const hub = await startTestHub({ mode: 'relay', now: () => clock, leaseTtlMs: 60_000 });
    t.after(() => hub.stop());

    const session = await startTeachingSession(hub, { deviceKey: 'device-lease-ttl' });
    t.after(() => session.client.close());
    assert.equal(hub.relay.describeLease().state, 'teaching');

    clock += 59_000;
    assert.deepEqual(hub.sweep(), [], '未到期不做任何变更');
    assert.equal(hub.relay.describeLease().state, 'teaching');

    clock += 2_000;
    const changes = hub.sweep();
    assert.equal(changes.length, 1);
    assert.equal(changes[0].type, 'lease-expired');
    assert.equal(changes[0].epoch, session.lease.epoch);
    assert.equal(hub.relay.describeLease().state, 'awaiting-teacher');
    assert.equal(hub.relay.getState(), RELAY_STATES.IDLE);
    assert.equal(hub.relay.status().pairedDevices, 0);

    // 过期后旧教师的命令无处可发（凭证已失效），课堂状态不变
    const before = hub.classroom.getRevision();
    const revoked = connect(hub.port, { role: 'host', clientId: 'device-lease-ttl', token: session.deviceToken, protocolVersion: 1 });
    t.after(() => revoked.close());
    const rejected = await revoked.waitFor('identity-rejected');
    assert.equal(rejected.code, ERROR_CODES.HOST_AUTH_FAILED);
    assert.equal(hub.classroom.getRevision(), before);
});

test('未取得租约不能发布课件；未暂存的 hash 拒绝发布', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    const paired = await pairTeacher(hub, { deviceKey: 'device-publish-1' });
    const { client } = await connectHost(hub, paired.verified.deviceToken, 'device-publish-1');
    t.after(() => client.close());

    const course = await buildCoursePackage({ id: 'lesson-publish' });
    const staged = await stageCourse(hub, { courseId: 'lesson-publish', buffer: course.buffer, hash: course.hash, token: paired.verified.deviceToken });
    assert.equal(staged.status, 200);

    // 还没有租约：发布被拒绝
    const noLease = await client.emitWithAck('course:publish', {
        courseId: 'lesson-publish',
        courseHash: course.hash,
        requestId: 'pub-no-lease',
        epoch: 1
    });
    assert.equal(noLease.ok, false);
    assert.equal(noLease.code, ERROR_CODES.LEASE_EXPIRED);
    assert.equal(hub.classroom.getCourseId(), null);

    // 取得租约后，未暂存的 hash 仍然被拒绝
    const lease = await client.emitWithAck('teacher:lease.acquire', {});
    assert.equal(lease.ok, true);
    const unknown = await client.emitWithAck('course:publish', {
        courseId: 'lesson-publish',
        courseHash: 'sha256:' + 'a'.repeat(64),
        requestId: 'pub-unknown',
        epoch: lease.epoch
    });
    assert.equal(unknown.ok, false);
    assert.equal(unknown.code, ERROR_CODES.COURSE_HASH_UNKNOWN);

    // 过期 epoch 也被拒绝
    const staleEpoch = await client.emitWithAck('course:publish', {
        courseId: 'lesson-publish',
        courseHash: course.hash,
        requestId: 'pub-stale',
        epoch: lease.epoch + 3
    });
    assert.equal(staleEpoch.ok, false);
    assert.equal(staleEpoch.code, ERROR_CODES.LEASE_EPOCH_STALE);

    // 正常发布
    const published = await client.emitWithAck('course:publish', {
        courseId: 'lesson-publish',
        courseHash: course.hash,
        requestId: 'pub-ok',
        epoch: lease.epoch
    });
    assert.equal(published.ok, true);
    assert.equal(hub.classroom.getCourseId(), 'lesson-publish');
});

test('直接模式没有租约概念，旧事件名直接生效', async (t) => {
    const hub = await startTestHub({ mode: 'direct' });
    t.after(() => hub.stop());

    const { hostAuth } = require('./helpers');
    const host = connect(hub.port, hostAuth(hub));
    t.after(() => host.close());
    await host.waitForAccepted();

    const lease = await host.emitWithAck('teacher:lease.acquire', {});
    assert.equal(lease.ok, false);
    assert.equal(lease.code, ERROR_CODES.RELAY_DISABLED);

    const command = await host.emitWithAck('classroom:command', {
        type: 'slide:set',
        leaseId: 'lease-1-direct',
        epoch: 1,
        requestId: 'cmd-direct',
        payload: { slideIndex: 4 }
    });
    assert.equal(command.ok, false);
    assert.equal(command.code, ERROR_CODES.LEASE_EXPIRED, '直接模式没有租约，类型化命令一律拒绝');
    assert.equal(hub.classroom.getSlideIndex(), 0);
});
