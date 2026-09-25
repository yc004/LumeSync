// HTTP 授权。
//
// 三种访问级别，规则全部来自共享契约的错误码，不在路由里散落字符串判断：
//   public       健康检查、协议描述、Hub 状态（不含验证码/凭证）
//   host         bearer 设备凭证（中继模式）或 host token（直接模式）；本机 + X-LumeSync-Host-Token 也可
//   local-admin  仅本机回环 + X-LumeSync-Host-Token：屏幕内容（含验证码）只走这条路径
//
// 设计约束（teacher-cross-platform-relay.md §8.3）：中继模式不通过公开 HTTP 接口
// 发放 host 权限，因此 relay 模式下 host token 只在本机回环请求上作为管理凭证使用。

const { ERROR_CODES, httpStatusForError } = require('@lumesync/classroom-protocol');
const { getString, isLoopbackAddress, timingSafeEqualString } = require('./utils');

function unauthorized(res, code, message) {
    res.status(httpStatusForError(code, 403)).json({ ok: false, code, message });
}

function createHostAuthority({ config, relay, isLoopback = (req) => isLoopbackAddress(req.socket && req.socket.remoteAddress) }) {
    function readsHostToken(req) {
        return getString(req.get('X-LumeSync-Host-Token'));
    }

    function isLocalAdmin(req) {
        return isLoopback(req) && timingSafeEqualString(readsHostToken(req), config.hostToken);
    }

    function bearerToken(req) {
        const match = /^Bearer ([^\s]+)$/.exec(String(req.get('Authorization') || ''));
        return match ? match[1] : '';
    }

    /**
     * host 权限：设备凭证（中继）/ host token（直接）/ 本机管理凭证。
     * 中继模式下 host token 过网即拒，避免固定机管理凭证被局域网设备复用。
     */
    async function requireHost(req, res, next) {
        try {
            if (isLocalAdmin(req)) {
                req.hubAuth = { via: 'local-admin', deviceKey: '' };
                return next();
            }
            const token = bearerToken(req);
            if (token && timingSafeEqualString(token, config.hostToken)) {
                if (config.mode === 'direct' || isLoopback(req)) {
                    req.hubAuth = { via: 'host-token', deviceKey: '' };
                    return next();
                }
                return unauthorized(res, ERROR_CODES.HOST_AUTHORIZATION_REQUIRED, '中继模式下 host token 只能在本机使用，请使用配对后的设备凭证');
            }
            if (config.mode === 'relay' && token) {
                const verified = await relay.verifyDeviceToken(token, '');
                if (verified.ok) {
                    req.hubAuth = { via: 'device-token', deviceKey: verified.deviceKey };
                    return next();
                }
                return unauthorized(res, ERROR_CODES.HOST_AUTHORIZATION_REQUIRED, verified.message);
            }
            return unauthorized(res, ERROR_CODES.HOST_AUTHORIZATION_REQUIRED, '需要 host 凭证');
        } catch (error) {
            return next(error);
        }
    }

    /** 屏幕内容（含验证码）：只允许本机 + 管理凭证，且不提供任何网络客户端的旁路。 */
    function requireScreenCredential(req, res, next) {
        if (!isLoopback(req)) {
            return unauthorized(res, ERROR_CODES.HOST_AUTHORIZATION_REQUIRED, '屏幕内容只允许固定机本机读取');
        }
        if (!timingSafeEqualString(readsHostToken(req), config.hostToken)) {
            return unauthorized(res, ERROR_CODES.HOST_AUTHORIZATION_REQUIRED, '缺少本机管理凭证');
        }
        req.hubAuth = { via: 'local-admin', deviceKey: '' };
        return next();
    }

    return { requireHost, requireScreenCredential, isLocalAdmin, isLoopback, bearerToken };
}

module.exports = { createHostAuthority };
