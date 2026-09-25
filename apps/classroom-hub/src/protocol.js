// 协议接入层（Hub 侧）。
//
// 与 repos/teacher/server/src/protocol.js 同构：版本协商、入站守卫、快照与回执
// 全部引用 @lumesync/classroom-protocol，Hub 不自己维护事件名与授权规则。
//
// 与教师服务的两点差异：
//   1. 入站守卫的 scopes 是 ['classroom','relay']——Hub 是唯一同时接受两类事件的入口；
//   2. describeProtocol() 在教师服务里是服务端本地实现（契约包未导出），Hub 同样
//      从契约表生成，形状保持一致，避免/ api/protocol 出现两套描述。

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
    getInboundEvent,
    canSendEvent,
    ERROR_CODES
} = require('@lumesync/classroom-protocol');

const PROTOCOL_REJECTED_EVENT = 'protocol-rejected';
const SESSION_ACCEPTED_EVENT = 'session:accepted';
const SESSION_HELLO_EVENT = 'session:hello';
const SNAPSHOT_EVENT = 'classroom:snapshot';

// Hub 是教室固定机的网关：直接模式的课堂事件与中继事件都要接。
const HUB_EVENT_SCOPES = ['classroom', 'relay'];

function readDeclaredVersion(socket) {
    const auth = (socket && socket.handshake && socket.handshake.auth) || {};
    const query = (socket && socket.handshake && socket.handshake.query) || {};
    if (auth.protocolVersion !== undefined && auth.protocolVersion !== null && auth.protocolVersion !== '') {
        return auth.protocolVersion;
    }
    return query.protocolVersion;
}

/** 协商连接协议版本；ok=false 时必须发 protocol-rejected 并断开。 */
function negotiateConnection(socket) {
    const raw = readDeclaredVersion(socket);
    const negotiation = negotiateProtocol(raw);
    return { ...negotiation, declared: raw === undefined || raw === null || raw === '' ? null : raw };
}

/** 挂载契约守卫：角色、事件范围与 payload schema 在业务处理器之前统一校验。 */
function attachInboundGuard(socket, role, options = {}) {
    const onViolation = typeof options.onViolation === 'function'
        ? options.onViolation
        : (info) => {
            // 只记录事件名与错误码，不记录 payload（可能含学生数据）。
            console.warn(`[protocol] rejected ${info.event} from role=${info.role}: ${info.code}`);
        };

    socket.use(createInboundGuard({
        role,
        // 默认接受两类事件；配对候选连接传 scopes:['pairing'] 把范围收窄到只有配对事件，
        // 配合 ignore 放行 teacher:pair.*，其余事件按 event_unknown 拒绝。
        scopes: Array.isArray(options.scopes) && options.scopes.length > 0 ? options.scopes : HUB_EVENT_SCOPES,
        ignore: Array.isArray(options.ignore) ? options.ignore : [],
        onViolation,
        allowUndeclared: !!options.allowUndeclared
    }));
}

function buildSessionAccepted({ role, clientId, clientIp, sessionId, revision, negotiation, classroomId, mode, pairingOnly = false }) {
    return createEnvelope({
        protocolVersion: (negotiation && negotiation.protocolVersion) || PROTOCOL_VERSION,
        classroomId,
        sessionId,
        revision,
        payload: {
            role,
            clientId,
            clientIp,
            mode,
            pairingOnly: !!pairingOnly,
            legacy: !!(negotiation && negotiation.legacy),
            clientVersion: negotiation ? negotiation.clientVersion : null,
            supportedVersions: SUPPORTED_PROTOCOL_VERSIONS
        }
    });
}

function buildProtocolRejected({ code, message }) {
    return createEnvelope({
        payload: {
            code,
            message,
            protocolVersion: PROTOCOL_VERSION,
            supportedVersions: SUPPORTED_PROTOCOL_VERSIONS
        }
    });
}

function buildClassroomSnapshot({ sessionId, revision, courseId, slideIndex, hostSettings }) {
    return createClassroomSnapshot({ sessionId, revision, courseId, slideIndex, hostSettings });
}

/** 命令回执：requestId 用于幂等，revision 用于客户端确认状态已应用。 */
function buildCommandAck({ requestId, revision, ok = true, code = null, message = null, extra = {} }) {
    return createCommandAck({ requestId, revision, ok, code, message, extra });
}

/** GET /api/protocol：从契约表生成的协议描述。 */
function describeProtocol() {
    return {
        protocolVersion: PROTOCOL_VERSION,
        supportedVersions: SUPPORTED_PROTOCOL_VERSIONS,
        scopes: HUB_EVENT_SCOPES,
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
            scope: entry.scope || 'classroom',
            status: entry.status,
            since: entry.since,
            plannedName: entry.plannedName || null
        })),
        outboundEvents: Object.entries(OUTBOUND_EVENTS).map(([name, entry]) => ({
            name,
            audience: entry.audience,
            scope: entry.scope || 'classroom',
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
    HUB_EVENT_SCOPES,
    PROTOCOL_REJECTED_EVENT,
    SESSION_ACCEPTED_EVENT,
    SESSION_HELLO_EVENT,
    SNAPSHOT_EVENT,
    negotiateConnection,
    attachInboundGuard,
    buildSessionAccepted,
    buildProtocolRejected,
    buildClassroomSnapshot,
    buildCommandAck,
    createEnvelope,
    getInboundEvent,
    canSendEvent,
    describeProtocol
};
