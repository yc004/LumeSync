'use strict';

const { app, BrowserWindow, Menu, dialog, ipcMain, safeStorage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const crypto = require('node:crypto');
const uiIndex = path.join(__dirname, '../ui/index.html');
const {
  createCourseDocument,
  createDocumentStore,
  renderPageHtml,
  CourseModelError,
  assertValidCourseDocument,
  stableStringify,
  getComponentCatalog
} = require('@lumesync/course-model');
const { readComponentPack, componentPackHash } = require('@lumesync/component-extensions');
const {
  openCoursePackage,
  createCoursePackage,
  validateModelProfile,
  testModelConnection,
  generateCourseCandidate,
  atomicWriteFile
} = require('../src/editor-service.cjs');

app.setName('LumeSync 课件编辑器');

let mainWindow;
let store = createDocumentStore(createCourseDocument());
let currentFilePath = null;
let currentFileHash = null;
let savedDocumentJson = null;
let candidate = null;
let modelSettings = { profile: null, encryptedApiKey: null };
const agentRequests = new Map();
const pendingNativeOpenPaths = [];
const nativeOpenRequests = new Map();
const settingsPath = () => path.join(app.getPath('userData'), 'editor-settings.json');
const recoveryPath = () => path.join(app.getPath('userData'), 'editor-recovery.json');
const componentPackDirectory = () => path.join(app.getPath('userData'), 'component-packs');

function safeMessage(error) {
  return error instanceof CourseModelError || error instanceof Error
    ? { code: error.code || 'editor_error', message: String(error.message || '操作失败。').slice(0, 500) }
    : { code: 'editor_error', message: '操作失败。' };
}

function loadApiKey() {
  if (!modelSettings.encryptedApiKey) return '';
  if (!safeStorage.isEncryptionAvailable()) throw new CourseModelError('secure_storage_unavailable', '系统凭证保护不可用，暂时无法读取 API 密钥。');
  const backend = safeStorage.getSelectedStorageBackend?.();
  if (backend === 'basic_text' || backend === 'unknown') throw new CourseModelError('secure_storage_weak', '当前系统没有可用的系统凭证保护；编辑器不会以明文保存 API 密钥。');
  return safeStorage.decryptString(Buffer.from(modelSettings.encryptedApiKey, 'base64'));
}

function publicModelSettings() {
  return {
    profile: modelSettings.profile,
    hasApiKey: Boolean(modelSettings.encryptedApiKey)
  };
}

async function readSettings() {
  try {
    const parsed = JSON.parse(await fs.readFile(settingsPath(), 'utf8'));
    const profile = parsed?.profile ? validateModelProfile(parsed.profile) : null;
    const encryptedApiKey = typeof parsed?.encryptedApiKey === 'string' ? parsed.encryptedApiKey : null;
    modelSettings = { profile, encryptedApiKey };
  } catch (error) {
    if (error.code !== 'ENOENT') {
      modelSettings = { profile: null, encryptedApiKey: null };
    }
  }
}

async function saveSettings(nextSettings) {
  await atomicWriteFile(settingsPath(), Buffer.from(`${JSON.stringify(nextSettings, null, 2)}\n`, 'utf8'));
  modelSettings = nextSettings;
}

function draftIsDirty() {
  return savedDocumentJson !== stableStringify(store.snapshot().document);
}

async function saveRecovery() {
  const snapshot = store.snapshot();
  const data = { version: 2, savedAt: new Date().toISOString(), document: snapshot.document, componentPacks: store.componentPacks() };
  await atomicWriteFile(recoveryPath(), Buffer.from(`${JSON.stringify(data)}\n`, 'utf8'));
}

function agentCandidateForUi() {
  if (!candidate) return null;
  return {
    baseRevision: candidate.baseRevision,
    diff: candidate.diff,
    document: candidate.document,
    plan: candidate.plan,
    elapsedMs: candidate.elapsedMs,
    usage: candidate.usage,
    model: candidate.model
  };
}

async function assertOpenedFileUnchanged(target, expectedHash) {
  try {
    const disk = await fs.readFile(target);
    const opened = await openCoursePackage(disk);
    if (!expectedHash || opened.courseHash !== expectedHash) {
      throw new CourseModelError('external_modification', '课件文件在外部发生变化。请另存为或重新打开后再保存。');
    }
  } catch (error) {
    if (error.code === 'external_modification') throw error;
    if (error.code === 'ENOENT') throw new CourseModelError('course_file_missing', '原课件文件已被移动或删除，请使用“另存为”。');
    throw new CourseModelError('external_modification', '原课件文件已发生变化或损坏。请另存为或重新打开后再保存。');
  }
}

function publicState() {
  const snapshot = store.snapshot();
  const page = snapshot.document.pages[0];
  return {
    ...snapshot,
    dirty: draftIsDirty(),
    fileName: currentFilePath ? path.basename(currentFilePath) : null,
    selectedPageId: page?.id || null,
    previewHtml: page ? renderPageHtml(snapshot.document, page.id, { componentPacks: store.componentPacks() }) : '',
    componentCatalog: Object.entries(getComponentCatalog(store.componentPacks(), snapshot.document.extensions)).map(([id, definition]) => ({
      id,
      label: definition.label,
      props: definition.fields || null,
      defaults: definition.defaults,
      extension: definition.extension || null
    })),
    candidate: agentCandidateForUi(),
    model: publicModelSettings()
  };
}

function assertTrustedWindow(event) {
  const frameUrl = event.senderFrame?.url || '';
  let framePath = '';
  try { framePath = fileURLToPath(frameUrl); } catch { /* Reject below. */ }
  if (!framePath || path.resolve(framePath) !== path.resolve(uiIndex)) throw new Error('拒绝非编辑器界面调用本地能力。');
  return BrowserWindow.fromWebContents(event.sender);
}

function sendAgentEvent(event) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('editor:agent-event', event);
}

