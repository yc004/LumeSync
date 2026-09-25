// 运行配置：模式、身份、缓存与发现。
//
// 所有默认值都取自共享契约（契约里的容量/有效期常量就是 Hub 的上限），
// 环境变量只做覆盖，不在本文件里另造一套数字。构造函数选项优先于环境变量，
// 便于测试注入凭证与假时钟。

const os = require('os');

const {
    COURSE_STAGE_MAX_BYTES,
    COURSE_STAGE_MAX_VERSIONS,
    COURSE_STAGE_TTL_MS,
    SUBMISSION_QUEUE_CAPACITY,
    SUBMISSION_QUEUE_TTL_MS,
    LEASE_TTL_MS,
    PAIRING_TTL_MS,
    DEFAULT_TTL_SEC,
    DNS_SD_SERVICE_TYPE,
    ERROR_CODES
} = require('@lumesync/classroom-protocol');

const { randomHex } = require('./utils');

const HUB_MODES = { DIRECT: 'direct', RELAY: 'relay' };

function normalizeMode(value) {
    const raw = String(value === undefined || value === null ? '' : value).trim().toLowerCase();
    if (!raw || raw === HUB_MODES.DIRECT) return HUB_MODES.DIRECT;
    if (raw === HUB_MODES.RELAY) return HUB_MODES.RELAY;
    throw new Error(`LUMESYNC_HUB_MODE 只能是 direct 或 relay，收到：${raw}`);
}

function readBool(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    const raw = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
    if (['0', 'false', 'no', 'off'].includes(raw)) return false;
    return fallback;
}

function readInt(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    const rounded = Math.floor(numeric);
    if (rounded < min || rounded > max) return fallback;
    return rounded;
}

/** DNS-SD 实例名/设备 ID 只允许安全字符，避免广播异常。 */
function sanitizeClassroomId(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 63);
}

/**
 * @param {object} [options] 覆盖项；优先级高于环境变量
 * @param {object} [options.env] 环境变量来源，默认 process.env
 */
