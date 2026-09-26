'use strict';

const {
  CourseModelError,
  assertValidCourseDocument,
  getComponentCatalog,
  clone,
  makeId
} = require('./document');
const { componentPackHash, validateComponentPack } = require('../../component-extensions');

function requirePage(document, pageId) {
  const index = document.pages.findIndex(page => page.id === pageId);
  if (index < 0) throw new CourseModelError('page_not_found', `找不到页面：${pageId}`);
  return { page: document.pages[index], index };
}

function requireBlock(page, blockId) {
  const index = page.blocks.findIndex(block => block.id === blockId);
  if (index < 0) throw new CourseModelError('block_not_found', `找不到内容块：${blockId}`);
  return { block: page.blocks[index], index };
}

function boundedIndex(value, length, { insertion = false } = {}) {
  const max = insertion ? length : Math.max(0, length - 1);
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new CourseModelError('index_invalid', `位置必须是 0 到 ${max} 的整数`);
  }
  return value;
}

function requireCommandKeys(command, allowed) {
  const unknown = Object.keys(command).filter(key => !allowed.includes(key));
  if (unknown.length) throw new CourseModelError('command_field_forbidden', `命令包含不支持的字段：${unknown.join(', ')}`);
}

function applyCommand(document, command, options = {}) {
  if (!command || typeof command !== 'object' || typeof command.type !== 'string') {
    throw new CourseModelError('command_invalid', '编辑命令必须包含 type');
  }
  const next = clone(document);
  switch (command.type) {
    case 'course.update': {
      requireCommandKeys(command, ['type', 'patch']);
      const patch = command.patch;
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new CourseModelError('patch_invalid', '课件更新 patch 必须是对象');
      for (const key of Object.keys(patch)) {
        if (!['title', 'description', 'theme'].includes(key)) throw new CourseModelError('patch_field_forbidden', `不允许更新课件字段：${key}`);
      }
      Object.assign(next, patch);
      break;
    }
    case 'course.extension.add': {
      requireCommandKeys(command, ['type', 'extension']);
      const extension = command.extension;
      if (!extension || typeof extension !== 'object' || Array.isArray(extension)) throw new CourseModelError('extension_invalid', '扩展锁条目必须是对象');
      if (!Array.isArray(next.extensions)) next.extensions = [];
      if (next.extensions.some(item => item.id === extension.id && item.version === extension.version)) break;
      next.extensions.push(clone(extension));
      break;
    }
    case 'course.extension.remove': {
      requireCommandKeys(command, ['type', 'id', 'version']);
      const usage = next.pages.flatMap(page => page.blocks).some(block => {
        const component = getComponentCatalog(options.componentPacks)[block.type];
        return component?.extension?.id === command.id && component?.extension?.version === command.version;
      });
      if (usage) throw new CourseModelError('extension_in_use', '仍有内容块使用该组件包，先删除这些内容块后再移除扩展。');
      next.extensions = (next.extensions || []).filter(item => !(item.id === command.id && item.version === command.version));
      break;
    }
    case 'page.add': {
      requireCommandKeys(command, ['type', 'page', 'index']);
      if (!command.page || typeof command.page !== 'object') throw new CourseModelError('page_invalid', 'page.add 需要页面对象');
      const page = clone(command.page);
      page.id = makeId('page');
      if (page.blocks === undefined) page.blocks = [];
      if (!Array.isArray(page.blocks)) throw new CourseModelError('blocks_invalid', 'page.add 的 blocks 必须是数组');
      page.blocks = page.blocks.map(block => {
        const copy = clone(block);
        copy.id = makeId('block');
        return copy;
      });
      const index = command.index === undefined ? next.pages.length : boundedIndex(command.index, next.pages.length, { insertion: true });
      next.pages.splice(index, 0, page);
      break;
    }
    case 'page.update': {
      requireCommandKeys(command, ['type', 'pageId', 'patch']);
      const { page } = requirePage(next, command.pageId);
      const patch = command.patch;
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new CourseModelError('patch_invalid', 'page.update patch 必须是对象');
      for (const key of Object.keys(patch)) {
        if (!['title'].includes(key)) throw new CourseModelError('patch_field_forbidden', `不允许更新页面字段：${key}`);
      }
      Object.assign(page, patch);
      break;
    }
    case 'page.move': {
      requireCommandKeys(command, ['type', 'pageId', 'toIndex']);
      const { page, index: oldIndex } = requirePage(next, command.pageId);
      const newIndex = boundedIndex(command.toIndex, next.pages.length);
      next.pages.splice(oldIndex, 1);
      next.pages.splice(newIndex, 0, page);
      break;
    }
    case 'page.remove': {
      requireCommandKeys(command, ['type', 'pageId']);
      if (next.pages.length <= 1) throw new CourseModelError('last_page_required', '课件至少要保留一页');
      const { index } = requirePage(next, command.pageId);
      next.pages.splice(index, 1);
      break;
    }
    case 'block.add': {
      requireCommandKeys(command, ['type', 'pageId', 'block', 'index']);
      const { page } = requirePage(next, command.pageId);
      if (!command.block || typeof command.block !== 'object') throw new CourseModelError('block_invalid', 'block.add 需要内容块对象');
      const block = clone(command.block);
      block.id = makeId('block');
      const index = command.index === undefined ? page.blocks.length : boundedIndex(command.index, page.blocks.length, { insertion: true });
      page.blocks.splice(index, 0, block);
      break;
    }
    case 'block.update': {
      requireCommandKeys(command, ['type', 'pageId', 'blockId', 'patch']);
      const { page } = requirePage(next, command.pageId);
      const { block } = requireBlock(page, command.blockId);
      const patch = command.patch;
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new CourseModelError('patch_invalid', 'block.update patch 必须是对象');
      for (const key of Object.keys(patch)) {
        if (!['type', 'props'].includes(key)) throw new CourseModelError('patch_field_forbidden', `不允许更新内容块字段：${key}`);
      }
      Object.assign(block, clone(patch));
      break;
    }
    case 'block.move': {
      requireCommandKeys(command, ['type', 'pageId', 'blockId', 'toIndex']);
      const { page } = requirePage(next, command.pageId);
      const { block, index: oldIndex } = requireBlock(page, command.blockId);
      const newIndex = boundedIndex(command.toIndex, page.blocks.length);
      page.blocks.splice(oldIndex, 1);
      page.blocks.splice(newIndex, 0, block);
      break;
    }
    case 'block.remove': {
      requireCommandKeys(command, ['type', 'pageId', 'blockId']);
      const { page } = requirePage(next, command.pageId);
      const { index } = requireBlock(page, command.blockId);
      page.blocks.splice(index, 1);
      break;
    }
    default:
      throw new CourseModelError('command_unknown', `不支持的编辑命令：${command.type}`);
  }
  assertValidCourseDocument(next, options);
  return next;
}