function cancelAgentRequests() {
  for (const request of agentRequests.values()) request.controller.abort();
}

function sendMenuAction(action) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('editor:menu-action', action);
}

function buildApplicationMenu() {
  const isMac = process.platform === 'darwin';
  const template = [];
  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about', label: '关于 LumeSync 编辑器' },
        { type: 'separator' },
        { role: 'services', label: '服务' },
        { type: 'separator' },
        { role: 'hide', label: '隐藏 LumeSync 编辑器' },
        { role: 'hideOthers', label: '隐藏其他应用' },
        { role: 'unhide', label: '全部显示' },
        { type: 'separator' },
        { role: 'quit', label: '退出 LumeSync 编辑器' }
      ]
    });
  }
  template.push(
    {
      label: '文件',
      submenu: [
        { label: '新建课件', accelerator: 'CmdOrCtrl+N', click: () => sendMenuAction('new-course') },
        { label: '打开课件…', accelerator: 'CmdOrCtrl+O', click: () => sendMenuAction('open-course') },
        { type: 'separator' },
        { label: '保存课件', accelerator: 'CmdOrCtrl+S', click: () => sendMenuAction('save-course') },
        { label: '另存为…', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendMenuAction('save-as') },
        { type: 'separator' },
        { label: '导入组件包…', click: () => sendMenuAction('import-component-pack') },
        { type: 'separator' },
        isMac ? { role: 'close', label: '关闭窗口' } : { role: 'quit', label: '退出' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', click: () => sendMenuAction('undo') },
        { label: '重做', accelerator: isMac ? 'CmdOrCtrl+Shift+Z' : 'CmdOrCtrl+Y', click: () => sendMenuAction('redo') },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        ...(!app.isPackaged ? [{ role: 'toggleDevTools', label: '开发者工具' }] : []),
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '切换全屏' }
      ]
    }
  );
  if (!isMac) template.push({ label: '帮助', submenu: [{ role: 'about', label: '关于 LumeSync 编辑器' }] });
  return Menu.buildFromTemplate(template);
}

