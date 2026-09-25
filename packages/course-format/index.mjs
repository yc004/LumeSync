// ESM 入口。
import cjs from './index.js';

export const {
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
    createManifest,
    MANIFEST_NAME,
    looksLikeZip,
    detectCourseFormat,
    readLumePackage,
    writeLumePackage,
    computeCourseHash,
    toUint8Array,
    LEGACY_PAGE_PATH,
    LEGACY_PAGE_ID,
    getCourseDataSource,
    extractLegacyStringProperty,
    sanitizeCourseId,
    planLegacyMigration,
    migrateLegacyCourse
} = cjs;

export default cjs;
