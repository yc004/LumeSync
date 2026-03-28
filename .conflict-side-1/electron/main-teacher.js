// ========================================================
// 教师端主进程
// 职责：启动 server.js，打开教师端浏览器窗口
// ========================================================
const { app, BrowserWindow, Tray, Menu, nativeImage, dialog, ipcMain, session, globalShortcut } = require('electron');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { loadSettings, saveSettings } = require('./config.js');
const { Logger } = require('./logger.js');

// 初始化日志系统
const logger = new Logger('LumeSync-Teacher');

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

function isPortAvailable(port) {
    return new Promise((resolve) => {
        const net = require('net');
        const tester = net.createServer();
        tester.once('error', () => resolve(false));
        tester.once('listening', () => {
            tester.close(() => resolve(true));
        });
        tester.listen(port, '127.0.0.1');
    });
}

function checkLocalHealth(port) {
    return new Promise((resolve) => {
        const http = require('http');
        const req = http.request(
            { hostname: '127.0.0.1', port, path: '/api/health', method: 'GET', timeout: 800 },
            (res) => {
                const ok = res.statusCode >= 200 && res.statusCode < 500;
                res.resume();
                resolve(ok);
            }
        );
        req.on('timeout', () => req.destroy(new Error('timeout')));
        req.on('error', () => resolve(false));
        req.end();
    });
}

// 捕获未处理的异常和未捕获的 Promise 拒绝
process.on('uncaughtException', (err) => {
    logger.error('UNCAUGHT', 'Uncaught Exception', err);
    setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('UNHANDLED', 'Unhandled Promise Rejection', reason);
});

// ── 启动内嵌服务器 ──────────────────────────────────────
function startServer() {
    const serverPath = path.join(__dirname, '..', 'server.js');
    logger.info('SERVER', 'Starting server', { path: serverPath, exists: require('fs').existsSync(serverPath) });

    try {
        serverProcess = spawn(process.execPath, [serverPath], {
            env: {
                ...process.env,
                PORT: String(PORT),
                CHCP: '65001',
                LOG_DIR: logger.getLogDir(),
                ELECTRON_RUN_AS_NODE: '1'
            },
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        });

        if (!serverProcess || !serverProcess.pid) {
            throw new Error('Failed to create server process');
        }

        serverProcess.stdout.on('data', (data) => {
            const output = data.toString();
            logger.info('SERVER-STDOUT', output.trim());
        });

        serverProcess.stderr.on('data', (data) => {
            const output = data.toString();
            logger.error('SERVER-STDERR', output.trim());
        });


        serverProcess.on('error', (err) => {
            logger.error('SERVER', 'Server process error', err);
            dialog.showErrorBox('服务器启动失败', `${err.message}\n\n详细日志已保存到: ${logger.getLogDir()}`);
        });

        serverProcess.on('exit', (code, signal) => {
            logger.info('SERVER', 'Server process exited', { code, signal });
        });

        logger.info('SERVER', 'Server started successfully', { pid: serverProcess.pid, port: PORT });
    } catch (err) {
        logger.error('SERVER', 'Failed to start server', err);
        dialog.showErrorBox('服务器启动失败', `${err.message}\n\n详细日志已保存到: ${logger.getLogDir()}`);
        throw err;
    }
}

async function ensureServer() {
    const available = await isPortAvailable(PORT);
    if (available) {
        startServer();
        return true;
    }

    const healthy = await checkLocalHealth(PORT);
    if (healthy) {
        logger.warn('SERVER', 'Port already in use, reusing existing local server', { port: PORT });
        return true;
    }

    dialog.showErrorBox(
        '端口被占用',
        `端口 ${PORT} 已被其他程序占用，且不是 LumeSync 本地服务器。\n\n` +
        `请关闭占用端口的程序，或重启电脑后再启动。\n\n` +
        `日志目录: ${logger.getLogDir()}`
    );
    app.quit();
    return false;
}

