// 单元测试用的假 Hub / 假 socket / 假时钟。
//
// 假 Hub 用**契约自己的** verifyPairingProof 校验配对证明：代理算错 transcript 顺序、
// deviceKey 或 nonce 都会验证失败，因此"code → proof → accepted"这条路径不是自证。
// 所有时间与随机数可注入，测试不碰网络、不依赖真实定时器。

const crypto = require('node:crypto');

const {
    PROTOCOL_VERSION,
    verifyPairingProof,
    PAIRING_MAX_ATTEMPTS,
    PAIRING_TTL_MS
} = require('@lumesync/classroom-protocol');

const { createRecordingLogger } = require('./helpers');

/** 可控时钟 + 调度器：advance(ms) 只运行到期定时器。 */
function createFakeClock(start = 1_800_000_000_000) {
    let current = start;
    let sequence = 0;
    const timers = new Map();

    function setTimeoutFake(handler, delayMs) {
        sequence += 1;
        timers.set(sequence, { handler, at: current + Math.max(0, Number(delayMs) || 0) });
        return sequence;
    }
    function clearTimeoutFake(id) {
        timers.delete(id);
    }
    async function flush() {
        await new Promise((resolve) => setImmediate(resolve));
    }
    async function advance(ms) {
        const target = current + Math.max(0, Number(ms) || 0);
        for (;;) {
            const due = Array.from(timers.entries())
                .filter(([, timer]) => timer.at <= target)
                .sort((a, b) => a[1].at - b[1].at)[0];
            if (!due) break;
            timers.delete(due[0]);
            current = due[1].at;
            due[1].handler();
            await flush();
        }
        current = target;
        await flush();
    }
    return {
        now: () => current,
        scheduler: { setTimeout: setTimeoutFake, clearTimeout: clearTimeoutFake },
        advance,
        flush,
        pendingDelays: () => Array.from(timers.values()).map((timer) => timer.at - current).sort((a, b) => a - b)
    };
}

/**
 * 假 Hub：一个 socketFactory + 事件回执表。
 * @param {object} [options]
 * @param {string} [options.deviceKey] 期望的教师设备身份（用于校验配对证明）
 * @param {string} [options.code] 固定机屏幕上显示的验证码
 * @param {object} [options.ackOverrides] event -> (payload, ctx) => ack（返回非空则用它）
 * @param {boolean} [options.handshakeFailure] 'identity-rejected' | 'protocol-rejected' | null
 * @param {boolean} [options.rejectCredentialed] 只拒绝"带凭证"的握手（模拟配对后被撤销/交接）
 * @param {boolean} [options.connectError] 瞬时连接失败（如网络掉线）：抛 connect_error，客户端应退避重试
 * @param {number} [options.connectDelay] 握手延迟（假定时器，配合 clock 用）
 */
