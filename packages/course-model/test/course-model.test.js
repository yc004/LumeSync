'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CourseModelError,
  getComponentCatalog,
  createCourseDocument,
  validateCourseDocument,
  createDocumentStore,
  renderPageHtml,
  compilePageTsx,
  buildCourseDocument
} = require('../index');
const { componentPackHash } = require('../../component-extensions');

function samplePack() {
  return {
    format: 'lumesync-component-pack', formatVersion: '1.0.0', id: 'org.school.science', version: '1.2.0', displayName: '科学组件',
    components: [{
      id: 'org.school.science.fact-card', label: '知识卡片',
      props: { title: { type: 'string', label: '标题', default: '新知识', required: true }, color: { type: 'color', label: '颜色', default: '#3355aa' } },
      template: { tag: 'section', style: { padding: '24px', borderLeft: '6px solid #3355aa' }, children: [{ tag: 'h2', children: [{ prop: 'title' }] }] }
    }]
  };
}

function sample() {
  return createCourseDocument({ id: 'lesson-one', title: '分数入门' });
}

test('creates a stable editable document with namespaced standard components', () => {
  const document = sample();
  assert.equal(document.format, 'lumesync-course-document');
  assert.equal(document.pages.length, 1);
  assert.equal(validateCourseDocument(document).ok, true);
  assert.ok(document.pages[0].blocks.every(block => block.type.startsWith('core.')));
});

test('rejects unknown components, duplicate IDs, and invalid props', () => {
  const document = sample();
  document.pages[0].blocks.push({ id: 'custom', type: 'someone.widget', props: {} });
  const unknown = validateCourseDocument(document);
  assert.equal(unknown.ok, false);
  assert.ok(unknown.errors.some(issue => issue.code === 'component_unknown'));
  document.pages[0].blocks.pop();
  document.pages[0].blocks[0].props.level = 7;
  assert.ok(validateCourseDocument(document).errors.some(issue => issue.code === 'heading_level_invalid'));
  document.pages[0].blocks[0].props.level = 1;
  document.pages[0].blocks[0].props.rawHtml = '<script>';
  assert.ok(validateCourseDocument(document).errors.some(issue => issue.code === 'component_prop_unknown'));
});

test('commands support undo and redo with monotonic revisions and conflict checks', () => {
  const store = createDocumentStore(sample());
  const first = store.snapshot();
  const updated = store.dispatch({ type: 'course.update', patch: { title: '分数：第一课' } }, { expectedRevision: first.revision });
  assert.equal(updated.revision, 1);
  assert.equal(updated.document.title, '分数：第一课');
  assert.throws(() => store.dispatch({ type: 'course.update', patch: { title: '旧请求' } }, { expectedRevision: 0 }), error => error.code === 'revision_conflict');
  const undone = store.undo({ expectedRevision: 1 });
  assert.equal(undone.revision, 2);
  assert.equal(undone.document.title, '分数入门');
  const redone = store.redo({ expectedRevision: 2 });
  assert.equal(redone.revision, 3);
  assert.equal(redone.document.title, '分数：第一课');
});

test('invalid batch rolls back as a whole and last page cannot be deleted', () => {
  const store = createDocumentStore(sample());
  const page = store.snapshot().document.pages[0];
  assert.throws(() => store.dispatchBatch([
    { type: 'course.update', patch: { title: '临时标题' } },
    { type: 'page.remove', pageId: page.id }
  ]), error => error.code === 'last_page_required');
  assert.equal(store.snapshot().revision, 0);
  assert.equal(store.snapshot().document.title, '分数入门');
  assert.throws(() => store.dispatch({ type: 'course.update', patch: { title: '禁止字段', arbitraryCode: 'ignored?' } }), error => error.code === 'patch_field_forbidden');
});

