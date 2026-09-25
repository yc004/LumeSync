// 授课租约（teaching lease）。
//
// 设计约束（teacher-cross-platform-relay.md §7 控制权规则）：
//   - 一间教室同一时刻只能有一个授课控制租约；
//   - 只有教室空闲且配对成功后自动授予；
//   - 教师断线超时后租约过期，课堂进入「等待教师」，固定机不得自动升级为教师；
//   - 交接（现任释放或管理员撤销）后 epoch 递增，旧教师的命令必须被拒绝；
//   - 每条控制命令带 leaseId + epoch。
//
// 纯逻辑实现：时间通过 now 注入，便于测试与固定机重启后的恢复。

const { ERROR_CODES } = require('../errors');

const LEASE_TTL_MS = 60 * 1000;
const LEASE_RENEW_WINDOW_MS = 20 * 1000;

function createLeaseRegistry({ leaseTtlMs = LEASE_TTL_MS, now = () => Date.now() } = {}) {
    /** classroomId -> {leaseId, sessionId, deviceKey, deviceName, epoch, grantedAt, expiresAt, renewals} */
    const leases = new Map();
    /** classroomId -> 已发放过的最大 epoch：租约被释放/撤销后 epoch 仍必须继续递增 */
    const lastEpoch = new Map();

    function snapshot(classroomId) {
        const lease = leases.get(classroomId);
        if (!lease) return null;
        return { ...lease };
    }

    function isExpired(lease) {
        return !lease || now() >= lease.expiresAt;
    }

    /** 过期清理：把租约从表里移除并返回被清理的租约。 */
    function reap(classroomId) {
        const lease = leases.get(classroomId);
        if (lease && isExpired(lease)) {
            leases.delete(classroomId);
            return { ...lease, expired: true };
        }
        return null;
    }

    /**
     * 获取租约。教室已被他人持有时返回 LEASE_ALREADY_HELD 与当前状态，
     * 由 Hub 决定是拒绝还是提示教师走交接流程（设计上禁止教师端互相抢占）。
     */
    function acquire({ classroomId, sessionId, deviceKey, deviceName = '' }) {
        if (!classroomId || !sessionId || !deviceKey) {
            return { ok: false, code: ERROR_CODES.REQUEST_INVALID, message: 'acquire 需要 classroomId、sessionId 与 deviceKey' };
        }
        const reaped = reap(classroomId);
        const existing = leases.get(classroomId);
        if (existing && existing.deviceKey !== String(deviceKey)) {
            return {
                ok: false,
                code: ERROR_CODES.LEASE_ALREADY_HELD,
                message: '该教室正在授课中，需要现任教师释放或管理员撤销',
                lease: { ...existing }
            };
        }

        const previousEpoch = Math.max(
            existing ? existing.epoch : 0,
            reaped ? reaped.epoch : 0,
            lastEpoch.get(String(classroomId)) || 0
        );
        const epoch = previousEpoch + 1;
        lastEpoch.set(String(classroomId), epoch);
        const timestamp = now();
        const lease = {
            classroomId: String(classroomId),
            leaseId: `lease-${epoch}-${Math.random().toString(36).slice(2, 10)}`,
            sessionId: String(sessionId),
            deviceKey: String(deviceKey),
            deviceName: String(deviceName),
            epoch,
            grantedAt: timestamp,
            expiresAt: timestamp + leaseTtlMs,
            renewals: 0
        };
        leases.set(lease.classroomId, lease);
        return { ok: true, code: null, lease: { ...lease } };
    }

    /** 续租：必须同时匹配 leaseId 与 epoch，否则旧教师的续租会顶掉现任。 */
    function renew({ classroomId, leaseId, epoch }) {
        reap(classroomId);
        const lease = leases.get(classroomId);
        if (!lease) {
            return { ok: false, code: ERROR_CODES.LEASE_EXPIRED, message: '授课租约已过期，请重新获取' };
        }
        if (lease.leaseId !== leaseId) {
            return { ok: false, code: ERROR_CODES.LEASE_NOT_HELD, message: '当前不是该租约的持有者', lease: { ...lease } };
        }
        if (Number(epoch) !== lease.epoch) {
            return { ok: false, code: ERROR_CODES.LEASE_EPOCH_STALE, message: '租约代次已过期', lease: { ...lease } };
        }
        lease.expiresAt = now() + leaseTtlMs;
        lease.renewals += 1;
        return { ok: true, code: null, lease: { ...lease } };
    }

    /** 教师主动结束授课并释放控制权。 */
    function release({ classroomId, leaseId, epoch }) {
        const lease = leases.get(classroomId);
        if (!lease) return { ok: true, code: null, released: false };
        if (lease.leaseId !== leaseId || Number(epoch) !== lease.epoch) {
            return { ok: false, code: ERROR_CODES.LEASE_NOT_HELD, message: '只能释放自己持有的租约', lease: { ...lease } };
        }
        leases.delete(classroomId);
        return { ok: true, code: null, released: true, epoch: lease.epoch };
    }

    /** 固定机管理员撤销：用于异常会话或设备主人处理误请求。 */
    function revoke({ classroomId, reason = 'admin-revoked' }) {
        const lease = leases.get(classroomId);
        if (!lease) return { ok: true, code: null, revoked: false };
        leases.delete(classroomId);
        return { ok: true, code: null, revoked: true, epoch: lease.epoch, reason };
    }

    /**
     * 校验一条控制命令是否来自当前租约持有者。
     * 目标协议要求每条命令带 leaseId + epoch，过期的 epoch 必须被拒绝。
     */
    function authorizeCommand({ classroomId, leaseId, epoch }) {
        const reaped = reap(classroomId);
        const lease = leases.get(classroomId);
        if (!lease) {
            return {
                ok: false,
                code: ERROR_CODES.LEASE_EXPIRED,
                message: reaped ? '授课租约已过期，课堂进入等待教师状态' : '该教室当前没有授课租约'
            };
        }
        if (lease.leaseId !== leaseId) {
            return { ok: false, code: ERROR_CODES.LEASE_NOT_HELD, message: '控制命令不是来自当前授课教师', lease: { ...lease } };
        }
        if (Number(epoch) !== lease.epoch) {
            return { ok: false, code: ERROR_CODES.LEASE_EPOCH_STALE, message: '控制命令的租约代次已过期', lease: { ...lease } };
        }
        return { ok: true, code: null, lease: { ...lease } };
    }

    /** 供发现报文/教师端显示：空闲、授课中（含到期时间）或等待教师。 */
    function describe(classroomId) {
        const lease = leases.get(classroomId);
        if (!lease) return { state: 'idle', lease: null };
        const remainingMs = Math.max(0, lease.expiresAt - now());
        return {
            state: remainingMs > 0 ? 'teaching' : 'awaiting-teacher',
            lease: { ...lease },
            remainingMs,
            renewSoon: remainingMs <= LEASE_RENEW_WINDOW_MS
        };
    }

    return {
        acquire,
        renew,
        release,
        revoke,
        authorizeCommand,
        describe,
        snapshot,
        reap,
        size: () => leases.size
    };
}

module.exports = {
    LEASE_TTL_MS,
    LEASE_RENEW_WINDOW_MS,
    createLeaseRegistry
};
