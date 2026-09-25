// HTTP 面：健康检查、协议描述、会话引导、Hub 状态、屏幕（含验证码）、课件暂存、缓存清理、
// 固定机只读投影界面。
//
// 约定：
//   - 任何响应体都是 `{ok:true|false, ...}`，错误带契约错误码；
//   - 404/500 不回显路由、路径或堆栈等内部信息；
//   - 验证码只在 GET /api/hub/screen（本机 + 管理凭证）出现，其他任何接口都不含；
//   - GET /projector 只服务固定机本机：页面自己不含验证码与凭证，凭证由操作者用带 #token= 的
//     地址带入（见 hub.projectorUrl()），因此把它暴露到局域网没有意义，直接拒绝。

const path = require('node:path');
const express = require('express');
const {
    ERROR_CODES,
    httpStatusForError,
    PROTOCOL_VERSION,
    RELAY_STATES,
    ROLE_HOST,
    ROLE_VIEWER,
    normalizeRole,
    createSessionToken
} = require('@lumesync/classroom-protocol');
const { readLumePackage, computeCourseHash } = require('@lumesync/course-format');

const { HUB_MODES } = require('./config');
const { createHostAuthority } = require('./http-auth');
const protocol = require('./protocol');
const { getString, normalizeIp } = require('./utils');

const COURSE_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;

