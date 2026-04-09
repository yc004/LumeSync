const path = require('path');

function resolveEngineSrcDir() {
    return process.env.LUMESYNC_ENGINE_DIR || path.join(__dirname, '../engine/src');
}

module.exports = {
    resolveEngineSrcDir
};
