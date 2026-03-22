// ========================================================
// 教师端主进程
// 职责：启动 server.js，打开教师端浏览器窗口
// ========================================================
const { app, BrowserWindow, Tray, Menu, nativeImage, dialog, ipcMain, session } = require('electron');
const path = require('path');
const { fork, spawnSync } = require('child_process');
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
        serverProcess = fork(serverPath, [], {
            env: { ...process.env, PORT: String(PORT), CHCP: '65001', LOG_DIR: logger.getLogDir() },
            execArgv: [],
            silent: false,
        });

        if (!serverProcess) {
            throw new Error('Failed to create server process');
        }

        // 监听 stdout (需要检查对象是否存在)
        if (serverProcess.stdout) {
            serverProcess.stdout.on('data', (data) => {
                const output = data.toString();
                logger.info('SERVER-STDOUT', output.trim());
            });
        }

        // 监听 stderr
        if (serverProcess.stderr) {
            serverProcess.stderr.on('data', (data) => {
                const output = data.toString();
                logger.error('SERVER-STDERR', output.trim());
            });
        }

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
        const options = {
            hostname: 'localhost',
            port: PORT,
            path: '/',
            method: 'GET',
            timeout: 2000
        };

        const req = http.request(options, (res) => {
            logger.info('WINDOW', 'Server responded', { statusCode: res.statusCode });
            mainWindow.loadURL(`http://localhost:${PORT}`).catch(err => {
                logger.error('WINDOW', 'Failed to load URL', err);
                dialog.showErrorBox('页面加载失败',
                    `无法加载 http://localhost:${PORT}\n错误: ${err.message}\n\n详细日志已保存到: ${logger.getLogDir()}`
                );
            });
        });

        req.on('error', (err) => {
            logger.error('WINDOW', 'Connection failed', { retries: retries, error: err.message });
            if (retries > 0) {
                setTimeout(() => tryLoad(retries - 1), 500);
            } else {
                const errorMsg = `无法连接到本地服务器 (http://localhost:${PORT})\n\n` +
                    `可能的原因：\n` +
                    `1. 端口 3000 被其他程序占用\n` +
                    `2. server.js 启动失败（请查看日志）\n` +
                    `3. 防火墙阻止了本地连接\n\n` +
                    `错误详情: ${err.message}\n\n` +
                    `日志目录: ${logger.getLogDir()}`;
                dialog.showErrorBox('连接失败', errorMsg);
            }
        });

        req.setTimeout(2000, () => {
            req.destroy();
            logger.error('WINDOW', 'Connection timeout');
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
app.whenReady().then(() => {
    logger.info('APP', 'Application ready');

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

// IPC: 打开日志目录
ipcMain.handle('open-log-dir', () => {
    logger.info('IPC', 'Opening log directory requested');
    logger.openLogDir();
    return logger.getLogDir();
});

// IPC: 切换全屏
ipcMain.on('toggle-fullscreen', () => {
    if (!mainWindow) return;
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
});

// IPC: 导入课程文件（弹出文件选择对话框，复制到 public/courses/）
ipcMain.handle('import-course', async () => {
    logger.info('IPC', 'Import course requested');
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
            logger.info('IMPORT', 'Course imported', { fileName });
        } catch (err) {
            skipped.push(fileName);
            logger.error('IMPORT', 'Failed to copy course', { fileName, error: err.message });
        }
    }
    return { success: true, imported, skipped };
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
