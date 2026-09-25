// 单元测试：退避/续租的纯函数、学生事件清单与 Hub 转发清单一致性、
// 直接模式事件映射、错误归一化（绝不透出 socket 对象）。

const test = require('node:test');
const assert = require('node:assert/strict');

const { VIEWER_FORWARD_EVENTS } = require('@lumesync/classroom-hub');
const { ERROR_CODES, CLASSROOM_COMMAND_TYPES, HOST_SETTINGS_FIELDS } = require('@lumesync/classroom-protocol');

const {
    createBackoff,
    computeRenewDelay,
    listStudentEventNames,
    normalizeCommand,
    applyCommandLocally,
    DIRECT_MODE_COMMAND_EVENTS,
    SessionAgentError,
    SESSION_AGENT_ERROR_CODES,
    toSessionAgentError,
    buildHubUrl,
    createSessionAgent
} = require('..');

test('退避：指数增长、上限封顶、抖动有界，reset 后可重新开始', () => {
    const fixed = createBackoff({ baseMs: 100, maxMs: 1000, factor: 2, jitterRatio: 0, random: () => 0.5 });
    assert.deepEqual([fixed.next(), fixed.next(), fixed.next(), fixed.next(), fixed.next()], [100, 200, 400, 800, 1000]);
    assert.equal(fixed.attempt, 5);
    fixed.reset();
    assert.equal(fixed.attempt, 0);
    assert.equal(fixed.next(), 100);

    // 抖动：random=0 → 下界（-25%），random=1 → 上界（+25%）
    const low = createBackoff({ baseMs: 100, maxMs: 1000, factor: 2, jitterRatio: 0.25, random: () => 0 });
    const high = createBackoff({ baseMs: 100, maxMs: 1000, factor: 2, jitterRatio: 0.25, random: () => 1 });
    assert.equal(low.next(), 75);
    assert.equal(high.next(), 125);
    // 封顶之后仍受抖动影响，但永远不会超过 maxMs * (1 + ratio)
    for (let i = 0; i < 20; i += 1) {
        const value = high.next();
        assert.ok(value > 0 && value <= 1250, `退避值 ${value} 超出预期范围`);
    }
});

test('续租延迟：落在租约寿命的前半段、有抖动、绝不晚于到期', () => {
    const expiresAt = 100000;
    const now = 40000; // 剩余 60s
    const base = computeRenewDelay({ expiresAt, now, jitterRatio: 0, random: () => 0.5 });
    assert.equal(base, 30000, 'TTL 60s → 30s 后续租');
    const low = computeRenewDelay({ expiresAt, now, jitterRatio: 0.25, random: () => 0 });
    const high = computeRenewDelay({ expiresAt, now, jitterRatio: 0.25, random: () => 1 });
    assert.ok(low < base && base < high);
    assert.ok(high < 60000, '抖动后仍必须早于到期');

    // 已过期/异常输入：退回 fallbackTtlMs，且延迟仍为正数
    const fallback = computeRenewDelay({ expiresAt: now - 1, now, fallbackTtlMs: 10000, jitterRatio: 0, random: () => 0.5 });
    assert.equal(fallback, 5000);
});

test('学生事件清单与 Hub 的通用转发清单完全一致（契约表是唯一来源）', () => {
    const mine = listStudentEventNames();
    assert.deepEqual(mine, VIEWER_FORWARD_EVENTS);
    // 契约里的实际名字（注意 student-alert 是连字符，文档表格曾写成 student:alert）
    for (const name of ['student-alert', 'student:screenshot', 'student:device-info', 'vote:submit', 'request-sync-state']) {
        assert.ok(mine.includes(name), `${name} 应当在转发清单里`);
    }
    assert.equal(mine.includes('student:submit'), false, '提交有专门处理器，不能当普通学生事件');
    assert.equal(mine.includes('classroom:command'), false, 'host 命令不是学生事件');
    assert.equal(mine.includes('session:hello'), false);
});

test('normalizeCommand：拒绝未知命令类型与非法 payload，settings 只保留契约字段', () => {
    assert.throws(() => normalizeCommand('not-a-command', {}), (error) => error.code === ERROR_CODES.REQUEST_INVALID);
    assert.throws(() => normalizeCommand('course:select', {}), (error) => error.code === ERROR_CODES.REQUEST_INVALID);
    assert.throws(() => normalizeCommand('slide:set', { slideIndex: -1 }), (error) => error.code === ERROR_CODES.REQUEST_INVALID);
    assert.throws(() => normalizeCommand('settings:update', { unknownField: 1 }), (error) => error.code === ERROR_CODES.REQUEST_INVALID);

    const settings = normalizeCommand('settings:update', { syncFollow: false, monitorIntervalSec: 2, evil: 'x' });
    assert.deepEqual(settings.payload, { syncFollow: false, monitorIntervalSec: 2 });
    assert.deepEqual(settings.ignoredFields, ['evil']);
    assert.equal(CLASSROOM_COMMAND_TYPES.includes(settings.type), true);

    // 每种契约命令都能被规范化（annotation:clear 除外：中继模式可用、直接模式没有对应事件）
    for (const type of CLASSROOM_COMMAND_TYPES) {
        const payload = type === 'course:select' ? { courseId: 'c1' }
            : type === 'slide:set' ? { slideIndex: 2 }
                : type === 'settings:update' ? { syncFollow: true }
                    : {};
        assert.equal(normalizeCommand(type, payload).type, type);
    }
    assert.deepEqual(Object.keys(DIRECT_MODE_COMMAND_EVENTS).sort(), ['course:end', 'course:select', 'settings:update', 'slide:set']);
});

