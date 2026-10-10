// 课程目录扫描与共享格式库的接入测试。
//
// 重点：ZIP 课件的 manifest 由 @lumesync/course-format 校验，
// 损坏的包必须出现在 catalog.invalid 里，而不是被静默跳过或当成文本课件。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const coursesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lume-courses-'));
process.env.LUMESYNC_COURSES_DIR = coursesDir;

const JSZip = require('jszip');
const { writeLumePackage } = require('@lumesync/course-format');
const { scanCourses } = require('../src/courses');

const FIXED_DATE = new Date('2026-09-25T00:00:00.000Z');

function manifest(overrides = {}) {
    return {
        schemaVersion: '1.0.0',
        id: 'lesson-ok',
        title: '可用课件',
        icon: 'Book',
        desc: '扫描测试',
        color: 'from-blue-500 to-indigo-600',
        runtime: { format: 'lumesync-zip', entryMode: 'pages', slideModule: 'tsx', react: '18' },
        pages: [{ id: 'p1', file: 'slides/P1.tsx', title: '第一页' }],
        assets: {},
        ...overrides
    };
}

test.before(async () => {
    fs.mkdirSync(path.join(coursesDir, '单元一'), { recursive: true });

    const valid = await writeLumePackage(
        { manifest: manifest(), files: new Map([['slides/P1.tsx', 'export default () => null;']]) },
        { date: FIXED_DATE }
    );
    fs.writeFileSync(path.join(coursesDir, '单元一', 'lesson-ok.lume'), Buffer.from(valid));

    // 页面文件缺失：manifest 校验必须报出 page_file_not_found。
    const brokenZip = new JSZip();
    brokenZip.file('manifest.json', JSON.stringify(manifest({ id: 'lesson-broken' })));
    const broken = await brokenZip.generateAsync({ type: 'uint8array' });
    fs.writeFileSync(path.join(coursesDir, 'lesson-broken.lume'), Buffer.from(broken));

    // 旧脚本课件：保持既有兼容分支，不进入 invalid。
    fs.writeFileSync(
        path.join(coursesDir, 'legacy.lume'),
        "window.CourseData = { title: '旧脚本课件', pages: [] };",
        'utf8'
    );

    // 无 manifest 的 ZIP：同样必须被报出来。
    const noManifest = new JSZip();
    noManifest.file('slides/P1.tsx', 'x');
    fs.writeFileSync(
        path.join(coursesDir, 'no-manifest.lume'),
        Buffer.from(await noManifest.generateAsync({ type: 'uint8array' }))
    );

    fs.writeFileSync(path.join(coursesDir, '讲义.pdf'), '%PDF-1.4', 'utf8');
});

test('合法 ZIP 课件通过共享校验器进入目录', () => {
    const catalog = scanCourses();
    const course = catalog.courses.find((item) => item.id === 'lesson-ok');
    assert.ok(course, '合法课件应出现在目录中');
    assert.equal(course.type, 'lume-zip');
    assert.equal(course.title, '可用课件');
    assert.equal(course.icon, 'Book');
    assert.equal(course.desc, '扫描测试');
    assert.equal(course.schemaVersion, '1.0.0');
    assert.equal(course.file, '单元一/lesson-ok.lume');
});

test('损坏的 ZIP 课件被报告而不是静默跳过', () => {
    const catalog = scanCourses();
    const ids = catalog.courses.map((item) => item.id);
    assert.ok(!ids.includes('lesson-broken'));
    assert.ok(!ids.includes('course_' + Buffer.from('no-manifest').toString('base64url')));

    const broken = catalog.invalid.find((item) => item.file === 'lesson-broken.lume');
    assert.ok(broken, '损坏课件应出现在 invalid 列表');
    assert.equal(broken.code, 'manifest_invalid');
    assert.match(broken.message, /page_file_not_found/);

    const missingManifest = catalog.invalid.find((item) => item.file === 'no-manifest.lume');
    assert.ok(missingManifest);
    assert.equal(missingManifest.code, 'manifest_missing');
});

test('旧脚本课件与 PDF 仍按既有分支收录', () => {
    const catalog = scanCourses();
    const legacy = catalog.courses.find((item) => item.file === 'legacy.lume');
    assert.ok(legacy);
    assert.equal(legacy.type, 'legacy-script');
    assert.equal(legacy.title, '旧脚本课件');

    const pdf = catalog.courses.find((item) => item.file === '讲义.pdf');
    assert.ok(pdf);
    assert.equal(pdf.type, 'pdf');
});

test('目录结构进入 folders 列表', () => {
    const catalog = scanCourses();
    const folder = catalog.folders.find((item) => item.path === '单元一');
    assert.ok(folder);
    assert.equal(folder.name, '单元一');
    assert.ok(catalog.courses.find((item) => item.id === 'lesson-ok').folderId === folder.id);
});

test('无效课件不阻塞其他课件的收录', () => {
    const catalog = scanCourses();
    assert.ok(catalog.courses.length >= 3);
    assert.ok(catalog.invalid.length >= 2);
});
