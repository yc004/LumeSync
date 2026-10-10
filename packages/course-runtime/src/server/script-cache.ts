import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import zlib from 'zlib';

export type CourseDependencyDeclaration =
  | string
  | {
      name?: string;
      filename?: string;
      fileName?: string;
      localSrc?: string;
      publicSrc?: string;
      src?: string;
      url?: string;
    };

export interface NormalizedCourseDependency {
  name?: string;
  filename: string;
  localSrc: string;
  publicSrc: string;
}

export interface CourseDependencyCacheOptions {
  coursesDir: string;
  libDir: string;
  downloadTimeout?: number;
}

export interface CourseDependencyCacheResult {
  courseId: string;
  courseFile?: string;
  dependencies: NormalizedCourseDependency[];
  cached: Array<NormalizedCourseDependency & { path: string; alreadyCached: boolean }>;
  skipped: NormalizedCourseDependency[];
}

const DEFAULT_DOWNLOAD_TIMEOUT = 60000;
const MAX_REDIRECTS = 5;

export const scriptDependencyMap: Record<string, string> = {};

const KNOWN_FILE_URLS: Record<string, string> = {
  'tailwindcss.js': 'https://cdn.tailwindcss.com',
  'react.development.js': 'https://unpkg.com/react@18/umd/react.development.js',
  'react-dom.development.js': 'https://unpkg.com/react-dom@18/umd/react-dom.development.js',
  'babel.min.js': 'https://unpkg.com/@babel/standalone/babel.min.js',
  'babel.min.js.map': 'https://unpkg.com/@babel/standalone/babel.min.js.map',
  'jszip.min.js': 'https://fastly.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
  'pdf.min.js': 'https://fastly.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
  'pdf.worker.min.js': 'https://fastly.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
  'face-api.min.js': 'https://fastly.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js',
  'katex.min.js': 'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js',
  'lodash.min.js': 'https://fastly.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js',
  'marked.min.js': 'https://fastly.jsdelivr.net/npm/marked@12.0.0/marked.min.js',
  'dayjs.min.js': 'https://fastly.jsdelivr.net/npm/dayjs@1.11.10/dayjs.min.js',
  'chart.umd.min.js': 'https://fastly.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
};