function isCoursePath(value) {
  return typeof value === 'string' && path.extname(value).toLowerCase() === '.lume';
}

function requestNativeCourseOpen(target) {
  if (!isCoursePath(target)) return;
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isLoading()) {
    pendingNativeOpenPaths.push(target);
    return;
  }
  const requestId = crypto.randomUUID();
  nativeOpenRequests.set(requestId, target);
  while (nativeOpenRequests.size > 20) nativeOpenRequests.delete(nativeOpenRequests.keys().next().value);
  mainWindow.webContents.send('editor:open-course-request', { requestId, fileName: path.basename(target) });
}

function flushNativeOpenPaths() {
  while (pendingNativeOpenPaths.length) requestNativeCourseOpen(pendingNativeOpenPaths.shift());
}

async function loadCourseAtPath(target) {
  const bytes = await fs.readFile(target);
  const opened = await openCoursePackage(bytes);
  for (const pack of opened.componentPacks) store.registerComponentPack(pack);
  cancelAgentRequests();
  store = createDocumentStore(opened.document, { componentPacks: store.componentPacks() });
  currentFilePath = target;
  currentFileHash = opened.courseHash;
  savedDocumentJson = stableStringify(opened.document);
  candidate = null;
  await saveRecovery();
  return { ...publicState(), courseHash: opened.courseHash, warnings: opened.warnings };
}

function register(name, handler) {
  ipcMain.handle(`editor:${name}`, async (event, payload) => {
    assertTrustedWindow(event);
    try { return await handler(payload); }
    catch (error) { throw new Error(JSON.stringify(safeMessage(error))); }
  });
}

