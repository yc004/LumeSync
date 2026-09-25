// 教室中继的验证码配对。
//
// 设计约束（docs/architecture/teacher-cross-platform-relay.md §5）：
//   - 8 位数字、密码学安全随机数，有效期 3 分钟，每次请求最多 5 次输入；
//   - 验证码绑定「教室 + 请求 ID + 教师设备公钥」，只用于本次请求；
//   - 验证码只出现在固定机屏幕上，绝不出现在发现报文或网络响应里；
//   - 失败次数不能通过重连重置（计数保存在服务端会话上，不在连接上）；
//   - 验证码不直接充当长期 host token：验证成功后另行签发短期设备凭证。
//
// 本模块只做纯逻辑（无网络、无存储），Hub 负责把状态挂到会话与磁盘上。

const { ERROR_CODES } = require('../errors');

const PAIRING_CODE_DIGITS = 8;
const PAIRING_TTL_MS = 3 * 60 * 1000;
const PAIRING_MAX_ATTEMPTS = 5;
const PAIRING_CODE_SPACE = 10 ** PAIRING_CODE_DIGITS;

/** 密码学安全随机整数，避免依赖 Node 专有 API。 */
function randomIntBelow(maxExclusive) {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
        throw new Error('randomIntBelow 需要正整数上界');
    }
    const globalCrypto = globalThis.crypto;
    if (globalCrypto && typeof globalCrypto.getRandomValues === 'function') {
        // 拒绝采样，避免取模带来的偏置
        const limit = Math.floor(0xffffffff / maxExclusive) * maxExclusive;
        const buffer = new Uint32Array(1);
        for (let attempt = 0; attempt < 64; attempt += 1) {
            globalCrypto.getRandomValues(buffer);
            if (buffer[0] < limit) return buffer[0] % maxExclusive;
        }
        return buffer[0] % maxExclusive;
    }
    const nodeCrypto = require('crypto');
    return nodeCrypto.randomInt(0, maxExclusive);
}

/** 生成 8 位数字验证码（保留前导零，返回字符串）。 */
function generatePairingCode() {
    return String(randomIntBelow(PAIRING_CODE_SPACE)).padStart(PAIRING_CODE_DIGITS, '0');
}

function normalizeCode(value) {
    return String(value === undefined || value === null ? '' : value).replace(/\s+/g, '');
}

function isWellFormedCode(value) {
    return new RegExp(`^\\d{${PAIRING_CODE_DIGITS}}$`).test(normalizeCode(value));
}

/**
 * 创建一次配对请求的状态。
 * @param {object} input
 * @param {string} input.classroomId
 * @param {string} input.requestId 教师电脑生成的请求 ID
 * @param {string} input.deviceKey 教师设备公钥/指纹
 * @param {string} [input.deviceName] 固定机屏幕上显示的设备名
 * @param {number} [input.now] 毫秒时间戳，便于测试
 */
function createPairingRequest({ classroomId, requestId, deviceKey, deviceName = '', now = Date.now() } = {}) {
    if (!classroomId || !requestId || !deviceKey) {
        throw new Error('createPairingRequest 需要 classroomId、requestId 与 deviceKey');
    }
    return {
        classroomId: String(classroomId),
        requestId: String(requestId),
        deviceKey: String(deviceKey),
        deviceName: String(deviceName),
        code: generatePairingCode(),
        createdAt: now,
        expiresAt: now + PAIRING_TTL_MS,
        attemptsLeft: PAIRING_MAX_ATTEMPTS,
        verified: false,
        status: 'pending'
    };
}

function isExpired(request, now = Date.now()) {
    return !request || now >= request.expiresAt;
}

/**
 * 校验一次输入。返回值里带更新后的状态（纯函数，调用方负责保存）。
 * 失败原因区分「请求不存在 / 过期 / 次数用尽 / 验证码错误」，便于固定机与教师端给出可用反馈。
 */
