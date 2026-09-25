const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createSubmissionQueue,
    createCourseStage,
    ERROR_CODES
} = require('../index.js');

const T0 = 1_800_000_000_000;

test('提交队列：容量满时明确拒绝而不是静默丢弃', () => {
    const queue = createSubmissionQueue({ capacity: 2, ttlMs: 60_000, now: () => T0 });

    assert.equal(queue.enqueue({ submissionId: 's1', courseId: 'c1', content: 'a' }).ok, true);
    assert.equal(queue.enqueue({ submissionId: 's2', courseId: 'c1', content: 'b' }).ok, true);

    const rejected = queue.enqueue({ submissionId: 's3', courseId: 'c1', content: 'c' });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.code, ERROR_CODES.QUEUE_FULL);
    assert.equal(rejected.capacity, 2);
    assert.equal(queue.stats().size, 2, '被拒绝的提交不能悄悄占用或丢失已有条目');
});

test('提交队列：重复投递幂等，不占新容量', () => {
    const queue = createSubmissionQueue({ capacity: 1, now: () => T0 });
    assert.equal(queue.enqueue({ submissionId: 's1', content: 'a' }).ok, true);
    const retry = queue.enqueue({ submissionId: 's1', content: 'a' });
    assert.equal(retry.ok, true);
    assert.equal(retry.duplicate, true);
    assert.equal(queue.stats().size, 1);
});

test('提交队列：只有教师电脑确认落盘后才释放副本', () => {
    let clock = T0;
    const queue = createSubmissionQueue({ capacity: 5, ttlMs: 10_000, now: () => clock });
    queue.enqueue({ submissionId: 's1', courseId: 'c1', clientIp: '192.0.2.10', fileName: 'a.txt', content: 'answer' });

    assert.equal(queue.get('s1').status, 'pending');
    assert.equal(queue.stats().pendingCount, 1);

    const delivered = queue.markDelivered('s1', { deliveredAt: T0 + 1000 });
    assert.equal(delivered.ok, true);
    assert.equal(delivered.item.status, 'delivered');
    assert.equal(delivered.item.deliveredAt, T0 + 1000);
    assert.equal(queue.get('s1'), null, '确认后队列副本应释放');

    assert.equal(queue.markDelivered('nope').code, ERROR_CODES.QUEUE_ITEM_UNKNOWN);
});

test('提交队列：过期条目按保留策略清理并给出原因', () => {
    let clock = T0;
    const queue = createSubmissionQueue({ capacity: 5, ttlMs: 10_000, now: () => clock });
    queue.enqueue({ submissionId: 's1', content: 'a' });
    clock += 10_001;
    const removed = queue.purgeExpired();
    assert.equal(removed.length, 1);
    assert.equal(removed[0].submissionId, 's1');
    assert.equal(removed[0].reason, 'expired');
    assert.equal(queue.stats().size, 0);
});

test('提交队列：缺少 submissionId 直接拒绝', () => {
    const queue = createSubmissionQueue({ now: () => T0 });
    assert.equal(queue.enqueue({ content: 'a' }).code, ERROR_CODES.REQUEST_INVALID);
});

test('课件暂存：未 stage 的 hash 不能发布，且 courseId 必须匹配', () => {
    const stage = createCourseStage({ now: () => T0 });
    assert.equal(stage.publish({ courseId: 'c1', courseHash: 'sha256:deadbeef' }).code, ERROR_CODES.COURSE_HASH_UNKNOWN);

    const staged = stage.stage({ courseId: 'c1', courseHash: 'sha256:aaaabbbb', sizeBytes: 1024 });
    assert.equal(staged.ok, true);
    assert.equal(stage.has('sha256:aaaabbbb'), true);

    const mismatch = stage.publish({ courseId: 'c2', courseHash: 'sha256:aaaabbbb' });
    assert.equal(mismatch.code, ERROR_CODES.COURSE_HASH_MISMATCH);

    const published = stage.publish({ courseId: 'c1', courseHash: 'sha256:aaaabbbb' });
    assert.equal(published.ok, true);
    assert.equal(published.previousCourseHash, null);
    assert.equal(stage.currentVersion('c1').courseHash, 'sha256:aaaabbbb');
});

test('课件暂存：发布新版本时旧版本继续保留', () => {
    const stage = createCourseStage({ now: () => T0 });
    stage.stage({ courseId: 'c1', courseHash: 'sha256:old11111', sizeBytes: 10 });
    stage.publish({ courseId: 'c1', courseHash: 'sha256:old11111' });
    stage.stage({ courseId: 'c1', courseHash: 'sha256:new22222', sizeBytes: 20 });

    const switched = stage.publish({ courseId: 'c1', courseHash: 'sha256:new22222' });
    assert.equal(switched.previousCourseHash, 'sha256:old11111');
    assert.equal(stage.has('sha256:old11111'), true, '旧版本在新版本就绪后仍需可播放');
    assert.equal(stage.currentVersion('c1').courseHash, 'sha256:new22222');
});

test('课件暂存：正在使用的版本不能被释放或按过期清理', () => {
    let clock = T0;
    const stage = createCourseStage({ ttlMs: 1000, now: () => clock });
    stage.stage({ courseId: 'c1', courseHash: 'sha256:cur11111', sizeBytes: 10 });
    stage.publish({ courseId: 'c1', courseHash: 'sha256:cur11111' });

    const refused = stage.release('sha256:cur11111');
    assert.equal(refused.ok, false);
    assert.equal(refused.code, ERROR_CODES.COURSE_HASH_MISMATCH);

    clock += 5000;
    assert.deepEqual(stage.purgeExpired(), [], '当前版本不因过期被清掉');

    // 教师离开前清理：保留当前版本
    const released = stage.clear({ keepCurrent: true });
    assert.deepEqual(released, []);
    assert.equal(stage.has('sha256:cur11111'), true);
});

test('课件暂存：版本数与总容量都有上限', () => {
    const stage = createCourseStage({ maxVersions: 2, maxBytes: 100, now: () => T0 });
    assert.equal(stage.stage({ courseId: 'c1', courseHash: 'sha256:a1111111', sizeBytes: 60 }).ok, true);
    assert.equal(stage.stage({ courseId: 'c2', courseHash: 'sha256:b2222222', sizeBytes: 30 }).ok, true);
    assert.equal(stage.stage({ courseId: 'c3', courseHash: 'sha256:c3333333' }).code, ERROR_CODES.STAGE_CAPACITY_EXCEEDED);

    const byteLimited = createCourseStage({ maxVersions: 10, maxBytes: 100, now: () => T0 });
    assert.equal(byteLimited.stage({ courseId: 'c1', courseHash: 'sha256:d4444444', sizeBytes: 101 }).code, ERROR_CODES.STAGE_CAPACITY_EXCEEDED);
});

test('课件暂存：重复 stage 同一 hash 幂等', () => {
    const stage = createCourseStage({ now: () => T0 });
    assert.equal(stage.stage({ courseId: 'c1', courseHash: 'sha256:samehash', sizeBytes: 5 }).duplicate, false);
    const again = stage.stage({ courseId: 'c1', courseHash: 'sha256:samehash', sizeBytes: 5 });
    assert.equal(again.ok, true);
    assert.equal(again.duplicate, true);
    assert.equal(stage.stats().versions, 1);
});
