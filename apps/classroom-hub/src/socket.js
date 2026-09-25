// Socket.IO 面：握手、中继配对/租约、课堂命令、课件发布、提交转发与学生事件转发。
//
// 握手顺序与教师服务一致：
//   身份（host token / 设备凭证 / viewer 凭证）→ 协议版本协商 → session:accepted
//   + classroom:snapshot → 挂载契约入站守卫（scopes: ['classroom','relay']）。
//
// 两类角色的边界：
//   host   —— 直接模式用 host token；中继模式只能用配对后签发的设备凭证，
//             并且每条控制命令都要带 leaseId + epoch（契约 authorizeCommand）。
//   viewer —— 短期 viewer 凭证；提交走队列，其余声明的课堂事件按契约表通用转发给教师房间。

const {
    ERROR_CODES,
    ROLE_HOST,
    ROLE_VIEWER,
    INBOUND_EVENTS,
    authorizeEvent,
    normalizeRole,
    verifySessionToken,
    createEnvelope
} = require('@lumesync/classroom-protocol');

const protocol = require('./protocol');
const { createClassroomController } = require('./classroom-controller');
const { getString, normalizeIp, timingSafeEqualString } = require('./utils');

const HOSTS_ROOM = 'hosts';
const VIEWERS_ROOM = 'viewers';

// 这些 viewer 事件有专门的处理器，不走通用转发。
const HANDLED_VIEWER_EVENTS = new Set([
    'session:hello',
    'request-classroom-snapshot',
    'student:submit'
]);

/**
 * 通用转发清单：直接从契约的入站事件表生成，避免"声明了但没有处理器"的静默路径。
 * 只包含 scope=classroom 且 viewer（或 any）可发的事件；中继事件由 host 发送，不在此列。
 */
function listViewerForwardEvents() {
    return Object.entries(INBOUND_EVENTS)
        .filter(([, entry]) => (entry.scope || 'classroom') === 'classroom')
        .filter(([, entry]) => entry.roles.includes(ROLE_VIEWER) || entry.roles.includes('any'))
        .map(([name]) => name)
        .filter((name) => !HANDLED_VIEWER_EVENTS.has(name));
}

const VIEWER_FORWARD_EVENTS = listViewerForwardEvents();

// 直接模式的旧事件名 -> 类型化命令。中继模式必须走 classroom:command（带租约）。
const DIRECT_COMMAND_EVENTS = {
    'select-course': (data) => ({ type: 'course:select', payload: { courseId: data && data.courseId } }),
    'sync-slide': (data) => ({ type: 'slide:set', payload: { slideIndex: data && data.slideIndex } }),
    'update-settings': (data) => ({ type: 'settings:update', payload: data }),
    'host-settings': (data) => ({ type: 'settings:update', payload: data }),
    'end-course': () => ({ type: 'course:end', payload: {} })
};

function callAck(ack, payload) {
    if (typeof ack === 'function') ack(payload);
}

/**
 * 用契约的 payload schema 再校验一次。
 *
 * 配对候选连接的守门只放行 teacher:pair.*（scope 收窄），因此这两个事件的 payload
 * 不会经过 socket.use 守卫；这里在处理器内部用同一份契约 schema 复核，
 * 避免 Hub 自己拼参数时被畸形 payload 触发异常。
 */
function guardPayload(name, payload) {
    return authorizeEvent(ROLE_HOST, name, payload, { scopes: ['relay'] });
}

