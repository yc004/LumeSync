// ========================================================
// 文件夹数据管理（基于真实文件系统）
// ========================================================

const path = require('path');
const fs = require('fs');
const { config } = require('./config');
const { scanCourses, normalizeRelativePath, makeFolderId } = require('./courses');

function decodeFolderId(folderId) {
    if (!folderId || folderId === 'null') return '';
    const text = String(folderId || '');
    if (!text.startsWith('folder_')) return '';
    try {
        return normalizeRelativePath(Buffer.from(text.slice(7), 'base64url').toString('utf8'));
    } catch (_) {
        return '';
    }
}

function resolveFolderAbsolutePath(folderId) {
    const relativePath = decodeFolderId(folderId);
    return path.join(config.coursesDir, relativePath);
}

function toFolderEntry(relativePath) {
    const normalized = normalizeRelativePath(relativePath);
    return {
        id: makeFolderId(normalized),
        name: path.basename(normalized),
        icon: '📁',
        path: normalized,
        parentId: makeFolderId(path.posix.dirname(normalized) === '.' ? '' : path.posix.dirname(normalized))
    };
}

function ensureUniqueTarget(targetPath) {
    if (fs.existsSync(targetPath)) {
        throw new Error(`目标已存在: ${path.basename(targetPath)}`);
    }
}

function createFolder(name, icon, parentId) {
    if (!name || !name.trim()) {
        return { success: false, error: '文件夹名称不能为空' };
    }

    const parentPath = decodeFolderId(parentId);
    const absoluteParent = path.join(config.coursesDir, parentPath);
    const targetPath = path.join(absoluteParent, name.trim());

    try {
        ensureUniqueTarget(targetPath);
        fs.mkdirSync(targetPath, { recursive: true });
        return { success: true, folder: toFolderEntry(path.posix.join(parentPath, name.trim())) };
    } catch (err) {
        return { success: false, error: err.message || '创建失败' };
    }
}

function deleteFolder(folderId) {
    if (!folderId) {
        return { success: false, error: '缺少 folderId 参数' };
    }

    const relativePath = decodeFolderId(folderId);
    const absolutePath = path.join(config.coursesDir, relativePath);
    const parentRelative = normalizeRelativePath(path.posix.dirname(relativePath) === '.' ? '' : path.posix.dirname(relativePath));
    const absoluteParent = path.join(config.coursesDir, parentRelative);

    if (!relativePath || !fs.existsSync(absolutePath)) {
        return { success: false, error: '文件夹不存在' };
    }

    try {
        fs.rmSync(absolutePath, { recursive: true, force: true });
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message || '删除失败' };
    }
}

function moveFolder(folderId, targetFolderId) {
    if (!folderId) {
        return { success: false, error: '缺少 folderId 参数' };
    }

    const sourceRelative = decodeFolderId(folderId);
    const targetParentRelative = decodeFolderId(targetFolderId);
    const sourcePath = path.join(config.coursesDir, sourceRelative);
    const targetParentPath = path.join(config.coursesDir, targetParentRelative);
    const targetPath = path.join(targetParentPath, path.basename(sourcePath));

    if (!sourceRelative || !fs.existsSync(sourcePath)) {
        return { success: false, error: '源文件夹不存在' };
    }

    try {
        const normalizedSource = path.resolve(sourcePath);
        const normalizedTargetParent = path.resolve(targetParentPath);
        if (normalizedTargetParent === normalizedSource || normalizedTargetParent.startsWith(normalizedSource + path.sep)) {
            return { success: false, error: '不能将文件夹移动到其子文件夹中' };
        }
        ensureUniqueTarget(targetPath);
        fs.renameSync(sourcePath, targetPath);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message || '移动失败' };
    }
}

function renameFolder(folderId, name, icon) {
    if (!folderId) {
        return { success: false, error: '缺少 folderId 参数' };
    }
    if (!name || !name.trim()) {
        return { success: false, error: '文件夹名称不能为空' };
    }

    const relativePath = decodeFolderId(folderId);
    const sourcePath = path.join(config.coursesDir, relativePath);
    const parentRelative = normalizeRelativePath(path.posix.dirname(relativePath) === '.' ? '' : path.posix.dirname(relativePath));
    const targetRelative = normalizeRelativePath(path.posix.join(parentRelative, name.trim()));
    const targetPath = path.join(config.coursesDir, targetRelative);

    if (!relativePath || !fs.existsSync(sourcePath)) {
        return { success: false, error: '文件夹不存在' };
    }

    try {
        ensureUniqueTarget(targetPath);
        fs.renameSync(sourcePath, targetPath);
        return { success: true, folder: toFolderEntry(targetRelative) };
    } catch (err) {
        return { success: false, error: err.message || '重命名失败' };
    }
}

function moveCourseToFolder(courseId, folderId) {
    if (!courseId) {
        return { success: false, error: '缺少 courseId 参数' };
    }

    const catalog = scanCourses();
    const course = catalog.courses.find(c => c.id === courseId);
    if (!course) {
        return { success: false, error: '课件不存在' };
    }

    const sourcePath = path.join(config.coursesDir, course.file);
    const targetFolderPath = resolveFolderAbsolutePath(folderId);
    const targetPath = path.join(targetFolderPath, path.basename(sourcePath));

    try {
        if (path.resolve(sourcePath) === path.resolve(targetPath)) {
            return { success: true };
        }
        ensureUniqueTarget(targetPath);
        fs.mkdirSync(targetFolderPath, { recursive: true });
        fs.renameSync(sourcePath, targetPath);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message || '移动失败' };
    }
}

module.exports = {
    createFolder,
    deleteFolder,
    moveFolder,
    renameFolder,
    moveCourseToFolder,
    decodeFolderId,
    resolveFolderAbsolutePath,
    toFolderEntry
};
