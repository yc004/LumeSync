const test = require('node:test');
const assert = require('node:assert/strict');
const state = require('../src/classroom-state');

test('snapshot revision increases for course, slide and settings transitions', () => {
    const initial = state.snapshot({ syncFollow: true });
    assert.equal(initial.protocolVersion, 1);
    assert.ok(initial.sessionId);

    state.changeCourse('lesson-a');
    state.changeSlide(2);
    state.touch();

    const current = state.snapshot({ syncFollow: false });
    assert.equal(current.currentCourseId, 'lesson-a');
    assert.equal(current.currentSlideIndex, 2);
    assert.equal(current.revision, initial.revision + 3);
    assert.equal(current.hostSettings.syncFollow, false);
    assert.equal(state.changeSlide(-1), null);
    assert.equal(state.getRevision(), current.revision);
});
