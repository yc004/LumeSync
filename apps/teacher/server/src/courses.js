// ========================================================
// 课程扫描和管理
// ========================================================

const path = require('path');
const fs = require('fs');
const { config } = require('./config');
const { lintLumeFileSync } = require('@lumesync/course-format/node');

const allowedExts = ['.lume', '.tsx', '.ts', '.jsx', '.js', '.pdf'];
const extPriority = {
    '.lume': 5,
    '.tsx': 4,
    '.ts': 3,
    '.jsx': 2,
    '.js': 1,
    '.pdf': 0
};

function normalizeRelativePath(value) {
    return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function encodeFsId(prefix, relativePath) {
    const normalized = normalizeRelativePath(relativePath);
    return `${prefix}_${Buffer.from(normalized, 'utf8').toString('base64url')}`;
}

function makeFolderId(relativeDir) {
    const normalized = normalizeRelativePath(relativeDir);
    return normalized ? encodeFsId('folder', normalized) : null;
}

function makeCourseId(relativeFileWithoutExt) {
    return encodeFsId('course', relativeFileWithoutExt);
}

function isZipFile(absolutePath) {
    try {
        const fd = fs.openSync(absolutePath, 'r');
        const buf = Buffer.alloc(4);
        fs.readSync(fd, buf, 0, 4, 0);
        fs.closeSync(fd);
        return buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
    } catch (_) {
        return false;
    }
}

// ZIP 解析与 manifest 校验统一由共享的 @lumesync/course-format 负责。
// 服务端不再维护自己的中央目录读取，也不再用 'runtime.format 匹配即通过' 的弱校验。
function readLumeManifestSync(absolutePath) {
    const result = lintLumeFileSync(absolutePath);
    return result.ok ? result.manifest : null;
}

function describeLumeProblem(result) {
    const first = Array.isArray(result.errors) && result.errors.length > 0 ? result.errors[0] : null;
    return {
        code: result.code || 'manifest_invalid',
        // 带上字段路径与错误码，教师界面和支持排查都不需要再猜。
        message: first ? `${first.path}: ${first.message} (${first.code})` : '课件包校验失败'
    };
}

function scanCourses() {
    if (!fs.existsSync(config.coursesDir)) {
        fs.mkdirSync(config.coursesDir, { recursive: true });
        return { courses: [], folders: [], invalid: [] };
    }

    const folders = [];
    const courses = [];
    const invalid = [];

    const scanDir = (absoluteDir, relativeDir = '') => {
        const entries = fs.readdirSync(absoluteDir, { withFileTypes: true })
            .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

        for (const entry of entries) {
            const absolutePath = path.join(absoluteDir, entry.name);
            const nextRelativePath = normalizeRelativePath(path.posix.join(relativeDir, entry.name));

            if (entry.isDirectory()) {
                const folderPath = nextRelativePath;
                folders.push({
                    id: makeFolderId(folderPath),
                    name: entry.name,
                    icon: '📁',
                    path: folderPath,
                    parentId: makeFolderId(path.posix.dirname(folderPath) === '.' ? '' : path.posix.dirname(folderPath))
                });
                scanDir(absolutePath, folderPath);
                continue;
            }

            const ext = path.extname(entry.name).toLowerCase();
            if (!allowedExts.includes(ext)) continue;

            const relativeFile = nextRelativePath;
            const relativeFileWithoutExt = normalizeRelativePath(relativeFile.replace(/\.(lume|tsx|ts|jsx|js|pdf)$/i, ''));
            const folderPath = normalizeRelativePath(path.posix.dirname(relativeFile) === '.' ? '' : path.posix.dirname(relativeFile));

            let mtimeMs = 0;
            try {
                mtimeMs = fs.statSync(absolutePath).mtimeMs || 0;
            } catch (_) {}

            if (ext === '.lume' && isZipFile(absolutePath)) {
                const lint = lintLumeFileSync(absolutePath);
                if (lint.ok) {
                    const manifest = lint.manifest;
                    courses.push({
                        id: manifest.id || makeCourseId(relativeFileWithoutExt),
                        file: relativeFile,
                        title: manifest.title || path.basename(relativeFileWithoutExt),
                        icon: manifest.icon || 'Course',
                        desc: manifest.desc || manifest.description || '',
                        color: manifest.color || 'from-blue-500 to-indigo-600',
                        type: 'lume-zip',
                        schemaVersion: manifest.schemaVersion || '1.0.0',
                        folderId: makeFolderId(folderPath),
                        _extPriority: extPriority[ext] || 0,
                        _mtimeMs: mtimeMs
                    });
                    continue;
                }
                // 损坏的课件包不再静默跳过，也不退回按文本课件处理；
                // 目录扫描结果里显式带出原因，供教师界面提示。
                const problem = describeLumeProblem(lint);
                console.warn(`[scanCourses] [INVALID] ${relativeFile}: ${problem.code} ${problem.message}`);
                invalid.push({ file: relativeFile, ...problem });
                continue;
            }

            if (ext === '.pdf') {
                courses.push({
                    id: makeCourseId(relativeFileWithoutExt),
                    file: relativeFile,
                    title: path.basename(relativeFileWithoutExt),
                    icon: '📄',
                    desc: 'PDF课件',
                    color: 'from-rose-500 to-orange-600',
                    type: 'pdf',
                    folderId: makeFolderId(folderPath),
                    _extPriority: extPriority[ext] || 0,
                    _mtimeMs: mtimeMs
                });
                continue;
            }

            let content;
            try {
                content = fs.readFileSync(absolutePath, 'utf-8');
            } catch (err) {
                console.warn(`[scanCourses] [SKIP] 跳过无法读取的文件: ${relativeFile} (${err.message})`);
                continue;
            }

            let title = path.basename(relativeFileWithoutExt);
            let icon = '📚';
            let desc = '';
            let color = 'from-blue-500 to-indigo-600';

            const courseDataIndex = content.indexOf('window.CourseData');
            const metaContent = courseDataIndex >= 0 ? content.slice(courseDataIndex) : content;

            const titleMatch = metaContent.match(/title:\s*["'](.+?)["']/);
            const iconMatch = metaContent.match(/icon:\s*["'](.+?)["']/);
            const descMatch = metaContent.match(/desc:\s*["'](.+?)["']/);
            const colorMatch = metaContent.match(/color:\s*["'](.+?)["']/);

            if (titleMatch) title = titleMatch[1];
            if (iconMatch) icon = iconMatch[1];
            if (descMatch) desc = descMatch[1];
            if (colorMatch) color = colorMatch[1];

            courses.push({
                id: makeCourseId(relativeFileWithoutExt),
                file: relativeFile,
                title,
                icon,
                desc,
                color,
                type: ext === '.lume' ? 'legacy-script' : 'script',
                folderId: makeFolderId(folderPath),
                _extPriority: extPriority[ext] || 0,
                _mtimeMs: mtimeMs
            });
        }
    };

    scanDir(config.coursesDir, '');

    const byId = new Map();
    for (const c of courses) {
        const prev = byId.get(c.id);
        if (!prev) {
            byId.set(c.id, c);
            continue;
        }
        const preferCurrent =
            (c._extPriority > prev._extPriority) ||
            (c._extPriority === prev._extPriority && (c._mtimeMs || 0) > (prev._mtimeMs || 0));
        if (preferCurrent) byId.set(c.id, c);
    }

    const deduped = Array.from(byId.values());
    deduped.sort((a, b) => (b._mtimeMs || 0) - (a._mtimeMs || 0));
    folders.sort((a, b) => (a.path || '').localeCompare(b.path || '', 'zh-CN'));

    return {
        courses: deduped.map(({ _mtimeMs, _extPriority, ...rest }) => rest),
        folders,
        invalid
    };
}

function deleteCourse(courseId) {
    const catalog = scanCourses();
    const course = catalog.courses.find(c => c.id === courseId);

    if (!course) {
        return { success: false, error: '课件不存在' };
    }

    const filePath = path.join(config.coursesDir, course.file);
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`[delete-course] deleted: ${course.file}`);
        }
        return { success: true, catalog: scanCourses() };
    } catch (err) {
        console.error(`[delete-course] error:`, err);
        return { success: false, error: '删除文件失败' };
    }
}

module.exports = {
    scanCourses,
    deleteCourse,
    normalizeRelativePath,
    makeFolderId,
    makeCourseId,
    isZipFile,
    readLumeManifestSync,
    describeLumeProblem
};