/** 身份解析：直接模式接受 host token；中继模式 host 只接受配对签发的设备凭证。 */
async function resolveConnectionIdentity(socket, ctx) {
    const auth = (socket.handshake && socket.handshake.auth) || {};
    const query = (socket.handshake && socket.handshake.query) || {};
    const clientIp = normalizeIp((socket.handshake && socket.handshake.address) || '');
    const declaredRole = normalizeRole(auth.role || query.role);
    const token = getString(auth.token || query.token);
    const clientId = getString(auth.clientId || query.clientId);

    if (declaredRole === ROLE_HOST) {
        if (ctx.config.mode === 'direct') {
            if (timingSafeEqualString(token, ctx.config.hostToken)) {
                return { ok: true, role: ROLE_HOST, clientIp, clientId: clientId || `host-${clientIp}`, via: 'host-token' };
            }
            return { ok: false, code: ERROR_CODES.HOST_AUTH_FAILED, message: 'Invalid host token' };
        }
        // 中继模式：没有凭证 = 只能配对的候选连接（拿不到课堂快照、不在教师房间、
        // 只能发 teacher:pair.*）；带了凭证就必须有效，否则明确拒绝，不做静默降级。
        if (!token) {
            return {
                ok: true,
                role: ROLE_HOST,
                pairingOnly: true,
                clientIp,
                clientId: clientId || `pair-${clientIp}`,
                via: 'unpaired'
            };
        }
        const verified = await ctx.relay.verifyDeviceToken(token, clientId || undefined);
        if (verified.ok) {
            return {
                ok: true,
                role: ROLE_HOST,
                clientIp,
                clientId: verified.deviceKey,
                via: 'device-token',
                deviceName: verified.deviceName
            };
        }
        return { ok: false, code: ERROR_CODES.HOST_AUTH_FAILED, message: verified.message };
    }

    if (declaredRole === ROLE_VIEWER && token && clientId) {
        const verified = await verifySessionToken(token, {
            secret: ctx.config.tokenSecret,
            role: ROLE_VIEWER,
            clientId,
            now: ctx.now()
        });
        if (verified.ok) {
            return { ok: true, role: ROLE_VIEWER, clientIp, clientId, via: 'viewer-token' };
        }
        return { ok: false, code: ERROR_CODES.VIEWER_AUTH_FAILED, message: verified.message };
    }

    return { ok: false, code: ERROR_CODES.VIEWER_AUTH_FAILED, message: 'Valid viewer session required' };
}

