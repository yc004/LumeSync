// ========================================================
// 学生端主进程
// 职责：开机自启、托盘常驻、课堂开始时全屏置顶、阻止关闭
// ========================================================
const {
    app, BrowserWindow, Tray, Menu, nativeImage,
    ipcMain, shell, dialog
} = require('electron');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { loadConfig, saveConfig, getAdminPasswordHash } = require('./config.js');

// 切换 Windows 控制台代码页为 UTF-8，解决中文乱码
if (process.platform === 'win32') {
    spawnSync('chcp', ['65001'], { shell: true, stdio: 'ignore' });
}

let mainWindow = null;
let adminWindow = null;
let tray = null;
let isClassActive = false;
let config = loadConfig();

// ── 开机自启 ─────────────────────────────────────────────
app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: false,
    name: 'SyncClassroom 学生端',
});

// ── 创建主窗口（学生课堂窗口）────────────────────────────
function createMainWindow() {
    const url = `http://${config.teacherIp}:${config.port || 3000}`;

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        title: 'SyncClassroom 学生端',
        frame: true,
        resizable: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
        },
        show: true,
    });

    mainWindow.loadURL(url).catch(() => {
        // 连接失败时显示离线提示页
        mainWindow.loadFile(path.join(__dirname, 'offline.html'));
    });

    // 阻止关闭：课堂进行中完全阻止，平时最小化到托盘
    mainWindow.on('close', (e) => {
        e.preventDefault();
        if (isClassActive) {
            // 课堂中：不允许任何关闭操作
            return;
        }
        // 非课堂中：最小化到托盘
        mainWindow.hide();
    });

    // 阻止 Alt+F4 / 系统关闭
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.alt && input.key === 'F4') {
            event.preventDefault();
        }
    });
}

// ── 课堂开始：全屏置顶 ───────────────────────────────────
function enterClassMode() {
    isClassActive = true;
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.setAlwaysOnTop(true, 'screen-saver'); // 最高层级
    mainWindow.setFullScreen(true);
    mainWindow.setSkipTaskbar(false);
    mainWindow.focus();
}

// ── 课堂结束：恢复普通窗口 ──────────────────────────────
function exitClassMode() {
    isClassActive = false;
    if (!mainWindow) return;
    mainWindow.setFullScreen(false);
    mainWindow.setAlwaysOnTop(false);
}

// ── 管理员配置窗口 ───────────────────────────────────────
function openAdminWindow() {
    if (adminWindow) { adminWindow.focus(); return; }
    adminWindow = new BrowserWindow({
        width: 480,
        height: 420,
        title: '管理员设置',
        resizable: false,
        modal: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
        },
    });
    adminWindow.loadFile(path.join(__dirname, 'admin.html'));
    adminWindow.on('closed', () => { adminWindow = null; });
    adminWindow.setMenu(null);
    // 始终置顶，确保全屏课堂模式下也能看到管理员窗口
    adminWindow.setAlwaysOnTop(true, 'screen-saver');
}

// ── 系统托盘 ─────────────────────────────────────────────
function createTray() {
    const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
    tray.setToolTip('SyncClassroom 学生端');

    const menu = Menu.buildFromTemplate([
        { label: '显示窗口', click: () => mainWindow && mainWindow.show() },
        { label: '管理员设置...', click: openAdminWindow },
        { type: 'separator' },
        {
            label: '退出（需要管理员密码）',
            click: () => {
                // 退出也需要密码验证
                openAdminWindow();
            }
        },
    ]);
    tray.setContextMenu(menu);
    tray.on('double-click', () => mainWindow && mainWindow.show());
}

// ── IPC 处理 ─────────────────────────────────────────────
ipcMain.on('class-started', () => enterClassMode());
ipcMain.on('class-ended', () => exitClassMode());

// 教师端远程控制全屏开关（课堂进行中有效）
ipcMain.on('set-fullscreen', (_, enable) => {
    if (!mainWindow || !isClassActive) return;
    if (enable) {
        mainWindow.setFullScreen(true);
        mainWindow.setAlwaysOnTop(true, 'screen-saver');
    } else {
        mainWindow.setFullScreen(false);
        mainWindow.setAlwaysOnTop(false);
    }
});

ipcMain.handle('get-config', () => ({ ...config, adminPasswordHash: undefined }));

ipcMain.handle('save-config', (_, newConfig) => {
    // 特殊标志：管理员请求退出
    if (newConfig._quit) {
        app.exit(0);
        return true;
    }
    config = { ...config, ...newConfig };
    const ok = saveConfig(config);
    if (ok && mainWindow) {
        // 重新加载新 IP
        const url = `http://${config.teacherIp}:${config.port || 3000}`;
        mainWindow.loadURL(url).catch(() => {
            mainWindow.loadFile(path.join(__dirname, 'offline.html'));
        });
    }
    return ok;
});

ipcMain.handle('verify-password', (_, pwd) => {
    const hash = crypto.createHash('sha256').update(pwd).digest('hex');
    const expected = getAdminPasswordHash(config);
    if (hash === expected) return { ok: true };
    return { ok: false };
});

ipcMain.handle('get-role', () => 'student');

// ── 应用生命周期 ─────────────────────────────────────────
app.whenReady().then(() => {
    createMainWindow();
    createTray();
});

// 阻止所有窗口关闭时退出
app.on('window-all-closed', (e) => e.preventDefault());

// 阻止系统级退出（如注销时）——普通用户无法通过任务管理器结束 Electron 进程
// 真正的防杀需配合 Windows 服务守护（见 service-install.js）
app.on('before-quit', (e) => {
    if (isClassActive) e.preventDefault();
});
