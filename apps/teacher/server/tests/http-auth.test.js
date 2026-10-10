const test = require('node:test');
const assert = require('node:assert/strict');
const { isHostToken, requiresHostForApi, requireHost } = require('../src/http-auth');

test('host token comparison rejects missing and incorrect values', () => {
    assert.equal(isHostToken('', 'secret'), false);
    assert.equal(isHostToken('wrong', 'secret'), false);
    assert.equal(isHostToken('secret', 'secret'), true);
});

test('course reads stay public while management and submissions require host', () => {
    assert.equal(requiresHostForApi({ method: 'GET', path: '/courses' }), false);
    assert.equal(requiresHostForApi({ method: 'DELETE', path: '/delete-course' }), true);
    assert.equal(requiresHostForApi({ method: 'GET', path: '/submissions/lesson' }), true);
    assert.equal(requiresHostForApi({ method: 'POST', path: '/save-submission' }), true);
});

test('HTTP host middleware rejects missing bearer token', () => {
    let status;
    let body;
    requireHost({ get: () => '' }, {
        status(code) { status = code; return this; },
        json(value) { body = value; }
    }, () => assert.fail('must not continue'));
    assert.equal(status, 403);
    assert.equal(body.error, 'host_authorization_required');
});
