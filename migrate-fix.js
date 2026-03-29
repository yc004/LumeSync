// ========================================================
// 修复迁移 - 复制 preload.js
// ========================================================

const fs = require('fs');
const path = require('path');

// 复制 preload.js
const preloadSource = path.join(__dirname, 'electron/preload.js');
const preloadTarget = path.join(__dirname, 'apps/common/electron/preload.js');

if (fs.existsSync(preloadSource)) {
    const content = fs.readFileSync(preloadSource, 'utf8');
    fs.writeFileSync(preloadTarget, content, 'utf8');
    console.log('✓ Copied preload.js to apps/common/electron/');
} else {
    console.error('❌ preload.js not found in electron/');
}

console.log('\n修复完成！');
