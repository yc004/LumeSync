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
    // relay: pairing
    PAIRING_CODE_DIGITS,
    PAIRING_TTL_MS,
    PAIRING_MAX_ATTEMPTS,
    generatePairingCode,
    isWellFormedCode,
    createPairingRequest,
    isExpired,
    verifyPairingCode,
    createPairingProof,
    verifyPairingProof,
    describePairingRequestForScreen,
    describePairingRequestPublic,
    randomIntBelow,
    // relay: lease
    LEASE_TTL_MS,
    LEASE_RENEW_WINDOW_MS,
    createLeaseRegistry,
    // relay: fixed-machine state
    RELAY_STATES,
    DISCOVERY_LABELS,
    DNS_SD_SERVICE_TYPE,
    createRelayState,
    // relay: buffers
    SUBMISSION_QUEUE_CAPACITY,
    SUBMISSION_QUEUE_TTL_MS,
    COURSE_STAGE_MAX_BYTES,
    COURSE_STAGE_MAX_VERSIONS,
    COURSE_STAGE_TTL_MS,
    createSubmissionQueue,
    createCourseStage,
    estimateBytes,
    // relay: events & discovery
    RELAY_INBOUND_EVENTS,
    RELAY_OUTBOUND_EVENTS,
    RELAY_EVENT_NAMES,
    CLASSROOM_COMMAND_TYPES,
    DISCOVERY_TXT_FIELDS,
    DISCOVERY_FORBIDDEN_FIELDS,
    // guard scopes
    DEFAULT_SCOPES,
    // validation primitives
    MAX_STRING_LENGTH,
    validate,
    check,
    formatErrors
} = cjs;

export default cjs;
