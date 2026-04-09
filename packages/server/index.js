const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const runtimeControl = require('../runtime-control');
const { resolveEngineSrcDir } = require('../render-engine');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    pingInterval: 5000,
    pingTimeout: 8000
});

let currentCourseId = null;
let currentSlideIndex = 0;

app.use(express.json({ limit: '1mb' }));

const engineDir = resolveEngineSrcDir();
app.use('/engine', express.static(engineDir));
app.use('/engine/src', express.static(engineDir));

app.get('/api/health', (_req, res) => {
    res.json({
        ok: true,
        app: 'LumeSync-Core',
        mode: 'runtime-control',
        port: Number(process.env.PORT || 3000)
    });
});

app.get('/api/runtime-status', (_req, res) => {
    res.json({
        currentCourseId,
        currentSlideIndex,
        mode: 'runtime-control'
    });
});

const deprecatedDataPlaneRoutes = [
    '/api/courses',
    '/api/course-status',
    '/api/refresh-courses',
    '/api/components-manifest'
];

deprecatedDataPlaneRoutes.forEach((routePath) => {
    app.all(routePath, (_req, res) => {
        res.status(410).json({
            error: 'deprecated_core_data_plane',
            message: 'This API has moved to the teacher service.',
            teacherApiBase: '/api/teacher'
        });
    });
});

app.get('/api/students', (_req, res) => {
    const studentIPs = runtimeControl.getStudentIPs();
    const students = Array.from(studentIPs.keys() || []).map((ip) =>
        ip.startsWith('::ffff:') ? ip.slice(7) : ip
    );
    res.json({ students });
});

app.get('/api/student-log', (_req, res) => {
    res.json({ log: runtimeControl.getStudentLog() });
});

app.get('*', (_req, res) => {
    res.status(404).send('LumeSync Core runtime is running. This service does not host course files.');
});

runtimeControl.setupSocketHandlers(io, {
    setCurrentCourseId: (id) => {
        currentCourseId = id;
    },
    setCurrentSlideIndex: (index) => {
        currentSlideIndex = index;
    },
    getCurrentCourseId: () => currentCourseId,
    getCurrentSlideIndex: () => currentSlideIndex,
    getCourseCatalog: () => ({ courses: [], folders: [] })
});

function startServer(port) {
    const PORT = Number(port || process.env.PORT || 3000);
    server.listen(PORT, () => {
        console.log(`[core] LumeSync core runtime running on port ${PORT}`);
    });

    process.on('SIGTERM', () => {
        server.close(() => process.exit(0));
    });

    process.on('SIGINT', () => {
        server.close(() => process.exit(0));
    });

    return server;
}

if (require.main === module) {
    startServer();
}

module.exports = { app, server, io, startServer };
