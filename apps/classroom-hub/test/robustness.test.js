// 健壮性：畸形 payload 只能影响这一条消息，绝不能带走 Hub 进程。
//
// 背景：配对候选连接（中继模式下未带设备凭证的 host 连接）的守门只放行
// teacher:pair.*，这些事件在处理器内部用契约 schema 复核；其余事件由
// socket.use 守卫挡下。客户端的 payload 永远是不可信输入，这条用例专门用
// 畸形输入反复冲击，确认服务仍然在服务、状态没有被改。

const test = require('node:test');
const assert = require('node:assert/strict');

const { ERROR_CODES } = require('@lumesync/classroom-protocol');
const {
    ADMIN_HEADERS,
    bootstrapViewer,
    connect,
    fetchJson,
    hostAuth,
    startTeachingSession,
    startTestHub,
    viewerAuth
} = require('./helpers');

test('配对候选连接的畸形 payload 被拒绝，服务不崩、状态不变', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    const client = connect(hub.port, { role: 'host', clientId: 'fuzz-pair', protocolVersion: 1 });
    t.after(() => client.close());
    await client.waitForAccepted();

    // 1) 完全空的 pair.request（没有 requestId / deviceKey）
    const empty = await client.emitWithAck('teacher:pair.request', {});
    assert.equal(empty.ok, false);
    assert.equal(empty.code, ERROR_CODES.EVENT_PAYLOAD_INVALID);
    assert.equal(hub.relay.getState(), 'idle');

    // 2) 字段类型不对与超长字符串
    const wrongTypes = await client.emitWithAck('teacher:pair.request', { requestId: 42, deviceKey: [], deviceName: {} });
    assert.equal(wrongTypes.ok, false);
    assert.equal(wrongTypes.code, ERROR_CODES.EVENT_PAYLOAD_INVALID);

    const tooLong = await client.emitWithAck('teacher:pair.request', { requestId: 'x'.repeat(500), deviceKey: 'y'.repeat(500) });
    assert.equal(tooLong.ok, false);
    assert.equal(tooLong.code, ERROR_CODES.EVENT_PAYLOAD_INVALID);

    // 3) 空 verify（没有 nonce / proof）
    const emptyVerify = await client.emitWithAck('teacher:pair.verify', {});
    assert.equal(emptyVerify.ok, false);
    assert.equal(emptyVerify.code, ERROR_CODES.EVENT_PAYLOAD_INVALID);

    // 4) 没有 ack 回调也必须安全
    client.socket.emit('teacher:pair.request', {});
    client.socket.emit('teacher:pair.verify', null);
    client.socket.emit('teacher:lease.acquire', undefined);
    await new Promise((resolve) => setTimeout(resolve, 100));

    // 5) 配对候选连接仍然只能配对：课堂内容与状态都没被触碰
    assert.equal(hub.relay.getState(), 'idle');
    assert.equal(hub.relay.status().relay.pairing, null);
    assert.equal(hub.classroom.getRevision(), 0);
    const health = await fetchJson(hub, '/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.ok, true);

    // 6) 正常配对仍然可用
    const valid = await client.emitWithAck('teacher:pair.request', { requestId: 'req-after-fuzz', deviceKey: 'device-after-fuzz' });
    assert.equal(valid.ok, true);
    const screen = await fetchJson(hub, '/api/hub/screen', { headers: ADMIN_HEADERS });
    assert.equal(screen.body.pairing.requestId, 'req-after-fuzz');
});

