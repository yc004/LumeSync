// 学生课堂 UI 的分发层。
//
// 正式课堂页由学生端仓库的 @lumesync/student-ui 构建成版本化静态产物
// （见 docs/architecture/target-architecture.md §6 模块归属）。教师服务不再
// 托管页面源码，只负责：
//   - 解析产物目录：LUMESYNC_STUDENT_UI_DIR，或工作区依赖 @lumesync/student-ui
//     的 exports("./dist")（require.resolve，无需 glob）；
//   - 按 dist/current.json 解析当前版本，把 /classroom/<version>/* 映射到
//     dist/<version>/*；
//   - /student.html 返回当前版本的 index.html（学生 Windows 壳导航的稳定入口）。
//
// 产物缺失或损坏时显式失败：HTTP 503 + 明确的错误正文/日志（含预期路径与构建命令），
// 而不是静默 404，也不回退到旧副本。

const fs = require('fs');
const path = require('path');
const express = require('express');

const PACKAGE_NAME = '@lumesync/student-ui';
const ENV_OVERRIDE = 'LUMESYNC_STUDENT_UI_DIR';
const DEFAULT_BUILD_COMMAND = `pnpm --filter ${PACKAGE_NAME} run build`;
const FALLBACK_BUILD_SCRIPT = 'apps/student/ui/classroom/scripts/build.mjs';
const ENTRY_URL = '/student.html';
const VERSION_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

// 解析结果只按"目录 + 指针文件 stat"缓存，环境变量或构建产物变化会立即失效。
let resolvedCache = { key: null, state: null };
const staticMiddlewares = new Map();
const loggedFailures = new Set();

function isSafeVersion(version) {
    return typeof version === 'string'
        && VERSION_PATTERN.test(version)
        && version !== '.'
        && version !== '..';
}

function readJsonFile(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (_) {
        return null;
    }
}

function statSignature(filePath) {
    try {
        const stat = fs.statSync(filePath);
        return `${stat.size}:${stat.mtimeMs}`;
    } catch (_) {
        return 'missing';
    }
}

