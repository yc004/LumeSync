// 教师端会话代理（session-agent）。
//
// 设计：[跨平台教师端与教室中继模式](../../../../docs/architecture/teacher-cross-platform-relay.md)
//   §4 功能归属、§5 验证码接入、§6 通信协议、§7 接入/交接/断线流程、§9 阶段 4。
// 参考：[教师端会话代理](../../../../docs/reference/session-agent.md)、[教室 Hub](../../../../docs/reference/classroom-hub.md)。
//
// 一个客户端覆盖两种模式，业务 UI 不直接拼 Hub URL、不自己维护重连：
//   direct —— 连接本机教师服务/Hub（host token），用契约里已声明的旧事件名发课堂命令；
//   relay  —— mDNS 搜索教室 → 配对候选连接 → 验证码证明 → 断开重连换取课堂权限 →
//             唯一授课租约 → HTTPS 上传课件 → course:stage/course:publish →
//             classroom:command（带 leaseId+epoch）→ 提交落盘回执。
//
// 硬性约束：
//   - 验证码只由用户在固定机屏幕上读取后传入，代理**永不**获取、回显或记录验证码；
//   - 设备凭证、租约只存在于内存（endSession/释放租约后清除），不写磁盘；
//   - 所有失败都是 `{code, message, attemptsLeft?}` 的类型化错误，绝不透出 socket.io 对象；
//   - 快照按 revision 防护，过期快照直接丢弃。

const crypto = require('node:crypto');
const fsp = require('node:fs/promises');

const {
    PROTOCOL_VERSION,
    ERROR_CODES,
    PAIRING_MAX_ATTEMPTS,
    PAIRING_TTL_MS,
    createPairingProof,
    isWellFormedCode,
    validateClassroomSnapshot
} = require('@lumesync/classroom-protocol');
const { readLumeFile } = require('@lumesync/course-format/node');
const { computeCourseHash } = require('@lumesync/course-format');

const {
    SESSION_AGENT_ERROR_CODES,
    LEASE_LOST_CODES,
    PAIRING_RESET_CODES,
    SessionAgentError,
    toSessionAgentError,
    errorFromAck,
    isSessionAgentError
} = require('./errors');
const { createBackoff, computeRenewDelay, DEFAULT_RECONNECT, DEFAULT_RENEW } = require('./backoff');
const {
    DNS_SD_SERVICE_TYPE,
    DEFAULT_BROWSE_TIMEOUT_MS,
    createRelayBrowser,
    createBonjourTransport
} = require('./discovery');
const { createClassroomRegistry } = require('./registry');
const {
    DIRECT_MODE_COMMAND_EVENTS,
    listStudentEventNames,
    normalizeCommand,
    toDirectModeEvent,
    applyCommandLocally
} = require('./commands');
const transport = require('./transport');

const DEFAULT_HUB_URL = 'http://127.0.0.1:3000';
const DEFAULT_DISCOVERY_TIMEOUT_MS = DEFAULT_BROWSE_TIMEOUT_MS;
const CREDENTIAL_SKEW_MS = 1000;
const LEASE_EXPIRY_GRACE_MS = 25;
const MAX_TRACKED_IDS = 500;

const EVENT_NAMES = ['snapshot', 'submission', 'student-event', 'lease', 'pairing', 'status', 'error', 'course-published', 'discovery'];

/** 极小的事件发射器：不用 node:events，避免 'error' 无监听时抛出（库不应因此崩溃）。 */
function createEmitter({ logger = null } = {}) {
    const handlers = new Map();
    function on(event, handler) {
        if (typeof handler !== 'function') throw new TypeError('on(event, handler) 需要函数处理器');
        const set = handlers.get(event) || new Set();
        set.add(handler);
        handlers.set(event, set);
        return () => off(event, handler);
    }
    function off(event, handler) {
        const set = handlers.get(event);
        if (!set) return false;
        const removed = set.delete(handler);
        if (set.size === 0) handlers.delete(event);
        return removed;
    }
    function emit(event, payload) {
        const set = handlers.get(event);
        if (!set || set.size === 0) return 0;
        let delivered = 0;
        for (const handler of Array.from(set)) {
            try {
                handler(payload);
                delivered += 1;
            } catch (error) {
                // 监听器异常不能影响课堂流程，也不能递归触发 error 处理器
                if (logger) logger.error(`[session-agent] ${event} 监听器异常：${error && error.message ? error.message : error}`);
            }
        }
        return delivered;
    }
    return {
        on,
        off,
        emit,
        eventNames: () => Array.from(handlers.keys()),
        listenerCount: (event) => (handlers.get(event) ? handlers.get(event).size : 0)
    };
}

function createDefaultScheduler({ unrefTimers = true } = {}) {
    return {
        setTimeout(handler, delayMs) {
            const timer = setTimeout(handler, Math.max(0, Number(delayMs) || 0));
            // 库不应用定时器把宿主进程钉住（Electron/CLI 都可能在没有其它句柄时退出）
            if (unrefTimers && timer && typeof timer.unref === 'function') timer.unref();
            return timer;
        },
        clearTimeout(timer) {
            if (timer) clearTimeout(timer);
        }
    };
}

async function defaultHttpRequest(url, options) {
    const response = await fetch(url, options);
    let body = null;
    try {
        body = await response.json();
    } catch (_) {
        body = null;
    }
    return { status: response.status, ok: response.ok, body };
}

function buildHubUrl({ address, port, secure = false }) {
    const host = String(address || '').trim();
    if (!host) throw new SessionAgentError(SESSION_AGENT_ERROR_CODES.INVALID_OPTION, 'connect 需要 address（或直接给 hubUrl）');
    const numericPort = Number(port);
    if (!Number.isInteger(numericPort) || numericPort <= 0 || numericPort > 65535) {
        throw new SessionAgentError(SESSION_AGENT_ERROR_CODES.INVALID_OPTION, 'connect 需要 1..65535 的 port');
    }
    const hostPart = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
    return `${secure ? 'https' : 'http'}://${hostPart}:${numericPort}`;
}

/**
 * 创建教师端会话代理。**不进行任何 I/O**：连接由 connect()（或直接模式下的第一条命令）发起。
 *
 * @param {object} options
 * @param {'direct'|'relay'} options.mode
 * @param {string} options.deviceKey 教师设备身份；中继模式会写入配对请求并绑定设备凭证（契约要求 8..256 字符）
 * @param {string} [options.deviceName] 固定机屏幕上显示的设备名
 * @param {string} [options.hubUrl] direct 模式的 Hub 地址（默认 http://127.0.0.1:3000）；relay 模式可覆盖发现结果
 * @param {string} [options.hostToken] direct 模式的 host 凭证（Hub/LUMESYNC_HOST_TOKEN）
 * @param {string} [options.address] relay 模式默认地址（手动输入地址的入口）
 * @param {number} [options.port] relay 模式默认端口
 * @param {boolean} [options.secure] 用 https/wss 组装 URL（Hub 目前只有明文 HTTP，留给 TLS 落地后使用）
 * @param {string} [options.classroomsDir] 教室登记表目录（记住搜到过的教室，供手动连接）
 * @param {object} [options.logger] {info,warn,error,debug}
 * @param {() => number} [options.now] 时钟注入（测试用）
 * @param {object} [options.discoveryTransport] mDNS 传输注入（{browse,destroy}）；测试绝不碰网络
 * @param {Function} [options.socketFactory] socket.io 工厂注入（默认 socket.io-client 的 io）
 * @param {Function} [options.httpRequest] HTTP 注入（默认 fetch 包装）
 * @param {object} [options.scheduler] {setTimeout,clearTimeout} 注入
 * @param {() => number} [options.random] 抖动随机数注入
 * @param {object} [options.reconnect] 退避参数覆盖 {baseMs,maxMs,factor,jitterRatio}
 * @param {object} [options.renew] 续租参数覆盖 {fraction,jitterRatio,minDelayMs}
 * @param {number} [options.connectTimeoutMs]
 * @param {number} [options.requestTimeoutMs]
 * @param {number} [options.discoveryTimeoutMs]
 * @param {number} [options.leaseTtlMs] 契约未给 expiresAt 时的 TTL 兜底
 */
