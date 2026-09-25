// 中继模式的端到端契约流程测试（不起网络，只串契约模块）。
//
// 覆盖设计文档 §7「接入、交接与断线流程」的主干：
//   固定机开启 → 教师请求配对 → 固定机显示验证码 → 教师用验证码完成握手 →
//   取得授课租约（epoch）→ 上传并 stage 课件 → 发布 → 学生互动 → 提交转发与落盘回执 →
//   教师释放 → 另一位教师接入（epoch 递增，旧命令失效）。

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createRelayState,
    createLeaseRegistry,
    createSubmissionQueue,
    createCourseStage,
    createPairingProof,
    verifyPairingProof,
    authorizeEvent,
    ERROR_CODES,
    RELAY_STATES,
    ROLE_HOST
} = require('../index.js');

const RELAY_SCOPES = ['classroom', 'relay'];

function openClassroom({ classroomId = 'room-101', name = '三年级一班', port = 3000, now }) {
    const relay = createRelayState({ classroomId, name, port, now });
    const leases = createLeaseRegistry({ now });
    const queue = createSubmissionQueue({ now });
    const stage = createCourseStage({ now });
    relay.enable();
    return { relay, leases, queue, stage };
}

/** 走一遍配对：返回 {requestId, code, leaseId, epoch}，验证码只从 screen 侧取得。 */
async function pairTeacher({ relay, leases, requestId, deviceKey, nonce = 'nonce-abcdefgh' }) {
    const requested = relay.requestPairing({ requestId, deviceKey, deviceName: '教师笔记本' });
    assert.equal(requested.ok, true, `配对请求应被接受：${requested.message || ''}`);
    const code = requested.screen.code;

    const proof = await createPairingProof({
        code,
        classroomId: 'room-101',
        requestId,
        deviceKey,
        nonce
    });
    // Hub 侧验证：证明与请求、设备、nonce 绑定
    const verified = await verifyPairingProof({ request: { ...requested.screen, deviceKey, classroomId: 'room-101' }, proof, nonce });
    assert.equal(verified.ok, true);
    assert.equal(relay.submitCode({ requestId, code }).ok, true);

    const lease = leases.acquire({ classroomId: 'room-101', sessionId: `${requestId}-session`, deviceKey, deviceName: '教师笔记本' });
    assert.equal(lease.ok, true);
    relay.completePairing({ leaseGranted: true });
    return { leaseId: lease.lease.leaseId, epoch: lease.lease.epoch };
}

