import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, '../..');
const docsRoot = join(root, 'docs');
const contentRoot = join(root, 'docs-site/content');
const checkOnly = process.argv.includes('--check');

// docs/ is the sole source for the current documentation. Keep this list in
// sidebar order; archived material must never be included here.
const sections = [
  { slug: 'getting-started', title: '入门与运行', pages: [['running', '获取源码与运行现状'], ['editor', '新课件编辑器 MVP']] },
  { slug: 'architecture', title: '架构', pages: [
    ['system', '当前系统架构'],
    ['three-end-architecture', '现有三端架构'],
    ['runtime-mechanisms', '当前通信与运行机制'],
    ['course-rendering', '课件渲染架构评估'],
    ['course-content-extensions', '课件内容规范与插件机制'],
    ['editor-design', '新课件编辑器设计'],
    ['editor-agent', '编辑器 Agent 与模型 API'],
    ['source-review', '源码级架构评估'],
    ['target-architecture', '三端目标架构'],
    ['teacher-cross-platform-relay', '跨平台教师端与中继模式']
  ] },
  { slug: 'reference', title: '接口与实现参考', pages: [
    ['features', '功能清单、证据与限制'],
    ['contracts', '共享契约包'],
    ['classroom-hub', '教室 Hub 与中继模式'],
    ['session-agent', '教师端会话代理'],
    ['http-api', 'HTTP API 与静态资源'],
    ['socket-events', 'Socket.IO 课堂事件'],
    ['native-bridge', 'WebView2 原生桥接'],
    ['course-format-sdk', '课件格式与 SDK'],
    ['configuration', '配置与目录']
  ] },
  { slug: 'development', title: '开发与维护', pages: [['contributing', '开发与维护']] },
  { slug: 'status', title: '项目状态', pages: [
    ['migration', '目标架构迁移状态'],
    ['audit', '根仓审查报告'],
    ['submodules', '子模块源码状态']
  ] }
];

const expected = new Map();
const errors = [];

function add(path, content) {
  expected.set(path, content);
  if (checkOnly) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== content) errors.push(relative(root, path));
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, 'utf8');
  }
}

function rewriteLinks(source, sourcePath) {
  return source.replace(/\]\(([^)]+)\)/g, (match, target) => {
    if (/^(?:https?:|mailto:|#|\/)/.test(target)) return match;
    const [filePart, fragment] = target.split('#', 2);
    if (!filePart.endsWith('.md')) return match;
    const absolute = resolve(dirname(sourcePath), filePart);
    const docsRelative = relative(docsRoot, absolute);
    const insideDocs = docsRelative !== '..' && !docsRelative.startsWith(`..${sep}`);
    const route = insideDocs && !docsRelative.startsWith(`archive${sep}`)
      ? `/${docsRelative.replaceAll(sep, '/').replace(/\.md$/, '')}`
      : `https://github.com/yc004/SyncClassroom/blob/main/${relative(root, absolute).replaceAll(sep, '/')}`;
    return `](${route}${fragment ? `#${fragment}` : ''})`;
  });
}

function checkMdxTables(source, sourcePath) {
  source.split('\n').forEach((line, index) => {
    if (!line.startsWith('|')) return;
    for (const match of line.matchAll(/`([^`]+)`/g)) {
      if (/(?<!\\)\|/.test(match[1])) {
        throw new Error(`${relative(root, sourcePath)}:${index + 1}: unescaped | inside table inline code breaks MDX; rewrite the cell`);
      }
    }
  });
}

for (const section of sections) {
  const meta = {};
  for (const [slug, title] of section.pages) {
    const sourcePath = join(docsRoot, section.slug, `${slug}.md`);
    if (!existsSync(sourcePath)) throw new Error(`Missing canonical page: ${sourcePath}`);
    const source = readFileSync(sourcePath, 'utf8');
    checkMdxTables(source, sourcePath);
    const body = rewriteLinks(source, sourcePath);
    const output = `---\ntitle: ${JSON.stringify(title)}\ndescription: ${JSON.stringify('LumeSync 当前维护文档；页面内注明现状或目标设计。')}\n---\n\n${body.trimEnd()}\n`;
    add(join(contentRoot, section.slug, `${slug}.mdx`), output);
    meta[slug] = title;
  }
  add(join(contentRoot, section.slug, '_meta.js'), `// Generated from docs/ by docs-site/scripts/sync-content.mjs.\nexport default ${JSON.stringify(meta, null, 2)}\n`);
}

const rootMeta = { index: { title: '首页', theme: { toc: false } } };
for (const section of sections) rootMeta[section.slug] = section.title;
add(join(contentRoot, '_meta.js'), `// Generated from docs/ by docs-site/scripts/sync-content.mjs.\nexport default ${JSON.stringify(rootMeta, null, 2)}\n`);

if (checkOnly) {
  const expectedTopLevel = new Set(['index.mdx', '_meta.js', ...sections.map(section => section.slug)]);
  for (const name of readdirSync(contentRoot)) {
    if (!expectedTopLevel.has(name)) errors.push(relative(root, join(contentRoot, name)));
  }
  for (const section of sections) {
    const directory = join(contentRoot, section.slug);
    if (!existsSync(directory)) continue;
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      if (!expected.has(path)) errors.push(relative(root, path));
    }
  }
  if (errors.length) {
    console.error(`Documentation site is out of sync:\n${errors.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log('Documentation site is in sync with docs/.');
  }
} else {
  console.log(`Synced ${sections.reduce((count, section) => count + section.pages.length, 0)} pages from docs/.`);
}
