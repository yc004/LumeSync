const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

if (!process.env.LUMESYNC_HOST_TOKEN) {
    process.env.LUMESYNC_HOST_TOKEN = `teacher-host-${crypto.randomBytes(24).toString('hex')}`;
}
if (!process.env.LUMESYNC_VIEWER_TOKEN_SECRET) {
    process.env.LUMESYNC_VIEWER_TOKEN_SECRET = `teacher-viewer-${crypto.randomBytes(32).toString('hex')}`;
}

const { config, initDirectories } = require('./src/config');
const { buildTeacherBundles, checkStudentUiBuild } = require('./src/teacher-shell-build');
const studentUi = require('./src/student-ui');
const {
    fontCacheCleaner,
    handleLibRequest,
    handleWebfontsRequest,
    handleLibFontsRequest,
    handleImagesProxyRequest,
    handleWeightsRequest,
    dependencyMap
} = require('./src/proxy');
const {
    router: apiRouter,
    setCurrentCourseId,
    setCurrentSlideIndex,
    getCurrentCourseId,
    getCurrentSlideIndex,
    getCourseCatalog,
    setCourseCatalog
} = require('./src/routes');
const { scanCourses } = require('./src/courses');
const { isHostToken, requireHost } = require('./src/http-auth');
const { loadCoreModule } = require('./src/core-paths');

const runtime = require('./src/socket');
const { createViewerSessionToken, normalizeIp } = loadCoreModule('identity');
const renderEngine = loadCoreModule('render-engine');
const coreScriptCache = loadCoreModule('script-cache');
const ensureCourseDependenciesCached = typeof coreScriptCache.ensureCourseDependenciesCached === 'function'
    ? coreScriptCache.ensureCourseDependenciesCached
    : null;

const VIEWER_TOKEN_TTL_SEC = Number(process.env.LUMESYNC_VIEWER_TOKEN_TTL_SEC || 14400);
const VIEWER_TOKEN_SECRET = String(process.env.LUMESYNC_VIEWER_TOKEN_SECRET || '');
const HOST_TOKEN = String(process.env.LUMESYNC_HOST_TOKEN || '');

const SERVER_PID_FILE = String(process.env.LUMESYNC_SERVER_PID_FILE || '').trim();

function writeServerPidFile() {
    if (!SERVER_PID_FILE) return;
    try {
        fs.mkdirSync(path.dirname(SERVER_PID_FILE), { recursive: true });
        fs.writeFileSync(SERVER_PID_FILE, String(process.pid), 'utf8');
    } catch (err) {
        console.warn('[teacher-server] failed to write pid file:', err.message);
    }
}

function removeServerPidFile() {
    if (!SERVER_PID_FILE) return;
    try {
        const pid = fs.existsSync(SERVER_PID_FILE)
            ? fs.readFileSync(SERVER_PID_FILE, 'utf8').trim()
            : '';
        if (pid === String(process.pid)) {
            fs.unlinkSync(SERVER_PID_FILE);
        }
    } catch (err) {
        console.warn('[teacher-server] failed to remove pid file:', err.message);
    }
}

