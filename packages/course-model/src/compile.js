'use strict';

const {
  CourseModelError,
  assertValidCourseDocument,
  getComponentCatalog,
  packList,
} = require('./document');
const { componentPackHash } = require('../../component-extensions');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function escapeScriptText(value) {
  return JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function comparePath(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function displayPropValue(value) { return value === true ? '是' : value === false ? '否' : value ?? ''; }

const toneColors = {
  info: ['#eaf1ff', '#26428b'],
  tip: ['#e7f7ef', '#175c36'],
  warning: ['#fff4dc', '#77510a']
};

function renderTemplateHtml(node, props) {
  if (node.prop !== undefined) return escapeHtml(displayPropValue(props[node.prop]));
  if (node.text !== undefined) return escapeHtml(node.text);
  const style = Object.entries(node.style || {}).map(([key, value]) => {
    const cssName = key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
    const cssValue = typeof value === 'object' ? props[value.prop] : value;
    return `${cssName}:${escapeHtml(cssValue ?? '')}`;
  }).join(';');
  return `<${node.tag}${style ? ` style="${style}"` : ''}>${(node.children || []).map(child => renderTemplateHtml(child, props)).join('')}</${node.tag}>`;
}

function renderBlockHtml(block, options = {}) {
  const props = block.props;
  switch (block.type) {
    case 'core.heading': {
      const tag = `h${props.level}`;
      return `<${tag}>${escapeHtml(props.text)}</${tag}>`;
    }
    case 'core.paragraph':
      return `<p>${escapeHtml(props.text).replace(/\n/g, '<br>')}</p>`;
    case 'core.bullets':
      return `<ul>${props.items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
    case 'core.callout': {
      const [background, color] = toneColors[props.tone];
      const title = props.title ? `<strong>${escapeHtml(props.title)}</strong>` : '';
      return `<aside class="callout ${props.tone}" style="background:${background};color:${color}">${title}<p>${escapeHtml(props.text).replace(/\n/g, '<br>')}</p></aside>`;
    }
    default: {
      const definition = getComponentCatalog(options.componentPacks, options.extensions)[block.type];
      if (!definition?.extension || !definition.template) throw new CourseModelError('component_unknown', `无法预览未安装的组件：${block.type}`);
      return renderTemplateHtml(definition.template, { ...definition.defaults, ...props });
    }
  }
}

function renderPageHtml(document, pageId, options = {}) {
  assertValidCourseDocument(document, options);
  const page = document.pages.find(item => item.id === pageId);
  if (!page) throw new CourseModelError('page_not_found', `找不到页面：${pageId}`);
  const theme = document.theme;
  const renderOptions = { ...options, extensions: document.extensions || [] };
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;font-family:Inter,"PingFang SC","Microsoft YaHei",sans-serif;background:${theme.background};color:${theme.text}}
    body{padding:5%;display:flex;align-items:center;justify-content:center}.slide{width:100%;height:100%;max-width:1280px;max-height:720px;overflow:auto;padding:5% 7%;border-radius:20px;background:${theme.surface};box-shadow:0 16px 60px #15213a18}
    h1,h2,h3{line-height:1.18;margin:.15em 0 .6em;color:${theme.text}}h1{font-size:clamp(2rem,5vw,4.2rem)}h2{font-size:clamp(1.7rem,4vw,3rem)}h3{font-size:clamp(1.4rem,3vw,2.2rem)}p,li{font-size:clamp(1rem,2vw,1.7rem);line-height:1.65;white-space:pre-wrap}ul{padding-left:1.3em}.callout{padding:1em 1.2em;border-radius:12px;margin:1em 0}.callout p{margin:.4em 0 0}
    </style><body><main class="slide" aria-label="${escapeHtml(page.title)}">${page.blocks.map(block => renderBlockHtml(block, renderOptions)).join('')}</main></body></html>`;
}

function compileTemplateTsx(node, props) {
  if (node.prop !== undefined) return `{${escapeScriptText(displayPropValue(props[node.prop]))}}`;
  if (node.text !== undefined) return `{${escapeScriptText(node.text)}}`;
  const style = Object.entries(node.style || {}).map(([key, value]) => {
    const resolved = typeof value === 'object' ? props[value.prop] : value;
    return `${key}:${escapeScriptText(resolved ?? '')}`;
  }).join(',');
  const styleAttr = style ? ` style={{${style}}}` : '';
  return `<${node.tag}${styleAttr}>${(node.children || []).map(child => compileTemplateTsx(child, props)).join('')}</${node.tag}>`;
}

function renderBlockTsx(block, options = {}) {
  const p = block.props;
  switch (block.type) {
    case 'core.heading':
      return `<h${p.level} style={{margin:0,marginBottom:'0.65em',fontSize:${escapeScriptText(p.level === 1 ? 'clamp(2rem,5vw,4.2rem)' : p.level === 2 ? 'clamp(1.7rem,4vw,3rem)' : 'clamp(1.4rem,3vw,2.2rem)' )},lineHeight:1.18}}>{${escapeScriptText(p.text)}}</h${p.level}>`;
    case 'core.paragraph':
      return `<p style={{fontSize:'clamp(1rem,2vw,1.7rem)',lineHeight:1.65,whiteSpace:'pre-wrap'}}>{${escapeScriptText(p.text)}}</p>`;
    case 'core.bullets':
      return `<ul style={{paddingLeft:'1.3em'}}>${p.items.map(item => `<li style={{fontSize:'clamp(1rem,2vw,1.7rem)',lineHeight:1.65}}>{${escapeScriptText(item)}}</li>`).join('')}</ul>`;
    case 'core.callout': {
      const [background, color] = toneColors[p.tone];
      return `<aside style={{background:${escapeScriptText(background)},color:${escapeScriptText(color)},padding:'1em 1.2em',borderRadius:12,margin:'1em 0'}}>${p.title ? `<strong>{${escapeScriptText(p.title)}}</strong>` : ''}<p style={{margin:'0.4em 0 0',fontSize:'clamp(1rem,2vw,1.7rem)',lineHeight:1.65,whiteSpace:'pre-wrap'}}>{${escapeScriptText(p.text)}}</p></aside>`;
    }
    default: {
      const definition = getComponentCatalog(options.componentPacks, options.extensions)[block.type];
      if (!definition?.extension || !definition.template) throw new CourseModelError('component_unknown', `无法编译未安装的组件：${block.type}`);
      return compileTemplateTsx(definition.template, { ...definition.defaults, ...p });
    }
  }
}

function compilePageTsx(document, pageId, options = {}) {
  assertValidCourseDocument(document, options);
  const page = document.pages.find(item => item.id === pageId);
  if (!page) throw new CourseModelError('page_not_found', `找不到页面：${pageId}`);
  const { background, surface, text } = document.theme;
  return `import React from 'react';\n\nexport default function LumeSlide() {\n  return (\n    <main aria-label={${escapeScriptText(page.title)}} style={{boxSizing:'border-box',width:'100%',height:'100%',overflow:'auto',padding:'5% 7%',background:${escapeScriptText(surface)},color:${escapeScriptText(text)},fontFamily:'Inter, PingFang SC, Microsoft YaHei, sans-serif'}}>\n      ${page.blocks.map(block => renderBlockTsx(block, { ...options, extensions: document.extensions || [] })).join('\n      ')}\n    </main>\n  );\n}\n`;
}

function sourceFilesForDocument(document, options = {}) {
  assertValidCourseDocument(document, options);
  const metadata = {
    format: document.format,
    formatVersion: document.formatVersion,
    id: document.id,
    title: document.title,
    description: document.description,
    aspectRatio: document.aspectRatio,
    theme: document.theme,
    pageOrder: document.pages.map(page => page.id)
  };
  if (document.extensions?.length) metadata.extensions = document.extensions;
  const files = new Map([['source/course.json', `${JSON.stringify(metadata, null, 2)}\n`]]);
  for (const page of document.pages) files.set(`source/pages/${page.id}.json`, `${JSON.stringify(page, null, 2)}\n`);
  const packs = packList(options.componentPacks);
  for (const extension of metadata.extensions || []) {
    const entry = packs.find(candidate => (candidate.pack || candidate).id === extension.id && (candidate.pack || candidate).version === extension.version);
    if (!entry) throw new CourseModelError('extension_missing', `缺少组件包：${extension.id}@${extension.version}`);
    const pack = entry.pack || entry;
    const hash = entry.hash || componentPackHash(pack);
    if (hash !== extension.hash || componentPackHash(pack) !== extension.hash) throw new CourseModelError('extension_hash_mismatch', `组件包摘要不匹配：${extension.id}`);
    files.set(`source/extensions/${extension.id}.json`, `${JSON.stringify(pack, null, 2)}\n`);
  }
  return files;
}

async function sha256Text(value) {
  const bytes = new TextEncoder().encode(value);
  if (globalThis.crypto?.subtle?.digest) {
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
    return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
  }
  return require('node:crypto').createHash('sha256').update(bytes).digest('hex');
}

async function buildCourseDocument(document, options = {}) {
  assertValidCourseDocument(document, options);
  const files = sourceFilesForDocument(document, options);
  const pages = document.pages.map(page => ({
    id: page.id,
    title: page.title,
    file: `slides/${page.id}.tsx`
  }));
  for (const page of document.pages) files.set(`slides/${page.id}.tsx`, compilePageTsx(document, page.id, options));
  const sourceHashInput = [...files.entries()]
    .filter(([name]) => name.startsWith('source/'))
    .sort(([a], [b]) => comparePath(a, b))
    .map(([name, content]) => `${name}\n${content}`)
    .join('\n');
  const inputDigest = await sha256Text(sourceHashInput);
  const outputHashInput = [...files.entries()]
    .filter(([name]) => name.startsWith('slides/'))
    .sort(([a], [b]) => comparePath(a, b))
    .map(([name, content]) => `${name}\n${content}`)
    .join('\n');
  const outputDigest = await sha256Text(outputHashInput);
  files.set('build/build-manifest.json', `${JSON.stringify({
    format: 'lumesync-build-manifest',
    version: '1.0.0',
    compiler: '@lumesync/course-model@0.1.0',
    inputDigest: `sha256:${inputDigest}`,
    outputDigest: `sha256:${outputDigest}`,
    targets: ['lumesync-tsx-v1'],
    pages: pages.map(page => ({ id: page.id, source: `source/pages/${page.id}.json`, output: page.file }))
  }, null, 2)}\n`);
  return { pages, files };
}

module.exports = { escapeHtml, renderBlockHtml, renderPageHtml, compilePageTsx, sourceFilesForDocument, buildCourseDocument };
