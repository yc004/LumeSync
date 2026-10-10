'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const JSZip = require('jszip');
const root = path.resolve(__dirname, '../../..');
const { createCourseDocument } = require(path.join(root, 'packages/course-model'));
const { readLumePackage } = require(path.join(root, 'packages/course-format'));
const { componentPackHash } = require(path.join(root, 'packages/component-extensions'));
const {
  createCoursePackage,
  openCoursePackage,
  atomicWriteFile,
  validateModelProfile,
  chatCompletionsUrl,
  sendChatCompletion,
  testModelConnection,
  generateCourseCandidate,
  createDocumentStore
} = require('../app/src/editor-service.cjs');

function profile(overrides = {}) {
  return { label: 'Local test', model: 'test-model', baseUrl: 'https://models.example/v1', ...overrides };
}

function jsonResponse(content, extra = {}) {
  return {
    ok: true,
    status: 200,
    async json() { return { choices: [{ message: { content } }], usage: { total_tokens: 27 }, ...extra }; }
  };
}

test('editor package round-trips editable source and reproducible player output', async () => {
  const document = createCourseDocument({ id: 'editable', title: '可编辑课件' });
  const bytes = await createCoursePackage(document, { timestamp: '2026-01-01T00:00:00.000Z' });
  const opened = await openCoursePackage(bytes);
  assert.equal(opened.document.title, document.title);
  assert.deepEqual(opened.document, document);
  assert.match(opened.courseHash, /^sha256:/);
  assert.ok(opened.manifest.pages[0].file.endsWith('.tsx'));
});

test('editor refuses packages with stale compiled output and leaves source editable', async () => {
  const document = createCourseDocument({ id: 'stale', title: '检查过期构建' });
  const bytes = await createCoursePackage(document, { timestamp: '2026-01-01T00:00:00.000Z' });
  const zip = await JSZip.loadAsync(bytes);
  const pageFile = `slides/${document.pages[0].id}.tsx`;
  zip.file(pageFile, 'export default function Broken() { return null; }');
  const badBytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  await assert.rejects(openCoursePackage(badBytes), error => error.code === 'course_build_stale');
});

test('opening existing legacy ZIP without authoring source does not rewrite it', async () => {
  const bytes = await createCoursePackage(createCourseDocument({ id: 'missing-source' }));
  const zip = await JSZip.loadAsync(bytes);
  zip.remove('source/course.json');
  const broken = await zip.generateAsync({ type: 'nodebuffer' });
  await assert.rejects(openCoursePackage(broken), error => error.code === 'package_entry_not_found');
});

test('custom component pack is locked into the course and survives save/open offline', async () => {
  const pack = {
    format: 'lumesync-component-pack', formatVersion: '1.0.0', id: 'org.school.science', version: '1.2.0', displayName: '科学组件',
    components: [{
      id: 'org.school.science.fact-card', label: '知识卡片',
      props: { title: { type: 'string', label: '标题', default: '新知识', required: true }, accent: { type: 'color', label: '强调色', default: '#3355aa' } },
      template: { tag: 'section', style: { padding: '24px', borderLeft: '6px solid #3355aa' }, children: [{ tag: 'h2', children: [{ prop: 'title' }] }] }
    }]
  };
  const componentPacks = [{ pack, hash: componentPackHash(pack) }];
  const document = createCourseDocument({ id: 'with-component-pack' });
  document.extensions = [{ id: pack.id, version: pack.version, hash: componentPacks[0].hash }];
  document.pages[0].blocks.push({ id: 'fact-card-1', type: 'org.school.science.fact-card', props: { title: '叶绿体', accent: '#3355aa' } });
  const bytes = await createCoursePackage(document, { componentPacks });
  const opened = await openCoursePackage(bytes);
  assert.deepEqual(opened.document, document);
  assert.equal(opened.componentPacks.length, 1);
  assert.equal(opened.componentPacks[0].hash, componentPacks[0].hash);
  const checked = await readLumePackage(bytes);
  assert.ok(checked.entries.includes(`source/extensions/${pack.id}.json`));
});

