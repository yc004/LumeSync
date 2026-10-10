const assert = require('assert');
const http = require('http');
const test = require('node:test');
const { Server } = require('socket.io');
const { io: createClient } = require('socket.io-client');

const { createViewerSessionToken } = require('../dist/cjs/node/identity.js');
const { setupSocketHandlers } = require('../dist/cjs/node/runtime-control.js');

function once(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}

async function createRuntime() {
  const server = http.createServer();
  const io = new Server(server);
  setupSocketHandlers(io, {
    hostToken: 'host-token',
    viewerTokenSecret: 'viewer-secret',
    identityLegacyCompat: false,
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}`;

  return {
    url,
    async close() {
      await io.close();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

test('routes host and viewer events', async () => {
  const runtime = await createRuntime();
  const viewerToken = createViewerSessionToken({ clientId: 'viewer-1', secret: 'viewer-secret', ttlSec: 60 });
  const host = createClient(runtime.url, { reconnection: false, auth: { role: 'host', clientId: 'host-1', token: 'host-token' } });
  const viewer = createClient(runtime.url, { reconnection: false, auth: { role: 'viewer', clientId: 'viewer-1', token: viewerToken } });

  try {
    const [hostIdentity, viewerIdentity] = await Promise.all([once(host, 'role-assigned'), once(viewer, 'role-assigned')]);
    assert.strictEqual(hostIdentity.role, 'host');
    assert.strictEqual(viewerIdentity.role, 'viewer');

    const hostReceived = once(host, 'viewer-event');
    viewer.emit('viewer-event', { value: 1 });
    assert.deepStrictEqual(await hostReceived, { value: 1 });

    const viewerReceived = once(viewer, 'host-event');
    host.emit('host-event', { value: 2 });
    assert.deepStrictEqual(await viewerReceived, { value: 2 });
  } finally {
    host.close();
    viewer.close();
    await runtime.close();
  }
});

test('rejects invalid viewer tokens', async () => {
  const runtime = await createRuntime();
  const viewer = createClient(runtime.url, {
    reconnection: false,
    auth: { role: 'viewer', clientId: 'viewer-1', token: 'bad-token' },
  });

  try {
    const rejection = await once(viewer, 'identity-rejected');
    assert.strictEqual(rejection.code, 'token_format_invalid');
  } finally {
    viewer.close();
    await runtime.close();
  }
});
