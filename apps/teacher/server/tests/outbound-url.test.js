const test = require('node:test');
const assert = require('node:assert/strict');
const { isPublicIpv4, resolvePublicHttpUrl } = require('../src/outbound-url');

test('image proxy rejects local addresses, credentials and nonstandard ports', async () => {
    assert.equal(isPublicIpv4('127.0.0.1'), false);
    assert.equal(isPublicIpv4('192.168.1.1'), false);
    assert.equal(isPublicIpv4('8.8.8.8'), true);
    assert.equal(await resolvePublicHttpUrl('http://127.0.0.1/private'), null);
    assert.equal(await resolvePublicHttpUrl('http://user:pass@example.com/x'), null);
    assert.equal(await resolvePublicHttpUrl('http://example.com:8080/x'), null);
    assert.equal(await resolvePublicHttpUrl('file:///etc/passwd'), null);
});

test('DNS is checked before a public image URL is requested', async () => {
    const privateTarget = await resolvePublicHttpUrl('https://images.example.com/a.jpg', async () => ({ address: '10.0.0.7' }));
    const publicTarget = await resolvePublicHttpUrl('https://images.example.com/a.jpg', async () => ({ address: '8.8.8.8' }));
    assert.equal(privateTarget, null);
    assert.equal(publicTarget.address, '8.8.8.8');
});
