// Socket.IO 连接与握手等待。
//
// 设计：teacher-cross-platform-relay.md §6「教师应用 ↔ 教室 Hub：TLS 上的 Socket.IO，
// 教师应用主动发起连接；断线自动重连」。本模块只做三件事，业务状态全部留在 agent.js：
//   1. 建立 socket.io 连接（可注入 socketFactory，测试不碰网络）；
//   2. 按 Hub 的握手顺序等待 `session:accepted`（+ 非配对候选连接的 `classroom:snapshot`）；
//   3. 用带超时的 ack 发送事件，并把超时/底层异常包成 SessionAgentError。
//
// 重连由 agent 自己管理（reconnection:false）：设计要求"断线保留租约直到 TTL、
// 退避重连、重连后拉快照"，socket.io 的自动重连既不知道租约也不拉快照。

const { ERROR_CODES } = require('@lumesync/classroom-protocol');

const { SESSION_AGENT_ERROR_CODES, SessionAgentError, toSessionAgentError } = require('./errors');

const SESSION_ACCEPTED_EVENT = 'session:accepted';
const SNAPSHOT_EVENT = 'classroom:snapshot';
const IDENTITY_REJECTED_EVENT = 'identity-rejected';
const PROTOCOL_REJECTED_EVENT = 'protocol-rejected';

const DEFAULT_CONNECT_TIMEOUT_MS = 5000;
const DEFAULT_REQUEST_TIMEOUT_MS = 5000;

/** socket.io-client 的默认工厂；测试注入假工厂时不会 require 到网络实现。 */
function defaultSocketFactory(url, options) {
    const { io } = require('socket.io-client');
    return io(url, options);
}

/**
 * 组装 socket.io 连接选项：由代理自己重连，因此关闭内置 reconnection。
 *
 * 注意：协议版本**只能**放在 `auth` 里（Hub 的协商读 `handshake.auth.protocolVersion`）。
 * 不能把它当成 socket.io 的顶层选项：socket.io-client 会把未知选项透传给
 * engine.io-client 的 WebSocket 传输，而那里 `protocolVersion` 是 node `ws` 的
 * **WebSocket 协议版本**（默认 13），传契约版本 1 会让握手直接失效。
 */
function buildSocketOptions({ auth, connectTimeoutMs }) {
    return {
        auth,
        transports: ['websocket', 'polling'],
        reconnection: false,
        forceNew: true,
        timeout: connectTimeoutMs
    };
}

/**
 * 建立连接并等待握手完成。
 *
 * 调用方必须在调用前把常驻事件监听挂好（snapshot/lease/submission...），
 * 这样握手中的广播不会丢；本函数只临时监听握手相关的四个事件。
 *
 * @returns {Promise<{socket: object, accepted: object, snapshot: object|null, pairingOnly: boolean, classroomId: string}>}
 */
