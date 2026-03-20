// ========================================================
// 卸载学生端 Windows 服务（需要管理员权限运行）
// 使用方法：以管理员身份运行 node electron/service-uninstall.js
// ========================================================
const path = require('path');

try {
    const { Service } = require('node-windows');

    const svc = new Service({
        name: 'SyncClassroom Student',
        script: path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe'),
    });

    svc.on('uninstall', () => {
        console.log('[Service] 服务已卸载');
    });

    svc.on('error', (err) => {
        console.error('[Service] 错误:', err);
    });

    svc.uninstall();
} catch (e) {
    console.error('[Service] node-windows 未安装或不可用:', e.message);
    process.exit(1);
}
