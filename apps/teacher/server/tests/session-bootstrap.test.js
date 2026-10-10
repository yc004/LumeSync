// 会话引导与路由授权的端到端回归测试。
//
// 背景：apiRouter 挂在 /api 下并带 authorizeApi 中间件，而 /api/session/bootstrap
// 由 server/index.js 处理。如果契约路由表把引导路径按"写请求一律 host"处理，
// 中间件会先返回 403，viewer 与 host 都拿不到凭证——整个课堂无法建立会话。
// 这里直接启动真实 app 验证修复。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'lume-bootstrap-'));
process.env.LUMESYNC_PUBLIC_DIR = sandbox;
process.env.STATIC_DIR = sandbox;
process.env.LUMESYNC_CACHE_DIR = sandbox;
process.env.LUMESYNC_COURSES_DIR = path.join(sandbox, 'courses');
process.env.LUMESYNC_SUBMISSIONS_DIR = path.join(sandbox, 'submissions');
process.env.LUMESYNC_SUBMISSIONS_CONFIG = path.join(sandbox, 'submissions-config.json');
process.env.LUMESYNC_HOST_TOKEN = `test-host-${'a'.repeat(16)}`;
process.env.LUMESYNC_VIEWER_TOKEN_SECRET = `test-viewer-${'b'.repeat(16)}`;

const { app, server } = require('../index.js');

let baseUrl = '';

test.before(async () => {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(sandbox, { recursive: true, force: true });
});

function post(pathname, body, headers = {}) {
    return fetch(`${baseUrl}${pathname}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body)
    });
}

test('viewer 可以在局域网无凭证领取短期会话', async () => {
    const response = await post('/api/session/bootstrap', { role: 'viewer', clientId: 'student-1' });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.role, 'viewer');
    assert.equal(body.clientId, 'student-1');
    assert.ok(body.token);
    assert.ok(body.expiresAt);
});

test('host 引导仅限本机且必须带本机凭证', async () => {
    const authorized = await post('/api/session/bootstrap', { role: 'host' }, {
        'X-LumeSync-Host-Token': process.env.LUMESYNC_HOST_TOKEN
    });
    assert.equal(authorized.status, 200);
    const body = await authorized.json();
    assert.equal(body.role, 'host');
    assert.equal(body.token, process.env.LUMESYNC_HOST_TOKEN);

    const unauthorized = await post('/api/session/bootstrap', { role: 'host' });
    assert.equal(unauthorized.status, 403);
});

test('不支持的角色与别名仍被拒绝', async () => {
    const response = await post('/api/session/bootstrap', { role: 'admin' });
    assert.equal(response.status, 400);
});

test('引导路径之外的写接口仍然要求 host bearer', async () => {
    const response = await post('/api/refresh-courses', {});
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error, 'host_authorization_required');

    const authorized = await post('/api/refresh-courses', {}, {
        Authorization: `Bearer ${process.env.LUMESYNC_HOST_TOKEN}`
    });
    assert.equal(authorized.status, 200);
});

test('健康检查与协议描述公开可读并包含协议版本', async () => {
    const health = await fetch(`${baseUrl}/api/health`);
    assert.equal(health.status, 200);
    const healthBody = await health.json();
    assert.equal(healthBody.ok, true);
    assert.equal(typeof healthBody.protocolVersion, 'number');

    const protocolResponse = await fetch(`${baseUrl}/api/protocol`);
    assert.equal(protocolResponse.status, 200);
    const protocolBody = await protocolResponse.json();
    assert.equal(protocolBody.protocolVersion, healthBody.protocolVersion);
    assert.ok(Array.isArray(protocolBody.inboundEvents));
});

test('课程目录公开可读且带 invalid 列表', async () => {
    const response = await fetch(`${baseUrl}/api/courses`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.ok(Array.isArray(body.courses));
    assert.ok(Array.isArray(body.invalid));
});
