'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateComponentPack, validateComponentProps, componentPackHash,
  readComponentPack, writeComponentPack
} = require('..');

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
