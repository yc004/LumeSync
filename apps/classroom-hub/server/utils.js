// Hub 内部的小工具。
//
// 只放与业务无关的纯函数：字符串取值、IP 归一、常量时间比较。
// 协议相关的实现一律引用 @lumesync/classroom-protocol，不在本文件里重写。

const crypto = require('crypto');

/** 取出字符串值（兼容 query 里的数组形式），并去掉首尾空白。 */
function getString(value) {
    if (value === undefined || value === null) return '';
    if (Array.isArray(value)) return getString(value[0]);
    return String(value).trim();
}

/**
 * 归一化连接来源 IP。
 * Express/Socket.IO 在 IPv6 双栈监听时给出 `::ffff:127.0.0.1`，判定回环前必须剥掉前缀。
 */
function normalizeIp(value) {
    const raw = getString(value);
    if (!raw) return '';
    if (raw.startsWith('::ffff:')) return raw.slice(7);
    // Socket.IO 在部分 Node 版本上给出 `/127.0.0.1:5678` 形式
    const withoutPort = raw.replace(/^([^[\]]*)\:\d+$/, '$1');
    return withoutPort === '::1' ? '::1' : withoutPort;
}

/** 回环判定：只有本机请求才允许领取管理凭证/屏幕内容。 */
function isLoopbackAddress(value) {
    const ip = normalizeIp(value);
    return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
}

/** 常量时间字符串比较；长度不同或期望值为空一律不通过。 */
function timingSafeEqualString(supplied, expected) {
    const left = Buffer.from(String(supplied === undefined || supplied === null ? '' : supplied), 'utf8');
    const right = Buffer.from(String(expected === undefined || expected === null ? '' : expected), 'utf8');
    return right.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

/** 随机十六进制串（nonce、会话标识用）。 */
function randomHex(bytes = 16) {
    return crypto.randomBytes(bytes).toString('hex');
}

module.exports = {
    getString,
    normalizeIp,
    isLoopbackAddress,
    timingSafeEqualString,
    randomHex
};
