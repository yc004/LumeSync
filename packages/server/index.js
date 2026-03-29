// ========================================================
// SyncClassroom 服务器入口
// ========================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// 导入模块
const { config, initDirectories } = require('./src/config');
const {
    fontCacheCleaner,
    handleLibRequest,
    handleWebfontsRequest,
    handleLibFontsRequest,
    handleImagesProxyRequest,
    handleWeightsRequest
} = require('./src/proxy');
const { router: apiRouter, setCurrentCourseId, setCurrentSlideIndex } = require('./src/routes');
const { setupSocketHandlers } = require('./src/socket');

// ========================================================
// 1. 初始化 Express 和 HTTP 服务器
// ========================================================

const app = express();
const server = http.createServer(app);

// 初始化 Socket.io
const io = new Server(server, config.socket);

// 解析 JSON / 表单 body
app.use(express.json(config.body));
app.use(express.urlencoded({ extended: false }));

// ========================================================
// 2. 初始化目录
// ========================================================

initDirectories();

// ========================================================
// 3. 静态文件托管
// ========================================================

// 字体缓存清理中间件
app.use(fontCacheCleaner);

// 引擎文件静态服务 - 映射 /engine/ 到 packages/engine/src/
const engineDir = path.join(__dirname, '../engine/src');
app.use('/engine', express.static(engineDir));

// 静态文件服务 - 支持自定义静态文件目录
const staticDir = process.env.STATIC_DIR || path.join(__dirname, '../../shared/public');
app.use(express.static(staticDir));

// ========================================================
// 4. 代理路由
// ========================================================

// 字体文件 404 响应
app.get('/lib/fonts', (_req, res) => {
    res.status(404).send('not found: fonts');
});

// 通用资源代理 /lib/
app.get('/lib/:fileName', handleLibRequest);

// FontAwesome 字体代理 /webfonts/
app.get('/webfonts/:fileName', handleWebfontsRequest);

// KaTeX 字体代理 /lib/fonts/
app.get('/lib/fonts/:fileName', handleLibFontsRequest);

// 图片资源代理 /images/proxy
app.get('/images/proxy', handleImagesProxyRequest);

// AI 模型权重代理 /weights/
app.get('/weights/:fileName', handleWeightsRequest);

// ========================================================
// 5. API 路由
// ========================================================

app.use('/api', apiRouter);

// 获取当前在线学生列表
app.get('/api/students', (req, res) => {
    const { getStudentIPs } = require('./src/socket');
    const studentIPs = getStudentIPs();
    const students = Array.from(studentIPs.keys() || [])
        .map(ip => ip.startsWith('::ffff:') ? ip.slice(7) : ip);
    res.json({ students });
});

// 获取学生操作日志
app.get('/api/student-log', (req, res) => {
    const { getStudentLog } = require('./src/socket');
    res.json({ log: getStudentLog() });
});

// ========================================================
// 6. 404 处理
// ========================================================

app.get('*', (req, res) => {
    res.status(404).send(`
        <div style="font-family: sans-serif; padding: 40px; background-color: #f8fafc; color: #334155; line-height: 1.6;">
            <h2 style="color: #ef4444;">❌ 找不到页面</h2>
            <p>请确保 index.html 放置在 public 文件夹中。</p>
        </div>
    `);
});

// ========================================================
// 7. Socket.io 处理
// ========================================================

setupSocketHandlers(io, {
    setCurrentCourseId,
    setCurrentSlideIndex,
    getCurrentCourseId: () => require('./src/routes').getCurrentCourseId(),
    getCurrentSlideIndex: () => require('./src/routes').getCurrentSlideIndex(),
    getCourseCatalog: () => require('./src/routes').getCourseCatalog()
});

// ========================================================
// 8. 导出启动函数
// ========================================================

function startServer(port) {
    const PORT = port || config.port;
    server.listen(PORT, () => {
        console.log(`[server] SyncClassroom server running on port ${PORT}`);
        console.log(`[server] Open http://localhost:${PORT} in your browser`);
    });

    // 优雅退出
    process.on('SIGTERM', () => {
        console.log('[server] SIGTERM received, shutting down gracefully');
        server.close(() => {
            console.log('[server] Server closed');
            process.exit(0);
        });
    });

    process.on('SIGINT', () => {
        console.log('[server] SIGINT received, shutting down gracefully');
        server.close(() => {
            console.log('[server] Server closed');
            process.exit(0);
        });
    });

    return server;
}

// 如果直接运行此文件，启动服务器
if (require.main === module) {
    startServer();
}

module.exports = { app, server, io, startServer };
