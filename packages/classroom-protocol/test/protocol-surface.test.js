const test = require('node:test');
const assert = require('node:assert/strict');

const {
    API_ROUTES,
    APP_ROUTES,
    resolveApiRoute,
    requiresHostForApiRoute,
    resolveAppRoute,
    INBOUND_EVENTS,
    OUTBOUND_EVENTS,
    PLANNED_EVENT_NAMES,
    canSendEvent,
    ROLE_HOST,
    ROLE_VIEWER
} = require('../index.js');

test('课程读取保持公开，管理与提交路径要求 host', () => {
    // 与 apps/teacher/server/tests/http-auth.test.js 的既有断言保持一致
    assert.equal(requiresHostForApiRoute('GET', '/courses'), false);
    assert.equal(requiresHostForApiRoute('DELETE', '/delete-course'), true);
    assert.equal(requiresHostForApiRoute('GET', '/submissions/lesson'), true);
    assert.equal(requiresHostForApiRoute('POST', '/save-submission'), true);
    assert.equal(resolveApiRoute('GET', '/courses').id, 'courses.list');
    assert.equal(resolveApiRoute('GET', '/courses').declared, true);
});

test('未声明的写请求按 host 兜底，读请求保持公开', () => {
    assert.equal(requiresHostForApiRoute('POST', '/some-future-write'), true);
    assert.equal(requiresHostForApiRoute('GET', '/some-future-read'), false);
    assert.equal(resolveApiRoute('POST', '/some-future-write').declared, false);
});

test('导出、文件夹、布局与提交文件读取都要求 host', () => {
    for (const [method, path] of [
        ['GET', '/storage-usage'],
        ['GET', '/export-course/lesson'],
        ['POST', '/course-folders'],
        ['PUT', '/course-folders/f1'],
        ['PUT', '/course-folders/f1/move'],
        ['PUT', '/course-folders/f1/courses/c1'],
        ['GET', '/classroom-layout'],
        ['POST', '/save-classroom-layout'],
        ['GET', '/submission-config'],
        ['POST', '/submission-config'],
        ['GET', '/submissions/lesson/file/a.csv'],
        ['POST', '/submissions/lesson/download-batch']
    ]) {
        assert.equal(requiresHostForApiRoute(method, path), true, `${method} ${path} 应要求 host`);
    }
});

test('健康检查与课件静态读取保持公开', () => {
    for (const path of ['/health', '/protocol', '/courses', '/course-status', '/components-manifest', '/course-guide', '/download-skill']) {
        assert.equal(requiresHostForApiRoute('GET', path), false, `${path} 应为公开读取`);
    }
});

test('会话引导路径不被 apiRouter 的 host 兜底挡住', () => {
    // 回归用例：正文接口挂在同一个 apiRouter 上，引导路径若按"写请求一律 host"
    // 处理，viewer 与 host 都拿不到凭证。
    const resolution = resolveApiRoute('POST', '/session/bootstrap');
    assert.equal(resolution.id, 'session.bootstrap');
    assert.equal(resolution.access, 'bootstrap');
    assert.equal(requiresHostForApiRoute('POST', '/session/bootstrap'), false);
});

test('大小写、尾斜杠与非标准方法都不能绕过 host 授权', () => {
    // 回归用例：Express 默认大小写不敏感、非严格尾斜杠，
    // 路由表若按字面量比对，/api/SUBMISSIONS/x 会落到 public 兜底。
    assert.equal(requiresHostForApiRoute('GET', '/SUBMISSIONS/lesson'), true);
    assert.equal(requiresHostForApiRoute('get', '/submissions/lesson'), true);
    assert.equal(resolveApiRoute('GET', '/SUBMISSIONS/lesson').id, 'submissions.list');
    assert.equal(requiresHostForApiRoute('GET', '/submissions/lesson/'), true);
    assert.equal(requiresHostForApiRoute('GET', '/Submissions/lesson/file/report.csv'), true);
    assert.equal(requiresHostForApiRoute('GET', '/STORAGE-USAGE'), true);
    assert.equal(requiresHostForApiRoute('GET', '/CLASSROOM-LAYOUT'), true);

    // HEAD 由 Express 交给 GET 处理器，必须同样要求 host。
    assert.equal(requiresHostForApiRoute('HEAD', '/submissions/lesson'), true);
    assert.equal(requiresHostForApiRoute('HEAD', '/submissions/lesson/file/report.csv'), true);

    // 未声明的非读方法保守按 host 兜底。
    for (const method of ['OPTIONS', 'PROPFIND', 'MKCOL', 'TRACE', 'PATCH']) {
        assert.equal(requiresHostForApiRoute(method, '/save-submission'), true, `${method} 应要求 host`);
        assert.equal(requiresHostForApiRoute(method, '/anything-undeclared'), true, `${method} 应要求 host`);
    }

    // 公开读取不受影响。
    assert.equal(requiresHostForApiRoute('GET', '/COURSES'), false);
    assert.equal(requiresHostForApiRoute('HEAD', '/health'), false);
});

