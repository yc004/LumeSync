// 入站事件的统一守卫。
//
// 服务端在 Socket.IO 中间件里调用 authorizeEvent，把"角色不对""事件未声明"
// "payload 不合法"三类问题在进入业务处理器之前拦掉。业务处理器里保留原有的
// 角色判断作为纵深防御，但不再是唯一防线。

const { getInboundEvent, canSendEvent } = require('./events');
const { roleAllows } = require('./roles');
const { validate, formatErrors } = require('./validate');
const { ERROR_CODES } = require('./errors');

const DEFAULT_SCOPES = ['classroom'];

function scopeAllowed(entry, scopes) {
    const allowed = Array.isArray(scopes) && scopes.length > 0 ? scopes : DEFAULT_SCOPES;
    return allowed.includes(entry.scope || 'classroom');
}

/**
 * @param {string} role 连接角色
 * @param {string} name 事件名
 * @param {unknown} payload 第一个事件参数（与处理器读取的一致）
 * @param {{scopes?: string[]}} [options] 允许的事件范围；直接模式用 ['classroom']，
 *   教室 Hub 用 ['classroom','relay']。范围外的事件按未声明处理，避免出现"声明了但没有处理器"的静默路径。
 * @returns {{ok: true, value: any, entry: object} | {ok: false, code: string, message: string, entry: object|null}}
 */
function authorizeEvent(role, name, payload, options = {}) {
    const entry = getInboundEvent(name);
    if (!entry || !scopeAllowed(entry, options.scopes)) {
        return {
            ok: false,
            code: ERROR_CODES.EVENT_UNKNOWN,
            message: `event is not declared in the classroom protocol: ${String(name)}`,
            entry: null
        };
    }
    if (!canSendEvent(role, name)) {
        return {
            ok: false,
            code: ERROR_CODES.EVENT_FORBIDDEN,
            message: `role ${String(role)} may not send ${String(name)}`,
            entry
        };
    }
    if (!entry.payload) {
        return { ok: true, value: payload, entry };
    }
    const result = validate(payload === undefined || payload === null ? {} : payload, entry.payload);
    if (!result.ok) {
        return {
            ok: false,
            code: ERROR_CODES.EVENT_PAYLOAD_INVALID,
            message: formatErrors(result.errors),
            errors: result.errors,
            entry
        };
    }
    return { ok: true, value: result.value, entry };
}

function isAckFunction(value) {
    return typeof value === 'function';
}

/**
 * 生成 Socket.IO 的 socket.use 中间件。
 *
 * @param {object} options
 * @param {string} options.role 当前连接角色（host/viewer）
 * @param {(info: object) => void} [options.onViolation] 记录或统计被拒绝的事件
 * @param {string[]} [options.ignore] 跳过校验的事件名（例如 Socket.IO 保留事件）
 * @param {boolean} [options.allowUndeclared] 未声明事件是否放行（默认 false）
 */
function createInboundGuard({ role, onViolation, ignore = [], allowUndeclared = false, scopes = DEFAULT_SCOPES } = {}) {
    const ignored = new Set(ignore);
    return function inboundGuard(packet, next) {
        const name = Array.isArray(packet) ? packet[0] : packet;
        if (typeof name !== 'string' || ignored.has(name)) return next();
        const args = Array.isArray(packet) ? packet.slice(1) : [];
        const ack = args.length > 0 && isAckFunction(args[args.length - 1]) ? args[args.length - 1] : null;
        // 处理器只读第一个参数，这里必须用同一个参数做校验，否则多参数 emit 会被误判。
        const payload = args[0];

        const result = authorizeEvent(role, name, payload, { scopes });
        if (result.ok) return next();
        if (result.code === ERROR_CODES.EVENT_UNKNOWN && allowUndeclared) return next();

        const info = { event: name, role, code: result.code, message: result.message };
        if (typeof onViolation === 'function') {
            try {
                onViolation(info);
            } catch (_) {
                // 记录失败不能影响连接
            }
        }
        if (ack) {
            ack({ ok: false, code: result.code, message: result.message, event: name });
            return undefined;
        }
        const error = new Error(result.message);
        error.data = { code: result.code, event: name };
        return next(error);
    };
}

/**
 * 校验客户端握手声明。
 * @returns {{ok: boolean, code?: string, message?: string, protocolVersion?: number, legacy?: boolean}}
 */
function authorizeHello(role, hello = {}) {
    const { negotiateProtocol } = require('./version');
    const negotiation = negotiateProtocol(hello?.protocolVersion);
    if (!negotiation.ok) {
        return { ok: false, code: negotiation.code, message: negotiation.message };
    }
    if (!roleAllows('any', role)) {
        return { ok: false, code: ERROR_CODES.ROLE_UNKNOWN, message: 'connection role is not resolved' };
    }
    return {
        ok: true,
        protocolVersion: negotiation.protocolVersion,
        clientVersion: negotiation.clientVersion,
        legacy: !!negotiation.legacy,
        role
    };
}

module.exports = { DEFAULT_SCOPES, authorizeEvent, createInboundGuard, authorizeHello };
