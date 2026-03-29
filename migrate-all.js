// ========================================================
// 完整迁移脚本 - 一次性执行所有迁移
// ========================================================

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('========================================');
console.log('SyncClassroom 项目重构迁移脚本');
console.log('========================================\n');

try {
    // 1. 迁移服务器
    console.log('1/5 迁移服务器...');
    execSync('node migrate-server.js', { cwd: __dirname });
    console.log('✓ 服务器迁移完成\n');

    // 2. 迁移引擎
    console.log('2/5 迁移渲染引擎...');
    execSync('node migrate-engine.js', { cwd: __dirname });
    console.log('✓ 渲染引擎迁移完成\n');

    // 3. 迁移教师端
    console.log('3/5 迁移教师端...');
    execSync('node migrate-teacher.js', { cwd: __dirname });
    console.log('✓ 教师端迁移完成\n');

    // 4. 迁移学生端
    console.log('4/5 迁移学生端...');
    execSync('node migrate-student.js', { cwd: __dirname });
    console.log('✓ 学生端迁移完成\n');

    // 5. 迁移编辑器端
    console.log('5/5 迁移编辑器端...');
    execSync('node migrate-editor.js', { cwd: __dirname });
    console.log('✓ 编辑器端迁移完成\n');

    // 6. 创建 shared 目录结构
    console.log('6/6 创建共享资源目录...');
    const sharedDirs = [
        'shared/public',
        'shared/public/lib',
        'shared/public/webfonts',
        'shared/public/weights',
        'shared/public/courses',
        'shared/public/knowledge',
        'shared/public/data',
        'shared/assets',
        'shared/build'
    ];

    sharedDirs.forEach(dir => {
        const fullPath = path.join(__dirname, dir);
        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
            console.log(`  ✓ 创建目录: ${dir}`);
        }
    });

    console.log('========================================');
    console.log('✓ 所有迁移完成！');
    console.log('========================================\n');

    console.log('新的项目结构:');
    console.log('  packages/engine/    - 渲染引擎');
    console.log('  packages/server/    - 服务器');
    console.log('  apps/teacher/      - 教师端');
    console.log('  apps/student/       - 学生端');
    console.log('  apps/editor/        - 编辑器端');
    console.log('  apps/common/        - 公共代码');
    console.log('  shared/             - 共享资源\n');

    console.log('下一步:');
    console.log('  1. 检查迁移结果');
    console.log('  2. 测试各端功能');
    console.log('  3. 构建安装包\n');

} catch (error) {
    console.error('❌ 迁移失败:', error.message);
    process.exit(1);
}
