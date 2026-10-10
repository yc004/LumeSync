const crypto = require('crypto');
const { createClassroomSnapshot } = require('@lumesync/classroom-protocol');

// One authority for the current course and slide. A new sessionId distinguishes
// revisions after a process restart; legacy clients can ignore the extra fields.
const state = {
    sessionId: crypto.randomUUID(),
    revision: 0,
    courseId: null,
    slideIndex: 0
};

// 快照结构由共享契约构造，保证教师服务与客户端对字段的理解一致。
function snapshot(settings) {
    return createClassroomSnapshot({
        sessionId: state.sessionId,
        revision: state.revision,
        courseId: state.courseId,
        slideIndex: state.slideIndex,
        hostSettings: settings || {}
    });
}

function changeCourse(courseId) {
    state.courseId = courseId || null;
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

function touch() {
    state.revision += 1;
    return state.revision;
}

function getCourseId() { return state.courseId; }
function getSlideIndex() { return state.slideIndex; }
function getRevision() { return state.revision; }

module.exports = { snapshot, changeCourse, changeSlide, touch, getCourseId, getSlideIndex, getRevision };