function loadConfig(options = {}) {
    const env = options.env || process.env;

    const mode = normalizeMode(options.mode !== undefined ? options.mode : env.LUMESYNC_HUB_MODE);
    const hostname = String(os.hostname() || 'classroom-pc');
    const classroomId = sanitizeClassroomId(
        options.classroomId || env.LUMESYNC_HUB_CLASSROOM_ID || `classroom-${hostname}`
    ) || `classroom-${randomHex(4)}`;
    const classroomName = String(
        options.classroomName || env.LUMESYNC_HUB_CLASSROOM_NAME || hostname
    ).trim() || classroomId;

    const hostToken = String(
        options.hostToken || env.LUMESYNC_HOST_TOKEN || `hub-host-${randomHex(24)}`
    );
    const tokenSecret = String(
        options.tokenSecret || env.LUMESYNC_HUB_TOKEN_SECRET || `hub-token-${randomHex(32)}`
    );

    const port = readInt(
        options.port !== undefined ? options.port : env.PORT,
        3000,
        { min: 0, max: 65535 }
    );
    const host = String(options.host || env.LUMESYNC_HUB_HOST || '0.0.0.0');

    const canDisplayCode = readBool(
        options.canDisplayCode !== undefined ? options.canDisplayCode : env.LUMESYNC_HUB_CAN_DISPLAY_CODE,
        true
    );
    const discoveryEnabled = readBool(
        options.discovery !== undefined ? options.discovery : env.LUMESYNC_HUB_DISCOVERY,
        mode === HUB_MODES.RELAY
    );

    return {
        mode,
        host,
        port,
        classroomId,
        classroomName,
        hostToken,
        tokenSecret,
        canDisplayCode,
        discovery: discoveryEnabled,
        discoveryServiceType: String(options.discoveryServiceType || env.LUMESYNC_HUB_DISCOVERY_SERVICE_TYPE || DNS_SD_SERVICE_TYPE),

        viewerTokenTtlSec: readInt(
            options.viewerTokenTtlSec !== undefined ? options.viewerTokenTtlSec : env.LUMESYNC_VIEWER_TOKEN_TTL_SEC,
            DEFAULT_TTL_SEC
        ),
        deviceTokenTtlSec: readInt(
            options.deviceTokenTtlSec !== undefined ? options.deviceTokenTtlSec : env.LUMESYNC_HUB_DEVICE_TOKEN_TTL_SEC,
            8 * 60 * 60
        ),
        pairingTtlMs: PAIRING_TTL_MS,
        leaseTtlMs: readInt(
            options.leaseTtlMs !== undefined ? options.leaseTtlMs : env.LUMESYNC_HUB_LEASE_TTL_MS,
            LEASE_TTL_MS,
            { min: 1000 }
        ),
        leaseSweepIntervalMs: readInt(
            options.leaseSweepIntervalMs !== undefined ? options.leaseSweepIntervalMs : env.LUMESYNC_HUB_SWEEP_INTERVAL_MS,
            1000,
            { min: 0 }
        ),

        stageMaxBytes: readInt(
            options.stageMaxBytes !== undefined ? options.stageMaxBytes : env.LUMESYNC_HUB_STAGE_MAX_BYTES,
            COURSE_STAGE_MAX_BYTES,
            { min: 1024 }
        ),
        stageMaxVersions: readInt(
            options.stageMaxVersions !== undefined ? options.stageMaxVersions : env.LUMESYNC_HUB_STAGE_MAX_VERSIONS,
            COURSE_STAGE_MAX_VERSIONS,
            { min: 1 }
        ),
        stageTtlMs: readInt(
            options.stageTtlMs !== undefined ? options.stageTtlMs : env.LUMESYNC_HUB_STAGE_TTL_MS,
            COURSE_STAGE_TTL_MS,
            { min: 1000 }
        ),
        queueCapacity: readInt(
            options.queueCapacity !== undefined ? options.queueCapacity : env.LUMESYNC_HUB_QUEUE_CAPACITY,
            SUBMISSION_QUEUE_CAPACITY,
            { min: 1 }
        ),
        queueTtlMs: readInt(
            options.queueTtlMs !== undefined ? options.queueTtlMs : env.LUMESYNC_HUB_QUEUE_TTL_MS,
            SUBMISSION_QUEUE_TTL_MS,
            { min: 1000 }
        ),

        jsonBodyLimit: String(options.jsonBodyLimit || env.LUMESYNC_HUB_JSON_LIMIT || '2mb'),
        // Socket.IO 单包上限：契约允许 student:screenshot 的 dataUrl 到 1.4MB，
        // 默认的 1MB 会在传输层断连而不是给出契约错误。
        maxSocketPayloadBytes: readInt(
            options.maxSocketPayloadBytes !== undefined ? options.maxSocketPayloadBytes : env.LUMESYNC_HUB_SOCKET_MAX_BYTES,
            2 * 1024 * 1024,
            { min: 64 * 1024 }
        ),
        // 未声明事件是否放行（与教师服务的 LUMESYNC_PROTOCOL_ALLOW_UNDECLARED 同名同义）
        allowUndeclaredEvents: readBool(
            options.allowUndeclaredEvents !== undefined
                ? options.allowUndeclaredEvents
                : env.LUMESYNC_PROTOCOL_ALLOW_UNDECLARED,
            false
        ),
        logLevel: String(options.logLevel || env.LUMESYNC_HUB_LOG_LEVEL || 'info')
    };
}

/** 错误码透出给 HTTP 层时的兜底文案（不包含内部细节）。 */
const PUBLIC_ERROR_MESSAGES = {
    [ERROR_CODES.INTERNAL_ERROR]: 'Hub 内部错误'
};

module.exports = { HUB_MODES, normalizeMode, sanitizeClassroomId, loadConfig, PUBLIC_ERROR_MESSAGES };
