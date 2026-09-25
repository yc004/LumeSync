// 旧课件迁移。
//
// 旧 `.lume` 是纯文本脚本（内部靠 window.CourseData 注册课程数据）。
// 目标架构要求"旧课件先做只读兼容与显式迁移，并保留原文件备份"，
// 因此这里只做显式迁移函数，不在播放路径上隐式改写文件。
//
// 迁移 id 使用 SHA-1 前 10 位（与既有迁移脚本一致），只在 Node 侧执行；
// 浏览器端如需迁移，应在服务端完成后再下发 ZIP。

const { LEGACY_ENTRY_MODE, CourseFormatError, validateManifest } = require('./manifest');
const { writeLumePackage, detectCourseFormat } = require('./package');

function legacySourceHash(source) {
    // 延迟 require：只在真正迁移时加载 Node 模块，便于纯校验场景在浏览器里复用本包。
    const crypto = require('crypto');
    return crypto.createHash('sha1').update(source).digest('hex').slice(0, 10);
}

const LEGACY_PAGE_PATH = 'slides/LegacyCourse.tsx';
const LEGACY_PAGE_ID = 'legacy-course';

/** 只取 window.CourseData 之后的源码，避免把前置注释当成课程数据。 */
function getCourseDataSource(source) {
    const text = String(source || '');
    const index = text.lastIndexOf('window.CourseData');
    return index >= 0 ? text.slice(index) : text;
}

/** 从旧脚本里提取 `key: 'value'` 形式的字符串属性。 */
function extractLegacyStringProperty(source, key) {
    const match = getCourseDataSource(source).match(new RegExp(`${key}:\\s*["'](.+?)["']`));
    return match ? match[1] : '';
}

/** 生成可安全用于 id/文件名的片段。 */
function sanitizeCourseId(input) {
    return String(input || 'course')
        .trim()
        .replace(/\.lume$/i, '')
        .replace(/[^\w.-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        || 'course';
}

/**
 * 由旧脚本内容构造 v1 ZIP 课件的 manifest 与文件表。
 * @returns {{manifest: object, files: Map<string, string>, title: string, sourceHash: string}}
 */
function planLegacyMigration(source, options = {}) {
    const text = String(source || '');
    if (!text.trim()) {
        throw new CourseFormatError('legacy_source_empty', '旧课件内容为空');
    }
    if (detectCourseFormat(text) === 'lume-zip') {
        throw new CourseFormatError('legacy_source_is_zip', '输入已经是 ZIP 课件，无需迁移');
    }
    const sourceHash = legacySourceHash(text);
    const baseId = sanitizeCourseId(options.id || options.baseName || 'course');
    const title = options.title || extractLegacyStringProperty(text, 'title') || baseId;
    const timestamp = options.timestamp || new Date().toISOString();

    const manifest = {
        schemaVersion: '1.0.0',
        id: `${baseId}-${sourceHash}`,
        title,
        version: '1.0.0',
        author: { name: 'LumeSync' },
        createdAt: timestamp,
        updatedAt: timestamp,
        icon: extractLegacyStringProperty(text, 'icon') || 'Course',
        desc: extractLegacyStringProperty(text, 'desc') || '',
        color: extractLegacyStringProperty(text, 'color') || 'from-blue-500 to-indigo-600',
        runtime: {
            format: 'lumesync-zip',
            react: '18',
            slideModule: 'tsx',
            entryMode: LEGACY_ENTRY_MODE,
            preferredAspectRatio: '16:9'
        },
        pages: [
            { id: LEGACY_PAGE_ID, file: LEGACY_PAGE_PATH, title }
        ],
        assets: {},
        migration: {
            from: 'legacy-script',
            sourceHash,
            migratedAt: timestamp
        }
    };

    const validation = validateManifest(manifest, { entryNames: ['manifest.json', LEGACY_PAGE_PATH] });
    if (!validation.ok) {
        throw new CourseFormatError('legacy_manifest_invalid', '迁移生成的 manifest 未通过校验', {
            errors: validation.errors
        });
    }

    return {
        manifest,
        files: new Map([[LEGACY_PAGE_PATH, text]]),
        title,
        sourceHash
    };
}

/**
 * 执行迁移，返回可直接写盘的 ZIP 内容。
 * @returns {Promise<{buffer: Uint8Array, manifest: object, title: string, sourceHash: string, id: string}>}
 */
async function migrateLegacyCourse(source, options = {}) {
    const plan = planLegacyMigration(source, options);
    const buffer = await writeLumePackage(
        { manifest: plan.manifest, files: plan.files },
        { date: options.date || options.timestamp || undefined, outputType: 'uint8array' }
    );
    return {
        buffer,
        manifest: plan.manifest,
        title: plan.title,
        sourceHash: plan.sourceHash,
        id: plan.manifest.id
    };
}

module.exports = {
    LEGACY_PAGE_PATH,
    LEGACY_PAGE_ID,
    getCourseDataSource,
    extractLegacyStringProperty,
    sanitizeCourseId,
    planLegacyMigration,
    migrateLegacyCourse
};