test('大小写不敏感的小写化不改变公开路径判定', () => {
    assert.equal(requiresHostForApiRoute('GET', '/protocol'), false);
    assert.equal(requiresHostForApiRoute('GET', '/PROTOCOL'), false);
    assert.equal(resolveApiRoute('POST', '/SESSION/BOOTSTRAP').access, 'bootstrap');
});

test('app 级路由标明 bootstrap 的特殊授权', () => {
    assert.equal(resolveAppRoute('GET', '/api/students').access, 'host');
    assert.equal(resolveAppRoute('GET', '/api/student-log').access, 'host');
    assert.equal(resolveAppRoute('POST', '/api/session/bootstrap').access, 'bootstrap');
});

test('路由表模式可编译且互不冲突（同方法同路径只命中第一条）', () => {
    for (const route of API_ROUTES) {
        assert.ok(route.pattern instanceof RegExp, `${route.id} 的 pattern 必须是正则`);
        assert.ok(Array.isArray(route.methods) && route.methods.length > 0, `${route.id} 必须声明方法`);
        assert.ok(['public', 'host', 'bootstrap'].includes(route.access), `${route.id} 的 access 非法`);
    }
    const ids = API_ROUTES.map((route) => route.id);
    assert.equal(new Set(ids).size, ids.length, '路由 id 必须唯一');
    assert.ok(APP_ROUTES.length >= 3);
});

test('事件表只引用合法角色与状态', () => {
    for (const [name, entry] of Object.entries(INBOUND_EVENTS)) {
        assert.ok(Array.isArray(entry.roles) && entry.roles.length > 0, `${name} 缺少角色声明`);
        for (const role of entry.roles) {
            assert.ok([ROLE_HOST, ROLE_VIEWER, 'any'].includes(role), `${name} 的角色 ${role} 非法`);
        }
        assert.ok(['current', 'legacy', 'planned'].includes(entry.status), `${name} 的 status 非法`);
        assert.equal(typeof entry.since, 'number', `${name} 缺少 since`);
    }
    for (const [name, entry] of Object.entries(OUTBOUND_EVENTS)) {
        assert.equal(typeof entry.audience, 'string', `${name} 缺少 audience`);
        assert.equal(typeof entry.since, 'number', `${name} 缺少 since`);
    }
});

test('角色矩阵与当前服务端行为一致', () => {
    // host 专属命令
    for (const name of ['select-course', 'sync-slide', 'end-course', 'register-dependencies', 'vote:start', 'annotation:clear']) {
        assert.equal(canSendEvent(ROLE_HOST, name), true, `host 应可发送 ${name}`);
        assert.equal(canSendEvent(ROLE_VIEWER, name), false, `viewer 不应可发送 ${name}`);
    }
    // viewer 专属上报
    for (const name of ['student:submit', 'vote:submit', 'student-alert', 'student:screenshot', 'student-action']) {
        assert.equal(canSendEvent(ROLE_VIEWER, name), true, `viewer 应可发送 ${name}`);
        assert.equal(canSendEvent(ROLE_HOST, name), false, `host 不应可发送 ${name}`);
    }
    // 已认证连接均可
    for (const name of ['request-classroom-snapshot', 'annotation:get', 'session:hello']) {
        assert.equal(canSendEvent(ROLE_HOST, name), true);
        assert.equal(canSendEvent(ROLE_VIEWER, name), true);
    }
    assert.equal(canSendEvent(ROLE_HOST, 'does-not-exist'), false);
});

test('计划命名与目标架构文档的事件名一致', () => {
    assert.equal(PLANNED_EVENT_NAMES['select-course'], 'course:select');
    assert.equal(PLANNED_EVENT_NAMES['sync-slide'], 'slide:set');
    assert.equal(PLANNED_EVENT_NAMES['end-course'], 'course:end');
    assert.equal(PLANNED_EVENT_NAMES['student:submit'], 'submission:create');
    assert.equal(PLANNED_EVENT_NAMES['vote:submit'], 'vote:respond');
    assert.equal(PLANNED_EVENT_NAMES['student:power-control'], 'device:power:request');
    assert.equal(PLANNED_EVENT_NAMES['annotation-add'], 'annotation:add');
});

test('ESM 与 CJS 入口导出一致', async () => {
    const esm = await import('../index.mjs');
    const cjs = require('../index.js');
    const esmNames = Object.keys(esm).filter((name) => name !== 'default').sort();
    const cjsNames = Object.keys(cjs).sort();
    assert.deepEqual(esmNames, cjsNames, 'index.mjs 的具名导出必须与 index.js 完全一致');
    assert.equal(esm.PROTOCOL_VERSION, cjs.PROTOCOL_VERSION);
});
