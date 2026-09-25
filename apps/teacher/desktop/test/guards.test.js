// 教师壳安全守卫的单元测试（纯函数，不启动 Electron）。
//
// 覆盖两条「页面输入 → 本机操作」的判定：
//   1. 页面来源守卫：只有本机课堂服务的页面能调用原生能力（含前缀伪装、别的端口/host、非 http 协议）；
//   2. 课件路径守卫：导入/导出只能落在课件目录以内（含 ../ 越界、绝对路径、同前缀兄弟目录）。

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');

const { teacherPageBase, isTeacherPageUrl, safeCoursePath } = require('../src/guards.cjs');

const PORT = 51234;
const BASE = teacherPageBase(PORT);
const COURSES_DIR = path.join(os.tmpdir(), 'lumesync-courses');

test('页面来源守卫：只有本机课堂服务的页面可以通过', () => {
    assert.equal(BASE, `http://127.0.0.1:${PORT}`);
    for (const ok of [
        `${BASE}/`,
        `${BASE}/index.html`,
        `${BASE}/teacher.html?room=101`,
        `${BASE}/student.html#/slide/2`
    ]) {
        assert.equal(isTeacherPageUrl(ok, BASE), true, `${ok} 应被接受`);
    }
});

test('页面来源守卫：拒绝远程页面、别的端口与协议', () => {
    for (const bad of [
        '',
        null,
        undefined,
        'about:blank',
        'file:///Users/someone/evil.html',
        'data:text/html,<script>1</script>',
        `https://127.0.0.1:${PORT}/`,
        `http://localhost:${PORT}/`,
        `http://127.0.0.1:${PORT + 1}/`,
        'http://192.168.1.20:3000/',
        'http://evil.example/teacher.html'
    ]) {
        assert.equal(isTeacherPageUrl(bad, BASE), false, `${String(bad)} 应被拒绝`);
    }
});

test('页面来源守卫：前缀伪装不能命中（端口后必须是路径分隔）', () => {
    // 形如 http://127.0.0.1:3000.evil.example 的域名能骗过朴素 startsWith(`${base}`)
    const disguised = `http://127.0.0.1:${PORT}.evil.example/teacher.html`;
    assert.equal(disguised.startsWith(BASE), true, '用例前提：朴素前缀比较会被骗过');
    assert.equal(isTeacherPageUrl(disguised, BASE), false, '带路径分隔的比较必须拒绝');

    const userinfo = `http://127.0.0.1:${PORT}@evil.example/`;
    assert.equal(isTeacherPageUrl(userinfo, BASE), false);
});

test('页面来源守卫：base 缺失或不是字符串时一律拒绝', () => {
    assert.equal(isTeacherPageUrl(`${BASE}/`, ''), false);
    assert.equal(isTeacherPageUrl(`${BASE}/`, null), false);
    assert.equal(isTeacherPageUrl(`${BASE}/`, undefined), false);
});

test('课件路径守卫：课件目录以内的相对路径解析成绝对路径', () => {
    assert.equal(safeCoursePath(COURSES_DIR, 'lesson-01.lume'), path.join(COURSES_DIR, 'lesson-01.lume'));
    assert.equal(safeCoursePath(COURSES_DIR, 'sub/lesson-02.pdf'), path.join(COURSES_DIR, 'sub', 'lesson-02.pdf'));
    // 目录内的相对回退仍然合法（最终还是落在课件目录里）
    assert.equal(safeCoursePath(COURSES_DIR, 'sub/../lesson-03.lume'), path.join(COURSES_DIR, 'lesson-03.lume'));
});

test('课件路径守卫：越界、绝对路径与空值一律抛错', () => {
    for (const bad of [
        '../evil.lume',
        '../../etc/passwd',
        'sub/../../evil.lume',
        '/etc/passwd',
        '',
        null,
        undefined,
        123,
        {}
    ]) {
        assert.throws(() => safeCoursePath(COURSES_DIR, bad), /无效课件路径|课件路径越界/, `${String(bad)} 应被拒绝`);
    }
});

test('课件路径守卫：同前缀的兄弟目录不算命中', () => {
    // /tmp/lumesync-courses-evil 与 /tmp/lumesync-courses 前缀相同，但不在课件目录内
    assert.throws(
        () => safeCoursePath(COURSES_DIR, '../lumesync-courses-evil/evil.lume'),
        /课件路径越界/
    );
});

test('课件路径守卫：目录本身不是合法目标（必须落在目录内的某个文件）', () => {
    assert.throws(() => safeCoursePath(COURSES_DIR, '.'), /课件路径越界/);
});