test('applyCommandLocally：命令成功后本地状态与 Hub 语义一致', () => {
    const state = { courseId: null, slideIndex: 0, hostSettings: { syncFollow: true, monitorEnabled: true } };
    applyCommandLocally(state, 'course:select', { courseId: 'lesson-9' });
    assert.equal(state.courseId, 'lesson-9');
    assert.equal(state.slideIndex, 0);
    applyCommandLocally(state, 'slide:set', { slideIndex: 7 });
    assert.equal(state.slideIndex, 7);
    applyCommandLocally(state, 'settings:update', { syncFollow: false });
    assert.deepEqual(state.hostSettings, { syncFollow: false, monitorEnabled: true });
    applyCommandLocally(state, 'course:end', {});
    assert.equal(state.courseId, null);
    assert.equal(state.slideIndex, 0);
    assert.equal(state.hostSettings.monitorEnabled, false, '结束课堂会关掉监看（与 Hub 的 classroom.endCourse 一致）');
    assert.equal(Object.keys(HOST_SETTINGS_FIELDS).length > 10, true);
});

test('错误归一化：Hub 回执 / course-format 异常 / 任意对象都变成 SessionAgentError', () => {
    const fromAck = toSessionAgentError({ ok: false, code: ERROR_CODES.PAIRING_CODE_INVALID, message: '验证码不正确，剩余 3 次', attemptsLeft: 3 });
    assert.equal(fromAck instanceof SessionAgentError, true);
    assert.equal(fromAck.code, ERROR_CODES.PAIRING_CODE_INVALID);
    assert.equal(fromAck.attemptsLeft, 3);
    assert.deepEqual(fromAck.toJSON(), {
        name: 'SessionAgentError',
        code: ERROR_CODES.PAIRING_CODE_INVALID,
        message: '验证码不正确，剩余 3 次',
        attemptsLeft: 3
    });

    const fromFormat = toSessionAgentError(Object.assign(new Error('内容不是 ZIP 包'), { code: 'package_not_a_zip' }));
    assert.equal(fromFormat.code, 'package_not_a_zip');

    const socketLike = { connected: true, id: 'abc', secret: 'device-token' };
    const wrapped = toSessionAgentError(socketLike, SESSION_AGENT_ERROR_CODES.SOCKET_ERROR, '发送失败');
    assert.equal(wrapped.code, SESSION_AGENT_ERROR_CODES.SOCKET_ERROR);
    assert.equal(wrapped.message, '发送失败');
    assert.equal(JSON.stringify(wrapped).includes('device-token'), false, '错误对象不能把原始对象序列化进去');
});

test('工厂参数校验：mode/deviceKey/hostToken 不合法时立刻抛类型化错误', () => {
    assert.throws(() => createSessionAgent({ mode: 'peer', deviceKey: 'device-key-x' }), (e) => e.code === SESSION_AGENT_ERROR_CODES.INVALID_OPTION);
    assert.throws(() => createSessionAgent({ mode: 'relay', deviceKey: 'short' }), (e) => e.code === SESSION_AGENT_ERROR_CODES.INVALID_OPTION);
    assert.throws(() => createSessionAgent({ mode: 'direct', deviceKey: 'teacher-1' }), (e) => e.code === SESSION_AGENT_ERROR_CODES.INVALID_OPTION);
    const agent = createSessionAgent({ mode: 'direct', deviceKey: 'teacher-1', hostToken: 'token' });
    assert.equal(agent.mode, 'direct');
    assert.equal(agent.getState().status, 'idle');
    assert.equal(agent.getState().connected, false);
});

test('buildHubUrl：地址/端口校验与 IPv6 组装', () => {
    assert.equal(buildHubUrl({ address: '192.168.1.10', port: 3000 }), 'http://192.168.1.10:3000');
    assert.equal(buildHubUrl({ address: 'fe80::1', port: 3000 }), 'http://[fe80::1]:3000');
    assert.equal(buildHubUrl({ address: '127.0.0.1', port: 443, secure: true }), 'https://127.0.0.1:443');
    assert.throws(() => buildHubUrl({ address: '', port: 3000 }), (e) => e.code === SESSION_AGENT_ERROR_CODES.INVALID_OPTION);
    assert.throws(() => buildHubUrl({ address: 'a', port: 0 }), (e) => e.code === SESSION_AGENT_ERROR_CODES.INVALID_OPTION);
});
