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

// ── 安装后服务注册（NSIS customInstall 调用）────────────
if (process.argv.includes('--register-service')) {
    // 以 sc.exe 注册自启动服务，指向当前 exe
    const exePath = process.execPath;
    spawnSync('sc', [
        'create', 'SyncClassroomStudent',
        'binPath=', `"${exePath}"`,
        'start=', 'auto',
        'DisplayName=', 'SyncClassroom Student Guard',
    ], { shell: false, stdio: 'ignore' });
    spawnSync('sc', ['description', 'SyncClassroomStudent', 'SyncClassroom 学生端守护服务'], { shell: false, stdio: 'ignore' });
    spawnSync('sc', ['start', 'SyncClassroomStudent'], { shell: false, stdio: 'ignore' });
    process.exit(0);
}

// 禁用 GPU 磁盘缓存，避免 Windows 上因缓存目录锁定导致的启动报错
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-http-cache');

let mainWindow = null;
let adminWindow = null;
let tray = null;
let isClassActive = false;
let forceFullscreen = true; // 跟踪教师端的强制全屏设置
let config = loadConfig();
let retryTimer = null; // 后台重连定时器
const RETRY_INTERVAL_MS = 5000; // 每 5 秒重试一次

// ── 开机自启 ─────────────────────────────────────────────
app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: false,
    name: 'SyncClassroom 学生端',
});

// ── 后台轮询重连 ─────────────────────────────────────────
function startRetrying() {
    if (retryTimer) return; // 已在重试中
    retryTimer = setInterval(() => {
        const url = `http://${config.teacherIp}:${config.port || 3000}`;
        const http = require('http');
        http.get(url, (res) => {
            res.resume(); // 消费响应体
            if (res.statusCode < 500) {
                // 服务器已就绪，停止重试并加载页面
                stopRetrying();
                if (mainWindow) {
                    mainWindow.loadURL(url).catch(() => {});
                }
            }
        }).on('error', () => {
            // 仍然无法连接，继续等待
        });
    }, RETRY_INTERVAL_MS);
}

function stopRetrying() {
    if (retryTimer) {
        clearInterval(retryTimer);
        retryTimer = null;
    }
}

// ── 创建主窗口（学生课堂窗口）────────────────────────────
function createMainWindow() {
    const url = `http://${config.teacherIp}:${config.port || 3000}`;

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        title: 'SyncClassroom 学生端',
        frame: false,
        resizable: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
        },
        show: false, // 静默启动，课堂开始后才显示
    });
    mainWindow.setMenu(null);

    mainWindow.loadURL(url).catch(() => {
        // 连接失败时显示离线提示页，并开始后台重连
        mainWindow.loadFile(path.join(__dirname, 'offline.html'));
        startRetrying();
    });

    // 页面成功加载时停止重试
    mainWindow.webContents.on('did-navigate', (_, navUrl) => {
        if (!navUrl.startsWith('file://')) {
            stopRetrying();
        }
    });

    // 阻止关闭：课堂进行中完全阻止，平时最小化到托盘
    mainWindow.on('close', (e) => {
        e.preventDefault();
        if (isClassActive) {
            return;
        }
        mainWindow.hide();
    });

    // Win+D / 系统最小化：课堂模式下立即恢复
    mainWindow.on('minimize', () => {
        if (isClassActive && forceFullscreen) {
            setImmediate(() => {
                mainWindow.restore();
                mainWindow.setFullScreen(true);
                mainWindow.setAlwaysOnTop(true, 'screen-saver');
                mainWindow.focus();
            });
        }
    });

    // 失焦时（切换到其他窗口）：课堂模式下抢回焦点
    mainWindow.on('blur', () => {
        if (isClassActive && forceFullscreen) {
            // 短暂延迟，避免与管理员窗口冲突
            setTimeout(() => {
                if (!adminWindow || !adminWindow.isFocused()) {
                    mainWindow && mainWindow.focus();
                }
            }, 200);
        }
    });

    // 阻止 Alt+F4 / 系统关闭
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.alt && input.key === 'F4') {
            event.preventDefault();
        }
        // 阻止 Win 键组合（部分系统快捷键）
        if (input.meta) {
            event.preventDefault();
        }
    });
}

// ── 课堂开始：按设置决定是否全屏置顶 ───────────────────
function enterClassMode() {
    isClassActive = true;
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.setSkipTaskbar(false);
    mainWindow.focus();
    if (forceFullscreen) {
        mainWindow.setAlwaysOnTop(true, 'screen-saver');
        mainWindow.setFullScreen(true);
        // 延迟再次强制，防止系统动画完成后被抢走
        setTimeout(() => {
            if (isClassActive && forceFullscreen && mainWindow) {
                mainWindow.setFullScreen(true);
                mainWindow.setAlwaysOnTop(true, 'screen-saver');
                mainWindow.focus();
            }
        }, 500);
    }
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
ipcMain.on('class-started', (_, opts) => {
    // opts 可携带 { forceFullscreen } 覆盖当前标志
    if (opts && typeof opts.forceFullscreen === 'boolean') {
        forceFullscreen = opts.forceFullscreen;
    }
    enterClassMode();
});
ipcMain.on('class-ended', () => exitClassMode());

// 教师端远程控制全屏开关（课堂进行中有效）
ipcMain.on('set-fullscreen', (_, enable) => {
    forceFullscreen = enable; // 始终更新标志，供 enterClassMode 使用
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
        stopRetrying();
        // 重新加载新 IP
        const url = `http://${config.teacherIp}:${config.port || 3000}`;
        mainWindow.loadURL(url).catch(() => {
            mainWindow.loadFile(path.join(__dirname, 'offline.html'));
            startRetrying();
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

// 学生端不需要课堂设置（教师端专用），返回 null 避免 IPC 报错
ipcMain.handle('get-settings', () => null);
ipcMain.handle('save-settings', () => null);

// 教师端远程推送新管理员密码 hash
ipcMain.on('set-admin-password', (_, hash) => {
    config = { ...config, adminPasswordHash: hash };
    saveConfig(config);
    console.log('[admin] password updated remotely');
});

// 手动重试（offline.html 按钮触发）
ipcMain.on('manual-retry', () => {
    stopRetrying();
    const url = `http://${config.teacherIp}:${config.port || 3000}`;
    if (mainWindow) {
        mainWindow.loadURL(url).catch(() => {
            mainWindow.loadFile(path.join(__dirname, 'offline.html'));
            startRetrying();
        });
    }
});

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
