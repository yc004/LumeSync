// Hub 组装：配置文件、课堂状态、中继域、发现、HTTP 与 Socket.IO 接到一起。
//
// 两种部署模式共用一个实现：
//   direct —— 教师电脑本机课堂服务（host token 直连，不发布发现、不接受远程配对）
//   relay  —— 教室固定机（发布 mDNS、验证码配对、唯一授课租约、课件暂存、提交转发）
//
// 生命周期：createHub() 只组装不监听；start(port) 监听后再把真实端口交给发现层
// （测试用 0 让系统分配端口，因此端口只有 listen 之后才知道）。

const http = require('http');
const { Server } = require('socket.io');

const { createLogger } = require('./logger');
const { loadConfig, HUB_MODES } = require('./config');
const { createClassroom } = require('./classroom');
const { createRelayRuntime } = require('./relay');
const { createSubmissionForwarder } = require('./submissions');
const { createApp } = require('./routes');
const { setupSocketHandlers } = require('./socket');
const { createDiscoveryPublisher } = require('./discovery');
const { createBonjourTransport } = require('./discovery-bonjour');
const { isLoopbackAddress } = require('./utils');

function createHub(options = {}) {
    const config = loadConfig(options);
    const logger = options.logger || createLogger({ level: config.logLevel });
    const now = typeof options.now === 'function' ? options.now : () => Date.now();
    const startedAt = now();

    const classroom = createClassroom({ sessionId: options.sessionId });

    let discovery = null;
    let io = null;

    const relay = createRelayRuntime({
        config,
        classroomId: config.classroomId,
        classroomName: config.classroomName,
        port: config.port,
        canDisplayCode: config.canDisplayCode,
        now,
        logger,
        onChange: async () => {
            // 固定机状态每次变化都要：重算发现报文 + 广播 relay:status。
            if (discovery) await discovery.refresh();
            if (io) io.emit('relay:status', relay.status());
        }
    });

    const submissions = createSubmissionForwarder({ queue: relay.getQueue(), now, logger });

    const discoveryTransport = Object.prototype.hasOwnProperty.call(options, 'discoveryTransport')
        ? options.discoveryTransport
        : (config.discovery && config.mode === HUB_MODES.RELAY ? createBonjourTransport({ logger }) : null);

    discovery = createDiscoveryPublisher({
        mode: config.mode,
        transport: discoveryTransport,
        serviceType: config.discoveryServiceType,
        logger,
        txtProvider: () => relay.discoveryTxt()
    });

    const ctx = {
        config,
        logger,
        now,
        classroom,
        relay,
        submissions,
        discovery,
        startedAt,
        isLoopback: typeof options.isLoopback === 'function'
            ? options.isLoopback
            : (req) => isLoopbackAddress(req.socket && req.socket.remoteAddress)
    };

    const app = createApp(ctx);
    const server = http.createServer(app);
    // Socket.IO 默认 maxHttpBufferSize=1MB，而契约允许截图 dataUrl 到 1.4MB：
    // 保持默认会让"截图超限"在传输层直接断连，而不是由契约守卫给出明确错误。
    io = new Server(server, {
        pingInterval: 5000,
        pingTimeout: 8000,
        maxHttpBufferSize: config.maxSocketPayloadBytes
    });
    const socketRuntime = setupSocketHandlers(io, ctx);

    let sweeper = null;
    let listening = false;

    function sweep() {
        return relay.sweep();
    }

    function start(port) {
        return new Promise((resolve, reject) => {
            const target = port === undefined || port === null ? config.port : port;
            const onError = (error) => reject(error);
            server.once('error', onError);
            server.listen(target, config.host, async () => {
                server.removeListener('error', onError);
                listening = true;
                const address = server.address();
                const actualPort = address && typeof address === 'object' ? address.port : target;
                relay.setPort(actualPort);
                if (config.mode === HUB_MODES.RELAY) {
                    const activated = relay.activate();
                    if (!activated.ok) {
                        logger.error(`[hub] 中继未能开启：${activated.code}（${activated.message}）`);
                    }
                } else {
                    relay.disable();
                }
                await discovery.refresh();
                if (config.leaseSweepIntervalMs > 0) {
                    sweeper = setInterval(() => {
                        try {
                            sweep();
                        } catch (error) {
                            logger.error(`[hub] 租约清理失败：${error.message}`);
                        }
                    }, config.leaseSweepIntervalMs);
                    if (typeof sweeper.unref === 'function') sweeper.unref();
                }
                logger.info(`[hub] LumeSync Hub 已启动 mode=${config.mode} 端口=${actualPort} 教室=${config.classroomId}`);
                if (config.mode === HUB_MODES.RELAY) {
                    // 投影界面需要固定机管理凭证，而凭证在未显式配置时是进程随机的：
                    // 这台机器的控制台就是它在运维上的唯一出口（页面把片段读进 sessionStorage 后
                    // 立刻从地址栏抹掉）。页面本身只在本机可加载，凭证不会过网。
                    logger.info(`[hub] 固定机投影界面（只在本机可打开）：${hub.projectorUrl()}`);
                }
                resolve(hub);
            });
        });
    }

    function stop() {
        return new Promise((resolve) => {
            if (sweeper) {
                clearInterval(sweeper);
                sweeper = null;
            }
            const finish = async () => {
                try {
                    await discovery.destroy();
                } catch (error) {
                    logger.warn(`[hub] 关闭发现失败：${error.message}`);
                }
                listening = false;
                resolve();
            };
            try {
                io.close(() => {
                    if (server.listening) {
                        server.close(() => finish());
                    } else {
                        finish();
                    }
                });
            } catch (_) {
                finish();
            }
        });
    }

    const hub = {
        config,
        logger,
        now,
        classroom,
        relay,
        submissions,
        discovery,
        app,
        server,
        io,
        start,
        stop,
        sweep,
        get port() {
            const address = server.address();
            return address && typeof address === 'object' ? address.port : null;
        },
        get listening() {
            return listening;
        },
        url() {
            const address = server.address();
            const actualPort = address && typeof address === 'object' ? address.port : config.port;
            return `http://127.0.0.1:${actualPort}`;
        },
        /**
         * 固定机只读投影界面的本机地址，带管理凭证片段。
         *
         * 用 URL 片段（`#token=…`）而不是查询串：片段不会进服务端日志、Referer 与局域网抓包，
         * 页面读到后立刻存进 sessionStorage 并把地址栏还原。不要把这个地址写进文档或日志以外的位置。
         */
        projectorUrl({ withToken = true } = {}) {
            const address = server.address();
            const actualPort = address && typeof address === 'object' ? address.port : config.port;
            const base = `http://127.0.0.1:${actualPort}/projector`;
            return withToken ? `${base}#token=${config.hostToken}` : base;
        },
        getStudentCount: socketRuntime.getStudentCount,
        viewerForwardEvents: socketRuntime.viewerForwardEvents
    };

    return hub;
}

/** createHub + start 的便捷入口（CLI 与测试都用它）。 */
async function startHub(options = {}) {
    const hub = createHub(options);
    await hub.start(options.port);
    return hub;
}

module.exports = { createHub, startHub, HUB_MODES };