test('已配对教师的畸形命令被契约守卫拒绝，课堂状态不变', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    const session = await startTeachingSession(hub, { deviceKey: 'device-fuzz-host' });
    t.after(() => session.client.close());

    const badPayloads = [
        {},
        null,
        { type: 'slide:set' },
        { type: 'slide:set', leaseId: session.lease.leaseId, epoch: session.lease.epoch, requestId: 'x', payload: 'not-an-object' },
        { type: 'slide:set', leaseId: 'short', epoch: 0, requestId: 'x', payload: { slideIndex: 1 } },
        { type: 'slide:set', leaseId: session.lease.leaseId, epoch: session.lease.epoch, requestId: 'x'.repeat(500), payload: { slideIndex: 1 } },
        { type: 'click-everything', leaseId: session.lease.leaseId, epoch: session.lease.epoch, requestId: 'x', payload: {} }
    ];

    for (const payload of badPayloads) {
        const ack = await session.client.emitWithAck('classroom:command', payload);
        assert.equal(ack.ok, false, `畸形命令应被拒绝：${JSON.stringify(payload)}`);
        assert.ok(
            ack.code === ERROR_CODES.EVENT_PAYLOAD_INVALID || ack.code === ERROR_CODES.REQUEST_INVALID,
            `拒绝原因应为契约错误码，实际 ${ack.code}`
        );
    }

    // 没有 ack 的畸形命令同样安全
    session.client.socket.emit('classroom:command', { type: 'slide:set' });
    session.client.socket.emit('course:publish', null);
    session.client.socket.emit('teacher:lease.renew', { leaseId: 12, epoch: 'x' });
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.equal(hub.classroom.getRevision(), 0);
    assert.equal(hub.classroom.getSlideIndex(), 0);

    // 合法命令照常生效：畸形输入没有污染任何状态
    const good = await session.client.emitWithAck('classroom:command', {
        type: 'slide:set',
        leaseId: session.lease.leaseId,
        epoch: session.lease.epoch,
        requestId: 'cmd-after-fuzz',
        payload: { slideIndex: 5 }
    });
    assert.equal(good.ok, true);
    assert.equal(hub.classroom.getSlideIndex(), 5);
});

test('学生端的畸形事件被拒绝，且不影响其他连接', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    const session = await startTeachingSession(hub, { deviceKey: 'device-fuzz-viewer' });
    t.after(() => session.client.close());
    const student = connect(hub.port, viewerAuth(await bootstrapViewer(hub, 'student-fuzz')));
    t.after(() => student.close());
    await student.waitForAccepted();

    const malformed = [
        ['student:submit', {}],
        ['student:submit', { submissionId: 's'.repeat(500) }],
        ['student:alert', {}],
        ['student:screenshot', {}],
        ['student:device-info', { mac: 'x'.repeat(200) }]
    ];
    for (const [event, payload] of malformed) {
        const ack = await student.emitWithAck(event, payload);
        assert.equal(ack.ok, false, `${event} 的畸形 payload 应被拒绝`);
        assert.ok(
            ack.code === ERROR_CODES.EVENT_PAYLOAD_INVALID || ack.code === ERROR_CODES.EVENT_UNKNOWN,
            `${event} 的拒绝原因应为契约错误码，实际 ${ack.code}`
        );
    }
    student.socket.emit('student:submit', {});
    await new Promise((resolve) => setTimeout(resolve, 100));

    // 契约 schema 只限制类型与大小，不校验 data URL 前缀：内容判断留给教师端
    // （Hub 转发的是学生原始上报，不在这里做业务解释）。
    const forwardedShape = await student.emitWithAck('student:screenshot', { dataUrl: 'not-a-data-url' });
    assert.equal(forwardedShape.ok, true);

    assert.equal(hub.submissions.stats().pendingCount, 0);
    assert.equal(session.client.seen('submission:forwarded'), false);

    // 合法提交仍然可用
    const good = await student.emitWithAck('student:submit', { submissionId: 'sub-after-fuzz', content: 'ok' });
    assert.equal(good.ok, true);
    assert.equal(hub.submissions.stats().pendingCount, 1);
});

test('直接模式的畸形命令同样不会击倒服务', async (t) => {
    const hub = await startTestHub({ mode: 'direct' });
    t.after(() => hub.stop());

    const host = connect(hub.port, hostAuth(hub));
    t.after(() => host.close());
    await host.waitForAccepted();

    const checks = [
        ['select-course', null],
        ['select-course', {}],
        ['sync-slide', { slideIndex: 'abc' }],
        ['update-settings', 'not-an-object'],
        ['host-settings', 42]
    ];
    for (const [event, payload] of checks) {
        const ack = await host.emitWithAck(event, payload);
        assert.equal(ack.ok, false, `${event} 的畸形 payload 应被拒绝`);
        assert.equal(ack.code, ERROR_CODES.EVENT_PAYLOAD_INVALID);
    }
    host.socket.emit('select-course', {});
    host.socket.emit('sync-slide', {});
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.equal(hub.classroom.getCourseId(), null);
    assert.equal(hub.classroom.getRevision(), 0);
    const health = await fetchJson(hub, '/api/health');
    assert.equal(health.body.ok, true);
});
