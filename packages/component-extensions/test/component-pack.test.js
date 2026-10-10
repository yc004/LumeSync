'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  validateComponentPack, validateComponentProps, componentPackHash,
  readComponentPack, writeComponentPack, createStarterComponentPack
} = require('..');

const CLI = resolve(__dirname, '../bin/lumex.cjs');

function samplePack() {
  return {
    format: 'lumesync-component-pack',
    formatVersion: '1.0.0',
    id: 'org.school.science',
    version: '1.2.0',
    displayName: '科学卡片',
    components: [{
      id: 'org.school.science.fact-card',
      label: '知识卡片',
      props: {
        title: { type: 'string', label: '标题', required: true, default: '新知识' },
        color: { type: 'color', label: '强调色', default: '#3355aa' }
      },
      template: {
        tag: 'section',
        style: { padding: '24px', borderLeft: '6px solid #3355aa' },
        children: [{ tag: 'h2', children: [{ prop: 'title' }] }]
      }
    }]
  };
}

test('.lumex round-trips a declarative component pack with stable hash', async () => {
  const pack = samplePack();
  const bytes = await writeComponentPack(pack);
  const imported = await readComponentPack(bytes);
  assert.deepEqual(imported.pack, pack);
  assert.match(imported.hash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(imported.hash, componentPackHash(pack));
});

test('component pack rejects unsafe tags, active CSS, and namespace spoofing', () => {
  const unsafeTag = samplePack();
  unsafeTag.components[0].template.tag = 'script';
  assert.throws(() => validateComponentPack(unsafeTag), /HTML 标签/);

  const unsafeCss = samplePack();
  unsafeCss.components[0].template.style = { backgroundColor: 'url(https://bad.test/x)' };
  assert.throws(() => validateComponentPack(unsafeCss), /样式值无效/);

  const spoofed = samplePack();
  spoofed.components[0].id = 'core.heading';
  assert.throws(() => validateComponentPack(spoofed), /命名空间/);
});

test('component properties are checked against the imported schema', () => {
  const component = validateComponentPack(samplePack()).components[0];
  assert.equal(validateComponentProps(component, { title: '光合作用', color: '#11aa44' }).title, '光合作用');
  assert.throws(() => validateComponentProps(component, { title: '标题', extra: 'bad' }), /不支持的字段/);
  assert.throws(() => validateComponentProps(component, { title: '标题', color: 'red' }), /#RRGGBB/);
});

test('component pack ZIP rejects unlisted executable files', async () => {
  const JSZip = require('jszip');
  const bytes = await writeComponentPack(samplePack());
  const zip = await JSZip.loadAsync(bytes);
  zip.file('player.js', 'window.evil = true');
  const tampered = await zip.generateAsync({ type: 'nodebuffer' });
  await assert.rejects(readComponentPack(tampered), /只能包含根目录 extension.json/);

  const directoryOnly = await JSZip.loadAsync(bytes);
  directoryOnly.folder('assets');
  const withDirectory = await directoryOnly.generateAsync({ type: 'nodebuffer' });
  await assert.rejects(readComponentPack(withDirectory), /只能包含根目录 extension.json/);
  await assert.rejects(readComponentPack(Buffer.alloc(1024 * 1024 + 65 * 1024)), /压缩文件超过/);
});

test('starter component pack follows the same contract validator', () => {
  const pack = createStarterComponentPack('org.example.cards', '示例卡片', '2.1.0');
  assert.equal(pack.components[0].id, 'org.example.cards.fact-card');
  assert.equal(pack.version, '2.1.0');
  assert.equal(validateComponentPack(pack), pack);
});

test('CLI initializes, packages, and validates an offline component pack', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'lumex-component-cli-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: directory, encoding: 'utf8' });

  const initialized = run('init', 'org.example.cards', '示例卡片', '--version', '1.2.3');
  assert.equal(initialized.status, 0, initialized.stderr);
  const source = JSON.parse(readFileSync(join(directory, 'extension.json'), 'utf8'));
  assert.equal(source.version, '1.2.3');

  const packed = run('pack', 'extension.json', 'cards.lumex');
  assert.equal(packed.status, 0, packed.stderr);
  assert.match(packed.stdout, /Hash：sha256:/);

  const validated = run('validate', 'cards.lumex');
  assert.equal(validated.status, 0, validated.stderr);
  assert.match(validated.stdout, /组件数：1/);

  const overwrite = run('init', 'org.example.cards', '覆盖测试');
  assert.equal(overwrite.status, 1);
  assert.match(overwrite.stderr, /已存在/);
});
