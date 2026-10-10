// 课堂状态：Hub 是唯一写入者。
//
// 与 apps/teacher/server/src/classroom-state.js 相同的语义：会话标识 + 单调递增
// revision + 当前课程/页码/设置。快照结构由共享契约构造，客户端不自行拼装。

const { createClassroomSnapshot } = require('@lumesync/classroom-protocol');
const { randomHex } = require('./utils');

const DEFAULT_HOST_SETTINGS = {
    forceFullscreen: false,
    syncFollow: true,
    syncInteraction: false,
    allowInteract: true,
    podiumAtTop: true,
    renderScale: 0.96,
    uiScale: 1.0,
    alertJoin: true,
    alertLeave: true,
    alertFullscreenExit: true,
    alertTabHidden: true,
    monitorEnabled: false,
    monitorIntervalSec: 1
};

/** 与学生端/教师端历史行为一致的取值归一（0.5 秒粒度，限制在 0.5~5 秒）。 */
function normalizeMonitorIntervalSec(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 1;
    const clamped = Math.min(5, Math.max(0.5, numeric));
    return Math.round(clamped * 2) / 2;
}

function normalizeHostSettingsPatch(patch) {
    if (!patch || typeof patch !== 'object') return {};
    const next = { ...patch };
    if (Object.prototype.hasOwnProperty.call(next, 'monitorIntervalSec')) {
        next.monitorIntervalSec = normalizeMonitorIntervalSec(next.monitorIntervalSec);
    }
    return next;
}

/**
 * @param {object} [options]
 * @param {string} [options.sessionId] 进程重启后可注入相同的会话标识（当前不做持久化）
 */
function createClassroom({ sessionId = randomHex(16) } = {}) {
    const state = {
        sessionId: String(sessionId),
        revision: 0,
        courseId: null,
        slideIndex: 0,
        hostSettings: { ...DEFAULT_HOST_SETTINGS }
    };

    function snapshot() {
        return createClassroomSnapshot({
            sessionId: state.sessionId,
            revision: state.revision,
            courseId: state.courseId,
            slideIndex: state.slideIndex,
            hostSettings: state.hostSettings
        });
    }

    function changeCourse(courseId) {
        state.courseId = courseId ? String(courseId) : null;
        state.slideIndex = 0;
        state.revision += 1;
        return state.revision;
    }

    function changeSlide(index) {
        const next = Number(index);
        if (!Number.isInteger(next) || next < 0) return null;
        state.slideIndex = next;
        state.revision += 1;
        return state.revision;
    }

    function updateSettings(patch) {
        state.hostSettings = { ...state.hostSettings, ...normalizeHostSettingsPatch(patch) };
        state.revision += 1;
        return state.revision;
    }

    /** 结束课堂：清空课程、页码与监看开关，保留教师的其他设置。 */
    function endCourse() {
        state.courseId = null;
        state.slideIndex = 0;
        state.hostSettings = { ...state.hostSettings, monitorEnabled: false };
        state.revision += 1;
        return state.revision;
    }

    function touch() {
        state.revision += 1;
        return state.revision;
    }

    return {
        snapshot,
        changeCourse,
        changeSlide,
        updateSettings,
        endCourse,
        touch,
        getSessionId: () => state.sessionId,
        getCourseId: () => state.courseId,
        getSlideIndex: () => state.slideIndex,
        getRevision: () => state.revision,
        getHostSettings: () => ({ ...state.hostSettings })
    };
}

module.exports = { createClassroom, DEFAULT_HOST_SETTINGS, normalizeMonitorIntervalSec };
