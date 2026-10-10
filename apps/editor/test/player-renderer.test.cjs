'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../..');
const JSZip = require('jszip');
const { createCourseDocument } = require(path.join(root, 'packages/course-model'));
const { createCoursePackage } = require('../app/src/editor-service.cjs');
const { componentPackHash } = require(path.join(root, 'packages/component-extensions'));

async function loadRenderer({ useWebCrypto = false } = {}) {
  const source = await fs.readFile(path.join(root, 'packages/course-runtime/src/browser/engine/course-components/document-renderer.js'), 'utf8');
  const browserWindow = { crypto: useWebCrypto ? globalThis.crypto : undefined, TextEncoder };
  vm.runInNewContext(source, { window: browserWindow, TextEncoder }, { filename: 'document-renderer.js' });
  return browserWindow.LumeSyncDocumentRenderer;
}

test('new editor packages render as safe React elements without calling Babel', async () => {
  const document = createCourseDocument({ id: 'runtime-doc', title: '运行时测试' });
  document.pages[0].blocks[1].props.text = '<img src=x onerror=alert(1)>';
  const renderer = await loadRenderer();
  const buffer = await createCoursePackage(document, { timestamp: '2026-01-01T00:00:00.000Z' });
  const zip = await JSZip.loadAsync(buffer);
  const React = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) };
  const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
  const course = await renderer.loadCourse({ zip, manifest, React });
  assert.equal(course.slides.length, 1);
  assert.equal(course.slides[0].component.type, 'main');
  assert.equal(course.slides[0].component.children[1].children[0], '<img src=x onerror=alert(1)>');
  assert.equal(renderer.format, 'lumesync-course-document');
});

test('classroom renderer loads a locked declarative component from the offline course package', async () => {
  const pack = {
    format: 'lumesync-component-pack',
    formatVersion: '1.0.0',
    id: 'org.demo.widgets',
    version: '1.0.0',
    displayName: 'Demo Widgets',
    components: [{
      id: 'org.demo.widgets.note-card',
      label: '提示卡',
      props: {
        title: { type: 'string', label: '标题', default: '卡片标题' },
        accent: { type: 'color', label: '强调色', default: '#3366aa' }
      },
      template: {
        tag: 'article',
        style: { padding: '20px', borderLeft: { prop: 'accent' } },
        children: [{ tag: 'h2', children: [{ prop: 'title' }] }]
      }
    }]
  };
  const hash = componentPackHash(pack);
  const document = createCourseDocument({ id: 'custom-runtime-doc', title: '自定义组件运行时' });
  document.extensions = [{ id: pack.id, version: pack.version, hash }];
  document.pages[0].blocks.push({
    id: 'custom-note-card',
    type: 'org.demo.widgets.note-card',
    props: { title: '离线组件卡片', accent: '#8844cc' }
  });
  const renderer = await loadRenderer();
  const buffer = await createCoursePackage(document, { componentPacks: [{ pack, hash }], timestamp: '2026-01-01T00:00:00.000Z' });
  const zip = await JSZip.loadAsync(buffer);
  const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
  const React = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) };
  const course = await renderer.loadCourse({ zip, manifest, React });
  const customNode = course.slides[0].component.children[2];
  assert.equal(customNode.type, 'article');
  assert.equal(customNode.props.style.borderLeft, '#8844cc');
  assert.equal(customNode.children[0].type, 'h2');
  assert.equal(customNode.children[0].children[0], '离线组件卡片');

  const packSource = JSON.parse(await zip.file(`source/extensions/${pack.id}.json`).async('string'));
  packSource.components[0].label = 'Tampered';
  zip.file(`source/extensions/${pack.id}.json`, `${JSON.stringify(packSource, null, 2)}\n`);
  const tamperedZip = await JSZip.loadAsync(await zip.generateAsync({ type: 'nodebuffer' }));
  await assert.rejects(renderer.loadCourse({ zip: tamperedZip, manifest, React }), /does not match its locked hash/);
});

test('classroom renderer rejects source whose digest differs from the build manifest', async () => {
  const renderer = await loadRenderer();
  const buffer = await createCoursePackage(createCourseDocument({ id: 'tampered-doc' }), { timestamp: '2026-01-01T00:00:00.000Z' });
  const zip = await JSZip.loadAsync(buffer);
  const metadata = JSON.parse(await zip.file('source/course.json').async('string'));
  metadata.description = 'tampered';
  zip.file('source/course.json', JSON.stringify(metadata, null, 2) + '\n');
  const changedZip = await JSZip.loadAsync(await zip.generateAsync({ type: 'nodebuffer' }));
  const manifest = JSON.parse(await changedZip.file('manifest.json').async('string'));
  const React = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) };
  await assert.rejects(renderer.loadCourse({ zip: changedZip, manifest, React }), /source digest does not match/);
});

test('classroom renderer rejects a stale generated output digest', async () => {
  const renderer = await loadRenderer();
  const buffer = await createCoursePackage(createCourseDocument({ id: 'stale-output-doc' }), { timestamp: '2026-01-01T00:00:00.000Z' });
  const zip = await JSZip.loadAsync(buffer);
  const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
  zip.file(manifest.pages[0].file, '/* stale output */');
  const changedZip = await JSZip.loadAsync(await zip.generateAsync({ type: 'nodebuffer' }));
  const React = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) };
  await assert.rejects(renderer.loadCourse({ zip: changedZip, manifest, React }), /output digest does not match/);
});

test('render-engine source order loads the document renderer before runtime/app', () => {
  const engineSource = require('node:fs').readFileSync(path.join(root, 'packages/course-runtime/packages/render-engine/index.js'), 'utf8');
  const typedSource = require('node:fs').readFileSync(path.join(root, 'packages/course-runtime/src/node/render-engine.ts'), 'utf8');
  const sourceOrder = source => source.slice(source.indexOf('const sourceOrder') >= 0 ? source.indexOf('const sourceOrder') : source.indexOf('const teacherRenderEngineSourceOrder'));
  const rendererIndex = sourceOrder(engineSource).indexOf('course-components/document-renderer.js');
  const appIndex = sourceOrder(engineSource).indexOf('runtime/app.tsx');
  assert.ok(rendererIndex >= 0);
  assert.ok(rendererIndex < appIndex);
  assert.ok(typedSource.indexOf('course-components/document-renderer.js') < typedSource.indexOf('runtime/app.tsx'));
});
