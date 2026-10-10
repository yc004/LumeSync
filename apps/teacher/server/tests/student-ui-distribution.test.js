// 学生课堂 UI 分发测试（真实 Express app + 真实 HTTP 请求）。
//
// 背景：正式课堂页已从教师仓库移到学生端仓库的 @lumesync/student-ui。
// 教师服务只分发版本化构建产物：/student.html 是稳定入口（学生 Windows 壳导航的地址），
// /classroom/<version>/* 是内容寻址的资源。产物缺失或损坏时必须显式报错，
// 不能静默 404，也不能回退到旧副本。

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { ensureStudentUiBuild } = require('./student-ui-fixture');

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'lume-student-ui-'));
process.env.LUMESYNC_PUBLIC_DIR = sandbox;
process.env.STATIC_DIR = sandbox;
process.env.LUMESYNC_CACHE_DIR = sandbox;
process.env.LUMESYNC_COURSES_DIR = path.join(sandbox, 'courses');
process.env.LUMESYNC_SUBMISSIONS_DIR = path.join(sandbox, 'submissions');
process.env.LUMESYNC_SUBMISSIONS_CONFIG = path.join(sandbox, 'submissions-config.json');
process.env.LUMESYNC_HOST_TOKEN = `test-host-${'e'.repeat(16)}`;
process.env.LUMESYNC_VIEWER_TOKEN_SECRET = `test-viewer-${'f'.repeat(16)}`;
delete process.env.LUMESYNC_STUDENT_UI_DIR;

const { server } = require('../index.js');

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

let baseUrl = '';
let studentUi = null;
let current = null;
let manifest = null;

test.before(async () => {
    studentUi = ensureStudentUiBuild();
    current = readJson(studentUi.currentPath);
    manifest = readJson(studentUi.manifestPath);

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(sandbox, { recursive: true, force: true });
});

test('GET /student.html 返回当前版本的学生课堂页', async () => {
    const response = await fetch(`${baseUrl}/student.html`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') || '', /text\/html/);
    assert.equal(response.headers.get('cache-control'), 'no-store');

    const html = await response.text();
    assert.match(html, /SyncClassroom Student/);

    // 与构建产物逐字节一致：入口指向当前版本的 index.html。
    const entryPath = studentUi.entryPath(current.version, current.entry);
    assert.equal(html, fs.readFileSync(entryPath, 'utf8'));

    // 页面必须引用版本化资源，且先加载协议全局再加载课堂页脚本。
    const versionedAsset = `/classroom/${current.version}/classroom-app.js`;
    const protocolIndex = html.indexOf('/protocol-client.js');
    const appIndex = html.indexOf(versionedAsset);
    assert.notEqual(protocolIndex, -1, '页面必须引入 /protocol-client.js');
    assert.notEqual(appIndex, -1, `页面必须引用 ${versionedAsset}`);
    assert.ok(protocolIndex < appIndex, '/protocol-client.js 必须在课堂页脚本之前');

    // /render-engine.js 与 /lib/* 仍由教师服务提供，不在学生端产物里。
    assert.notEqual(html.indexOf('/render-engine.js'), -1);
    assert.notEqual(html.indexOf('/lib/babel.min.js'), -1);
});

test('版本化资源路径返回 200，内容与 manifest 哈希一致', async () => {
    for (const file of manifest.files) {
        const response = await fetch(`${baseUrl}/classroom/${current.version}/${file.path}`);
        assert.equal(response.status, 200, `${file.path} 应可访问`);
        const bytes = Buffer.from(await response.arrayBuffer());
        assert.equal(bytes.byteLength, file.size);
        assert.equal(sha256(bytes), file.sha256);
    }

    const appResponse = await fetch(`${baseUrl}/classroom/${current.version}/classroom-app.js`);
    // 版本目录是内容寻址的，可以长期缓存。
    assert.match(appResponse.headers.get('cache-control') || '', /immutable/);

    const pointer = await fetch(`${baseUrl}/classroom/current.json`);
    assert.equal(pointer.status, 200);
    assert.equal(pointer.headers.get('cache-control'), 'no-store');
    assert.equal((await pointer.json()).version, current.version);
});

test('构建产物缺失时显式报错，而不是静默 404', async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lume-student-ui-empty-'));
    process.env.LUMESYNC_STUDENT_UI_DIR = emptyDir;

    try {
        const page = await fetch(`${baseUrl}/student.html`);
        assert.equal(page.status, 503);
        const body = await page.text();
        assert.ok(body.includes(emptyDir), '错误必须给出预期构建目录');
        assert.ok(body.includes('pnpm --filter @lumesync/student-ui run build'), '错误必须给出构建命令');
        assert.ok(body.includes('LUMESYNC_STUDENT_UI_DIR'), '错误必须说明覆盖方式');

        const asset = await fetch(`${baseUrl}/classroom/${current.version}/classroom-app.js`);
        assert.equal(asset.status, 503, '资源路径不能落到静态兜底 404');
        assert.match(await asset.text(), /学生课堂 UI 构建产物不可用/);
    } finally {
        delete process.env.LUMESYNC_STUDENT_UI_DIR;
        fs.rmSync(emptyDir, { recursive: true, force: true });
    }

    // 恢复后立即重新可用（解析结果随环境变量失效）。
    assert.equal((await fetch(`${baseUrl}/student.html`)).status, 200);
});