function ensureClientId(value) {
    const text = getString(value);
    return text || `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 注册全部路由。ctx 由 createHub 提供：
 * {config, logger, classroom, relay, submissions, discovery, isLoopback, startedAt}
 */
function createApp(ctx) {
    const { config, logger, classroom, relay, submissions, discovery } = ctx;
    const authority = createHostAuthority({ config, relay, isLoopback: ctx.isLoopback });
    const app = express();
    app.disable('x-powered-by');

    // --- 课件上传：原始字节流。必须在 express.json 之前挂载，否则 JSON 解析器会先吃掉流。 ---
    app.put(
        '/api/courses/stage/:courseId',
        express.raw({ type: () => true, limit: config.stageMaxBytes }),
        authority.requireHost,
        async (req, res, next) => {
            try {
                const courseId = getString(req.params.courseId);
                const expectedHash = getString(req.query.courseHash);
                if (!courseId) {
                    res.status(400).json({ ok: false, code: ERROR_CODES.REQUEST_INVALID, message: '缺少 courseId' });
                    return;
                }
                if (!COURSE_HASH_PATTERN.test(expectedHash)) {
                    res.status(400).json({
                        ok: false,
                        code: ERROR_CODES.REQUEST_INVALID,
                        message: 'courseHash 必须是 sha256:<64 位十六进制>'
                    });
                    return;
                }

                const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
                if (body.length === 0) {
                    res.status(400).json({ ok: false, code: ERROR_CODES.REQUEST_INVALID, message: '课件内容为空' });
                    return;
                }

                // 校验交给 course-format：ZIP 路径/大小/压缩比与 manifest schema 都在那里。
                const coursePackage = await readLumePackage(body);
                if (!coursePackage.ok) {
                    res.status(400).json({
                        ok: false,
                        code: ERROR_CODES.REQUEST_INVALID,
                        reason: coursePackage.code,
                        message: `课件校验失败：${coursePackage.code}`,
                        errors: (coursePackage.errors || []).slice(0, 10)
                    });
                    return;
                }

                const { hash } = await computeCourseHash(body, { package: coursePackage });
                if (hash !== expectedHash) {
                    res.status(httpStatusForError(ERROR_CODES.COURSE_HASH_MISMATCH, 400)).json({
                        ok: false,
                        code: ERROR_CODES.COURSE_HASH_MISMATCH,
                        message: '上传内容与声明的 courseHash 不一致',
                        expected: expectedHash,
                        actual: hash
                    });
                    return;
                }

                const staged = relay.stageCourse({
                    courseId,
                    courseHash: hash,
                    sizeBytes: body.length,
                    manifest: coursePackage.manifest,
                    bytes: body
                });
                if (!staged.ok) {
                    res.status(httpStatusForError(staged.code, 400)).json({
                        ok: false,
                        code: staged.code,
                        message: staged.message
                    });
                    return;
                }
                logger.info(`[http] staged course=${courseId} hash=${hash.slice(0, 19)}… bytes=${body.length}`);
                res.json({ ok: true, courseId, courseHash: hash, sizeBytes: body.length });
            } catch (error) {
                next(error);
            }
        }
    );

    app.use(express.json({ limit: config.jsonBodyLimit }));
    app.use(express.urlencoded({ extended: false }));

    app.get('/api/health', (_req, res) => {
        res.json({
            ok: true,
            app: 'LumeSync Hub',
            mode: config.mode,
            protocolVersion: PROTOCOL_VERSION,
            classroomId: config.classroomId,
            pid: process.pid
        });
    });

    app.get('/api/protocol', (_req, res) => {
        res.json({ ok: true, app: 'LumeSync Hub', ...protocol.describeProtocol() });
    });

    // 会话引导：viewer 短期凭证；host 分支仅 direct 模式且仅限本机 + 管理凭证。
    app.post('/api/session/bootstrap', async (req, res, next) => {
        try {
            const role = normalizeRole(req.body && req.body.role ? req.body.role : 'viewer');
            const clientId = ensureClientId(req.body && req.body.clientId);
            const clientIp = normalizeIp(req.ip || (req.socket && req.socket.remoteAddress) || '');

            if (role === ROLE_HOST) {
                if (config.mode !== HUB_MODES.DIRECT) {
                    res.status(403).json({
                        ok: false,
                        code: ERROR_CODES.HOST_AUTHORIZATION_REQUIRED,
                        message: '中继模式不通过公开接口发放 host 权限，请在固定机屏幕完成验证码配对'
                    });
                    return;
                }
                if (!authority.isLocalAdmin(req)) {
                    res.status(403).json({
                        ok: false,
                        code: ERROR_CODES.HOST_AUTHORIZATION_REQUIRED,
                        message: 'host 引导只允许本机携带管理凭证的请求'
                    });
                    return;
                }
                res.json({
                    success: true,
                    ok: true,
                    role: ROLE_HOST,
                    clientId,
                    token: config.hostToken,
                    expiresAt: null,
                    clientIp,
                    serverTime: new Date().toISOString()
                });
                return;
            }

            if (role !== ROLE_VIEWER) {
                res.status(400).json({ ok: false, code: ERROR_CODES.ROLE_UNKNOWN, message: 'Unsupported bootstrap role' });
                return;
            }

            const issued = await createSessionToken({
                secret: config.tokenSecret,
                clientId,
                role: ROLE_VIEWER,
                ttlSec: config.viewerTokenTtlSec,
                now: ctx.now(),
                classroomId: config.classroomId
            });
            res.json({
                success: true,
                ok: true,
                role: ROLE_VIEWER,
                clientId,
                token: issued.token,
                expiresAt: issued.expiresAt,
                classroomId: config.classroomId,
                clientIp,
                serverTime: new Date().toISOString()
            });
        } catch (error) {
            next(error);
        }
    });

    // 公开状态：模式、状态机、公开配对信息（无验证码）、租约、队列、暂存与发现。
    app.get('/api/hub/status', (_req, res) => {
        const status = relay.status();
        res.json({
            ok: true,
            app: 'LumeSync Hub',
            mode: config.mode,
            protocolVersion: PROTOCOL_VERSION,
            classroomId: config.classroomId,
            classroomName: config.classroomName,
            pid: process.pid,
            uptimeMs: Date.now() - ctx.startedAt,
            sessionId: classroom.getSessionId(),
            revision: classroom.getRevision(),
            courseId: classroom.getCourseId(),
            slideIndex: classroom.getSlideIndex(),
            relay: status.relay,
            // leaseId / deviceKey / sessionId 属于凭证字段，公开状态里不出现在响应中
            lease: status.lease,
            pairedDevices: status.pairedDevices,
            queue: { ...submissions.stats() },
            stage: status.stage,
            discovery: discovery.status()
        });
    });

    // 固定机屏幕（含验证码）：仅本机 + X-LumeSync-Host-Token。
    app.get('/api/hub/screen', authority.requireScreenCredential, (_req, res) => {
        if (config.mode !== HUB_MODES.RELAY) {
            res.status(httpStatusForError(ERROR_CODES.RELAY_DISABLED, 409)).json({
                ok: false,
                code: ERROR_CODES.RELAY_DISABLED,
                message: '当前 Hub 运行在直接模式（direct），没有中继屏幕'
            });
            return;
        }
        const payload = relay.screenPayload();
        if (payload.state === RELAY_STATES.DISABLED) {
            res.status(httpStatusForError(ERROR_CODES.RELAY_DISABLED, 409)).json({
                ok: false,
                code: ERROR_CODES.RELAY_DISABLED,
                message: '中继桥模式当前已关闭'
            });
            return;
        }
        if (payload.state === RELAY_STATES.ERROR) {
            const code = payload.errorReason || ERROR_CODES.RELAY_NO_SCREEN;
            res.status(httpStatusForError(code, 409)).json({
                ok: false,
                code,
                message: code === ERROR_CODES.RELAY_NO_SCREEN
                    ? '固定机没有可用的交互屏幕，无法显示验证码'
                    : '中继当前不可用'
            });
            return;
        }
        res.json({ ok: true, ...payload });
    });

    // 教师离开前清理：只释放非当前播放的暂存版本。
    app.delete('/api/hub/cache', authority.requireHost, (_req, res) => {
        const cleared = relay.clearStage();
        const queue = submissions.stats();
        logger.info(`[http] cache cleared released=${cleared.released.length}`);
        res.json({
            ok: true,
            released: cleared.released,
            releasedCount: cleared.released.length,
            bytesFreed: cleared.bytesFreed,
            stage: relay.stageStats(),
            pendingSubmissions: queue.pendingCount
        });
    });

    // 固定机只读投影界面：只允许本机加载。页面本身不含验证码、不含管理凭证，
    // 凭证由操作者用带 #token= 的地址带入，再由页面自己去读 /api/hub/screen。
    app.get(['/projector', '/projector/'], (req, res, next) => {
        if (!ctx.isLoopback(req)) {
            res.status(httpStatusForError(ERROR_CODES.HOST_AUTHORIZATION_REQUIRED, 403)).json({
                ok: false,
                code: ERROR_CODES.HOST_AUTHORIZATION_REQUIRED,
                message: '固定机投影界面只允许在固定机本机打开'
            });
            return;
        }
        res.set('Cache-Control', 'no-store');
        res.sendFile(path.join(__dirname, '..', 'projector', 'index.html'), (error) => {
            if (error) next(error);
        });
    });

    // 未匹配的路由：不回显内部信息。
    app.use((_req, res) => {
        res.status(404).json({ ok: false, code: ERROR_CODES.RESOURCE_NOT_FOUND, message: 'Not found' });
    });

    // 统一错误处理：请求体超限/解析失败给出契约错误码，其余一律 internal_error。
    app.use((error, req, res, _next) => {
        if (error && error.type === 'entity.too.large') {
            res.status(413).json({
                ok: false,
                code: ERROR_CODES.STAGE_CAPACITY_EXCEEDED,
                message: '请求体超过上限'
            });
            return;
        }
        if (error && error.type === 'entity.parse.failed') {
            res.status(400).json({ ok: false, code: ERROR_CODES.REQUEST_INVALID, message: '请求体不是合法 JSON' });
            return;
        }
        logger.error(`[http] ${req.method} ${req.path} 处理失败：${error && error.message ? error.message : error}`);
        res.status(httpStatusForError(ERROR_CODES.INTERNAL_ERROR, 500)).json({
            ok: false,
            code: ERROR_CODES.INTERNAL_ERROR,
            message: 'Hub 内部错误'
        });
    });

    return app;
}

module.exports = { createApp, COURSE_HASH_PATTERN };
