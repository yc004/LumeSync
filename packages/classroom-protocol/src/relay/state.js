// 固定机（教室 Hub）的中继状态机。
//
// 对应设计文档 §5.2 的状态表：
//   中继模式关闭 → 不发布发现服务，不接收远程教师配对
//   等待连接     → 发现列表显示"空闲"，接收一个待验证请求并在固定机显示验证码
//   验证中       → 显示"正在连接"，同一教室只保留一个活动验证码，其他请求明确拒绝
//   已连接授课   → 显示"授课中"，不再产生验证码，交接需要释放或管理员撤销
//   网络/屏幕不可用 → 显示具体错误或从发现列表消失，不静默降级为无验证码连接

const { ERROR_CODES } = require('../errors');
const {
    createPairingRequest,
    verifyPairingCode,
    isExpired,
    describePairingRequestForScreen,
    describePairingRequestPublic
} = require('./pairing');

const RELAY_STATES = {
    DISABLED: 'disabled',
    IDLE: 'idle',
    PAIRING: 'pairing',
    PAIRED: 'paired',
    TEACHING: 'teaching',
    ERROR: 'error'
};

// 发现列表里的显示文案（null = 不发布服务）
const DISCOVERY_LABELS = {
    [RELAY_STATES.DISABLED]: null,
    [RELAY_STATES.IDLE]: '空闲',
    [RELAY_STATES.PAIRING]: '正在连接',
    [RELAY_STATES.PAIRED]: '正在连接',
    [RELAY_STATES.TEACHING]: '授课中',
    [RELAY_STATES.ERROR]: null
};

const DNS_SD_SERVICE_TYPE = '_lumesync-relay._tcp.local';

/**
 * @param {object} input
 * @param {string} input.classroomId 稳定教室 ID（写入发现 TXT）
 * @param {string} input.name 教室显示名
 * @param {number} input.port 课堂网关端口
 * @param {boolean} [input.canDisplayCode] 固定机是否有可用屏幕（无屏幕必须明确报错）
 * @param {() => number} [input.now]
 */
