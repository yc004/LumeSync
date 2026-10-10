// 跨端 payload 契约测试。
//
// 事件表是从服务端处理器反推出来的，而真正决定"会不会误伤功能"的是**客户端实际发什么**。
// 这里按教师页面、学生页面和 Core 运行时的真实调用点，构造每个事件的最小真实 payload，
// 断言契约守卫必须放行。收紧 schema 导致课堂功能失效时，这个测试会先失败。
//
// 载荷来源（已核对）：
//   ui/src/app.tsx、views/classroom-view.tsx
//   ../student/ui/classroom/src/classroom-app.js（原 shared/public/student-app.js，已归位）
//   core/src/browser/engine/runtime/{app.tsx,sync-classroom.tsx}、course-components/vote-slide.tsx

const test = require('node:test');
const assert = require('node:assert/strict');

const { authorizeEvent, ROLE_HOST, ROLE_VIEWER } = require('@lumesync/classroom-protocol');

const HOST_PAYLOADS = {
    'get-student-count': undefined,
    'request-classroom-snapshot': undefined,
    'select-course': { courseId: 'course_abc' },
    'sync-slide': { slideIndex: 3 },
    'update-settings': { forceFullscreen: true, syncFollow: false, monitorIntervalSec: 1.5 },
    'host-settings': {
        forceFullscreen: false,
        syncFollow: true,
        allowInteract: true,
        syncInteraction: false,
        podiumAtTop: true,
        renderScale: 0.96,
        uiScale: 1,
        alertJoin: true,
        alertLeave: true,
        alertFullscreenExit: true,
        alertTabHidden: true,
        monitorEnabled: false,
        monitorIntervalSec: 1
    },
    'refresh-courses': undefined,
    'end-course': undefined,
    'register-dependencies': [{ filename: 'lodash.min.js', publicSrc: 'https://cdn.example.com/lodash.min.js' }],
    'set-admin-password': { hash: 'a'.repeat(64) },
    // 远程唤醒：带 MAC；关机：带 IP
    'student:power-control': { requestId: 'power-1', action: 'power-on', targets: [{ ip: '192.0.2.10', mac: 'AA:BB:CC:DD:EE:FF' }] },
    'full-sync-state': { targetId: 'socket-id', courseId: 'course_abc', slideIndex: 2, state: { key: 'value' } },
    'interaction:sync': { event: 'quiz:answer', payload: { index: 1 } },
    'sync-var': { courseId: 'course_abc', slideIndex: 1, key: 'score', value: 42 },
    'student:submit:ack': { submissionId: 'sub-1', success: true },
    'vote:start': {
        voteId: 'vote-1',
        question: '以下哪个是对的？',
        options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
        durationSec: 60,
        anonymous: false
    },
    'vote:end': { voteId: 'vote-1', courseId: 'course_abc', slideIndex: 2 },
    'annotation:get': { courseId: 'course_abc', slideIndex: 2 },
    'annotation:segment': { courseId: 'course_abc', slideIndex: 2, tool: 'pen', color: '#ef4444', width: 3, alpha: 1 },
    'annotation:stroke': {
        courseId: 'course_abc',
        slideIndex: 2,
        tool: 'pen',
        color: '#ef4444',
        width: 3,
        alpha: 1,
        points: [{ x: 0, y: 0 }, { x: 1, y: 1 }]
    },
    'annotation:clear': { courseId: 'course_abc', slideIndex: 2 }
};

const VIEWER_PAYLOADS = {
    'request-classroom-snapshot': undefined,
    'student-alert': { type: 'tab-hidden' },
    'student:screenshot': { dataUrl: 'data:image/jpeg;base64,AAAA', width: 320, height: 180, capturedAt: '2026-09-25T00:00:00.000Z' },
    'student:device-info': { mac: 'AA:BB:CC:DD:EE:FF', deviceName: 'STUDENT-01', clientId: 'student-1' },
    'student:power-control:client-ack': { requestId: 'power-1', action: 'shutdown', accepted: true, error: '' },
    'student-action': { type: 'slide-view', slide: 2 },
    'request-sync-state': { courseId: 'course_abc', slideIndex: 2 },
    'student:submit': {
        submissionId: 'sub-1',
        courseId: 'course_abc',
        clientIp: '192.0.2.10',
        content: '{"answer":1}',
        fileName: 'submission.txt',
        mergeFile: false
    },
    'vote:submit': { voteId: 'vote-1', optionId: 'a', courseId: 'course_abc', slideIndex: 2 },
    'annotation:get': { courseId: 'course_abc', slideIndex: 2 },
    'annotation-load': { courseId: 'course_abc', slideIndex: 2 }
};

test('教师页面/Core 在教师角色下发出的 payload 全部通过契约校验', () => {
    for (const [event, payload] of Object.entries(HOST_PAYLOADS)) {
        const result = authorizeEvent(ROLE_HOST, event, payload);
        assert.equal(result.ok, true, `${event} 被拒绝：${result.code} ${result.message || ''}`);
    }
});

test('学生页面与 Core 在学生角色下发出的 payload 全部通过契约校验', () => {
    for (const [event, payload] of Object.entries(VIEWER_PAYLOADS)) {
        const result = authorizeEvent(ROLE_VIEWER, event, payload);
        assert.equal(result.ok, true, `${event} 被拒绝：${result.code} ${result.message || ''}`);
    }
});

test('课件若只给出一个有效选项也允许开投票（不误伤既有课件）', () => {
    const result = authorizeEvent(ROLE_HOST, 'vote:start', {
        voteId: 'vote-single',
        question: '只有一个有效选项',
        options: [{ id: 'a', label: 'A' }]
    });
    assert.equal(result.ok, true, `被拒绝：${result.code} ${result.message || ''}`);
});

test('多目标电源控制（关机/重启）也通过校验', () => {
    for (const action of ['shutdown', 'restart', 'force-shutdown', 'force-restart']) {
        const result = authorizeEvent(ROLE_HOST, 'student:power-control', {
            requestId: `power-${action}`,
            action,
            targets: [{ ip: '192.0.2.10' }, { ip: '192.0.2.11' }]
        });
        assert.equal(result.ok, true, `${action} 被拒绝：${result.code}`);
    }
});

test('这些真实载荷不能被另一种角色发送', () => {
    const stolen = authorizeEvent(ROLE_VIEWER, 'select-course', { courseId: 'course_abc' });
    assert.equal(stolen.code, 'event_forbidden');
    const reverse = authorizeEvent(ROLE_HOST, 'student:submit', { submissionId: 'sub-1' });
    assert.equal(reverse.code, 'event_forbidden');
});
