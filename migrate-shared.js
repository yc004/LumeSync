// ========================================================
// 共享资源迁移脚本
// 将 public/lib, public/webfonts, public/weights 等复制到 shared/
// ========================================================

const fs = require('fs');
const path = require('path');

console.log('[Migrate] 开始迁移共享资源...\n');

// 定义要迁移的目录
const dirsToMigrate = [
    { source: 'public/lib', target: 'shared/public/lib' },
    { source: 'public/webfonts', target: 'shared/public/webfonts' },
    { source: 'public/weights', target: 'shared/public/weights' },
    { source: 'public/courses', target: 'shared/public/courses' },
    { source: 'public/knowledge', target: 'shared/public/knowledge' },
    { source: 'public/data', target: 'shared/public/data' },
    { source: 'assets', target: 'shared/assets' },
    { source: 'build', target: 'shared/build' },
    { source: 'docs', target: 'shared/docs' }
];

// 复制目录的函数
function copyDirectory(source, target) {
    const sourcePath = path.join(__dirname, source);
    const targetPath = path.join(__dirname, target);

    if (!fs.existsSync(sourcePath)) {
        console.warn(`  ⚠ 源目录不存在: ${source}`);
        return;
    }

    // 创建目标目录
    if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
    }

    const items = fs.readdirSync(sourcePath);

    items.forEach(item => {
        const sourceItem = path.join(sourcePath, item);
        const targetItem = path.join(targetPath, item);
        const stat = fs.statSync(sourceItem);

        if (stat.isDirectory()) {
            // 递归复制子目录
            copyDirectory(path.join(source, item), path.join(target, item));
        } else {
            // 复制文件
            const content = fs.readFileSync(sourceItem);
            fs.writeFileSync(targetItem, content);
            console.log(`  ✓ ${path.join(target, item)}`);
        }
    });
}

// 执行迁移
dirsToMigrate.forEach(({ source, target }) => {
    console.log(`迁移: ${source} -> ${target}`);
    copyDirectory(source, target);
    console.log();
});

console.log('[Migrate] 共享资源迁移完成!\n');
console.log('注意: 旧的 public/, assets/, build/, docs/ 目录仍然保留，');
console.log('      以确保向后兼容。确认一切正常后可以删除它们。');
