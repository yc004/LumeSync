// ========================================================
// 萤火课件编辑器 - 独立的 AI 课件创建平台
// ========================================================
const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { Logger } = require('./logger.js');

let mainWindow;
const logger = new Logger('LumeSync-Editor');
let serverProcess = null;
const PORT = 3001;

// 延迟加载 VectorDatabase 和 EmbeddingService 以避免导入时初始化失败
let VectorDatabase = null;
let EmbeddingService = null;

function loadKnowledgeModules() {
    try {
        VectorDatabase = require('../server/vector-database');
        const embeddingModule = require('../server/vector-embedding');
        EmbeddingService = embeddingModule?.EmbeddingService || embeddingModule;

        if (typeof EmbeddingService !== 'function') {
            throw new Error('EmbeddingService export is invalid');
        }

        logger.info('APP', 'Knowledge modules loaded successfully');
        return true;
    } catch (error) {
        logger.error('APP', 'Failed to load knowledge modules', { error: error.message, stack: error.stack });
        return false;
    }
}

// ========================================================
// 编辑器专用 RAG 知识库系统
// ========================================================

let db = null;
let embeddingService = null;
let isKnowledgeBaseInitialized = false;

// 确保知识库已初始化
async function ensureKnowledgeBaseInitialized() {
    if (!isKnowledgeBaseInitialized) {
        logger.warn('KNOWLEDGE', 'Knowledge base not initialized, attempting to initialize...');
        const result = await initKnowledgeBase();
        if (!result.success) {
            logger.error('KNOWLEDGE', 'Knowledge base initialization check failed', {
                isKnowledgeBaseInitialized,
                reason: 'Initialization failed'
            });
            throw new Error(`Knowledge base not initialized (initialization failed: ${result.error})`);
        }
        logger.info('KNOWLEDGE', 'Knowledge base initialized successfully via ensureKnowledgeBaseInitialized');
    }
    if (!db) {
        logger.error('KNOWLEDGE', 'Knowledge base initialization check failed', {
            db: !!db,
            reason: 'Database instance is null'
        });
        throw new Error('Knowledge base not initialized (db=null)');
    }
}

