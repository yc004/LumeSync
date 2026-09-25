const test = require('node:test');
const assert = require('node:assert/strict');

const {
    PROTOCOL_VERSION,
    createEnvelope,
    wrapPayload,
    validateEnvelope,
    createCommandAck,
    createClassroomSnapshot,
    validateClassroomSnapshot
} = require('../index.js');

test('信封默认带上协议版本与发送时间', () => {
    const envelope = createEnvelope({ requestId: 'r1', payload: { a: 1 } });
    assert.equal(envelope.protocolVersion, PROTOCOL_VERSION);
    assert.equal(envelope.requestId, 'r1');
    assert.ok(Date.parse(envelope.sentAt) > 0);
});

test('信封校验可要求 requestId 与 revision', () => {
    const envelope = wrapPayload({ ok: true }, { revision: 3, requestId: 'r1' });
    assert.equal(validateEnvelope(envelope).ok, true);
    assert.equal(validateEnvelope(envelope, { requireRequestId: true, requireRevision: true }).ok, true);

    const withoutMeta = wrapPayload({ ok: true });
    const missingRevision = validateEnvelope(withoutMeta, { requireRevision: true });
    assert.equal(missingRevision.ok, false);
    assert.equal(missingRevision.errors[0].path, 'envelope.revision');

    const missingRequest = validateEnvelope(withoutMeta, { requireRequestId: true });
    assert.equal(missingRequest.ok, false);
    assert.equal(missingRequest.errors[0].path, 'envelope.requestId');
});

test('信封版本不匹配时明确失败', () => {
    const result = validateEnvelope(createEnvelope({ payload: null }), { protocolVersion: PROTOCOL_VERSION + 1 });
    assert.equal(result.ok, false);
    assert.equal(result.errors[0].code, 'protocol_version_mismatch');
});

test('负 revision 被拒绝', () => {
    const result = validateEnvelope({ protocolVersion: 1, revision: -1, payload: {} });
    assert.equal(result.ok, false);
});

test('命令回执同时带 requestId 与 revision', () => {
    const ack = createCommandAck({ requestId: 'r9', revision: 12, ok: false, code: 'event_payload_invalid' });
    assert.equal(ack.requestId, 'r9');
    assert.equal(ack.revision, 12);
    assert.equal(ack.payload.ok, false);
    assert.equal(ack.payload.code, 'event_payload_invalid');
});

test('课堂快照包含权威课程、页码与 revision', () => {
    const snapshot = createClassroomSnapshot({
        sessionId: 'sess-1',
        revision: 7,
        courseId: 'lesson',
        slideIndex: 2,
        hostSettings: { syncFollow: true }
    });
    assert.deepEqual(snapshot, {
        protocolVersion: PROTOCOL_VERSION,
        sessionId: 'sess-1',
        revision: 7,
        currentCourseId: 'lesson',
        currentSlideIndex: 2,
        hostSettings: { syncFollow: true }
    });
    assert.equal(validateClassroomSnapshot(snapshot).ok, true);
});

test('缺少 sessionId 的快照校验失败', () => {
    const result = validateClassroomSnapshot({ protocolVersion: 1, revision: 0, currentSlideIndex: 0 });
    assert.equal(result.ok, false);
    assert.match(result.errors.map((item) => item.path).join(','), /sessionId/);
});
