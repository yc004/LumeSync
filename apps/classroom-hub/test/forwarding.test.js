// 通用转发：契约里声明的 viewer 课堂事件（告警、截图、设备信息、投票、注释同步…）
// 一律转发到教师房间，而不是被静默丢弃。
//
// 清单不是硬编码的：测试直接从契约的入站事件表推导期望集合，与 Hub 暴露的清单对照，
// 契约新增 viewer 事件而 Hub 忘了接时这条用例会失败。

const test = require('node:test');
const assert = require('node:assert/strict');

const { INBOUND_EVENTS, ERROR_CODES } = require('@lumesync/classroom-protocol');
const {
    bootstrapViewer,
    connect,
    hostAuth,
    startTestHub,
    viewerAuth
} = require('./helpers');
const {
    VIEWER_FORWARD_EVENTS,
    HANDLED_VIEWER_EVENTS
} = require('..');

function expectedForwardEvents() {
    return Object.entries(INBOUND_EVENTS)
        .filter(([, entry]) => (entry.scope || 'classroom') === 'classroom')
        .filter(([, entry]) => entry.roles.includes('viewer') || entry.roles.includes('any'))
        .map(([name]) => name)
        .filter((name) => !HANDLED_VIEWER_EVENTS.has(name))
        .sort();
}

/** 每个事件提供一个最小合法 payload（按契约 schema 构造）。 */
const SAMPLE_PAYLOADS = {
    'student-alert': { type: 'fullscreen-exit' },
    'student:screenshot': { dataUrl: 'data:image/jpeg;base64,AAAA', width: 320, height: 200 },
    'student:device-info': { mac: 'aa:bb:cc:dd:ee:ff', deviceName: '教室机-01', clientId: 'student-fwd' },
    'student:power-control:client-ack': { requestId: 'power-1', action: 'restart', accepted: true },
    'student-action': { type: 'slide-click', slide: 2 },
    'request-sync-state': { courseId: 'lesson-fwd', slideIndex: 3 },
    'vote:submit': { voteId: 'vote-1', optionId: 'A', courseId: 'lesson-fwd', slideIndex: 3 },
    'annotation:get': { courseId: 'lesson-fwd', slideIndex: 3 },
    'annotation-load': { courseId: 'lesson-fwd', slideIndex: 3 },
    'course-runtime-error': { courseId: 'lesson-fwd', error: 'boom' }
};

test('Hub 的转发清单与契约推导结果一致', () => {
    assert.deepEqual(VIEWER_FORWARD_EVENTS.slice().sort(), expectedForwardEvents());
    // 有专门处理器的事件不走通用转发
    for (const handled of HANDLED_VIEWER_EVENTS) {
        assert.ok(!VIEWER_FORWARD_EVENTS.includes(handled), `${handled} 不应重复出现在转发清单里`);
    }
    assert.ok(VIEWER_FORWARD_EVENTS.includes('student:screenshot'));
    assert.ok(VIEWER_FORWARD_EVENTS.includes('student-alert'));
    assert.ok(VIEWER_FORWARD_EVENTS.includes('student:device-info'));
    assert.ok(VIEWER_FORWARD_EVENTS.includes('vote:submit'));
    assert.ok(VIEWER_FORWARD_EVENTS.includes('annotation:get'));
});

test('所有声明的 viewer 课堂事件都被转发到教师房间，并带上来源身份', async (t) => {
    const hub = await startTestHub({ mode: 'direct' });
    t.after(() => hub.stop());

    const host = connect(hub.port, hostAuth(hub));
    t.after(() => host.close());
    await host.waitForAccepted();

    const student = connect(hub.port, viewerAuth(await bootstrapViewer(hub, 'student-fwd')));
    t.after(() => student.close());
    await student.waitForAccepted();

    for (const event of VIEWER_FORWARD_EVENTS) {
        const payload = SAMPLE_PAYLOADS[event];
        assert.ok(payload, `用例缺少 ${event} 的样例 payload`);
        const ack = await student.emitWithAck(event, payload);
        assert.equal(ack.ok, true, `${event} 应被接受`);
        assert.equal(ack.forwarded, true);

        const forwarded = await host.waitFor(event);
        assert.equal(forwarded.clientId, 'student-fwd', `${event} 转发时应带 clientId`);
        assert.equal(forwarded.ip, '127.0.0.1', `${event} 转发时应带来源 IP`);
        assert.equal(typeof forwarded.receivedAt, 'number');
        for (const [key, value] of Object.entries(payload)) {
            assert.deepEqual(forwarded[key], value, `${event} 的 ${key} 不应被改写`);
        }
    }
});

test('截图转发保留 dataUrl，超过契约上限时被拒绝而不是丢弃', async (t) => {
    const hub = await startTestHub({ mode: 'direct' });
    t.after(() => hub.stop());

    const host = connect(hub.port, hostAuth(hub));
    t.after(() => host.close());
    await host.waitForAccepted();
    const student = connect(hub.port, viewerAuth(await bootstrapViewer(hub, 'student-shot')));
    t.after(() => student.close());
    await student.waitForAccepted();

    const dataUrl = 'data:image/jpeg;base64,' + 'A'.repeat(2048);
    await student.emitWithAck('student:screenshot', { dataUrl, width: 1280, height: 720 });
    const forwarded = await host.waitFor('student:screenshot');
    assert.equal(forwarded.dataUrl, dataUrl);
    assert.equal(forwarded.width, 1280);

    const oversized = await student.emitWithAck('student:screenshot', {
        dataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(1_400_001)
    });
    assert.equal(oversized.ok, false);
    assert.equal(oversized.code, ERROR_CODES.EVENT_PAYLOAD_INVALID);
    assert.equal(host.seen('student:screenshot'), false, '被拒绝的截图不应转发');
});

test('教师自己发的事件不会被转发回教师房间（避免回环）', async (t) => {
    const hub = await startTestHub({ mode: 'direct' });
    t.after(() => hub.stop());

    const host = connect(hub.port, hostAuth(hub));
    t.after(() => host.close());
    await host.waitForAccepted();

    // annotation:get 的角色是 any：host 也能发，但通用转发通道只服务学生端事件，
    // Hub 明确回绝（而不是回环给自己，也不是让调用方一直等回执）。
    const ack = await host.emitWithAck('annotation:get', { courseId: 'lesson-loop', slideIndex: 1 });
    assert.equal(ack.ok, false);
    assert.equal(ack.code, ERROR_CODES.EVENT_FORBIDDEN);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(host.seen('annotation:get'), false);
});

test('viewer 不能发中继事件；未授权角色不产生任何转发', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    const student = connect(hub.port, viewerAuth(await bootstrapViewer(hub, 'student-relay-fwd')));
    t.after(() => student.close());
    await student.waitForAccepted();

    const ack = await student.emitWithAck('teacher:pair.request', { requestId: 'req-x', deviceKey: 'device-key-x' });
    assert.equal(ack.ok, false);
    assert.equal(ack.code, ERROR_CODES.EVENT_FORBIDDEN);
    assert.equal(hub.relay.status().relay.pairing, null);
});
