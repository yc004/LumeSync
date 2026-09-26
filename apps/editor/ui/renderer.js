'use strict';

const bridge = window.lumeEditor;
const appRoot = document.getElementById('app');
let state = null;
let selectedPageId = null;
let activeTab = 'preview';
let agentRequestId = null;
let agentBusy = false;
let commandQueue = Promise.resolve();
let statusText = '本地编辑就绪';
let statusError = false;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function showError(error) {
  let message = error?.message || '操作失败';
  try { message = JSON.parse(message).message || message; } catch { /* Electron error without serialized details. */ }
  statusText = message;
  statusError = true;
  render();
}

async function refresh() {
  try {
    state = await bridge.getState();
    selectedPageId = state.document.pages.some(page => page.id === selectedPageId) ? selectedPageId : state.document.pages[0]?.id;
    statusError = false;
    render();
  } catch (error) { showError(error); }
}

function currentPage() { return state?.document.pages.find(page => page.id === selectedPageId) || state?.document.pages[0] || null; }
function componentName(type) {
  return state?.componentCatalog?.find(component => component.id === type)?.label || type;
}

function renderPageList() {
  return `<section class="panel pages-panel"><div class="panel-head"><h2>页面</h2><span class="hint">${state.document.pages.length} 页</span></div><div class="page-list">${state.document.pages.map((page, index) => `
    <div class="page-item ${page.id === selectedPageId ? 'selected' : ''}">
      <span class="page-index">${String(index + 1).padStart(2, '0')}</span>
      <button class="page-select" data-action="select-page" data-page-id="${esc(page.id)}" title="${esc(page.title)}">${esc(page.title)}</button>
      <div class="page-actions">
        <button class="icon-button" data-action="move-page" data-page-id="${esc(page.id)}" data-direction="-1" title="上移" ${index === 0 ? 'disabled' : ''}>↑</button>
        <button class="icon-button" data-action="move-page" data-page-id="${esc(page.id)}" data-direction="1" title="下移" ${index === state.document.pages.length - 1 ? 'disabled' : ''}>↓</button>
      </div>
    </div>`).join('')}</div><div class="page-footer"><button class="button" data-action="add-page">＋ 新建页面</button></div></section>`;
}

function renderBlockFields(block) {
  const p = block.props;
  if (block.type === 'core.heading') return `<input data-field="block-text" data-block-id="${esc(block.id)}" value="${esc(p.text)}" maxlength="500" aria-label="标题文本"><div style="height:8px"></div><select data-field="heading-level" data-block-id="${esc(block.id)}" aria-label="标题级别"><option value="1" ${p.level === 1 ? 'selected' : ''}>一级标题</option><option value="2" ${p.level === 2 ? 'selected' : ''}>二级标题</option><option value="3" ${p.level === 3 ? 'selected' : ''}>三级标题</option></select>`;
  if (block.type === 'core.paragraph') return `<textarea data-field="block-text" data-block-id="${esc(block.id)}" maxlength="10000" aria-label="正文">${esc(p.text)}</textarea>`;
  if (block.type === 'core.bullets') return `<label class="field-label">每行一个要点</label><textarea class="list" data-field="block-bullets" data-block-id="${esc(block.id)}" aria-label="要点列表">${esc(p.items.join('\n'))}</textarea>`;
  if (block.type === 'core.callout') return `<input data-field="callout-title" data-block-id="${esc(block.id)}" maxlength="200" value="${esc(p.title || '')}" aria-label="提示框标题"><div style="height:8px"></div><textarea data-field="callout-text" data-block-id="${esc(block.id)}" maxlength="5000" aria-label="提示框内容">${esc(p.text)}</textarea><div style="height:8px"></div><select data-field="callout-tone" data-block-id="${esc(block.id)}" aria-label="提示框类型"><option value="info" ${p.tone === 'info' ? 'selected' : ''}>说明</option><option value="tip" ${p.tone === 'tip' ? 'selected' : ''}>建议</option><option value="warning" ${p.tone === 'warning' ? 'selected' : ''}>注意</option></select>`;
  const component = state.componentCatalog?.find(item => item.id === block.type);
  if (component?.extension && component.props) return Object.entries(component.props).map(([name, definition]) => {
    const common = `data-field="extension-prop" data-prop-name="${esc(name)}" data-block-id="${esc(block.id)}" aria-label="${esc(definition.label)}"`;
    if (definition.type === 'enum') return `<label class="field-label">${esc(definition.label)}</label><select ${common}>${definition.options.map(option => `<option value="${esc(option)}" ${p[name] === option ? 'selected' : ''}>${esc(option)}</option>`).join('')}</select>`;
    if (definition.type === 'boolean') return `<label class="check-field"><input type="checkbox" ${common} ${p[name] ? 'checked' : ''}>${esc(definition.label)}</label>`;
    const inputType = definition.type === 'number' ? 'number' : definition.type === 'color' ? 'color' : 'text';
    const limit = definition.type === 'string' ? `maxlength="${definition.maxLength || 1000}"` : '';
    const range = definition.type === 'number' ? `min="${definition.min ?? -100000}" max="${definition.max ?? 100000}" step="any"` : '';
    return `<label class="field-label">${esc(definition.label)}</label><input type="${inputType}" ${common} ${limit} ${range} value="${esc(p[name])}">`;
  }).join('<div style="height:8px"></div>');
  return '<div class="empty">这个组件没有可编辑属性。</div>';
}