// ── 创建主窗口 ──────────────────────────────────────────
function createWindow() {
    logger.info('WINDOW', 'Creating main window');

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

    // 拦截窗口错误
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        logger.error('WINDOW', 'Failed to load page', {
            errorCode,
            errorDescription,
            url: validatedURL
        });
    });

    mainWindow.webContents.on('crashed', (event, killed) => {
        logger.error('WINDOW', 'WebContents crashed', { killed });
    });

    // 等服务器就绪后加载页面
    const tryLoad = (retries = 20) => {
        const http = require('http');
        const timeoutMs = 5000;
        const options = {
            hostname: '127.0.0.1',
            port: PORT,
            path: '/api/health',
            method: 'GET',
            timeout: timeoutMs
        };

        const req = http.request(options, (res) => {
            logger.info('WINDOW', 'Server responded', { statusCode: res.statusCode });
            res.resume();
            mainWindow.loadURL(`http://127.0.0.1:${PORT}`).catch(err => {
                const message = err?.message || String(err) || 'unknown error';
                logger.error('WINDOW', 'Failed to load URL', { message, error: err });
                dialog.showErrorBox('页面加载失败',
                    `无法加载 http://127.0.0.1:${PORT}\n错误: ${message}\n\n详细日志已保存到: ${logger.getLogDir()}`
                );
            });
        });

        req.on('error', (err) => {
            const message = err?.message || String(err) || 'unknown error';
            logger.error('WINDOW', 'Connection failed', { retries: retries, error: message });
            if (retries > 0) {
                setTimeout(() => tryLoad(retries - 1), 500);
            } else {
                const errorMsg = `无法连接到本地服务器 (http://127.0.0.1:${PORT})\n\n` +
                    `可能的原因：\n` +
                    `1. 端口 3000 被其他程序占用\n` +
                    `2. server.js 启动失败（请查看日志）\n` +
                    `3. 防火墙阻止了本地连接\n\n` +
                    `错误详情: ${message}\n\n` +
                    `日志目录: ${logger.getLogDir()}`;
                dialog.showErrorBox('连接失败', errorMsg);
            }
        });

        req.setTimeout(timeoutMs, () => {
            req.destroy(new Error('Connection timeout'));
            logger.error('WINDOW', 'Connection timeout', { retries: retries, timeoutMs });
            if (retries > 0) {
                setTimeout(() => tryLoad(retries - 1), 500);
            } else {
                const errorMsg = `无法连接到本地服务器 (http://127.0.0.1:${PORT})\n\n` +
                    `可能的原因：\n` +
                    `1. 端口 3000 被其他程序占用\n` +
                    `2. server.js 启动失败（请查看日志）\n` +
                    `3. 防火墙阻止了本地连接\n\n` +
                    `错误详情: Connection timeout\n\n` +
                    `日志目录: ${logger.getLogDir()}`;
                dialog.showErrorBox('连接失败', errorMsg);
            }
        });

        req.end();
    };

    logger.info('WINDOW', 'Will attempt to load page in 1 second');
    setTimeout(() => tryLoad(), 1000);

    mainWindow.once('ready-to-show', () => {
        logger.info('WINDOW', 'Window ready to show');
        mainWindow.show();
    });
    mainWindow.on('closed', () => {
        logger.info('WINDOW', 'Window closed');
        mainWindow = null;
    });

    // 窗口最大化/还原事件（通知渲染进程）
    mainWindow.on('maximize', () => {
        mainWindow.webContents.send('window-maximized');
    });
    mainWindow.on('unmaximize', () => {
        mainWindow.webContents.send('window-unmaximized');
    });
}

// ── 系统托盘 ────────────────────────────────────────────
function createTray() {
    const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
    tray.setToolTip('SyncClassroom 教师端');

    const menuTemplate = [
        {
            label: '打开控制台',
            click: () => {
                logger.info('TRAY', 'Opening console from tray');
                if (mainWindow) mainWindow.show();
                else createWindow();
            }
        },
        { type: 'separator' },
        {
            label: '打开日志目录',
            click: () => {
                logger.info('TRAY', 'Opening log directory');
                logger.openLogDir();
            }
        },
        { type: 'separator' },
        {
            label: '退出',
            click: () => {
                logger.info('TRAY', 'Quitting from tray');
                app.quit();
            }
        },
    ];

    tray.setContextMenu(Menu.buildFromTemplate(menuTemplate));
    tray.on('double-click', () => {
        logger.info('TRAY', 'Double clicked');
        if (mainWindow) mainWindow.show();
    });
}

