// 教师/学生页面产物检查。
//
// 学生课堂页位于学生端应用（apps/student/ui/classroom，包名 @lumesync/student-ui），
// 由 scripts/build.mjs 构建成版本化静态产物，教师服务只分发，不再托管页面源码。
// 页面仍在浏览器里以 text/babel 编译，语法错误只会在运行时暴露；这里用同一份
// Babel Standalone 先编译一次，并确认协议握手与快照处理没有被删除。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.join(__dirname, '../..');
const publicDir = path.join(repoRoot, 'shared/public');
const studentUiSrcDir = path.join(repoRoot, '../student/ui/classroom/src');
const studentAppPath = path.join(studentUiSrcDir, 'classroom-app.js');
const studentHtmlPath = path.join(studentUiSrcDir, 'index.html');

function loadBabel() {
    const babelPath = path.join(publicDir, 'lib/babel.min.js');
    const context = { console, process, setTimeout, clearTimeout };
    context.window = context;
    context.self = context;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(babelPath, 'utf8'), context, { filename: babelPath });
    return context.Babel;
}

test('归位后的学生课堂页可以通过 Babel 编译', () => {
    const Babel = loadBabel();
    const source = fs.readFileSync(studentAppPath, 'utf8');
    const result = Babel.transform(source, {
        presets: ['react'],
        filename: 'classroom-app.js',
        sourceType: 'script'
    });
    assert.ok(result.code.length > 0);
});

test('学生课堂页消费权威快照并处理协议回执', () => {
    const source = fs.readFileSync(studentAppPath, 'utf8');
    assert.match(source, /socket\.on\('classroom:snapshot'/);
    assert.match(source, /socket\.on\('session:accepted'/);
    assert.match(source, /socket\.on\('protocol-rejected'/);
    assert.match(source, /protocolVersion: window\.LumeSyncProtocol\?\.protocolVersion/);
    // revision 守卫：过期快照必须被丢弃
    assert.match(source, /snapshotRevisionRef/);
    // 快照翻页必须仍受 syncFollow 控制，否则关闭跟随后学生会被拉到教师页码
    assert.match(source, /settingsRef\.current\?\.syncFollow && nextSlide !== currentSlideRef\.current/);
});

test('生成的协议全局在页面脚本之前加载', () => {
    const teacherIndex = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
    const protocolIndex = teacherIndex.indexOf('/protocol-client.js');
    assert.notEqual(protocolIndex, -1, 'index.html 缺少 /protocol-client.js');
    for (const app of ['/teacher-app.js', '/render-engine.js']) {
        const appIndex = teacherIndex.indexOf(app);
        if (appIndex === -1) continue;
        assert.ok(protocolIndex < appIndex, `index.html 中 /protocol-client.js 必须在 ${app} 之前`);
    }

    // 学生课堂页源码用相对引用指向同目录的 classroom-app.js；构建脚本会把它
    // 重写成 /classroom/<version>/classroom-app.js（见 @lumesync/student-ui 构建测试）。
    const studentIndex = fs.readFileSync(studentHtmlPath, 'utf8');
    const studentProtocolIndex = studentIndex.indexOf('/protocol-client.js');
    const studentAppIndex = studentIndex.indexOf('src="classroom-app.js"');
    const renderEngineIndex = studentIndex.indexOf('/render-engine.js');
    assert.notEqual(studentProtocolIndex, -1, '学生课堂页缺少 /protocol-client.js');
    assert.notEqual(studentAppIndex, -1, '学生课堂页缺少 classroom-app.js 引用');
    assert.ok(studentProtocolIndex < studentAppIndex, '/protocol-client.js 必须在 classroom-app.js 之前');
    assert.ok(studentProtocolIndex < renderEngineIndex, '/protocol-client.js 必须在 /render-engine.js 之前');
    // 教师仓库不再托管学生页面，源码不得引用旧路径。
    assert.equal(studentIndex.includes('/student-app.js'), false);
});
