// 会话代理的类型化错误。
//
// 设计约束（teacher-cross-platform-relay.md §6、§7）：教师端只向上层暴露
// `{code, message, attemptsLeft?}`，绝不把 socket.io 的错误对象、ack 原始结构
// 或 HTTP 响应体透出去——界面需要能按 code 做分支，而不是猜字符串。
//
// 错误码优先取共享契约的 ERROR_CODES（Hub 回执里的码原样保留）；契约没有声明的
// 客户端本地情况（未连接、回执超时、上传失败等）用 `agent_` 前缀，保证不会与
// 契约码混淆。

const { ERROR_CODES } = require('@lumesync/classroom-protocol');

/** 契约未声明的客户端本地错误码。 */
const SESSION_AGENT_ERROR_CODES = {
    // 连接与生命周期
    NOT_CONNECTED: 'agent_not_connected',
    CONNECT_FAILED: 'agent_connect_failed',
    CONNECT_TIMEOUT: 'agent_connect_timeout',
    IDENTITY_REJECTED: 'agent_identity_rejected',
    PROTOCOL_REJECTED: 'agent_protocol_rejected',
    CLOSED: 'agent_closed',
    INVALID_OPTION: 'agent_invalid_option',
    CLASSROOM_MISMATCH: 'agent_classroom_mismatch',
    MODE_UNSUPPORTED: 'agent_mode_unsupported',
    // 请求与传输
    REQUEST_TIMEOUT: 'agent_request_timeout',
    SOCKET_ERROR: 'agent_socket_error',
    // 配对
    NO_PAIRING_REQUEST: 'agent_no_pairing_request',
    NOT_PAIRED: 'agent_not_paired',
    INVALID_PAIRING_CODE: 'agent_invalid_pairing_code',
    // 发现
    DISCOVERY_FAILED: 'agent_discovery_failed',
    // 课件上传
    UPLOAD_FAILED: 'agent_upload_failed',
    COURSE_FILE_UNREADABLE: 'agent_course_file_unreadable'
};

/** 表示"对课堂的控制权已经不在本代理手上"的契约错误码。 */
const LEASE_LOST_CODES = new Set([
    ERROR_CODES.LEASE_EXPIRED,
    ERROR_CODES.LEASE_EPOCH_STALE,
    ERROR_CODES.LEASE_NOT_HELD
]);

/** 表示"必须重新发起配对请求"的契约错误码（验证码已失效或次数用尽）。 */
const PAIRING_RESET_CODES = new Set([
    ERROR_CODES.PAIRING_ATTEMPTS_EXCEEDED,
    ERROR_CODES.PAIRING_CODE_EXPIRED,
    ERROR_CODES.PAIRING_REQUEST_UNKNOWN
]);

class SessionAgentError extends Error {
    /**
     * @param {string} code 契约错误码或 SESSION_AGENT_ERROR_CODES 里的本地码
     * @param {string} message 面向用户/日志的可读说明
     * @param {object} [extra]
     * @param {number|null} [extra.attemptsLeft] 配对剩余尝试次数（仅配对失败时有值）
     * @param {object} [extra.details] 结构化补充（课件校验错误列表等），不含凭证
     */
    constructor(code, message, extra = {}) {
        super(String(message || code || 'session agent error'));
        this.name = 'SessionAgentError';
        this.code = String(code || SESSION_AGENT_ERROR_CODES.SOCKET_ERROR);
        this.attemptsLeft = Number.isInteger(extra.attemptsLeft) ? extra.attemptsLeft : null;
        this.details = extra.details && typeof extra.details === 'object' ? extra.details : null;
    }

    toJSON() {
        const out = { name: this.name, code: this.code, message: this.message };
        if (this.attemptsLeft !== null) out.attemptsLeft = this.attemptsLeft;
        if (this.details) out.details = this.details;
        return out;
    }
}

function isSessionAgentError(value) {
    return value instanceof SessionAgentError;
}

/**
 * 把任意来源（Hub 回执、course-format 异常、socket 异常）归一成 SessionAgentError。
 *
 * - 已经是 SessionAgentError：原样返回；
 * - `{ok:false, code, message, attemptsLeft}`（Hub ack 或 HTTP 错误体）：用契约码构造；
 * - course-format 的 CourseFormatError（带字符串 code）：保留它的 code；
 * - 其它：包成 fallbackCode，只保留 message 文本，不携带原始对象（可能是 socket 实例）。
 */
function toSessionAgentError(value, fallbackCode = SESSION_AGENT_ERROR_CODES.SOCKET_ERROR, fallbackMessage = '') {
    if (isSessionAgentError(value)) return value;
    if (value && typeof value === 'object' && typeof value.code === 'string' && value.code) {
        const message = typeof value.message === 'string' && value.message
            ? value.message
            : `${value.code}`;
        return new SessionAgentError(value.code, message, {
            attemptsLeft: Number.isInteger(value.attemptsLeft) ? value.attemptsLeft : undefined,
            details: value.errors ? { errors: value.errors } : undefined
        });
    }
    const message = value && typeof value.message === 'string' && value.message
        ? value.message
        : (fallbackMessage || String(value || fallbackCode));
    return new SessionAgentError(fallbackCode, message);
}

/** 从 Hub ack 构造错误；ack 不是 `{ok:false}` 时给出兜底码。 */
function errorFromAck(ack, fallbackCode, fallbackMessage) {
    if (ack && typeof ack === 'object' && typeof ack.code === 'string' && ack.code) {
        return new SessionAgentError(ack.code, ack.message || `${ack.code}`, {
            attemptsLeft: Number.isInteger(ack.attemptsLeft) ? ack.attemptsLeft : undefined
        });
    }
    return new SessionAgentError(fallbackCode, fallbackMessage || 'Hub 回执被拒绝');
}

module.exports = {
    SESSION_AGENT_ERROR_CODES,
    LEASE_LOST_CODES,
    PAIRING_RESET_CODES,
    SessionAgentError,
    isSessionAgentError,
    toSessionAgentError,
    errorFromAck
};
