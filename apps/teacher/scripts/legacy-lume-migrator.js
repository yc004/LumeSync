// 旧课件迁移脚本的兼容层。
//
// 迁移实现已经移到共享的 @lumesync/course-format（src/migrate.js 与 src/node.js），
// 教师端不再维护第二份迁移逻辑。本文件只保留原有函数名，让既有命令与批处理脚本
// （scripts/migrate-legacy-lume.js、migrate-legacy-lume-batch.js）继续可用。

const {
    extractLegacyStringProperty,
    getCourseDataSource,
    sanitizeCourseId
} = require('@lumesync/course-format');
const {
    collectLegacyLumeFiles,
    migrateLegacyLumeFile
} = require('@lumesync/course-format/node');

function isZipFile(filePath) {
    const fs = require('fs');
    try {
        const fd = fs.openSync(filePath, 'r');
        const buf = Buffer.alloc(4);
        fs.readSync(fd, buf, 0, 4, 0);
        fs.closeSync(fd);
        return buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
    } catch (_) {
        return false;
    }
}

/** 与旧脚本同名：迁移单个旧 .lume 文件。 */
async function migrateLegacyLume(inputPath, explicitOutput) {
    return migrateLegacyLumeFile(inputPath, explicitOutput);
}

module.exports = {
    collectLegacyLumeFiles,
    extractStringProperty: extractLegacyStringProperty,
    getCourseDataSource,
    isZipFile,
    migrateLegacyLume,
    sanitizeId: sanitizeCourseId
};
