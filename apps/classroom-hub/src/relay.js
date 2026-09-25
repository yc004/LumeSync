// 中继域运行时：把契约的四个纯逻辑模块（状态机、配对、租约、队列/暂存）接到 Hub 上。
//
// 设计：docs/architecture/teacher-cross-platform-relay.md §5–§7。
// Hub 在这里只做四件事，所有判定都交给契约：
//   1. 保存配对请求与设备公钥的临时绑定（契约的 verifyPairingProof 需要 deviceKey）；
//   2. 把「教师电脑提交的证明」翻译成契约的状态机迁移（submitCode / completePairing）；
//   3. 配对成功后签发绑定设备的短期凭证（createSessionToken），租约必须单独获取；
//   4. 维护提交转发队列与课件暂存的归属信息（哪个学生提交的、当前版本是哪个）。
//
// 验证码只存在于 relayState 的屏幕侧（screenPayload()），从不进入回执、发现报文或日志。

const {
    ERROR_CODES,
    RELAY_STATES,
    ROLE_HOST,
    PROTOCOL_VERSION,
    PAIRING_MAX_ATTEMPTS,
    createRelayState,
    createLeaseRegistry,
    createSubmissionQueue,
    createCourseStage,
    verifyPairingProof,
    createSessionToken,
    verifySessionToken
} = require('@lumesync/classroom-protocol');

const { randomHex } = require('./utils');

const MAX_PAIRING_HINTS = 32;
const MAX_APPLIED_REQUESTS = 500;

function ok(extra = {}) {
    return { ok: true, code: null, ...extra };
}

function fail(code, message, extra = {}) {
    return { ok: false, code, message, ...extra };
}