function createRelayState({ classroomId, name, port, canDisplayCode = true, now = () => Date.now() } = {}) {
    if (!classroomId || !name || !port) {
        throw new Error('createRelayState 需要 classroomId、name 与 port');
    }

    let state = RELAY_STATES.DISABLED;
    let errorReason = '';
    let pairing = null; // 当前活动配对请求（同一时刻最多一个）

    function isFree() {
        return state === RELAY_STATES.IDLE;
    }

    function enable() {
        if (!canDisplayCode) {
            state = RELAY_STATES.ERROR;
            errorReason = ERROR_CODES.RELAY_NO_SCREEN;
            return { ok: false, code: ERROR_CODES.RELAY_NO_SCREEN, message: '固定机没有可用的交互屏幕，无法显示验证码' };
        }
        state = RELAY_STATES.IDLE;
        errorReason = '';
        return { ok: true, code: null, state };
    }

    function disable() {
        state = RELAY_STATES.DISABLED;
        pairing = null;
        return { ok: true, code: null, state };
    }

    /** 网络/屏幕故障：从发现列表消失并保留原因，不静默降级。 */
    function fail(reason) {
        state = RELAY_STATES.ERROR;
        errorReason = String(reason || ERROR_CODES.INTERNAL_ERROR);
        pairing = null;
        return { ok: true, code: null, state, errorReason };
    }

    function clearError() {
        if (state !== RELAY_STATES.ERROR) return { ok: true, code: null, state };
        return enable();
    }

    /**
     * 教师电脑请求连接。
     * 关闭/错误状态不接收配对；授课中或已有活动验证码时明确拒绝（不做无验证码的降级）。
     */
    function requestPairing({ requestId, deviceKey, deviceName = '' }) {
        if (state === RELAY_STATES.DISABLED || state === RELAY_STATES.ERROR) {
            return {
                ok: false,
                code: state === RELAY_STATES.ERROR ? (errorReason || ERROR_CODES.RELAY_NO_SCREEN) : ERROR_CODES.RELAY_DISABLED,
                message: state === RELAY_STATES.ERROR ? '中继当前不可用，请看固定机屏幕提示' : '该教室未开启中继桥模式'
            };
        }
        if (state === RELAY_STATES.TEACHING || state === RELAY_STATES.PAIRED) {
            return { ok: false, code: ERROR_CODES.RELAY_BUSY, message: '该教室正在授课中或即将开始授课' };
        }
        if (pairing && !isExpired(pairing, now()) && !pairing.verified) {
            return { ok: false, code: ERROR_CODES.RELAY_BUSY, message: '该教室已有待验证的连接请求' };
        }

        pairing = createPairingRequest({ classroomId, requestId, deviceKey, deviceName, now: now() });
        state = RELAY_STATES.PAIRING;
        return {
            ok: true,
            code: null,
            // 注意：验证码只回给定机屏幕，这里返回的是屏幕信息，Hub 负责区分投递对象
            screen: describePairingRequestForScreen(pairing),
            request: describePairingRequestPublic(pairing)
        };
    }

    /** 教师电脑提交验证码。失败次数记在会话状态上，重连不会重置。 */
    function submitCode({ requestId, code }) {
        if (!pairing || pairing.requestId !== String(requestId || '')) {
            return { ok: false, code: ERROR_CODES.PAIRING_REQUEST_UNKNOWN, message: '没有对应的配对请求' };
        }
        const result = verifyPairingCode(pairing, code, now());
        if (result.request) pairing = result.request;
        if (!result.ok) {
            if (pairing.status === 'expired' || pairing.status === 'locked') {
                // 失效后回到空闲，允许重新发起；成功/过期/取消后验证码立即作废
                state = RELAY_STATES.IDLE;
                pairing = null;
            }
            return { ok: false, code: result.code, message: result.message };
        }
        return { ok: true, code: null, request: describePairingRequestPublic(pairing) };
    }

    /**
     * 验证成功后的落地：教室空闲则自动授予授课租约（state → teaching），
     * 否则只标记已配对，等现任教师释放或管理员撤销。
     */
    function completePairing({ leaseGranted }) {
        if (!pairing || !pairing.verified) {
            return { ok: false, code: ERROR_CODES.PAIRING_REQUEST_UNKNOWN, message: '没有已通过验证的配对请求' };
        }
        const verifiedRequest = describePairingRequestPublic(pairing);
        state = leaseGranted ? RELAY_STATES.TEACHING : RELAY_STATES.PAIRED;
        pairing = null;
        return { ok: true, code: null, state, request: verifiedRequest };
    }

    function cancelPairing() {
        if (!pairing) return { ok: true, code: null, state };
        pairing = null;
        if (state === RELAY_STATES.PAIRING) state = RELAY_STATES.IDLE;
        return { ok: true, code: null, state };
    }

    /** 教师结束授课或管理员撤销后回到等待连接。 */
    function releaseTeaching() {
        if (state === RELAY_STATES.TEACHING || state === RELAY_STATES.PAIRED) {
            state = RELAY_STATES.IDLE;
        }
        pairing = null;
        return { ok: true, code: null, state };
    }

    function snapshot() {
        return {
            classroomId,
            name,
            port,
            state,
            errorReason,
            discoveryLabel: DISCOVERY_LABELS[state],
            pairing: describePairingRequestPublic(pairing),
            // 过期但尚未清理的配对请求不应继续可用
            pairingExpired: pairing ? isExpired(pairing, now()) : false
        };
    }

    /**
     * mDNS/DNS-SD 的 TXT 记录：只放教室名、稳定设备 ID、协议主版本、端口与占用状态。
     * 绝不放验证码、教师凭证或学生数据。
     */
    function discoveryTxt({ protocolVersion }) {
        const label = DISCOVERY_LABELS[state];
        if (!label) return null;
        return {
            name,
            id: classroomId,
            proto: String(protocolVersion),
            port: String(port),
            state: state === RELAY_STATES.TEACHING ? 'busy' : 'free',
            label
        };
    }

    /** 固定机屏幕内容（含验证码），与 discoveryTxt 严格区分。 */
    function screenPayload() {
        return {
            classroomId,
            name,
            state,
            errorReason,
            pairing: pairing && !isExpired(pairing, now()) ? describePairingRequestForScreen(pairing) : null
        };
    }

    return {
        enable,
        disable,
        fail,
        clearError,
        requestPairing,
        submitCode,
        completePairing,
        cancelPairing,
        releaseTeaching,
        isFree,
        snapshot,
        discoveryTxt,
        screenPayload,
        getState: () => state
    };
}

module.exports = {
    RELAY_STATES,
    DISCOVERY_LABELS,
    DNS_SD_SERVICE_TYPE,
    createRelayState
};
