// Hub 测试的公共夹具。
//
// 所有测试都驱动真实的 Hub（真实 Express + 真实 Socket.IO + 真实契约），
// 只有两处是注入的：发现传输（假传输，绝不起组播）与时钟（租约过期用例）。
// 测试的判定标准来自契约与设计文档，不从实现里回读结论。

const { io: createClient } = require('socket.io-client');
const {
    PROTOCOL_VERSION,
    createPairingProof,
    RELAY_STATES,
    ERROR_CODES
} = require('@lumesync/classroom-protocol');
const { writeLumePackage, computeCourseHash, SCHEMA_VERSION } = require('@lumesync/course-format');

const { startHub, createSilentLogger } = require('..');

const TEST_HOST_TOKEN = 'test-host-token-0123456789';
const TEST_TOKEN_SECRET = 'test-token-secret-0123456789';
const ADMIN_HEADERS = { 'X-LumeSync-Host-Token': TEST_HOST_TOKEN };
const FIXED_DATE = new Date('2026-09-25T00:00:00.000Z');

/** 假发现传输：只记录调用，不碰网络。 */
function createFakeDiscoveryTransport({ browseResults = [], failPublish = false, failBrowse = false } = {}) {
    const calls = [];
    return {
        calls,
        async publish(record) {
            calls.push({ type: 'publish', record: JSON.parse(JSON.stringify(record)) });
            if (failPublish) throw new Error('multicast unavailable');
        },
        async unpublish() {
            calls.push({ type: 'unpublish' });
        },
        async browse() {
            calls.push({ type: 'browse' });
            if (failBrowse) throw new Error('browse failed');
            return browseResults;
        },
        async destroy() {
            calls.push({ type: 'destroy' });
        },
        publishedRecords: () => calls.filter((call) => call.type === 'publish').map((call) => call.record),
        lastRecord: () => {
            const publishes = calls.filter((call) => call.type === 'publish');
            return publishes.length > 0 ? publishes[publishes.length - 1].record : null;
        },
        unpublishCount: () => calls.filter((call) => call.type === 'unpublish').length
    };
}

/**
 * 启动一个测试 Hub：固定端口 0（系统分配）、固定凭证、默认注入假发现传输。
 * @param {object} [options] 覆盖 createHub 选项
 */
async function startTestHub(options = {}) {
    const hasTransport = Object.prototype.hasOwnProperty.call(options, 'discoveryTransport');
    const transport = hasTransport ? options.discoveryTransport : createFakeDiscoveryTransport();
    const merged = {
        env: {},
        host: '127.0.0.1',
        port: 0,
        hostToken: TEST_HOST_TOKEN,
        tokenSecret: TEST_TOKEN_SECRET,
        logLevel: 'silent',
        leaseSweepIntervalMs: 0,
        logger: createSilentLogger(),
        ...options
    };
    if (!hasTransport) merged.discoveryTransport = transport;
    const hub = await startHub(merged);
    hub.testTransport = transport;
    return hub;
}

/** Socket.IO 客户端夹具：从连接那一刻就记录事件，支持按事件等待与 ack。 */
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
    const errors = [];

    socket.onAny((event, payload) => {
        // 已经被 waitFor 消费的事件不再回到队列，避免后续 waitFor 读到同一个旧事件。
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
    socket.on('error', (error) => { errors.push(error && error.message ? error.message : String(error)); });

    const client = {
        socket,
        received,
        errors,
        connectError: new Promise((resolve) => socket.on('connect_error', resolve)),
        waitFor(event, timeoutMs = 4000) {
            const index = received.findIndex((entry) => entry.event === event);
            if (index >= 0) return Promise.resolve(received.splice(index, 1)[0].payload);
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
                waiters.push({ event, resolve, reject, timer });
            });
        },
        async waitForAccepted(timeoutMs = 4000) {
            const accepted = await this.waitFor('session:accepted', timeoutMs);
            return accepted;
        },
        waitForDisconnect(timeoutMs = 4000) {
            if (disconnectReason) return Promise.resolve(disconnectReason);
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('timeout waiting for disconnect')), timeoutMs);
                socket.once('disconnect', (reason) => { clearTimeout(timer); resolve(reason); });
            });
        },
        emitWithAck(event, payload, timeoutMs = 4000) {
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error(`timeout waiting for ack of ${event}`)), timeoutMs);
                socket.emit(event, payload, (ack) => { clearTimeout(timer); resolve(ack); });
            });
        },
        seen(event) {
            return received.some((entry) => entry.event === event);
        },
        close() { socket.close(); }
    };
    return client;
}

async function fetchJson(hub, path, options = {}) {
    const response = await fetch(`${hub.url()}${path}`, options);
    let body = null;
    try {
        body = await response.json();
    } catch (_) {
        body = null;
    }
    return { status: response.status, body, response };
}

async function postJson(hub, path, payload, headers = {}) {
    return fetchJson(hub, path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(payload || {})
    });
}

/** 学生（viewer）凭证：走真实的 /api/session/bootstrap。 */
async function bootstrapViewer(hub, clientId, extraHeaders = {}) {
    const result = await postJson(hub, '/api/session/bootstrap', { role: 'viewer', clientId }, extraHeaders);
    if (result.status !== 200 || !result.body || !result.body.token) {
        throw new Error(`viewer bootstrap 失败：${result.status} ${JSON.stringify(result.body)}`);
    }
    return { token: result.body.token, clientId, expiresAt: result.body.expiresAt };
}

