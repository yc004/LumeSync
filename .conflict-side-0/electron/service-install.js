// ========================================================
// 将学生端注册为 Windows 服务（需要管理员权限运行）
// 使用方法：以管理员身份运行 node electron/service-install.js
// ========================================================
const path = require('path');

try {
    const { Service } = require('node-windows');

    const svc = new Service({
        name: 'SyncClassroom Student',
        description: '互动课堂学生端守护服务',
        script: path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe'),
        scriptOptions: path.join(__dirname, 'main-student.js'),
        // 崩溃后自动重启
        wait: 2,
        grow: 0.5,
        maxRestarts: 10,
    });

    svc.on('install', () => {
        console.log('[Service] 安装成功，正在启动服务...');
        svc.start();
    });

    svc.on('start', () => {
        console.log('[Service] 服务已启动');
    });

    svc.on('error', (err) => {
        console.error('[Service] 错误:', err);
    });

    svc.install();
} catch (e) {
    console.error('[Service] node-windows 未安装或不可用:', e.message);
    console.error('请先运行: npm install node-windows');
    process.exit(1);
}
