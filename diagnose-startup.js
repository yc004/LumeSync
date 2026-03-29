// ========================================================
// SyncClassroom 启动问题诊断脚本
// ========================================================

const path = require('path');
const fs = require('fs');
const os = require('os');

console.log('🔍 SyncClassroom 启动问题诊断\n');
console.log('='.repeat(60) + '\n');

// 1. 系统信息
console.log('📊 系统信息:');
console.log(`  操作系统: ${os.type()} ${os.release()}`);
console.log(`  架构: ${os.arch()}`);
console.log(`  主机名: ${os.hostname()}`);

// 获取本机 IP
const interfaces = os.networkInterfaces();
const ips = [];
for (const name in interfaces) {
    for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
            ips.push(`${name}: ${iface.address}`);
        }
    }
}
console.log(`  本机 IP: ${ips.join(', ') || '无网络连接'}`);
console.log();

// 2. 检查关键文件
console.log('📋 检查关键文件:');
const checks = [
    { name: '教师端 index.html', path: 'shared/public/index.html', required: true },
    { name: '学生端 student.html', path: 'shared/public/student.html', required: true },
    { name: '编辑器 editor.html', path: 'shared/public/editor.html', required: true },
    { name: '离线页面 offline.html', path: 'apps/shared/offline.html', required: true },
    { name: '管理页面 admin.html', path: 'apps/shared/admin.html', required: true },
    { name: '引擎主文件', path: 'packages/engine/src/00-globals.js', required: true },
    { name: '服务器主文件', path: 'packages/server/index.js', required: true },
    { name: '教师端主进程', path: 'apps/teacher/electron/main.js', required: true },
    { name: '学生端主进程', path: 'apps/student/electron/main.js', required: true },
    { name: '编辑器主进程', path: 'apps/editor/electron/main.js', required: true },
];

let missingFiles = [];
checks.forEach(check => {
    const fullPath = path.join(__dirname, check.path);
    const exists = fs.existsSync(fullPath);
    const status = exists ? '✅' : '❌';
    console.log(`  ${status} ${check.name}`);
    if (check.required && !exists) {
        missingFiles.push(check.name);
    }
});

if (missingFiles.length > 0) {
    console.log(`\n⚠️  发现 ${missingFiles.length} 个缺失的必需文件！`);
    console.log('  缺失文件:', missingFiles.join(', '));
}
console.log();

// 3. 检查服务器配置
console.log('📋 检查服务器配置:');
const serverIndexPath = path.join(__dirname, 'packages/server/index.js');
if (fs.existsSync(serverIndexPath)) {
    const serverContent = fs.readFileSync(serverIndexPath, 'utf8');

    const hasEngineRoute = serverContent.includes("app.use('/engine', express.static(engineDir))");
    const hasStaticDir = serverContent.includes('express.static(staticDir)');
    const hasHealthEndpoint = serverContent.includes('/api/health');

    console.log(`  ${hasEngineRoute ? '✅' : '❌'} /engine 静态路由配置`);
    console.log(`  ${hasStaticDir ? '✅' : '❌'} 静态文件服务配置`);
    console.log(`  ${hasHealthEndpoint ? '✅' : '❌'} 健康检查端点`);

    if (!hasEngineRoute || !hasStaticDir || !hasHealthEndpoint) {
        console.log('  ⚠️  服务器配置不完整，可能导致启动失败');
    }
} else {
    console.log('  ❌ 服务器文件不存在');
}
console.log();

// 4. 检查学生端配置
console.log('📋 检查学生端配置:');
const studentMainPath = path.join(__dirname, 'apps/student/electron/main.js');
if (fs.existsSync(studentMainPath)) {
    const studentContent = fs.readFileSync(studentMainPath, 'utf8');

    const offlineRefCorrect = studentContent.includes("path.join(__dirname, '../../shared/offline.html')");
    const adminRefCorrect = studentContent.includes("path.join(__dirname, '../../shared/admin.html')");

    console.log(`  ${offlineRefCorrect ? '✅' : '❌'} 离线页面引用路径正确`);
    console.log(`  ${adminRefCorrect ? '✅' : '❌'} 管理页面引用路径正确`);

    if (!offlineRefCorrect || !adminRefCorrect) {
        console.log('  ⚠️  学生端页面路径不正确，可能导致离线页面加载失败');
    }
} else {
    console.log('  ❌ 学生端主进程文件不存在');
}
console.log();