async function initKnowledgeBase() {
    try {
        logger.info('KNOWLEDGE', 'Starting RAG knowledge base initialization...');

        // 加载模块（如果尚未加载）
        if (!VectorDatabase || !EmbeddingService) {
            logger.info('KNOWLEDGE', 'Loading knowledge modules...');
            if (!loadKnowledgeModules()) {
                throw new Error('Failed to load knowledge modules');
            }
            logger.info('KNOWLEDGE', 'Knowledge modules loaded successfully');
        }

        // 初始化数据库
        logger.info('KNOWLEDGE', 'Calling VectorDatabase.initializeDatabase()...');
        try {
            VectorDatabase.initializeDatabase();
            logger.info('KNOWLEDGE', 'Database initialized');
        } catch (dbError) {
            logger.error('KNOWLEDGE', 'Database initialization failed', { error: dbError.message, stack: dbError.stack });
            throw dbError;
        }

        logger.info('KNOWLEDGE', 'Getting database instance...');
        try {
            db = VectorDatabase.getDatabase();
            logger.info('KNOWLEDGE', 'Database instance obtained:', { hasDb: !!db });
        } catch (getDbError) {
            logger.error('KNOWLEDGE', 'Failed to get database instance', { error: getDbError.message });
            throw getDbError;
        }

        // 初始化嵌入服务（使用本地TF-IDF，256维）
        logger.info('KNOWLEDGE', 'Initializing embedding service...');
        try {
            embeddingService = new EmbeddingService();
            embeddingService.setMode('tfidf');
            logger.info('KNOWLEDGE', 'Embedding service created, mode: tfidf');
        } catch (embedError) {
            logger.error('KNOWLEDGE', 'Failed to create embedding service', { error: embedError.message });
            throw embedError;
        }

        const allKnowledge = VectorDatabase.getAllKnowledge();
        logger.info('KNOWLEDGE', 'Loading existing knowledge...', { count: allKnowledge.length });

        // 提取知识内容的文本，用于训练 TF-IDF
        const knowledgeTexts = allKnowledge.map(k => k.content || '');
        logger.info('KNOWLEDGE', 'Extracted texts for TF-IDF:', { count: knowledgeTexts.length, sampleLength: knowledgeTexts[0]?.length || 0 });

        logger.info('KNOWLEDGE', 'Initializing TF-IDF model...');
        try {
            // 注意：initializeTFIDF 是同步方法，不需要 await
            embeddingService.initializeTFIDF(knowledgeTexts);
            logger.info('KNOWLEDGE', 'TF-IDF model initialized successfully');
        } catch (tfidfError) {
            logger.error('KNOWLEDGE', 'Failed to initialize TF-IDF model', { error: tfidfError.message, stack: tfidfError.stack });
            throw new Error(`TF-IDF initialization failed: ${tfidfError.message}`);
        }

        // 为所有没有向量的知识生成向量
        logger.info('KNOWLEDGE', 'Generating vectors for knowledge without embeddings...');
        let vectorCount = 0;
        let errorCount = 0;
        for (const knowledge of allKnowledge) {
            try {
                const db = VectorDatabase.getDatabase();
                const existingVector = db.prepare('SELECT knowledgeId FROM vectors WHERE knowledgeId = ?').get(knowledge.id);
                if (!existingVector) {
                    const textToEmbed = `${knowledge.title || ''} ${knowledge.content || ''}`;
                    const embedding = await embeddingService.embed(textToEmbed);
                    VectorDatabase.updateKnowledgeVector(knowledge.id, embedding);
                    vectorCount++;
                }
            } catch (error) {
                logger.warn('KNOWLEDGE', 'Failed to generate vector for knowledge', { id: knowledge.id, error: error.message });
                errorCount++;
            }
        }
        logger.info('KNOWLEDGE', 'Vector generation completed', { success: vectorCount, errors: errorCount });

        isKnowledgeBaseInitialized = true;
        logger.info('KNOWLEDGE', 'Set isKnowledgeBaseInitialized = true');

        logger.info('KNOWLEDGE', 'RAG knowledge base initialized successfully', {
            stats: VectorDatabase.getStats(),
            embeddingMode: 'tfidf',
            vectorDim: 256
        });

        return { success: true };
    } catch (error) {
        logger.error('KNOWLEDGE', 'Failed to initialize knowledge base', { error: error.message, stack: error.stack });
        isKnowledgeBaseInitialized = false;
        return { success: false, error: error.message };
    }
}

function closeKnowledgeBase() {
    VectorDatabase.closeDatabase();
    db = null;
    embeddingService = null;
    logger.info('KNOWLEDGE', 'Knowledge base closed');
}

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
    const serverPath = path.join(__dirname, '..', 'server.js');
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

    // 初始化编辑器专用 RAG 知识库
    const initResult = await initKnowledgeBase();
    if (!initResult.success) {
        logger.error('APP', 'Failed to initialize knowledge base', { error: initResult.error });
        // 即使初始化失败也继续运行，但会提示用户
    }

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
    try { closeKnowledgeBase(); } catch (_) {}
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

// 加载知识库
ipcMain.handle('load-knowledge-base', () => {
    const knowledgePath = path.join(app.getPath('userData'), 'knowledge-base.json');
    try {
        if (fs.existsSync(knowledgePath)) {
            const content = fs.readFileSync(knowledgePath, 'utf-8');
            return JSON.parse(content);
        }
    } catch (e) { console.error('Load knowledge base error:', e); }
    return [];
});

// 保存知识库
ipcMain.handle('save-knowledge-base', (event, items) => {
    const knowledgePath = path.join(app.getPath('userData'), 'knowledge-base.json');
    try {
        fs.writeFileSync(knowledgePath, JSON.stringify(items, null, 2), 'utf-8');
        return { success: true };
    } catch (e) {
        console.error('Save knowledge base error:', e);
        return { success: false, error: e.message };
    }
});

// ========================================================
// RAG 知识库 IPC 接口（编辑器专用）
// ========================================================