function renderBlocks(page) {
  if (!page.blocks.length) return '<div class="empty">页面暂时没有内容。添加一个标准组件开始创作。</div>';
  return page.blocks.map((block, index) => `<article class="block-card">
    <div class="block-head"><span class="block-type">${esc(componentName(block.type))}</span><div class="block-tools">
      <button class="icon-button" data-action="move-block" data-block-id="${esc(block.id)}" data-direction="-1" title="上移" ${index === 0 ? 'disabled' : ''}>↑</button>
      <button class="icon-button" data-action="move-block" data-block-id="${esc(block.id)}" data-direction="1" title="下移" ${index === page.blocks.length - 1 ? 'disabled' : ''}>↓</button>
      <button class="icon-button" data-action="remove-block" data-block-id="${esc(block.id)}" title="删除内容块">×</button>
    </div></div><div class="block-fields">${renderBlockFields(block)}</div>
  </article>`).join('');
}

function renderEditor() {
  const page = currentPage();
  if (!page) return '<section class="panel editor-panel"><div class="empty">新建一页以继续编辑。</div></section>';
  return `<section class="panel editor-panel">
    <div class="course-meta"><label for="course-title">课件标题</label><input id="course-title" data-field="course-title" value="${esc(state.document.title)}" maxlength="200"><div class="course-description"><label for="course-description">课件说明（可选）</label><input id="course-description" data-field="course-description" value="${esc(state.document.description || '')}" maxlength="2000"></div></div>
    <div class="editor-scroll"><div class="section-label"><label class="field-label" for="page-title">当前页面标题</label><button class="button small danger" data-action="delete-page" ${state.document.pages.length <= 1 ? 'disabled' : ''}>删除本页</button></div><input class="page-title-input" id="page-title" data-field="page-title" value="${esc(page.title)}" maxlength="200"><div class="section-label"><span>页面内容</span><span class="hint">声明式标准组件</span></div>${renderBlocks(page)}
    <div class="add-blocks"><button class="button" data-action="add-block" data-type="core.heading">＋ 标题</button><button class="button" data-action="add-block" data-type="core.paragraph">＋ 正文</button><button class="button" data-action="add-block" data-type="core.bullets">＋ 要点列表</button><button class="button" data-action="add-block" data-type="core.callout">＋ 提示框</button>${(state.componentCatalog || []).filter(component => component.extension).map(component => `<button class="button" data-action="add-block" data-type="${esc(component.id)}">＋ ${esc(component.label)}</button>`).join('')}</div></div>
    <div class="statusbar ${statusError ? 'error' : ''}">${esc(statusText)}</div>
  </section>`;
}

function renderCandidate() {
  const candidate = state.candidate;
  if (!candidate) return '';
  const changed = candidate.document.pages.filter(page => candidate.diff.addedPages.includes(page.id) || candidate.diff.changedPages.includes(page.id));
  return `<section class="candidate"><h3>候选课件 · 待你审查</h3><div class="candidate-summary">${candidate.diff.titleChanged ? '课件标题已调整；' : ''}${candidate.diff.addedPages.length} 页新增，${candidate.diff.removedPages.length} 页删除，${candidate.diff.changedPages.length} 页修改。接受后可用撤销恢复。</div>
    <ul>${candidate.plan.map(item => `<li><strong>${esc(item.title)}</strong>：${esc(item.purpose)}</li>`).join('')}${changed.map(page => `<li>候选页：${esc(page.title)}（${page.blocks.length} 个内容块）</li>`).join('')}</ul>
    <div class="candidate-actions"><button class="button primary" data-action="accept-candidate">接受改动</button><button class="button danger" data-action="discard-candidate">放弃</button></div></section>`;
}

