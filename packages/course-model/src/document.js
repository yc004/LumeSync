'use strict';

const DOCUMENT_FORMAT = 'lumesync-course-document';
const DOCUMENT_VERSION = '1.0.0';
const MAX_PAGES = 500;
const MAX_BLOCKS_PER_PAGE = 100;
const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const { validateComponentPack, componentPackHash, validateComponentProps } = require('../../component-extensions');

class CourseModelError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'CourseModelError';
    this.code = code;
    this.details = details;
  }
}

const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value);
const clone = value => JSON.parse(JSON.stringify(value));

function rejectUnknownKeys(value, allowed, path, add) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) add(`${path}.${key}`, 'field_unknown', `字段 ${key} 不在当前文档版本中`);
  }
}

function makeId(prefix = 'item') {
  const random = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}-${random}`;
}

const componentDefinitions = Object.freeze({
  'core.heading': {
    label: '标题',
    props: ['text', 'level'],
    defaults: { text: '新标题', level: 1 },
    validate(props, path, add) {
      requireText(props, 'text', path, add, { max: 500 });
      if (![1, 2, 3].includes(props.level)) add(`${path}.level`, 'heading_level_invalid', '标题级别必须为 1、2 或 3');
    }
  },
  'core.paragraph': {
    label: '正文',
    props: ['text'],
    defaults: { text: '在这里输入正文。' },
    validate(props, path, add) { requireText(props, 'text', path, add, { max: 10000 }); }
  },
  'core.bullets': {
    label: '要点列表',
    props: ['items'],
    defaults: { items: ['第一个要点', '第二个要点'] },
    validate(props, path, add) {
      if (!Array.isArray(props.items) || props.items.length < 1 || props.items.length > 50
        || props.items.some(item => typeof item !== 'string' || item.length > 1000)) {
        add(`${path}.items`, 'bullet_items_invalid', '要点必须是 1 到 50 条、每条不超过 1000 字的文本');
      }
    }
  },
  'core.callout': {
    label: '提示框',
    props: ['title', 'text', 'tone'],
    defaults: { title: '提示', text: '补充说明', tone: 'info' },
    validate(props, path, add) {
      requireText(props, 'text', path, add, { max: 5000 });
      if (props.title !== undefined && (typeof props.title !== 'string' || props.title.length > 200)) {
        add(`${path}.title`, 'callout_title_invalid', '提示框标题必须是不超过 200 字的文本');
      }
      if (!['info', 'tip', 'warning'].includes(props.tone)) add(`${path}.tone`, 'callout_tone_invalid', '提示框类型必须是 info、tip 或 warning');
    }
  }
});

function requireText(props, key, path, add, { max }) {
  if (typeof props[key] !== 'string' || props[key].trim().length === 0 || props[key].length > max) {
    add(`${path}.${key}`, 'text_invalid', `${key} 必须是 1 到 ${max} 字的文本`);
  }
}

function packList(componentPacks) {
  if (!componentPacks) return [];
  if (componentPacks instanceof Map) return [...componentPacks.values()];
  return Array.isArray(componentPacks) ? componentPacks : [];
}

function comparePackVersions(left, right) {
  const [leftCore, leftPre = ''] = left.split('-', 2);
  const [rightCore, rightPre = ''] = right.split('-', 2);
  const leftParts = leftCore.split('.').map(Number);
  const rightParts = rightCore.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  if (!leftPre && rightPre) return 1;
  if (leftPre && !rightPre) return -1;
  return leftPre.localeCompare(rightPre);
}

function getComponentCatalog(componentPacks = [], extensionRefs = []) {
  const catalog = { ...componentDefinitions };
  const selectedVersions = new Map((Array.isArray(extensionRefs) ? extensionRefs : [])
    .filter(item => isRecord(item) && typeof item.id === 'string' && typeof item.version === 'string')
    .map(item => [item.id, item.version]));
  const entries = packList(componentPacks).map(entry => ({ entry, pack: entry.pack || entry }))
    .sort((a, b) => {
      const selected = Number(selectedVersions.get(b.pack.id) === b.pack.version) - Number(selectedVersions.get(a.pack.id) === a.pack.version);
      return selected || comparePackVersions(b.pack.version, a.pack.version);
    });
  const chosenPackVersions = new Map();
  for (const { pack } of entries) if (!chosenPackVersions.has(pack.id)) chosenPackVersions.set(pack.id, pack.version);
  const componentOwners = new Map();
  for (const { entry, pack } of entries) {
    if (chosenPackVersions.get(pack.id) !== pack.version) continue;
    validateComponentPack(pack);
    const hash = entry.hash || componentPackHash(pack);
    if (hash !== componentPackHash(pack)) throw new CourseModelError('component_pack_hash_invalid', `组件包摘要不匹配：${pack.id}`);
    for (const component of pack.components) {
      const owner = componentOwners.get(component.id);
      if (owner) {
        if (owner.id !== pack.id) throw new CourseModelError('component_id_conflict', `组件 ID 已被占用：${component.id}`);
        if (owner.version === pack.version && owner.hash !== hash) throw new CourseModelError('component_pack_conflict', `同一版本的组件包 hash 不同：${pack.id}@${pack.version}`);
        continue;
      }
      componentOwners.set(component.id, { id: pack.id, version: pack.version, hash });
      catalog[component.id] = {
        label: component.label,
        description: component.description || '',
        props: Object.keys(component.props),
        fields: component.props,
        defaults: Object.fromEntries(Object.entries(component.props).filter(([, def]) => def.default !== undefined).map(([name, def]) => [name, def.default])),
        extension: { id: pack.id, version: pack.version, hash },
        template: component.template,
        validate(props, path, add) {
          try { validateComponentProps(component, props); }
          catch (error) { add(path, error.code || 'component_prop_invalid', error.message); }
        }
      };
    }
  }
  return catalog;
}

function validateCourseDocument(document, options = {}) {
  const errors = [];
  const add = (path, code, message) => errors.push({ path, code, message });
  if (!isRecord(document)) {
    return { ok: false, errors: [{ path: 'document', code: 'document_not_object', message: '课件文档必须是 JSON 对象' }], value: null };
  }
  if (document.format !== DOCUMENT_FORMAT) add('format', 'document_format_unsupported', `format 必须是 ${DOCUMENT_FORMAT}`);
  if (document.formatVersion !== DOCUMENT_VERSION) add('formatVersion', 'document_version_unsupported', `仅支持文档版本 ${DOCUMENT_VERSION}`);
  rejectUnknownKeys(document, ['format', 'formatVersion', 'id', 'title', 'description', 'aspectRatio', 'theme', 'pages', 'extensions'], 'document', add);
  if (typeof document.id !== 'string' || !ID_PATTERN.test(document.id)) add('id', 'course_id_invalid', '课件 ID 必须为 1 到 128 位安全字符');
  if (typeof document.title !== 'string' || !document.title.trim() || document.title.length > 200) add('title', 'course_title_invalid', '课件标题必须为 1 到 200 字');
  if (document.aspectRatio !== '16:9') add('aspectRatio', 'aspect_ratio_unsupported', '当前版本仅支持 16:9 页面比例');
  if (typeof document.description !== 'string' || document.description.length > 2000) {
    add('description', 'course_description_invalid', '课件说明必须为不超过 2000 字的文本');
  }
  if (!isRecord(document.theme)) add('theme', 'theme_invalid', 'theme 必须是对象');
  else {
    rejectUnknownKeys(document.theme, ['background', 'surface', 'text', 'accent'], 'theme', add);
    for (const key of ['background', 'surface', 'text', 'accent']) {
      if (typeof document.theme[key] !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(document.theme[key])) {
        add(`theme.${key}`, 'theme_color_invalid', `${key} 必须是 #RRGGBB 颜色`);
      }
    }
  }
  const extensions = document.extensions === undefined ? [] : document.extensions;
  const packs = packList(options.componentPacks);
  const catalog = {};
  try { Object.assign(catalog, getComponentCatalog(packs, extensions)); }
  catch (error) { add('extensions', error.code || 'component_pack_invalid', error.message); }
  if (!Array.isArray(extensions) || extensions.length > 50) add('extensions', 'extensions_invalid', '组件扩展锁最多包含 50 个包');
  const extensionKeys = new Set();
  const extensionIds = new Set();
  if (Array.isArray(extensions)) extensions.forEach((extension, index) => {
    const path = `extensions[${index}]`;
    if (!isRecord(extension)) return add(path, 'extension_invalid', '扩展锁条目必须是对象');
    rejectUnknownKeys(extension, ['id', 'version', 'hash'], path, add);
    if (typeof extension.id !== 'string' || !/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*){1,7}$/.test(extension.id)
      || typeof extension.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(extension.version)
      || typeof extension.hash !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(extension.hash)) {
      add(path, 'extension_invalid', '扩展锁必须包含有效的 id、version 和 sha256 hash');
      return;
    }
    const key = `${extension.id}@${extension.version}`;
    if (extensionKeys.has(key)) add(`${path}.id`, 'extension_duplicate', `扩展锁重复：${key}`);
    if (extensionIds.has(extension.id)) add(`${path}.id`, 'extension_version_conflict', `一个课件不能同时锁定组件包 ${extension.id} 的多个版本`);
    extensionKeys.add(key);
    extensionIds.add(extension.id);
    const installed = packs.find(entry => (entry.pack || entry).id === extension.id && (entry.pack || entry).version === extension.version);
    if (!installed || (installed.hash || componentPackHash(installed.pack || installed)) !== extension.hash) add(path, 'extension_missing', `缺少锁定的组件包 ${key}`);
  });
  if (!Array.isArray(document.pages) || document.pages.length < 1 || document.pages.length > MAX_PAGES) {
    add('pages', 'pages_invalid', `课件必须包含 1 到 ${MAX_PAGES} 页`);
  } else {
    const pageIds = new Set();
    document.pages.forEach((page, pageIndex) => {
      const path = `pages[${pageIndex}]`;
      if (!isRecord(page)) return add(path, 'page_not_object', '页面必须是对象');
      rejectUnknownKeys(page, ['id', 'title', 'blocks'], path, add);
      if (typeof page.id !== 'string' || !ID_PATTERN.test(page.id)) add(`${path}.id`, 'page_id_invalid', '页面 ID 格式无效');
      else if (pageIds.has(page.id)) add(`${path}.id`, 'page_id_duplicate', `页面 ID 重复：${page.id}`);
      else pageIds.add(page.id);
      if (typeof page.title !== 'string' || !page.title.trim() || page.title.length > 200) add(`${path}.title`, 'page_title_invalid', '页面标题必须为 1 到 200 字');
      if (!Array.isArray(page.blocks) || page.blocks.length > MAX_BLOCKS_PER_PAGE) {
        add(`${path}.blocks`, 'blocks_invalid', `页面最多允许 ${MAX_BLOCKS_PER_PAGE} 个内容块`);
        return;
      }
      const blockIds = new Set();
      page.blocks.forEach((block, blockIndex) => {
        const blockPath = `${path}.blocks[${blockIndex}]`;
        if (!isRecord(block)) return add(blockPath, 'block_not_object', '内容块必须是对象');
        rejectUnknownKeys(block, ['id', 'type', 'props'], blockPath, add);
        if (typeof block.id !== 'string' || !ID_PATTERN.test(block.id)) add(`${blockPath}.id`, 'block_id_invalid', '内容块 ID 格式无效');
        else if (blockIds.has(block.id)) add(`${blockPath}.id`, 'block_id_duplicate', `内容块 ID 重复：${block.id}`);
        else blockIds.add(block.id);
        const definition = catalog[block.type];
        if (!definition) return add(`${blockPath}.type`, 'component_unknown', `未安装标准组件：${String(block.type)}`);
        if (definition.extension && !extensionKeys.has(`${definition.extension.id}@${definition.extension.version}`)) {
          add(`${blockPath}.type`, 'extension_not_locked', `组件 ${block.type} 所属扩展未写入课件锁文件`);
        }
        if (!isRecord(block.props)) return add(`${blockPath}.props`, 'component_props_invalid', '组件 props 必须是对象');
        for (const key of Object.keys(block.props)) {
          if (!definition.props.includes(key)) add(`${blockPath}.props.${key}`, 'component_prop_unknown', `组件 ${block.type} 不支持属性 ${key}`);
        }
        definition.validate(block.props, `${blockPath}.props`, add);
      });
    });
  }
  return { ok: errors.length === 0, errors, value: errors.length === 0 ? document : null };
}

