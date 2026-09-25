// 会话凭证（viewer / teacher-pairing 短期 token）。
//
// 设计约束（target-architecture §4.4、teacher-cross-platform-relay §5.2）：
//   - viewer 会话由入班/配对流程签发**短期**凭证，host 凭证只留在教师本机；
//   - 凭证绑定设备身份（clientId）与角色，服务端对每条命令核验；
//   - 教室中继模式不通过公开 HTTP 接口发放 host 权限，配对成功后签发的是
//     绑定设备的短期凭证，授课控制权仍需单独获取租约。
//
// 编码是紧凑的 `<base64url(payload)>.<base64url(hmacSha256)>`（两段），
// 与教师服务现有 viewer token 语义一致，但实现放在共享契约里，避免再各写一份。

const { ROLE_HOST, ROLE_VIEWER, normalizeRole } = require('./roles');
const { ERROR_CODES } = require('./errors');

const DEFAULT_TTL_SEC = 4 * 60 * 60;
const MAX_TTL_SEC = 24 * 60 * 60;
const TOKEN_VERSION = 1;

function base64UrlEncode(bytes) {
    const buffer = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : new Uint8Array(bytes);
    let binary = '';
    for (const byte of buffer) binary += String.fromCharCode(byte);
    const base64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(buffer).toString('base64');
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(text) {
    const padded = String(text).replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    const base64 = padded + pad;
    if (typeof atob === 'function') {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        return bytes;
    }
    return new Uint8Array(Buffer.from(base64, 'base64'));
}

async function hmacSha256(key, message) {
    const subtle = globalThis.crypto && globalThis.crypto.subtle;
    if (subtle && typeof subtle.importKey === 'function') {
        const encoder = new TextEncoder();
        const cryptoKey = await subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const signature = await subtle.sign('HMAC', cryptoKey, encoder.encode(message));
        return new Uint8Array(signature);
    }
    const nodeCrypto = require('crypto');
    return new Uint8Array(nodeCrypto.createHmac('sha256', key).update(message).digest());
}

function timingSafeEqual(a, b) {
    const left = String(a || '');
    const right = String(b || '');
    if (left.length !== right.length || left.length === 0) return false;
    let diff = 0;
    for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
    return diff === 0;
}

function normalizeTtl(ttlSec) {
    const value = Number(ttlSec);
    if (!Number.isFinite(value) || value <= 0) return DEFAULT_TTL_SEC;
    return Math.min(Math.floor(value), MAX_TTL_SEC);
}

/**
 * 签发短期会话凭证。
 * @param {object} input
 * @param {string} input.secret 服务端密钥（每个 Hub/教师服务独立）
 * @param {string} input.clientId 设备身份，凭证与之绑定
 * @param {'host'|'viewer'} input.role
 * @param {number} [input.ttlSec]
 * @param {number} [input.now] 毫秒时间戳，便于测试
 * @param {string} [input.classroomId] 中继模式下绑定教室
 * @param {string} [input.leaseId] 已取得授课租约时可附带，便于审计
 */
async function createSessionToken({ secret, clientId, role, ttlSec, now = Date.now(), classroomId, leaseId } = {}) {
    const normalizedRole = normalizeRole(role);
    if (!secret || !clientId || !normalizedRole) {
        throw new Error('createSessionToken 需要 secret、clientId 与合法 role');
    }
    const issuedAtSec = Math.floor(now / 1000);
    const expiresAtSec = issuedAtSec + normalizeTtl(ttlSec);
    const payload = {
        v: TOKEN_VERSION,
        sub: String(clientId),
        role: normalizedRole,
        iat: issuedAtSec,
        exp: expiresAtSec
    };
    if (classroomId) payload.cid = String(classroomId);
    if (leaseId) payload.lid = String(leaseId);

    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signature = await hmacSha256(String(secret), encodedPayload);
    return {
        token: `${encodedPayload}.${base64UrlEncode(signature)}`,
        payload,
        expiresAt: new Date(expiresAtSec * 1000).toISOString(),
        ttlSec: expiresAtSec - issuedAtSec
    };
}

/**
 * 校验凭证。必须同时满足：签名正确、未过期、角色匹配、clientId 绑定一致。
 * @param {string} token
 * @param {object} options
 * @param {string} options.secret
 * @param {string} [options.role] 期望角色
 * @param {string} [options.clientId] 期望绑定的设备身份
 * @param {number} [options.now]
 */
async function verifySessionToken(token, { secret, role, clientId, now = Date.now() } = {}) {
    const invalid = (code, message) => ({ ok: false, code, message, payload: null });
    if (!secret) return invalid(ERROR_CODES.INTERNAL_ERROR, '服务端未配置会话密钥');

    const parts = String(token || '').split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        return invalid(ERROR_CODES.VIEWER_AUTH_FAILED, '凭证格式不正确');
    }

    const expected = base64UrlEncode(await hmacSha256(String(secret), parts[0]));
    if (!timingSafeEqual(expected, parts[1])) {
        return invalid(ERROR_CODES.VIEWER_AUTH_FAILED, '凭证签名校验失败');
    }

    let payload;
    try {
        payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
    } catch (_) {
        return invalid(ERROR_CODES.VIEWER_AUTH_FAILED, '凭证内容无法解析');
    }

    if (!payload || payload.v !== TOKEN_VERSION || !payload.sub || !normalizeRole(payload.role)) {
        return invalid(ERROR_CODES.VIEWER_AUTH_FAILED, '凭证内容不完整');
    }
    const expiresAtMs = Number(payload.exp) * 1000;
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) {
        return invalid(ERROR_CODES.VIEWER_AUTH_FAILED, '凭证已过期');
    }
    if (role && normalizeRole(role) !== normalizeRole(payload.role)) {
        return invalid(ERROR_CODES.VIEWER_AUTH_FAILED, '凭证角色不匹配');
    }
    if (clientId && String(clientId) !== String(payload.sub)) {
        return invalid(ERROR_CODES.VIEWER_AUTH_FAILED, '凭证与设备身份不匹配');
    }

    return {
        ok: true,
        code: null,
        payload: {
            clientId: String(payload.sub),
            role: normalizeRole(payload.role),
            issuedAt: new Date(Number(payload.iat) * 1000).toISOString(),
            expiresAt: new Date(expiresAtMs).toISOString(),
            classroomId: payload.cid ? String(payload.cid) : null,
            leaseId: payload.lid ? String(payload.lid) : null
        }
    };
}

module.exports = {
    TOKEN_VERSION,
    DEFAULT_TTL_SEC,
    MAX_TTL_SEC,
    ROLE_HOST,
    ROLE_VIEWER,
    createSessionToken,
    verifySessionToken,
    base64UrlEncode,
    base64UrlDecode
};