function createFakeHub(options = {}) {
    const clock = options.clock || createFakeClock();
    const logger = createRecordingLogger();
    const state = {
        classroomId: options.classroomId || 'classroom-fake',
        sessionId: options.sessionId || 'fake-session-1',
        revision: Number.isInteger(options.revision) ? options.revision : 3,
        courseId: options.courseId === undefined ? null : options.courseId,
        slideIndex: Number.isInteger(options.slideIndex) ? options.slideIndex : 0,
        hostSettings: { syncFollow: true },
        code: String(options.code || '12345678'),
        attemptsLeft: PAIRING_MAX_ATTEMPTS,
        pairing: null,
        pairRequests: 0,
        verifies: 0,
        lease: null,
        leaseRenewals: 0,
        epoch: 0,
        auths: []
    };

    const sockets = [];
    const sent = [];
    const ackOverrides = options.ackOverrides || {};
    // 可变的握手失败开关：模拟"配对成功后固定机撤销凭证/交接"的真实序列
    const failures = {
        identityRejected: options.handshakeFailure === 'identity-rejected',
        protocolRejected: options.handshakeFailure === 'protocol-rejected',
        rejectCredentialed: !!options.rejectCredentialed,
        connectError: !!options.connectError
    };

    function envelope(extra = {}) {
        return {
            protocolVersion: PROTOCOL_VERSION,
            classroomId: state.classroomId,
            sessionId: state.sessionId,
            revision: state.revision,
            ...extra
        };
    }

    function snapshot() {
        return {
            protocolVersion: PROTOCOL_VERSION,
            sessionId: state.sessionId,
            revision: state.revision,
            currentCourseId: state.courseId,
            currentSlideIndex: state.slideIndex,
            hostSettings: { ...state.hostSettings }
        };
    }

    function nextRevision() {
        state.revision += 1;
        return state.revision;
    }

    function defaultAck(event, payload, socket) {
        switch (event) {
            case 'teacher:pair.request': {
                state.pairRequests += 1;
                state.attemptsLeft = PAIRING_MAX_ATTEMPTS;
                state.pairing = {
                    requestId: String(payload.requestId),
                    deviceKey: String(payload.deviceKey),
                    nonce: crypto.randomBytes(8).toString('hex'),
                    expiresAt: clock.now() + PAIRING_TTL_MS,
                    verified: false
                };
                return {
                    ok: true,
                    requestId: state.pairing.requestId,
                    nonce: state.pairing.nonce,
                    expiresAt: state.pairing.expiresAt,
                    expiresInMs: PAIRING_TTL_MS,
                    classroomId: state.classroomId,
                    protocolVersion: PROTOCOL_VERSION,
                    reused: false
                };
            }
            case 'teacher:pair.verify': {
                state.verifies += 1;
                if (!state.pairing || state.pairing.requestId !== String(payload.requestId)) {
                    return { ok: false, code: 'pairing_request_unknown', message: '没有对应的配对请求' };
                }
                if (String(payload.nonce) !== state.pairing.nonce) {
                    return { ok: false, code: 'pairing_proof_invalid', message: '握手指数不匹配' };
                }
                if (state.pairing.verified) {
                    return { ok: false, code: 'pairing_request_unknown', message: '该配对请求已完成' };
                }
                // 用契约自己的校验器：证明必须匹配 classroomId|requestId|deviceKey|nonce
                return verifyPairingProof({
                    request: {
                        classroomId: state.classroomId,
                        requestId: state.pairing.requestId,
                        deviceKey: state.pairing.deviceKey,
                        code: state.code
                    },
                    proof: payload.proof,
                    nonce: payload.nonce
                }).then((result) => {
                    if (!result.ok) {
                        state.attemptsLeft -= 1;
                        if (state.attemptsLeft <= 0) {
                            state.pairing = null;
                            return { ok: false, code: 'pairing_attempts_exceeded', message: '尝试次数已用尽', attemptsLeft: 0 };
                        }
                        return {
                            ok: false,
                            code: 'pairing_code_invalid',
                            message: `验证码不正确，剩余 ${state.attemptsLeft} 次`,
                            attemptsLeft: state.attemptsLeft
                        };
                    }
                    state.pairing.verified = true;
                    return {
                        ok: true,
                        deviceToken: 'fake-device-token',
                        expiresAt: new Date(clock.now() + 8 * 60 * 60 * 1000).toISOString(),
                        classroomId: state.classroomId,
                        protocolVersion: PROTOCOL_VERSION
                    };
                });
            }
            case 'teacher:lease.acquire': {
                if (state.lease) return { ok: true, ...state.lease, reused: true };
                state.epoch += 1;
                state.lease = {
                    leaseId: `lease-${state.epoch}-fakeid`,
                    epoch: state.epoch,
                    expiresAt: clock.now() + 60000,
                    classroomId: state.classroomId
                };
                return { ok: true, ...state.lease, reused: false };
            }
            case 'teacher:lease.renew': {
                if (!state.lease) return { ok: false, code: 'lease_expired', message: '授课租约已过期' };
                if (state.lease.leaseId !== String(payload.leaseId)) return { ok: false, code: 'lease_not_held', message: '不是当前租约持有者' };
                if (state.lease.epoch !== Number(payload.epoch)) return { ok: false, code: 'lease_epoch_stale', message: '租约代次已过期' };
                state.leaseRenewals += 1;
                state.lease.expiresAt = clock.now() + 60000;
                return { ok: true, ...state.lease, renewals: state.leaseRenewals };
            }
            case 'teacher:lease.release': {
                const epoch = state.lease ? state.lease.epoch : null;
                state.lease = null;
                return { ok: true, released: true, epoch };
            }
            case 'course:stage': {
                return { ok: true, courseId: String(payload.courseId), courseHash: String(payload.courseHash), alreadyStaged: true, requestId: String(payload.requestId) };
            }
            case 'course:publish': {
                state.courseId = String(payload.courseId);
                return { ok: true, requestId: String(payload.requestId), revision: nextRevision(), courseId: state.courseId, courseHash: String(payload.courseHash) };
            }
            case 'classroom:command': {
                if (payload.type === 'course:select') state.courseId = String(payload.payload.courseId);
                if (payload.type === 'slide:set') state.slideIndex = Number(payload.payload.slideIndex);
                if (payload.type === 'settings:update') state.hostSettings = { ...state.hostSettings, ...payload.payload };
                if (payload.type === 'course:end') {
                    state.courseId = null;
                    state.slideIndex = 0;
                }
                return { ok: true, requestId: String(payload.requestId), revision: nextRevision(), type: String(payload.type) };
            }
            case 'submission:delivered': {
                return { ok: true, submissionId: String(payload.submissionId), delivered: true, pendingCount: 0 };
            }
            case 'request-classroom-snapshot': {
                socket.fire('classroom:snapshot', snapshot());
                return { ok: true };
            }
            default:
                return { ok: false, code: 'event_unknown', message: `未处理的假事件：${event}` };
        }
    }

    class FakeSocket {
        constructor(url, socketOptions) {
            this.url = url;
            this.options = socketOptions;
            this.handlers = new Map();
            this.sent = [];
            this.closed = false;
            this.connected = false;
            this.id = `fake-${sockets.length + 1}`;
            this.auth = (socketOptions && socketOptions.auth) || {};
            state.auths.push({ url, auth: { ...this.auth } });
            sockets.push(this);
            setImmediate(() => {
                if (this.closed) return;
                if (failures.connectError) {
                    // 瞬时网络失败：与身份无关，退避重试即可恢复（不是 identity/protocol 拒绝）
                    this.fire('connect_error', new Error('fake connect_error：网络不可达'));
                    this.connected = false;
                    return;
                }
                if (failures.identityRejected || (failures.rejectCredentialed && this.auth.token)) {
                    // 与 Hub 的 relay 身份判定一致：带了凭证但已撤销 → 明确 identity-rejected；
                    // 不带凭证 → 配对候选连接（因此"降级重开配对候选连接"这条路仍然可用）
                    this.fire('identity-rejected', { code: 'host_auth_failed', message: '设备凭证已失效' });
                    this.connected = false;
                    return;
                }
                if (failures.protocolRejected) {
                    this.fire('protocol-rejected', envelope({ payload: { code: 'protocol_version_unsupported', message: '版本不兼容' } }));
                    this.connected = false;
                    return;
                }
                this.connected = true;
                const pairingOnly = !!this.auth.role && this.auth.role === 'host' && !this.auth.token;
                this.fire('session:accepted', envelope({
                    payload: { role: 'host', clientId: this.auth.clientId || 'pair-client', mode: 'relay', pairingOnly }
                }));
                if (!pairingOnly) this.fire('classroom:snapshot', snapshot());
            });
        }

        on(event, handler) {
            const set = this.handlers.get(event) || new Set();
            set.add(handler);
            this.handlers.set(event, set);
            return this;
        }

        off(event, handler) {
            const set = this.handlers.get(event);
            if (set) set.delete(handler);
            return this;
        }

        emit(event, payload, ack) {
            this.sent.push({ event, payload });
            sent.push({ socket: this.id, event, payload });
            if (typeof ack !== 'function') return;
            const override = ackOverrides[event];
            let result;
            if (typeof override === 'function') result = override(payload, { state, socket: this, clock, call: defaultAck });
            else result = defaultAck(event, payload, this);
            if (result === undefined) return; // 故意不回执（测超时）
            Promise.resolve(result).then((value) => {
                if (value === null) return;
                ack(value);
            });
        }

        close() {
            this.closed = true;
            this.fire('disconnect', 'io client disconnect');
            this.connected = false;
        }

        fire(event, payload) {
            const set = this.handlers.get(event);
            if (!set) return;
            for (const handler of Array.from(set)) handler(payload);
        }

        /** 测试控制：模拟服务端/网络侧断开（handler 仍会收到 disconnect）。 */
        serverDisconnect(reason = 'transport close') {
            this.connected = false;
            this.fire('disconnect', reason);
        }
    }

    const factory = (url, socketOptions) => new FakeSocket(url, socketOptions);

    return {
        clock,
        logger,
        state,
        sockets,
        sent,
        factory,
        ackOverrides,
        failures,
        /** 测试控制：改变握手行为（例如"配对成功后凭证被撤销"）。 */
        setFailures: (patch) => Object.assign(failures, patch),
        snapshot,
        envelope,
        nextRevision,
        /** 最近一次使用的 socket。 */
        lastSocket: () => sockets[sockets.length - 1],
        /** 某个事件是否发给过假 Hub。 */
        eventsSent: (event) => sent.filter((entry) => entry.event === event),
        /** 从假 Hub 推一条广播。 */
        broadcast: (event, payload) => {
            for (const socket of sockets) {
                if (!socket.closed && socket.connected) socket.fire(event, payload);
            }
        }
    };
}

module.exports = { createFakeClock, createFakeHub };