function ensureClientId(input) {
    const value = String(input || '').trim();
    return value || `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isLoopbackRequest(req) {
    const ip = normalizeIp(req.socket?.remoteAddress || '');
    return ip === '127.0.0.1' || ip === '::1';
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, config.socket);

app.use(express.json(config.body));
app.use(express.urlencoded({ extended: false }));
app.use('/courses', express.static(config.coursesDir));
app.use('/components', express.static(path.join(config.cacheRoot, 'components')));

initDirectories();

try {
    for (const bundleBuild of buildTeacherBundles({ publicRoot: config.cacheRoot })) {
        if (!bundleBuild.skipped) {
            console.log(`[teacher-server] built teacher bundle: ${bundleBuild.outputPath}`);
        }
    }
} catch (err) {
    console.warn('[teacher-server] failed to build teacher bundles:', err.message);
}

app.use(fontCacheCleaner);

const engineDir = renderEngine.resolveEngineDevelopmentSrcDir
    ? renderEngine.resolveEngineDevelopmentSrcDir()
    : renderEngine.resolveEngineSrcDir();
app.use('/engine', express.static(engineDir));

const staticDir = process.env.STATIC_DIR || config.cacheRoot;
app.get(['/teacher-app.js', '/render-engine.js'], (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
});

// 学生课堂 UI 是学生端仓库的构建产物：稳定入口 /student.html 与版本化资源
// /classroom/<version>/*。产物缺失时返回 503 并说明预期路径与构建命令，
// 不回退到 shared/public 里的旧页面副本（教师仓库已不再托管该页面）。
app.get('/student.html', studentUi.handleEntryPage);
app.use('/classroom', studentUi.serveVersionedAssets);

app.use(express.static(staticDir));

app.get('/favicon.ico', (_req, res) => {
    res.status(204).end();
});

app.get('/lib/fonts', (_req, res) => {
    res.status(404).send('not found: fonts');
});

app.get('/lib/:fileName', handleLibRequest);
app.get('/webfonts/:fileName', handleWebfontsRequest);
app.get('/lib/fonts/:fileName', handleLibFontsRequest);
app.get('/images/proxy', handleImagesProxyRequest);
app.get('/weights/:fileName', handleWeightsRequest);

app.use('/api/teacher', apiRouter);
app.use('/api', apiRouter);

app.get('/api/students', requireHost, (_req, res) => {
    const studentIPs = runtime.getStudentIPs();
    const students = Array.from(studentIPs.keys() || []).map((ip) =>
        ip.startsWith('::ffff:') ? ip.slice(7) : ip
    );
    res.json({ students });
});

app.get('/api/student-log', requireHost, (_req, res) => {
    res.json({ log: runtime.getStudentLog() });
});

app.post('/api/session/bootstrap', (req, res) => {
    const role = String(req.body?.role || 'viewer').trim().toLowerCase();
    const clientId = ensureClientId(req.body?.clientId);
    const clientIp = normalizeIp(req.ip || req.socket?.remoteAddress || '');

    if (role === 'host' || role === 'teacher') {
        if (!isLoopbackRequest(req) || !isHostToken(req.get('X-LumeSync-Host-Token'), HOST_TOKEN)) {
            res.status(403).json({ success: false, error: 'Host bootstrap requires the local desktop credential' });
            return;
        }
        res.json({
            success: true,
            role: 'host',
            clientId,
            token: HOST_TOKEN,
            expiresAt: null,
            clientIp,
            serverTime: new Date().toISOString()
        });
        return;
    }

    if (role !== 'viewer') {
        res.status(400).json({ success: false, error: 'Unsupported bootstrap role' });
        return;
    }
    if (!VIEWER_TOKEN_SECRET) {
        res.status(500).json({ success: false, error: 'Viewer token secret is not configured on server' });
        return;
    }

    const token = createViewerSessionToken({
        clientId,
        ttlSec: VIEWER_TOKEN_TTL_SEC,
        secret: VIEWER_TOKEN_SECRET
    });
    const expiresAt = new Date(Date.now() + VIEWER_TOKEN_TTL_SEC * 1000).toISOString();

    res.json({
        success: true,
        role: 'viewer',
        clientId,
        token,
        expiresAt,
        clientIp,
        serverTime: new Date().toISOString()
    });
});

app.get('*', (_req, res) => {
    res.status(404).send(`
        <div style="font-family: sans-serif; padding: 40px; background-color: #f8fafc; color: #334155; line-height: 1.6;">
            <h2 style="color: #ef4444;">Not Found</h2>
            <p>Please ensure index.html is in your static root directory.</p>
        </div>
    `);
});

runtime.setupSocketHandlers(io, {
    setCurrentCourseId,
    setCurrentSlideIndex,
    getCurrentCourseId,
    getCurrentSlideIndex,
    getCourseCatalog,
    refreshCourseCatalog: () => {
        const catalog = scanCourses();
        setCourseCatalog(catalog);
        return catalog;
    },
    ensureCourseDependenciesCached: ensureCourseDependenciesCached
        ? (courseId) => ensureCourseDependenciesCached(courseId, getCourseCatalog(), {
            coursesDir: config.coursesDir,
            libDir: config.libDir,
            downloadTimeout: config.downloadTimeout
        })
        : null,
    registerDependencies: (deps) => {
        deps.forEach(({ filename, publicSrc }) => {
            if (filename && publicSrc) {
                dependencyMap[filename] = publicSrc;
            }
        });
    }
});

function startServer(port) {
    const PORT = port || config.port;
    server.listen(PORT, () => {
        writeServerPidFile();
        console.log(`[teacher-server] running on port ${PORT}`);
        console.log(`[teacher-server] static root: ${staticDir}`);
        // 与教师 bundle 一起检查学生课堂 UI 产物：缺失时日志给出预期路径与构建命令，
        // 请求侧返回 503；服务不因为缺少静态产物而拒绝启动其它教师功能。
        try {
            checkStudentUiBuild();
        } catch (err) {
            console.warn('[teacher-server] failed to check student classroom UI build:', err.message);
        }
    });

    process.on('exit', removeServerPidFile);

    process.on('SIGTERM', () => {
        server.close(() => {
            removeServerPidFile();
            process.exit(0);
        });
    });

    process.on('SIGINT', () => {
        server.close(() => {
            removeServerPidFile();
            process.exit(0);
        });
    });

    return server;
}

if (require.main === module) {
    startServer();
}

module.exports = { app, server, io, startServer };
