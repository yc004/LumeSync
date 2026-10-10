// 课堂命令的应用层：Hub 是唯一写入者。
//
// classroom:command（中继）与直接模式的旧事件名（select-course / sync-slide /
// update-settings / end-course）都收敛到这里，保证两种模式的状态迁移与广播完全一致。
// 命令类型取自契约的 CLASSROOM_COMMAND_TYPES，设置字段取自契约的 HOST_SETTINGS_FIELDS。

const { ERROR_CODES, CLASSROOM_COMMAND_TYPES, HOST_SETTINGS_FIELDS } = require('@lumesync/classroom-protocol');

const SETTINGS_KEYS = Object.keys(HOST_SETTINGS_FIELDS);

function ok(extra = {}) {
    return { ok: true, code: null, message: null, ...extra };
}

function fail(code, message) {
    return { ok: false, code, message, revision: null, events: [] };
}

function pickSettings(payload) {
    if (!payload || typeof payload !== 'object') return {};
    const picked = {};
    for (const key of SETTINGS_KEYS) {
        if (payload[key] !== undefined) picked[key] = payload[key];
    }
    return picked;
}

function createClassroomController({ classroom, logger }) {
    /**
     * 应用一条类型化课堂命令。
     * @returns {{ok: boolean, code: string|null, message: string|null, revision: number|null, events: Array<{event: string, payload: object, audience: string}>}}
     */
    function apply({ type, payload = {} }) {
        if (!CLASSROOM_COMMAND_TYPES.includes(type)) {
            return fail(ERROR_CODES.REQUEST_INVALID, `不支持的课堂命令类型：${String(type)}`);
        }
        const data = payload && typeof payload === 'object' ? payload : {};

        switch (type) {
            case 'course:select': {
                const courseId = String(data.courseId || '').trim();
                if (!courseId) return fail(ERROR_CODES.REQUEST_INVALID, 'course:select 需要 courseId');
                const revision = classroom.changeCourse(courseId);
                logger && logger.info(`[classroom] course:select ${courseId} revision=${revision}`);
                return ok({
                    revision,
                    events: [{
                        event: 'course-changed',
                        audience: 'all',
                        payload: {
                            courseId,
                            slideIndex: 0,
                            hostSettings: classroom.getHostSettings(),
                            revision
                        }
                    }]
                });
            }
            case 'slide:set': {
                const slideIndex = Number(data.slideIndex);
                if (!Number.isInteger(slideIndex) || slideIndex < 0) {
                    return fail(ERROR_CODES.REQUEST_INVALID, 'slide:set 需要非负整数 slideIndex');
                }
                const revision = classroom.changeSlide(slideIndex);
                return ok({
                    revision,
                    events: [{ event: 'sync-slide', audience: 'viewers', payload: { slideIndex, revision } }]
                });
            }
            case 'settings:update': {
                const patch = pickSettings(data);
                const revision = classroom.updateSettings(patch);
                return ok({
                    revision,
                    events: [{
                        event: 'host-settings',
                        audience: 'all',
                        payload: { ...classroom.getHostSettings(), revision }
                    }]
                });
            }
            case 'annotation:clear': {
                const courseId = String(data.courseId || classroom.getCourseId() || '');
                const slideIndex = Number.isInteger(Number(data.slideIndex)) ? Number(data.slideIndex) : classroom.getSlideIndex();
                return ok({
                    revision: classroom.getRevision(),
                    events: [{ event: 'annotation:clear', audience: 'viewers', payload: { courseId, slideIndex } }]
                });
            }
            case 'course:end': {
                const previousCourseId = classroom.getCourseId();
                const revision = classroom.endCourse();
                logger && logger.info(`[classroom] course:end previous=${previousCourseId || 'none'} revision=${revision}`);
                return ok({
                    revision,
                    events: [{
                        event: 'course-ended',
                        audience: 'all',
                        payload: { revision, hostSettings: classroom.getHostSettings() }
                    }]
                });
            }
            default:
                return fail(ERROR_CODES.REQUEST_INVALID, `不支持的课堂命令类型：${String(type)}`);
        }
    }

    return { apply };
}

module.exports = { createClassroomController, SETTINGS_KEYS };
