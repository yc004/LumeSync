const test = require('node:test');
const assert = require('node:assert/strict');

const JSZip = require('jszip');

const {
    LIMITS,
    SCHEMA_VERSION,
    readLumePackage,
    writeLumePackage,
    computeCourseHash,
    detectCourseFormat,
    looksLikeZip
} = require('../index.js');

const FIXED_DATE = new Date('2026-09-25T00:00:00.000Z');

function sampleCourse(overrides = {}) {
    return {
        manifest: {
            schemaVersion: SCHEMA_VERSION,
            id: 'demo',
            title: '演示课件',
            runtime: { format: 'lumesync-zip', entryMode: 'pages', slideModule: 'tsx', react: '18' },
            pages: [{ id: 'intro', file: 'slides/Intro.tsx', title: '第一页' }],
            assets: {},
            ...overrides
        },
        files: new Map([
            ['slides/Intro.tsx', 'export default function Intro() { return null; }']
        ])
    };
}

test('写入后可读回，manifest 与条目一致', async () => {
    const buffer = await writeLumePackage(sampleCourse(), { date: FIXED_DATE });
    assert.equal(looksLikeZip(buffer), true);
    assert.equal(detectCourseFormat(buffer), 'lume-zip');

    const pkg = await readLumePackage(buffer);
    assert.equal(pkg.ok, true);
    assert.equal(pkg.manifest.id, 'demo');
    assert.deepEqual(pkg.entries, ['manifest.json', 'slides/Intro.tsx']);
    const source = await pkg.readText('slides/Intro.tsx');
    assert.match(source, /export default function Intro/);
});

test('缺少 manifest.json 时报明确错误', async () => {
    const zip = new JSZip();
    zip.file('slides/Intro.tsx', 'x');
    const buffer = await zip.generateAsync({ type: 'uint8array' });

    const pkg = await readLumePackage(buffer);
    assert.equal(pkg.ok, false);
    assert.equal(pkg.code, 'manifest_missing');
});

test('非 ZIP 内容被拒绝', async () => {
    const pkg = await readLumePackage(Buffer.from('window.CourseData = {}', 'utf8'));
    assert.equal(pkg.ok, false);
    assert.equal(pkg.code, 'package_not_a_zip');
});

test('manifest 不是合法 JSON 时报错', async () => {
    const zip = new JSZip();
    zip.file('manifest.json', '{ not json');
    const buffer = await zip.generateAsync({ type: 'uint8array' });
    const pkg = await readLumePackage(buffer);
    assert.equal(pkg.ok, false);
    assert.equal(pkg.code, 'manifest_invalid_json');
});

// 手工构造 ZIP（stored，不压缩），用于验证解包端对恶意条目名的处理：
// JSZip 会在 loadAsync 时清洗 ../ 段，因此必须绕过它构造原始包。
function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function buildStoredZip(entries) {
    const chunks = [];
    const central = [];
    let offset = 0;
    for (const [name, content] of entries) {
        const nameBuffer = Buffer.from(name, 'utf8');
        const data = Buffer.from(content, 'utf8');
        const crc = crc32(data);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0, 6);
        local.writeUInt16LE(0, 8);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(data.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(nameBuffer.length, 26);
        local.writeUInt16LE(0, 28);
        chunks.push(local, nameBuffer, data);

        const dir = Buffer.alloc(46);
        dir.writeUInt32LE(0x02014b50, 0);
        dir.writeUInt16LE(20, 4);
        dir.writeUInt16LE(20, 6);
        dir.writeUInt32LE(crc, 16);
        dir.writeUInt32LE(data.length, 20);
        dir.writeUInt32LE(data.length, 24);
        dir.writeUInt16LE(nameBuffer.length, 28);
        dir.writeUInt32LE(offset, 42);
        central.push(dir, nameBuffer);

        offset += local.length + nameBuffer.length + data.length;
    }
    const centralBuffer = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralBuffer.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...chunks, centralBuffer, end]);
}

test('拒绝越界条目路径（绝对路径、盘符与反斜杠）', async () => {
    const manifest = JSON.stringify(sampleCourse().manifest);
    for (const name of ['/etc/passwd', 'C:/x.tsx', 'a\\b.txt']) {
        const buffer = buildStoredZip([
            ['manifest.json', manifest],
            ['slides/Intro.tsx', 'export default () => null;'],
            [name, 'payload']
        ]);
        const pkg = await readLumePackage(buffer);
        assert.equal(pkg.ok, false, `${name} 应被拒绝`);
        assert.equal(pkg.code, 'package_entry_path_unsafe');
    }
});

