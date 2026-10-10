// API 授权回归测试（真实 Express app + 真实 HTTP 请求）。
//
// 背景：apiRouter 的授权中间件按契约路由表判定。Express 路由默认大小写不敏感、
// 非严格尾斜杠、且把 HEAD 交给 GET 处理器；路由表必须同样宽松，否则
// `/api/SUBMISSIONS/x`、`HEAD /api/submissions/x` 会落到"读请求 = public"的兜底，
// 未授权读取学生提交与文件内容。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'lume-api-auth-'));
const submissionsDir = path.join(sandbox, 'submissions');
const courseDir = path.join(submissionsDir, 'course-x');

process.env.LUMESYNC_PUBLIC_DIR = sandbox;
process.env.STATIC_DIR = sandbox;
process.env.LUMESYNC_CACHE_DIR = sandbox;
process.env.LUMESYNC_COURSES_DIR = path.join(sandbox, 'courses');
process.env.LUMESYNC_SUBMISSIONS_DIR = submissionsDir;
process.env.LUMESYNC_SUBMISSIONS_CONFIG = path.join(sandbox, 'submissions-config.json');
process.env.LUMESYNC_HOST_TOKEN = `test-host-${'c'.repeat(16)}`;
process.env.LUMESYNC_VIEWER_TOKEN_SECRET = `test-viewer-${'d'.repeat(16)}`;

fs.mkdirSync(courseDir, { recursive: true });
fs.writeFileSync(path.join(courseDir, 'report.csv'), 'name,score\n', 'utf8');

const { server } = require('../index.js');

let baseUrl = '';

test.before(async () => {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(sandbox, { recursive: true, force: true });
});

const hostHeaders = () => ({ Authorization: `Bearer ${process.env.LUMESYNC_HOST_TOKEN}` });

async function status(method, pathname, headers = {}) {
    if (['OPTIONS', 'PROPFIND', 'MKCOL', 'TRACE'].includes(method)) {
        // fetch/undici 不接受这些方法，改用原始 http 请求。
        return new Promise((resolve, reject) => {
            const request = require('node:http').request(
                { host: '127.0.0.1', port: server.address().port, path: pathname, method, headers },
                (response) => {
                    response.resume();
                    resolve(response.statusCode);
                }
            );
            request.on('error', reject);
            request.end();
        });
    }
    const response = await fetch(`${baseUrl}${pathname}`, { method, headers, redirect: 'manual' });
    return response.status;
}

test('提交读取在任意大小写与尾斜杠下都要求 host', async () => {
    const targets = [
        ['GET', '/api/submissions/course-x'],
        ['GET', '/api/SUBMISSIONS/course-x'],
        ['GET', '/api/Submissions/course-x/'],
        ['GET', '/api/submissions/course-x/file/report.csv'],
        ['GET', '/api/SUBMISSIONS/course-x/FILE/report.csv'],
        ['HEAD', '/api/submissions/course-x'],
        ['HEAD', '/api/submissions/course-x/file/report.csv']
    ];
    for (const [method, pathname] of targets) {
        assert.equal(await status(method, pathname), 403, `${method} ${pathname} 必须 403`);
        assert.equal(await status(method, pathname, hostHeaders()), 200, `${method} ${pathname} 带 host 凭证应放行`);
    }
});

test('其它敏感读取同样不能靠大小写绕过', async () => {
    for (const pathname of ['/api/storage-usage', '/api/STORAGE-USAGE', '/api/Storage-Usage', '/api/submission-config', '/api/SUBMISSION-CONFIG', '/api/classroom-layout', '/api/CLASSROOM-LAYOUT', '/api/students', '/api/STUDENT-LOG']) {
        assert.equal(await status('GET', pathname), 403, `${pathname} 必须 403`);
        assert.equal(await status('GET', pathname, hostHeaders()), 200, `${pathname} 带 host 凭证应放行`);
    }
});

test('未声明的非读方法保守要求 host', async () => {
    for (const method of ['OPTIONS', 'PROPFIND', 'MKCOL', 'TRACE']) {
        assert.equal(await status(method, '/api/save-submission'), 403, `${method} 必须 403`);
    }
});

test('公开读取不受影响（大小写均放行）', async () => {
    for (const pathname of ['/api/health', '/api/HEALTH', '/api/courses', '/api/protocol', '/api/PROTOCOL']) {
        assert.equal(await status('GET', pathname), 200, `${pathname} 应公开可读`);
    }
});

test('会话引导仍按自身规则处理', async () => {
    const viewer = await fetch(`${baseUrl}/api/session/bootstrap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'viewer', clientId: 'student-1' })
    });
    assert.equal(viewer.status, 200);

    const hostWithoutCredential = await fetch(`${baseUrl}/api/session/bootstrap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'host' })
    });
    assert.equal(hostWithoutCredential.status, 403);
});