function createRelayRuntime({
    config,
    classroomId,
    classroomName,
    port,
    canDisplayCode = true,
    now = () => Date.now(),
    logger,
    onChange
}) {
    const mode = config.mode;
    // createRelayState 需要正整数端口；测试用 0 让系统分配，listen 之后由 setPort 修正
    // （端口只影响发现报文与状态描述，不参与任何授权判断）。
    let currentPort = Number(port) > 0 ? Number(port) : 3000;

    let relayState = createRelayState({
        classroomId,
        name: classroomName,
        port: currentPort,
        canDisplayCode,
        now
    });

    const leases = createLeaseRegistry({ leaseTtlMs: config.leaseTtlMs, now });
    const queue = createSubmissionQueue({ capacity: config.queueCapacity, ttlMs: config.queueTtlMs, now });
    const stage = createCourseStage({
        maxBytes: config.stageMaxBytes,
        maxVersions: config.stageMaxVersions,
        ttlMs: config.stageTtlMs,
        now
    });

    /** requestId -> {requestId, deviceKey, deviceName, nonce, verified, createdAt} */
    const pairingHints = new Map();
    /** deviceKey -> {deviceKey, deviceName, requestId, token, issuedAt, expiresAt} */
    const pairedDevices = new Map();
    /** courseHash -> Buffer（限时缓存的字节本体；当前是进程内存，见 README「持久化」） */
    const stagedBytes = new Map();
    /** requestId -> {revision, appliedAt}：命令幂等去重 */
    const appliedRequests = new Map();
    let awaitingTeacher = false;

    function notify() {
        if (typeof onChange !== 'function') return;
        try {
            const result = onChange();
            if (result && typeof result.catch === 'function') result.catch(() => {});
        } catch (error) {
            if (logger) logger.warn(`[relay] 状态变更通知失败：${error.message}`);
        }
    }

    function isRelayMode() {
        return mode === 'relay';
    }

    function pruneHints() {
        const timestamp = now();
        for (const [requestId, hint] of Array.from(pairingHints.entries())) {
            if (timestamp - hint.createdAt > MAX_PAIRING_HINTS * 60 * 1000) pairingHints.delete(requestId);
        }
        const active = relayState.snapshot().pairing;
        for (const requestId of Array.from(pairingHints.keys())) {
            if (!active || active.requestId !== requestId) {
                const hint = pairingHints.get(requestId);
                // 保留刚完成验证、等待获取租约的请求
                if (!hint || (!hint.verified && timestamp - hint.createdAt > 5 * 60 * 1000)) {
                    pairingHints.delete(requestId);
                }
            }
        }
        while (pairingHints.size > MAX_PAIRING_HINTS) {
            const oldest = pairingHints.keys().next().value;
            pairingHints.delete(oldest);
        }
    }

    function prunePairedDevices() {
        const timestamp = now();
        for (const [deviceKey, record] of Array.from(pairedDevices.entries())) {
            if (record.expiresAt <= timestamp) pairedDevices.delete(deviceKey);
        }
    }

    function currentPairing() {
        const snapshot = relayState.snapshot();
        if (!snapshot.pairing) return null;
        if (snapshot.pairingExpired || now() >= snapshot.pairing.expiresAt) return null;
        return snapshot.pairing;
    }

    function verifiedHintFor(deviceKey) {
        const active = currentPairing();
        if (!active) return null;
        const hint = pairingHints.get(active.requestId);
        if (!hint || !hint.verified) return null;
        if (hint.deviceKey !== deviceKey) return null;
        return hint;
    }

    function pendingVerifiedForOtherDevice(deviceKey) {
        const active = currentPairing();
        if (!active) return null;
        const hint = pairingHints.get(active.requestId);
        if (!hint || !hint.verified) return null;
        if (hint.deviceKey === deviceKey) return null;
        return hint;
    }

    /** 启动/关闭中继。direct 模式下 relayState 保持 disabled，不发布发现、不接受配对。 */
    function activate() {
        if (!isRelayMode()) {
            relayState.disable();
            return fail(ERROR_CODES.RELAY_DISABLED, '当前 Hub 运行在直接模式（direct），不提供教室中继接入');
        }
        const enabled = relayState.enable();
        notify();
        if (!enabled.ok) {
            logger && logger.error(`[relay] 无法开启中继：${enabled.code}`);
            return enabled;
        }
        return ok({ state: relayState.getState() });
    }

    function disable() {
        const result = relayState.disable();
        pairingHints.clear();
        notify();
        return result;
    }

    function setPort(nextPort) {
        const next = Number(nextPort);
        if (!Number.isInteger(next) || next <= 0 || next === currentPort) return;
        const snapshot = relayState.snapshot();
        // createRelayState 在创建时固定 port；端口要 listen 之后才知道（测试用 0 让系统分配）。
        // 启动阶段还没有配对与租约，重建状态机是安全的；课堂进行中只记录告警。
        if (snapshot.state === RELAY_STATES.PAIRING
            || snapshot.state === RELAY_STATES.TEACHING
            || snapshot.state === RELAY_STATES.PAIRED) {
            logger && logger.warn('[relay] 端口在课堂进行中变化，发现报文里的端口可能过期');
            currentPort = next;
            return;
        }
        currentPort = next;
        relayState = createRelayState({ classroomId, name: classroomName, port: currentPort, canDisplayCode, now });
        if (snapshot.state === RELAY_STATES.ERROR) {
            relayState.fail(snapshot.errorReason || ERROR_CODES.INTERNAL_ERROR);
        } else if (snapshot.state === RELAY_STATES.IDLE) {
            relayState.enable();
        }
        notify();
    }

    function requestPairing({ requestId, deviceKey, deviceName = '' }) {
        if (!isRelayMode()) {
            return fail(ERROR_CODES.RELAY_DISABLED, '当前 Hub 运行在直接模式（direct），不接受远程教师配对');
        }
        const id = String(requestId || '');
        const key = String(deviceKey || '');

        // 同一设备重复发起同一请求：幂等，复用同一个 challenge（不重新生成验证码）
        const existingHint = pairingHints.get(id);
        const active = currentPairing();
        if (existingHint && existingHint.deviceKey === key && active && active.requestId === id) {
            return ok({
                challenge: { requestId: id, expiresAt: active.expiresAt, nonce: existingHint.nonce, expiresInMs: active.expiresAt - now() },
                reused: true
            });
        }

        // 已有一个通过验证、等待获取授课租约的连接：不允许别的设备顶掉
        const otherPending = pendingVerifiedForOtherDevice(key);
        if (otherPending) {
            return fail(ERROR_CODES.RELAY_BUSY, '该教室已有通过验证、等待获取授课租约的连接');
        }

        const requested = relayState.requestPairing({ requestId: id, deviceKey: key, deviceName });
        if (!requested.ok) return fail(requested.code, requested.message);

        const nonce = randomHex(16);
        pairingHints.set(id, {
            requestId: id,
            deviceKey: key,
            deviceName: String(deviceName || ''),
            nonce,
            verified: false,
            createdAt: now()
        });
        pruneHints();
        notify();
        return ok({
            challenge: {
                requestId: id,
                expiresAt: requested.request.expiresAt,
                nonce,
                expiresInMs: requested.request.expiresAt - now()
            },
            reused: false
        });
    }

    /**
     * 校验教师电脑的握手证明。
     * 顺序：请求存在且未过期 → nonce 匹配 → HMAC 证明 → markVerified / recordFailure。
     * 验证码只在契约的屏幕侧读取（verifyPairingProof 需要它做密钥确认），
     * 既不回传教师电脑，也不通过 submitCode 再"提交"一次。
     */
    async function verifyPairing({ requestId, nonce, proof }) {
        if (!isRelayMode()) {
            return fail(ERROR_CODES.RELAY_DISABLED, '当前 Hub 运行在直接模式（direct），不接受远程教师配对');
        }
        const id = String(requestId || '');
        const hint = pairingHints.get(id);
        const snapshot = relayState.snapshot();
        const active = snapshot.pairing;

        if (!hint || !active || active.requestId !== id) {
            pairingHints.delete(id);
            return fail(ERROR_CODES.PAIRING_REQUEST_UNKNOWN, '没有对应的配对请求，请重新发起');
        }
        if (hint.verified) {
            // 同一请求的证明只能使用一次：已通过验证的请求不接受重放（即使证明仍然有效）。
            return fail(ERROR_CODES.PAIRING_REQUEST_UNKNOWN, '该配对请求已完成，需要重新发起');
        }
        if (snapshot.pairingExpired || now() >= active.expiresAt) {
            relayState.cancelPairing();
            pairingHints.delete(id);
            notify();
            return fail(ERROR_CODES.PAIRING_CODE_EXPIRED, '验证码已过期，请重新发起配对请求');
        }
        if (String(nonce || '') !== hint.nonce) {
            // 不是对本次 challenge 的响应（重放/串号），不消耗尝试次数
            return fail(ERROR_CODES.PAIRING_PROOF_INVALID, '配对握手参数与本次请求不一致，请重新发起');
        }

        // 屏幕侧请求（含验证码）只在 Hub 进程内使用，不进入任何回执。
        const screenPairing = relayState.screenPayload().pairing;
        if (!screenPairing || screenPairing.requestId !== id) {
            pairingHints.delete(id);
            return fail(ERROR_CODES.PAIRING_REQUEST_UNKNOWN, '配对请求已失效，请重新发起');
        }

        const proofResult = await verifyPairingProof({
            request: {
                classroomId,
                requestId: id,
                deviceKey: hint.deviceKey,
                code: screenPairing.code
            },
            proof,
            nonce
        });

        if (!proofResult.ok) {
            // 证明校验失败 = 教师输入的验证码不是当前验证码：交给契约的 recordFailure
            // 递减次数（用尽后由契约作废请求并回到 idle），Hub 不自己数次数。
            const failed = relayState.recordFailure({ requestId: id });
            if (failed.code === ERROR_CODES.PAIRING_ATTEMPTS_EXCEEDED) {
                pairingHints.delete(id);
                notify();
                return fail(
                    ERROR_CODES.PAIRING_ATTEMPTS_EXCEEDED,
                    `尝试次数已用尽（上限 ${PAIRING_MAX_ATTEMPTS} 次），请重新发起配对请求`,
                    { attemptsLeft: 0 }
                );
            }
            if (failed.code === ERROR_CODES.PAIRING_REQUEST_UNKNOWN) {
                pairingHints.delete(id);
                notify();
                return fail(ERROR_CODES.PAIRING_REQUEST_UNKNOWN, '配对请求已失效，请重新发起');
            }
            const attemptsLeft = failed.attemptsLeft === undefined ? 0 : failed.attemptsLeft;
            notify();
            return fail(ERROR_CODES.PAIRING_CODE_INVALID, `验证码不正确，剩余 ${attemptsLeft} 次`, { attemptsLeft });
        }

        // 证明正确：让契约把请求推进到已验证（计数归零、请求立即失效），
        // 验证码始终只存在于契约的屏幕侧，既不回传教师电脑，也不被 Hub "提交"。
        const verified = relayState.markVerified({ requestId: id });
        if (!verified.ok) {
            pairingHints.delete(id);
            notify();
            return fail(verified.code, verified.message);
        }

        hint.verified = true;
        hint.verifiedAt = now();

        const issued = await createSessionToken({
            secret: config.tokenSecret,
            clientId: hint.deviceKey,
            role: ROLE_HOST,
            ttlSec: config.deviceTokenTtlSec,
            now: now(),
            classroomId
        });
        const expiresAtMs = Date.parse(issued.expiresAt);
        pairedDevices.set(hint.deviceKey, {
            deviceKey: hint.deviceKey,
            deviceName: hint.deviceName,
            requestId: id,
            token: issued.token,
            issuedAt: now(),
            expiresAt: expiresAtMs
        });
        notify();
        return ok({ deviceToken: issued.token, expiresAt: issued.expiresAt, classroomId });
    }

    /** Socket 身份：中继模式下 host 只能是配对后签发的短期设备凭证。 */
    async function verifyDeviceToken(token, clientId) {
        prunePairedDevices();
        if (!token) return fail(ERROR_CODES.HOST_AUTH_FAILED, '缺少设备凭证，请先在固定机屏幕上完成验证码配对');
        const verified = await verifySessionToken(token, {
            secret: config.tokenSecret,
            role: ROLE_HOST,
            clientId: clientId || undefined,
            now: now()
        });
        if (!verified.ok) return fail(ERROR_CODES.HOST_AUTH_FAILED, verified.message);
        const deviceKey = verified.payload.clientId;
        if (verified.payload.classroomId && verified.payload.classroomId !== classroomId) {
            return fail(ERROR_CODES.HOST_AUTH_FAILED, '设备凭证不属于本教室');
        }
        if (!pairedDevices.has(deviceKey)) {
            return fail(ERROR_CODES.HOST_AUTH_FAILED, '设备凭证已失效（授课会话已结束或已过期），请重新配对');
        }
        return ok({ deviceKey, deviceName: pairedDevices.get(deviceKey).deviceName });
    }

    function isPairedDevice(deviceKey) {
        prunePairedDevices();
        return pairedDevices.has(String(deviceKey || ''));
    }

    /** 获取唯一授课租约；只有已配对设备、且配对验证仍在有效期内才允许。 */
    function acquireLease({ deviceKey, deviceName = '' }) {
        if (!isRelayMode()) {
            return fail(ERROR_CODES.RELAY_DISABLED, '直接模式不需要授课租约');
        }
        const key = String(deviceKey || '');
        if (!isPairedDevice(key)) {
            return fail(ERROR_CODES.HOST_AUTH_FAILED, '需要先完成验证码配对');
        }
        const current = leases.snapshot(classroomId);
        if (current && current.deviceKey === key) {
            return ok({ lease: current, reused: true });
        }
        const hint = verifiedHintFor(key);
        if (!hint) {
            if (current) return fail(ERROR_CODES.LEASE_ALREADY_HELD, '该教室正在授课中，需要现任教师释放或管理员撤销', { lease: current });
            return fail(ERROR_CODES.LEASE_EXPIRED, '授课授权已失效，请重新发起配对以获取新的授课租约');
        }
        const acquired = leases.acquire({
            classroomId,
            sessionId: `${classroomId}-${hint.requestId}`,
            deviceKey: key,
            deviceName: deviceName || hint.deviceName
        });
        if (!acquired.ok) {
            notify();
            return fail(acquired.code, acquired.message, { lease: acquired.lease || null });
        }
        const completed = relayState.completePairing({ leaseGranted: true });
        if (!completed.ok) {
            leases.release({ classroomId, leaseId: acquired.lease.leaseId, epoch: acquired.lease.epoch });
            notify();
            return fail(completed.code, completed.message);
        }
        pairingHints.delete(hint.requestId);
        awaitingTeacher = false;
        notify();
        return ok({ lease: acquired.lease, reused: false });
    }

    function renewLease({ deviceKey, leaseId, epoch }) {
        if (!isRelayMode()) return fail(ERROR_CODES.RELAY_DISABLED, '直接模式不需要授课租约');
        const current = leases.snapshot(classroomId);
        if (!current || current.deviceKey !== String(deviceKey || '')) {
            return fail(current ? ERROR_CODES.LEASE_NOT_HELD : ERROR_CODES.LEASE_EXPIRED, '当前不是该租约的持有者');
        }
        const renewed = leases.renew({ classroomId, leaseId, epoch });
        if (!renewed.ok) return fail(renewed.code, renewed.message, { lease: renewed.lease || null });
        return ok({ lease: renewed.lease });
    }

    function releaseLease({ deviceKey, leaseId, epoch }) {
        if (!isRelayMode()) return fail(ERROR_CODES.RELAY_DISABLED, '直接模式不需要授课租约');
        const key = String(deviceKey || '');
        const released = leases.release({ classroomId, leaseId, epoch });
        if (!released.ok) return fail(released.code, released.message, { lease: released.lease || null });
        relayState.releaseTeaching();
        // 结束授课即结束本次配对授权：下一次授课需要重新在固定机上显示验证码。
        pairedDevices.delete(key);
        pairingHints.clear();
        awaitingTeacher = false;
        notify();
        return ok({ released: !!released.released, epoch: released.epoch || null });
    }

    /** 管理员撤销（固定机侧）：租约立即失效并提高 epoch。 */
    function revokeLease({ reason = 'admin-revoked' } = {}) {
        const revoked = leases.revoke({ classroomId, reason });
        relayState.releaseTeaching();
        pairedDevices.clear();
        pairingHints.clear();
        awaitingTeacher = false;
        notify();
        return ok({ revoked: !!revoked.revoked, epoch: revoked.epoch || null });
    }

    /** course:stage（Socket 确认）：必须是已配对设备，且持有一个仍然有效的授课租约。 */
    function authorizeStaging({ deviceKey }) {
        if (!isRelayMode()) return fail(ERROR_CODES.RELAY_DISABLED, '直接模式不需要授课租约');
        if (!isPairedDevice(deviceKey)) return fail(ERROR_CODES.HOST_AUTH_FAILED, '需要先完成验证码配对');
        const current = leases.snapshot(classroomId);
        const described = leases.describe(classroomId);
        if (!current || described.state !== 'teaching') {
            return fail(ERROR_CODES.LEASE_EXPIRED, '授课租约已过期，请重新获取后再发布课件');
        }
        if (current.deviceKey !== String(deviceKey || '')) {
            return fail(ERROR_CODES.LEASE_NOT_HELD, '只有当前授课教师可以确认课件暂存');
        }
        return ok({ lease: current });
    }

    /** 每条控制命令都校验 leaseId + epoch；过期 epoch 一律拒绝。 */
    function authorizeCommand({ deviceKey, leaseId, epoch }) {        const current = leases.snapshot(classroomId);
        if (current && current.deviceKey !== String(deviceKey || '')) {
            return fail(ERROR_CODES.LEASE_NOT_HELD, '控制命令不是来自当前授课教师');
        }
        return leases.authorizeCommand({ classroomId, leaseId, epoch });
    }

    /** course:publish 只带 epoch，因此先用当前租约补出租约持有者再走同一套校验。 */
    function authorizePublish({ deviceKey, epoch }) {
        const current = leases.snapshot(classroomId);
        if (!current) {
            return fail(ERROR_CODES.LEASE_EXPIRED, '该教室当前没有授课租约');
        }
        if (current.deviceKey !== String(deviceKey || '')) {
            return fail(ERROR_CODES.LEASE_NOT_HELD, '发布课件不是来自当前授课教师');
        }
        return leases.authorizeCommand({ classroomId, leaseId: current.leaseId, epoch });
    }

    function stageCourse({ courseId, courseHash, sizeBytes, manifest, bytes }) {
        const staged = stage.stage({ courseId, courseHash, sizeBytes, manifest });
        if (!staged.ok) return fail(staged.code, staged.message);
        if (bytes && !stagedBytes.has(String(courseHash))) {
            stagedBytes.set(String(courseHash), bytes);
        }
        return ok({ courseId: String(courseId), courseHash: String(courseHash), sizeBytes: Number(sizeBytes) || 0, duplicate: !!staged.duplicate });
    }

    function hasStaged(courseHash) {
        return stage.has(courseHash);
    }

    function publishCourse({ courseId, courseHash }) {
        const published = stage.publish({ courseId, courseHash });
        if (!published.ok) return fail(published.code, published.message);
        return ok({
            courseId: published.courseId,
            courseHash: published.courseHash,
            previousCourseHash: published.previousCourseHash
        });
    }

    /** 教师离开前清理：保留正在播放的版本，返回被释放的版本。 */
    function clearStage() {
        const released = stage.clear({ keepCurrent: true });
        let bytesFreed = 0;
        for (const version of released) {
            const bytes = stagedBytes.get(version.courseHash);
            if (bytes) {
                bytesFreed += bytes.length;
                stagedBytes.delete(version.courseHash);
            }
        }
        return ok({
            released: released.map((version) => ({
                courseId: version.courseId,
                courseHash: version.courseHash,
                sizeBytes: version.sizeBytes || 0
            })),
            bytesFreed
        });
    }

    function stageStats() {
        const stats = stage.stats();
        let retainedBytes = 0;
        for (const bytes of stagedBytes.values()) retainedBytes += bytes.length;
        return { ...stats, retainedBytes };
    }

    function enqueueSubmission(submission) {
        return queue.enqueue(submission);
    }

    function markSubmissionDelivered(submissionId, options) {
        return queue.markDelivered(submissionId, options);
    }

    /** 周期清理：过期租约 → 等待教师；过期配对请求 → 回到等待连接。 */
    function sweep() {
        const changes = [];
        const reaped = leases.reap(classroomId);
        if (reaped) {
            const state = relayState.getState();
            if (state === RELAY_STATES.TEACHING || state === RELAY_STATES.PAIRED) {
                relayState.releaseTeaching();
            }
            pairedDevices.delete(reaped.deviceKey);
            awaitingTeacher = true;
            changes.push({ type: 'lease-expired', epoch: reaped.epoch, deviceKey: reaped.deviceKey });
        }
        const snapshot = relayState.snapshot();
        if (snapshot.pairing && (snapshot.pairingExpired || now() >= snapshot.pairing.expiresAt)) {
            relayState.cancelPairing();
            pairingHints.delete(snapshot.pairing.requestId);
            changes.push({ type: 'pairing-expired', requestId: snapshot.pairing.requestId });
        }
        const removedStage = stage.purgeExpired();
        for (const version of removedStage) {
            stagedBytes.delete(version.courseHash);
        }
        queue.purgeExpired();
        prunePairedDevices();
        pruneHints();
        if (changes.length > 0) notify();
        return changes;
    }

    /** 命令幂等：同一 requestId 只应用一次，重复请求回放同一份结果。 */
    function rememberRequest(requestId, entry) {
        if (!requestId) return;
        appliedRequests.set(String(requestId), { ...entry, appliedAt: now() });
        while (appliedRequests.size > MAX_APPLIED_REQUESTS) {
            appliedRequests.delete(appliedRequests.keys().next().value);
        }
    }

    function recalledRequest(requestId) {
        if (!requestId) return null;
        const entry = appliedRequests.get(String(requestId));
        return entry ? { ...entry } : null;
    }

    function describeLease() {
        const described = leases.describe(classroomId);
        return {
            ...described,
            state: described.state === 'idle' && awaitingTeacher ? 'awaiting-teacher' : described.state
        };
    }

    /** 对外状态：配对信息用契约的公开描述（无验证码），租约剔除凭证字段。 */
    function status() {
        const snapshot = relayState.snapshot();
        const described = describeLease();
        const lease = described.lease
            ? {
                epoch: described.lease.epoch,
                deviceName: described.lease.deviceName,
                grantedAt: described.lease.grantedAt,
                expiresAt: described.lease.expiresAt,
                renewals: described.lease.renewals
            }
            : null;
        return {
            mode,
            relay: {
                state: snapshot.state,
                label: snapshot.discoveryLabel,
                discoveryLabel: snapshot.discoveryLabel,
                errorReason: snapshot.errorReason || '',
                pairing: snapshot.pairing,
                pairingExpired: !!snapshot.pairingExpired
            },
            lease: {
                state: described.state,
                lease,
                remainingMs: described.remainingMs === undefined ? null : described.remainingMs,
                renewSoon: !!described.renewSoon
            },
            awaitingTeacher,
            pairedDevices: pairedDevices.size,
            queue: queue.stats(),
            stage: stageStats(),
            appliedRequests: appliedRequests.size
        };
    }

    return {
        mode,
        isRelayMode,
        getPort: () => currentPort,
        // 契约模块的只读访问：调用方（路由/测试/文档）需要细节时不必再持有一份引用
        getLeaseRegistry: () => leases,
        getQueue: () => queue,
        getStage: () => stage,
        getRelayState: () => relayState,
        setPort,
        activate,
        disable,
        requestPairing,
        verifyPairing,
        verifyDeviceToken,
        isPairedDevice,
        acquireLease,
        renewLease,
        releaseLease,
        revokeLease,
        authorizeStaging,
        authorizeCommand,
        authorizePublish,
        stageCourse,
        hasStaged,
        publishCourse,
        clearStage,
        stageStats,
        enqueueSubmission,
        markSubmissionDelivered,
        rememberRequest,
        recalledRequest,
        sweep,
        status,
        describeLease,
        discoveryTxt: () => relayState.discoveryTxt({ protocolVersion: PROTOCOL_VERSION }),
        screenPayload: () => relayState.screenPayload(),
        getState: () => relayState.getState(),
        enable: () => relayState.enable(),
        fail: (reason) => {
            const result = relayState.fail(reason);
            notify();
            return result;
        },
        cancelPairing: () => {
            const result = relayState.cancelPairing();
            pairingHints.clear();
            notify();
            return result;
        }
    };
}

module.exports = { createRelayRuntime };
