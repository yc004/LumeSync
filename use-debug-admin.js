// ========================================================
// 启用调试版管理员页面
// ========================================================

const fs = require('fs');
const path = require('path');

const adminPath = path.join(__dirname, 'apps/shared/admin.html');
const adminDebugPath = path.join(__dirname, 'apps/shared/admin-debug.html');
const backupPath = path.join(__dirname, 'apps/shared/admin.html.backup');

console.log('🔧 启用调试版管理员页面\n');

// 备份原文件
if (fs.existsSync(adminPath) && !fs.existsSync(backupPath)) {
    fs.copyFileSync(adminPath, backupPath);
    console.log('✅ 已备份原管理员页面到: admin.html.backup');
}

// 复制调试版
if (fs.existsSync(adminDebugPath)) {
    fs.copyFileSync(adminDebugPath, adminPath);
    console.log('✅ 已启用调试版管理员页面');
    console.log('\n📝 调试版特点:');
    console.log('  - 详细的日志输出');
    console.log('  - electronAPI 可用性检查');
    console.log('  - 异步错误捕获');
    console.log('  - 操作步骤跟踪');
    console.log('\n🚀 现在可以启动学生端测试:');
    console.log('  npm run start:student');
    console.log('\n按 Ctrl+Shift+A 打开管理员窗口，查看页面底部的调试日志。');
} else {
    console.log('❌ 调试版管理员页面不存在！');
}

console.log('\n💡 恢复原版:');
console.log('  node restore-admin.js');
console.log('\n' + '='.repeat(60));