// ── 应用生命周期 ─────────────────────────────────────────
app.whenReady().then(async () => {
    logger.info('APP', 'Application ready');

    // 清除应用缓存，避免加载到以前下载失败/损坏的资源（如被缓存的 404 字体）
    await session.defaultSession.clearCache();

    // Allow camera/microphone access for course interactions
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        const allowed = ['media', 'camera', 'microphone', 'display-capture', 'videoCapture', 'audioCapture'];
        callback(allowed.includes(permission));
    });
    session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
        const allowed = ['media', 'camera', 'microphone', 'display-capture', 'videoCapture', 'audioCapture'];
        return allowed.includes(permission);
    });

    const ok = await ensureServer();
    if (!ok) return;
    createWindow();
    createTray();

    if (globalShortcut) {
        const accelerator = 'CommandOrControl+Shift+D';
        const ok = globalShortcut.register(accelerator, () => {
            const win = BrowserWindow.getFocusedWindow() || mainWindow;
            if (!win) return;
            try {
                if (win.webContents.isDevToolsOpened()) win.webContents.closeDevTools();
                else win.webContents.openDevTools({ mode: 'detach' });
            } catch (_) {}
        });
        logger.info('APP', 'Debug shortcut registered', { accelerator, ok: !!ok });
    }
});

app.on('will-quit', () => {
    try { globalShortcut && globalShortcut.unregisterAll(); } catch (_) {}
});

// IPC: 读取/保存教师端设置
ipcMain.handle('get-settings', () => loadSettings());
ipcMain.handle('save-settings', (_, settings) => saveSettings(settings));

// IPC: 打开日志目录
ipcMain.handle('open-log-dir', () => {
    logger.info('IPC', 'Opening log directory requested');
    logger.openLogDir();
    return logger.getLogDir();
});

// IPC: 选择提交内容存储目录
ipcMain.handle('select-submission-dir', async () => {
    logger.info('IPC', 'Selecting submission directory');
    const result = await dialog.showOpenDialog(mainWindow, {
        title: '选择学生提交内容存储位置',
        properties: ['openDirectory', 'createDirectory']
    });

    if (result.canceled || result.filePaths.length === 0) {
        logger.info('IPC', 'Submission directory selection cancelled');
        return null;
    }

    const selectedDir = result.filePaths[0];
    logger.info('IPC', 'Submission directory selected', { dir: selectedDir });
    return selectedDir;
});

// IPC: 切换全屏
ipcMain.on('toggle-fullscreen', () => {
    if (!mainWindow) return;
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
});

ipcMain.on('toggle-devtools', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    if (!win) return;
    try {
        if (win.webContents.isDevToolsOpened()) win.webContents.closeDevTools();
        else win.webContents.openDevTools({ mode: 'detach' });
    } catch (_) {}
});

// IPC: 窗口控制
ipcMain.on('minimize-window', () => {
    if (!mainWindow) return;
    mainWindow.minimize();
});

ipcMain.on('maximize-window', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
    } else {
        mainWindow.maximize();
    }
});

ipcMain.on('close-window', () => {
    if (!mainWindow) return;
    mainWindow.close();
});

