// 协议错误码。
//
// 服务端回执、Socket 拒绝原因和 HTTP 错误体共用这一份枚举，
// 避免各端自造字符串导致无法自动化判断。

const ERROR_CODES = {
    // 身份与授权
    HOST_AUTH_FAILED: 'host_auth_failed',
    VIEWER_AUTH_FAILED: 'viewer_auth_failed',
    HOST_AUTHORIZATION_REQUIRED: 'host_authorization_required',
    ROLE_UNKNOWN: 'role_unknown',

    // 协议版本
    PROTOCOL_VERSION_INVALID: 'protocol_version_invalid',
    PROTOCOL_VERSION_UNSUPPORTED: 'protocol_version_unsupported',

    // 事件
    EVENT_UNKNOWN: 'event_unknown',
    EVENT_FORBIDDEN: 'event_forbidden',
    EVENT_PAYLOAD_INVALID: 'event_payload_invalid',
    EVENT_RATE_LIMITED: 'event_rate_limited',

    // 通用请求
    REQUEST_INVALID: 'request_invalid',
    RESOURCE_NOT_FOUND: 'resource_not_found',
    INTERNAL_ERROR: 'internal_error'
};

// 供 HTTP 层使用：错误码 -> 默认 HTTP 状态码
const ERROR_HTTP_STATUS = {
    [ERROR_CODES.HOST_AUTH_FAILED]: 403,
    [ERROR_CODES.VIEWER_AUTH_FAILED]: 403,
    [ERROR_CODES.HOST_AUTHORIZATION_REQUIRED]: 403,
    [ERROR_CODES.ROLE_UNKNOWN]: 400,
    [ERROR_CODES.PROTOCOL_VERSION_INVALID]: 400,
    [ERROR_CODES.PROTOCOL_VERSION_UNSUPPORTED]: 426,
    [ERROR_CODES.EVENT_UNKNOWN]: 400,
    [ERROR_CODES.EVENT_FORBIDDEN]: 403,
    [ERROR_CODES.EVENT_PAYLOAD_INVALID]: 400,
    [ERROR_CODES.EVENT_RATE_LIMITED]: 429,
    [ERROR_CODES.REQUEST_INVALID]: 400,
    [ERROR_CODES.RESOURCE_NOT_FOUND]: 404,
    [ERROR_CODES.INTERNAL_ERROR]: 500
};

function httpStatusForError(code, fallback = 400) {
    return ERROR_HTTP_STATUS[code] || fallback;
}

module.exports = { ERROR_CODES, ERROR_HTTP_STATUS, httpStatusForError };
