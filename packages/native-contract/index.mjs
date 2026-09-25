// ESM 入口。
import cjs from './index.js';

export const {
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
    formatErrors,
    RISK,
    HOST_ACTIONS,
    VIEWER_ACTIONS,
    ACTIONS_BY_ROLE,
    NATIVE_TO_PAGE_KINDS,
    getActionSpec,
    authorizeAction,
    listActions
} = cjs;

export default cjs;
