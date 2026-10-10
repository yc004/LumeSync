const fs = require('fs');
const path = require('path');

const distModule = path.join(__dirname, '../../dist/cjs/node/render-engine.js');

if (fs.existsSync(distModule)) {
  module.exports = require(distModule);
} else {
  const sourceOrder = [
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

  function resolveEngineDevelopmentSrcDir() {
    return process.env.LUMESYNC_ENGINE_DIR || path.join(__dirname, '../../src/browser/engine');
  }

  function resolveEngineSrcDir() {
    return process.env.LUMESYNC_ENGINE_DIR || path.join(__dirname, '../../dist/browser/engine');
  }

  function getTeacherRenderEngineSources(options = {}) {
    const engineDir = options.preferSource === false ? resolveEngineSrcDir() : resolveEngineDevelopmentSrcDir();
    return sourceOrder.map((entry) => path.join(engineDir, entry));
  }

  function getTeacherRenderEngineSourceOrder() {
    return sourceOrder.slice();
  }

  module.exports = {
    resolveEngineSrcDir,
    resolveEngineDevelopmentSrcDir,
    getTeacherRenderEngineSources,
    getTeacherRenderEngineSourceOrder,
  };
}