function renderRightPanel() {
  const page = currentPage();
  const profile = state.model.profile || {};
  const preview = `<div class="right-content"><iframe class="preview-frame" title="课件页面预览" sandbox="" src="about:blank"></iframe><div class="preview-caption"><span>安全静态预览 · 不运行课件脚本</span><span>${esc(page?.title || '')}</span></div><p class="hint">此预览和导出的页面共用同一份声明式源数据；组件包使用受限模板，不执行插件脚本。</p></div>`;
  const agent = `<div class="right-content"><p class="hint">连接 OpenAI Chat Completions 兼容 API。模型只能提出标准课件编辑命令；结果先作为候选草稿，接受后才写入。仅显式点“生成候选”时发送提示词和当前课件结构。</p><div class="agent-form">
    <label for="model-label">服务名称</label><input id="model-label" data-profile="label" value="${esc(profile.label || '')}" placeholder="我的模型服务">
    <label for="model-base">API 基址</label><input id="model-base" data-profile="baseUrl" value="${esc(profile.baseUrl || '')}" placeholder="https://api.example.com/v1">
    <label for="model-name">模型 ID</label><input id="model-name" data-profile="model" value="${esc(profile.model || '')}" placeholder="model-name">
    <label for="model-key">API 密钥（系统加密保存）</label><input id="model-key" type="password" data-profile="apiKey" autocomplete="new-password" placeholder="${state.model.hasApiKey ? '已保存，留空可保持不变' : '粘贴 API 密钥'}">
    <div class="agent-actions"><button class="button" data-action="save-profile">保存 API 配置</button><button class="button" data-action="test-model">测试连接</button></div>
    <label for="agent-prompt">你想创作什么课件？</label><textarea id="agent-prompt" placeholder="例如：为初中七年级设计一节 6 页的分数入门课，包含生活化例子、三个学习要点和一个随堂思考问题。"></textarea>
    <div class="agent-actions"><button class="button primary" data-action="start-agent" ${agentBusy ? 'disabled' : ''}>生成候选课件</button>${agentBusy ? '<button class="button danger" data-action="cancel-agent">取消生成</button>' : ''}</div>
    <div class="statusbar ${statusError ? 'error' : ''}">${agentBusy ? '<span class="loading">正在请求模型并校验候选</span>' : esc(statusText)}</div>
    ${renderCandidate()}
  </div></div>`;
  return `<aside class="panel right-panel"><div class="panel-head"><h2>预览与 Agent</h2><div class="tabs"><button class="tab ${activeTab === 'preview' ? 'active' : ''}" data-action="tab" data-tab="preview">页面预览</button><button class="tab ${activeTab === 'agent' ? 'active' : ''}" data-action="tab" data-tab="agent">AI 创作</button></div></div>${activeTab === 'preview' ? preview : agent}</aside>`;
}

function render() {
  if (!state) {
    appRoot.innerHTML = '<div class="empty">正在打开编辑器…</div>';
    return;
  }
  appRoot.innerHTML = `<header class="topbar"><div class="brand"><span class="brand-mark">L</span><span>LumeSync 编辑器</span></div><div class="top-title"><input aria-label="课件标题" value="${esc(state.document.title)}" data-field="header-title"><span class="file-label">${esc(state.fileName || '新建课件')}</span></div><span class="save-state ${state.dirty ? 'dirty' : ''}">${state.dirty ? '● 未保存' : '✓ 已保存'}</span><button class="button" data-action="new-course">新建</button><button class="button" data-action="open-course">打开</button><button class="button" data-action="import-component-pack">导入组件包</button><button class="button" data-action="undo" ${state.canUndo ? '' : 'disabled'}>撤销</button><button class="button" data-action="redo" ${state.canRedo ? '' : 'disabled'}>重做</button><button class="button primary" data-action="save-course">保存课件</button><button class="button" data-action="save-as">另存为</button></header>
    <main class="workspace">${renderPageList()}${renderEditor()}${renderRightPanel()}</main>`;
  if (activeTab === 'preview') {
    const frame = appRoot.querySelector('.preview-frame');
    if (frame && pageForPreview()) void bridge.getPreview(pageForPreview().id).then(html => { if (frame.isConnected) frame.srcdoc = html; }).catch(showError);
  }
}

function pageForPreview() { return currentPage(); }

