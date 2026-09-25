// 依赖无关的最小 schema 校验器。
//
// 契约包同时被 Node 服务、教师页面和学生页面消费，因此这里不引入第三方校验库：
// schema 是普通对象，校验结果带规范化后的值，便于服务端直接使用。
//
// schema 节点形状：
//   { type: 'object', fields: {...}, required: [...], allowUnknown: bool, normalize: bool }
//   { type: 'array', items: schema, minItems, maxItems }
//   { type: 'string', minLength, maxLength, pattern, enum: [...], trim: bool }
//   { type: 'integer' | 'number', min, max, coerce: bool }
//   { type: 'boolean', coerce: bool }
//   { type: 'literal', value }
//   { type: 'any' }

const MAX_STRING_LENGTH = 4096;

function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function error(path, code, message) {
    return { path, code, message };
}

function validateString(value, schema, path, errors) {
    if (typeof value !== 'string') {
        errors.push(error(path, 'not_a_string', 'expected a string'));
        return undefined;
    }
    const normalized = schema.trim === false ? value : value.trim();
    if (schema.minLength !== undefined && normalized.length < schema.minLength) {
        errors.push(error(path, 'too_short', `expected at least ${schema.minLength} characters`));
        return undefined;
    }
    const maxLength = schema.maxLength === undefined ? MAX_STRING_LENGTH : schema.maxLength;
    if (normalized.length > maxLength) {
        errors.push(error(path, 'too_long', `expected at most ${maxLength} characters`));
        return undefined;
    }
    if (Array.isArray(schema.enum) && !schema.enum.includes(normalized)) {
        errors.push(error(path, 'not_in_enum', `expected one of: ${schema.enum.join(', ')}`));
        return undefined;
    }
    if (schema.pattern && !schema.pattern.test(normalized)) {
        errors.push(error(path, 'pattern_mismatch', 'value does not match the required pattern'));
        return undefined;
    }
    return normalized;
}

function validateNumberLike(value, schema, path, errors, integer) {
    let candidate = value;
    if (typeof candidate === 'string' && schema.coerce) {
        candidate = candidate.trim() === '' ? Number.NaN : Number(candidate);
    }
    if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
        errors.push(error(path, 'not_a_number', 'expected a finite number'));
        return undefined;
    }
    if (integer && !Number.isInteger(candidate)) {
        errors.push(error(path, 'not_an_integer', 'expected an integer'));
        return undefined;
    }
    if (schema.min !== undefined && candidate < schema.min) {
        errors.push(error(path, 'below_minimum', `expected a value >= ${schema.min}`));
        return undefined;
    }
    if (schema.max !== undefined && candidate > schema.max) {
        errors.push(error(path, 'above_maximum', `expected a value <= ${schema.max}`));
        return undefined;
    }
    return candidate;
}

function validateArray(value, schema, path, errors) {
    if (!Array.isArray(value)) {
        errors.push(error(path, 'not_an_array', 'expected an array'));
        return undefined;
    }
    if (schema.minItems !== undefined && value.length < schema.minItems) {
        errors.push(error(path, 'too_few_items', `expected at least ${schema.minItems} items`));
        return undefined;
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
        errors.push(error(path, 'too_many_items', `expected at most ${schema.maxItems} items`));
        return undefined;
    }
    if (!schema.items) return value.slice();
    const output = [];
    value.forEach((item, index) => {
        const normalized = validateValue(item, schema.items, `${path}[${index}]`, errors);
        if (normalized !== undefined) output.push(normalized);
    });
    return output;
}

function validateObject(value, schema, path, errors) {
    if (!isPlainObject(value)) {
        errors.push(error(path, 'not_an_object', 'expected an object'));
        return undefined;
    }
    const fields = schema.fields || {};
    const required = schema.required || [];
    const allowUnknown = schema.allowUnknown !== false;
    const output = {};

    for (const name of required) {
        if (value[name] === undefined || value[name] === null) {
            errors.push(error(`${path}.${name}`, 'missing_required_field', 'required field is missing'));
        }
    }

    for (const [name, fieldSchema] of Object.entries(fields)) {
        const raw = value[name];
        if (raw === undefined || raw === null) continue;
        const normalized = validateValue(raw, fieldSchema, `${path}.${name}`, errors);
        if (normalized !== undefined) output[name] = normalized;
    }

    // 默认保留未知字段（渐进迁移期间客户端会带旧字段）；显式 allowUnknown:false
    // 时按严格模式丢弃未声明字段。
    if (allowUnknown) {
        for (const [name, raw] of Object.entries(value)) {
            if (name in fields || raw === undefined) continue;
            output[name] = raw;
        }
    }

    return output;
}

function validateValue(value, schema, path, errors) {
    if (!schema || schema.type === 'any' || schema === true) return value;
    switch (schema.type) {
        case 'object':
            return validateObject(value, schema, path, errors);
        case 'array':
            return validateArray(value, schema, path, errors);
        case 'string':
            return validateString(value, schema, path, errors);
        case 'integer':
            return validateNumberLike(value, schema, path, errors, true);
        case 'number':
            return validateNumberLike(value, schema, path, errors, false);
        case 'boolean': {
            if (typeof value === 'boolean') return value;
            if (schema.coerce && (value === 'true' || value === 'false')) return value === 'true';
            errors.push(error(path, 'not_a_boolean', 'expected a boolean'));
            return undefined;
        }
        case 'literal':
            if (value !== schema.value) {
                errors.push(error(path, 'unexpected_literal', `expected ${JSON.stringify(schema.value)}`));
                return undefined;
            }
            return value;
        default:
            errors.push(error(path, 'unknown_schema_type', `unsupported schema type: ${String(schema.type)}`));
            return undefined;
    }
}

/**
 * 校验一个 payload。
 * @returns {{ok: boolean, value?: any, errors: Array<{path: string, code: string, message: string}>}}
 */
function validate(value, schema, path = 'payload') {
    const errors = [];
    const normalized = validateValue(value, schema, path, errors);
    if (errors.length > 0) return { ok: false, errors };
    return { ok: true, value: normalized, errors };
}

/** 只判断是否通过，不返回规范化结果。 */
function check(value, schema, path = 'payload') {
    return validate(value, schema, path).ok;
}

/** 把错误列表压成一行，便于日志与回执。 */
function formatErrors(errors) {
    return (errors || []).map((item) => `${item.path}: ${item.message}`).join('; ');
}

module.exports = {
    MAX_STRING_LENGTH,
    validate,
    check,
    formatErrors
};
