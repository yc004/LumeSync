const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.LUMESYNC_HOST_TOKEN = `test-host-${crypto.randomBytes(24).toString('hex')}`;
process.env.LUMESYNC_VIEWER_TOKEN_SECRET = `test-viewer-${crypto.randomBytes(24).toString('hex')}`;

const { resolveConnectionIdentity } = require('../src/socket');
const { loadCoreModule } = require('../src/core-paths');
const { createViewerSessionToken } = loadCoreModule('identity');

function handshake(role, token, clientId, address = '127.0.0.1') {
    return { handshake: { address, auth: { role, token, clientId }, query: {} } };
}

test('a local connection without credentials never becomes host', () => {
    assert.equal(resolveConnectionIdentity(handshake('', '', '')).ok, false);
    assert.equal(resolveConnectionIdentity(handshake('host', 'wrong', 'teacher-1')).ok, false);
});

test('host requires the configured credential', () => {
    const result = resolveConnectionIdentity(handshake('host', process.env.LUMESYNC_HOST_TOKEN, 'teacher-1'));
    assert.equal(result.ok, true);
    assert.equal(result.role, 'host');
});

test('viewer credential is bound to clientId', () => {
    const token = createViewerSessionToken({
        clientId: 'student-1',
        secret: process.env.LUMESYNC_VIEWER_TOKEN_SECRET,
        ttlSec: 60
    });
    assert.equal(resolveConnectionIdentity(handshake('viewer', token, 'student-1', '192.0.2.10')).role, 'viewer');
    assert.equal(resolveConnectionIdentity(handshake('viewer', token, 'student-2', '192.0.2.10')).ok, false);
});
