// .lume manifest 的 schema、校验与规范化。
//
// 目标设计要求"先定义版本化的 .lume schema、校验器和读写库；新编辑器与播放器
// 都依赖它"。当前浏览器运行时的 validateLumeManifest 只检查 runtime.format、
// entryMode 和 pages[].file，这里把它扩展成可复用的校验器：
//   - 结构性错误（无法播放）→ errors
//   - 可疑但不阻塞（资源缺失、字段缺失）→ warnings
// 调用方（导入、扫描、编辑器保存）必须显式处理 errors，不能静默跳过。

const SCHEMA_VERSION = '1.0.0';
const SUPPORTED_SCHEMA_VERSIONS = ['1.0.0'];
const RUNTIME_FORMAT = 'lumesync-zip';
const ENTRY_MODES = ['pages', 'legacy-course-data'];
const LEGACY_ENTRY_MODE = 'legacy-course-data';
const SLIDE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'];

const LIMITS = {
    maxEntries: 2000,
    maxEntryUncompressedBytes: 32 * 1024 * 1024,
    maxTotalUncompressedBytes: 256 * 1024 * 1024,
    maxCompressionRatio: 200,
    maxPathLength: 240,
    maxPages: 500,
    maxManifestBytes: 1024 * 1024,
    // 磁盘上的包文件上限：课程扫描会同步读取整个 .lume，先用 stat 拒绝超大文件。
    maxPackageBytes: 64 * 1024 * 1024,
    maxAssets: 2000
};

class CourseFormatError extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.name = 'CourseFormatError';
        this.code = code;
        this.details = details;
    }
}

function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pushIssue(list, path, code, message) {
    list.push({ path, code, message });
}

function isSafeRelativePath(value) {
    const raw = String(value || '');
    if (!raw) return false;
    if (raw.length > LIMITS.maxPathLength) return false;
    if (raw.includes('\0')) return false;
    // 控制字符与反斜杠一律拒绝：ZIP 规范使用 /，反斜杠常来自 Windows 打包器，
    // 统一按不安全处理，避免解包端把 a\..\b 当成合法相对路径。
    if (/[\u0000-\u001f\u007f\\]/.test(raw)) return false;
    if (raw.startsWith('/')) return false;
    if (/^[a-zA-Z]:/.test(raw)) return false;
    const segments = raw.split('/');
    if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return false;
    return true;
}

/**
 * 校验 manifest。
 * @param {object} manifest 解析后的 manifest.json
 * @param {object} [options]
 * @param {string[]} [options.entryNames] ZIP 内条目名，用于检查引用是否存在
 * @param {boolean} [options.strictSchemaVersion] schemaVersion 不受支持时是否算错误
 * @returns {{ok: boolean, errors: Array, warnings: Array, value: object|null}}
 */