function updated(command) {
  const task = commandQueue.then(async () => {
    state = await bridge.dispatch(command, state.revision);
    statusText = '已更新草稿；源文件会在保存时重新构建。';
    statusError = false;
    render();
  }).catch(showError);
  commandQueue = task;
  return task;
}

function blockById(blockId) { return currentPage()?.blocks.find(block => block.id === blockId); }

appRoot.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button || !state) return;
  const action = button.dataset.action;
  try {
    if (action === 'tab') { activeTab = button.dataset.tab; render(); return; }
    if (action === 'select-page') { selectedPageId = button.dataset.pageId; render(); return; }
    if (action === 'new-course') {
      await commandQueue;
      if (state.dirty && !window.confirm('当前课件有未保存修改。新建课件会替换当前本地恢复草稿；如需保留，请先保存课件。继续吗？')) return;
      state = await bridge.createCourse('新课件'); selectedPageId = state.document.pages[0].id; statusText = '已新建课件'; render(); return;
    }
    if (action === 'open-course') {
      await commandQueue;
      if ((state.dirty || state.candidate) && !window.confirm('当前有未保存修改或待审查候选。打开其他课件会放弃这些更改；继续吗？')) return;
      const opened = await bridge.openCourse(); if (!opened.canceled) { state = opened; selectedPageId = state.document.pages[0].id; statusText = `已打开 ${state.fileName}`; render(); } return;
    }
    if (action === 'import-component-pack') {
      await commandQueue;
      const imported = await bridge.importComponentPack();
      if (!imported.canceled) { state = imported; statusText = imported.locked
        ? `已导入组件包 ${imported.installed.id}@${imported.installed.version}，已加入本课件。`
        : `已安装组件包 ${imported.installed.id}@${imported.installed.version}；当前课件仍锁定 ${imported.installed.id}@${imported.currentVersion}，新版本可用于新课件。`;
        statusError = false; render(); }
      return;
    }
    if (action === 'save-course' || action === 'save-as') { await commandQueue; const saved = await bridge.saveCourse(action === 'save-as'); if (!saved.canceled) { state = saved; statusText = `已保存 ${saved.fileName}`; statusError = false; render(); } return; }
    if (action === 'undo') { await commandQueue; state = await bridge.undo(state.revision); statusText = '已撤销'; render(); return; }
    if (action === 'redo') { await commandQueue; state = await bridge.redo(state.revision); statusText = '已重做'; render(); return; }
    if (action === 'add-page') {
      const nextNumber = state.document.pages.length + 1;
      await updated({ type: 'page.add', page: { title: `第 ${nextNumber} 页`, blocks: [
        { type: 'core.heading', props: { text: '页面标题', level: 1 } },
        { type: 'core.paragraph', props: { text: '在这里输入本页内容。' } }
      ] } });
      selectedPageId = state.document.pages[state.document.pages.length - 1].id; render(); return;
    }
    if (action === 'move-page') {
      const index = state.document.pages.findIndex(page => page.id === button.dataset.pageId);
      const toIndex = index + Number(button.dataset.direction);
      await updated({ type: 'page.move', pageId: button.dataset.pageId, toIndex }); return;
    }
    if (action === 'delete-page') {
      if (!window.confirm('删除这一页？此操作可以撤销。')) return;
      await updated({ type: 'page.remove', pageId: selectedPageId });
      selectedPageId = state.document.pages[0].id; render(); return;
    }
    if (action === 'add-block') {
      const type = button.dataset.type;
      const defaults = {
        'core.heading': { text: '新标题', level: 2 },
        'core.paragraph': { text: '在这里输入正文。' },
        'core.bullets': { items: ['第一个要点', '第二个要点'] },
        'core.callout': { title: '提示', text: '补充说明', tone: 'info' }
      };
      const component = state.componentCatalog?.find(item => item.id === type && item.extension);
      if (component) defaults[type] = component.defaults;
      await updated({ type: 'block.add', pageId: selectedPageId, block: { type, props: defaults[type] } }); return;
    }
    if (action === 'remove-block') { await updated({ type: 'block.remove', pageId: selectedPageId, blockId: button.dataset.blockId }); return; }
    if (action === 'move-block') {
      const index = currentPage().blocks.findIndex(block => block.id === button.dataset.blockId);
      await updated({ type: 'block.move', pageId: selectedPageId, blockId: button.dataset.blockId, toIndex: index + Number(button.dataset.direction) }); return;
    }
    if (action === 'save-profile') {
      const profile = Object.fromEntries([...appRoot.querySelectorAll('[data-profile]:not([data-profile="apiKey"])')].map(input => [input.dataset.profile, input.value]));
      const apiKey = appRoot.querySelector('[data-profile="apiKey"]').value;
      const model = await bridge.saveModelProfile(profile, apiKey);
      const keyInput = appRoot.querySelector('[data-profile="apiKey"]'); if (keyInput) keyInput.value = '';
      state = { ...state, model }; statusText = model.hasApiKey ? 'API 配置已保存，密钥由系统凭证加密保管。' : 'API 配置已保存，请添加密钥后测试。'; statusError = false; render(); return;
    }
    if (action === 'test-model') { statusText = '正在测试模型连接…'; statusError = false; render(); const result = await bridge.testModel(); statusText = `连接成功 · ${result.elapsedMs} ms${result.usage?.total_tokens ? ` · ${result.usage.total_tokens} tokens` : ''}`; render(); return; }
    if (action === 'start-agent') {
      await commandQueue;
      const prompt = appRoot.querySelector('#agent-prompt')?.value || '';
      agentBusy = true; statusText = '正在请求模型…'; statusError = false; render();
      const started = await bridge.startAgent(prompt); agentRequestId = started.requestId; return;
    }
    if (action === 'cancel-agent' && agentRequestId) { await bridge.cancelAgent(agentRequestId); statusText = '已请求取消生成。'; render(); return; }
    if (action === 'accept-candidate') { await commandQueue; state = await bridge.acceptCandidate(state.revision); selectedPageId = state.document.pages[0].id; statusText = '候选改动已接受，可继续编辑或撤销。'; agentBusy = false; render(); return; }
    if (action === 'discard-candidate') { state = await bridge.discardCandidate(); statusText = '已放弃候选草稿。'; agentBusy = false; render(); return; }
  } catch (error) { showError(error); }
});

