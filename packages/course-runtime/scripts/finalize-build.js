const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const browserSrc = path.join(repoRoot, 'src', 'browser');
const browserDst = path.join(repoRoot, 'dist', 'browser');
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

function copyDir(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

copyDir(browserSrc, browserDst);

fs.writeFileSync(path.join(repoRoot, 'dist', 'cjs', 'package.json'), JSON.stringify({ type: 'commonjs' }, null, 2));
fs.writeFileSync(path.join(repoRoot, 'dist', 'esm', 'package.json'), JSON.stringify({ type: 'module' }, null, 2));

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walkFiles(fullPath) : [fullPath];
  });
}

function runtimeOrder(fileName) {
  const normalized = fileName.replace(/\\/g, '/');
  const explicitOrder = {
    'engine/runtime/globals.tsx': 0,
    'engine/runtime/sync-classroom.tsx': 1,
    'engine/runtime/resource-loader.tsx': 2,
    'engine/runtime/camera-manager.tsx': 3,
    'engine/runtime/app.tsx': 100,
  };
  if (Object.prototype.hasOwnProperty.call(explicitOrder, normalized)) {
    return explicitOrder[normalized];
  }
  if (normalized.startsWith('engine/course-components/')) {
    return 20;
  }
  return 50;
}

function buildBrowserRuntimePackage() {
  const runtimeSources = walkFiles(browserSrc)
    .filter((file) => /\.(tsx?|jsx?)$/.test(file))
    .map((file) => ({
      fileName: path.relative(browserSrc, file).replace(/\\/g, '/'),
      source: fs.readFileSync(file, 'utf8'),
    }))
    .sort((a, b) => runtimeOrder(a.fileName) - runtimeOrder(b.fileName) || a.fileName.localeCompare(b.fileName));

  const esmDir = path.join(repoRoot, 'dist', 'esm', 'browser-runtime');
  const cjsDir = path.join(repoRoot, 'dist', 'cjs', 'browser-runtime');
  const typesDir = path.join(repoRoot, 'dist', 'types', 'browser-runtime');
  fs.mkdirSync(esmDir, { recursive: true });
  fs.mkdirSync(cjsDir, { recursive: true });
  fs.mkdirSync(typesDir, { recursive: true });

  const runtimePayload = JSON.stringify(runtimeSources, null, 2);
  fs.writeFileSync(
    path.join(esmDir, 'index.js'),
    [
      `export const coreRuntimeVersion = ${JSON.stringify(packageJson.version)};`,
      `export const coreRuntimeSources = ${runtimePayload};`,
      '',
    ].join('\n'),
    'utf8'
  );
  fs.writeFileSync(
    path.join(cjsDir, 'index.js'),
    [
      "'use strict';",
      `const coreRuntimeVersion = ${JSON.stringify(packageJson.version)};`,
      `const coreRuntimeSources = ${runtimePayload};`,
      'exports.coreRuntimeVersion = coreRuntimeVersion;',
      'exports.coreRuntimeSources = coreRuntimeSources;',
      '',
    ].join('\n'),
    'utf8'
  );
  fs.writeFileSync(
    path.join(typesDir, 'index.d.ts'),
    [
      'export type CoreRuntimeSource = {',
      '  fileName: string;',
      '  source: string;',
      '};',
      'export declare const coreRuntimeVersion: string;',
      'export declare const coreRuntimeSources: CoreRuntimeSource[];',
      '',
    ].join('\n'),
    'utf8'
  );
}

buildBrowserRuntimePackage();

const esmRenderEngine = path.join(repoRoot, 'dist', 'esm', 'node', 'render-engine.js');
if (fs.existsSync(esmRenderEngine)) {
  const source = fs.readFileSync(esmRenderEngine, 'utf8');
  fs.writeFileSync(
    esmRenderEngine,
    source.replace(
      "import path from 'path';",
      "import path from 'path';\nimport { fileURLToPath } from 'url';\nconst __dirname = path.dirname(fileURLToPath(import.meta.url));"
    ),
    'utf8'
  );
}

console.log('[core-build] wrote dist/cjs, dist/esm, dist/types, dist/browser');