// IPC: 导入课程文件（弹出文件选择对话框，复制到 public/courses/）
ipcMain.handle('import-course', async () => {
    logger.info('IPC', 'Import course requested');
    const result = await dialog.showOpenDialog(mainWindow, {
        title: '导入课程文件',
        filters: [
            { name: '萤火课件文件', extensions: ['lume'] },
            { name: '旧格式课件文件', extensions: ['tsx', 'ts', 'jsx', 'js'] },
            { name: 'PDF课件', extensions: ['pdf'] },
            { name: '所有文件', extensions: ['*'] },
        ],
        properties: ['openFile', 'multiSelections'],
    });
    if (result.canceled || !result.filePaths.length) {
        return { success: false, canceled: true };
    }
    const coursesDir = path.join(__dirname, '..', 'public', 'courses');
    if (!require('fs').existsSync(coursesDir)) {
        require('fs').mkdirSync(coursesDir, { recursive: true });
    }
    const allowedExts = new Set(['.lume', '.tsx', '.ts', '.jsx', '.js', '.pdf']);
    const imported = [];
    const skipped = [];
    for (const srcPath of result.filePaths) {
        const ext = path.extname(srcPath || '').toLowerCase();
        if (!allowedExts.has(ext)) {
            skipped.push(path.basename(srcPath));
            continue;
        }

        const baseName = path.parse(srcPath).name;
        let destName = ext === '.pdf' ? `${baseName}.pdf` : `${baseName}.lume`;
        let destPath = path.join(coursesDir, destName);
        let n = 1;
        while (require('fs').existsSync(destPath)) {
            destName = ext === '.pdf' ? `${baseName}-${n}.pdf` : `${baseName}-${n}.lume`;
            destPath = path.join(coursesDir, destName);
            n += 1;
        }
        try {
            require('fs').copyFileSync(srcPath, destPath);
            imported.push(destName);
            logger.info('IMPORT', 'Course imported', { fileName: destName });
        } catch (err) {
            skipped.push(destName);
            logger.error('IMPORT', 'Failed to copy course', { fileName: destName, error: err.message });
        }
    }
    return { success: true, imported, skipped };
});

// IPC: 导出课程文件（从 public/courses/ 复制到用户选择的位置）
ipcMain.handle('export-course', async (event, { courseFile } = {}) => {
    try {
        const coursesDir = path.join(__dirname, '..', 'public', 'courses');
        const resolvedCoursesDir = path.resolve(coursesDir);
        const requested = String(courseFile || '').trim();
        if (!requested) return { success: false, error: 'Missing courseFile' };

        const sourcePath = path.resolve(coursesDir, requested);
        if (!sourcePath.toLowerCase().startsWith((resolvedCoursesDir + path.sep).toLowerCase())) {
            return { success: false, error: 'Invalid course path' };
        }
        if (!require('fs').existsSync(sourcePath)) {
            return { success: false, error: 'Course file not found' };
        }

        const srcExt = (path.extname(requested || '') || '.lume').toLowerCase();
        const ensureExt = (p, ext) => {
            const currentExt = path.extname(p || '');
            if (!currentExt) return `${p}${ext}`;
            return p;
        };

        const suggestedName = path.basename(requested);
        const result = await dialog.showSaveDialog(mainWindow, {
            title: '导出课件文件',
            defaultPath: suggestedName,
            filters: [
                { name: '萤火课件文件', extensions: ['lume'] },
                { name: 'PDF课件', extensions: ['pdf'] },
                { name: '所有文件', extensions: ['*'] },
            ],
        });

        if (result.canceled || !result.filePath) {
            return { success: false, canceled: true };
        }

        const targetPath = ensureExt(result.filePath, srcExt);
        require('fs').copyFileSync(sourcePath, targetPath);
        return { success: true, filePath: targetPath, filename: path.basename(targetPath) };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

app.on('window-all-closed', (e) => {
    logger.info('APP', 'All windows closed, preventing quit to keep server running');
    // 关闭窗口不退出，保持服务器运行
    e.preventDefault();
});

app.on('before-quit', () => {
    logger.info('APP', 'Application about to quit');
    if (serverProcess) {
        logger.info('APP', 'Killing server process', { pid: serverProcess.pid });
        serverProcess.kill();
    }
});

app.on('activate', () => {
    logger.debug('APP', 'Application activated');
    if (!mainWindow) createWindow();
});

app.on('quit', () => {
    logger.info('APP', 'Application quit');
});