function viewerAuth(session, protocolVersion = PROTOCOL_VERSION) {
    return { role: 'viewer', clientId: session.clientId, token: session.token, protocolVersion };
}

function hostAuth(hub, { clientId = 'teacher-1', protocolVersion = PROTOCOL_VERSION } = {}) {
    return { role: 'host', clientId, token: hub.config.hostToken, protocolVersion };
}

/** 固定机屏幕（含验证码）：只有本机 + 管理凭证能读，测试同样走这条路径。 */
async function readScreen(hub) {
    return fetchJson(hub, '/api/hub/screen', { headers: ADMIN_HEADERS });
}

/** 走完「请求配对 → 读屏幕验证码 → 提交证明」，返回设备凭证。 */
async function pairTeacher(hub, {
    deviceKey,
    requestId = `req-${Math.random().toString(36).slice(2, 8)}`,
    deviceName = '教师笔记本',
    code: explicitCode
} = {}) {
    const pairingClient = connect(hub.port, { role: 'host', clientId: `pair-${deviceKey}`, protocolVersion: PROTOCOL_VERSION });
    const accepted = await pairingClient.waitForAccepted();
    if (accepted.payload.pairingOnly !== true) {
        throw new Error('未带设备凭证的 host 连接应为 pairing-only');
    }
    const challenge = await pairingClient.emitWithAck('teacher:pair.request', { requestId, deviceKey, deviceName });
    if (!challenge || !challenge.ok) {
        pairingClient.close();
        throw new Error(`pair.request 失败：${JSON.stringify(challenge)}`);
    }
    const screen = await readScreen(hub);
    const code = explicitCode || (screen.body.pairing && screen.body.pairing.code);
    if (!code) {
        pairingClient.close();
        throw new Error('固定机屏幕上没有验证码');
    }
    const proof = await createPairingProof({
        code,
        classroomId: hub.config.classroomId,
        requestId,
        deviceKey,
        nonce: challenge.nonce
    });
    const verified = await pairingClient.emitWithAck('teacher:pair.verify', { requestId, nonce: challenge.nonce, proof });
    pairingClient.close();
    return { challenge, verified, code, requestId, deviceKey, screen: screen.body, client: pairingClient };
}

/** 用设备凭证连接为教师（host），并等到握手与快照。 */
async function connectHost(hub, deviceToken, deviceKey, options = {}) {
    const client = connect(hub.port, {
        role: 'host',
        clientId: deviceKey,
        token: deviceToken,
        protocolVersion: options.protocolVersion === undefined ? PROTOCOL_VERSION : options.protocolVersion
    });
    const accepted = await client.waitForAccepted();
    await client.waitFor('classroom:snapshot');
    return { client, accepted };
}

/** 配对 + 连接 + 取得租约，返回后续用例需要的全部句柄。 */
async function startTeachingSession(hub, { deviceKey = 'device-key-teacher-1', requestId, deviceName } = {}) {
    const paired = await pairTeacher(hub, { deviceKey, requestId, deviceName });
    if (!paired.verified || !paired.verified.ok) {
        throw new Error(`配对未通过：${JSON.stringify(paired.verified)}`);
    }
    const { client, accepted } = await connectHost(hub, paired.verified.deviceToken, deviceKey);
    const lease = await client.emitWithAck('teacher:lease.acquire', {});
    if (!lease || !lease.ok) {
        throw new Error(`获取租约失败：${JSON.stringify(lease)}`);
    }
    return { ...paired, client, accepted, lease, deviceToken: paired.verified.deviceToken };
}

/** 用 course-format 生成一个真实的 .lume 包（不是手写 ZIP）。 */
async function buildCoursePackage({ id = 'demo-course', title = '演示课件', slideSource = 'export default function P1() { return null; }' } = {}) {
    const manifest = {
        schemaVersion: SCHEMA_VERSION,
        id,
        title,
        runtime: { format: 'lumesync-zip', entryMode: 'pages', slideModule: 'tsx', react: '18' },
        pages: [{ id: 'p1', file: 'slides/P1.tsx', title: '第一页' }],
        assets: {}
    };
    const bytes = await writeLumePackage({
        manifest,
        files: new Map([['slides/P1.tsx', slideSource]])
    }, { date: FIXED_DATE });
    const buffer = Buffer.from(bytes);
    const { hash } = await computeCourseHash(buffer);
    return { buffer, hash, manifest };
}

/** 通过 HTTPS 上传并暂存课件。 */
async function stageCourse(hub, { courseId, buffer, hash, token, headers = {} }) {
    const authHeaders = token ? { Authorization: `Bearer ${token}` } : ADMIN_HEADERS;
    return fetchJson(hub, `/api/courses/stage/${encodeURIComponent(courseId)}?courseHash=${encodeURIComponent(hash)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/zip', ...authHeaders, ...headers },
        body: buffer
    });
}

module.exports = {
    TEST_HOST_TOKEN,
    TEST_TOKEN_SECRET,
    ADMIN_HEADERS,
    ERROR_CODES,
    RELAY_STATES,
    PROTOCOL_VERSION,
    createFakeDiscoveryTransport,
    startTestHub,
    connect,
    fetchJson,
    postJson,
    bootstrapViewer,
    viewerAuth,
    hostAuth,
    readScreen,
    pairTeacher,
    connectHost,
    startTeachingSession,
    buildCoursePackage,
    stageCourse
};
