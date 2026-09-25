// 页面 ↔ 原生壳的消息契约。
//
// 当前两端壳（教师 C++/WebView2、学生 C++/WebView2）注入的桥只有 action 名称，
// 没有协议版本、来源校验或能力清单。这里把消息封装、回执形状、RPC 超时和
// 每个角色的能力清单固化成一份可校验的定义，C++ 侧与页面侧都以它为准。

const { validate, formatErrors } = require('@lumesync/classroom-protocol');

const BRIDGE_PROTOCOL_VERSION = 1;
const RPC_TIMEOUT_MS = 10000;
const MAX_BRIDGE_PAYLOAD_BYTES = 4 * 1024 * 1024;
const MAX_ACTION_LENGTH = 64;
const MAX_REQUEST_ID_LENGTH = 128;

const MESSAGE_KINDS = {
    RPC: 'rpc',
    EVENT: 'event',
    RPC_RESULT: 'rpc-result',
    WINDOW_MAXIMIZED: 'window-maximized',
    WINDOW_UNMAXIMIZED: 'window-unmaximized'
};

const REQUEST_SCHEMA = {
    type: 'object',
    required: ['kind', 'action'],
    fields: {
        kind: { type: 'string', enum: [MESSAGE_KINDS.RPC, MESSAGE_KINDS.EVENT] },
        id: { type: 'string', maxLength: MAX_REQUEST_ID_LENGTH },
        action: { type: 'string', minLength: 1, maxLength: MAX_ACTION_LENGTH },
        version: { type: 'integer', min: 0, max: 255, coerce: true },
        payload: { type: 'any' }
    }
};

const RESULT_SCHEMA = {
    type: 'object',
    required: ['kind', 'id'],
    fields: {
        kind: { type: 'string', enum: [MESSAGE_KINDS.RPC_RESULT] },
        id: { type: 'string', minLength: 1, maxLength: MAX_REQUEST_ID_LENGTH },
        version: { type: 'integer', min: 0, max: 255, coerce: true },
        ok: { type: 'boolean', coerce: true },
        payload: { type: 'any' },
        error: { type: 'string', maxLength: 2048 }
    }
};

function requestId(prefix = 'rpc') {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 页面 -> 原生壳：需要回执的请求。 */
function createRpcRequest({ action, payload = {}, id, version = BRIDGE_PROTOCOL_VERSION }) {
    return { kind: MESSAGE_KINDS.RPC, id: id || requestId(), action: String(action), version, payload };
}

/** 页面 -> 原生壳：单向通知。 */
function createEventMessage({ action, payload = {}, version = BRIDGE_PROTOCOL_VERSION }) {
    return { kind: MESSAGE_KINDS.EVENT, action: String(action), version, payload };
}

/** 原生壳 -> 页面：RPC 回执。 */
function createRpcResult({ id, ok = true, payload = null, error = '', version = BRIDGE_PROTOCOL_VERSION }) {
    return { kind: MESSAGE_KINDS.RPC_RESULT, id, version, ok, payload, error };
}

function payloadByteLength(payload) {
    if (payload === undefined || payload === null) return 0;
    let json;
    try {
        json = JSON.stringify(payload);
    } catch (_) {
        return Number.POSITIVE_INFINITY;
    }
    // 契约同时被 Node（原生壳对照测试、Electron 主进程）和浏览器页面消费，
    // 因此不能假定存在 Buffer。
    if (typeof Buffer !== 'undefined' && typeof Buffer.byteLength === 'function') {
        return Buffer.byteLength(json, 'utf8');
    }
    if (typeof TextEncoder !== 'undefined') {
        return new TextEncoder().encode(json).length;
    }
    return json.length;
}

/** 校验页面发往原生壳的消息（原生壳必须对每条消息执行）。 */
function validateBridgeRequest(message, options = {}) {
    const result = validate(message, REQUEST_SCHEMA, 'message');
    if (!result.ok) return { ok: false, code: 'bridge_message_invalid', errors: result.errors };
    const value = result.value;
    if (value.kind === MESSAGE_KINDS.RPC && !value.id) {
        return {
            ok: false,
            code: 'bridge_message_invalid',
            errors: [{ path: 'message.id', code: 'missing_required_field', message: 'rpc 消息必须带 id' }]
        };
    }
    if (value.version !== undefined && value.version > BRIDGE_PROTOCOL_VERSION) {
        return {
            ok: false,
            code: 'bridge_version_unsupported',
            errors: [{ path: 'message.version', code: 'bridge_version_unsupported', message: `原生壳支持到版本 ${BRIDGE_PROTOCOL_VERSION}` }]
        };
    }
    const limit = options.maxPayloadBytes === undefined ? MAX_BRIDGE_PAYLOAD_BYTES : options.maxPayloadBytes;
    if (payloadByteLength(value.payload) > limit) {
        return {
            ok: false,
            code: 'bridge_payload_too_large',
            errors: [{ path: 'message.payload', code: 'bridge_payload_too_large', message: `payload 超过 ${limit} 字节` }]
        };
    }
    return { ok: true, code: null, value, errors: [] };
}

/** 校验原生壳回给页面的消息（页面必须对每条回执执行）。 */
function validateRpcResult(message) {
    const result = validate(message, RESULT_SCHEMA, 'message');
    if (!result.ok) return { ok: false, code: 'bridge_result_invalid', errors: result.errors };
    return { ok: true, code: null, value: result.value, errors: [] };
}

/** 判断一条原生消息是否是页面需要处理的 RPC 回执。 */
function isRpcResult(message) {
    return !!message && message.kind === MESSAGE_KINDS.RPC_RESULT && typeof message.id === 'string';
}

function isWindowStateMessage(message) {
    return !!message && (message.kind === MESSAGE_KINDS.WINDOW_MAXIMIZED || message.kind === MESSAGE_KINDS.WINDOW_UNMAXIMIZED);
}

module.exports = {
    BRIDGE_PROTOCOL_VERSION,
    RPC_TIMEOUT_MS,
    MAX_BRIDGE_PAYLOAD_BYTES,
    MAX_ACTION_LENGTH,
    MESSAGE_KINDS,
    REQUEST_SCHEMA,
    RESULT_SCHEMA,
    createRpcRequest,
    createEventMessage,
    createRpcResult,
    validateBridgeRequest,
    validateRpcResult,
    isRpcResult,
    isWindowStateMessage,
    payloadByteLength,
    formatErrors
};
