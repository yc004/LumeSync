// ========================================================
// 萤火课件编辑器 - 独立的 AI 课件创建平台
// ========================================================
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { Logger } = require('./logger.js');

let mainWindow;
const logger = new Logger('LumeSync-Editor');

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
        icon: path.join(__dirname, '..', 'build', 'icon-editor.ico'),
        frame: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    mainWindow.setMenu(null);
    mainWindow.loadFile(path.join(__dirname, '..', 'public', 'editor.html'));

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

    // 打开开发者工具 (如果需要调试)
    // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
    logger.info('APP', 'Editor app ready');
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    logger.info('APP', 'All windows closed');
    if (process.platform !== 'darwin') app.quit();
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

ipcMain.handle('test-ai-connection', async (event, payload) => {
    const baseURL = (payload?.baseURL || '').trim().replace(/\/+$/, '');
    const apiKey = (payload?.apiKey || '').trim();
    const model = (payload?.model || '').trim();
    const timeoutMs = Number(payload?.timeoutMs) > 0 ? Number(payload.timeoutMs) : 30000;
    const endpoint = `${baseURL}/chat/completions`;
    const startedAt = Date.now();

    if (!baseURL || !apiKey || !model) {
        return { success: false, error: 'Missing baseURL/apiKey/model' };
    }

    logger.info('AI-TEST', 'Main-process test started', {
        endpoint,
        model,
        timeoutMs
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: 'ping' }],
                temperature: 0,
                max_tokens: 8,
                stream: false
            }),
            signal: controller.signal
        });

        const elapsedMs = Date.now() - startedAt;
        let body = null;
        try {
            body = await response.json();
        } catch (_) {}

        if (!response.ok) {
            const errMsg = body?.error?.message || `HTTP ${response.status}`;
            logger.error('AI-TEST', 'Main-process test non-OK response', {
                status: response.status,
                elapsedMs,
                error: errMsg
            });
            return {
                success: false,
                status: response.status,
                elapsedMs,
                error: errMsg
            };
        }

        logger.info('AI-TEST', 'Main-process test success', {
            status: response.status,
            elapsedMs
        });
        return {
            success: true,
            status: response.status,
            elapsedMs
        };
    } catch (error) {
        const elapsedMs = Date.now() - startedAt;
        const errMsg = error?.name === 'AbortError'
            ? `Request timeout (>${Math.round(timeoutMs / 1000)}s)`
            : (error?.message || 'Unknown error');
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
    } finally {
        clearTimeout(timer);
    }
});

// AI 聊天代理（主进程处理 SSE 解析，发送给渲染进程干净的文本）
ipcMain.on('proxy-ai-chat', async (event, payload) => {
    const { requestId, baseURL, apiKey, model, messages, temperature, stream } = payload;
    const endpoint = `${baseURL.replace(/\/+$/, '')}/chat/completions`;

    logger.info('AI-CHAT-PROXY', 'Request started', { requestId, model, stream });

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            },
            body: JSON.stringify({
                model,
                messages,
                temperature: temperature ?? 0.7,
                stream: !!stream
            })
        });

        if (!response.ok) {
            let errorData = null;
            try { errorData = await response.json(); } catch (_) {}
            const errMsg = errorData?.error?.message || `HTTP ${response.status}`;
            logger.error('AI-CHAT-PROXY', 'Response error', { requestId, status: response.status, error: errMsg });
            event.sender.send(`ai-chat-error-${requestId}`, { message: errMsg });
            return;
        }

        if (!stream) {
            const data = await response.json();
            const content = data?.choices?.[0]?.message?.content || '';
            event.sender.send(`ai-chat-data-${requestId}`, { done: true, content });
            return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        // 处理流式响应 (兼容 Node 18+ Web Streams 和旧版 Node Streams)
        const processChunk = (chunk) => {
            if (event.sender.isDestroyed()) return;
            
            buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed === ': keep-alive') continue;
                
                if (trimmed.startsWith('data:')) {
                    const payload = trimmed.slice(5).trim();
                    if (payload === '[DONE]') continue;
                    
                    try {
                        const json = JSON.parse(payload);
                        const delta = json?.choices?.[0]?.delta?.content 
                                   || json?.choices?.[0]?.delta?.reasoning_content 
                                   || json?.choices?.[0]?.message?.content // 有些提供商在 stream 模式下偶尔也用 message
                                   || '';
                        if (delta) {
                            event.sender.send(`ai-chat-data-${requestId}`, { done: false, delta });
                        }
                    } catch (_) {}
                }
            }
        };

        if (response.body.getReader) {
            // Web Streams API (Standard)
            const reader = response.body.getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                processChunk(value);
            }
        } else {
            // Node.js Streams API (Fallback)
            for await (const chunk of response.body) {
                processChunk(chunk);
            }
        }

        // 发送结束信号
        if (!event.sender.isDestroyed()) {
            event.sender.send(`ai-chat-data-${requestId}`, { done: true });
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
    return { apiKey: '', baseURL: 'https://api.openai.com/v1', model: 'gpt-4o' };
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
                { name: '所有文件', extensions: ['*'] },
            ],
        });

        if (result.canceled || !result.filePaths?.length) {
            return { success: false, canceled: true };
        }

        const filePath = result.filePaths[0];
        const content = fs.readFileSync(filePath, 'utf-8');
        return {
            success: true,
            filePath,
            filename: path.basename(filePath),
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
