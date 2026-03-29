// ========================================================
// 渲染引擎迁移脚本
// 将 public/engine/ 和 public/components/ 复制到 packages/engine/
// ========================================================

const fs = require('fs');
const path = require('path');

const sourceEngineDir = path.join(__dirname, 'public/engine');
const targetEngineDir = path.join(__dirname, 'packages/engine/src');
const sourceComponentsDir = path.join(__dirname, 'public/components');
const targetComponentsDir = path.join(__dirname, 'packages/engine/src/components');

// 创建目标目录
if (!fs.existsSync(targetEngineDir)) {
    fs.mkdirSync(targetEngineDir, { recursive: true });
    console.log(`[Migrate] Created directory: ${targetEngineDir}`);
}

if (!fs.existsSync(targetComponentsDir)) {
    fs.mkdirSync(targetComponentsDir, { recursive: true });
    console.log(`[Migrate] Created directory: ${targetComponentsDir}`);
}

// 复制引擎文件
const engineFiles = fs.readdirSync(sourceEngineDir);
engineFiles.forEach(file => {
    if (file.endsWith('.js')) {
        const sourcePath = path.join(sourceEngineDir, file);
        const targetPath = path.join(targetEngineDir, file);
        const content = fs.readFileSync(sourcePath, 'utf8');
        fs.writeFileSync(targetPath, content, 'utf8');
        console.log(`[Migrate] Copied engine file: ${file}`);
    }
});

// 复制组件文件
const componentFiles = fs.readdirSync(sourceComponentsDir);
componentFiles.forEach(file => {
    if (file.endsWith('.js')) {
        const sourcePath = path.join(sourceComponentsDir, file);
        const targetPath = path.join(targetComponentsDir, file);
        const content = fs.readFileSync(sourcePath, 'utf8');
        fs.writeFileSync(targetPath, content, 'utf8');
        console.log(`[Migrate] Copied component: ${file}`);
    }
});

console.log('[Migrate] Engine migration completed!');
