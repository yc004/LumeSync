// ESM 入口：打包器与 import 语法下使用同一份实现。
import cjs from './index.js';

export const {
    // version
    PROTOCOL_VERSION,
    LEGACY_PROTOCOL_VERSION,
    SUPPORTED_PROTOCOL_VERSIONS,
    PROTOCOL_ERROR_CODES,
    parseProtocolVersion,
    negotiateProtocol,
    isServerVersionSupported,
    // roles
    ROLE_HOST,
    ROLE_VIEWER,
    ROLES,
    ROLE_ALIASES,
    normalizeRole,
    roleAllows,
    isHostRole,
    // errors
    ERROR_CODES,
    ERROR_HTTP_STATUS,
    httpStatusForError,
    // events
    HOST_SETTINGS_FIELDS,
    POWER_ACTIONS,
    INBOUND_EVENTS,
    OUTBOUND_EVENTS,
    PLANNED_EVENT_NAMES,
    getInboundEvent,
    getOutboundEvent,
    canSendEvent,
    // routes
    ACCESS_PUBLIC,
    ACCESS_HOST,
    ACCESS_BOOTSTRAP,
    WRITE_METHODS,
    API_ROUTES,
    APP_ROUTES,
    normalizeRoutePath,
    resolveApiRoute,
    requiresHostForApiRoute,
    resolveAppRoute,
    // envelope / snapshot
    ENVELOPE_FIELDS,
    ENVELOPE_SCHEMA,
    SNAPSHOT_SCHEMA,
    createEnvelope,
    wrapPayload,
    validateEnvelope,
    createCommandAck,
    createClassroomSnapshot,
    validateClassroomSnapshot,
    // guard
    authorizeEvent,
    createInboundGuard,
    authorizeHello,
    // validation primitives
    MAX_STRING_LENGTH,
    validate,
    check,
    formatErrors
} = cjs;

export default cjs;
