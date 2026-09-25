const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const {
    BRIDGE_PROTOCOL_VERSION,
    MESSAGE_KINDS,
    createRpcRequest,
    createEventMessage,
    createRpcResult,
    validateBridgeRequest,
    validateRpcResult,
    isRpcResult,
    isWindowStateMessage,
    payloadByteLength
} = require('../index.js');

test('RPC 请求带 id、action、payload 与协议版本', () => {
    const request = createRpcRequest({ action: 'getConfig' });
    assert.equal(request.kind, MESSAGE_KINDS.RPC);
    assert.equal(request.action, 'getConfig');
    assert.equal(request.version, BRIDGE_PROTOCOL_VERSION);
    assert.match(request.id, /^rpc-/);
    assert.deepEqual(request.payload, {});
});

test('事件消息不需要 id', () => {
    const event = createEventMessage({ action: 'classStarted', payload: { forceFullscreen: true } });
    assert.equal(event.kind, MESSAGE_KINDS.EVENT);
    assert.equal(validateBridgeRequest(event).ok, true);
});

test('RPC 消息缺少 id 时校验失败', () => {
    const result = validateBridgeRequest({ kind: 'rpc', action: 'getConfig', payload: {} });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'bridge_message_invalid');
    assert.match(result.errors[0].path, /message\.id/);
});

test('未声明的 kind 被拒绝', () => {
    const result = validateBridgeRequest({ kind: 'command', action: 'getConfig' });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'bridge_message_invalid');
});

test('高于原生壳支持的版本被明确拒绝', () => {
    const request = createRpcRequest({ action: 'getConfig', version: BRIDGE_PROTOCOL_VERSION + 1 });
    const result = validateBridgeRequest(request);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'bridge_version_unsupported');
});

test('payload 超过上限被拒绝', () => {
    const request = createRpcRequest({ action: 'saveConfig', payload: { blob: 'x'.repeat(2048) } });
    const result = validateBridgeRequest(request, { maxPayloadBytes: 512 });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'bridge_payload_too_large');
    assert.ok(payloadByteLength(request.payload) > 512);
});

test('action 名称超长被拒绝', () => {
    const result = validateBridgeRequest({ kind: 'event', action: 'a'.repeat(200) });
    assert.equal(result.ok, false);
});

test('回执校验要求 id，并区分成功与失败', () => {
    const ok = createRpcResult({ id: 'rpc-1', ok: true, payload: { port: 3000 } });
    assert.equal(validateRpcResult(ok).ok, true);
    assert.equal(isRpcResult(ok), true);

    const failed = createRpcResult({ id: 'rpc-2', ok: false, error: 'native action failed' });
    const validated = validateRpcResult(failed);
    assert.equal(validated.ok, true);
    assert.equal(validated.value.ok, false);
    assert.equal(validated.value.error, 'native action failed');

    assert.equal(validateRpcResult({ kind: 'rpc-result', ok: true }).ok, false);
});

test('窗口状态消息有独立类型并可与回执区分', () => {
    assert.equal(isWindowStateMessage({ kind: 'window-maximized' }), true);
    assert.equal(isWindowStateMessage({ kind: 'window-unmaximized' }), true);
    assert.equal(isWindowStateMessage(createRpcResult({ id: 'rpc-3' })), false);
    assert.equal(isRpcResult({ kind: 'window-maximized' }), false);
});

test('payload 长度计算不依赖 Node Buffer（浏览器也可用）', () => {
    // 在子进程里删掉 Buffer，模拟浏览器环境；契约包必须仍然可用。
    const entry = path.join(__dirname, '..', 'index.js');
    const script = `delete globalThis.Buffer; const { payloadByteLength } = require(${JSON.stringify(entry)}); process.stdout.write(String(payloadByteLength({ a: '中文' })));`;
    const output = execFileSync(process.execPath, ['-e', script]).toString();
    assert.equal(Number(output), Buffer.byteLength(JSON.stringify({ a: '中文' }), 'utf8'));
});

test('ESM 与 CJS 入口导出一致', async () => {
    const esm = await import('../index.mjs');
    const cjs = require('../index.js');
    assert.deepEqual(
        Object.keys(esm).filter((name) => name !== 'default').sort(),
        Object.keys(cjs).sort()
    );
});
