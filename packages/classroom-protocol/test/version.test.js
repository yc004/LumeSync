const test = require('node:test');
const assert = require('node:assert/strict');

const {
    PROTOCOL_VERSION,
    LEGACY_PROTOCOL_VERSION,
    negotiateProtocol,
    parseProtocolVersion,
    isServerVersionSupported
} = require('../index.js');

test('缺少版本字段按 legacy 客户端接受', () => {
    const result = negotiateProtocol(undefined);
    assert.equal(result.ok, true);
    assert.equal(result.legacy, true);
    assert.equal(result.clientVersion, LEGACY_PROTOCOL_VERSION);
    assert.equal(result.protocolVersion, PROTOCOL_VERSION);
});

test('字符串版本号按数字解析', () => {
    assert.deepEqual(parseProtocolVersion('1'), { present: true, version: 1, raw: '1' });
    assert.equal(negotiateProtocol('1').ok, true);
    assert.equal(negotiateProtocol('1').legacy, false);
});

test('非整数版本号被拒绝为 protocol_version_invalid', () => {
    const result = negotiateProtocol('1.x');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'protocol_version_invalid');
});

test('高于服务端版本被拒绝为 protocol_version_unsupported', () => {
    const result = negotiateProtocol(PROTOCOL_VERSION + 1);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'protocol_version_unsupported');
    assert.equal(result.protocolVersion, PROTOCOL_VERSION);
});

test('负版本号被拒绝', () => {
    assert.equal(negotiateProtocol(-1).ok, false);
    assert.equal(negotiateProtocol(-1).code, 'protocol_version_invalid');
});

test('客户端可判断服务端版本是否可用', () => {
    assert.equal(isServerVersionSupported(PROTOCOL_VERSION), true);
    assert.equal(isServerVersionSupported(PROTOCOL_VERSION + 1), false);
    assert.equal(isServerVersionSupported('nope'), false);
});