function verifyPairingCode(request, submittedCode, now = Date.now()) {
    if (!request) {
        return { ok: false, code: ERROR_CODES.PAIRING_REQUEST_UNKNOWN, message: '配对请求不存在或已清理' };
    }
    if (request.verified) {
        return { ok: false, code: ERROR_CODES.PAIRING_REQUEST_UNKNOWN, message: '该配对请求已完成，需要重新发起' };
    }
    if (isExpired(request, now)) {
        return {
            ok: false,
            code: ERROR_CODES.PAIRING_CODE_EXPIRED,
            message: '验证码已过期，请重新发起配对请求',
            request: { ...request, status: 'expired' }
        };
    }
    if (request.attemptsLeft <= 0) {
        return {
            ok: false,
            code: ERROR_CODES.PAIRING_ATTEMPTS_EXCEEDED,
            message: '尝试次数已用尽，请重新发起配对请求',
            request: { ...request, status: 'locked' }
        };
    }

    const submitted = normalizeCode(submittedCode);
    if (!isWellFormedCode(submitted)) {
        return {
            ok: false,
            code: ERROR_CODES.PAIRING_CODE_INVALID,
            message: `验证码必须是 ${PAIRING_CODE_DIGITS} 位数字`,
            request: { ...request, attemptsLeft: request.attemptsLeft - 1 }
        };
    }

    if (submitted !== request.code) {
        const attemptsLeft = request.attemptsLeft - 1;
        return {
            ok: false,
            code: attemptsLeft > 0 ? ERROR_CODES.PAIRING_CODE_INVALID : ERROR_CODES.PAIRING_ATTEMPTS_EXCEEDED,
            message: attemptsLeft > 0 ? `验证码不正确，剩余 ${attemptsLeft} 次` : '尝试次数已用尽，请重新发起配对请求',
            request: { ...request, attemptsLeft, status: attemptsLeft > 0 ? 'pending' : 'locked' }
        };
    }

    return {
        ok: true,
        code: null,
        message: 'ok',
        // 成功即失效：attemptsLeft 归零并标记 verified，复用同一请求不再可能
        request: { ...request, attemptsLeft: 0, verified: true, status: 'verified', verifiedAt: now }
    };
}

async function hmacSha256Hex(key, message) {
    const subtle = globalThis.crypto && globalThis.crypto.subtle;
    if (subtle && typeof subtle.importKey === 'function') {
        const encoder = new TextEncoder();
        const cryptoKey = await subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const signature = await subtle.sign('HMAC', cryptoKey, encoder.encode(message));
        return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
    }
    const nodeCrypto = require('crypto');
    return nodeCrypto.createHmac('sha256', key).update(message).digest('hex');
}

function pairingTranscript({ classroomId, requestId, deviceKey, nonce }) {
    return [classroomId, requestId, deviceKey, nonce].map((part) => String(part || '')).join('|');
}

/**
 * 教师电脑用验证码算出的握手证明。
 *
 * 验证码是双方共享的短期秘密，因此可以像口令认证那样做密钥确认；
 * **必须**跑在 TLS 之上（否则可被离线爆破：8 位数字只有约 26.6 bit）。
 */
async function createPairingProof({ code, classroomId, requestId, deviceKey, nonce }) {
    if (!isWellFormedCode(code)) throw new Error('配对证明需要 8 位数字验证码');
    return hmacSha256Hex(normalizeCode(code), pairingTranscript({ classroomId, requestId, deviceKey, nonce }));
}

function timingSafeEqualHex(a, b) {
    const left = String(a || '');
    const right = String(b || '');
    if (left.length !== right.length || left.length === 0) return false;
    let diff = 0;
    for (let index = 0; index < left.length; index += 1) {
        diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
    }
    return diff === 0;
}

/** 固定机侧校验握手证明；使用常量时间比较。 */
async function verifyPairingProof({ request, proof, nonce }) {
    if (!request || !request.code) {
        return { ok: false, code: ERROR_CODES.PAIRING_REQUEST_UNKNOWN, message: '配对请求不存在' };
    }
    const expected = await createPairingProof({
        code: request.code,
        classroomId: request.classroomId,
        requestId: request.requestId,
        deviceKey: request.deviceKey,
        nonce
    });
    if (!timingSafeEqualHex(expected, proof)) {
        return { ok: false, code: ERROR_CODES.PAIRING_PROOF_INVALID, message: '配对证明校验失败' };
    }
    return { ok: true, code: null, message: 'ok' };
}

/** 只保留界面上要显示的信息，避免验证码被写进普通日志或发现报文。 */
function describePairingRequestForScreen(request) {
    if (!request) return null;
    return {
        requestId: request.requestId,
        deviceName: request.deviceName,
        code: request.code,
        expiresAt: request.expiresAt,
        attemptsLeft: request.attemptsLeft,
        status: request.status
    };
}

/** 对外（发现报文、日志、教师端回执）绝不包含验证码。 */
function describePairingRequestPublic(request) {
    if (!request) return null;
    return {
        requestId: request.requestId,
        deviceName: request.deviceName,
        expiresAt: request.expiresAt,
        attemptsLeft: request.attemptsLeft,
        status: request.status
    };
}

module.exports = {
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
    randomIntBelow
};