function createSessionAgent(options = {}) {
    const mode = options.mode === undefined ? 'direct' : String(options.mode);
    if (mode !== 'direct' && mode !== 'relay') {
        throw new SessionAgentError(SESSION_AGENT_ERROR_CODES.INVALID_OPTION, `mode 必须是 'direct' 或 'relay'，收到：${mode}`);
    }
    const deviceKey = String(options.deviceKey || '').trim();
    if (!deviceKey) {
        throw new SessionAgentError(SESSION_AGENT_ERROR_CODES.INVALID_OPTION, 'deviceKey 必填（教师设备身份）');
    }
    if (deviceKey.length > 256) {
        throw new SessionAgentError(SESSION_AGENT_ERROR_CODES.INVALID_OPTION, 'deviceKey 不能超过 256 字符');
    }
    if (mode === 'relay' && deviceKey.length < 8) {
        throw new SessionAgentError(
            SESSION_AGENT_ERROR_CODES.INVALID_OPTION,
            '中继模式的 deviceKey 至少 8 字符（契约 teacher:pair.request 的 schema 要求，绑定设备凭证）'
        );
    }
    const hostToken = options.hostToken === undefined ? '' : String(options.hostToken);
    if (mode === 'direct' && !hostToken) {
        throw new SessionAgentError(SESSION_AGENT_ERROR_CODES.INVALID_OPTION, 'direct 模式需要 hostToken（Hub 的 LUMESYNC_HOST_TOKEN）');
    }

    const logger = options.logger || { info() {}, warn() {}, error() {}, debug() {} };
    const now = typeof options.now === 'function' ? options.now : () => Date.now();
    const random = typeof options.random === 'function' ? options.random : Math.random;
    const scheduler = options.scheduler || createDefaultScheduler({ unrefTimers: options.unrefTimers !== false });
    const connectTimeoutMs = Number(options.connectTimeoutMs) > 0 ? Number(options.connectTimeoutMs) : transport.DEFAULT_CONNECT_TIMEOUT_MS;
    const requestTimeoutMs = Number(options.requestTimeoutMs) > 0 ? Number(options.requestTimeoutMs) : transport.DEFAULT_REQUEST_TIMEOUT_MS;
    const discoveryTimeoutMs = Number(options.discoveryTimeoutMs) > 0 ? Number(options.discoveryTimeoutMs) : DEFAULT_DISCOVERY_TIMEOUT_MS;
    const leaseTtlMs = Number(options.leaseTtlMs) > 0 ? Number(options.leaseTtlMs) : 60000;
    const socketFactory = typeof options.socketFactory === 'function' ? options.socketFactory : transport.defaultSocketFactory;
    const httpRequest = typeof options.httpRequest === 'function' ? options.httpRequest : defaultHttpRequest;
    const secure = options.secure === true;
    const reconnectOptions = { ...DEFAULT_RECONNECT, ...(options.reconnect || {}), random };
    const renewOptions = { ...DEFAULT_RENEW, ...(options.renew || {}) };

    const emitter = createEmitter({ logger });
    const backoff = createBackoff(reconnectOptions);
    const registry = createClassroomRegistry({ dir: options.classroomsDir || null, logger, now });

    const studentEventNames = listStudentEventNames();

    // ---------------------------------------------------------------- 状态
    const state = {
        status: 'idle',
        closed: false,
        hubUrl: '',
        classroomId: '',
        address: '',
        port: null,
        sessionId: '',
        revision: 0,
        courseId: null,
        slideIndex: 0,
        hostSettings: {},
        pairingOnly: false,
        role: null,
        clientId: '',
        lastSnapshotAt: null
    };
    let socket = null;
    let serverInfo = null;
    let deviceToken = '';
    let deviceTokenExpiresAt = 0;
    let credentialClassroomId = '';
    let pendingPairing = null;
    let lease = null;
    let renewTimer = null;
    let leaseExpiryTimer = null;
    let reconnectTimer = null;
    let inFlight = { pair: 0, verify: 0, lease: 0 };
    let requestCounter = 0;
    const pendingSubmissions = new Map();
    const seenSubmissionIds = new Set();

    function emit(event, payload) {
        return emitter.emit(event, payload);
    }

    function emitError(error) {
        emit('error', isSessionAgentError(error) ? error : toSessionAgentError(error));
    }

    function setStatus(status, info = {}) {
        state.status = status;
        emit('status', { status, mode, classroomId: state.classroomId || null, ...info });
    }

    function nextRequestId(prefix = 'req') {
        requestCounter += 1;
        return `${prefix}-${now().toString(36)}-${requestCounter.toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
    }

    function closedError() {
        return new SessionAgentError(SESSION_AGENT_ERROR_CODES.CLOSED, '会话已结束（endSession 已调用），请重新创建会话代理');
    }

    function requireRelay(action) {
        if (mode !== 'relay') {
            throw new SessionAgentError(
                SESSION_AGENT_ERROR_CODES.MODE_UNSUPPORTED,
                `${action} 只在教室中继模式可用（当前 mode=${mode}）`
            );
        }
    }

    // ---------------------------------------------------------------- 快照
    function applyRevision(revision) {
        if (Number.isInteger(revision) && revision > state.revision) state.revision = revision;
    }

    /**
     * 应用权威快照（Hub 广播或主动拉取）。
     * revision 防护：同一 sessionId 下 revision 更小的快照说明是乱序广播，直接丢弃；
     * sessionId 变化说明 Hub 重启（内存态丢失），接受新会话并广播 session-reset。
     */
    function applySnapshot(snapshot) {
        const validation = validateClassroomSnapshot(snapshot);
        if (!validation.ok) {
            emitError(new SessionAgentError(
                ERROR_CODES.EVENT_PAYLOAD_INVALID,
                'classroom:snapshot 不符合契约 schema，已忽略',
                { details: { errors: validation.errors } }
            ));
            return false;
        }
        const value = validation.value;
        const previousSessionId = state.sessionId;
        if (previousSessionId && value.sessionId === previousSessionId && value.revision < state.revision) {
            return false;
        }
        const sessionChanged = !!previousSessionId && value.sessionId !== previousSessionId;
        state.sessionId = value.sessionId;
        state.revision = value.revision;
        state.courseId = value.currentCourseId === undefined ? null : value.currentCourseId;
        state.slideIndex = Number.isInteger(value.currentSlideIndex) ? value.currentSlideIndex : 0;
        state.hostSettings = value.hostSettings && typeof value.hostSettings === 'object' ? { ...value.hostSettings } : {};
        state.lastSnapshotAt = now();
        if (sessionChanged) {
            setStatus('session-reset', { sessionId: value.sessionId, revision: value.revision });
            if (lease) {
                // Hub 重启：内存态（含租约）已丢失，本地租约不可能继续有效
                expireLease('hub-session-reset');
            }
        }
        emit('snapshot', {
            classroomId: state.classroomId || null,
            sessionId: state.sessionId,
            revision: state.revision,
            courseId: state.courseId,
            slideIndex: state.slideIndex,
            hostSettings: { ...state.hostSettings },
            snapshot: value,
            receivedAt: state.lastSnapshotAt
        });
        return true;
    }

    // ---------------------------------------------------------------- 租约
    function clearRenewTimer() {
        if (renewTimer) scheduler.clearTimeout(renewTimer);
        renewTimer = null;
    }

    function clearLeaseExpiryTimer() {
        if (leaseExpiryTimer) scheduler.clearTimeout(leaseExpiryTimer);
        leaseExpiryTimer = null;
    }

    function scheduleLeaseExpiry() {
        clearLeaseExpiryTimer();
        if (!lease) return;
        const delay = Math.max(0, lease.expiresAt - now()) + LEASE_EXPIRY_GRACE_MS;
        leaseExpiryTimer = scheduler.setTimeout(() => {
            leaseExpiryTimer = null;
            if (!lease) return;
            if (now() >= lease.expiresAt - LEASE_EXPIRY_GRACE_MS) expireLease('ttl-elapsed');
            else scheduleLeaseExpiry();
        }, delay);
    }

    function scheduleRenew() {
        clearRenewTimer();
        if (!lease || state.closed) return;
        const delay = computeRenewDelay({
            expiresAt: lease.expiresAt,
            now: now(),
            fallbackTtlMs: leaseTtlMs,
            fraction: renewOptions.fraction,
            jitterRatio: renewOptions.jitterRatio,
            minDelayMs: renewOptions.minDelayMs,
            random
        });
        renewTimer = scheduler.setTimeout(() => {
            renewTimer = null;
            void autoRenew();
        }, delay);
    }

    function setLease(next, { source = 'granted' } = {}) {
        const previousEpoch = lease ? lease.epoch : null;
        lease = {
            leaseId: String(next.leaseId),
            epoch: Number(next.epoch),
            expiresAt: Number(next.expiresAt),
            classroomId: String(next.classroomId || state.classroomId || ''),
            renewals: Number.isInteger(next.renewals) ? next.renewals : 0,
            grantedAt: Number.isInteger(next.grantedAt) ? next.grantedAt : now()
        };
        scheduleLeaseExpiry();
        scheduleRenew();
        return { ...lease, source, previousEpoch };
    }

    /**
     * 租约失效：清空本地租约并广播 `lease-expired`（课堂进入等待教师）。
     * 设计 §7：租约过期后**不**自动重新获取，必须由教师重新完成一次验证码授权。
     */
    function expireLease(reason) {
        if (!lease) return false;
        const previous = lease;
        lease = null;
        clearRenewTimer();
        clearLeaseExpiryTimer();
        emit('lease', { kind: 'expired', leaseId: previous.leaseId, epoch: previous.epoch, reason: String(reason || ''), expiresAt: previous.expiresAt });
        setStatus('lease-expired', { reason: String(reason || ''), epoch: previous.epoch });
        return true;
    }

    async function autoRenew() {
        if (!lease || state.closed) return;
        if (!isConnected()) {
            // 断线期间不假装续租成功：租约时钟继续走，到期由 scheduleLeaseExpiry 广播 lease-expired
            scheduleRenew();
            return;
        }
        try {
            await renewLease({ reason: 'auto' });
        } catch (error) {
            emitError(error);
            if (!LEASE_LOST_CODES.has(error.code)) scheduleRenew();
        }
    }

    // ---------------------------------------------------------------- 连接
    function isConnected() {
        return !!socket && socket.connected !== false;
    }

    function attachSocketHandlers(current) {
        current.on('classroom:snapshot', (snapshot) => applySnapshot(snapshot));

        current.on('course:published', (envelope) => {
            const payload = envelope && typeof envelope === 'object' && envelope.payload && typeof envelope.payload === 'object'
                ? envelope.payload
                : (envelope || {});
            if (Number.isInteger(envelope && envelope.revision)) applyRevision(envelope.revision);
            emit('course-published', {
                courseId: payload.courseId ? String(payload.courseId) : null,
                courseHash: payload.courseHash ? String(payload.courseHash) : null,
                previousCourseHash: payload.previousCourseHash ? String(payload.previousCourseHash) : null,
                requestId: envelope && envelope.requestId ? String(envelope.requestId) : null,
                revision: Number.isInteger(envelope && envelope.revision) ? envelope.revision : state.revision
            });
        });

        current.on('teacher:lease.granted', (payload) => {
            if (!payload || payload.ok !== true || !payload.leaseId) return;
            if (lease && lease.leaseId === payload.leaseId && lease.epoch === payload.epoch) return;
            const adopted = setLease(payload, { source: 'event' });
            emit('lease', { ...adopted, kind: 'granted', source: 'event' });
        });

        current.on('teacher:lease.revoked', (payload) => {
            const body = payload && typeof payload === 'object' ? payload : {};
            const epoch = Number(body.epoch);
            const reason = String(body.reason || 'revoked');
            if (!lease) return;
            if (Number.isInteger(epoch) && epoch > lease.epoch) {
                const previousEpoch = lease.epoch;
                expireLease(`epoch-advanced:${reason}`);
                emit('lease', { kind: 'revoked', reason, epoch, previousEpoch, byEpochAdvance: true });
                return;
            }
            const expiredEpoch = lease.epoch;
            expireLease(reason);
            emit('lease', { kind: 'revoked', reason, epoch: Number.isInteger(epoch) ? epoch : expiredEpoch });
        });

        current.on('teacher:pair.challenge', (payload) => {
            if (!payload || typeof payload !== 'object' || !payload.requestId) return;
            if (!pendingPairing || pendingPairing.requestId !== String(payload.requestId)) return;
            if (payload.nonce) pendingPairing.nonce = String(payload.nonce);
            if (Number.isInteger(payload.expiresAt)) pendingPairing.expiresAt = payload.expiresAt;
        });

        current.on('teacher:pair.accepted', (payload) => {
            if (!payload || payload.ok !== true || !payload.deviceToken) return;
            if (inFlight.verify <= 0 && !deviceToken) {
                // 没有发起验证却收到凭证：不静默采纳（可能被同教室的其它请求串号）
                emitError(new SessionAgentError(ERROR_CODES.EVENT_FORBIDDEN, '收到未请求的 teacher:pair.accepted，已忽略'));
                return;
            }
            storeCredential(payload);
        });

        current.on('teacher:pair.rejected', (payload) => {
            if (inFlight.pair > 0 || inFlight.verify > 0 || inFlight.lease > 0) return; // ack 路径负责
            const error = errorFromAck(payload, ERROR_CODES.EVENT_FORBIDDEN, 'Hub 拒绝了配对请求');
            emit('pairing', { kind: 'rejected', code: error.code, attemptsLeft: error.attemptsLeft, requestId: payload && payload.requestId ? String(payload.requestId) : null });
            emitError(error);
        });

        current.on('relay:status', (payload) => {
            const relay = payload && typeof payload === 'object' ? payload : {};
            emit('status', {
                status: 'relay-status',
                mode,
                classroomId: state.classroomId || null,
                relayState: relay.relay ? relay.relay.state : null,
                relayLabel: relay.relay ? relay.relay.discoveryLabel || relay.relay.label || null : null,
                awaitingTeacher: !!relay.awaitingTeacher,
                queue: relay.queue || null
            });
        });

        current.on('submission:forwarded', (payload) => handleSubmissionForwarded(payload));
        // 直接模式的 Hub 会同时发旧事件名（同一 submissionId）：按 submissionId 去重
        current.on('student:submit', (payload) => handleSubmissionForwarded(payload));
        current.on('submission:delivered:ack', (payload) => {
            const body = payload && typeof payload === 'object' ? payload : {};
            const submissionId = String(body.submissionId || '');
            if (submissionId) pendingSubmissions.delete(submissionId);
            emit('status', {
                status: 'submission-delivered',
                submissionId: submissionId || null,
                pendingCount: Number.isInteger(body.pendingCount) ? body.pendingCount : pendingSubmissions.size
            });
        });

        current.on('student-status', (payload) => emitStudentEvent('student-status', payload));
        for (const name of studentEventNames) {
            current.on(name, (payload) => emitStudentEvent(name, payload));
        }

        current.on('connect_error', (error) => {
            emitError(new SessionAgentError(
                SESSION_AGENT_ERROR_CODES.CONNECT_FAILED,
                `连接错误：${error && error.message ? error.message : error}`
            ));
        });
        current.on('error', (error) => {
            emitError(toSessionAgentError(error, SESSION_AGENT_ERROR_CODES.SOCKET_ERROR, 'socket.io 客户端错误'));
        });
        current.on('disconnect', (reason) => {
            if (socket !== current) return; // 旧连接（主动关闭/换连接）的断线回调
            onSocketDisconnect(reason);
        });
    }

    function emitStudentEvent(type, payload) {
        emit('student-event', {
            type,
            payload,
            classroomId: state.classroomId || null,
            receivedAt: now()
        });
    }

    function handleSubmissionForwarded(payload) {
        if (!payload || typeof payload !== 'object') return false;
        const submissionId = String(payload.submissionId || '').trim();
        if (!submissionId) return false;
        if (seenSubmissionIds.has(submissionId)) return false;
        seenSubmissionIds.add(submissionId);
        while (seenSubmissionIds.size > MAX_TRACKED_IDS) {
            const oldest = seenSubmissionIds.values().next().value;
            seenSubmissionIds.delete(oldest);
        }
        pendingSubmissions.set(submissionId, {
            submissionId,
            fileName: payload.fileName ? String(payload.fileName) : '',
            courseId: payload.courseId ? String(payload.courseId) : '',
            sizeBytes: Number(payload.sizeBytes) || 0,
            receivedAt: Number(payload.receivedAt) || now(),
            forwardedAt: now()
        });
        emit('submission', {
            submissionId,
            courseId: payload.courseId ? String(payload.courseId) : null,
            clientIp: payload.clientIp ? String(payload.clientIp) : null,
            clientId: payload.clientId ? String(payload.clientId) : null,
            fileName: payload.fileName ? String(payload.fileName) : '',
            mergeFile: !!payload.mergeFile,
            content: payload.content === undefined ? null : payload.content,
            sizeBytes: Number(payload.sizeBytes) || 0,
            receivedAt: Number(payload.receivedAt) || now(),
            queueSize: Number.isInteger(payload.queueSize) ? payload.queueSize : null,
            pendingCount: pendingSubmissions.size,
            raw: payload
        });
        return true;
    }

    function storeCredential(payload) {
        const expiresAt = Date.parse(String(payload.expiresAt || ''));
        deviceToken = String(payload.deviceToken || '');
        deviceTokenExpiresAt = Number.isFinite(expiresAt) ? expiresAt : now() + 8 * 60 * 60 * 1000;
        credentialClassroomId = String(payload.classroomId || state.classroomId || '');
        if (!state.classroomId) state.classroomId = credentialClassroomId;
        return { expiresAt: deviceTokenExpiresAt, classroomId: credentialClassroomId };
    }

    function clearCredential(reason) {
        const had = !!deviceToken;
        deviceToken = '';
        deviceTokenExpiresAt = 0;
        credentialClassroomId = '';
        if (had) logger.info(`[session-agent] 已清除设备凭证（${reason}）`);
        return had;
    }

    function closeSocket() {
        const current = socket;
        socket = null; // 先清空：disconnect 回调据此判断这是主动关闭
        if (!current) return;
        try {
            current.close();
        } catch (error) {
            logger.warn(`[session-agent] 关闭连接失败：${error && error.message ? error.message : error}`);
        }
    }

    /** 模拟 Hub/网络侧断开（测试与诊断用）；与真实断线走同一条处理路径。 */
    function dropConnection(reason = 'transport close') {
        const current = socket;
        if (!current) return false;
        socket = null;
        try {
            current.close();
        } catch (_) {
            // 已断开
        }
        onSocketDisconnect(reason);
        return true;
    }

    function onSocketDisconnect(reason) {
        const description = transport.describeDisconnectReason(reason);
        serverInfo = null;
        if (state.closed) return;
        setStatus('disconnected', { reason: description, leaseKept: !!lease, leaseExpiresAt: lease ? lease.expiresAt : null });
        if (mode === 'relay' && !state.pairingOnly) {
            // 设计 §7：断线保留租约直到 TTL，退避重连，重连后拉快照恢复
            scheduleReconnect(description);
        }
    }

    function scheduleReconnect(reason) {
        if (state.closed || mode !== 'relay' || !state.hubUrl) return;
        if (reconnectTimer) return;
        const attempt = backoff.attempt + 1;
        const delayMs = backoff.next();
        setStatus('reconnecting', { attempt, delayMs, reason });
        reconnectTimer = scheduler.setTimeout(() => {
            reconnectTimer = null;
            void attemptReconnect(attempt);
        }, delayMs);
    }

    async function attemptReconnect(attempt) {
        if (state.closed || isConnected()) return;
        try {
            const opened = await openSocketWithAuth({ useCredential: true });
            if (opened.pairingOnly) {
                // 期望用设备凭证接入却拿到配对候选连接：凭证已不可用，不静默降级
                closeSocket();
                clearCredential('pairing-only-on-reconnect');
                emit('pairing', { kind: 'credential-cleared', reason: 'pairing_only_reconnect' });
                setStatus('pairing-required', { reason: 'pairing_only_reconnect' });
                backoff.reset();
                return;
            }
            backoff.reset();
            adoptConnection(opened);
            setStatus('connected', { reconnected: true, attempt, pairingOnly: false });
            await requestSnapshot();
            await resumeLeaseAfterReconnect();
        } catch (error) {
            const typed = toSessionAgentError(error);
            emitError(typed);
            if (typed.code === SESSION_AGENT_ERROR_CODES.IDENTITY_REJECTED
                || typed.code === SESSION_AGENT_ERROR_CODES.PROTOCOL_REJECTED
                || typed.code === SESSION_AGENT_ERROR_CODES.CLASSROOM_MISMATCH) {
                // 设备凭证已被撤销（释放/管理员撤销/交接）或协议不兼容：不静默重试、不静默降级
                clearCredential('credential-rejected');
                emit('pairing', { kind: 'credential-cleared', reason: 'host_auth_failed' });
                setStatus('pairing-required', { reason: typed.code });
                backoff.reset();
                return;
            }
            scheduleReconnect(typed.code);
        }
    }

    async function resumeLeaseAfterReconnect() {
        if (!lease) return;
        if (now() >= lease.expiresAt) {
            expireLease('ttl-elapsed-while-offline');
            return;
        }
        try {
            await renewLease({ reason: 'reconnected' });
        } catch (error) {
            emitError(error);
            if (!LEASE_LOST_CODES.has(error.code)) scheduleRenew();
        }
    }

    function adoptConnection(opened) {
        socket = opened.socket;
        serverInfo = opened;
        state.pairingOnly = opened.pairingOnly === true;
        state.role = opened.role || null;
        state.clientId = opened.clientId || deviceKey;
        if (opened.classroomId) state.classroomId = String(opened.classroomId);
        if (opened.snapshot) {
            // 握手时 Hub 已经发了权威快照：必须在挂常驻监听前就应用，
            // 否则这次快照会被 openSocket 的临时监听消费掉，本地状态要等到下一次广播才正确。
            applySnapshot(opened.snapshot);
        } else if (opened.sessionId) {
            state.sessionId = String(opened.sessionId);
        }
        if (Number.isInteger(opened.revision)) applyRevision(opened.revision);
        attachSocketHandlers(socket);
        return opened;
    }

    async function openSocketWithAuth({ useCredential }) {
        const auth = { role: 'host', clientId: deviceKey, protocolVersion: PROTOCOL_VERSION };
        if (useCredential && deviceToken) auth.token = deviceToken;
        const opened = await transport.openSocket({
            url: state.hubUrl,
            auth,
            socketFactory,
            scheduler,
            logger,
            connectTimeoutMs,
            expectSnapshot: useCredential
        });
        return opened;
    }

    async function requestSnapshot() {
        if (!isConnected() || state.pairingOnly) return false;
        try {
            socket.emit('request-classroom-snapshot');
            return true;
        } catch (error) {
            emitError(toSessionAgentError(error, SESSION_AGENT_ERROR_CODES.SOCKET_ERROR, '拉取课堂快照失败'));
            return false;
        }
    }

    // ---------------------------------------------------------------- 连接（公开）
    async function connect(target = {}) {
        if (state.closed) throw closedError();
        if (isConnected()) return connectionInfo();
        if (mode === 'direct') return connectDirect(target);
        return connectRelay(target);
    }

    function connectionInfo() {
        return {
            mode,
            hubUrl: state.hubUrl,
            classroomId: state.classroomId || null,
            sessionId: state.sessionId || null,
            revision: state.revision,
            role: state.role,
            pairingOnly: !!state.pairingOnly,
            paired: !!deviceToken,
            status: state.status
        };
    }

    async function connectDirect(target) {
        const url = String(target.hubUrl || options.hubUrl || DEFAULT_HUB_URL);
        state.hubUrl = url;
        state.address = '';
        state.port = null;
        setStatus('connecting', { hubUrl: url });
        let opened;
        try {
            opened = await transport.openSocket({
                url,
                auth: { role: 'host', clientId: deviceKey, token: hostToken, protocolVersion: PROTOCOL_VERSION },
                socketFactory,
                scheduler,
                logger,
                connectTimeoutMs,
                expectSnapshot: true
            });
        } catch (error) {
            const typed = toSessionAgentError(error, SESSION_AGENT_ERROR_CODES.CONNECT_FAILED);
            setStatus('connect-failed', { reason: typed.code });
            throw typed;
        }
        adoptConnection(opened);
        setStatus('connected', { hubUrl: url, pairingOnly: false });
        return connectionInfo();
    }

    async function connectRelay(target) {
        const url = String(target.hubUrl || '') || buildHubUrl({
            address: target.address === undefined ? options.address : target.address,
            port: target.port === undefined ? options.port : target.port,
            secure: target.secure === undefined ? secure : target.secure === true
        });
        const requestedClassroomId = target.classroomId === undefined
            ? String(options.classroomId || '')
            : String(target.classroomId);
        const requestedPort = target.port === undefined ? options.port : target.port;
        state.hubUrl = url;
        state.address = target.address === undefined ? String(options.address || '') : String(target.address || '');
        state.port = Number.isInteger(Number(requestedPort)) && Number(requestedPort) > 0 ? Number(requestedPort) : null;

        let useCredential = !!deviceToken;
        if (useCredential) {
            const expired = deviceTokenExpiresAt - now() <= CREDENTIAL_SKEW_MS;
            const otherClassroom = requestedClassroomId && credentialClassroomId && credentialClassroomId !== requestedClassroomId;
            if (expired || otherClassroom) {
                const reason = expired ? 'credential-expired' : 'classroom-changed';
                clearCredential(reason);
                emit('pairing', { kind: expired ? 'credential-expired' : 'credential-cleared', reason });
                useCredential = false;
            }
        }

        setStatus('connecting', { hubUrl: url, pairingOnly: !useCredential });
        let opened;
        try {
            opened = await openSocketWithAuth({ useCredential });
        } catch (error) {
            const typed = toSessionAgentError(error, SESSION_AGENT_ERROR_CODES.CONNECT_FAILED);
            if (useCredential && typed.code === SESSION_AGENT_ERROR_CODES.IDENTITY_REJECTED) {
                // 带了凭证但被 Hub 拒绝（已撤销/交接/换密钥）：清凭证后按配对候选连接重开，
                // 并明确上报错误——不静默降级（Hub 侧同样不静默降级）。
                emitError(typed);
                clearCredential('host_auth_failed');
                emit('pairing', { kind: 'credential-cleared', reason: 'host_auth_failed' });
                opened = await openSocketWithAuth({ useCredential: false });
            } else {
                setStatus('connect-failed', { reason: typed.code });
                throw typed;
            }
        }

        adoptConnection(opened);
        const reportedClassroomId = String(opened.classroomId || '');
        if (requestedClassroomId && reportedClassroomId && requestedClassroomId !== reportedClassroomId) {
            closeSocket();
            const error = new SessionAgentError(
                SESSION_AGENT_ERROR_CODES.CLASSROOM_MISMATCH,
                `连接的教室是 ${reportedClassroomId}，与请求的 ${requestedClassroomId} 不一致`
            );
            setStatus('connect-failed', { reason: error.code });
            throw error;
        }
        if (reportedClassroomId) state.classroomId = reportedClassroomId;
        setStatus(state.pairingOnly ? 'pairing-required' : 'connected', { hubUrl: url, pairingOnly: !!state.pairingOnly });
        return connectionInfo();
    }

    async function ensureConnected() {
        if (isConnected()) return connectionInfo();
        return connect({});
    }

    // ---------------------------------------------------------------- 发现
    let browser = null;
    /** 搜索器：注入了 discoveryTransport/options.discover 时用注入的，否则用 bonjour-service（懒加载）。 */
    function getBrowser() {
        if (browser) return browser;
        const injected = options.discoveryTransport
            || (typeof options.discover === 'function' ? { browse: options.discover } : null);
        browser = createRelayBrowser({
            transport: injected || ensureDiscoveryTransport(),
            protocolVersion: PROTOCOL_VERSION,
            serviceType: options.discoveryServiceType || DNS_SD_SERVICE_TYPE,
            defaultTimeoutMs: discoveryTimeoutMs
        });
        return browser;
    }

    /** 生产环境使用的发现传输（bonjour-service）；只有未注入 discoveryTransport 时才会被创建。 */
    function ensureDiscoveryTransport() {
        if (options.discoveryTransport) return options.discoveryTransport;
        if (!options._bonjourTransport) options._bonjourTransport = createBonjourTransport({ logger });
        return options._bonjourTransport;
    }

    async function discover(discoverOptions = {}) {
        requireRelay('discover');
        const rejected = [];
        let live = [];
        let failure = null;
        try {
            live = await getBrowser().browse({
                timeoutMs: discoverOptions.timeoutMs === undefined ? discoveryTimeoutMs : discoverOptions.timeoutMs,
                rejected
            });
        } catch (error) {
            failure = toSessionAgentError(error, SESSION_AGENT_ERROR_CODES.DISCOVERY_FAILED);
            emitError(failure);
            if (discoverOptions.throwOnFailure) throw failure;
            live = [];
        }
        const classrooms = await registry.merge(live);
        emit('discovery', {
            classrooms,
            liveCount: live.length,
            rejectedCount: rejected.length,
            rejected: discoverOptions.includeRejected ? rejected : undefined,
            failed: failure ? failure.code : null
        });
        return classrooms;
    }

    async function listKnownClassrooms() {
        return registry.list();
    }

    async function closeDiscovery() {
        const discoveryTransport = options.discoveryTransport || options._bonjourTransport;
        if (discoveryTransport && typeof discoveryTransport.destroy === 'function') {
            try {
                await discoveryTransport.destroy();
            } catch (error) {
                logger.warn(`[session-agent] 关闭发现传输失败：${error && error.message ? error.message : error}`);
            }
        }
    }

    // ---------------------------------------------------------------- 配对
    async function requestPairing() {
        requireRelay('requestPairing');
        if (state.closed) throw closedError();
        if (!isConnected()) throw new SessionAgentError(SESSION_AGENT_ERROR_CODES.NOT_CONNECTED, '请先 connect() 到教室后再请求配对');
        if (pendingPairing && pendingPairing.expiresAt - now() > 0) {
            // 同一教室只保留一个活动验证码：直接复用未过期的请求，不再向固定机要一个新码
            logger.info('[session-agent] 已有未过期的配对请求，复用同一个 challenge');
            return {
                requestId: pendingPairing.requestId,
                expiresAt: pendingPairing.expiresAt,
                expiresInMs: Math.max(0, pendingPairing.expiresAt - now()),
                nonce: pendingPairing.nonce,
                classroomId: pendingPairing.classroomId,
                attemptsLeft: pendingPairing.attemptsLeft,
                reused: true,
                message: '请在固定机屏幕上读取验证码'
            };
        }
        pendingPairing = null;
        const requestId = nextRequestId('pair');
        inFlight.pair += 1;
        let ack;
        try {
            ack = await transport.emitWithAck({
                socket,
                scheduler,
                event: 'teacher:pair.request',
                payload: { requestId, deviceKey, deviceName: String(options.deviceName || '').slice(0, 128) },
                timeoutMs: requestTimeoutMs
            });
        } finally {
            inFlight.pair -= 1;
        }
        if (!ack || ack.ok !== true) {
            const error = errorFromAck(ack, ERROR_CODES.PAIRING_REQUEST_UNKNOWN, '固定机没有接受本次配对请求');
            emit('pairing', { kind: 'rejected', code: error.code, attemptsLeft: error.attemptsLeft, requestId });
            throw error;
        }
        pendingPairing = {
            requestId: String(ack.requestId || requestId),
            nonce: String(ack.nonce || ''),
            expiresAt: Number.isInteger(ack.expiresAt) ? ack.expiresAt : now() + PAIRING_TTL_MS,
            classroomId: String(ack.classroomId || state.classroomId || ''),
            attemptsLeft: PAIRING_MAX_ATTEMPTS,
            reused: !!ack.reused
        };
        if (pendingPairing.classroomId) state.classroomId = pendingPairing.classroomId;
        emit('pairing', {
            kind: 'challenged',
            requestId: pendingPairing.requestId,
            expiresAt: pendingPairing.expiresAt,
            classroomId: pendingPairing.classroomId,
            reused: pendingPairing.reused
        });
        return {
            requestId: pendingPairing.requestId,
            expiresAt: pendingPairing.expiresAt,
            expiresInMs: Math.max(0, pendingPairing.expiresAt - now()),
            nonce: pendingPairing.nonce,
            classroomId: pendingPairing.classroomId,
            attemptsLeft: pendingPairing.attemptsLeft,
            reused: pendingPairing.reused,
            message: '请在固定机屏幕上读取验证码'
        };
    }

    /**
     * 用教师输入的验证码完成本次请求的密钥确认。
     * 验证码只在本地参与 HMAC 计算，不会离开本进程（也不写日志）。
     */
    async function submitPairingCode(code) {
        requireRelay('submitPairingCode');
        if (state.closed) throw closedError();
        if (!pendingPairing) {
            throw new SessionAgentError(
                SESSION_AGENT_ERROR_CODES.NO_PAIRING_REQUEST,
                '没有待验证的配对请求：请先 requestPairing()，并在固定机上读取新的验证码'
            );
        }
        if (!isConnected()) {
            throw new SessionAgentError(SESSION_AGENT_ERROR_CODES.NOT_CONNECTED, '连接已断开，请重新 connect() 并 requestPairing()');
        }
        const normalized = String(code === undefined || code === null ? '' : code).replace(/\s+/g, '');
        if (!isWellFormedCode(normalized)) {
            // 本地拒绝明显不合法的输入，不消耗固定机的尝试次数
            throw new SessionAgentError(
                ERROR_CODES.PAIRING_CODE_INVALID,
                '验证码必须是 8 位数字',
                { attemptsLeft: pendingPairing.attemptsLeft }
            );
        }
        const pairing = pendingPairing;
        let proof;
        try {
            proof = await createPairingProof({
                code: normalized,
                classroomId: pairing.classroomId || state.classroomId,
                requestId: pairing.requestId,
                deviceKey,
                nonce: pairing.nonce
            });
        } catch (error) {
            throw toSessionAgentError(error, SESSION_AGENT_ERROR_CODES.INVALID_PAIRING_CODE);
        }

        inFlight.verify += 1;
        let ack;
        try {
            ack = await transport.emitWithAck({
                socket,
                scheduler,
                event: 'teacher:pair.verify',
                payload: { requestId: pairing.requestId, nonce: pairing.nonce, proof },
                timeoutMs: requestTimeoutMs
            });
        } finally {
            inFlight.verify -= 1;
        }

        if (!ack || ack.ok !== true) {
            const attemptsLeft = ack && Number.isInteger(ack.attemptsLeft) ? ack.attemptsLeft : null;
            const error = errorFromAck(ack, ERROR_CODES.PAIRING_PROOF_INVALID, '验证码校验未通过');
            if (attemptsLeft !== null) pairing.attemptsLeft = attemptsLeft;
            if (PAIRING_RESET_CODES.has(error.code) || (attemptsLeft !== null && attemptsLeft <= 0)) {
                pendingPairing = null;
            }
            emit('pairing', {
                kind: 'rejected',
                code: error.code,
                attemptsLeft: error.attemptsLeft === null ? attemptsLeft : error.attemptsLeft,
                requestId: pairing.requestId
            });
            throw error;
        }

        const stored = storeCredential(ack);
        pendingPairing = null;
        emit('pairing', {
            kind: 'accepted',
            classroomId: stored.classroomId,
            expiresAt: stored.expiresAt,
            requestId: pairing.requestId
        });

        // 配对候选连接拿不到课堂快照、也进不了教师房间（Hub 的守门只放行 teacher:pair.*），
        // 因此必须带设备凭证重连后才算接入完成。
        closeSocket();
        const opened = await openSocketWithAuth({ useCredential: true });
        adoptConnection(opened);
        setStatus('connected', { hubUrl: state.hubUrl, pairingOnly: false, paired: true });
        emit('pairing', { kind: 'reconnected', classroomId: state.classroomId, requestId: pairing.requestId });
        return {
            paired: true,
            classroomId: stored.classroomId,
            expiresAt: new Date(stored.expiresAt).toISOString(),
            requestId: pairing.requestId
        };
    }

    // ---------------------------------------------------------------- 租约
    async function acquireLease() {
        requireRelay('acquireLease');
        if (state.closed) throw closedError();
        if (!deviceToken) {
            throw new SessionAgentError(SESSION_AGENT_ERROR_CODES.NOT_PAIRED, '需要先完成验证码配对（requestPairing + submitPairingCode）');
        }
        if (!isConnected() || state.pairingOnly) {
            throw new SessionAgentError(SESSION_AGENT_ERROR_CODES.NOT_CONNECTED, '需要先用设备凭证连接教室后再获取授课租约');
        }
        inFlight.lease += 1;
        let ack;
        try {
            ack = await transport.emitWithAck({
                socket,
                scheduler,
                event: 'teacher:lease.acquire',
                payload: { requestId: nextRequestId('lease') },
                timeoutMs: requestTimeoutMs
            });
        } finally {
            inFlight.lease -= 1;
        }
        if (!ack || ack.ok !== true || !ack.leaseId) {
            throw errorFromAck(ack, ERROR_CODES.LEASE_EXPIRED, '教室没有授予授课租约');
        }
        const granted = setLease(ack, { source: 'acquire' });
        emit('lease', { ...granted, kind: 'granted', reused: !!ack.reused });
        if (granted.previousEpoch !== null && granted.previousEpoch !== granted.epoch) {
            emit('lease', { ...granted, kind: 'epoch-changed' });
        }
        return { ...granted, reused: !!ack.reused };
    }

    async function renewLease(renewOptionsInput = {}) {
        requireRelay('renewLease');
        if (!lease) {
            throw new SessionAgentError(ERROR_CODES.LEASE_NOT_HELD, '本机当前没有授课租约');
        }
        if (!isConnected()) {
            throw new SessionAgentError(SESSION_AGENT_ERROR_CODES.NOT_CONNECTED, '连接已断开，无法续租（租约将在 TTL 到期后失效）');
        }
        const current = lease;
        let ack;
        try {
            ack = await transport.emitWithAck({
                socket,
                scheduler,
                event: 'teacher:lease.renew',
                payload: { leaseId: current.leaseId, epoch: current.epoch },
                timeoutMs: requestTimeoutMs
            });
        } catch (error) {
            throw toSessionAgentError(error);
        }
        if (!ack || ack.ok !== true) {
            const error = errorFromAck(ack, ERROR_CODES.LEASE_EXPIRED, '续租被 Hub 拒绝');
            if (LEASE_LOST_CODES.has(error.code)) {
                emitError(error);
                expireLease(error.code);
            }
            throw error;
        }
        if (!lease || lease.leaseId !== current.leaseId) {
            // 续租期间租约已被撤销/替换：不复活旧租约
            throw new SessionAgentError(ERROR_CODES.LEASE_EXPIRED, '续租返回时租约已失效');
        }
        lease.expiresAt = Number.isInteger(ack.expiresAt) ? ack.expiresAt : lease.expiresAt;
        lease.renewals = Number.isInteger(ack.renewals) ? ack.renewals : lease.renewals + 1;
        scheduleLeaseExpiry();
        scheduleRenew();
        const source = renewOptionsInput && renewOptionsInput.reason ? String(renewOptionsInput.reason) : 'manual';
        emit('lease', { ...lease, kind: 'renewed', source });
        return { ...lease, source };
    }

    async function releaseLease() {
        requireRelay('releaseLease');
        if (!lease) return { released: false, epoch: null };
        const current = lease;
        if (!isConnected()) {
            // 通知不到 Hub：本地放弃控制权，Hub 侧租约到期后自行回到等待教师（设计 §7）
            expireLease('released-offline');
            return { released: false, epoch: current.epoch, offline: true };
        }
        let ack;
        try {
            ack = await transport.emitWithAck({
                socket,
                scheduler,
                event: 'teacher:lease.release',
                payload: { leaseId: current.leaseId, epoch: current.epoch },
                timeoutMs: requestTimeoutMs
            });
        } catch (error) {
            throw toSessionAgentError(error);
        }
        if (!ack || ack.ok !== true) {
            throw errorFromAck(ack, ERROR_CODES.LEASE_NOT_HELD, '释放授课租约失败');
        }
        lease = null;
        clearRenewTimer();
        clearLeaseExpiryTimer();
        // Hub 在释放后立即作废本次配对的设备凭证（设计 §4：每次授课都要一次验证码授权）
        clearCredential('lease-released');
        emit('lease', { kind: 'released', leaseId: current.leaseId, epoch: Number.isInteger(ack.epoch) ? ack.epoch : current.epoch });
        emit('pairing', { kind: 'credential-cleared', reason: 'lease-released' });
        setStatus('released', { epoch: Number.isInteger(ack.epoch) ? ack.epoch : current.epoch });
        return { released: !!ack.released, epoch: Number.isInteger(ack.epoch) ? ack.epoch : current.epoch };
    }

    // ---------------------------------------------------------------- 课件发布
    async function publishCourse({ courseId, filePath } = {}) {
        requireRelay('publishCourse');
        if (state.closed) throw closedError();
        const id = String(courseId || '').trim();
        if (!id) throw new SessionAgentError(ERROR_CODES.REQUEST_INVALID, 'publishCourse 需要 courseId');
        const source = String(filePath || '').trim();
        if (!source) throw new SessionAgentError(ERROR_CODES.REQUEST_INVALID, 'publishCourse 需要 .lume 文件的 filePath');
        if (!lease) throw new SessionAgentError(ERROR_CODES.LEASE_NOT_HELD, '需要先取得授课租约才能发布课件');
        if (!deviceToken || !isConnected()) {
            throw new SessionAgentError(SESSION_AGENT_ERROR_CODES.NOT_CONNECTED, '需要先用设备凭证连接教室');
        }

        // 1) 读取并校验课件（course-format 的 ZIP 路径/大小/压缩比/manifest 规则）
        let coursePackage;
        try {
            coursePackage = await readLumeFile(source);
        } catch (error) {
            throw toSessionAgentError(error, SESSION_AGENT_ERROR_CODES.COURSE_FILE_UNREADABLE, `读取课件失败：${source}`);
        }
        if (!coursePackage || coursePackage.ok !== true) {
            const code = (coursePackage && coursePackage.code) || 'package_invalid';
            throw new SessionAgentError(code, `课件校验失败：${code}`, {
                details: { errors: (coursePackage && coursePackage.errors ? coursePackage.errors : []).slice(0, 10) }
            });
        }
        let bytes;
        try {
            bytes = await fsp.readFile(source);
        } catch (error) {
            throw toSessionAgentError(error, SESSION_AGENT_ERROR_CODES.COURSE_FILE_UNREADABLE, `读取课件失败：${source}`);
        }
        const hashed = await computeCourseHash(bytes, { package: coursePackage });
        const courseHash = hashed.hash;

        // 2) HTTPS/HTTP 原始字节上传：上传失败或 hash 不一致一律中止，不进入 course:publish
        const uploadUrl = `${state.hubUrl}/api/courses/stage/${encodeURIComponent(id)}?courseHash=${encodeURIComponent(courseHash)}`;
        let upload;
        try {
            upload = await httpRequest(uploadUrl, {
                method: 'PUT',
                headers: {
                    'content-type': 'application/zip',
                    authorization: `Bearer ${deviceToken}`
                },
                body: bytes
            });
        } catch (error) {
            throw toSessionAgentError(error, SESSION_AGENT_ERROR_CODES.UPLOAD_FAILED, `课件上传失败：${uploadUrl}`);
        }
        const uploadBody = upload && upload.body ? upload.body : null;
        if (!upload || upload.status !== 200 || !uploadBody || uploadBody.ok !== true) {
            const code = uploadBody && uploadBody.code ? uploadBody.code : SESSION_AGENT_ERROR_CODES.UPLOAD_FAILED;
            throw new SessionAgentError(
                code,
                (uploadBody && uploadBody.message) || `课件上传失败（HTTP ${upload ? upload.status : 'no response'}）`,
                { details: { status: upload ? upload.status : null, reason: uploadBody && uploadBody.reason ? uploadBody.reason : null } }
            );
        }
        if (String(uploadBody.courseHash || '') !== courseHash) {
            throw new SessionAgentError(
                ERROR_CODES.COURSE_HASH_MISMATCH,
                'Hub 校验后的 courseHash 与本机计算不一致，已中止发布',
                { details: { expected: courseHash, actual: uploadBody.courseHash || null } }
            );
        }

        // 3) Socket 确认暂存（course:stage）后发布（course:publish，带 epoch）
        const stageAck = await transport.emitWithAck({
            socket,
            scheduler,
            event: 'course:stage',
            payload: { courseId: id, courseHash, sizeBytes: bytes.length, requestId: nextRequestId('stage') },
            timeoutMs: requestTimeoutMs
        });
        if (!stageAck || stageAck.ok !== true) {
            throw errorFromAck(stageAck, ERROR_CODES.COURSE_HASH_UNKNOWN, '确认课件暂存失败');
        }
        const publishAck = await transport.emitWithAck({
            socket,
            scheduler,
            event: 'course:publish',
            payload: {
                courseId: id,
                courseHash,
                requestId: nextRequestId('publish'),
                leaseId: lease.leaseId,
                epoch: lease.epoch
            },
            timeoutMs: requestTimeoutMs
        });
        if (!publishAck || publishAck.ok !== true) {
            const error = errorFromAck(publishAck, ERROR_CODES.COURSE_HASH_UNKNOWN, '发布课件失败');
            if (Number.isInteger(publishAck && publishAck.revision)) applyRevision(publishAck.revision);
            if (LEASE_LOST_CODES.has(error.code)) expireLease(error.code);
            throw error;
        }
        applyRevision(publishAck.revision);
        applyCommandLocally(state, 'course:select', { courseId: id });
        return {
            courseId: id,
            courseHash,
            revision: state.revision,
            sizeBytes: bytes.length,
            entryCount: hashed.entryCount,
            previousCourseHash: publishAck.previousCourseHash ? String(publishAck.previousCourseHash) : null,
            duplicate: !!publishAck.duplicate
        };
    }

    // ---------------------------------------------------------------- 课堂命令
    async function sendCommand(type, payload) {
        if (state.closed) throw closedError();
        const command = normalizeCommand(type, payload);
        if (mode === 'direct') {
            const mapped = toDirectModeEvent(command.type, command.payload);
            await ensureConnected();
            let ack;
            try {
                ack = await transport.emitWithAck({
                    socket,
                    scheduler,
                    event: mapped.event,
                    payload: mapped.payload,
                    timeoutMs: requestTimeoutMs
                });
            } catch (error) {
                throw toSessionAgentError(error);
            }
            if (!ack || ack.ok !== true) {
                if (Number.isInteger(ack && ack.revision)) applyRevision(ack.revision);
                throw errorFromAck(ack, ERROR_CODES.REQUEST_INVALID, `${mapped.event} 被 Hub 拒绝`);
            }
            applyRevision(ack.revision);
            applyCommandLocally(state, command.type, command.payload);
            return { ok: true, type: command.type, revision: state.revision, event: mapped.event, ignoredFields: command.ignoredFields || null };
        }

        requireRelay('sendCommand');
        if (!lease) throw new SessionAgentError(ERROR_CODES.LEASE_NOT_HELD, '尚未取得授课租约（先 acquireLease()）');
        if (!isConnected() || state.pairingOnly) {
            throw new SessionAgentError(
                SESSION_AGENT_ERROR_CODES.NOT_CONNECTED,
                '连接已断开，课堂命令未发送（重连后请以快照恢复，不要重放旧命令）'
            );
        }
        const requestId = nextRequestId('cmd');
        let ack;
        try {
            ack = await transport.emitWithAck({
                socket,
                scheduler,
                event: 'classroom:command',
                payload: {
                    type: command.type,
                    leaseId: lease.leaseId,
                    epoch: lease.epoch,
                    requestId,
                    payload: command.payload
                },
                timeoutMs: requestTimeoutMs
            });
        } catch (error) {
            throw toSessionAgentError(error);
        }
        if (!ack || ack.ok !== true) {
            const error = errorFromAck(ack, ERROR_CODES.REQUEST_INVALID, '课堂命令被 Hub 拒绝');
            if (Number.isInteger(ack && ack.revision)) applyRevision(ack.revision);
            if (LEASE_LOST_CODES.has(error.code)) {
                emitError(error);
                expireLease(error.code);
            }
            throw error;
        }
        applyRevision(ack.revision);
        applyCommandLocally(state, command.type, command.payload);
        return {
            ok: true,
            type: command.type,
            revision: state.revision,
            requestId,
            duplicate: !!ack.duplicate,
            ignoredFields: command.ignoredFields || null
        };
    }

    const selectCourse = (courseId) => sendCommand('course:select', { courseId });
    const setSlide = (slideIndex) => sendCommand('slide:set', { slideIndex });
    const updateSettings = (patch) => sendCommand('settings:update', patch);
    const endCourse = () => sendCommand('course:end', {});

    // ---------------------------------------------------------------- 提交
    async function ackSubmission(submissionId, extra = {}) {
        if (state.closed) throw closedError();
        const id = String(submissionId || '').trim();
        if (!id) throw new SessionAgentError(ERROR_CODES.REQUEST_INVALID, 'ackSubmission 需要 submissionId');
        if (!isConnected()) {
            throw new SessionAgentError(SESSION_AGENT_ERROR_CODES.NOT_CONNECTED, '连接已断开，提交回执未发送（Hub 队列会保留到 TTL）');
        }
        const deliveredAt = extra.deliveredAt ? String(extra.deliveredAt) : new Date(now()).toISOString();
        let ack;
        try {
            ack = await transport.emitWithAck({
                socket,
                scheduler,
                event: 'submission:delivered',
                payload: { submissionId: id, deliveredAt },
                timeoutMs: requestTimeoutMs
            });
        } catch (error) {
            throw toSessionAgentError(error);
        }
        if (!ack || ack.ok !== true) {
            throw errorFromAck(ack, ERROR_CODES.QUEUE_ITEM_UNKNOWN, `提交 ${id} 的落盘回执被拒绝`);
        }
        pendingSubmissions.delete(id);
        return {
            submissionId: id,
            delivered: true,
            deliveredAt,
            pendingCount: Number.isInteger(ack.pendingCount) ? ack.pendingCount : pendingSubmissions.size
        };
    }

    function getPendingSubmissions() {
        return Array.from(pendingSubmissions.values()).map((item) => ({ ...item }));
    }

    // ---------------------------------------------------------------- 生命周期
    async function endSession() {
        const pendingCount = pendingSubmissions.size;
        let released = null;
        let releaseError = null;
        if (lease && mode === 'relay' && isConnected()) {
            try {
                released = await releaseLease();
            } catch (error) {
                releaseError = isSessionAgentError(error) ? error : toSessionAgentError(error);
                emitError(releaseError);
            }
        }
        state.closed = true;
        if (reconnectTimer) {
            scheduler.clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        clearRenewTimer();
        clearLeaseExpiryTimer();
        lease = null;
        pendingPairing = null;
        backoff.reset();
        closeSocket();
        clearCredential('end-session');
        await closeDiscovery();
        setStatus('closed', { released: released ? released.released : false, pendingSubmissions: pendingCount });
        return {
            released: released ? !!released.released : false,
            epoch: released ? released.epoch : null,
            pendingSubmissions: pendingCount,
            releaseError: releaseError ? { code: releaseError.code, message: releaseError.message } : null
        };
    }

    function getState() {
        return {
            mode,
            deviceKey,
            deviceName: String(options.deviceName || ''),
            status: state.status,
            closed: state.closed,
            hubUrl: state.hubUrl || null,
            classroomId: state.classroomId || null,
            address: state.address || null,
            port: state.port,
            sessionId: state.sessionId || null,
            revision: state.revision,
            courseId: state.courseId,
            slideIndex: state.slideIndex,
            hostSettings: { ...state.hostSettings },
            role: state.role,
            pairingOnly: !!state.pairingOnly,
            paired: !!deviceToken,
            deviceTokenExpiresAt: deviceToken ? new Date(deviceTokenExpiresAt).toISOString() : null,
            pairing: pendingPairing
                ? {
                    requestId: pendingPairing.requestId,
                    expiresAt: pendingPairing.expiresAt,
                    classroomId: pendingPairing.classroomId,
                    attemptsLeft: pendingPairing.attemptsLeft
                }
                : null,
            lease: lease ? { ...lease } : null,
            pendingSubmissions: pendingSubmissions.size,
            reconnectAttempt: backoff.attempt,
            connected: isConnected(),
            protocolVersion: PROTOCOL_VERSION
        };
    }

    return {
        mode,
        deviceKey,
        deviceName: String(options.deviceName || ''),
        protocolVersion: PROTOCOL_VERSION,
        connect,
        discover,
        listKnownClassrooms,
        requestPairing,
        submitPairingCode,
        acquireLease,
        renewLease,
        releaseLease,
        publishCourse,
        sendCommand,
        selectCourse,
        setSlide,
        updateSettings,
        endCourse,
        ackSubmission,
        getPendingSubmissions,
        endSession,
        on: emitter.on,
        off: emitter.off,
        getState,
        // 诊断/测试钩子：不是稳定 API，业务代码不要依赖
        __internals: {
            dropConnection,
            currentSocket: () => socket,
            emitter,
            scheduler,
            backoff,
            emit,
            applySnapshot,
            getPendingPairing: () => (pendingPairing ? { ...pendingPairing } : null)
        }
    };
}

module.exports = {
    createSessionAgent,
    createEmitter,
    createDefaultScheduler,
    defaultHttpRequest,
    buildHubUrl,
    DIRECT_MODE_COMMAND_EVENTS,
    EVENT_NAMES
};
