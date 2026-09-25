// 教师端会话代理测试的公共夹具。
//
// 集成测试驱动**真实**的教室 Hub（真实 Express + 真实 Socket.IO + 真实 course-format），
// 只有发现传输与时钟是注入的；学生端用真实 socket.io-client 与真实 HTTP 引导凭证。
// 单元测试用假 socket / 假 HTTP / 假时钟，绝不碰网络。
//
// 与 apps/classroom-hub/test/helpers.js 同一套模式（端口 0、固定凭证、假发现传输），
// 但这里通过 Hub 的公开入口 `@lumesync/classroom-hub` 启动，不 import Hub 的测试文件。

const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { io: createClient } = require('socket.io-client');
const { startHub } = require('@lumesync/classroom-hub');
const { PROTOCOL_VERSION } = require('@lumesync/classroom-protocol');
const { SCHEMA_VERSION } = require('@lumesync/course-format');
const { writeLumeFile } = require('@lumesync/course-format/node');

const TEST_HOST_TOKEN = 'session-agent-host-token-0123456789';
const TEST_TOKEN_SECRET = 'session-agent-token-secret-0123456789';
const ADMIN_HEADERS = { 'X-LumeSync-Host-Token': TEST_HOST_TOKEN };
const FIXED_DATE = new Date('2026-09-25T00:00:00.000Z');

/** 丢弃日志，但保留记录，便于断言"验证码/凭证不进入日志"。 */
function createRecordingLogger() {
    const lines = [];
    const push = (level) => (...args) => {
        lines.push(`[${level}] ${args.map((value) => (typeof value === 'string' ? value : JSON.stringify(value))).join(' ')}`);
    };
    return {
        lines,
        text: () => lines.join('\n'),
        error: push('error'),
        warn: push('warn'),
        info: push('info'),
        debug: push('debug')
    };
}

/** 假发现传输：只记录调用，绝不起组播。 */
function createFakeDiscoveryTransport({ browseResults = [], failBrowse = false } = {}) {
    const calls = [];
    return {
        calls,
        // Hub 侧发布 mDNS 时要求传输实现 publish/unpublish；缺了会让 relay 进入 error。
        async publish(record) {
            calls.push({ type: 'publish', record: JSON.parse(JSON.stringify(record)) });
        },
        async unpublish() {
            calls.push({ type: 'unpublish' });
        },
        async browse(options) {
            calls.push({ type: 'browse', options });
            if (failBrowse) throw new Error('multicast unavailable');
            return browseResults;
        },
        async destroy() {
            calls.push({ type: 'destroy' });
        },
        lastRecord: () => {
            const publishes = calls.filter((call) => call.type === 'publish');
            return publishes.length > 0 ? publishes[publishes.length - 1].record : null;
        }
    };
}

/** 构造一条发现记录（TXT 只含契约允许的字段）。 */
function relayRecord({
    id = 'classroom-101',
    name = '101 教室',
    label = '空闲',
    state = 'free',
    proto = String(PROTOCOL_VERSION),
    port = 3000,
    addresses = ['192.168.1.10'],
    host = null,
    txtOverrides = {}
} = {}) {
    const txt = { name, id, proto, port: String(port), state, label, ...txtOverrides };
    return { name, host, port, addresses, txt };
}

/** 启动测试 Hub（端口 0、固定凭证、默认注入假发现传输）。 */
async function startTestHub(options = {}) {
    const hasTransport = Object.prototype.hasOwnProperty.call(options, 'discoveryTransport');
    const transport = hasTransport ? options.discoveryTransport : createFakeDiscoveryTransport();
    const hub = await startHub({
        env: {},
        host: '127.0.0.1',
        port: 0,
        hostToken: TEST_HOST_TOKEN,
        tokenSecret: TEST_TOKEN_SECRET,
        logLevel: 'silent',
        leaseSweepIntervalMs: 0,
        ...options,
        ...(hasTransport ? {} : { discoveryTransport: transport })
    });
    hub.testTransport = transport;
    return hub;
}

async function fetchJson(hub, requestPath, options = {}) {
    const response = await fetch(`${hub.url()}${requestPath}`, options);
    let body = null;
    try {
        body = await response.json();
    } catch (_) {
        body = null;
    }
    return { status: response.status, body, response };
}

/** 固定机屏幕（含本次请求的验证码）：只有本机 + 管理凭证能读；测试也走这条路径。 */
async function readScreen(hub) {
    return fetchJson(hub, '/api/hub/screen', { headers: ADMIN_HEADERS });
}

