// ========================================================
// 服务器代码迁移脚本
// 将 server/ 目录下的文件复制到 packages/server/src/
// ========================================================

const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, 'server');
const targetDir = path.join(__dirname, 'packages/server/src');

// 创建目标目录
if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    console.log(`[Migrate] Created directory: ${targetDir}`);
}

// 要复制的文件列表
const filesToCopy = [
    'config.js',
    'courses.js',
    'data.js',
    'proxy.js',
    'routes.js',
    'socket.js',
    'submissions.js',
    'utils.js'
];

// 复制文件
filesToCopy.forEach(file => {
    const sourcePath = path.join(sourceDir, file);
    const targetPath = path.join(targetDir, file);

    if (fs.existsSync(sourcePath)) {
        const content = fs.readFileSync(sourcePath, 'utf8');
        fs.writeFileSync(targetPath, content, 'utf8');
        console.log(`[Migrate] Copied: ${file}`);
    } else {
        console.warn(`[Migrate] File not found: ${sourcePath}`);
    }
});

// 复制 README.md
const readmeSource = path.join(sourceDir, 'README.md');
const readmeTarget = path.join(targetDir, 'README.md');
if (fs.existsSync(readmeSource)) {
    const content = fs.readFileSync(readmeSource, 'utf8');
    fs.writeFileSync(readmeTarget, content, 'utf8');
    console.log(`[Migrate] Copied: README.md`);
}

console.log('[Migrate] Server migration completed!');