test('原始条目名含 .. 段时拒绝，不做静默归一', async () => {
    const manifest = JSON.stringify(sampleCourse().manifest);
    const buffer = buildStoredZip([
        ['manifest.json', manifest],
        ['slides/Intro.tsx', 'export default () => null;'],
        ['slides/../../evil.txt', 'payload']
    ]);
    const pkg = await readLumePackage(buffer);
    // JSZip 会把它归一成 evil.txt，但只信归一后的名字会让两条读取路径结论不同，
    // 因此按打包时的原始名判定并直接拒绝。
    assert.equal(pkg.ok, false);
    assert.equal(pkg.code, 'package_entry_path_unsafe');
});

test('同步与异步读取器对同一批可疑条目给出一致结论', async () => {
    const { readLumeManifestSync } = require('../src/node.js');
    const manifest = JSON.stringify(sampleCourse().manifest);
    const cases = [
        { entry: 'slides/../evil.txt', unsafe: true },
        { entry: 'a\\b.txt', unsafe: true },
        { entry: '/etc/passwd', unsafe: true },
        { entry: 'C:/x.tsx', unsafe: true },
        { entry: 'assets/ok.txt', unsafe: false }
    ];

    for (const { entry, unsafe } of cases) {
        const buffer = buildStoredZip([
            ['manifest.json', manifest],
            ['slides/Intro.tsx', 'export default () => null;'],
            [entry, 'payload']
        ]);
        const asyncResult = await readLumePackage(buffer);
        const syncResult = readLumeManifestSync(buffer);
        assert.equal(asyncResult.ok, syncResult.ok, `${entry}: 同步与异步结论必须一致`);
        if (unsafe) {
            assert.equal(asyncResult.ok, false, `${entry} 异步读取应拒绝`);
            assert.equal(asyncResult.code, 'package_entry_path_unsafe', `${entry} 拒绝原因`);
            assert.equal(syncResult.code, 'package_entry_path_unsafe', `${entry} 同步拒绝原因`);
        } else {
            assert.equal(asyncResult.ok, true, `${entry} 应放行`);
        }
    }
});

test('超过条目数、单文件大小与压缩比上限时拒绝', async () => {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify(sampleCourse().manifest));
    zip.file('slides/Intro.tsx', 'x');
    zip.file('assets/big.txt', 'a'.repeat(200000));
    const buffer = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });

    const tooManyEntries = await readLumePackage(buffer, { limits: { maxEntries: 2, maxCompressionRatio: 100000 } });
    assert.equal(tooManyEntries.code, 'package_too_many_entries');

    const tooBig = await readLumePackage(buffer, { limits: { maxEntryUncompressedBytes: 100, maxCompressionRatio: 100000 } });
    assert.equal(tooBig.code, 'package_entry_too_large');

    const ratio = await readLumePackage(buffer, { limits: { maxCompressionRatio: 2 } });
    assert.equal(ratio.code, 'package_compression_ratio_exceeded');
});

test('内容 hash 与打包时间无关，内容变化则变化', async () => {
    const first = await writeLumePackage(sampleCourse(), { date: FIXED_DATE });
    const second = await writeLumePackage(sampleCourse(), { date: new Date('2027-01-01T00:00:00.000Z') });
    const hashA = await computeCourseHash(first);
    const hashB = await computeCourseHash(second);
    assert.equal(hashA.hash, hashB.hash);
    assert.match(hashA.hash, /^sha256:[0-9a-f]{64}$/);
    assert.equal(hashA.entryCount, 2);

    const changed = sampleCourse();
    changed.files.set('slides/Intro.tsx', 'export default function Intro() { return "changed"; }');
    const third = await writeLumePackage(changed, { date: FIXED_DATE });
    const hashC = await computeCourseHash(third);
    assert.notEqual(hashC.hash, hashA.hash);
});

test('缺失资源只产生警告，不影响读取', async () => {
    const course = sampleCourse();
    course.manifest.assets = { 'assets/missing.svg': { type: 'image/svg+xml' } };
    const buffer = await writeLumePackage(course, { date: FIXED_DATE });
    const pkg = await readLumePackage(buffer);
    assert.equal(pkg.ok, true);
    assert.ok(pkg.warnings.some((item) => item.code === 'asset_not_found'));
});

test('写入非法路径时抛出 CourseFormatError', async () => {
    const course = sampleCourse();
    course.files = new Map([['../escape.tsx', 'x']]);
    await assert.rejects(() => writeLumePackage(course, { date: FIXED_DATE }), /路径不安全/);
});

test('readFile 对不存在条目抛出 CourseFormatError', async () => {
    const buffer = await writeLumePackage(sampleCourse(), { date: FIXED_DATE });
    const pkg = await readLumePackage(buffer);
    await assert.rejects(() => pkg.readFile('slides/Nope.tsx'), /不存在条目/);
});

test('默认上限覆盖设计要求的大小与条目约束', () => {
    assert.ok(LIMITS.maxEntries <= 5000);
    assert.ok(LIMITS.maxCompressionRatio <= 1000);
    assert.ok(LIMITS.maxTotalUncompressedBytes <= 512 * 1024 * 1024);
});
