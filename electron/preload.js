// ========================================================
// Electron 预加载脚本 - 安全桥接主进程与渲染进程
// ========================================================
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // 学生端：通知主进程课堂已开始（全屏置顶）
    classStarted: () => ipcRenderer.send('class-started'),
    // 学生端：通知主进程课堂已结束（恢复普通窗口）
    classEnded: () => ipcRenderer.send('class-ended'),
    // 获取配置（教师机 IP 等）
    getConfig: () => ipcRenderer.invoke('get-config'),
    // 保存配置（管理员页面使用）
    saveConfig: (config) => ipcRenderer.invoke('save-config', config),
    // 验证管理员密码
    verifyPassword: (pwd) => ipcRenderer.invoke('verify-password', pwd),
    // 获取角色（teacher / student）
    getRole: () => ipcRenderer.invoke('get-role'),
});