/** 读取当前屏幕上显示的验证码（没有则返回 null）。 */
async function readScreenCode(hub) {
    const screen = await readScreen(hub);
    return screen.body && screen.body.pairing ? String(screen.body.pairing.code || '') : '';
}

/** 学生（viewer）凭证：走真实的 /api/session/bootstrap。 */
async function bootstrapViewer(hub, clientId) {
    const result = await fetchJson(hub, '/api/session/bootstrap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: 'viewer', clientId })
    });
    if (result.status !== 200 || !result.body || !result.body.token) {
        throw new Error(`viewer bootstrap 失败：${result.status} ${JSON.stringify(result.body)}`);
    }
    return { token: result.body.token, clientId, expiresAt: result.body.expiresAt };
}

/** 真实 Socket.IO 客户端：从连接那一刻记录事件，支持 waitFor / emitWithAck。 */
function connect(port, auth) {
    const socket = createClient(`http://127.0.0.1:${port}`, {
        auth,
        transports: ['websocket'],
        reconnection: false,
        forceNew: true
    });
    const received = [];
    const waiters = [];
    let disconnectReason = null;

    socket.onAny((event, payload) => {
        for (const waiter of waiters.slice()) {
            if (waiter.event !== event) continue;
            waiters.splice(waiters.indexOf(waiter), 1);
            clearTimeout(waiter.timer);
            waiter.resolve(payload);
            return;
        }
        received.push({ event, payload });
    });
    socket.on('disconnect', (reason) => { disconnectReason = reason; });

    return {
        socket,
        received,
        waitFor(event, timeoutMs = 4000) {
            const index = received.findIndex((entry) => entry.event === event);
            if (index >= 0) return Promise.resolve(received.splice(index, 1)[0].payload);
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error(`等待 ${event} 超时`)), timeoutMs);
                waiters.push({ event, resolve, reject, timer });
            });
        },
        async waitForAccepted(timeoutMs = 4000) {
            return this.waitFor('session:accepted', timeoutMs);
        },
        waitForDisconnect(timeoutMs = 4000) {
            if (disconnectReason) return Promise.resolve(disconnectReason);
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('等待 disconnect 超时')), timeoutMs);
                socket.once('disconnect', (reason) => { clearTimeout(timer); resolve(reason); });
            });
        },
        emitWithAck(event, payload, timeoutMs = 4000) {
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error(`等待 ${event} 回执超时`)), timeoutMs);
                socket.emit(event, payload, (ack) => { clearTimeout(timer); resolve(ack); });
            });
        },
        seen(event) {
            return received.some((entry) => entry.event === event);
        },
        close() { socket.close(); }
    };
}

/** 连接一个学生（viewer）：真实引导 + 真实 socket。 */
async function connectViewer(hub, clientId = `student-${Math.random().toString(36).slice(2, 8)}`) {
    const session = await bootstrapViewer(hub, clientId);
    const client = connect(hub.port, {
        role: 'viewer',
        clientId: session.clientId,
        token: session.token,
        protocolVersion: PROTOCOL_VERSION
    });
    await client.waitForAccepted();
    await client.waitFor('classroom:snapshot');
    return { ...client, session };
}

/** 用 course-format 写一个真实的 .lume 文件（不是手写 ZIP）。 */
async function writeCourseFile({ dir, id = 'demo-course', title = '演示课件', slideSource } = {}) {
    const target = path.join(dir, `${id}.lume`);
    const manifest = {
        schemaVersion: SCHEMA_VERSION,
        id,
        title,
        runtime: { format: 'lumesync-zip', entryMode: 'pages', slideModule: 'tsx', react: '18' },
        pages: [{ id: 'p1', file: 'slides/P1.tsx', title: '第一页' }],
        assets: {}
    };
    const written = await writeLumeFile(target, {
        manifest,
        files: new Map([['slides/P1.tsx', slideSource || `export default function ${id}() { return null; }`]])
    }, { date: FIXED_DATE });
    return { filePath: written.filePath, bytes: written.bytes, manifest, title };
}

async function makeTempDir(prefix = 'session-agent-') {
    return fsp.mkdtemp(path.join(os.tmpdir(), prefix));
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
    TEST_HOST_TOKEN,
    TEST_TOKEN_SECRET,
    ADMIN_HEADERS,
    PROTOCOL_VERSION,
    createRecordingLogger,
    createFakeDiscoveryTransport,
    relayRecord,
    startTestHub,
    fetchJson,
    readScreen,
    readScreenCode,
    bootstrapViewer,
    connect,
    connectViewer,
    writeCourseFile,
    makeTempDir,
    sleep
};