function validateManifest(manifest, options = {}) {
    const errors = [];
    const warnings = [];
    const entryNames = Array.isArray(options.entryNames) ? new Set(options.entryNames) : null;
    const strictSchemaVersion = options.strictSchemaVersion !== false;

    if (!isPlainObject(manifest)) {
        pushIssue(errors, 'manifest', 'manifest_not_an_object', 'manifest.json 必须是 JSON 对象');
        return { ok: false, errors, warnings, value: null };
    }

    // schemaVersion
    const schemaVersion = typeof manifest.schemaVersion === 'string' ? manifest.schemaVersion.trim() : '';
    if (!schemaVersion) {
        pushIssue(
            strictSchemaVersion ? errors : warnings,
            'manifest.schemaVersion',
            'manifest_schema_version_missing',
            'manifest 缺少 schemaVersion，无法确定播放器版本'
        );
    } else if (!SUPPORTED_SCHEMA_VERSIONS.includes(schemaVersion)) {
        pushIssue(
            strictSchemaVersion ? errors : warnings,
            'manifest.schemaVersion',
            'manifest_schema_version_unsupported',
            `schemaVersion ${schemaVersion} 不在支持列表 ${SUPPORTED_SCHEMA_VERSIONS.join(', ')} 内`
        );
    }

    // runtime
    const runtime = isPlainObject(manifest.runtime) ? manifest.runtime : null;
    if (!runtime) {
        pushIssue(errors, 'manifest.runtime', 'manifest_runtime_missing', '缺少 runtime 对象');
    } else {
        if (runtime.format !== RUNTIME_FORMAT) {
            pushIssue(
                errors,
                'manifest.runtime.format',
                'manifest_runtime_format_unsupported',
                `runtime.format 必须是 ${RUNTIME_FORMAT}`
            );
        }
        const entryMode = runtime.entryMode === undefined ? 'pages' : String(runtime.entryMode);
        if (!ENTRY_MODES.includes(entryMode)) {
            pushIssue(
                errors,
                'manifest.runtime.entryMode',
                'manifest_entry_mode_unsupported',
                `runtime.entryMode 必须是 ${ENTRY_MODES.join(' 或 ')}`
            );
        }
    }

    // pages
    const pages = manifest.pages;
    if (!Array.isArray(pages) || pages.length === 0) {
        pushIssue(errors, 'manifest.pages', 'manifest_pages_missing', 'pages 必须是非空数组');
    } else if (pages.length > LIMITS.maxPages) {
        pushIssue(errors, 'manifest.pages', 'manifest_pages_too_many', `pages 数量超过上限 ${LIMITS.maxPages}`);
    } else {
        const seenIds = new Set();
        pages.forEach((page, index) => {
            const path = `manifest.pages[${index}]`;
            if (!isPlainObject(page)) {
                pushIssue(errors, path, 'page_not_an_object', '页面必须是对象');
                return;
            }
            const file = typeof page.file === 'string' ? page.file.trim() : '';
            if (!file) {
                pushIssue(errors, `${path}.file`, 'page_file_missing', '页面缺少 file');
            } else if (!isSafeRelativePath(file)) {
                pushIssue(errors, `${path}.file`, 'page_file_unsafe_path', `页面路径不安全或越界：${file}`);
            } else {
                if (entryNames && !entryNames.has(file)) {
                    pushIssue(errors, `${path}.file`, 'page_file_not_found', `ZIP 内不存在页面文件：${file}`);
                }
                const dot = file.lastIndexOf('.');
                const ext = dot >= 0 ? file.slice(dot).toLowerCase() : '';
                if (!SLIDE_EXTENSIONS.includes(ext)) {
                    pushIssue(warnings, `${path}.file`, 'page_file_extension_unexpected', `页面扩展名 ${ext || '(无)'} 不在常见列表内`);
                }
            }
            const id = typeof page.id === 'string' ? page.id.trim() : '';
            if (!id) {
                pushIssue(warnings, `${path}.id`, 'page_id_missing', '页面缺少 id，无法稳定引用');
            } else if (seenIds.has(id)) {
                pushIssue(warnings, `${path}.id`, 'page_id_duplicated', `页面 id 重复：${id}`);
            } else {
                seenIds.add(id);
            }
            if (page.title !== undefined && typeof page.title !== 'string') {
                pushIssue(warnings, `${path}.title`, 'page_title_not_a_string', '页面标题不是字符串');
            }
        });
    }

    // assets
    const assets = manifest.assets;
    if (assets !== undefined) {
        if (!isPlainObject(assets)) {
            pushIssue(errors, 'manifest.assets', 'manifest_assets_not_an_object', 'assets 必须是对象');
        } else {
            const assetPaths = Object.keys(assets);
            if (assetPaths.length > LIMITS.maxAssets) {
                pushIssue(errors, 'manifest.assets', 'manifest_assets_too_many', `assets 数量超过上限 ${LIMITS.maxAssets}`);
            }
            assetPaths.forEach((assetPath) => {
                if (!isSafeRelativePath(assetPath)) {
                    pushIssue(errors, `manifest.assets.${assetPath}`, 'asset_path_unsafe', `资源路径不安全或越界：${assetPath}`);
                    return;
                }
                if (entryNames && !entryNames.has(assetPath)) {
                    pushIssue(warnings, `manifest.assets.${assetPath}`, 'asset_not_found', `ZIP 内不存在资源：${assetPath}`);
                }
            });
        }
    }

    // id / title
    if (manifest.id !== undefined && (typeof manifest.id !== 'string' || !manifest.id.trim())) {
        pushIssue(errors, 'manifest.id', 'manifest_id_invalid', 'id 必须是非空字符串');
    }
    if (manifest.title !== undefined && typeof manifest.title !== 'string') {
        pushIssue(warnings, 'manifest.title', 'manifest_title_not_a_string', 'title 不是字符串');
    }

    return { ok: errors.length === 0, errors, warnings, value: errors.length === 0 ? manifest : null };
}

