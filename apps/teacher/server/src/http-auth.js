const crypto = require('crypto');
const { requiresHostForApiRoute, resolveApiRoute } = require('@lumesync/classroom-protocol');

function isHostToken(value, expected = process.env.LUMESYNC_HOST_TOKEN || '') {
    const supplied = Buffer.from(String(value || ''), 'utf8');
    const configured = Buffer.from(String(expected || ''), 'utf8');
    return configured.length > 0 && supplied.length === configured.length && crypto.timingSafeEqual(supplied, configured);
}

function requireHost(req, res, next) {
    const authorization = String(req.get('Authorization') || '');
    const match = /^Bearer ([^\s]+)$/.exec(authorization);
    if (!match || !isHostToken(match[1])) {
        res.status(403).json({ success: false, error: 'host_authorization_required' });
        return;
    }
    next();
}

// 授权规则来自共享契约的路由表，而不是本模块里的正则猜测。
// 未声明的写请求按 host 处理，读请求保持公开，与首轮加固行为一致。
function requiresHostForApi(req) {
    return requiresHostForApiRoute(req.method, req.path);
}

function resolveApiAccess(req) {
    return resolveApiRoute(req.method, req.path);
}

function authorizeApi(req, res, next) {
    if (!requiresHostForApi(req)) return next();
    return requireHost(req, res, next);
}

module.exports = { isHostToken, requireHost, authorizeApi, requiresHostForApi, resolveApiAccess };
