const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createSessionToken,
    verifySessionToken,
    DEFAULT_TTL_SEC,
    MAX_TTL_SEC,
    ROLE_HOST,
    ROLE_VIEWER,
    ERROR_CODES
} = require('../index.js');

const T0 = 1_800_000_000_000;
const SECRET = 'test-secret-0123456789abcdef';

test('签发的凭证可校验，并带回角色、设备与有效期', async () => {
    const issued = await createSessionToken({ secret: SECRET, clientId: 'student-1', role: ROLE_VIEWER, now: T0 });
    assert.match(issued.token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.equal(issued.ttlSec, DEFAULT_TTL_SEC);

    const verified = await verifySessionToken(issued.token, { secret: SECRET, now: T0 + 1000 });
    assert.equal(verified.ok, true);
    assert.equal(verified.payload.clientId, 'student-1');
    assert.equal(verified.payload.role, ROLE_VIEWER);
    assert.equal(verified.payload.leaseId, null);
});

test('凭证绑定设备身份与角色，不能跨用', async () => {
    const issued = await createSessionToken({ secret: SECRET, clientId: 'student-1', role: ROLE_VIEWER, now: T0 });

    const wrongClient = await verifySessionToken(issued.token, { secret: SECRET, clientId: 'student-2', now: T0 });
    assert.equal(wrongClient.ok, false);
    assert.equal(wrongClient.code, ERROR_CODES.VIEWER_AUTH_FAILED);

    const wrongRole = await verifySessionToken(issued.token, { secret: SECRET, role: ROLE_HOST, now: T0 });
    assert.equal(wrongRole.ok, false);
});

test('篡改内容或换密钥都会被拒绝', async () => {
    const issued = await createSessionToken({ secret: SECRET, clientId: 'student-1', role: ROLE_VIEWER, now: T0 });
    const [payload, signature] = issued.token.split('.');

    const tampered = `${payload}.${signature.slice(0, -2)}xx`;
    assert.equal((await verifySessionToken(tampered, { secret: SECRET, now: T0 })).ok, false);
    assert.equal((await verifySessionToken(issued.token, { secret: 'other-secret', now: T0 })).ok, false);
    assert.equal((await verifySessionToken('not-a-token', { secret: SECRET, now: T0 })).ok, false);
    assert.equal((await verifySessionToken(issued.token, { secret: '', now: T0 })).ok, false);
});

test('过期凭证被拒绝，TTL 有上限', async () => {
    const issued = await createSessionToken({ secret: SECRET, clientId: 'student-1', role: ROLE_VIEWER, ttlSec: 60, now: T0 });
    assert.equal((await verifySessionToken(issued.token, { secret: SECRET, now: T0 + 59_000 })).ok, true);
    const expired = await verifySessionToken(issued.token, { secret: SECRET, now: T0 + 61_000 });
    assert.equal(expired.ok, false);
    assert.match(expired.message, /过期/);

    const longLived = await createSessionToken({ secret: SECRET, clientId: 'student-1', role: ROLE_VIEWER, ttlSec: MAX_TTL_SEC * 10, now: T0 });
    assert.equal(longLived.ttlSec, MAX_TTL_SEC);
});

test('中继模式可把凭证绑定到教室与租约', async () => {
    const issued = await createSessionToken({
        secret: SECRET,
        clientId: 'teacher-laptop',
        role: ROLE_HOST,
        classroomId: 'room-101',
        leaseId: 'lease-1-abcdefgh',
        now: T0
    });
    const verified = await verifySessionToken(issued.token, { secret: SECRET, now: T0 });
    assert.equal(verified.payload.classroomId, 'room-101');
    assert.equal(verified.payload.leaseId, 'lease-1-abcdefgh');
});

test('非法入参直接抛错，不签发半成品凭证', async () => {
    await assert.rejects(() => createSessionToken({ secret: '', clientId: 'x', role: ROLE_VIEWER }));
    await assert.rejects(() => createSessionToken({ secret: SECRET, clientId: '', role: ROLE_VIEWER }));
    await assert.rejects(() => createSessionToken({ secret: SECRET, clientId: 'x', role: 'admin' }));
});