test('配对 → 授课 → 发布课件 → 提交转发 → 释放 → 交接', async () => {
    let clock = 1_800_000_000_000;
    const now = () => clock;
    const { relay, leases, queue, stage } = openClassroom({ now });

    // 1. 第一位教师接入
    const first = await pairTeacher({ relay, leases, requestId: 'req-A', deviceKey: 'device-key-A' });
    assert.equal(relay.getState(), RELAY_STATES.TEACHING);
    assert.equal(first.epoch, 1);
    assert.equal(relay.discoveryTxt({ protocolVersion: 1 }).state, 'busy');

    // 2. 教师命令必须带 leaseId + epoch
    const okCommand = leases.authorizeCommand({ classroomId: 'room-101', leaseId: first.leaseId, epoch: first.epoch });
    assert.equal(okCommand.ok, true);
    const staleCommand = leases.authorizeCommand({ classroomId: 'room-101', leaseId: first.leaseId, epoch: first.epoch + 1 });
    assert.equal(staleCommand.code, ERROR_CODES.LEASE_EPOCH_STALE);

    // 3. 课件发布：先 stage 再 publish；未 stage 的 hash 拒绝发布
    assert.equal(stage.publish({ courseId: 'lesson-1', courseHash: 'sha256:unknown1' }).code, ERROR_CODES.COURSE_HASH_UNKNOWN);
    assert.equal(stage.stage({ courseId: 'lesson-1', courseHash: 'sha256:coursev1', sizeBytes: 4096 }).ok, true);
    const published = stage.publish({ courseId: 'lesson-1', courseHash: 'sha256:coursev1' });
    assert.equal(published.ok, true);
    assert.equal(stage.currentVersion('lesson-1').courseHash, 'sha256:coursev1');

    // 4. 学生提交：Hub 先入队，只有教师电脑确认落盘后才释放
    const enqueued = queue.enqueue({ submissionId: 'sub-1', courseId: 'lesson-1', clientIp: '192.0.2.10', fileName: 'answer.txt', content: 'A' });
    assert.equal(enqueued.ok, true);
    assert.equal(queue.stats().pendingCount, 1);
    assert.equal(queue.markDelivered('sub-1', { deliveredAt: clock }).ok, true);
    assert.equal(queue.stats().pendingCount, 0);

    // 5. 教师断线超时：租约过期后课堂进入等待教师，命令被拒
    clock += 61_000;
    assert.equal(leases.describe('room-101').state, 'awaiting-teacher');
    assert.equal(
        leases.authorizeCommand({ classroomId: 'room-101', leaseId: first.leaseId, epoch: first.epoch }).code,
        ERROR_CODES.LEASE_EXPIRED
    );
    assert.equal(relay.getState(), RELAY_STATES.TEACHING, '固定机状态由 Hub 依据租约事件推进，不由租约模块直接改写');

    // 6. 教师重新连接：租约到期后另一位教师可以接入，epoch 递增
    relay.releaseTeaching();
    assert.equal(relay.getState(), RELAY_STATES.IDLE);
    const second = await pairTeacher({ relay, leases, requestId: 'req-B', deviceKey: 'device-key-B', nonce: 'nonce-ijklmnop' });
    assert.equal(second.epoch, first.epoch + 1);
    assert.equal(
        leases.authorizeCommand({ classroomId: 'room-101', leaseId: first.leaseId, epoch: first.epoch }).code,
        ERROR_CODES.LEASE_NOT_HELD,
        '旧教师的命令在交接后必须失效'
    );

    // 7. 旧版本课件在新版本发布前继续保留
    stage.stage({ courseId: 'lesson-1', courseHash: 'sha256:coursev2', sizeBytes: 8192 });
    const republished = stage.publish({ courseId: 'lesson-1', courseHash: 'sha256:coursev2' });
    assert.equal(republished.previousCourseHash, 'sha256:coursev1');
    assert.equal(stage.has('sha256:coursev1'), true);
});

test('中继事件在教师角色下通过契约校验，在直接模式 scope 下被拒绝', () => {
    const pairRequest = { requestId: 'req-A', deviceKey: 'device-key-A', deviceName: '教师笔记本' };
    assert.equal(authorizeEvent(ROLE_HOST, 'teacher:pair.request', pairRequest, { scopes: RELAY_SCOPES }).ok, true);
    assert.equal(authorizeEvent(ROLE_HOST, 'teacher:pair.request', pairRequest).code, ERROR_CODES.EVENT_UNKNOWN);

    const command = {
        type: 'slide:set',
        leaseId: 'lease-1-abcdefgh',
        epoch: 1,
        requestId: 'req-cmd-1',
        payload: { slideIndex: 3 }
    };
    assert.equal(authorizeEvent(ROLE_HOST, 'classroom:command', command, { scopes: RELAY_SCOPES }).ok, true);
    // 命令类型必须在白名单内
    assert.equal(
        authorizeEvent(ROLE_HOST, 'classroom:command', { ...command, type: 'rm -rf' }, { scopes: RELAY_SCOPES }).code,
        ERROR_CODES.EVENT_PAYLOAD_INVALID
    );
});

test('教室被占用时第二位教师的配对请求被明确拒绝', async () => {
    const clock = 1_800_000_000_000;
    const { relay, leases } = openClassroom({ now: () => clock });
    await pairTeacher({ relay, leases, requestId: 'req-A', deviceKey: 'device-key-A' });

    const busy = relay.requestPairing({ requestId: 'req-B', deviceKey: 'device-key-B' });
    assert.equal(busy.ok, false);
    assert.equal(busy.code, ERROR_CODES.RELAY_BUSY);
    assert.equal(relay.screenPayload().pairing, null, '授课中不产生新验证码');
});
