// ========================================================
// 萤火课件编辑器 - 独立的 AI 课件创建平台
// ========================================================
const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { Logger } = require('../../common/electron/logger.js');

let mainWindow;
const logger = new Logger('LumeSync-Editor');
let serverProcess = null;
const PORT = 3001;

// 切换 Windows 控制台代码页为 UTF-8
if (process.platform === 'win32') {
    require('child_process').spawnSync('chcp', ['65001'], { shell: true, stdio: 'ignore' });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1024,
        minHeight: 768,
        title: '萤火课件编辑器',
        icon: path.join(__dirname, '../../../shared/build/icon-editor.ico'),
        frame: false,
        webPreferences: {
            preload: path.join(__dirname, '../../common/electron/preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    mainWindow.setMenu(null);
    mainWindow.loadURL(`http://localhost:${PORT}/editor.html`);

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        logger.error('WINDOW', 'Failed to load page', {
            errorCode,
            errorDescription,
            url: validatedURL
        });
    });

    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
        const payload = { level, line, sourceId };
        if (level >= 2) logger.error('RENDERER-CONSOLE', message, payload);
        else if (level === 1) logger.warn('RENDERER-CONSOLE', message, payload);
        else logger.info('RENDERER-CONSOLE', message, payload);
    });

    mainWindow.on('maximize', () => mainWindow.webContents.send('window-maximized'));
    mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-unmaximized'));

    const toggleDevTools = () => {
        try {
            if (mainWindow.webContents.isDevToolsOpened()) mainWindow.webContents.closeDevTools();
            else mainWindow.webContents.openDevTools({ mode: 'detach' });
        } catch (_) {}
    };

    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown') return;
        const key = String(input.key || '').toLowerCase();
        if (key === 'd' && input.control && input.shift) {
            event.preventDefault();
            toggleDevTools();
        }
    });

    // 打开开发者工具 (如果需要调试)
    // mainWindow.webContents.openDevTools();
}

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

function startServer() {
    const { fork } = require('child_process');
    const serverPath = path.join(__dirname, '../../../packages/server/index.js');
    const cacheDir = path.join(app.getPath('userData'), 'cache');
    serverProcess = fork(serverPath, [], {
        env: { ...process.env, PORT: String(PORT), CHCP: '65001', LOG_DIR: logger.getLogDir(), LUMESYNC_CACHE_DIR: cacheDir },
        execArgv: [],
        silent: false,
    });
}

async function ensureServer() {
    const available = await isPortAvailable(PORT);
    if (available) {
        startServer();
        return true;
    }
    const healthy = await checkLocalHealth(PORT);
    return !!healthy;
}

app.whenReady().then(async () => {
    logger.info('APP', 'Editor app ready');



    // 清除应用缓存，避免加载到以前下载失败/损坏的资源（如被缓存的 404 字体）
    const { session } = require('electron');
    await session.defaultSession.clearCache();

    app.commandLine.appendSwitch(
        'unsafely-treat-insecure-origin-as-secure',
        `http://localhost:${PORT},http://127.0.0.1:${PORT}`
    );

    const ok = await ensureServer();
    if (!ok) return;

    createWindow();

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

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    logger.info('APP', 'All windows closed');
    if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
    try { globalShortcut && globalShortcut.unregisterAll(); } catch (_) {}
    try { serverProcess && serverProcess.kill(); } catch (_) {}
});

process.on('uncaughtException', (err) => {
    logger.error('UNCAUGHT', 'Uncaught Exception', err);
});

process.on('unhandledRejection', (reason) => {
    logger.error('UNHANDLED', 'Unhandled Promise Rejection', reason);
});

