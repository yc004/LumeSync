'use strict';

const { app, BrowserWindow, dialog, ipcMain, shell, screen } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const { teacherPageBase, isTeacherPageUrl, safeCoursePath } = require('./src/guards.cjs');

const root = path.resolve(__dirname, '../../..');
const serverEntry = path.join(root, 'apps/teacher/server/index.js');
const coursesDir = path.join(root, 'apps/teacher/shared/public/courses');
const hostToken = crypto.randomBytes(32).toString('hex');
const clientId = `teacher-electron-${crypto.randomUUID()}`;
let server;
let port;
let mainWindow;
let previousDragPoint;

app.setName('LumeSync 教师端');

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const chosen = probe.address().port;
      probe.close(() => resolve(chosen));
    });
  });
}

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`课堂服务已退出 (${server.exitCode})`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok && (await response.json()).ok) return;
    } catch (_) { /* Service is starting. */ }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('课堂服务启动超时');
}

function windowFor(event) {
  const url = event.senderFrame?.url || '';
  if (!isTeacherPageUrl(url, teacherPageBase(port))) throw new Error('拒绝非教师页面调用原生能力');
  return BrowserWindow.fromWebContents(event.sender);
}

function register(name, handler) {
  ipcMain.handle(`teacher:${name}`, (event, value) => handler(windowFor(event), value));
}

function settingsPath() { return path.join(app.getPath('userData'), 'teacher-settings.json'); }

function registerIpc() {
  register('session', () => ({ role: 'host', token: hostToken, clientId }));
  register('minimize', win => win?.minimize());
  register('maximize', win => win?.isMaximized() ? win.unmaximize() : win?.maximize());
  register('close', win => win?.close());
  register('fullscreen', (win, value) => win?.setFullScreen(value));
  register('devtools', win => win?.webContents.toggleDevTools());
  register('window-drag', win => {
    if (!win) return;
    const cursor = screen.getCursorScreenPoint();
    if (previousDragPoint) {
      const [x, y] = win.getPosition();
      win.setPosition(x + cursor.x - previousDragPoint.x, y + cursor.y - previousDragPoint.y);
    }
    previousDragPoint = cursor;
    setTimeout(() => { previousDragPoint = null; }, 150);
  });
  register('get-settings', async () => {
    try { return JSON.parse(await fsp.readFile(settingsPath(), 'utf8')); }
    catch { return null; }
  });
  register('save-settings', async (_win, value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    await fsp.mkdir(path.dirname(settingsPath()), { recursive: true });
    await fsp.writeFile(settingsPath(), JSON.stringify(value), { mode: 0o600 });
    return true;
  });
  register('admin-password', () => false);
  register('class-started', () => true);
  register('class-ended', () => true);
  register('submission-dir', async win => {
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });
  register('open-logs', async () => {
    const directory = app.getPath('logs');
    await fsp.mkdir(directory, { recursive: true });
    return shell.openPath(directory);
  });
  register('import-course', async win => {
    const selection = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '课件', extensions: ['lume', 'pdf', 'tsx', 'ts', 'jsx', 'js'] }]
    });
    if (selection.canceled) return { success: false, imported: [], canceled: true };
    await fsp.mkdir(coursesDir, { recursive: true });
    const imported = [];
    for (const file of selection.filePaths) {
      const destination = safeCoursePath(coursesDir, path.basename(file));
      if (path.resolve(file) !== destination) await fsp.copyFile(file, destination, fs.constants.COPYFILE_EXCL);
      imported.push(path.basename(file));
    }
    await fetch(`http://127.0.0.1:${port}/api/refresh-courses`, {
      method: 'POST', headers: { Authorization: `Bearer ${hostToken}` }
    });
    return { success: true, imported };
  });
  register('export-course', async (win, options) => {
    const format = options?.format;
    if (!['lume', 'pdf'].includes(format)) throw new Error('不支持的导出格式');
    const source = safeCoursePath(coursesDir, String(options?.courseFile || '').replace(/\.[^.]+$/, `.${format}`));
    await fsp.access(source, fs.constants.R_OK);
    const result = await dialog.showSaveDialog(win, {
      defaultPath: `${options?.title || path.basename(source, path.extname(source))}.${format}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    await fsp.copyFile(source, result.filePath);
    return { success: true, path: result.filePath };
  });
  register('save-pdf', async (win, options) => {
    const encoded = options?.dataBase64;
    if (typeof encoded !== 'string' || encoded.length > 140_000_000) throw new Error('PDF 数据无效或过大');
    const result = await dialog.showSaveDialog(win, {
      defaultPath: path.basename(String(options?.filename || 'course.pdf')),
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    await fsp.writeFile(result.filePath, Buffer.from(encoded, 'base64'));
    return { success: true, path: result.filePath };
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1050, minHeight: 680,
    title: 'LumeSync 教师端', frame: false, backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      webSecurity: true
    }
  });
  const base = teacherPageBase(port);
  win.webContents.on('will-navigate', (event, url) => { if (!isTeacherPageUrl(url, base)) event.preventDefault(); });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isTeacherPageUrl(url, base)) return { action: 'deny' };
    return { action: 'allow', overrideBrowserWindowOptions: {
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
    } };
  });
  win.on('maximize', () => win.webContents.send('teacher:maximized'));
  win.on('unmaximize', () => win.webContents.send('teacher:unmaximized'));
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
  mainWindow = win;
  void win.loadURL(base);
}

app.whenReady().then(async () => {
  try {
    port = await freePort();
    registerIpc();
    server = spawn(process.execPath, [serverEntry], {
      cwd: path.dirname(serverEntry),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: String(port),
        LUMESYNC_HOST_TOKEN: hostToken,
        LUMESYNC_VIEWER_TOKEN_SECRET: crypto.randomBytes(32).toString('hex') },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    server.stdout.on('data', data => process.stdout.write(data));
    server.stderr.on('data', data => process.stderr.write(data));
    await waitForServer();
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  } catch (error) {
    dialog.showErrorBox('LumeSync 教师端无法启动', error.message);
    app.quit();
  }
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { server?.kill('SIGTERM'); });
