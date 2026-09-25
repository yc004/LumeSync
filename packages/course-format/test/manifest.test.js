const test = require('node:test');
const assert = require('node:assert/strict');

const {
    SCHEMA_VERSION,
    validateManifest,
    normalizeManifest,
    createManifest,
    isSafeRelativePath,
    LIMITS
} = require('../index.js');

function baseManifest(overrides = {}) {
    return {
        schemaVersion: SCHEMA_VERSION,
        id: 'lesson',
        title: '示例课',
        runtime: { format: 'lumesync-zip', entryMode: 'pages', slideModule: 'tsx', react: '18' },
        pages: [{ id: 'intro', file: 'slides/Intro.tsx', title: '第一页' }],
        assets: { 'assets/figure.svg': { type: 'image/svg+xml' } },
        ...overrides
    };
}

test('合法 manifest 通过校验', () => {
    const result = validateManifest(baseManifest(), { entryNames: ['manifest.json', 'slides/Intro.tsx', 'assets/figure.svg'] });
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
});

test('缺少 runtime.format 或不匹配时失败', () => {
    const missing = validateManifest(baseManifest({ runtime: { entryMode: 'pages' } }));
    assert.equal(missing.ok, false);
    assert.match(missing.errors.map((item) => item.code).join(','), /manifest_runtime_format_unsupported/);

    const wrong = validateManifest(baseManifest({ runtime: { format: 'lumesync-text', entryMode: 'pages' } }));
    assert.equal(wrong.ok, false);
});

test('entryMode 非法与 pages 为空都失败', () => {
    const badMode = validateManifest(baseManifest({ runtime: { format: 'lumesync-zip', entryMode: 'mystery' } }));
    assert.equal(badMode.ok, false);
    assert.match(badMode.errors.map((item) => item.code).join(','), /manifest_entry_mode_unsupported/);

    const emptyPages = validateManifest(baseManifest({ pages: [] }));
    assert.equal(emptyPages.ok, false);
    assert.match(emptyPages.errors.map((item) => item.code).join(','), /manifest_pages_missing/);
});

test('页面引用的文件必须存在于包内', () => {
    const result = validateManifest(baseManifest(), { entryNames: ['manifest.json'] });
    assert.equal(result.ok, false);
    assert.equal(result.errors[0].code, 'page_file_not_found');
});

test('页面路径不允许绝对路径与越界片段', () => {
    for (const file of ['/etc/passwd', '../secret.tsx', 'slides/../../x.tsx', 'C:/x.tsx', 'slides\\x.tsx']) {
        const result = validateManifest(baseManifest({ pages: [{ id: 'p', file }] }));
        assert.equal(result.ok, false, `${file} 应被拒绝`);
        assert.match(result.errors.map((item) => item.code).join(','), /page_file_unsafe_path|page_file_missing/);
    }
});

test('schemaVersion 不受支持时默认是错误，可降级为警告', () => {
    const strict = validateManifest(baseManifest({ schemaVersion: '2.0.0' }));
    assert.equal(strict.ok, false);
    assert.match(strict.errors.map((item) => item.code).join(','), /manifest_schema_version_unsupported/);

    const relaxed = validateManifest(baseManifest({ schemaVersion: '2.0.0' }), { strictSchemaVersion: false });
    assert.equal(relaxed.ok, true);
    assert.match(relaxed.warnings.map((item) => item.code).join(','), /manifest_schema_version_unsupported/);
});

test('缺失资源与重复页面 id 只是警告', () => {
    const result = validateManifest(
        baseManifest({ pages: [{ id: 'dup', file: 'slides/A.tsx' }, { id: 'dup', file: 'slides/B.tsx' }] }),
        { entryNames: ['manifest.json', 'slides/A.tsx', 'slides/B.tsx'] }
    );
    assert.equal(result.ok, true);
    const codes = result.warnings.map((item) => item.code);
    assert.ok(codes.includes('asset_not_found'));
    assert.ok(codes.includes('page_id_duplicated'));
});

test('页面数量超过上限时失败', () => {
    const pages = Array.from({ length: LIMITS.maxPages + 1 }, (_, index) => ({ id: `p${index}`, file: `slides/P${index}.tsx` }));
    const result = validateManifest(baseManifest({ pages }));
    assert.equal(result.ok, false);
    assert.match(result.errors.map((item) => item.code).join(','), /manifest_pages_too_many/);
});

test('normalizeManifest 补齐缺省字段而不覆盖已有值', () => {
    const normalized = normalizeManifest({ id: 'x', title: 'T', pages: [{ file: 'slides/A.tsx' }] });
    assert.equal(normalized.schemaVersion, SCHEMA_VERSION);
    assert.equal(normalized.runtime.format, 'lumesync-zip');
    assert.equal(normalized.runtime.entryMode, 'pages');
    assert.equal(normalized.pages[0].id, 'slide-1');
    assert.deepEqual(normalized.assets, {});

    const kept = normalizeManifest(baseManifest({ assets: { 'assets/a.png': {} } }));
    assert.deepEqual(Object.keys(kept.assets), ['assets/a.png']);
});

test('createManifest 需要至少一页', () => {
    assert.throws(() => createManifest({ title: 'x', pages: [] }), /至少需要一页/);
    const manifest = createManifest({ id: 'demo', title: '演示', pages: [{ file: 'slides/A.tsx' }] });
    assert.equal(manifest.runtime.entryMode, 'pages');
    assert.equal(manifest.pages.length, 1);
});

test('isSafeRelativePath 拒绝控制字符与空段', () => {
    assert.equal(isSafeRelativePath('slides/Intro.tsx'), true);
    assert.equal(isSafeRelativePath('a//b.tsx'), false);
    assert.equal(isSafeRelativePath('a/./b.tsx'), false);
    assert.equal(isSafeRelativePath(''), false);
    assert.equal(isSafeRelativePath('a\u0000b'), false);
    assert.equal(isSafeRelativePath('x'.repeat(LIMITS.maxPathLength + 1)), false);
});
