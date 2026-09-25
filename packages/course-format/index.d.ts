// @lumesync/course-format 类型声明。

export type EntryMode = 'pages' | 'legacy-course-data';
export type CourseFormatKind = 'lume-zip' | 'legacy-script' | 'unknown';

export interface CourseManifestPage {
    id?: string;
    file: string;
    title?: string;
    transition?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface CourseManifestRuntime {
    format: 'lumesync-zip';
    entryMode?: EntryMode;
    react?: string;
    slideModule?: string;
    preferredAspectRatio?: string;
    [key: string]: unknown;
}

export interface CourseManifest {
    schemaVersion?: string;
    id?: string;
    title?: string;
    version?: string;
    author?: { name?: string; [key: string]: unknown };
    createdAt?: string;
    updatedAt?: string;
    icon?: string;
    desc?: string;
    color?: string;
    runtime?: CourseManifestRuntime;
    pages: CourseManifestPage[];
    assets?: Record<string, { type?: string; size?: number; usage?: string[]; [key: string]: unknown }>;
    migration?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface FormatIssue {
    path: string;
    code: string;
    message: string;
}

export interface ManifestValidationResult {
    ok: boolean;
    errors: FormatIssue[];
    warnings: FormatIssue[];
    value: CourseManifest | null;
}

export class CourseFormatError extends Error {
    constructor(code: string, message: string, details?: Record<string, unknown>);
    name: 'CourseFormatError';
    code: string;
    details: Record<string, unknown>;
}

export const SCHEMA_VERSION: string;
export const SUPPORTED_SCHEMA_VERSIONS: string[];
export const RUNTIME_FORMAT: 'lumesync-zip';
export const ENTRY_MODES: EntryMode[];
export const LEGACY_ENTRY_MODE: 'legacy-course-data';
export const SLIDE_EXTENSIONS: string[];
export const LIMITS: {
    maxEntries: number;
    maxEntryUncompressedBytes: number;
    maxTotalUncompressedBytes: number;
    maxCompressionRatio: number;
    maxPathLength: number;
    maxPages: number;
    maxManifestBytes: number;
    maxAssets: number;
};

export function isSafeRelativePath(value: unknown): boolean;
export function validateManifest(
    manifest: unknown,
    options?: { entryNames?: string[]; strictSchemaVersion?: boolean }
): ManifestValidationResult;
export function normalizeManifest(manifest: unknown, defaults?: { id?: string; title?: string }): CourseManifest;
export function createManifest(input: {
    id?: string;
    title?: string;
    pages: CourseManifestPage[];
    assets?: CourseManifest['assets'];
    entryMode?: EntryMode;
    runtime?: Partial<CourseManifestRuntime>;
    version?: string;
    author?: CourseManifest['author'];
    icon?: string;
    desc?: string;
    color?: string;
    createdAt?: string;
    updatedAt?: string;
    timestamp?: string;
}): CourseManifest;

export const MANIFEST_NAME: 'manifest.json';
export function looksLikeZip(input: Uint8Array | ArrayBuffer | null | undefined): boolean;
export function detectCourseFormat(input: Uint8Array | ArrayBuffer | string | null | undefined): CourseFormatKind;
export function toUint8Array(input: unknown): Uint8Array | null;

export interface LumePackageSuccess {
    ok: true;
    code: null;
    errors: FormatIssue[];
    warnings: FormatIssue[];
    manifest: CourseManifest;
    rawManifest: unknown;
    entries: string[];
    totalUncompressedBytes: number;
    readFile(name: string, type?: 'uint8array' | 'nodebuffer' | 'string'): Promise<any>;
    readText(name: string): Promise<string>;
}
export interface LumePackageFailure {
    ok: false;
    code: string;
    errors: FormatIssue[];
    warnings: FormatIssue[];
}
export type LumePackageResult = LumePackageSuccess | LumePackageFailure;

export function readLumePackage(
    input: Uint8Array | ArrayBuffer,
    options?: { strictSchemaVersion?: boolean; limits?: Partial<typeof LIMITS> }
): Promise<LumePackageResult>;
export function writeLumePackage(
    input: { manifest: CourseManifest; files: Record<string, string | Uint8Array> | Map<string, string | Uint8Array> },
    options?: { date?: Date | string | number; outputType?: 'uint8array' | 'nodebuffer' | 'base64' }
): Promise<any>;
export function computeCourseHash(
    input: Uint8Array | ArrayBuffer,
    options?: { package?: LumePackageSuccess }
): Promise<{ algorithm: 'sha256'; hash: string; entryCount: number }>;

export const LEGACY_PAGE_PATH: string;
export const LEGACY_PAGE_ID: string;
export function getCourseDataSource(source: string): string;
export function extractLegacyStringProperty(source: string, key: string): string;
export function sanitizeCourseId(input: unknown): string;
export function planLegacyMigration(
    source: string,
    options?: { id?: string; baseName?: string; title?: string; timestamp?: string }
): { manifest: CourseManifest; files: Map<string, string>; title: string; sourceHash: string };
export function migrateLegacyCourse(
    source: string,
    options?: { id?: string; baseName?: string; title?: string; timestamp?: string; date?: Date | string | number }
): Promise<{ buffer: Uint8Array; manifest: CourseManifest; title: string; sourceHash: string; id: string }>;