function registerIpc() {
  register('state', () => publicState());
  register('new-course', async payload => {
    cancelAgentRequests();
    const document = createCourseDocument({ title: typeof payload?.title === 'string' ? payload.title : '新课件' });
    store = createDocumentStore(document, { componentPacks: store.componentPacks() });
    currentFilePath = null;
    currentFileHash = null;
    savedDocumentJson = null;
    candidate = null;
    await saveRecovery();
    return publicState();
  });
  register('dispatch', async ({ command, expectedRevision }) => {
    const result = store.dispatch(command, { expectedRevision });
    candidate = null;
    await saveRecovery();
    return publicState();
  });
  register('undo', async ({ expectedRevision }) => {
    store.undo({ expectedRevision });
    candidate = null;
    await saveRecovery();
    return publicState();
  });
  register('redo', async ({ expectedRevision }) => {
    store.redo({ expectedRevision });
    candidate = null;
    await saveRecovery();
    return publicState();
  });
  register('preview', ({ pageId }) => renderPageHtml(store.snapshot().document, pageId, { componentPacks: store.componentPacks() }));
  register('import-component-pack', async () => {
    const selected = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'], filters: [{ name: 'LumeSync 组件包', extensions: ['lumex'] }]
    });
    if (selected.canceled || !selected.filePaths[0]) return { canceled: true };
    const imported = await readComponentPack(await fs.readFile(selected.filePaths[0]));
    const installed = store.registerComponentPack(imported);
    const filePath = path.join(componentPackDirectory(), `${imported.pack.id}@${imported.pack.version}.json`);
    await atomicWriteFile(filePath, Buffer.from(imported.text, 'utf8'));
    const extension = { id: imported.pack.id, version: imported.pack.version, hash: imported.hash };
    const currentLock = store.snapshot().document.extensions?.find(item => item.id === extension.id);
    let locked = currentLock?.version === extension.version;
    if (!currentLock) {
      store.dispatch({ type: 'course.extension.add', extension }, { expectedRevision: store.snapshot().revision });
      locked = true;
      candidate = null;
      await saveRecovery();
    }
    return { canceled: false, installed, locked, currentVersion: currentLock?.version || extension.version, ...publicState() };
  });
  register('open-course', async () => {
    const selected = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'], filters: [{ name: 'LumeSync 课件', extensions: ['lume'] }]
    });
    if (selected.canceled || !selected.filePaths[0]) return { canceled: true };
    return { canceled: false, ...await loadCourseAtPath(selected.filePaths[0]) };
  });
  register('resolve-native-open', async ({ requestId, accepted }) => {
    const target = nativeOpenRequests.get(requestId);
    if (!target) throw new CourseModelError('open_request_expired', '打开请求已失效，请从文件菜单重新打开课件。');
    nativeOpenRequests.delete(requestId);
    if (accepted !== true) return { canceled: true };
    return { canceled: false, ...await loadCourseAtPath(target) };
  });
  register('save-course', async ({ saveAs = false } = {}) => {
    const snapshot = store.snapshot();
    assertValidCourseDocument(snapshot.document, { componentPacks: store.componentPacks() });
    let target = currentFilePath;
    const replacingOpenedFile = Boolean(target && !saveAs);
    const expectedFileHash = currentFileHash;
    if (!target || saveAs) {
      const selection = await dialog.showSaveDialog(mainWindow, {
        defaultPath: `${snapshot.document.title.replace(/[\\/:*?"<>|]/g, '_') || 'course'}.lume`,
        filters: [{ name: 'LumeSync 课件', extensions: ['lume'] }]
      });
      if (selection.canceled || !selection.filePath) return { canceled: true };
      target = /\.lume$/i.test(selection.filePath) ? selection.filePath : `${selection.filePath}.lume`;
    } else if (replacingOpenedFile) await assertOpenedFileUnchanged(target, expectedFileHash);
    const buffer = await createCoursePackage(snapshot.document, { componentPacks: store.componentPacks() });
    if (replacingOpenedFile) await assertOpenedFileUnchanged(target, expectedFileHash);
    await atomicWriteFile(target, buffer);
    const opened = await openCoursePackage(buffer);
    currentFilePath = target;
    currentFileHash = opened.courseHash;
    savedDocumentJson = stableStringify(snapshot.document);
    candidate = null;
    await saveRecovery();
    return { canceled: false, ...publicState(), courseHash: opened.courseHash };
  });
  register('save-model-profile', async payload => {
    const profile = validateModelProfile(payload?.profile);
    const submittedKey = typeof payload?.apiKey === 'string' ? payload.apiKey.trim() : '';
    if (submittedKey.length > 8192) throw new CourseModelError('model_key_too_large', 'API 密钥过长。');
    let encryptedApiKey = modelSettings.encryptedApiKey;
    if (submittedKey) {
      if (!safeStorage.isEncryptionAvailable()) throw new CourseModelError('secure_storage_unavailable', '系统凭证保护不可用，无法保存 API 密钥。');
      const backend = safeStorage.getSelectedStorageBackend?.();
      if (backend === 'basic_text' || backend === 'unknown') throw new CourseModelError('secure_storage_weak', '当前系统没有可用的系统凭证保护；编辑器不会以明文保存 API 密钥。');
      encryptedApiKey = safeStorage.encryptString(submittedKey).toString('base64');
    }
    await saveSettings({ profile, encryptedApiKey });
    return publicModelSettings();
  });
  register('test-model', async () => {
    if (!modelSettings.profile) throw new CourseModelError('model_profile_missing', '请先保存模型配置。');
    return testModelConnection({ profile: modelSettings.profile, apiKey: loadApiKey() });
  });
  register('agent-start', async ({ prompt }) => {
    if (agentRequests.size > 0) throw new CourseModelError('agent_busy', '已有创作任务正在运行。');
    if (candidate) throw new CourseModelError('candidate_pending', '请先审查、接受或放弃当前候选草稿。');
    if (!modelSettings.profile) throw new CourseModelError('model_profile_missing', '请先配置模型 API。');
    const apiKey = loadApiKey();
    const requestId = crypto.randomUUID();
    const controller = new AbortController();
    const requestStore = store;
    const requestProfile = modelSettings.profile;
    const request = { controller };
    agentRequests.set(requestId, request);
    setImmediate(() => {
      sendAgentEvent({ requestId, status: 'running' });
      void generateCourseCandidate({
        store: requestStore,
        prompt,
        profile: requestProfile,
        apiKey,
        signal: controller.signal
      }).then(result => {
        if (!agentRequests.has(requestId)) return;
        candidate = { ...result.candidate, ...result };
        sendAgentEvent({ requestId, status: 'complete', candidate: agentCandidateForUi() });
      }).catch(error => {
        if (agentRequests.has(requestId)) sendAgentEvent({ requestId, status: 'error', error: safeMessage(error) });
      }).finally(() => agentRequests.delete(requestId));
    });
    return { requestId };
  });
  register('agent-cancel', ({ requestId }) => {
    const request = agentRequests.get(requestId);
    if (!request) return { canceled: false };
    request.controller.abort();
    return { canceled: true };
  });
  register('candidate-accept', async ({ expectedRevision }) => {
    if (!candidate) throw new CourseModelError('candidate_missing', '当前没有待审查的候选草稿。');
    store.acceptCandidate(candidate, { expectedRevision });
    candidate = null;
    await saveRecovery();
    return publicState();
  });
  register('candidate-discard', () => {
    candidate = null;
    return publicState();
  });
}