/** 补齐默认值，不改变已存在的字段。 */
function normalizeManifest(manifest, defaults = {}) {
    const source = isPlainObject(manifest) ? manifest : {};
    const runtime = isPlainObject(source.runtime) ? source.runtime : {};
    const normalized = {
        ...source,
        schemaVersion: typeof source.schemaVersion === 'string' && source.schemaVersion.trim()
            ? source.schemaVersion.trim()
            : SCHEMA_VERSION,
        id: typeof source.id === 'string' && source.id.trim() ? source.id.trim() : (defaults.id || 'course'),
        title: typeof source.title === 'string' && source.title.trim() ? source.title.trim() : (defaults.title || '未命名课件'),
        version: typeof source.version === 'string' && source.version.trim() ? source.version.trim() : '1.0.0',
        runtime: {
            react: '18',
            slideModule: 'tsx',
            preferredAspectRatio: '16:9',
            ...runtime,
            format: RUNTIME_FORMAT,
            entryMode: ENTRY_MODES.includes(String(runtime.entryMode)) ? String(runtime.entryMode) : 'pages'
        },
        pages: Array.isArray(source.pages)
            ? source.pages.map((page, index) => ({
                id: isPlainObject(page) && typeof page.id === 'string' && page.id.trim() ? page.id.trim() : `slide-${index + 1}`,
                title: isPlainObject(page) && typeof page.title === 'string' ? page.title : '',
                ...page
            }))
            : [],
        assets: isPlainObject(source.assets) ? { ...source.assets } : {}
    };
    return normalized;
}

/** 供编辑器/迁移器构造新 manifest。 */
function createManifest(input = {}) {
    const pages = Array.isArray(input.pages) ? input.pages : [];
    if (pages.length === 0) {
        throw new CourseFormatError('manifest_pages_missing', '创建 manifest 至少需要一页');
    }
    const now = input.timestamp || new Date().toISOString();
    return normalizeManifest({
        schemaVersion: SCHEMA_VERSION,
        id: input.id,
        title: input.title,
        version: input.version || '1.0.0',
        author: input.author || { name: 'LumeSync' },
        createdAt: input.createdAt || now,
        updatedAt: input.updatedAt || now,
        icon: input.icon || 'Course',
        desc: input.desc || '',
        color: input.color || 'from-blue-500 to-indigo-600',
        runtime: { ...(input.runtime || {}), entryMode: input.entryMode || 'pages' },
        pages,
        assets: input.assets || {}
    });
}

module.exports = {
    SCHEMA_VERSION,
    SUPPORTED_SCHEMA_VERSIONS,
    RUNTIME_FORMAT,
    ENTRY_MODES,
    LEGACY_ENTRY_MODE,
    SLIDE_EXTENSIONS,
    LIMITS,
    CourseFormatError,
    isSafeRelativePath,
    validateManifest,
    normalizeManifest,
    createManifest
};
