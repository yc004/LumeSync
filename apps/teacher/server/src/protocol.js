// 课堂协议接入层。
//
// 教师服务不再自己维护事件名、角色矩阵和版本字面量，而是统一引用共享契约
// @lumesync/classroom-protocol。这里的职责只有三件：
//   1. 连接握手：协商 protocolVersion，不兼容就直接拒绝；
//   2. 事件守卫：把契约的角色/payload 校验挂到 Socket.IO 中间件上；
//   3. 快照与回执：用契约提供的构造函数生成服务端权威消息。

const {
    PROTOCOL_VERSION,
    SUPPORTED_PROTOCOL_VERSIONS,
    negotiateProtocol,
    createInboundGuard,
    createClassroomSnapshot,
    createCommandAck,
    createEnvelope,
    INBOUND_EVENTS,
    OUTBOUND_EVENTS,
    PLANNED_EVENT_NAMES,
    ERROR_CODES,
    ROLE_HOST,
    ROLE_VIEWER,
    normalizeRole
} = require('@lumesync/classroom-protocol');

const PROTOCOL_REJECTED_EVENT = 'protocol-rejected';
const SESSION_ACCEPTED_EVENT = 'session:accepted';
const SESSION_HELLO_EVENT = 'session:hello';
const SNAPSHOT_EVENT = 'classroom:snapshot';

// 未声明事件的处理策略：默认拒绝（严格），可通过环境变量临时放行，
// 便于旧客户端在同网段过渡，但不作为默认行为。
const ALLOW_UNDECLARED_EVENTS = String(process.env.LUMESYNC_PROTOCOL_ALLOW_UNDECLARED || '') === '1';

function readDeclaredVersion(socket) {
    const auth = socket?.handshake?.auth || {};
    const query = socket?.handshake?.query || {};
    if (auth.protocolVersion !== undefined && auth.protocolVersion !== null && auth.protocolVersion !== '') {
        return auth.protocolVersion;
    }
    return query.protocolVersion;
}

/**
 * 协商连接协议版本。
 * 不返回 ok 时调用方必须发 protocol-rejected 并断开，不能按旧语义继续服务。
 */
function negotiateConnection(socket) {
    const raw = readDeclaredVersion(socket);
    const negotiation = negotiateProtocol(raw);
    return { ...negotiation, declared: raw === undefined || raw === null || raw === '' ? null : raw };
}

/**
 * 给连接挂上契约守卫。业务处理器里原有的角色判断保留为纵深防御。
 */
function attachInboundGuard(socket, role, options = {}) {
    const onViolation = typeof options.onViolation === 'function'
        ? options.onViolation
        : (info) => {
            console.warn(`[protocol] rejected ${info.event} from role=${info.role}: ${info.code} ${info.message}`);
        };

    socket.use(createInboundGuard({
        role,
        onViolation,
        allowUndeclared: ALLOW_UNDECLARED_EVENTS
    }));
}

/** 握手成功回包：客户端据此确认协议版本与服务端权威 revision。 */
function buildSessionAccepted({ role, clientId, clientIp, sessionId, revision, negotiation }) {
    return createEnvelope({
        protocolVersion: negotiation?.protocolVersion ?? PROTOCOL_VERSION,
        sessionId,
        revision,
        payload: {
            role,
            clientId,
            clientIp,
            legacy: !!negotiation?.legacy,
            clientVersion: negotiation?.clientVersion ?? null,
            supportedVersions: SUPPORTED_PROTOCOL_VERSIONS
        }
    });
}

/** 拒绝回包：带上服务端支持的版本，便于客户端自助诊断。 */
function buildProtocolRejected({ code, message, protocolVersion = PROTOCOL_VERSION }) {
    return createEnvelope({
        payload: {
            code,
            message,
            protocolVersion,
            supportedVersions: SUPPORTED_PROTOCOL_VERSIONS
        }
    });
}

function buildClassroomSnapshot({ sessionId, revision, courseId, slideIndex, hostSettings }) {
    return createClassroomSnapshot({ sessionId, revision, courseId, slideIndex, hostSettings });
}

/** 对外暴露给客户端与文档的协议描述（GET /api/protocol）。 */
function describeProtocol() {
    return {
        protocolVersion: PROTOCOL_VERSION,
        supportedVersions: SUPPORTED_PROTOCOL_VERSIONS,
        handshake: {
            client: SESSION_HELLO_EVENT,
            serverAccepted: SESSION_ACCEPTED_EVENT,
            serverRejected: PROTOCOL_REJECTED_EVENT,
            snapshot: SNAPSHOT_EVENT,
            legacyClients: '不带 protocolVersion 的客户端按 0 处理，服务端仍回当前版本'
        },
        inboundEvents: Object.entries(INBOUND_EVENTS).map(([name, entry]) => ({
            name,
            roles: entry.roles,
            status: entry.status,
            since: entry.since,
            plannedName: entry.plannedName || null
        })),
        outboundEvents: Object.entries(OUTBOUND_EVENTS).map(([name, entry]) => ({
            name,
            audience: entry.audience,
            since: entry.since,
            plannedName: entry.plannedName || null,
            status: entry.status || 'current'
        })),
        plannedRenames: { ...PLANNED_EVENT_NAMES }
    };
}

module.exports = {
    PROTOCOL_VERSION,
    SUPPORTED_PROTOCOL_VERSIONS,
    ERROR_CODES,
    ROLE_HOST,
    ROLE_VIEWER,
    normalizeRole,
    PROTOCOL_REJECTED_EVENT,
    SESSION_ACCEPTED_EVENT,
    SESSION_HELLO_EVENT,
    SNAPSHOT_EVENT,
    ALLOW_UNDECLARED_EVENTS,
    negotiateConnection,
    attachInboundGuard,
    buildSessionAccepted,
    buildProtocolRejected,
    buildClassroomSnapshot,
    createCommandAck,
    describeProtocol
};