async function restoreRecovery() {
  try {
    const data = JSON.parse(await fs.readFile(recoveryPath(), 'utf8'));
    const packsById = new Map(store.componentPacks().map(entry => [`${entry.pack.id}@${entry.pack.version}`, entry]));
    for (const entry of Array.isArray(data.componentPacks) ? data.componentPacks : []) {
      const pack = entry.pack || entry;
      packsById.set(`${pack.id}@${pack.version}`, entry);
    }
    const packs = [...packsById.values()];
    assertValidCourseDocument(data.document, { componentPacks: packs });
    store = createDocumentStore(data.document, { componentPacks: packs });
    savedDocumentJson = null;
  } catch { /* First launch or invalid recovery file: keep the fresh course. */ }
}

async function loadInstalledComponentPacks() {
  await fs.mkdir(componentPackDirectory(), { recursive: true });
  const entries = await fs.readdir(componentPackDirectory(), { withFileTypes: true });
  const packs = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    try {
      const pack = JSON.parse(await fs.readFile(path.join(componentPackDirectory(), entry.name), 'utf8'));
      packs.push({ pack, hash: componentPackHash(pack) });
    } catch { /* Ignore invalid library entries; opening a course still reports missing dependencies. */ }
  }
  store = createDocumentStore(store.snapshot().document, { componentPacks: packs });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1120,
    minHeight: 720,
    title: 'LumeSync 课件编辑器',
    backgroundColor: '#f2f5f9',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.once('did-finish-load', flushNativeOpenPaths);
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
  mainWindow = win;
  void win.loadFile(uiIndex);
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();
else {
  app.on('second-instance', (_event, argv) => {
    const target = argv.find(isCoursePath);
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    if (target) requestNativeCourseOpen(target);
  });
  app.on('open-file', (event, target) => {
    event.preventDefault();
    requestNativeCourseOpen(target);
  });
}

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  await readSettings();
  await loadInstalledComponentPacks();
  await restoreRecovery();
  registerIpc();
  Menu.setApplicationMenu(buildApplicationMenu());
  if (process.platform !== 'darwin') {
    const requestedPath = process.argv.slice(1).find(isCoursePath);
    if (requestedPath) pendingNativeOpenPaths.push(requestedPath);
  }
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}).catch(error => {
  dialog.showErrorBox('LumeSync 编辑器无法启动', String(error.message || '启动失败'));
  app.quit();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { for (const request of agentRequests.values()) request.controller.abort(); });
