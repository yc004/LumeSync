import path from 'path';

const teacherRenderEngineSourceOrder = [
  'runtime/globals.tsx',
  'runtime/sync-classroom.tsx',
  'runtime/resource-loader.tsx',
  'runtime/camera-manager.tsx',
  'course-components/web-page-slide.tsx',
  'course-components/survey-slide.tsx',
  'course-components/vote-slide.tsx',
  'course-components/document-renderer.js',
  'runtime/app.tsx',
];

function resolvePackageRoot(): string {
  return path.resolve(__dirname, '..', '..', '..');
}

export function resolveEngineSrcDir(): string {
  return process.env.LUMESYNC_ENGINE_DIR || path.join(resolvePackageRoot(), 'dist', 'browser', 'engine');
}

export function resolveEngineDevelopmentSrcDir(): string {
  return process.env.LUMESYNC_ENGINE_DIR || path.join(resolvePackageRoot(), 'src', 'browser', 'engine');
}

export function getTeacherRenderEngineSources(options: { preferSource?: boolean } = {}): string[] {
  const engineDir = options.preferSource === false ? resolveEngineSrcDir() : resolveEngineDevelopmentSrcDir();
  return teacherRenderEngineSourceOrder.map((entry) => path.join(engineDir, entry));
}

export function getTeacherRenderEngineSourceOrder(): string[] {
  return teacherRenderEngineSourceOrder.slice();
}
