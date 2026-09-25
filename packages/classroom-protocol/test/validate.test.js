const test = require('node:test');
const assert = require('node:assert/strict');

const {
    MAX_STRING_LENGTH,
    validate,
    check,
    formatErrors
} = require('../index.js');

test('必填字段缺失时给出字段路径', () => {
    const result = validate({}, { type: 'object', required: ['courseId'], fields: { courseId: { type: 'string' } } });
    assert.equal(result.ok, false);
    assert.equal(result.errors[0].path, 'payload.courseId');
    assert.match(formatErrors(result.errors), /required field/);
});

test('字符串裁剪空白并限制枚举', () => {
    const ok = validate({ role: ' host ' }, { type: 'object', fields: { role: { type: 'string', enum: ['host', 'viewer'] } } });
    assert.equal(ok.ok, true);
    assert.equal(ok.value.role, 'host');

    const bad = validate({ role: 'admin' }, { type: 'object', fields: { role: { type: 'string', enum: ['host', 'viewer'] } } });
    assert.equal(bad.ok, false);
    assert.equal(bad.errors[0].code, 'not_in_enum');
});

test('超长字符串按默认上限拒绝', () => {
    const value = 'x'.repeat(MAX_STRING_LENGTH + 1);
    assert.equal(check({ name: value }, { type: 'object', fields: { name: { type: 'string' } } }), false);
});

test('整数允许显式 coerce，小数被拒绝', () => {
    const schema = { type: 'object', fields: { index: { type: 'integer', min: 0, coerce: true } } };
    assert.deepEqual(validate({ index: '3' }, schema).value, { index: 3 });
    assert.equal(validate({ index: 1.5 }, schema).ok, false);
    assert.equal(validate({ index: -1 }, schema).ok, false);
});

test('数组按 maxItems 与逐项 schema 校验', () => {
    const schema = {
        type: 'array',
        maxItems: 2,
        items: { type: 'object', required: ['id'], fields: { id: { type: 'string', minLength: 1 } } }
    };
    assert.equal(validate([{ id: 'a' }], schema).ok, true);
    assert.equal(validate([{ id: 'a' }, { id: 'b' }, { id: 'c' }], schema).ok, false);
    assert.match(formatErrors(validate([{}], schema).errors), /payload\[0\]\.id/);
});

test('未知字段默认保留，便于渐进迁移', () => {
    const result = validate({ courseId: 'c1', legacyFlag: true }, { type: 'object', fields: { courseId: { type: 'string' } } });
    assert.equal(result.ok, true);
    assert.equal(result.value.legacyFlag, true);
});

test('allowUnknown:false 时丢弃未声明字段', () => {
    const result = validate(
        { courseId: 'c1', legacyFlag: true },
        { type: 'object', allowUnknown: false, fields: { courseId: { type: 'string' } } }
    );
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, { courseId: 'c1' });
});
