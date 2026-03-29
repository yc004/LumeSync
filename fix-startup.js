// ========================================================
// 教师端启动问题修复脚本
// ========================================================

const path = require('path');
const fs = require('fs');

console.log('🔧 SyncClassroom 教师端启动问题修复\n');

// 检查关键文件
const checks = [
    {
        name: '教师端 index.html',
        path: path.join(__dirname, 'shared/public/index.html'),
        required: true
    },
    {
        name: '学生端 student.html',
        path: path.join(__dirname, 'shared/public/student.html'),
        required: true
    },
    {
        name: '编辑器 editor.html',
        path: path.join(__dirname, 'shared/public/editor.html'),
        required: true
    },
    {
        name: '引擎 00-globals.js',
        path: path.join(__dirname, 'packages/engine/src/00-globals.js'),
        required: true
    },
    {
        name: '服务器 index.js',
        path: path.join(__dirname, 'packages/server/index.js'),
        required: true
    },
    {
        name: '教师端主进程',
        path: path.join(__dirname, 'apps/teacher/electron/main.js'),
        required: true
    }
];

let allPassed = true;

console.log('📋 检查关键文件...\n');
checks.forEach(check => {
    const exists = fs.existsSync(check.path);
    const status = exists ? '✅' : '❌';
    const requirement = check.required ? ' (必需)' : ' (可选)';
    console.log(`${status} ${check.name}${requirement}`);
    if (check.required && !exists) {
        allPassed = false;
    }
});

console.log('\n');

// 检查服务器配置
console.log('📋 检查服务器配置...\n');
const serverIndexPath = path.join(__dirname, 'packages/server/index.js');
if (fs.existsSync(serverIndexPath)) {
    const serverContent = fs.readFileSync(serverIndexPath, 'utf8');
    const hasEngineRoute = serverContent.includes("app.use('/engine', express.static(engineDir))");
    console.log(`${hasEngineRoute ? '✅' : '❌'} 服务器配置了 /engine 路由`);
    if (!hasEngineRoute) {
        allPassed = false;
    }
} else {
    console.log('❌ 服务器文件不存在');
    allPassed = false;
}

console.log('\n');

// 检查配置文件路径
console.log('📋 检查配置文件路径...\n');
const configPath = path.join(__dirname, 'packages/server/src/config.js');
if (fs.existsSync(configPath)) {
    const configContent = fs.readFileSync(configPath, 'utf8');
    const hasCorrectPaths = configContent.includes('../../../shared/public');
    console.log(`${hasCorrectPaths ? '✅' : '❌'} 配置文件使用了正确的共享目录路径`);
    if (!hasCorrectPaths) {
        allPassed = false;
    }
} else {
    console.log('❌ 配置文件不存在');
    allPassed = false;
}

console.log('\n');

// 总结
if (allPassed) {
    console.log('✅ 所有检查通过！教师端应该可以正常启动。\n');
    console.log('🚀 启动命令：\n');
    console.log('  npm run start:teacher\n');
    console.log('或者先启动服务器：\n');
    console.log('  npm start\n');
    console.log('然后再启动教师端：\n');
    console.log('  npm run start:teacher\n');
} else {
    console.log('❌ 发现问题！请检查上述失败的项。\n');
    console.log('💡 常见解决方案：\n');
    console.log('  1. 运行 node verify-structure.js 验证项目结构\n');
    console.log('  2. 重新安装依赖：npm install\n');
    console.log('  3. 检查文件权限\n');
}

console.log('\n');
console.log('📖 更多帮助请查看：\n');
console.log('  - QUICKSTART-FIXED.md - 快速启动指南\n');
console.log('  - REFACTORING_SUMMARY.md - 重构总结\n');
