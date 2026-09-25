// 重连退避与续租调度的纯函数。
//
// 设计约束（teacher-cross-platform-relay.md §7）：教师电脑短暂断网后要"自动重连，
// 教师重连后以快照恢复"，但不能用固定间隔死循环打固定机；租约续期要有抖动，
// 避免同一间教室的多台设备（或同一网络里的多个教室）在同一毫秒一起续租。
//
// 这里只放可注入时间与随机数的纯逻辑，便于单元测试给出确定性的期望值。

const DEFAULT_RECONNECT = {
    baseMs: 500,
    maxMs: 15000,
    factor: 2,
    jitterRatio: 0.25
};

const DEFAULT_RENEW = {
    // 租约剩余寿命的这个比例处续租：TTL 60s → 约 30s 续一次
    fraction: 0.5,
    jitterRatio: 0.25,
    minDelayMs: 250
};

function clampNumber(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
}

/** 抖动：ratio=0.25 时结果落在 [value*(1-ratio), value*(1+ratio)]。 */
function applyJitter(value, jitterRatio, random) {
    const ratio = clampNumber(Number(jitterRatio), 0, 1);
    if (ratio === 0) return value;
    const draw = clampNumber(Number(random()), 0, 1);
    return value * (1 + (draw * 2 - 1) * ratio);
}

/**
 * 指数退避 + 抖动。每次 next() 递增一次尝试计数，reset() 在连接成功后调用。
 * @param {object} [options]
 * @param {() => number} [options.random] 取 [0,1) 的随机数，测试注入固定值
 */
function createBackoff(options = {}) {
    const baseMs = clampNumber(Number(options.baseMs === undefined ? DEFAULT_RECONNECT.baseMs : options.baseMs), 1, Number.MAX_SAFE_INTEGER);
    const maxMs = clampNumber(Number(options.maxMs === undefined ? DEFAULT_RECONNECT.maxMs : options.maxMs), baseMs, Number.MAX_SAFE_INTEGER);
    const factor = clampNumber(Number(options.factor === undefined ? DEFAULT_RECONNECT.factor : options.factor), 1, 100);
    const jitterRatio = clampNumber(Number(options.jitterRatio === undefined ? DEFAULT_RECONNECT.jitterRatio : options.jitterRatio), 0, 1);
    const random = typeof options.random === 'function' ? options.random : Math.random;

    let attempt = 0;
    return {
        get attempt() { return attempt; },
        get maxMs() { return maxMs; },
        get baseMs() { return baseMs; },
        /** 下一次重连应等待的毫秒数（已含抖动，绝不小于 1ms、不超过 maxMs）。 */
        next() {
            const raw = Math.min(maxMs, baseMs * Math.pow(factor, attempt));
            attempt += 1;
            return Math.max(1, Math.round(applyJitter(raw, jitterRatio, random)));
        },
        reset() { attempt = 0; }
    };
}

/**
 * 续租延迟：在租约寿命的 fraction 处续租（默认一半），带抖动，且必须早于到期。
 * @param {object} input
 * @param {number} input.expiresAt 租约到期时间（Hub 给的毫秒时间戳）
 * @param {number} input.now 当前时间
 * @param {number} [input.fallbackTtlMs] 拿不到 expiresAt 时使用的 TTL
 * @param {number} [input.fraction]
 * @param {number} [input.jitterRatio]
 * @param {() => number} [input.random]
 */
function computeRenewDelay({
    expiresAt,
    now,
    fallbackTtlMs = 60000,
    fraction = DEFAULT_RENEW.fraction,
    jitterRatio = DEFAULT_RENEW.jitterRatio,
    minDelayMs = DEFAULT_RENEW.minDelayMs,
    random = Math.random
} = {}) {
    const remaining = Number(expiresAt) - Number(now);
    const ttl = Number.isFinite(remaining) && remaining > 0 ? remaining : Math.max(1, Number(fallbackTtlMs) || 60000);
    const ratio = clampNumber(Number(fraction), 0.05, 0.9);
    const raw = ttl * ratio;
    const jittered = applyJitter(raw, jitterRatio, random);
    // 续租必须早于到期：留出至少 minDelayMs 的余量，但不得小于 1/5 TTL
    const budget = Math.max(Math.min(minDelayMs, ttl / 5), 1);
    return Math.round(clampNumber(jittered, 1, Math.max(1, ttl - budget)));
}

module.exports = {
    DEFAULT_RECONNECT,
    DEFAULT_RENEW,
    applyJitter,
    createBackoff,
    computeRenewDelay
};
