const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('teacher credential is sent only to same-origin API requests', async () => {
    const calls = [];
    const window = {
        location: { href: 'http://127.0.0.1:3000/', origin: 'http://127.0.0.1:3000' },
        teacherHost: { getSession: async () => ({ token: 'host-secret' }) },
        fetch: async (url, init) => { calls.push({ url, init }); return { ok: true }; }
    };
    const source = fs.readFileSync(path.join(__dirname, '../../ui/src/api-fetch.ts'), 'utf8');
    vm.runInNewContext(source, { window, URL, Headers, Request });

    await window.__LumeSyncApiFetch('/api/submissions/lesson');
    await window.__LumeSyncApiFetch('https://example.org/asset');

    assert.equal(calls[0].init.headers.get('Authorization'), 'Bearer host-secret');
    assert.equal(new Headers(calls[1].init?.headers).has('Authorization'), false);
});
