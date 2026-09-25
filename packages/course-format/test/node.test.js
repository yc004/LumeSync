const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const { writeLumePackage, SCHEMA_VERSION, computeCourseHash } = require('../index.js');
const { readLumeManifestSync, lintLumeFileSync } = require('../src/node.js');

const FIXED_DATE = new Date('2026-09-25T00:00:00.000Z');

function manifest(overrides = {}) {
    return {
        schemaVersion: SCHEMA_VERSION,
        id: 'sync-demo',
        title: '同步读取演示',
        runtime: { format: 'lumesync-zip', entryMode: 'pages' },
        pages: [{ id: 'p1', file: 'slides/P1.tsx' }],
        assets: {},
        ...overrides
    };
}

async function writeTemp(dir, name, coursePackage) {
    const buffer = await writeLumePackage(coursePackage, { date: FIXED_DATE });
    const target = path.join(dir, name);
    await fs.writeFile(target, Buffer.from(buffer));
    return target;
}

test('同步读取与异步读取得到同一份 manifest', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lume-sync-'));
    try {
        const target = await writeTemp(dir, 'demo.lume', {
            manifest: manifest(),
            files: new Map([['slides/P1.tsx', 'export default () => null;']])
        });
        const result = readLumeManifestSync(target);
        assert.equal(result.ok, true);
        assert.equal(result.manifest.id, 'sync-demo');
        assert.equal(result.manifest.runtime.entryMode, 'pages');
        assert.ok(result.entryNames.includes('slides/P1.tsx'));
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});

test('同步读取沿用同一套 manifest 校验规则', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lume-sync-bad-'));
    try {
        // 用 JSZip 直接打包，绕过写入端的校验，模拟磁盘上已损坏的课件。
        const JSZip = require('jszip');
        const zip = new JSZip();
        zip.file('manifest.json', JSON.stringify(manifest({ pages: [{ id: 'p1', file: 'slides/Nope.tsx' }] })));
        zip.file('slides/P1.tsx', 'x');
        const target = path.join(dir, 'missing.lume');
        await fs.writeFile(target, Buffer.from(await zip.generateAsync({ type: 'uint8array' })));

        const result = readLumeManifestSync(target);
        assert.equal(result.ok, false);
        assert.equal(result.code, 'manifest_invalid');
        assert.equal(result.errors[0].code, 'page_file_not_found');
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});

test('非 ZIP 内容与旧脚本课件给出明确 code', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lume-sync-legacy-'));
    try {
        const legacy = path.join(dir, 'old.lume');
        await fs.writeFile(legacy, "window.CourseData = { title: '旧课件' };", 'utf8');

        const sync = readLumeManifestSync(legacy);
        assert.equal(sync.ok, false);
        assert.equal(sync.code, 'package_not_a_zip');

        const lint = lintLumeFileSync(legacy);
        assert.equal(lint.ok, false);
        assert.equal(lint.code, 'legacy_script_course');

        const missing = lintLumeFileSync(path.join(dir, 'nope.lume'));
        assert.equal(missing.code, 'package_unreadable');
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});

test('同步读取也执行路径与大小限制', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lume-sync-limits-'));
    try {
        const target = await writeTemp(dir, 'demo.lume', {
            manifest: manifest(),
            files: new Map([['slides/P1.tsx', 'x'.repeat(4096)]])
        });
        const tooSmall = readLumeManifestSync(target, { limits: { maxEntryUncompressedBytes: 128 } });
        assert.equal(tooSmall.ok, false);
        assert.equal(tooSmall.code, 'package_entry_too_large');

        const tooFewEntries = readLumeManifestSync(target, {
            limits: { maxEntries: 1, maxCompressionRatio: 100000 }
        });
        assert.equal(tooFewEntries.code, 'package_too_many_entries');
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});

test('同步读取产出的 manifest 可用于计算内容 hash', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lume-sync-hash-'));
    try {
        const target = await writeTemp(dir, 'demo.lume', {
            manifest: manifest(),
            files: new Map([['slides/P1.tsx', 'export default () => null;']])
        });
        const hash = await computeCourseHash(await fs.readFile(target));
        assert.match(hash.hash, /^sha256:/);
        assert.equal(hash.entryCount, 2);
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});