function assertValidCourseDocument(document, options = {}) {
  const result = validateCourseDocument(document, options);
  if (!result.ok) {
    throw new CourseModelError('document_invalid', `课件文档校验失败：${result.errors.map(item => `${item.path}: ${item.message}`).join('; ')}`, { errors: result.errors });
  }
  return document;
}

function createCourseDocument(input = {}, options = {}) {
  const id = input.id || makeId('course');
  const firstPageId = makeId('page');
  const firstHeadingId = makeId('block');
  const firstParagraphId = makeId('block');
  const document = {
    format: DOCUMENT_FORMAT,
    formatVersion: DOCUMENT_VERSION,
    id,
    title: input.title || '未命名课件',
    description: input.description || '',
    aspectRatio: '16:9',
    theme: { background: '#f5f7fb', surface: '#ffffff', text: '#182230', accent: '#4361ee', ...(input.theme || {}) },
    extensions: [],
    pages: input.pages || [{
      id: firstPageId,
      title: '第一页',
      blocks: [
        { id: firstHeadingId, type: 'core.heading', props: { text: input.title || '新课件', level: 1 } },
        { id: firstParagraphId, type: 'core.paragraph', props: { text: '选择一个内容块开始编辑。' } }
      ]
    }]
  };
  if (options.validate !== false) assertValidCourseDocument(document);
  return document;
}

module.exports = {
  DOCUMENT_FORMAT,
  DOCUMENT_VERSION,
  MAX_PAGES,
  MAX_BLOCKS_PER_PAGE,
  CourseModelError,
  componentDefinitions,
  getComponentCatalog,
  packList,
  makeId,
  clone,
  rejectUnknownKeys,
  validateCourseDocument,
  assertValidCourseDocument,
  createCourseDocument
};
