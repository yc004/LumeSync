// 协议版本与协商。
//
// 当前教师服务已经在 role-assigned / classroom:snapshot 中附带 protocolVersion: 1。
// 版本 0 是"握手之前"的客户端：它们不带版本字段，只按旧事件集工作。
// 服务端必须接受旧客户端（过渡窗口），但对声明了不支持版本的客户端要明确拒绝，
// 而不是静默按旧语义处理。

const PROTOCOL_VERSION = 1;
const LEGACY_PROTOCOL_VERSION = 0;
const SUPPORTED_PROTOCOL_VERSIONS = [PROTOCOL_VERSION];

const CODES = {
    INVALID: 'protocol_version_invalid',
    UNSUPPORTED: 'protocol_version_unsupported'
};

/**
 * 解析客户端声明的版本。缺少字段一律视为 legacy 客户端。
 * @returns {{present: boolean, version: number, raw: any}}
 */
function parseProtocolVersion(raw) {
    if (raw === undefined || raw === null || raw === '') {
        return { present: false, version: LEGACY_PROTOCOL_VERSION, raw };
    }
    const numeric = typeof raw === 'number' ? raw : Number(String(raw).trim());
    if (!Number.isInteger(numeric) || numeric < 0) {
        return { present: true, version: Number.NaN, raw };
    }
    return { present: true, version: numeric, raw };
}

/**
 * 协商结果。
 * ok=false 时服务端应发 protocol-rejected 并断开，不能继续按旧协议服务。
 */
function negotiateProtocol(raw) {
    const parsed = parseProtocolVersion(raw);
    if (Number.isNaN(parsed.version)) {
        return {
            ok: false,
            code: CODES.INVALID,
            clientVersion: null,
            protocolVersion: PROTOCOL_VERSION,
            message: 'protocolVersion must be a non-negative integer'
        };
    }
    if (parsed.version > PROTOCOL_VERSION) {
        return {
            ok: false,
            code: CODES.UNSUPPORTED,
            clientVersion: parsed.version,
            protocolVersion: PROTOCOL_VERSION,
            message: `server speaks protocol ${PROTOCOL_VERSION}, client requested ${parsed.version}`
        };
    }
    if (!SUPPORTED_PROTOCOL_VERSIONS.includes(parsed.version) && parsed.version !== LEGACY_PROTOCOL_VERSION) {
        return {
            ok: false,
            code: CODES.UNSUPPORTED,
            clientVersion: parsed.version,
            protocolVersion: PROTOCOL_VERSION,
            message: `protocol ${parsed.version} is no longer supported`
        };
    }
    return {
        ok: true,
        code: null,
        clientVersion: parsed.version,
        protocolVersion: PROTOCOL_VERSION,
        legacy: parsed.version === LEGACY_PROTOCOL_VERSION,
        message: 'ok'
    };
}

/** 客户端判断服务端版本是否可用（握手回包后调用）。 */
function isServerVersionSupported(raw) {
    const parsed = parseProtocolVersion(raw);
    return !Number.isNaN(parsed.version) && parsed.version >= LEGACY_PROTOCOL_VERSION && parsed.version <= PROTOCOL_VERSION;
}

module.exports = {
    PROTOCOL_VERSION,
    LEGACY_PROTOCOL_VERSION,
    SUPPORTED_PROTOCOL_VERSIONS,
    PROTOCOL_ERROR_CODES: CODES,
    parseProtocolVersion,
    negotiateProtocol,
    isServerVersionSupported
};
