// ========================================================
// 学生端管理员页面测试脚本
// ========================================================

console.log('🧪 学生端管理员页面测试\n');

// 1. 检查管理员页面文件
const fs = require('fs');
const path = require('path');

console.log('📋 检查文件:');
const adminPath = path.join(__dirname, 'apps/shared/admin.html');
const offlinePath = path.join(__dirname, 'apps/shared/offline.html');
const preloadPath = path.join(__dirname, 'apps/common/electron/preload.js');
const studentMainPath = path.join(__dirname, 'apps/student/electron/main.js');

const files = [
    { name: '管理员页面', path: adminPath },
    { name: '离线页面', path: offlinePath },
    { name: 'Preload 脚本', path: preloadPath },
    { name: '学生端主进程', path: studentMainPath }
];

files.forEach(file => {
    const exists = fs.existsSync(file.path);
    const status = exists ? '✅' : '❌';
    console.log(`  ${status} ${file.name}`);
});

console.log('\n');

// 2. 检查 preload.js 中的 API
console.log('📋 检查 preload.js API:');
if (fs.existsSync(preloadPath)) {
    const preloadContent = fs.readFileSync(preloadPath, 'utf8');
    const requiredAPIs = [
        'getConfig',
        'saveConfig',
        'verifyPassword',
        'getAutostart',
        'setAutostart'
    ];

    requiredAPIs.forEach(api => {
        const hasAPI = preloadContent.includes(`${api}:`);
        const status = hasAPI ? '✅' : '❌';
        console.log(`  ${status} ${api}`);
    });
}
console.log('\n');

// 3. 检查学生端主进程的 IPC 处理器
console.log('📋 检查学生端 IPC 处理器:');
if (fs.existsSync(studentMainPath)) {
    const studentContent = fs.readFileSync(studentMainPath, 'utf8');
    const requiredHandlers = [
        "ipcMain.handle('get-config'",
        "ipcMain.handle('save-config'",
        "ipcMain.handle('verify-password'",
        "ipcMain.handle('get-autostart'",
        "ipcMain.handle('set-autostart'"
    ];

    requiredHandlers.forEach(handler => {
        const hasHandler = studentContent.includes(handler);
        const status = hasHandler ? '✅' : '❌';
        const name = handler.match(/'([^']+)'/)[1];
        console.log(`  ${status} ${name}`);
    });
}
console.log('\n');

// 4. 检查管理员窗口的 preload 引用
console.log('📋 检查管理员窗口配置:');
if (fs.existsSync(studentMainPath)) {
    const studentContent = fs.readFileSync(studentMainPath, 'utf8');

    // 查找管理员窗口创建部分
    const adminWindowMatch = studentContent.match(/adminWindow = new BrowserWindow\(\{[\s\S]*?\}\);/);
    if (adminWindowMatch) {
        const config = adminWindowMatch[0];
        const hasCorrectPreload = config.includes("preload: path.join(__dirname, '../../common/electron/preload.js')");
        const status = hasCorrectPreload ? '✅' : '❌';
        console.log(`  ${status} Preload 路径配置正确`);

        if (!hasCorrectPreload) {
            console.log('  ⚠️  Preload 路径不正确！');
            if (config.includes('preload.js')) {
                console.log('  💡 应该是: ../../common/electron/preload.js');
            }
        }
    } else {
        console.log('  ❌ 未找到管理员窗口配置');
    }
}
console.log('\n');

// 5. 检查管理员页面 HTML
console.log('📋 检查管理员页面功能:');
if (fs.existsSync(adminPath)) {
    const adminContent = fs.readFileSync(adminPath, 'utf8');

    const checks = [
        { name: '密码输入框', pattern: /id="login-pwd"/ },
        { name: '验证按钮', pattern: /onclick="doLogin\(\)"/ },
        { name: '登录函数', pattern: /function doLogin\(\)/ },
        { name: '配置界面', pattern: /id="screen-config"/ },
        { name: 'IP 输入框', pattern: /id="cfg-ip"/ },
        { name: '端口输入框', pattern: /id="cfg-port"/ },
        { name: '保存按钮', pattern: /onclick="saveConfig\(\)"/ },
        { name: '退出按钮', pattern: /onclick="quitApp\(\)"/ }
    ];

    checks.forEach(check => {
        const hasCheck = check.pattern.test(adminContent);
        const status = hasCheck ? '✅' : '❌';
        console.log(`  ${status} ${check.name}`);
    });
}
console.log('\n');

// 6. 总结
console.log('='.repeat(60));
console.log('📝 测试总结:\n');

let issues = [];

if (!fs.existsSync(adminPath)) issues.push('管理员页面文件不存在');
if (!fs.existsSync(preloadPath)) issues.push('Preload 脚本文件不存在');
if (!fs.existsSync(studentMainPath)) issues.push('学生端主进程文件不存在');

const preloadContent = fs.existsSync(preloadPath) ? fs.readFileSync(preloadPath, 'utf8') : '';
const studentContent = fs.existsSync(studentMainPath) ? fs.readFileSync(studentMainPath, 'utf8') : '';

if (studentContent && !studentContent.includes("preload: path.join(__dirname, '../../common/electron/preload.js')")) {
    issues.push('管理员窗口的 preload 路径不正确');
}

if (issues.length === 0) {
    console.log('✅ 所有检查通过！管理员页面应该可以正常工作。\n');
    console.log('🚀 测试步骤:');
    console.log('  1. 启动学生端: npm run start:student');
    console.log('  2. 按 Ctrl+Shift+A 打开管理员窗口');
    console.log('  3. 输入默认密码: admin123');
    console.log('  4. 点击"验证"按钮\n');
    console.log('如果仍然无法进入，请检查:');
    console.log('  - 查看学生端日志: ~/.lumesync/logs/');
    console.log('  - 按 Ctrl+Shift+D 打开开发者工具查看错误\n');
} else {
    console.log(`❌ 发现 ${issues.length} 个问题:\n`);
    issues.forEach((issue, index) => {
        console.log(`  ${index + 1}. ${issue}`);
    });
    console.log('\n请修复这些问题后再试。');
}

console.log('\n' + '='.repeat(60));