test('产物损坏（缺少 manifest.json）时同样显式报错', async () => {
    const brokenDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lume-student-ui-broken-'));
    fs.copyFileSync(studentUi.currentPath, path.join(brokenDir, 'current.json'));
    process.env.LUMESYNC_STUDENT_UI_DIR = brokenDir;

    try {
        const response = await fetch(`${baseUrl}/student.html`);
        assert.equal(response.status, 503);
        const body = await response.text();
        assert.match(body, /manifest\.json/);
        assert.ok(body.includes(brokenDir));
    } finally {
        delete process.env.LUMESYNC_STUDENT_UI_DIR;
        fs.rmSync(brokenDir, { recursive: true, force: true });
    }
});

test('指针指向的版本目录不存在时显式报错（不提供过期副本）', async () => {
    const staleDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lume-student-ui-stale-'));
    fs.cpSync(studentUi.distDir, staleDir, { recursive: true });
    fs.rmSync(path.join(staleDir, current.version), { recursive: true, force: true });
    process.env.LUMESYNC_STUDENT_UI_DIR = staleDir;

    try {
        const response = await fetch(`${baseUrl}/student.html`);
        assert.equal(response.status, 503);
        const body = await response.text();
        assert.match(body, /entry-missing/);
        assert.ok(body.includes(path.join(staleDir, current.version, current.entry)));
    } finally {
        delete process.env.LUMESYNC_STUDENT_UI_DIR;
        fs.rmSync(staleDir, { recursive: true, force: true });
    }
});

test('STATIC_DIR 里的旧副本不会被回退使用', async () => {
    // 教师仓库曾托管 shared/public/student.html；即使静态根目录里残留同名文件，
    // /student.html 也必须返回学生端构建产物。
    const staleCopy = path.join(sandbox, 'student.html');
    fs.writeFileSync(staleCopy, '<html><body>stale-student-page</body></html>', 'utf8');

    try {
        const response = await fetch(`${baseUrl}/student.html`);
        assert.equal(response.status, 200);
        const html = await response.text();
        assert.equal(html.includes('stale-student-page'), false, '不能回退到静态目录里的旧副本');
        assert.ok(html.includes(`/classroom/${current.version}/classroom-app.js`));
    } finally {
        fs.rmSync(staleCopy, { force: true });
    }
});

test('LUMESYNC_STUDENT_UI_DIR 指向的产物被真正使用', async () => {
    const overrideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lume-student-ui-override-'));
    fs.cpSync(studentUi.distDir, overrideDir, { recursive: true });
    const overrideEntry = path.join(overrideDir, current.version, current.entry);
    fs.writeFileSync(
        overrideEntry,
        fs.readFileSync(overrideEntry, 'utf8').replace('</body>', '<!-- override-marker -->\n</body>'),
        'utf8'
    );
    process.env.LUMESYNC_STUDENT_UI_DIR = overrideDir;

    try {
        const response = await fetch(`${baseUrl}/student.html`);
        assert.equal(response.status, 200);
        assert.match(await response.text(), /override-marker/);
    } finally {
        delete process.env.LUMESYNC_STUDENT_UI_DIR;
        fs.rmSync(overrideDir, { recursive: true, force: true });
    }

    // 覆盖目录删除后回到工作区包产物，仍然可用。
    const restored = await fetch(`${baseUrl}/student.html`);
    assert.equal(restored.status, 200);
    assert.doesNotMatch(await restored.text(), /override-marker/);
});
