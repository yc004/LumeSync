// 命令与事件名映射：把教师 UI 的动作翻译成两种模式各自可用的事件。
//
// 设计：teacher-cross-platform-relay.md §6 的协议表 + 契约事件表（packages/classroom-protocol）。
// 关键事实（与 apps/classroom-hub/src/socket.js 一致）：
//   - 中继模式：控制命令必须走 `classroom:command`，每条带 leaseId + epoch + requestId；
//   - 直接模式：Hub 的 `classroom:command` 也要租约，而直接模式不能获取租约
//     （teacher:lease.acquire → relay_disabled），因此直接模式必须用契约里已声明的
//     旧事件名（select-course / sync-slide / update-settings / end-course）。
//
// 两种模式在这里收敛成同一组"类型化命令"，本地状态更新与返回值一致。

const {
    INBOUND_EVENTS,
    CLASSROOM_COMMAND_TYPES,
    HOST_SETTINGS_FIELDS,
    ERROR_CODES
} = require('@lumesync/classroom-protocol');

const { SESSION_AGENT_ERROR_CODES, SessionAgentError } = require('./errors');

/**
 * 类型化命令 → 直接模式事件名与 payload 投影。
 * 注意：`annotation:clear` 没有对应的直接模式事件（Hub 的直接模式清单里没有它），
 * 直接模式调用会得到明确错误，而不是静默丢弃。
 */
const DIRECT_MODE_COMMAND_EVENTS = {
    'course:select': { event: 'select-course', payload: (data) => ({ courseId: data.courseId }) },
    'slide:set': { event: 'sync-slide', payload: (data) => ({ slideIndex: data.slideIndex }) },
    'settings:update': { event: 'update-settings', payload: (data) => ({ ...data }) },
    'course:end': { event: 'end-course', payload: () => ({}) }
};

/** 本地已在专门处理器里消费、不能再当"学生事件"转发的事件。 */
const LOCALLY_HANDLED_EVENTS = new Set([
    'student:submit',
    'session:hello',
    'request-classroom-snapshot'
]);

/**
 * 需要监听并转发给教师界面的学生事件名。
 *
 * 清单从契约的入站事件表生成（scope=classroom 且角色含 viewer 或 any，减去本地专门处理的三个），
 * 与 Hub 的通用转发清单（VIEWER_FORWARD_EVENTS）同源；测试会断言两者完全一致，
 * 契约新增 viewer 事件而 Hub 或本代理忘记接时测试失败。
 */
function listStudentEventNames() {
    return Object.entries(INBOUND_EVENTS)
        .filter(([, entry]) => (entry.scope || 'classroom') === 'classroom')
        .filter(([, entry]) => entry.roles.includes('viewer') || entry.roles.includes('any'))
        .map(([name]) => name)
        .filter((name) => !LOCALLY_HANDLED_EVENTS.has(name));
}

function isClassroomCommandType(type) {
    return CLASSROOM_COMMAND_TYPES.includes(type);
}

/** 校验一条类型化命令的本地前置条件；返回 {type, payload}。 */
function normalizeCommand(type, payload) {
    const name = String(type || '').trim();
    if (!isClassroomCommandType(name)) {
        throw new SessionAgentError(
            ERROR_CODES.REQUEST_INVALID,
            `不支持的课堂命令类型：${name || '(empty)'}（契约允许：${CLASSROOM_COMMAND_TYPES.join(' / ')}）`
        );
    }
    const data = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
    if (name === 'course:select' && !String(data.courseId || '').trim()) {
        throw new SessionAgentError(ERROR_CODES.REQUEST_INVALID, 'course:select 需要 courseId');
    }
    if (name === 'slide:set') {
        const index = Number(data.slideIndex);
        if (!Number.isInteger(index) || index < 0) {
            throw new SessionAgentError(ERROR_CODES.REQUEST_INVALID, 'slide:set 需要非负整数 slideIndex');
        }
    }
    if (name === 'settings:update') {
        const keys = Object.keys(HOST_SETTINGS_FIELDS);
        const unknown = Object.keys(data).filter((key) => !keys.includes(key));
        const picked = {};
        for (const key of keys) {
            if (data[key] !== undefined) picked[key] = data[key];
        }
        if (Object.keys(picked).length === 0) {
            throw new SessionAgentError(
                ERROR_CODES.REQUEST_INVALID,
                `settings:update 需要至少一个课堂设置字段（可用字段：${keys.join(', ')}）`
            );
        }
        return { type: name, payload: picked, ignoredFields: unknown };
    }
    return { type: name, payload: data };
}

/** 直接模式的映射；中继模式不能使用。 */
function toDirectModeEvent(type, payload) {
    const mapping = DIRECT_MODE_COMMAND_EVENTS[type];
    if (!mapping) {
        throw new SessionAgentError(
            SESSION_AGENT_ERROR_CODES.MODE_UNSUPPORTED,
            `直接模式的 Hub 没有 ${type} 的对应事件（教室 Hub 的直接模式只接受 select-course / sync-slide / update-settings / end-course）`
        );
    }
    return { event: mapping.event, payload: mapping.payload(payload) };
}

/**
 * 命令成功后按类型更新本地快照字段（快照广播仍是权威值，这里保证即使广播延迟，
 * 本地状态也与刚提交的命令一致）。
 */
function applyCommandLocally(state, type, payload) {
    switch (type) {
        case 'course:select':
            state.courseId = String(payload.courseId);
            state.slideIndex = 0;
            break;
        case 'slide:set':
            state.slideIndex = Number(payload.slideIndex);
            break;
        case 'settings:update':
            state.hostSettings = { ...state.hostSettings, ...payload };
            break;
        case 'course:end':
            state.courseId = null;
            state.slideIndex = 0;
            if (state.hostSettings) state.hostSettings = { ...state.hostSettings, monitorEnabled: false };
            break;
        default:
            break;
    }
}

module.exports = {
    DIRECT_MODE_COMMAND_EVENTS,
    LOCALLY_HANDLED_EVENTS,
    listStudentEventNames,
    isClassroomCommandType,
    normalizeCommand,
    toDirectModeEvent,
    applyCommandLocally
};
