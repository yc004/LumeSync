// ========================================================
// 恢复原版管理员页面
// ========================================================

const fs = require('fs');
const path = require('path');

const adminPath = path.join(__dirname, 'apps/shared/admin.html');
const backupPath = path.join(__dirname, 'apps/shared/admin.html.backup');

console.log('🔧 恢复原版管理员页面\n');

if (fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, adminPath);
    console.log('✅ 已恢复原版管理员页面');
} else {
    console.log('❌ 备份文件不存在！');
}

console.log('\n' + '='.repeat(60));
