// ========================================================
// 教师端主进程
// 职责：启动 server.js，打开教师端浏览器窗口
// ========================================================
const { app, BrowserWindow, Tray, Menu, nativeImage, dialog, ipcMain, session } = require('electron');
const path = require('path');
const { fork, spawnSync } = require('child_process');
const { loadSettings, saveSettings } = require('./config.js');

// 切换 Windows 控制台代码页为 UTF-8，解决中文乱码
if (process.platform === 'win32') {
    spawnSync('chcp', ['65001'], { shell: true, stdio: 'ignore' });
}

// 禁用 GPU 磁盘缓存，避免 Windows 上因缓存目录锁定导致的启动报错
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

// getUserMedia requires a secure origin; localhost over http is treated as insecure by Chromium.
app.commandLine.appendSwitch(
    'unsafely-treat-insecure-origin-as-secure',
    'http://localhost:3000,http://127.0.0.1:3000'
);

// 跳过 Windows 系统摄像头权限弹窗，避免首次 getUserMedia 等待 5 秒超时
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');

let mainWindow = null;
let tray = null;
let serverProcess = null;
const PORT = 3000;

// ── 启动内嵌服务器 ──────────────────────────────────────
function startServer() {
    const serverPath = path.join(__dirname, '..', 'server.js');
    serverProcess = fork(serverPath, [], {
        env: { ...process.env, PORT: String(PORT), CHCP: '65001' },
        execArgv: [],
        silent: false,
    });
    serverProcess.on('error', (err) => {
        dialog.showErrorBox('服务器启动失败', err.message);
    });
    console.log('[Teacher] server started, PID:', serverProcess.pid);
}

// ── 创建主窗口 ──────────────────────────────────────────
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        title: 'SyncClassroom 教师端',
        frame: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
        },
        show: false,
    });
    mainWindow.setMenu(null);

    // 等服务器就绪后加载页面
    const tryLoad = (retries = 20) => {
        const http = require('http');
        http.get(`http://localhost:${PORT}`, () => {
            mainWindow.loadURL(`http://localhost:${PORT}`);
        }).on('error', () => {
            if (retries > 0) setTimeout(() => tryLoad(retries - 1), 500);
            else dialog.showErrorBox('连接失败', '无法连接到本地服务器');
        });
    };
    setTimeout(() => tryLoad(), 1000);

    mainWindow.once('ready-to-show', () => mainWindow.show());
    mainWindow.on('closed', () => { mainWindow = null; });
}

// ── 系统托盘 ────────────────────────────────────────────
function createTray() {
    const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
    tray.setToolTip('SyncClassroom 教师端');
    tray.setContextMenu(Menu.buildFromTemplate([
        { label: '打开控制台', click: () => { if (mainWindow) mainWindow.show(); else createWindow(); } },
        { type: 'separator' },
        { label: '退出', click: () => app.quit() },
    ]));
    tray.on('double-click', () => { if (mainWindow) mainWindow.show(); });
}

// ── 应用生命周期 ─────────────────────────────────────────
app.whenReady().then(() => {
    // Allow camera/microphone access for course interactions
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        const allowed = ['media', 'camera', 'microphone', 'display-capture', 'videoCapture', 'audioCapture'];
        callback(allowed.includes(permission));
    });
    session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
        const allowed = ['media', 'camera', 'microphone', 'display-capture', 'videoCapture', 'audioCapture'];
        return allowed.includes(permission);
    });
    startServer();
    createWindow();
    createTray();
});

// IPC: 读取/保存教师端设置
ipcMain.handle('get-settings', () => loadSettings());
ipcMain.handle('save-settings', (_, settings) => saveSettings(settings));

// IPC: 切换全屏
ipcMain.on('toggle-fullscreen', () => {
    if (!mainWindow) return;
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
});

// IPC: 导入课程文件（弹出文件选择对话框，复制到 public/courses/）
ipcMain.handle('import-course', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: '导入课程文件',
        filters: [{ name: '课程文件', extensions: ['tsx', 'js'] }],
        properties: ['openFile', 'multiSelections'],
    });
    if (result.canceled || !result.filePaths.length) {
        return { success: false, canceled: true };
    }
    const coursesDir = path.join(__dirname, '..', 'public', 'courses');
    if (!require('fs').existsSync(coursesDir)) {
        require('fs').mkdirSync(coursesDir, { recursive: true });
    }
    const imported = [];
    const skipped = [];
    for (const srcPath of result.filePaths) {
        const fileName = path.basename(srcPath);
        const destPath = path.join(coursesDir, fileName);
        try {
            require('fs').copyFileSync(srcPath, destPath);
            imported.push(fileName);
            console.log(`[import] course imported: ${fileName}`);
        } catch (err) {
            skipped.push(fileName);
            console.error(`[import] failed to copy ${fileName}: ${err.message}`);
        }
    }
    return { success: true, imported, skipped };
});

app.on('window-all-closed', (e) => {
    // 关闭窗口不退出，保持服务器运行
    e.preventDefault();
});

app.on('before-quit', () => {
    if (serverProcess) serverProcess.kill();
});

app.on('activate', () => {
    if (!mainWindow) createWindow();
});
