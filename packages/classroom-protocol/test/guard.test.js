const test = require('node:test');
const assert = require('node:assert/strict');

const {
    authorizeEvent,
    createInboundGuard,
    ERROR_CODES,
    ROLE_HOST,
    ROLE_VIEWER
} = require('../index.js');

test('未声明的事件被拒绝', () => {
    const result = authorizeEvent(ROLE_HOST, 'not-an-event', {});
    assert.equal(result.ok, false);
    assert.equal(result.code, ERROR_CODES.EVENT_UNKNOWN);
});

test('角色不符的事件被拒绝', () => {
    const result = authorizeEvent(ROLE_VIEWER, 'sync-slide', { slideIndex: 1 });
    assert.equal(result.ok, false);
    assert.equal(result.code, ERROR_CODES.EVENT_FORBIDDEN);

    const reverse = authorizeEvent(ROLE_HOST, 'vote:submit', { voteId: 'v1', optionId: 'a' });
    assert.equal(reverse.ok, false);
    assert.equal(reverse.code, ERROR_CODES.EVENT_FORBIDDEN);
});

test('payload 不符合契约时被拒绝并给出字段路径', () => {
    const missing = authorizeEvent(ROLE_HOST, 'select-course', {});
    assert.equal(missing.ok, false);
    assert.equal(missing.code, ERROR_CODES.EVENT_PAYLOAD_INVALID);
    assert.match(missing.message, /payload\.courseId/);

    const negativeSlide = authorizeEvent(ROLE_HOST, 'sync-slide', { slideIndex: -3 });
    assert.equal(negativeSlide.ok, false);
    assert.equal(negativeSlide.code, ERROR_CODES.EVENT_PAYLOAD_INVALID);
});

test('合法 payload 被规范化后返回', () => {
    const result = authorizeEvent(ROLE_HOST, 'sync-slide', { slideIndex: '4', extra: 'kept' });
    assert.equal(result.ok, true);
    assert.equal(result.value.slideIndex, 4);
    assert.equal(result.value.extra, 'kept');
});

test('无 payload 的事件接受空参数', () => {
    const result = authorizeEvent(ROLE_HOST, 'end-course', undefined);
    assert.equal(result.ok, true);
});

test('守卫中间件对带 ack 的非法事件直接回执而不进入处理器', () => {
    const violations = [];
    const guard = createInboundGuard({
        role: ROLE_VIEWER,
        onViolation: (info) => violations.push(info)
    });
    const ackCalls = [];
    let nextCalled = false;
    guard(['sync-slide', { slideIndex: 1 }, (payload) => ackCalls.push(payload)], () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(ackCalls.length, 1);
    assert.equal(ackCalls[0].code, ERROR_CODES.EVENT_FORBIDDEN);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].event, 'sync-slide');
});

test('守卫中间件放行合法事件并透传 payload', () => {
    const guard = createInboundGuard({ role: ROLE_HOST });
    let nextCalled = false;
    guard(['select-course', { courseId: 'lesson-1' }], () => { nextCalled = true; });
    assert.equal(nextCalled, true);
});

test('守卫中间件在无 ack 时以 error 结束非法事件', () => {
    const guard = createInboundGuard({ role: ROLE_VIEWER });
    let error = null;
    guard(['select-course', { courseId: 'x' }], (err) => { error = err; });
    assert.ok(error instanceof Error);
    assert.equal(error.data.code, ERROR_CODES.EVENT_FORBIDDEN);
});

test('多参数 emit 以第一个参数为准（与处理器读取一致）', () => {
    const guard = createInboundGuard({ role: ROLE_HOST });
    let nextCalled = false;
    // 处理器只读 args[0]，校验必须用同一个参数，否则第二个参数会被误当成 payload。
    guard(['select-course', { courseId: 'lesson-1' }, { ignored: true }], () => { nextCalled = true; });
    assert.equal(nextCalled, true);
});

test('allowUndeclared 可临时放行未声明事件（迁移窗口）', () => {
    const strict = createInboundGuard({ role: ROLE_HOST });
    let strictError = null;
    strict(['legacy-unknown', {}], (err) => { strictError = err; });
    assert.ok(strictError instanceof Error, '严格模式必须拒绝未声明事件');

    const permissive = createInboundGuard({ role: ROLE_HOST, allowUndeclared: true });
    let permissiveError = 'not-called';
    permissive(['legacy-unknown', {}], (err) => { permissiveError = err; });
    assert.equal(permissiveError, undefined, '迁移窗口下应放行并继续');
});