function isInside(rootDir, targetPath) {
    const relative = path.relative(rootDir, targetPath);
    return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function isFile(filePath) {
    try {
        return fs.statSync(filePath).isFile();
    } catch (_) {
        return false;
    }
}

function loadPackagePaths() {
    // exports("./dist") 指向包内 lib/paths.cjs，导出 distDir / manifestPath 等绝对路径。
    const entry = require.resolve(`${PACKAGE_NAME}/dist`);
    return { paths: require(entry), resolvedFrom: entry };
}

function buildCommandHint(paths) {
    const workspaceCommand = paths?.buildCommand || DEFAULT_BUILD_COMMAND;
    const directScript = paths?.buildScriptPath;
    if (directScript) {
        return `${workspaceCommand}（或 node ${directScript}）`;
    }
    return `${workspaceCommand}（或 node ${FALLBACK_BUILD_SCRIPT}）`;
}

function failure(reason, detail, context) {
    const lines = [
        `学生课堂 UI 构建产物不可用（${reason}）：${detail}`,
        `预期构建目录：${context.distDir || `由 ${PACKAGE_NAME} 的 exports("./dist") 解析（默认 apps/student/ui/classroom/dist）`}`,
        `构建命令：${context.buildCommand}`,
        `可用环境变量 ${ENV_OVERRIDE} 覆盖构建目录；工作区链接需要 pnpm install --no-frozen-lockfile`
    ];
    return {
        ok: false,
        reason,
        distDir: context.distDir || null,
        resolvedFrom: context.resolvedFrom || null,
        buildCommand: context.buildCommand,
        fallbackBuildCommand: `node ${FALLBACK_BUILD_SCRIPT}`,
        message: lines.join('\n')
    };
}

/**
 * 解析当前可用的学生课堂 UI 产物。
 * @returns {{ok: true, version: string, distDir: string, versionDir: string, entryPath: string,
 *   manifestPath: string, currentPath: string, manifest: object, resolvedFrom: string|null,
 *   override: boolean, entryUrl: string}
 *   | {ok: false, reason: string, message: string, distDir: string|null, buildCommand: string}}
 */
function resolveStudentUi() {
    const override = String(process.env[ENV_OVERRIDE] || '').trim();
    let paths = null;
    let resolvedFrom = null;
    let distDir;
    let manifestPath;
    let currentPath;

    if (override) {
        distDir = path.resolve(override);
        manifestPath = path.join(distDir, 'manifest.json');
        currentPath = path.join(distDir, 'current.json');
        try {
            paths = loadPackagePaths().paths;
        } catch (_) {
            paths = null;
        }
    } else {
        try {
            const loaded = loadPackagePaths();
            paths = loaded.paths;
            resolvedFrom = loaded.resolvedFrom;
            distDir = paths.distDir;
            manifestPath = paths.manifestPath;
            currentPath = paths.currentPath;
        } catch (err) {
            return failure(
                'package-unresolved',
                `无法解析工作区包 ${PACKAGE_NAME}（${err && err.code ? err.code : err.message}）`,
                { distDir: null, resolvedFrom: null, buildCommand: buildCommandHint(null) }
            );
        }
    }

    const cacheKey = [
        distDir,
        override ? `env:${ENV_OVERRIDE}` : 'package',
        statSignature(currentPath),
        statSignature(manifestPath)
    ].join('|');
    if (resolvedCache.key === cacheKey) {
        return resolvedCache.state;
    }

    const context = {
        distDir,
        resolvedFrom,
        buildCommand: buildCommandHint(paths)
    };

    const state = validateStudentUi({ ...context, manifestPath, currentPath, override: Boolean(override) });
    resolvedCache = { key: cacheKey, state };
    return state;
}

function validateStudentUi({ distDir, manifestPath, currentPath, resolvedFrom, override, buildCommand }) {
    const context = { distDir, resolvedFrom, buildCommand };

    const current = readJsonFile(currentPath);
    if (!current) {
        return failure('current-pointer-unreadable', `缺少或无法解析 ${currentPath}`, context);
    }

    const manifest = readJsonFile(manifestPath);
    if (!manifest) {
        return failure('manifest-unreadable', `缺少或无法解析 ${manifestPath}`, context);
    }

    const version = current.version || manifest.version;
    if (!isSafeVersion(version)) {
        return failure('invalid-version', `版本号不合法：${JSON.stringify(version)}`, context);
    }
    if (manifest.version !== version) {
        return failure(
            'version-mismatch',
            `current.json(${version}) 与 manifest.json(${manifest.version}) 版本不一致`,
            context
        );
    }

    const entry = typeof manifest.entry === 'string' && manifest.entry ? manifest.entry : 'index.html';
    const versionDir = path.join(distDir, version);
    const entryPath = path.join(versionDir, entry);
    if (!isInside(distDir, entryPath)) {
        return failure('unsafe-entry', `入口路径越界：${entry}`, context);
    }
    if (!isFile(entryPath)) {
        return failure('entry-missing', `缺少入口文件 ${entryPath}`, context);
    }

    return {
        ok: true,
        version,
        distDir,
        versionDir,
        entryPath,
        manifestPath,
        currentPath,
        manifest,
        resolvedFrom,
        override,
        buildCommand,
        entryUrl: ENTRY_URL
    };
}

function reportFailure(state) {
    if (!state || state.ok || loggedFailures.has(state.message)) return state;
    loggedFailures.add(state.message);
    console.error(`[teacher-server] student classroom UI unavailable:\n${state.message}`);
    return state;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function renderUnavailableBody(state) {
    return [
        '<!DOCTYPE html>',
        '<html lang="zh-CN"><head><meta charset="UTF-8"><title>学生课堂 UI 不可用</title></head>',
        '<body style="font-family: system-ui, sans-serif; padding: 40px; line-height: 1.7; color: #0f172a;">',
        '<h2 style="color:#dc2626;">学生课堂 UI 构建产物不可用</h2>',
        `<p>${escapeHtml(state.reason)}</p>`,
        `<pre style="white-space: pre-wrap; background:#f1f5f9; padding:16px; border-radius:8px;">${escapeHtml(state.message)}</pre>`,
        '<p>教师服务不会回退到旧副本；请先构建学生课堂 UI 再重试。</p>',
        '</body></html>'
    ].join('\n');
}

// /student.html：稳定入口，返回当前版本的 index.html。
function handleEntryPage(req, res) {
    const state = resolveStudentUi();
    if (!state.ok) {
        reportFailure(state);
        res.status(503).type('html').send(renderUnavailableBody(state));
        return;
    }

    let html;
    try {
        html = fs.readFileSync(state.entryPath);
    } catch (err) {
        const broken = failure('entry-unreadable', `${state.entryPath} 读取失败：${err.message}`, state);
        reportFailure(broken);
        res.status(503).type('html').send(renderUnavailableBody(broken));
        return;
    }

    res.set('Cache-Control', 'no-store');
    res.type('html').send(html);
}

function getStaticMiddleware(distDir) {
    let middleware = staticMiddlewares.get(distDir);
    if (!middleware) {
        middleware = express.static(distDir, {
            index: false,
            fallthrough: true,
            setHeaders: (res, filePath) => {
                const topLevel = path.relative(distDir, filePath).split(path.sep)[0];
                if (topLevel === 'current.json' || topLevel === 'manifest.json') {
                    res.setHeader('Cache-Control', 'no-store');
                    return;
                }
                // 版本目录是内容寻址的，可以长期缓存。
                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            }
        });
        staticMiddlewares.set(distDir, middleware);
    }
    return middleware;
}

// /classroom/*：/classroom/<version>/… 映射到 dist/<version>/…，同时暴露
// manifest.json 与 current.json 供排查。产物缺失时 503，不静态回退。
function serveVersionedAssets(req, res, next) {
    const state = resolveStudentUi();
    if (!state.ok) {
        reportFailure(state);
        res.status(503).type('text/plain; charset=utf-8').send(state.message);
        return;
    }
    getStaticMiddleware(state.distDir)(req, res, next);
}

module.exports = {
    PACKAGE_NAME,
    ENV_OVERRIDE,
    ENTRY_URL,
    resolveStudentUi,
    reportFailure,
    handleEntryPage,
    serveVersionedAssets,
    renderUnavailableBody
};
