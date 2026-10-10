const fs = require('fs');
const path = require('path');

function isInside(root, candidate) {
    const relative = path.relative(root, candidate);
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function validateCourseId(courseId) {
    return typeof courseId === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(courseId);
}

function resolveRelative(root, relativePath, { nested = true } = {}) {
    if (typeof relativePath !== 'string' || relativePath.length === 0 || relativePath.length > 512 || relativePath.includes('\0')) return null;
    if (relativePath.includes('\\') || path.posix.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) return null;
    const parts = relativePath.split('/');
    if ((!nested && parts.length !== 1) || parts.some(part => !part || part === '.' || part === '..' || /[<>:"|?*\x00-\x1f]/.test(part))) return null;
    const rootPath = path.resolve(root);
    const candidate = path.resolve(rootPath, ...parts);
    return isInside(rootPath, candidate) && candidate !== rootPath ? candidate : null;
}

function resolveCourseDirectory(submissionsRoot, courseId) {
    return validateCourseId(courseId) ? resolveRelative(submissionsRoot, courseId, { nested: false }) : null;
}

function resolveExistingFile(courseRoot, relativePath) {
    const candidate = resolveRelative(courseRoot, relativePath);
    if (!candidate) return null;
    try {
        const actualRoot = fs.realpathSync(courseRoot);
        const actualFile = fs.realpathSync(candidate);
        return isInside(actualRoot, actualFile) && actualFile !== actualRoot && fs.statSync(actualFile).isFile() ? actualFile : null;
    } catch (_) {
        return null;
    }
}

function safeDirectoryName(value) {
    const name = String(value || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^\.+|\.+$/g, '').trim();
    return name.slice(0, 100) || 'default';
}

module.exports = { validateCourseId, resolveRelative, resolveCourseDirectory, resolveExistingFile, safeDirectoryName };