function applyCommands(document, commands, options = {}) {
  if (!Array.isArray(commands) || commands.length < 1 || commands.length > 200) {
    throw new CourseModelError('commands_invalid', '命令组必须包含 1 到 200 个操作');
  }
  return commands.reduce((current, command) => applyCommand(current, command, options), clone(document));
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function diffDocuments(before, after) {
  const oldPages = new Map(before.pages.map((page, index) => [page.id, { page, index }]));
  const newPages = new Map(after.pages.map((page, index) => [page.id, { page, index }]));
  const addedPages = after.pages.filter(page => !oldPages.has(page.id)).map(page => page.id);
  const removedPages = before.pages.filter(page => !newPages.has(page.id)).map(page => page.id);
  const changedPages = [];
  for (const page of after.pages) {
    const old = oldPages.get(page.id);
    if (old && stableStringify(old.page) !== stableStringify(page)) changedPages.push(page.id);
  }
  return {
    titleChanged: before.title !== after.title,
    addedPages,
    removedPages,
    changedPages,
    pageOrderChanged: before.pages.map(page => page.id).join('\0') !== after.pages.map(page => page.id).join('\0')
  };
}

function createDocumentStore(initialDocument, options = {}) {
  const componentPacks = new Map();
  for (const entry of options.componentPacks || []) {
    const pack = entry.pack || entry;
    validateComponentPack(pack);
    const hash = entry.hash || componentPackHash(pack);
    if (hash !== componentPackHash(pack)) throw new CourseModelError('component_pack_hash_invalid', `组件包摘要不匹配：${pack.id}`);
    componentPacks.set(`${pack.id}@${pack.version}`, { pack, hash });
  }
  const validationOptions = () => ({ componentPacks: [...componentPacks.values()] });
  assertValidCourseDocument(initialDocument, validationOptions());
  let current = clone(initialDocument);
  let revision = 0;
  const undoStack = [];
  const redoStack = [];
  function assertRevision(expectedRevision) {
    if (expectedRevision !== undefined && expectedRevision !== revision) {
      throw new CourseModelError('revision_conflict', `草稿已更新（当前 revision=${revision}，请求基于 ${expectedRevision}）`, { expectedRevision, actualRevision: revision });
    }
  }
  function snapshot() { return { revision, document: clone(current), canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 }; }
  function commit(next, label) {
    const previous = current;
    current = clone(next);
    undoStack.push({ before: previous, after: current, label });
    redoStack.length = 0;
    revision += 1;
    return snapshot();
  }
  return {
    snapshot,
    componentPacks() { return [...componentPacks.values()].map(entry => clone(entry)); },
    registerComponentPack(entry) {
      const pack = entry.pack || entry;
      validateComponentPack(pack);
      const hash = entry.hash || componentPackHash(pack);
      if (hash !== componentPackHash(pack)) throw new CourseModelError('component_pack_hash_invalid', `组件包摘要不匹配：${pack.id}`);
      const key = `${pack.id}@${pack.version}`;
      const existing = componentPacks.get(key);
      if (existing && existing.hash !== hash) throw new CourseModelError('component_pack_conflict', `同一版本的组件包 hash 不同：${key}`);
      const all = [...componentPacks.values()].filter(item => `${item.pack.id}@${item.pack.version}` !== key).concat([{ pack, hash }]);
      getComponentCatalog(all);
      componentPacks.set(key, { pack: clone(pack), hash });
      return { id: pack.id, version: pack.version, hash, components: pack.components.map(item => ({ id: item.id, label: item.label })) };
    },
    dispatch(command, options = {}) {
      assertRevision(options.expectedRevision);
      return commit(applyCommand(current, command, validationOptions()), command.type);
    },
    dispatchBatch(commands, options = {}) {
      assertRevision(options.expectedRevision);
      return commit(applyCommands(current, commands, validationOptions()), options.label || 'batch');
    },
    undo(options = {}) {
      assertRevision(options.expectedRevision);
      const entry = undoStack.pop();
      if (!entry) return snapshot();
      current = clone(entry.before);
      redoStack.push(entry);
      revision += 1;
      return snapshot();
    },
    redo(options = {}) {
      assertRevision(options.expectedRevision);
      const entry = redoStack.pop();
      if (!entry) return snapshot();
      current = clone(entry.after);
      undoStack.push(entry);
      revision += 1;
      return snapshot();
    },
    createCandidate(commands, options = {}) {
      assertRevision(options.expectedRevision);
      const document = applyCommands(current, commands, validationOptions());
      return {
        baseRevision: revision,
        commands: clone(commands),
        document,
        diff: diffDocuments(current, document)
      };
    },
    acceptCandidate(candidate, options = {}) {
      assertRevision(options.expectedRevision);
      if (!candidate || candidate.baseRevision !== revision) {
        throw new CourseModelError('candidate_stale', '候选草稿基于旧版本，必须重新生成或对比合并', {
          candidateRevision: candidate?.baseRevision,
          actualRevision: revision
        });
      }
      assertValidCourseDocument(candidate.document, validationOptions());
      return commit(candidate.document, 'agent-candidate');
    }
  };
}

module.exports = { applyCommand, applyCommands, diffDocuments, createDocumentStore, stableStringify };