test('atomic writer replaces the selected file with complete bytes', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lumesync-editor-'));
  try {
    const target = path.join(directory, 'lesson.lume');
    await fs.writeFile(target, 'old');
    await atomicWriteFile(target, Buffer.from('new package'));
    assert.equal(await fs.readFile(target, 'utf8'), 'new package');
    assert.deepEqual(await fs.readdir(directory), ['lesson.lume']);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('provider settings require HTTPS except explicit local loopback HTTP', () => {
  assert.throws(() => validateModelProfile(profile({ baseUrl: 'http://model.example/v1' })), error => error.code === 'model_url_requires_https');
  assert.throws(() => validateModelProfile(profile({ baseUrl: 'https://user:pass@models.example/v1' })), error => error.code === 'model_url_invalid');
  assert.throws(() => validateModelProfile(profile({ baseUrl: 'https://models.example/v1?token=secret' })), error => error.code === 'model_url_invalid');
  assert.equal(validateModelProfile(profile({ baseUrl: 'http://127.0.0.1:11434/v1' })).baseUrl, 'http://127.0.0.1:11434/v1');
  assert.equal(chatCompletionsUrl(profile()), 'https://models.example/v1/chat/completions');
  assert.equal(chatCompletionsUrl(profile({ baseUrl: 'https://models.example/custom/chat/completions' })), 'https://models.example/custom/chat/completions');
});

test('connectivity test uses configured endpoint and returns usage without exposing API key', async () => {
  let request;
  const result = await testModelConnection({
    profile: profile(),
    apiKey: 'secret-key',
    fetchImpl: async (url, options) => { request = { url, options }; return jsonResponse('{"ok":true}'); }
  });
  assert.equal(request.url, 'https://models.example/v1/chat/completions');
  assert.equal(request.options.headers.authorization, 'Bearer secret-key');
  assert.equal(request.options.redirect, 'error');
  assert.deepEqual(result, { ok: true, elapsedMs: result.elapsedMs, usage: { total_tokens: 27 } });
  assert.equal(JSON.stringify(result).includes('secret-key'), false);
});

test('Agent builds an isolated typed candidate and user acceptance is one undoable transaction', async () => {
  const store = createDocumentStore(createCourseDocument({ id: 'agent-course', title: '草稿' }));
  const proposal = {
    plan: [{ title: '认识光合作用', purpose: '建立核心概念' }],
    commands: [
      { type: 'course.update', patch: { title: '认识光合作用' } },
      { type: 'page.add', page: { title: '叶片里的能量转换', blocks: [
        { type: 'core.heading', props: { text: '光合作用', level: 1 } },
        { type: 'core.callout', props: { title: '核心问题', text: '植物如何把光能转成化学能？', tone: 'tip' } }
      ] } }
    ]
  };
  let sentBody;
  const result = await generateCourseCandidate({
    store,
    prompt: '制作一节关于光合作用的入门课',
    profile: profile(),
    apiKey: 'model-secret',
    fetchImpl: async (_url, options) => { sentBody = JSON.parse(options.body); return jsonResponse(JSON.stringify(proposal)); }
  });
  assert.equal(store.snapshot().document.title, '草稿');
  assert.equal(result.candidate.document.pages.length, 2);
  assert.equal(result.candidate.diff.addedPages.length, 1);
  assert.match(sentBody.messages[0].content, /只能提出课件编辑命令/);
  assert.equal(JSON.stringify(result).includes('model-secret'), false);
  const accepted = store.acceptCandidate(result.candidate, { expectedRevision: 0 });
  assert.equal(accepted.document.title, '认识光合作用');
  assert.equal(accepted.revision, 1);
  assert.equal(store.undo().document.title, '草稿');
});

test('Agent context advertises only the custom components locked into the current course', async () => {
  const pack = {
    format: 'lumesync-component-pack', formatVersion: '1.0.0', id: 'org.school.cards', version: '1.0.0', displayName: '课程卡片',
    components: [{
      id: 'org.school.cards.fact-card', label: '事实卡',
      props: { heading: { type: 'string', label: '标题', default: '事实' } },
      template: { tag: 'article', children: [{ tag: 'h2', children: [{ prop: 'heading' }] }] }
    }]
  };
  const hash = componentPackHash(pack);
  const document = createCourseDocument({ id: 'agent-custom-course' });
  document.extensions = [{ id: pack.id, version: pack.version, hash }];
  const store = createDocumentStore(document, { componentPacks: [{ pack, hash }] });
  const pageId = document.pages[0].id;
  let sentBody;
  await generateCourseCandidate({
    store, prompt: '加一张事实卡', profile: profile(), apiKey: 'model-secret',
    fetchImpl: async (_url, options) => {
      sentBody = JSON.parse(options.body);
      return jsonResponse(JSON.stringify({
        plan: [{ title: '事实卡', purpose: '强调概念' }],
        commands: [{ type: 'block.add', pageId, block: { type: 'org.school.cards.fact-card', props: { heading: '光合作用需要光' } } }]
      }));
    }
  });
  assert.match(sentBody.messages[0].content, /只能提出课件编辑命令/);
  assert.match(sentBody.messages[1].content, /org\.school\.cards\.fact-card/);
  assert.match(sentBody.messages[1].content, /heading/);
});

test('Agent rejects non-JSON, shell-like commands, and responses based on stale revisions', async () => {
  const store = createDocumentStore(createCourseDocument({ id: 'safe-course' }));
  await assert.rejects(generateCourseCandidate({
    store, prompt: '测试', profile: profile(), apiKey: 'secret',
    fetchImpl: async () => jsonResponse('Here is your course')
  }), error => error.code === 'json_invalid');
  await assert.rejects(generateCourseCandidate({
    store, prompt: '测试', profile: profile(), apiKey: 'secret',
    fetchImpl: async () => jsonResponse(JSON.stringify({ plan: [], commands: [{ type: 'shell.exec', command: 'touch /tmp/pwned' }] }))
  }), error => error.code === 'command_unknown');
  await assert.rejects(generateCourseCandidate({
    store, prompt: '测试', profile: profile(), apiKey: 'secret',
    fetchImpl: async () => {
      store.dispatch({ type: 'course.update', patch: { description: '并发手工更新' } });
      return jsonResponse(JSON.stringify({ plan: [], commands: [{ type: 'course.update', patch: { title: 'AI' } }] }));
    }
  }), error => error.code === 'revision_conflict');
});

test('user cancellation aborts the provider request', async () => {
  const controller = new AbortController();
  const pending = sendChatCompletion({
    profile: profile(), apiKey: 'secret', signal: controller.signal,
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
    })
  });
  controller.abort();
  await assert.rejects(pending, error => error.code === 'model_cancelled');
});

test('Agent enforces its page-count cap after local command validation', async () => {
  const store = createDocumentStore(createCourseDocument({ id: 'bounded-course' }));
  const commands = Array.from({ length: 30 }, (_, index) => ({
    type: 'page.add',
    page: { title: `Page ${index + 1}`, blocks: [{ type: 'core.paragraph', props: { text: 'content' } }] }
  }));
  await assert.rejects(generateCourseCandidate({
    store, prompt: '生成很多页', profile: profile(), apiKey: 'secret',
    fetchImpl: async () => jsonResponse(JSON.stringify({ plan: [], commands }))
  }), error => error.code === 'agent_page_limit');
  assert.equal(store.snapshot().document.pages.length, 1);
  assert.equal(store.snapshot().revision, 0);
});