appRoot.addEventListener('change', event => {
  const field = event.target.dataset.field;
  if (!field || !state) return;
  const page = currentPage();
  const blockId = event.target.dataset.blockId;
  if (field === 'header-title' || field === 'course-title') void updated({ type: 'course.update', patch: { title: event.target.value } });
  else if (field === 'course-description') void updated({ type: 'course.update', patch: { description: event.target.value } });
  else if (field === 'page-title') void updated({ type: 'page.update', pageId: page.id, patch: { title: event.target.value } });
  else if (field === 'block-text') {
    const block = blockById(blockId); const props = { ...block.props, text: event.target.value };
    void updated({ type: 'block.update', pageId: page.id, blockId, patch: { props } });
  } else if (field === 'heading-level') {
    const block = blockById(blockId); const props = { ...block.props, level: Number(event.target.value) };
    void updated({ type: 'block.update', pageId: page.id, blockId, patch: { props } });
  } else if (field === 'block-bullets') {
    const block = blockById(blockId); const items = event.target.value.split('\n').map(line => line.trim()).filter(Boolean);
    void updated({ type: 'block.update', pageId: page.id, blockId, patch: { props: { ...block.props, items } } });
  } else if (field === 'extension-prop') {
    const block = blockById(blockId);
    const component = state.componentCatalog?.find(item => item.id === block?.type);
    const name = event.target.dataset.propName;
    const definition = component?.props?.[name];
    if (!definition) return;
    const value = definition.type === 'boolean' ? event.target.checked
      : definition.type === 'number' ? Number(event.target.value)
        : event.target.value;
    void updated({ type: 'block.update', pageId: page.id, blockId, patch: { props: { ...block.props, [name]: value } } });
  } else if (field.startsWith('callout-')) {
    const block = blockById(blockId); const key = field.slice('callout-'.length);
    void updated({ type: 'block.update', pageId: page.id, blockId, patch: { props: { ...block.props, [key]: event.target.value } } });
  }
});

bridge.onAgentEvent(async message => {
  if (message.requestId !== agentRequestId) return;
  if (message.status === 'running') { agentBusy = true; statusText = '正在请求模型…'; render(); return; }
  agentBusy = false;
  agentRequestId = null;
  if (message.status === 'complete') { statusText = 'Agent 已生成候选，请检查大纲和差异后决定是否接受。'; statusError = false; await refresh(); activeTab = 'agent'; render(); }
  else if (message.status === 'error') { statusText = message.error?.message || 'Agent 生成失败。'; statusError = true; await refresh(); activeTab = 'agent'; render(); }
});

void refresh();
