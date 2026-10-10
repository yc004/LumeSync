const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveCourseDirectory, resolveExistingFile, safeDirectoryName } = require('../src/safe-path');

test('submission paths stay below their course directory, including symlinks', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lumesync-path-'));
    try {
        const course = resolveCourseDirectory(root, 'bGVzc29u');
        fs.mkdirSync(path.join(course, 'class-a'), { recursive: true });
        fs.writeFileSync(path.join(course, 'class-a', 'answer.txt'), 'ok');
        fs.writeFileSync(path.join(root, 'outside.txt'), 'private');
        fs.symlinkSync(path.join(root, 'outside.txt'), path.join(course, 'outside-link'));

        assert.equal(resolveCourseDirectory(root, '../escape'), null);
        assert.equal(resolveExistingFile(course, 'class-a/answer.txt'), fs.realpathSync(path.join(course, 'class-a', 'answer.txt')));
        assert.equal(resolveExistingFile(course, '../outside.txt'), null);
        assert.equal(resolveExistingFile(course, 'outside-link'), null);
        assert.equal(safeDirectoryName('../class/b'), '_class_b');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