function openSocket({
    url,
    auth,
    socketFactory = defaultSocketFactory,
    scheduler,
    connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS,
    expectSnapshot = false,
    logger = null
}) {
    return new Promise((resolve, reject) => {
        let socket = null;
        let settled = false;
        let timer = null;

        const cleanup = () => {
            if (timer) scheduler.clearTimeout(timer);
            timer = null;
            if (!socket) return;
            socket.off(SESSION_ACCEPTED_EVENT, onAccepted);
            socket.off(SNAPSHOT_EVENT, onSnapshot);
            socket.off(IDENTITY_REJECTED_EVENT, onIdentityRejected);
            socket.off(PROTOCOL_REJECTED_EVENT, onProtocolRejected);
            socket.off('connect_error', onConnectError);
            socket.off('disconnect', onDisconnect);
        };

        const fail = (error) => {
            if (settled) return;
            settled = true;
            cleanup();
            try {
                if (socket) socket.close();
            } catch (_) {
                // 关闭失败不影响已经确定的错误
            }
            reject(error);
        };

        const succeed = (accepted, snapshot) => {
            if (settled) return;
            settled = true;
            cleanup();
            const envelope = accepted && typeof accepted === 'object' ? accepted : {};
            const payload = envelope.payload && typeof envelope.payload === 'object' ? envelope.payload : {};
            resolve({
                socket,
                accepted: envelope,
                snapshot: snapshot || null,
                pairingOnly: payload.pairingOnly === true,
                classroomId: String(envelope.classroomId || ''),
                sessionId: envelope.sessionId ? String(envelope.sessionId) : '',
                revision: Number.isInteger(envelope.revision) ? envelope.revision : null,
                role: payload.role || null,
                mode: payload.mode || null,
                clientId: payload.clientId ? String(payload.clientId) : ''
            });
        };

        let acceptedEnvelope = null;
        function onAccepted(envelope) {
            acceptedEnvelope = envelope && typeof envelope === 'object' ? envelope : {};
            const payload = acceptedEnvelope.payload && typeof acceptedEnvelope.payload === 'object' ? acceptedEnvelope.payload : {};
            if (payload.pairingOnly === true) {
                // 配对候选连接没有课堂快照（Hub 的守门只放行 teacher:pair.*）
                succeed(acceptedEnvelope, null);
                return;
            }
            if (!expectSnapshot) {
                succeed(acceptedEnvelope, null);
            }
        }
        function onSnapshot(snapshot) {
            if (!acceptedEnvelope) return;
            succeed(acceptedEnvelope, snapshot);
        }
        function onIdentityRejected(payload) {
            const body = payload && typeof payload === 'object' ? payload : {};
            fail(new SessionAgentError(
                SESSION_AGENT_ERROR_CODES.IDENTITY_REJECTED,
                `Hub 拒绝了身份：${body.message || body.code || 'identity-rejected'}`,
                { details: { code: body.code || null } }
            ));
        }
        function onProtocolRejected(payload) {
            const body = payload && typeof payload === 'object' ? payload : {};
            const inner = body.payload && typeof body.payload === 'object' ? body.payload : body;
            fail(new SessionAgentError(
                SESSION_AGENT_ERROR_CODES.PROTOCOL_REJECTED,
                `协议版本不兼容：${inner.message || inner.code || 'protocol-rejected'}`,
                { details: { code: inner.code || null } }
            ));
        }
        function onConnectError(error) {
            fail(new SessionAgentError(
                SESSION_AGENT_ERROR_CODES.CONNECT_FAILED,
                `无法连接 ${url}：${error && error.message ? error.message : error}`
            ));
        }
        function onDisconnect(reason) {
            fail(new SessionAgentError(
                SESSION_AGENT_ERROR_CODES.CONNECT_FAILED,
                `连接在握手完成前断开：${String(reason || '')}`
            ));
        }

        try {
            socket = socketFactory(url, buildSocketOptions({ auth, connectTimeoutMs }));
        } catch (error) {
            fail(toSessionAgentError(error, SESSION_AGENT_ERROR_CODES.CONNECT_FAILED, `无法连接 ${url}`));
            return;
        }

        if (!socket || typeof socket.on !== 'function' || typeof socket.emit !== 'function') {
            fail(new SessionAgentError(SESSION_AGENT_ERROR_CODES.CONNECT_FAILED, 'socketFactory 必须返回 socket.io 兼容对象'));
            return;
        }

        socket.on(SESSION_ACCEPTED_EVENT, onAccepted);
        socket.on(SNAPSHOT_EVENT, onSnapshot);
        socket.on(IDENTITY_REJECTED_EVENT, onIdentityRejected);
        socket.on(PROTOCOL_REJECTED_EVENT, onProtocolRejected);
        socket.on('connect_error', onConnectError);
        socket.on('disconnect', onDisconnect);

        timer = scheduler.setTimeout(() => {
            fail(new SessionAgentError(
                SESSION_AGENT_ERROR_CODES.CONNECT_TIMEOUT,
                `连接 ${url} 超时（${connectTimeoutMs}ms）`
            ));
        }, connectTimeoutMs);

        if (logger) logger.info(`[session-agent] 连接 ${url} role=${auth.role}${auth.token ? '（带凭证）' : '（配对候选）'}`);
    });
}

/**
 * 带超时的 ack 发送。Hub 的守卫对带 ack 的非法事件直接回 `{ok:false, code}`，
 * 因此正常路径不会靠超时判定失败；超时只用于 Hub 无响应/断线。
 */
function emitWithAck({ socket, scheduler, event, payload, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS }) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const timer = scheduler.setTimeout(() => {
            if (settled) return;
            settled = true;
            reject(new SessionAgentError(
                SESSION_AGENT_ERROR_CODES.REQUEST_TIMEOUT,
                `${event} 未在 ${timeoutMs}ms 内收到 Hub 回执`
            ));
        }, timeoutMs);

        const finish = (ack) => {
            if (settled) return;
            settled = true;
            scheduler.clearTimeout(timer);
            resolve(ack === undefined ? null : ack);
        };

        try {
            socket.emit(event, payload, finish);
        } catch (error) {
            if (settled) return;
            settled = true;
            scheduler.clearTimeout(timer);
            reject(toSessionAgentError(error, SESSION_AGENT_ERROR_CODES.SOCKET_ERROR, `${event} 发送失败`));
        }
    });
}

/** 连接被 Hub 主动断开（非本地 close）时用于日志的归一化原因。 */
function describeDisconnectReason(reason) {
    const text = String(reason === undefined || reason === null ? '' : reason);
    if (text === 'io server disconnect') return 'Hub 主动断开（可能是身份被撤销）';
    if (text === 'io client disconnect') return '本机主动断开';
    if (text === 'transport close') return '传输中断（网络掉线或 Hub 退出）';
    if (text === 'ping timeout') return '心跳超时';
    return text || 'unknown';
}

module.exports = {
    SESSION_ACCEPTED_EVENT,
    SNAPSHOT_EVENT,
    IDENTITY_REJECTED_EVENT,
    PROTOCOL_REJECTED_EVENT,
    DEFAULT_CONNECT_TIMEOUT_MS,
    DEFAULT_REQUEST_TIMEOUT_MS,
    ERROR_CODES,
    defaultSocketFactory,
    buildSocketOptions,
    openSocket,
    emitWithAck,
    describeDisconnectReason
};