// 5. 检查配置文件路径
console.log('📋 检查配置文件路径:');
const configPath = path.join(__dirname, 'packages/server/src/config.js');
if (fs.existsSync(configPath)) {
    const configContent = fs.readFileSync(configPath, 'utf8');
    const hasCorrectPaths = configContent.includes('../../../shared/public');

    console.log(`  ${hasCorrectPaths ? '✅' : '❌'} 配置文件使用正确的共享目录路径`);

    if (!hasCorrectPaths) {
        console.log('  ⚠️  配置文件路径不正确，可能导致资源加载失败');
    }
} else {
    console.log('  ❌ 配置文件不存在');
}
console.log();

// 6. 检查端口占用
console.log('📋 检查常用端口:');
const http = require('http');
const ports = [3000, 3001];

ports.forEach(port => {
    const server = http.createServer();
    server.on('error', () => {
        console.log(`  ⚠️  端口 ${port} 可能被占用`);
    });
    server.on('listening', () => {
        console.log(`  ✅ 端口 ${port} 可用`);
        server.close();
    });
    server.listen(port, '127.0.0.1');
});
console.log();

// 7. 诊断结果和建议
console.log('='.repeat(60));
console.log('📝 诊断结果和建议:\n');

const issues = [];

if (missingFiles.length > 0) {
    issues.push({
        severity: '🔴 严重',
        issue: '缺少必需文件',
        solution: '请检查项目结构是否完整，或运行迁移脚本'
    });
}

if (!fs.existsSync(serverIndexPath) || !fs.readFileSync(serverIndexPath, 'utf8').includes("app.use('/engine', express.static(engineDir))")) {
    issues.push({
        severity: '🔴 严重',
        issue: '服务器配置不完整',
        solution: '服务器缺少 /engine 路由配置，请修复 packages/server/index.js'
    });
}

if (!fs.readFileSync(studentMainPath, 'utf8').includes("path.join(__dirname, '../../shared/offline.html')")) {
    issues.push({
        severity: '🟡 警告',
        issue: '学生端页面路径不正确',
        solution: '学生端离线页面和管理页面的引用路径需要修复'
    });
}

if (!fs.existsSync(configPath) || !fs.readFileSync(configPath, 'utf8').includes('../../../shared/public')) {
    issues.push({
        severity: '🟡 警告',
        issue: '配置文件路径不正确',
        solution: '服务器配置文件的共享目录路径需要修复'
    });
}

if (issues.length === 0) {
    console.log('✅ 未发现明显问题！项目配置正常。\n');
    console.log('🚀 可以尝试启动应用:');
    console.log('  npm run start:teacher  # 启动教师端');
    console.log('  npm run start:student  # 启动学生端');
    console.log('  npm run start:editor   # 启动编辑器\n');
} else {
    console.log(`发现 ${issues.length} 个问题:\n`);
    issues.forEach((issue, index) => {
        console.log(`${index + 1}. ${issue.severity} - ${issue.issue}`);
        console.log(`   解决方案: ${issue.solution}\n`);
    });

    console.log('💡 建议:');
    console.log('  1. 先修复严重问题（🔴）');
    console.log('  2. 再处理警告问题（🟡）');
    console.log('  3. 重新运行此脚本验证修复效果\n');
}

console.log('📖 更多帮助:');
console.log('  - STUDENT-CONFIG.md - 学生端连接问题解决方案');
console.log('  - QUICKSTART-FIXED.md - 快速启动指南');
console.log('  - REFACTORING_SUMMARY.md - 项目重构总结\n');

console.log('='.repeat(60));