function normalizeRelativePath(value: unknown): string {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function normalizeLocalSrc(value: unknown, filename: string): string {
  const raw = String(value || '').trim();
  if (!raw) return `/lib/${filename}`;
  if (/^https?:\/\//i.test(raw)) return `/lib/${filename}`;
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function safeBasename(value: unknown): string {
  const basename = path.posix.basename(String(value || '').replace(/\\/g, '/')).trim();
  if (!basename || basename === '.' || basename === '..' || basename.includes('/') || basename.includes('\\')) {
    return '';
  }
  return basename;
}

function isHttpUrl(value: unknown): boolean {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function normalizeDependency(input: CourseDependencyDeclaration): NormalizedCourseDependency | null {
  if (typeof input === 'string') {
    const filename = safeBasename(input);
    const publicSrc = KNOWN_FILE_URLS[filename] || scriptDependencyMap[filename] || '';
    if (!filename || !publicSrc) return null;
    return { filename, localSrc: `/lib/${filename}`, publicSrc };
  }

  if (!input || typeof input !== 'object') return null;

  const publicSrc = String(input.publicSrc || input.src || input.url || '').trim();
  const filename =
    safeBasename(input.filename) ||
    safeBasename(input.fileName) ||
    safeBasename(input.localSrc) ||
    safeBasename(publicSrc);

  if (!filename) return null;

  const resolvedPublicSrc = publicSrc || KNOWN_FILE_URLS[filename] || scriptDependencyMap[filename] || '';
  if (!isHttpUrl(resolvedPublicSrc)) return null;

  return {
    name: input.name,
    filename,
    localSrc: normalizeLocalSrc(input.localSrc, filename),
    publicSrc: resolvedPublicSrc,
  };
}

export function normalizeCourseDependencies(value: unknown): NormalizedCourseDependency[] {
  const rawItems = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.entries(value as Record<string, unknown>).map(([filename, publicSrc]) => ({ filename, publicSrc }))
      : [];

  const byFilename = new Map<string, NormalizedCourseDependency>();
  for (const raw of rawItems) {
    const dep = normalizeDependency(raw as CourseDependencyDeclaration);
    if (!dep) continue;
    byFilename.set(dep.filename, dep);
    scriptDependencyMap[dep.filename] = dep.publicSrc;
  }
  return Array.from(byFilename.values());
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minOffset; offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function readZipEntrySync(absolutePath: string, entryName: string): Buffer | null {
  const buffer = fs.readFileSync(absolutePath);
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset < 0) return null;

  const centralDirSize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);
  const centralDirEnd = Math.min(buffer.length, centralDirOffset + centralDirSize);
  let offset = centralDirOffset;

  while (offset + 46 <= centralDirEnd && buffer.readUInt32LE(offset) === 0x02014b50) {
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.slice(offset + 46, offset + 46 + fileNameLength).toString('utf8').replace(/\\/g, '/');

    if (name === entryName) {
      if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) return null;
      const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = buffer.slice(dataOffset, dataOffset + compressedSize);

      if (compressionMethod === 0) return compressed;
      if (compressionMethod === 8) return zlib.inflateRawSync(compressed);
      throw new Error(`Unsupported zip compression method ${compressionMethod} for ${entryName}`);
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return null;
}

export function readLumeManifestDependencies(absolutePath: string): NormalizedCourseDependency[] {
  const manifestBuffer = readZipEntrySync(absolutePath, 'manifest.json');
  if (!manifestBuffer) return [];
  const manifest = JSON.parse(manifestBuffer.toString('utf8'));
  return normalizeCourseDependencies(manifest?.dependencies);
}

function resolveCoursePath(coursesDir: string, courseFile: string): string | null {
  const coursesRoot = path.resolve(coursesDir);
  const normalized = normalizeRelativePath(courseFile);
  if (!normalized) return null;
  const absolutePath = path.resolve(coursesRoot, normalized);
  if (absolutePath !== coursesRoot && !absolutePath.startsWith(`${coursesRoot}${path.sep}`)) return null;
  return absolutePath;
}

function resolveCachePath(libDir: string, dep: NormalizedCourseDependency): string | null {
  if (!dep.localSrc.startsWith('/lib/')) return null;
  const filename = safeBasename(dep.filename);
  if (!filename) return null;
  return path.join(libDir, filename);
}

async function downloadToFile(url: string, destination: string, timeoutMs: number, redirectCount = 0): Promise<void> {
  if (redirectCount > MAX_REDIRECTS) throw new Error(`Too many redirects for ${url}`);

  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
  const tempPath = `${destination}.part`;
  await fs.promises.rm(tempPath, { force: true });

  await new Promise<void>((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const request = client.get(url, (response) => {
      request.setTimeout(0);

      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        const redirectUrl = new URL(response.headers.location, url).toString();
        downloadToFile(redirectUrl, destination, timeoutMs, redirectCount + 1).then(resolve, reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode || 0} for ${url}`));
        return;
      }

      const fileStream = fs.createWriteStream(tempPath);
      response.pipe(fileStream);

      const fail = (err: Error) => {
        fileStream.destroy();
        fs.promises.rm(tempPath, { force: true }).finally(() => reject(err));
      };

      request.on('error', fail);
      response.on('error', fail);
      fileStream.on('error', fail);
      fileStream.on('finish', () => {
        fileStream.close((err) => {
          if (err) {
            fail(err);
            return;
          }
          fs.promises.rename(tempPath, destination).then(resolve, reject);
        });
      });
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Request timed out: ${url}`));
    });
    request.on('error', reject);
  });
}

export async function ensureDependenciesCached(
  dependencies: NormalizedCourseDependency[],
  options: Pick<CourseDependencyCacheOptions, 'libDir' | 'downloadTimeout'>,
): Promise<CourseDependencyCacheResult['cached']> {
  const cached: CourseDependencyCacheResult['cached'] = [];
  const timeoutMs = Number(options.downloadTimeout || DEFAULT_DOWNLOAD_TIMEOUT);

  for (const dep of dependencies) {
    const cachePath = resolveCachePath(options.libDir, dep);
    if (!cachePath) continue;

    if (fs.existsSync(cachePath) && fs.statSync(cachePath).isFile() && fs.statSync(cachePath).size > 0) {
      cached.push({ ...dep, path: cachePath, alreadyCached: true });
      continue;
    }

    await downloadToFile(dep.publicSrc.replace('cdn.jsdelivr.net', 'fastly.jsdelivr.net'), cachePath, timeoutMs);
    cached.push({ ...dep, path: cachePath, alreadyCached: false });
  }

  return cached;
}

export async function ensureCourseDependenciesCached(
  courseId: string,
  courseCatalog: unknown,
  options: CourseDependencyCacheOptions,
): Promise<CourseDependencyCacheResult> {
  const courses = Array.isArray((courseCatalog as { courses?: unknown[] })?.courses)
    ? (courseCatalog as { courses: Array<Record<string, unknown>> }).courses
    : Array.isArray(courseCatalog)
      ? (courseCatalog as Array<Record<string, unknown>>)
      : [];

  const course = courses.find((item) => String(item?.id || '') === String(courseId || ''));
  const courseFile = String(course?.file || '');
  const absolutePath = resolveCoursePath(options.coursesDir, courseFile);

  if (!course || !absolutePath || !fs.existsSync(absolutePath)) {
    return { courseId, courseFile, dependencies: [], cached: [], skipped: [] };
  }

  const dependencies = path.extname(courseFile).toLowerCase() === '.lume'
    ? readLumeManifestDependencies(absolutePath)
    : [];
  const cacheable = dependencies.filter(dep => dep.localSrc.startsWith('/lib/'));
  const skipped = dependencies.filter(dep => !dep.localSrc.startsWith('/lib/'));
  const cached = await ensureDependenciesCached(cacheable, options);

  return { courseId, courseFile, dependencies, cached, skipped };
}
