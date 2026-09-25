// `@lumesync/course-format/node` 类型声明（Node 专用文件系统辅助）。
import type { CourseManifest, FormatIssue, LumePackageResult, ManifestValidationResult } from './index.js';

export interface SyncLintResult {
    ok: boolean;
    code: string | null;
    manifest: CourseManifest | null;
    entryNames: string[];
    errors: FormatIssue[];
    warnings: FormatIssue[];
}

export function readLumeManifestSync(
    input: string | Uint8Array,
    options?: { strictSchemaVersion?: boolean; limits?: Record<string, number> }
): SyncLintResult;

export function lintLumeFileSync(filePath: string, options?: { strictSchemaVersion?: boolean }): SyncLintResult;

export function readLumeFile(
    filePath: string,
    options?: { strictSchemaVersion?: boolean }
): Promise<LumePackageResult & { filePath: string; fileSize: number }>;

export function writeLumeFile(
    filePath: string,
    coursePackage: { manifest: CourseManifest; files: Record<string, string | Uint8Array> | Map<string, string | Uint8Array> },
    options?: { date?: Date | string | number }
): Promise<{ filePath: string; bytes: number }>;

export function migrateLegacyLumeFile(
    inputPath: string,
    explicitOutputPath?: string,
    options?: { id?: string; title?: string; timestamp?: string }
): Promise<{
    inputPath: string;
    outputPath: string;
    title: string;
    manifestId: string;
    sourceHash: string;
}>;

export function collectLegacyLumeFiles(targetPath: string): string[];
