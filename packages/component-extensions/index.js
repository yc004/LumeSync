'use strict';

const crypto = require('node:crypto');
const JSZip = require('jszip');

const PACK_FORMAT = 'lumesync-component-pack';
const PACK_VERSION = '1.0.0';
const MAX_PACK_BYTES = 1024 * 1024;
const MAX_COMPONENTS = 100;
const MAX_TEMPLATE_NODES = 150;
const MAX_TEMPLATE_DEPTH = 10;
const COMPONENT_ID_RE = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*){2,8}$/;
const PACKAGE_ID_RE = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*){1,7}$/;
const VERSION_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const SAFE_TAGS = new Set(['div', 'section', 'article', 'aside', 'header', 'footer', 'h1', 'h2', 'h3', 'h4', 'p', 'span', 'small', 'strong', 'em', 'ul', 'ol', 'li', 'blockquote']);
const SAFE_STYLES = new Set(['display', 'flexDirection', 'alignItems', 'justifyContent', 'gap', 'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'border', 'borderLeft', 'borderRadius', 'backgroundColor', 'color', 'fontSize', 'fontWeight', 'lineHeight', 'textAlign', 'width', 'maxWidth', 'minWidth', 'boxShadow']);
const PROP_TYPES = new Set(['string', 'number', 'boolean', 'color', 'enum']);

class ComponentPackError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ComponentPackError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message) { throw new ComponentPackError(code, message); }
function isRecord(value) { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function exactKeys(value, keys, label) {
  const unknown = Object.keys(value).filter(key => !keys.includes(key));
  if (unknown.length) fail('pack_field_unknown', `${label} 含有不支持的字段：${unknown.join(', ')}`);
}
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function digestText(value) { return `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`; }

function validatePropDefinition(name, definition, componentId) {
  if (!/^[a-z][a-zA-Z0-9_]{0,39}$/.test(name) || !isRecord(definition)) fail('pack_prop_invalid', `${componentId} 的属性定义无效`);
  exactKeys(definition, ['type', 'label', 'default', 'required', 'maxLength', 'min', 'max', 'options'], `属性 ${name}`);
  if (!PROP_TYPES.has(definition.type)) fail('pack_prop_type_invalid', `${componentId}.${name} 使用了不支持的类型`);
  const typeKeys = {
    string: ['maxLength'], number: ['min', 'max'], enum: ['options'], boolean: [], color: []
  }[definition.type];
  if (Object.keys(definition).some(key => !['type', 'label', 'default', 'required', ...typeKeys].includes(key))) {
    fail('pack_prop_field_invalid', `${componentId}.${name} 含有与属性类型不匹配的字段`);
  }
  if (typeof definition.label !== 'string' || !definition.label.trim() || definition.label.length > 80) fail('pack_prop_label_invalid', `${componentId}.${name} 必须提供 1 到 80 字的 label`);
  if (definition.default === undefined) fail('pack_prop_default_invalid', `${componentId}.${name} 必须提供 default`);
  if (definition.required !== undefined && typeof definition.required !== 'boolean') fail('pack_prop_required_invalid', `${componentId}.${name}.required 必须是布尔值`);
  if (definition.type === 'string') {
    if (definition.maxLength !== undefined && (!Number.isInteger(definition.maxLength) || definition.maxLength < 1 || definition.maxLength > 4000)) fail('pack_prop_length_invalid', `${componentId}.${name}.maxLength 超出范围`);
    if (definition.default !== undefined && (typeof definition.default !== 'string' || definition.default.length > (definition.maxLength || 1000))) fail('pack_prop_default_invalid', `${componentId}.${name}.default 无效`);
  } else if (definition.type === 'number') {
    if (definition.min !== undefined && !Number.isFinite(definition.min)) fail('pack_prop_range_invalid', `${componentId}.${name}.min 无效`);
    if (definition.max !== undefined && !Number.isFinite(definition.max)) fail('pack_prop_range_invalid', `${componentId}.${name}.max 无效`);
    if (definition.min !== undefined && definition.max !== undefined && definition.min > definition.max) fail('pack_prop_range_invalid', `${componentId}.${name} 的 min 大于 max`);
    if (definition.min !== undefined && definition.max !== undefined && definition.min > definition.max) fail('pack_prop_range_invalid', `${componentId}.${name} 的 min 大于 max`);
    if (definition.default !== undefined && (typeof definition.default !== 'number' || !Number.isFinite(definition.default))) fail('pack_prop_default_invalid', `${componentId}.${name}.default 无效`);
  } else if (definition.type === 'boolean') {
    if (definition.default !== undefined && typeof definition.default !== 'boolean') fail('pack_prop_default_invalid', `${componentId}.${name}.default 无效`);
  } else if (definition.type === 'color') {
    if (definition.default !== undefined && (typeof definition.default !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(definition.default))) fail('pack_prop_default_invalid', `${componentId}.${name}.default 必须是 #RRGGBB`);
  } else {
    if (!Array.isArray(definition.options) || definition.options.length < 1 || definition.options.length > 30
      || definition.options.some(option => typeof option !== 'string' || !option.trim() || option.length > 80)
      || new Set(definition.options).size !== definition.options.length) fail('pack_prop_options_invalid', `${componentId}.${name}.options 无效`);
    if (definition.default !== undefined && !definition.options.includes(definition.default)) fail('pack_prop_default_invalid', `${componentId}.${name}.default 不在 options 中`);
  }
}

function validateTemplateNode(node, props, componentId, depth, count) {
  if (++count.value > MAX_TEMPLATE_NODES || depth > MAX_TEMPLATE_DEPTH) fail('pack_template_too_large', `${componentId} 的模板超过大小限制`);
  if (!isRecord(node)) fail('pack_template_invalid', `${componentId} 的模板节点必须是对象`);
  if (node.prop !== undefined) {
    exactKeys(node, ['prop'], `模板 ${componentId}`);
    if (typeof node.prop !== 'string' || !props[node.prop]) fail('pack_template_prop_unknown', `${componentId} 的模板引用了未定义属性`);
    if (!['string', 'number', 'boolean', 'enum', 'color'].includes(props[node.prop].type)) fail('pack_template_prop_type_invalid', `${componentId} 的模板属性类型不支持文本渲染`);
    return;
  }
  if (node.text !== undefined) {
    exactKeys(node, ['text'], `模板 ${componentId}`);
    if (typeof node.text !== 'string' || node.text.length > 500) fail('pack_template_text_invalid', `${componentId} 的模板文本无效`);
    return;
  }
  exactKeys(node, ['tag', 'style', 'children'], `模板 ${componentId}`);
  if (!SAFE_TAGS.has(node.tag)) fail('pack_template_tag_invalid', `${componentId} 使用了不支持的 HTML 标签`);
  if (node.style !== undefined) {
    if (!isRecord(node.style) || Object.keys(node.style).length > 24) fail('pack_template_style_invalid', `${componentId} 的样式无效`);
    for (const [key, value] of Object.entries(node.style)) {
      if (!SAFE_STYLES.has(key)) fail('pack_template_style_invalid', `${componentId} 使用了不支持的样式属性 ${key}`);
      if (typeof value === 'string') {
        if (!value.trim() || value.length > 120 || /url\s*\(|expression\s*\(|javascript:|@import|[;{}<>]/i.test(value)) fail('pack_template_style_invalid', `${componentId} 的样式值无效`);
      } else if (isRecord(value) && Object.keys(value).length === 1 && typeof value.prop === 'string') {
        if (!props[value.prop] || !['color', 'number'].includes(props[value.prop].type)) fail('pack_template_style_prop_invalid', `${componentId} 的样式引用了不支持的属性`);
      } else fail('pack_template_style_invalid', `${componentId} 的样式值必须是字符串或属性引用`);
    }
  }
  if (node.children !== undefined) {
    if (!Array.isArray(node.children) || node.children.length > 40) fail('pack_template_children_invalid', `${componentId} 的 children 无效`);
    node.children.forEach(child => validateTemplateNode(child, props, componentId, depth + 1, count));
  }
}

function validateComponentPack(input) {
  if (!isRecord(input)) fail('pack_invalid', '组件包必须是 JSON 对象');
  exactKeys(input, ['format', 'formatVersion', 'id', 'version', 'displayName', 'description', 'components'], '组件包');
  if (input.format !== PACK_FORMAT || input.formatVersion !== PACK_VERSION) fail('pack_version_unsupported', '组件包格式或版本不受支持');
  if (typeof input.id !== 'string' || !PACKAGE_ID_RE.test(input.id)) fail('pack_id_invalid', '组件包 ID 必须使用反向域名格式，例如 org.school.science');
  if (typeof input.version !== 'string' || !VERSION_RE.test(input.version)) fail('pack_version_invalid', '组件包版本必须是 semver');
  if (typeof input.displayName !== 'string' || !input.displayName.trim() || input.displayName.length > 100) fail('pack_name_invalid', '组件包 displayName 无效');
  if (input.description !== undefined && (typeof input.description !== 'string' || input.description.length > 1000)) fail('pack_description_invalid', '组件包说明不能超过 1000 字');
  if (!Array.isArray(input.components) || input.components.length < 1 || input.components.length > MAX_COMPONENTS) fail('pack_components_invalid', `组件包必须包含 1 到 ${MAX_COMPONENTS} 个组件`);
  const componentIds = new Set();
  for (const component of input.components) {
    if (!isRecord(component)) fail('component_invalid', '组件定义必须是对象');
    exactKeys(component, ['id', 'label', 'description', 'props', 'template'], '组件定义');
    if (typeof component.id !== 'string' || !COMPONENT_ID_RE.test(component.id) || !component.id.startsWith(`${input.id}.`)) fail('component_id_invalid', '组件 ID 必须属于组件包命名空间');
    if (componentIds.has(component.id)) fail('component_id_duplicate', `组件 ID 重复：${component.id}`);
    componentIds.add(component.id);
    if (typeof component.label !== 'string' || !component.label.trim() || component.label.length > 80) fail('component_label_invalid', `${component.id} 的 label 无效`);
    if (component.description !== undefined && (typeof component.description !== 'string' || component.description.length > 500)) fail('component_description_invalid', `${component.id} 的 description 无效`);
    if (!isRecord(component.props) || Object.keys(component.props).length > 24) fail('component_props_invalid', `${component.id} 最多支持 24 个属性`);
    for (const [name, definition] of Object.entries(component.props)) validatePropDefinition(name, definition, component.id);
    validateTemplateNode(component.template, component.props, component.id, 0, { value: 0 });
  }
  return input;
}

function componentPackHash(pack) {
  validateComponentPack(pack);
  return digestText(`${stableStringify(pack)}\n`);
}

function createStarterComponentPack(id, displayName, version = '1.0.0') {
  const pack = {
    format: PACK_FORMAT,
    formatVersion: PACK_VERSION,
    id,
    version,
    displayName,
    description: '由 LumeSync 组件开发工具创建。',
    components: [{
      id: `${id}.fact-card`,
      label: '知识卡片',
      description: '一个可编辑标题、正文和强调色的卡片。',
      props: {
        title: { type: 'string', label: '标题', default: '新知识', required: true, maxLength: 120 },
        body: { type: 'string', label: '正文', default: '在这里编写内容。', maxLength: 1000 },
        accent: { type: 'color', label: '强调色', default: '#3355AA' }
      },
      template: {
        tag: 'article',
        style: { padding: '20px', borderLeft: '6px solid #3355AA', backgroundColor: '#ffffff' },
        children: [
          { tag: 'h2', style: { color: { prop: 'accent' } }, children: [{ prop: 'title' }] },
          { tag: 'p', children: [{ prop: 'body' }] }
        ]
      }
    }]
  };
  return validateComponentPack(pack);
}

function validateComponentProps(component, value) {
  if (!isRecord(value)) fail('component_props_invalid', `${component.id} 的 props 必须是对象`);
  exactKeys(value, Object.keys(component.props), `${component.id}.props`);
  for (const [name, definition] of Object.entries(component.props)) {
    const current = value[name];
    if (current === undefined) {
      if (definition.required && definition.default === undefined) fail('component_prop_required', `${component.label} 缺少必填属性 ${definition.label}`);
      continue;
    }
    if (definition.type === 'string' && (typeof current !== 'string' || current.length > (definition.maxLength || 1000))) fail('component_prop_invalid', `${component.label} 的 ${definition.label} 无效`);
    if (definition.type === 'number' && (typeof current !== 'number' || !Number.isFinite(current) || (definition.min !== undefined && current < definition.min) || (definition.max !== undefined && current > definition.max))) fail('component_prop_invalid', `${component.label} 的 ${definition.label} 超出范围`);
    if (definition.type === 'boolean' && typeof current !== 'boolean') fail('component_prop_invalid', `${component.label} 的 ${definition.label} 必须是布尔值`);
    if (definition.type === 'color' && (typeof current !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(current))) fail('component_prop_invalid', `${component.label} 的 ${definition.label} 必须是 #RRGGBB`);
    if (definition.type === 'enum' && !definition.options.includes(current)) fail('component_prop_invalid', `${component.label} 的 ${definition.label} 选项无效`);
  }
  return value;
}

async function readComponentPack(input) {
  if (!(Buffer.isBuffer(input) || input instanceof Uint8Array) || input.byteLength > MAX_PACK_BYTES + 64 * 1024) {
    fail('pack_too_large', '组件包压缩文件超过 1 MiB + 64 KiB 限制');
  }
  let zip;
  try { zip = await JSZip.loadAsync(input, { checkCRC32: true, createFolders: false }); }
  catch (error) { throw new ComponentPackError('pack_zip_invalid', '无法读取 .lumex ZIP 包', { cause: error.message }); }
  const entries = Object.entries(zip.files);
  const files = entries.filter(([, entry]) => !entry.dir);
  if (entries.length !== 1 || files.length !== 1 || files[0][0] !== 'extension.json') fail('pack_entries_invalid', '.lumex 目前只能包含根目录 extension.json');
  if (files[0][1]._data?.uncompressedSize > MAX_PACK_BYTES) fail('pack_too_large', '组件包超过 1 MiB 限制');
  const text = await files[0][1].async('string');
  if (Buffer.byteLength(text, 'utf8') > MAX_PACK_BYTES) fail('pack_too_large', '组件包超过 1 MiB 限制');
  let pack;
  try { pack = JSON.parse(text); } catch { fail('pack_json_invalid', 'extension.json 不是合法 JSON'); }
  validateComponentPack(pack);
  return { pack, hash: componentPackHash(pack), text: `${JSON.stringify(pack, null, 2)}\n` };
}

async function writeComponentPack(pack, options = {}) {
  validateComponentPack(pack);
  const text = `${JSON.stringify(pack, null, 2)}\n`;
  if (Buffer.byteLength(text, 'utf8') > MAX_PACK_BYTES) fail('pack_too_large', '组件包超过 1 MiB 限制');
  const zip = new JSZip();
  zip.file('extension.json', text);
  return zip.generateAsync({ type: options.outputType || 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

module.exports = {
  PACK_FORMAT, PACK_VERSION, MAX_PACK_BYTES, SAFE_TAGS, SAFE_STYLES,
  ComponentPackError, stableStringify, validateComponentPack, componentPackHash, createStarterComponentPack,
  validateComponentProps, readComponentPack, writeComponentPack
};