// IPC: 窗口控制
ipcMain.on('minimize-window', () => mainWindow?.minimize());
ipcMain.on('maximize-window', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on('close-window', () => mainWindow?.close());
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

ipcMain.handle('editor-log', (event, payload) => {
    const level = (payload?.level || 'INFO').toUpperCase();
    const category = payload?.category || 'EDITOR-RENDERER';
    const message = payload?.message || '';
    const data = payload?.data || null;

    if (level === 'ERROR') logger.error(category, message, data);
    else if (level === 'WARN') logger.warn(category, message, data);
    else if (level === 'DEBUG') logger.debug(category, message, data);
    else logger.info(category, message, data);

    return true;
});

ipcMain.handle('open-log-dir', () => {
    logger.info('IPC', 'Open log directory requested');
    logger.openLogDir();
    return logger.getLogDir();
});

ipcMain.handle('get-log-dir', () => {
    return logger.getLogDir();
});

const { CozeAPI } = require('@coze/api');

function normalizeCozeBaseURL(rawBaseURL) {
    const base = String(rawBaseURL || '').trim().replace(/\/+$/, '');
    if (!base) return '';
    return base
        .replace(/\/v3\/chat(?:\/completions)?$/i, '')
        .replace(/\/open_api\/v2$/i, '')
        .replace(/\/v1(?:\/chat\/completions)?$/i, '')
        .replace(/\/+$/, '');
}

ipcMain.handle('test-ai-connection', async (event, payload) => {
    const baseURL = (payload?.baseURL || '').trim().replace(/\/+$/, '');
    const apiKey = (payload?.apiKey || '').trim();
    const model = (payload?.model || '').trim();
    const timeoutMs = Number(payload?.timeoutMs) > 0 ? Number(payload.timeoutMs) : 30000;
    const startedAt = Date.now();

    if (!baseURL || !apiKey || !model) {
        return { success: false, error: 'Missing baseURL/apiKey/model' };
    }

    logger.info('AI-TEST', 'Main-process test started', {
        baseURL,
        model,
        timeoutMs
    });

    try {
        const cozeClient = new CozeAPI({
            baseURL,
            token: apiKey
        });

        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Request timeout (>${Math.round(timeoutMs / 1000)}s)`)), timeoutMs);
        });

        const requestPromise = cozeClient.chat.stream({
            bot_id: model,
            additional_messages: [{ role: 'user', content: 'ping' }]
        });

        const response = await Promise.race([requestPromise, timeoutPromise]);
        const elapsedMs = Date.now() - startedAt;

        logger.info('AI-TEST', 'Main-process test success', {
            elapsedMs,
            model
        });
        return {
            success: true,
            elapsedMs
        };
    } catch (error) {
        const elapsedMs = Date.now() - startedAt;
        const errMsg = error?.message || 'Unknown error';
        logger.error('AI-TEST', 'Main-process test failed', {
            elapsedMs,
            errorName: error?.name || null,
            error: errMsg
        });
        return {
            success: false,
            elapsedMs,
            errorName: error?.name || null,
            error: errMsg
        };
    }
});

// AI 聊天代理（使用 Coze 官方 SDK）
ipcMain.on('proxy-ai-chat', async (event, payload) => {
    const { requestId, apiKey, model, messages, temperature, stream } = payload;
    const baseURL = normalizeCozeBaseURL(payload?.baseURL);

    logger.info('AI-CHAT-PROXY', 'Request started', { requestId, model, stream, messageCount: messages?.length, baseURL });

    try {
        const cozeClient = new CozeAPI({
            baseURL,
            token: apiKey
        });

        // 转换消息格式
        const additionalMessages = (messages || []).map(m => ({
            role: m.role,
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
        }));

        const chatOptions = {
            bot_id: model,
            additional_messages: additionalMessages,
            auto_save_history: false
        };

        // 如果指定了 temperature，添加到参数中
        if (temperature !== undefined) {
            chatOptions.temperature = temperature;
        }

        if (!stream) {
            // 非流式响应
            const response = await cozeClient.chat.stream(chatOptions);

            let fullContent = '';
            for await (const chunk of response) {
                if (chunk.event === 'conversation.message.delta') {
                    fullContent += chunk.data.content;
                }
            }

            event.sender.send(`ai-chat-data-${requestId}`, { done: true, content: fullContent });
            return;
        }

        // 流式响应处理
        const streamResponse = cozeClient.chat.stream(chatOptions);

        let fullContent = '';
        for await (const chunk of streamResponse) {
            if (event.sender.isDestroyed()) break;

            if (chunk.event === 'conversation.message.delta') {
                const delta = chunk.data.content;
                fullContent += delta;
                event.sender.send(`ai-chat-data-${requestId}`, { done: false, delta });
            }
        }

        // 发送结束信号
        if (!event.sender.isDestroyed()) {
            event.sender.send(`ai-chat-data-${requestId}`, { done: true, content: fullContent });
        }

    } catch (error) {
        if (!event.sender.isDestroyed()) {
            logger.error('AI-CHAT-PROXY', 'Fatal error', { requestId, error: error.message });
            event.sender.send(`ai-chat-error-${requestId}`, { message: error.message });
        }
    }
});

// IPC: 文件读写 (已弃用 - 现在使用浏览器原生的 Blob API 导出文件)
// 保留此接口以保持向后兼容性
ipcMain.handle('save-course', async (event, { filename, content }) => {
    try {
        const coursesDir = path.join(__dirname, '..', 'public', 'courses');
        if (!fs.existsSync(coursesDir)) {
            fs.mkdirSync(coursesDir, { recursive: true });
        }
        const ext = path.extname(filename || '');
        const safeName = !ext ? `${filename}.lume` : (ext.toLowerCase() === '.lume' ? filename : filename.slice(0, -ext.length) + '.lume');
        const filepath = path.join(coursesDir, safeName);
        fs.writeFileSync(filepath, content, 'utf-8');
        return { success: true, filepath };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// 读取 AI 配置
ipcMain.handle('get-ai-config', () => {
    const configPath = path.join(app.getPath('userData'), 'ai-config.json');
    try {
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        }
    } catch (e) { console.error(e); }
    return { apiKey: '', baseURL: 'https://api.coze.cn', model: '' };
});

// 保存 AI 配置
ipcMain.handle('save-ai-config', (event, config) => {
    const configPath = path.join(app.getPath('userData'), 'ai-config.json');
    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
        return true;
    } catch (e) {
        console.error(e);
        return false;
    }
});

ipcMain.handle('open-course-file', async () => {
    try {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: '打开课件文件',
            properties: ['openFile'],
            filters: [
                { name: '萤火课件文件', extensions: ['lume'] },
                { name: '旧格式课件文件', extensions: ['tsx', 'ts', 'jsx', 'js'] },
                { name: 'PDF课件', extensions: ['pdf'] },
                { name: '所有文件', extensions: ['*'] },
            ],
        });

        if (result.canceled || !result.filePaths?.length) {
            return { success: false, canceled: true };
        }

        const filePath = result.filePaths[0];
        const ext = path.extname(filePath || '').toLowerCase();
        if (ext === '.pdf') {
            const buf = fs.readFileSync(filePath);
            return {
                success: true,
                filePath,
                filename: path.basename(filePath),
                kind: 'pdf',
                encoding: 'base64',
                content: buf.toString('base64'),
            };
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        return {
            success: true,
            filePath,
            filename: path.basename(filePath),
            kind: 'text',
            content,
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('save-course-file', async (event, { content, filePath, suggestedName }) => {
    try {
        const ensureLumeExt = (p) => {
            const ext = path.extname(p || '');
            if (!ext) return `${p}.lume`;
            if (ext.toLowerCase() !== '.lume') return p.slice(0, -ext.length) + '.lume';
            return p;
        };

        let targetPath = filePath;

        if (!targetPath) {
            const result = await dialog.showSaveDialog(mainWindow, {
                title: '保存课件文件',
                defaultPath: ensureLumeExt(suggestedName || 'untitled.lume'),
                filters: [
                    { name: '萤火课件文件', extensions: ['lume'] },
                    { name: '所有文件', extensions: ['*'] },
                ],
            });

            if (result.canceled || !result.filePath) {
                return { success: false, canceled: true };
            }
            targetPath = result.filePath;
        }

        targetPath = ensureLumeExt(targetPath);
        fs.writeFileSync(targetPath, content, 'utf-8');
        return {
            success: true,
            filePath: targetPath,
            filename: path.basename(targetPath),
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
});