test('candidate changes are isolated, diffable, and accepted only at the base revision', () => {
  const store = createDocumentStore(sample());
  const page = store.snapshot().document.pages[0];
  const candidate = store.createCandidate([
    { type: 'course.update', patch: { title: 'AI 课件草稿' } },
    { type: 'page.update', pageId: page.id, patch: { title: '认识分数' } }
  ], { expectedRevision: 0 });
  assert.equal(store.snapshot().document.title, '分数入门');
  assert.equal(candidate.diff.titleChanged, true);
  store.dispatch({ type: 'course.update', patch: { description: '有手工修改' } });
  assert.throws(() => store.acceptCandidate(candidate), error => error.code === 'candidate_stale');
});

test('preview HTML escapes content and uses only validated component output', () => {
  const document = sample();
  document.pages[0].blocks[1].props.text = '<img src=x onerror=alert(1)>';
  const html = renderPageHtml(document, document.pages[0].id);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.throws(() => renderPageHtml(document, 'missing'), error => error.code === 'page_not_found');
});

test('build contains editable page sources, fixed TSX outputs, and source digest', async () => {
  const document = sample();
  const result = await buildCourseDocument(document);
  assert.equal(result.pages.length, 1);
  assert.match(result.files.get('source/course.json'), /pageOrder/);
  assert.match(result.files.get(`source/pages/${document.pages[0].id}.json`), /core\.heading/);
  assert.match(result.files.get(result.pages[0].file), /export default function LumeSlide/);
  assert.match(result.files.get('build/build-manifest.json'), /sha256:[a-f0-9]{64}/);
  assert.equal(result.files.get(result.pages[0].file), compilePageTsx(document, document.pages[0].id));
});

test('custom declarative components require a locked pack and render as escaped template nodes', async () => {
  const pack = samplePack();
  const componentPacks = [{ pack, hash: componentPackHash(pack) }];
  const document = sample();
  document.extensions = [{ id: pack.id, version: pack.version, hash: componentPacks[0].hash }];
  document.pages[0].blocks.push({ id: 'custom-block', type: 'org.school.science.fact-card', props: { title: '<script>safe text</script>', color: '#3355aa' } });
  assert.equal(validateCourseDocument(document).ok, false);
  assert.equal(validateCourseDocument(document, { componentPacks }).ok, true);
  assert.throws(() => createDocumentStore(document), /扩展|组件/);
  const store = createDocumentStore(document, { componentPacks });
  store.dispatch({ type: 'block.add', pageId: document.pages[0].id, block: { type: 'org.school.science.fact-card', props: { title: '再加一张', color: '#3355aa' } } });
  assert.equal(store.snapshot().document.pages[0].blocks.length, 4);
  const preview = renderPageHtml(store.snapshot().document, document.pages[0].id, { componentPacks });
  assert.match(preview, /&lt;script&gt;safe text&lt;\/script&gt;/);
  assert.doesNotMatch(preview, /<script>safe text/);
  const built = await buildCourseDocument(document, { componentPacks });
  assert.ok(built.files.has(`source/extensions/${pack.id}.json`));
  assert.match(built.files.get(`slides/${document.pages[0].id}.tsx`), /<section style=/);
});

test('component catalog selects the course-locked extension version and rejects a multi-version lock', () => {
  const first = samplePack();
  const second = samplePack();
  second.version = '2.0.0';
  second.components[0].label = '知识卡片新版';
  const componentPacks = [first, second].map(pack => ({ pack, hash: componentPackHash(pack) }));
  const secondRef = { id: second.id, version: second.version, hash: componentPackHash(second) };
  assert.equal(getComponentCatalog(componentPacks)['org.school.science.fact-card'].label, '知识卡片新版');
  assert.equal(getComponentCatalog(componentPacks, [secondRef])['org.school.science.fact-card'].label, '知识卡片新版');

  const document = sample();
  document.extensions = [secondRef];
  document.pages[0].blocks.push({ id: 'versioned-custom', type: 'org.school.science.fact-card', props: { title: '第二版' } });
  assert.equal(validateCourseDocument(document, { componentPacks }).ok, true);
  document.extensions.push({ id: first.id, version: first.version, hash: componentPackHash(first) });
  assert.ok(validateCourseDocument(document, { componentPacks }).errors.some(issue => issue.code === 'extension_version_conflict'));
});
