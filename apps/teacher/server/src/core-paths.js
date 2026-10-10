const fs = require('fs');
const path = require('path');

const appRoot = path.join(__dirname, '../..');

function resolveCoreRoot() {
    const candidates = [
        process.env.LUMESYNC_CORE_DIR,
        path.resolve(appRoot, '../../packages/course-runtime'),
    ].filter(Boolean);

    for (const candidate of candidates) {
        if (fs.existsSync(path.join(candidate, 'package.json'))) {
            return path.resolve(candidate);
        }
    }

    throw new Error(`Unable to locate LumeSync core. Set LUMESYNC_CORE_DIR or provide packages/course-runtime. Tried: ${candidates.join(', ')}`);
}

function resolveCorePackagePath(...segments) {
    return path.join(resolveCoreRoot(), 'packages', ...segments);
}

function resolveCoreDistPath(...segments) {
    return path.join(resolveCoreRoot(), 'dist', 'cjs', ...segments);
}

function loadCoreModule(name) {
    const moduleMap = {
        identity: {
            dist: ['node', 'identity.js'],
            fallback: ['runtime-control', 'identity.js'],
        },
        'runtime-control': {
            dist: ['node', 'runtime-control.js'],
            fallback: ['runtime-control', 'index.js'],
        },
        'render-engine': {
            dist: ['node', 'render-engine.js'],
            fallback: ['render-engine', 'index.js'],
        },
        server: {
            dist: ['server', 'index.js'],
            fallback: ['server', 'index.js'],
        },
        'script-cache': {
            dist: ['server', 'script-cache.js'],
            fallback: ['server', 'src', 'proxy.js'],
        },
    };

    const entry = moduleMap[name];
    if (!entry) throw new Error(`Unknown SyncClassroom core module: ${name}`);

    const distPath = resolveCoreDistPath(...entry.dist);
    if (fs.existsSync(distPath)) {
        return require(distPath);
    }

    return require(resolveCorePackagePath(...entry.fallback));
}

module.exports = {
    resolveCoreRoot,
    resolveCorePackagePath,
    resolveCoreDistPath,
    loadCoreModule,
};