function setupSocketHandlers(io, ctx) {
    const { config, logger, classroom, relay, submissions } = ctx;
    const controller = createClassroomController({ classroom, logger });

    /**
     * 安全注册事件处理器：任何未预期异常都只影响这一条消息（记日志 + 回 internal_error），
     * 绝不能把整个 Hub 进程带走——局域网客户端可以直接构造畸形 payload。
     */
    const on = (socket, event, handler) => {
        socket.on(event, (...args) => {
            const ack = args.length > 0 && typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
            const handleError = (error) => {
                logger.error(`[socket] ${event} 处理失败：${error && error.message ? error.message : error}`);
                callAck(ack, { ok: false, code: ERROR_CODES.INTERNAL_ERROR, message: 'Hub 内部错误' });
            };
            try {
                const result = handler(...args);
                if (result && typeof result.catch === 'function') result.catch(handleError);
            } catch (error) {
                handleError(error);
            }
        });
    };

    /** 学生在线统计：IP -> 连接数（与教师服务一致，同一 IP 只算一个学生）。 */
    const studentIps = new Map();

    function emitSnapshot() {
        const snapshot = classroom.snapshot();
        io.emit(protocol.SNAPSHOT_EVENT, snapshot);
        return snapshot;
    }

    function broadcastEvents(events) {
        for (const item of events) {
            if (item.audience === 'viewers') io.to(VIEWERS_ROOM).emit(item.event, item.payload);
            else if (item.audience === 'hosts') io.to(HOSTS_ROOM).emit(item.event, item.payload);
            else io.emit(item.event, item.payload);
        }
    }

    function applyAndBroadcast(type, payload) {
        const result = controller.apply({ type, payload });
        if (!result.ok) return result;
        broadcastEvents(result.events);
        emitSnapshot();
        return result;
    }

    io.on('connection', async (socket) => {
        let identity;
        try {
            identity = await resolveConnectionIdentity(socket, ctx);
        } catch (error) {
            logger.error(`[socket] 身份校验异常：${error.message}`);
            socket.emit('identity-rejected', { code: ERROR_CODES.INTERNAL_ERROR, message: '身份校验失败' });
            socket.disconnect(true);
            return;
        }

        if (!identity.ok) {
            socket.emit('identity-rejected', { code: identity.code, message: identity.message });
            socket.disconnect(true);
            return;
        }

        const negotiation = protocol.negotiateConnection(socket);
        if (!negotiation.ok) {
            socket.emit(protocol.PROTOCOL_REJECTED_EVENT, protocol.buildProtocolRejected({
                code: negotiation.code,
                message: negotiation.message
            }));
            logger.warn(`[protocol] rejected version=${String(negotiation.declared)} code=${negotiation.code}`);
            socket.disconnect(true);
            return;
        }

        const { role, clientIp, clientId } = identity;
        const deviceKey = role === ROLE_HOST && !identity.pairingOnly ? identity.clientId : '';
        logger.info(`[conn] role=${role} clientId=${clientId} ip=${clientIp} protocol=${negotiation.protocolVersion}${identity.pairingOnly ? ' (pairing-only)' : ''}${negotiation.legacy ? ' (legacy)' : ''}`);

        // 配对处理器：配对候选连接与已配对连接都要注册（后者用于重新配对/换机）。
        const registerPairingHandlers = () => {
            on(socket, 'teacher:pair.request', (payload = {}, ack) => {
                const validated = guardPayload('teacher:pair.request', payload);
                if (!validated.ok) {
                    const rejection = { requestId: getString(payload.requestId), ok: false, code: validated.code, message: validated.message };
                    socket.emit('teacher:pair.rejected', rejection);
                    callAck(ack, rejection);
                    return;
                }
                const result = relay.requestPairing({
                    requestId: getString(validated.value.requestId),
                    deviceKey: getString(validated.value.deviceKey),
                    deviceName: getString(validated.value.deviceName)
                });
                if (!result.ok) {
                    const rejection = { requestId: getString(payload.requestId), ok: false, code: result.code, message: result.message };
                    socket.emit('teacher:pair.rejected', rejection);
                    callAck(ack, rejection);
                    return;
                }
                // 只回请求编号、时限与握手参数；验证码只在固定机屏幕（GET /api/hub/screen）。
                const challenge = {
                    requestId: result.challenge.requestId,
                    expiresAt: result.challenge.expiresAt,
                    expiresInMs: result.challenge.expiresInMs,
                    nonce: result.challenge.nonce,
                    classroomId: config.classroomId,
                    protocolVersion: protocol.PROTOCOL_VERSION,
                    reused: !!result.reused
                };
                socket.emit('teacher:pair.challenge', challenge);
                callAck(ack, { ok: true, ...challenge });
                logger.info(`[relay] pair.request id=${challenge.requestId} reused=${challenge.reused}`);
            });

            on(socket, 'teacher:pair.verify', async (payload = {}, ack) => {
                try {
                    const validated = guardPayload('teacher:pair.verify', payload);
                    if (!validated.ok) {
                        const rejection = { requestId: getString(payload.requestId), ok: false, code: validated.code, message: validated.message };
                        socket.emit('teacher:pair.rejected', rejection);
                        callAck(ack, rejection);
                        return;
                    }
                    const result = await relay.verifyPairing({
                        requestId: getString(validated.value.requestId),
                        nonce: getString(validated.value.nonce),
                        proof: getString(validated.value.proof)
                    });
                    if (!result.ok) {
                        const rejection = {
                            requestId: getString(payload.requestId),
                            ok: false,
                            code: result.code,
                            message: result.message,
                            attemptsLeft: result.attemptsLeft === undefined ? null : result.attemptsLeft
                        };
                        socket.emit('teacher:pair.rejected', rejection);
                        callAck(ack, rejection);
                        logger.warn(`[relay] pair.verify rejected code=${result.code}`);
                        return;
                    }
                    const accepted = {
                        ok: true,
                        deviceToken: result.deviceToken,
                        expiresAt: result.expiresAt,
                        classroomId: result.classroomId,
                        protocolVersion: protocol.PROTOCOL_VERSION,
                        note: '请用 deviceToken 重新连接以获得授课权限，然后调用 teacher:lease.acquire'
                    };
                    socket.emit('teacher:pair.accepted', accepted);
                    callAck(ack, accepted);
                    logger.info('[relay] pair.accepted（已签发设备凭证，授课租约仍需单独获取）');
                } catch (error) {
                    logger.error(`[relay] pair.verify 异常：${error.message}`);
                    const rejection = { ok: false, code: ERROR_CODES.INTERNAL_ERROR, message: '配对校验失败' };
                    socket.emit('teacher:pair.rejected', rejection);
                    callAck(ack, rejection);
                }
            });
        };

        if (identity.pairingOnly) {
            // 配对候选连接：守门只放行 teacher:pair.*，其余事件按契约的 event_unknown 拒绝；
            // 不加入 hosts 房间、不发课堂快照，也不能拿到任何课堂内容。
            protocol.attachInboundGuard(socket, role, {
                allowUndeclared: false,
                scopes: ['pairing'],
                ignore: ['teacher:pair.request', 'teacher:pair.verify'],
                onViolation: (info) => logger.warn(`[protocol] rejected ${info.event} role=${info.role} code=${info.code}`)
            });
            socket.emit(protocol.SESSION_ACCEPTED_EVENT, protocol.buildSessionAccepted({
                role,
                clientId,
                clientIp,
                sessionId: classroom.getSessionId(),
                revision: classroom.getRevision(),
                negotiation,
                classroomId: config.classroomId,
                mode: config.mode,
                pairingOnly: true
            }));
            registerPairingHandlers();
            return;
        }

        protocol.attachInboundGuard(socket, role, {
            allowUndeclared: config.allowUndeclaredEvents,
            onViolation: (info) => logger.warn(`[protocol] rejected ${info.event} role=${info.role} code=${info.code}`)
        });

        const sendSessionAccepted = () => {
            socket.emit(protocol.SESSION_ACCEPTED_EVENT, protocol.buildSessionAccepted({
                role,
                clientId,
                clientIp,
                sessionId: classroom.getSessionId(),
                revision: classroom.getRevision(),
                negotiation,
                classroomId: config.classroomId,
                mode: config.mode
            }));
            socket.emit(protocol.SNAPSHOT_EVENT, classroom.snapshot());
        };

        on(socket, protocol.SESSION_HELLO_EVENT, () => sendSessionAccepted());
        on(socket, 'request-classroom-snapshot', () => {
            socket.emit(protocol.SNAPSHOT_EVENT, classroom.snapshot());
        });

        if (role === ROLE_HOST) {
            socket.join(HOSTS_ROOM);
            socket.join(`host:${deviceKey || clientIp}`);
            socket.emit('student-status', { count: studentIps.size, action: 'init' });
        } else {
            socket.join(VIEWERS_ROOM);
            socket.join(`viewer-ip:${clientIp}`);
            socket.join(`viewer:${clientId}`);
            const previous = studentIps.get(clientIp) || 0;
            studentIps.set(clientIp, previous + 1);
            if (previous === 0) {
                io.to(HOSTS_ROOM).emit('student-status', { count: studentIps.size, action: 'join', ip: clientIp });
            }
        }

        sendSessionAccepted();

        // ---------------------------------------------------------------
        // 中继：配对（与配对候选连接共用同一套处理器）
        // ---------------------------------------------------------------
        registerPairingHandlers();

        // ---------------------------------------------------------------
        // 中继：授课租约
        // ---------------------------------------------------------------
        on(socket, 'teacher:lease.acquire', (payload = {}, ack) => {
            const result = relay.acquireLease({ deviceKey, deviceName: identity.deviceName || '' });
            if (!result.ok) {
                // 契约没有声明通用的 lease 拒绝事件，这里复用已声明的 teacher:pair.rejected 回传契约错误码。
                const rejection = { ok: false, code: result.code, message: result.message };
                socket.emit('teacher:pair.rejected', rejection);
                callAck(ack, rejection);
                logger.warn(`[relay] lease.acquire rejected code=${result.code}`);
                return;
            }
            const granted = {
                ok: true,
                leaseId: result.lease.leaseId,
                epoch: result.lease.epoch,
                expiresAt: result.lease.expiresAt,
                classroomId: config.classroomId,
                reused: !!result.reused
            };
            socket.emit('teacher:lease.granted', granted);
            callAck(ack, granted);
            logger.info(`[relay] lease.granted epoch=${granted.epoch} reused=${granted.reused}`);
        });

        on(socket, 'teacher:lease.renew', (payload = {}, ack) => {
            const result = relay.renewLease({
                deviceKey,
                leaseId: getString(payload.leaseId),
                epoch: payload.epoch
            });
            if (!result.ok) {
                const rejection = { ok: false, code: result.code, message: result.message };
                socket.emit('teacher:pair.rejected', rejection);
                callAck(ack, rejection);
                return;
            }
            const renewed = {
                ok: true,
                leaseId: result.lease.leaseId,
                epoch: result.lease.epoch,
                expiresAt: result.lease.expiresAt,
                renewals: result.lease.renewals
            };
            // 契约未声明 lease.renewed：带 ack 的客户端从 ack 拿结果，否则回 lease.granted。
            if (typeof ack === 'function') callAck(ack, renewed);
            else socket.emit('teacher:lease.granted', renewed);
        });

        on(socket, 'teacher:lease.release', (payload = {}, ack) => {
            const result = relay.releaseLease({
                deviceKey,
                leaseId: getString(payload.leaseId),
                epoch: payload.epoch
            });
            if (!result.ok) {
                const rejection = { ok: false, code: result.code, message: result.message };
                socket.emit('teacher:pair.rejected', rejection);
                callAck(ack, rejection);
                return;
            }
            const released = { ok: true, released: result.released, epoch: result.epoch };
            io.emit('teacher:lease.revoked', { epoch: result.epoch, reason: 'released' });
            callAck(ack, released);
            logger.info(`[relay] lease.released epoch=${result.epoch}`);
        });

        // ---------------------------------------------------------------
        // 课件：暂存确认与发布（发布是切换课堂课程的权威动作）
        // ---------------------------------------------------------------
        on(socket, 'course:stage', (payload = {}, ack) => {
            if (!relay.isRelayMode()) {
                callAck(ack, { ok: false, code: ERROR_CODES.RELAY_DISABLED, message: '直接模式请通过 HTTP 上传课件' });
                return;
            }
            const authorized = relay.authorizeStaging({ deviceKey });
            if (!authorized.ok) {
                callAck(ack, { ok: false, code: authorized.code, message: authorized.message });
                return;
            }
            const courseHash = getString(payload.courseHash);
            if (!relay.hasStaged(courseHash)) {
                const rejected = { ok: false, code: ERROR_CODES.COURSE_HASH_UNKNOWN, message: '该 courseHash 尚未通过 HTTPS 上传并校验' };
                callAck(ack, rejected);
                socket.emit('course:stage:ack', { ...rejected, courseId: getString(payload.courseId), courseHash });
                return;
            }
            const staged = {
                ok: true,
                courseId: getString(payload.courseId),
                courseHash,
                alreadyStaged: true,
                requestId: getString(payload.requestId)
            };
            socket.emit('course:stage:ack', staged);
            callAck(ack, staged);
        });

        on(socket, 'course:publish', (payload = {}, ack) => {
            const requestId = getString(payload.requestId);
            const courseId = getString(payload.courseId);
            const courseHash = getString(payload.courseHash);

            const recalled = relay.recalledRequest(requestId);
            if (recalled && recalled.kind === 'course:publish') {
                // 幂等：同一 requestId 不重复切换课程
                callAck(ack, {
                    requestId,
                    ok: true,
                    revision: recalled.revision,
                    courseId: recalled.courseId,
                    courseHash: recalled.courseHash,
                    duplicate: true
                });
                return;
            }

            const authorized = relay.authorizePublish({ deviceKey, epoch: payload.epoch });
            if (!authorized.ok) {
                callAck(ack, {
                    requestId,
                    ok: false,
                    code: authorized.code,
                    message: authorized.message,
                    revision: classroom.getRevision()
                });
                socket.emit(protocol.SNAPSHOT_EVENT, classroom.snapshot());
                logger.warn(`[relay] course:publish rejected code=${authorized.code}`);
                return;
            }

            const published = relay.publishCourse({ courseId, courseHash });
            if (!published.ok) {
                callAck(ack, { requestId, ok: false, code: published.code, message: published.message, revision: classroom.getRevision() });
                return;
            }

            const revision = classroom.changeCourse(courseId);
            io.emit('course:published', createEnvelope({
                protocolVersion: protocol.PROTOCOL_VERSION,
                classroomId: config.classroomId,
                sessionId: classroom.getSessionId(),
                requestId,
                revision,
                payload: {
                    courseId: published.courseId,
                    courseHash: published.courseHash,
                    previousCourseHash: published.previousCourseHash
                }
            }));
            // 兼容仍在使用当前学生页的事件名（契约把 course:selected 登记为它的目标命名）。
            io.to(VIEWERS_ROOM).emit('course-changed', {
                courseId: published.courseId,
                slideIndex: 0,
                hostSettings: classroom.getHostSettings(),
                revision
            });
            emitSnapshot();
            relay.rememberRequest(requestId, { kind: 'course:publish', revision, courseId, courseHash });
            callAck(ack, { requestId, ok: true, revision, courseId, courseHash });
            logger.info(`[relay] course:published course=${courseId} revision=${revision}`);
        });

        // ---------------------------------------------------------------
        // 类型化课堂命令（中继模式的控制通道）
        // ---------------------------------------------------------------
        on(socket, 'classroom:command', (payload = {}, ack) => {
            const requestId = getString(payload.requestId);
            const type = getString(payload.type);

            const recalled = relay.recalledRequest(requestId);
            if (recalled && recalled.kind === 'classroom:command') {
                callAck(ack, { requestId, ok: true, revision: recalled.revision, type, duplicate: true });
                return;
            }

            const authorized = relay.authorizeCommand({
                deviceKey,
                leaseId: getString(payload.leaseId),
                epoch: payload.epoch
            });
            if (!authorized.ok) {
                callAck(ack, {
                    requestId,
                    ok: false,
                    code: authorized.code,
                    message: authorized.message,
                    revision: classroom.getRevision()
                });
                // 没有 ack 的客户端至少能看到权威 revision，确认自己没有改动课堂状态。
                socket.emit(protocol.SNAPSHOT_EVENT, classroom.snapshot());
                logger.warn(`[classroom:command] rejected type=${type} code=${authorized.code}`);
                return;
            }

            const result = applyAndBroadcast(type, payload.payload);
            if (!result.ok) {
                callAck(ack, { requestId, ok: false, code: result.code, message: result.message, revision: classroom.getRevision() });
                return;
            }
            relay.rememberRequest(requestId, { kind: 'classroom:command', type, revision: result.revision });
            callAck(ack, { requestId, ok: true, revision: result.revision, type });
        });

        // ---------------------------------------------------------------
        // 直接模式的旧事件名（中继模式必须走带租约的 classroom:command）
        // ---------------------------------------------------------------
        for (const [event, toCommand] of Object.entries(DIRECT_COMMAND_EVENTS)) {
            on(socket, event, (data, ack) => {
                if (config.mode !== 'direct') {
                    callAck(ack, {
                        ok: false,
                        code: ERROR_CODES.LEASE_NOT_HELD,
                        message: '中继模式必须使用带 leaseId + epoch 的 classroom:command'
                    });
                    return;
                }
                const command = toCommand(data);
                const result = applyAndBroadcast(command.type, command.payload);
                if (!result.ok) {
                    callAck(ack, { ok: false, code: result.code, message: result.message, revision: classroom.getRevision() });
                    return;
                }
                callAck(ack, { ok: true, revision: result.revision, type: command.type });
            });
        }

        on(socket, 'get-student-count', () => {
            if (role !== ROLE_HOST) return;
            socket.emit('student-status', { count: studentIps.size, action: 'init' });
        });

        on(socket, 'refresh-courses', (_data, ack) => {
            // Hub 不托管课程目录：教师电脑自己保存课件，这里只回执，避免出现静默无响应。
            callAck(ack, { ok: true, courses: [] });
        });

        // ---------------------------------------------------------------
        // 提交：Hub 先入队，教师电脑确认落盘后才给最终成功
        // ---------------------------------------------------------------
        on(socket, 'student:submit', (payload = {}, ack) => {
            const submissionId = getString(payload.submissionId);
            const courseId = getString(payload.courseId) || classroom.getCourseId() || '';
            const result = submissions.enqueue({
                submission: {
                    submissionId,
                    courseId,
                    clientIp,
                    content: payload.content === undefined ? null : payload.content,
                    fileName: getString(payload.fileName),
                    mergeFile: !!payload.mergeFile
                },
                clientId,
                clientIp
            });

            if (!result.ok) {
                // 队列满：明确拒绝，绝不静默丢弃。
                const rejection = {
                    submissionId,
                    success: false,
                    ok: false,
                    code: result.code,
                    error: result.message,
                    capacity: result.capacity,
                    size: result.size
                };
                socket.emit('student:submit:result', rejection);
                callAck(ack, rejection);
                logger.warn(`[submission] rejected id=${submissionId} code=${result.code}`);
                return;
            }

            const forwarded = {
                submissionId: result.item.submissionId,
                courseId: result.item.courseId,
                clientIp,
                clientId,
                fileName: result.item.fileName,
                mergeFile: result.item.mergeFile,
                content: result.item.content,
                sizeBytes: result.item.sizeBytes,
                receivedAt: result.item.receivedAt,
                queueSize: submissions.stats().pendingCount
            };
            io.to(HOSTS_ROOM).emit('submission:forwarded', forwarded);
            if (config.mode === 'direct') {
                // 兼容仍在使用旧事件名的教师页面；教师侧以 submissionId 去重。
                io.to(HOSTS_ROOM).emit('student:submit', forwarded);
            }
            const accepted = {
                submissionId: result.item.submissionId,
                ok: true,
                status: 'queued',
                duplicate: !!result.duplicate,
                queueSize: forwarded.queueSize
            };
            callAck(ack, accepted);
            logger.info(`[submission] queued id=${result.item.submissionId} queue=${forwarded.queueSize}`);
        });

        // 教师电脑确认落盘：只有这一步之后才给学生最终成功。
        const handleDelivered = (payload = {}, ack) => {
            const submissionId = getString(payload.submissionId);
            const result = submissions.markDelivered(submissionId, { deliveredAt: payload.deliveredAt });
            if (!result.ok) {
                callAck(ack, { submissionId, ok: false, code: result.code, message: result.message });
                return;
            }
            const finalResult = {
                submissionId,
                success: true,
                error: '',
                deliveredAt: result.item.deliveredAt
            };
            if (result.owner && result.owner.clientId) {
                io.to(`viewer:${result.owner.clientId}`).emit('student:submit:result', finalResult);
            } else {
                logger.warn(`[submission] delivered id=${submissionId} 但没有归属连接，未回执学生`);
            }
            io.to(HOSTS_ROOM).emit('submission:delivered:ack', {
                submissionId,
                pendingCount: submissions.stats().pendingCount
            });
            callAck(ack, { submissionId, ok: true, delivered: true, pendingCount: submissions.stats().pendingCount });
            logger.info(`[submission] delivered id=${submissionId}`);
        };

        on(socket, 'submission:delivered', handleDelivered);
        on(socket, 'student:submit:ack', handleDelivered);

        // ---------------------------------------------------------------
        // 通用转发：契约里声明的其余 viewer 课堂事件 -> 教师房间
        // ---------------------------------------------------------------
        for (const event of VIEWER_FORWARD_EVENTS) {
            on(socket, event, (payload, ack) => {
                if (role !== ROLE_VIEWER) {
                    // 契约把 annotation:get / course-runtime-error 标为 any，但 Hub 没有注释存储，
                    // 教师端自己发这类事件时明确回绝，而不是让它悬着等一个永远不来的回执。
                    callAck(ack, {
                        ok: false,
                        code: ERROR_CODES.EVENT_FORBIDDEN,
                        message: '该事件由学生端发起，Hub 只做定向转发'
                    });
                    return;
                }
                const forwarded = {
                    ...(payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : { value: payload }),
                    ip: clientIp,
                    clientId,
                    receivedAt: Date.now()
                };
                io.to(HOSTS_ROOM).emit(event, forwarded);
                callAck(ack, { ok: true, forwarded: true, event });
            });
        }

        on(socket, 'disconnect', () => {
            if (role !== ROLE_VIEWER) return;
            const count = studentIps.get(clientIp) || 0;
            if (count <= 1) {
                studentIps.delete(clientIp);
                io.to(HOSTS_ROOM).emit('student-status', { count: studentIps.size, action: 'leave', ip: clientIp });
            } else {
                studentIps.set(clientIp, count - 1);
            }
        });
    });

    return { getStudentCount: () => studentIps.size, viewerForwardEvents: VIEWER_FORWARD_EVENTS };
}

module.exports = {
    setupSocketHandlers,
    VIEWER_FORWARD_EVENTS,
    HANDLED_VIEWER_EVENTS,
    DIRECT_COMMAND_EVENTS,
    resolveConnectionIdentity
};