// 获取知识库统计信息
ipcMain.handle('knowledge-stats', async () => {
    try {
        await ensureKnowledgeBaseInitialized();
        const stats = VectorDatabase.getStats();
        return { success: true, stats };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// RAG 搜索
ipcMain.handle('knowledge-search', async (event, { query, topK = 5, threshold = 0, useHybrid = true }) => {
    try {
        await ensureKnowledgeBaseInitialized();

        const safeTopK = Math.max(1, Number(topK) || 5);
        const safeThreshold = Math.max(0, Math.min(1, Number(threshold) || 0));

        let results;
        if (useHybrid && embeddingService) {
            // 使用混合搜索（需要生成查询向量）
            const queryVector = await embeddingService.embed(query);
            results = VectorDatabase.hybridSearch(queryVector, query, safeTopK * 3);
        } else {
            // 只使用全文搜索
            results = VectorDatabase.fullTextSearch(query, safeTopK * 3);
        }

        const filteredResults = (results || []).filter(item => {
            if (typeof item.similarity !== 'number') return true;
            return item.similarity >= safeThreshold;
        }).slice(0, safeTopK);

        return { success: true, results: filteredResults, query, useHybrid, topK: safeTopK, threshold: safeThreshold };
    } catch (error) {
        logger.error('KNOWLEDGE', 'Search failed', { error: error.message });
        return { success: false, error: error.message };
    }
});

// 获取所有文档
ipcMain.handle('knowledge-documents', async (event, { category = null, limit = 100 }) => {
    try {
        await ensureKnowledgeBaseInitialized();
        const allDocuments = VectorDatabase.getAllKnowledge();
        const documents = category
            ? allDocuments.filter(d => d.category === category).slice(0, limit)
            : allDocuments.slice(0, limit);
        return { success: true, documents, total: documents.length };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// 获取单个文档
ipcMain.handle('knowledge-document', async (event, { id }) => {
    try {
        await ensureKnowledgeBaseInitialized();
        const documents = VectorDatabase.getAllKnowledge();
        const doc = documents.find(d => d.id === id);
        if (!doc) return { success: false, error: 'Document not found' };
        return { success: true, document: doc };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// 添加文档
ipcMain.handle('knowledge-add', async (event, { title, content, category = 'custom', tags = [], metadata = {} }) => {
    try {
        await ensureKnowledgeBaseInitialized();

        // 生成查询向量
        const textToEmbed = `${title} ${content}`;
        const embedding = await embeddingService.embed(textToEmbed);

        const id = VectorDatabase.generateId();
        VectorDatabase.insertKnowledge({
            id,
            title,
            content,
            category,
            tags,
            isBuiltin: false,
            createdAt: new Date().toISOString(),
            ...metadata
        }, embedding);

        // 重新训练嵌入模型
        const allKnowledge = VectorDatabase.getAllKnowledge();
        const knowledgeTexts = allKnowledge.map(k => k.content || '');
        embeddingService.initializeTFIDF(knowledgeTexts);

        return { success: true, id };
    } catch (error) {
        logger.error('KNOWLEDGE', 'Add document failed', { error: error.message });
        return { success: false, error: error.message };
    }
});

// 更新文档
ipcMain.handle('knowledge-update', async (event, { id, title, content, category, tags, metadata }) => {
    try {
        await ensureKnowledgeBaseInitialized();

        const updated = VectorDatabase.updateKnowledge(id, {
            title, content, category, tags, updatedAt: new Date().toISOString(), ...metadata
        });
        if (!updated) return { success: false, error: 'Document not found' };

        // 如果更新了标题或内容，需要更新向量
        if (title !== undefined || content !== undefined) {
            const doc = VectorDatabase.getKnowledge(id);
            if (doc) {
                const textToEmbed = `${doc.title || ''} ${doc.content || ''}`;
                const embedding = await embeddingService.embed(textToEmbed);
                VectorDatabase.updateKnowledgeVector(id, embedding);
            }
        }

        // 重新训练嵌入模型
        const allKnowledge = VectorDatabase.getAllKnowledge();
        const knowledgeTexts = allKnowledge.map(k => k.content || '');
        embeddingService.initializeTFIDF(knowledgeTexts);

        logger.info('KNOWLEDGE', 'Document updated', { id });
        return { success: true };
    } catch (error) {
        logger.error('KNOWLEDGE', 'Update document failed', { error: error.message });
        return { success: false, error: error.message };
    }
});

// 删除文档
ipcMain.handle('knowledge-delete', async (event, { id }) => {
    try {
        await ensureKnowledgeBaseInitialized();
        const deleted = VectorDatabase.deleteKnowledge(id);
        if (!deleted) return { success: false, error: 'Document not found' };
        logger.info('KNOWLEDGE', 'Document deleted', { id });
        return { success: true, id };
    } catch (error) {
        logger.error('KNOWLEDGE', 'Delete document failed', { error: error.message });
        return { success: false, error: error.message };
    }
});

// 批量添加文档
ipcMain.handle('knowledge-batch-add', async (event, { documents }) => {
    try {
        await ensureKnowledgeBaseInitialized();

        logger.info('KNOWLEDGE', 'Batch add request received', { documentCount: documents.length });

        const results = [];
        for (const doc of documents) {
            // 生成查询向量
            const textToEmbed = `${doc.title} ${doc.content}`;
            const embedding = await embeddingService.embed(textToEmbed);

            const id = VectorDatabase.generateId();
            VectorDatabase.insertKnowledge({
                id,
                title: doc.title,
                content: doc.content,
                category: doc.category || 'custom',
                tags: doc.tags || [],
                isBuiltin: false,
                createdAt: new Date().toISOString(),
                ...doc.metadata
            }, embedding);
            results.push({ ...doc, id });
        }

        // 重新训练嵌入模型
        const allKnowledge = VectorDatabase.getAllKnowledge();
        const knowledgeTexts = allKnowledge.map(k => k.content || '');
        embeddingService.initializeTFIDF(knowledgeTexts);

        logger.info('KNOWLEDGE', 'Batch add documents completed', { success: results.length, total: documents.length });
        return { success: true, documents: results, total: results.length };
    } catch (error) {
        logger.error('KNOWLEDGE', 'Batch add failed', { error: error.message, stack: error.stack });
        return { success: false, error: error.message };
    }
});

// 获取分类列表
ipcMain.handle('knowledge-categories', async () => {
    try {
        await ensureKnowledgeBaseInitialized();
        const documents = VectorDatabase.getAllKnowledge();
        const categories = [...new Set(documents.map(d => d.category).filter(Boolean))];
        return { success: true, categories };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// 导出知识库
ipcMain.handle('knowledge-export', async (event) => {
    try {
        await ensureKnowledgeBaseInitialized();
        const documents = VectorDatabase.getAllKnowledge();
        const exportData = {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            documents: documents
        };
        logger.info('KNOWLEDGE', 'Knowledge base exported', { docCount: exportData.documents.length });
        return { success: true, data: exportData };
    } catch (error) {
        return { success: false, error: error.message };
    }
});


// 导入知识库
ipcMain.handle('knowledge-import', async (event, { data }) => {
    try {
        await ensureKnowledgeBaseInitialized();
        let count = 0;
        for (const doc of data) {
            // 生成查询向量
            const textToEmbed = `${doc.title} ${doc.content}`;
            const embedding = await embeddingService.embed(textToEmbed);

            const id = VectorDatabase.generateId();
            VectorDatabase.insertKnowledge({
                id,
                title: doc.title,
                content: doc.content,
                category: doc.category || 'imported',
                tags: doc.tags || [],
                isBuiltin: doc.isBuiltin || false,
                createdAt: new Date().toISOString()
            }, embedding);
            count++;
        }

        // 重新训练嵌入模型
        const allKnowledge = VectorDatabase.getAllKnowledge();
        const knowledgeTexts = allKnowledge.map(k => k.content || '');
        embeddingService.initializeTFIDF(knowledgeTexts);

        logger.info('KNOWLEDGE', 'Knowledge base imported', { docCount: count });
        return { success: true, importedCount: count };
    } catch (error) {
        logger.error('KNOWLEDGE', 'Import failed', { error: error.message });
        return { success: false, error: error.message };
    }
});
