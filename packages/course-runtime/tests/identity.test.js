const assert = require('assert');
const test = require('node:test');

const {
  createViewerSessionToken,
  normalizeIp,
  verifyViewerSessionToken,
} = require('../dist/cjs/node/identity.js');

test('normalizes IPv4-mapped IPv6 addresses', () => {
  assert.strictEqual(normalizeIp('::ffff:192.168.0.2'), '192.168.0.2');
  assert.strictEqual(normalizeIp('127.0.0.1'), '127.0.0.1');
});

test('creates and verifies viewer session tokens', () => {
  const token = createViewerSessionToken({ clientId: 'student-1', secret: 'secret', ttlSec: 60 });
  const result = verifyViewerSessionToken(token, 'secret');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.payload.sub, 'student-1');
  assert.strictEqual(result.payload.role, 'viewer');
});

test('rejects invalid signatures', () => {
  const token = createViewerSessionToken({ clientId: 'student-1', secret: 'secret', ttlSec: 60 });
  assert.deepStrictEqual(verifyViewerSessionToken(token, 'other-secret'), {
    ok: false,
    code: 'token_signature_invalid',
  });
});

test('rejects expired tokens', () => {
  const originalNow = Date.now;
  try {
    Date.now = () => 1_700_000_000_000;
    const token = createViewerSessionToken({ clientId: 'student-1', secret: 'secret', ttlSec: 30 });
    Date.now = () => 1_700_000_031_000;
    assert.deepStrictEqual(verifyViewerSessionToken(token, 'secret'), {
      ok: false,
      code: 'token_expired',
    });
  } finally {
    Date.now = originalNow;
  }
});
