// 统一消息信封与课堂快照。
//
// 目标协议要求每条实时消息都带 protocolVersion、requestId、revision 等字段，
// 以便幂等去重和断线恢复。当前服务端只实现其中一部分，因此这里同时提供
// "构造"和"校验"两种能力：服务端构造信封，客户端校验收到的信封。

const { PROTOCOL_VERSION } = require('./version');
const { validate, formatErrors } = require('./validate');

const ENVELOPE_FIELDS = {
    protocolVersion: { type: 'integer', min: 0, coerce: true },
    classroomId: { type: 'string', maxLength: 128 },
    sessionId: { type: 'string', maxLength: 128 },
    requestId: { type: 'string', maxLength: 128 },
    revision: { type: 'integer', min: 0, coerce: true },
    epoch: { type: 'integer', min: 0, coerce: true },
    sentAt: { type: 'string', maxLength: 40 },
    payload: { type: 'any' }
};

const ENVELOPE_SCHEMA = {
    type: 'object',
    required: ['protocolVersion'],
    fields: ENVELOPE_FIELDS
};

/**
 * 构造信封。未提供 protocolVersion 时使用当前版本；
 * payload 之外的字段会被保留，便于渐进迁移期间附加旧字段。
 */
function createEnvelope(input = {}) {
    const envelope = { ...input };
    if (envelope.protocolVersion === undefined) envelope.protocolVersion = PROTOCOL_VERSION;
    if (envelope.sentAt === undefined) envelope.sentAt = new Date().toISOString();
    if (envelope.revision !== undefined) {
        const revision = Number(envelope.revision);
        envelope.revision = Number.isInteger(revision) && revision >= 0 ? revision : 0;
    }
    return envelope;
}

/** 把任意业务负载包成信封；payload 一定存在。 */
function wrapPayload(payload, meta = {}) {
    return createEnvelope({ ...meta, payload: payload === undefined ? null : payload });
}

/**
 * 校验信封。
 * options.requireRevision / requireRequestId 用于命令类事件。
 */
function validateEnvelope(value, options = {}) {
    const result = validate(value, ENVELOPE_SCHEMA, 'envelope');
    if (!result.ok) return result;
    const envelope = result.value;
    const errors = [];
    if (options.requireRevision && envelope.revision === undefined) {
        errors.push({ path: 'envelope.revision', code: 'missing_required_field', message: 'revision is required' });
    }
    if (options.requireRequestId && !envelope.requestId) {
        errors.push({ path: 'envelope.requestId', code: 'missing_required_field', message: 'requestId is required' });
    }
    if (options.protocolVersion !== undefined && envelope.protocolVersion !== options.protocolVersion) {
        errors.push({
            path: 'envelope.protocolVersion',
            code: 'protocol_version_mismatch',
            message: `expected protocolVersion ${options.protocolVersion}`
        });
    }
    if (errors.length > 0) return { ok: false, errors };
    return { ok: true, value: envelope, errors: [] };
}

/** 命令回执：requestId 用于去重，revision 用于判断状态是否已应用。 */
function createCommandAck({ requestId, revision, ok = true, code = null, message = null, extra = {} }) {
    return createEnvelope({
        requestId: requestId === undefined ? undefined : String(requestId),
        revision,
        payload: { ok, code, message, ...extra }
    });
}

const SNAPSHOT_SCHEMA = {
    type: 'object',
    required: ['protocolVersion', 'sessionId', 'revision'],
    fields: {
        protocolVersion: { type: 'integer', min: 0 },
        sessionId: { type: 'string', minLength: 1, maxLength: 128 },
        revision: { type: 'integer', min: 0 },
        currentCourseId: { type: 'string', maxLength: 512 },
        currentSlideIndex: { type: 'integer', min: 0, coerce: true },
        hostSettings: { type: 'object' }
    }
};

/**
 * 构造课堂快照。重连的客户端用它覆盖本地旧状态，
 * 因此 courseId/slideIndex 必须是服务端权威值。
 */
function createClassroomSnapshot({ sessionId, revision, courseId = null, slideIndex = 0, hostSettings = {} }) {
    return {
        protocolVersion: PROTOCOL_VERSION,
        sessionId: String(sessionId || ''),
        revision: Number.isInteger(revision) ? revision : 0,
        currentCourseId: courseId === undefined ? null : courseId,
        currentSlideIndex: Number.isInteger(slideIndex) && slideIndex >= 0 ? slideIndex : 0,
        hostSettings: { ...hostSettings }
    };
}

function validateClassroomSnapshot(value) {
    return validate(value, SNAPSHOT_SCHEMA, 'snapshot');
}

module.exports = {
    ENVELOPE_FIELDS,
    ENVELOPE_SCHEMA,
    SNAPSHOT_SCHEMA,
    createEnvelope,
    wrapPayload,
    validateEnvelope,
    createCommandAck,
    createClassroomSnapshot,
    validateClassroomSnapshot,
    formatErrors
};
