// ========================================================
// 教师端主进程
// 职责：启动 server.js，打开教师端浏览器窗口
// ========================================================
const { app, BrowserWindow, Tray, Menu, nativeImage, dialog } = require('electron');
const path = require('path');
const { fork, spawnSync } = require('child_process');

// 切换 Windows 控制台代码页为 UTF-8，解决中文乱码
if (process.platform === 'win32') {
    spawnSync('chcp', ['65001'], { shell: true, stdio: 'ignore' });
}

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
    startServer();
    createWindow();
    createTray();
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
