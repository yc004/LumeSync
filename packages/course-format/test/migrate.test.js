const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const {
    readLumePackage,
    writeLumePackage,
    computeCourseHash,
    migrateLegacyCourse,
    planLegacyMigration,
    extractLegacyStringProperty,
    sanitizeCourseId
} = require('../index.js');

const {
    readLumeFile,
    writeLumeFile,
    migrateLegacyLumeFile,
    collectLegacyLumeFiles
} = require('../src/node.js');

const LEGACY_SOURCE = `// 旧课件示例
window.CourseData = {
  title: '旧版演示课',
  icon: 'Legacy',
  desc: '迁移测试',
  color: 'from-red-500 to-orange-500',
  pages: []
};
`;

const FIXED_DATE = new Date('2026-09-25T00:00:00.000Z');

test('旧脚本课件迁移为 v1 ZIP 课件并保留 legacy-course-data 入口', async () => {
    const result = await migrateLegacyCourse(LEGACY_SOURCE, { baseName: 'old-demo', timestamp: FIXED_DATE.toISOString() });
    const pkg = await readLumePackage(result.buffer);
    assert.equal(pkg.ok, true);
    assert.equal(pkg.manifest.runtime.entryMode, 'legacy-course-data');
    assert.equal(pkg.manifest.runtime.format, 'lumesync-zip');
    assert.equal(pkg.manifest.title, '旧版演示课');
    assert.equal(pkg.manifest.icon, 'Legacy');
    assert.ok(pkg.manifest.id.startsWith('old-demo-'));
    assert.deepEqual(pkg.manifest.pages.map((page) => page.file), ['slides/LegacyCourse.tsx']);
    assert.equal(pkg.manifest.migration.from, 'legacy-script');
    const source = await pkg.readText('slides/LegacyCourse.tsx');
    assert.equal(source, LEGACY_SOURCE);
});

test('相同输入与时间戳产生可复现的迁移结果', async () => {
    const options = { baseName: 'old-demo', timestamp: FIXED_DATE.toISOString(), date: FIXED_DATE };
    const first = await migrateLegacyCourse(LEGACY_SOURCE, options);
    const second = await migrateLegacyCourse(LEGACY_SOURCE, options);
    assert.deepEqual(Buffer.from(first.buffer), Buffer.from(second.buffer));
    assert.equal(first.id, second.id);

    const hashA = await computeCourseHash(first.buffer);
    const hashB = await computeCourseHash(second.buffer);
    assert.equal(hashA.hash, hashB.hash);
});

test('空内容被拒绝', () => {
    assert.throws(() => planLegacyMigration('   '), /内容为空/);
});

test('辅助函数按预期提取旧字段并清洗 id', () => {
    assert.equal(extractLegacyStringProperty(LEGACY_SOURCE, 'title'), '旧版演示课');
    assert.equal(extractLegacyStringProperty(LEGACY_SOURCE, 'missing'), '');
    assert.equal(sanitizeCourseId('我的 课件 v2.lume'), 'v2');
    assert.equal(sanitizeCourseId(''), 'course');
});

test('磁盘读写：原子写入后可读回，且不覆盖原文件', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lume-format-'));
    try {
        const target = path.join(dir, 'demo.lume');
        await writeLumeFile(target, {
            manifest: {
                schemaVersion: '1.0.0',
                id: 'demo',
                title: '磁盘演示',
                runtime: { format: 'lumesync-zip', entryMode: 'pages' },
                pages: [{ id: 'p1', file: 'slides/P1.tsx' }],
                assets: {}
            },
            files: new Map([['slides/P1.tsx', 'export default () => null;']])
        }, { date: FIXED_DATE });

        const pkg = await readLumeFile(target);
        assert.equal(pkg.ok, true);
        assert.equal(pkg.manifest.title, '磁盘演示');
        assert.equal(pkg.fileSize > 0, true);

        const hash = await computeCourseHash(await fs.readFile(target));
        assert.match(hash.hash, /^sha256:/);

        // 原子替换后没有残留临时文件
        const entries = await fs.readdir(dir);
        assert.deepEqual(entries.filter((name) => name.includes('.tmp-')), []);
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});

test('迁移磁盘上的旧课件时保留原文件并生成 .migrated.lume', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lume-migrate-'));
    try {
        const legacyPath = path.join(dir, 'old.lume');
        await fs.writeFile(legacyPath, LEGACY_SOURCE, 'utf8');

        const collected = await collectLegacyLumeFiles(dir);
        assert.deepEqual(collected, [legacyPath]);

        const result = await migrateLegacyLumeFile(legacyPath);
        assert.equal(result.outputPath, path.join(dir, 'old.migrated.lume'));
        assert.equal(await fs.readFile(legacyPath, 'utf8'), LEGACY_SOURCE, '原文件必须保留');

        const pkg = await readLumeFile(result.outputPath);
        assert.equal(pkg.ok, true);
        assert.equal(pkg.manifest.runtime.entryMode, 'legacy-course-data');

        // 迁移产物不再出现在待迁移列表里
        assert.deepEqual(await collectLegacyLumeFiles(dir), [legacyPath]);
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});
