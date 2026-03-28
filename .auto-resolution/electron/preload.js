// ========================================================
// Electron 预加载脚本 - 安全桥接主进程与渲染进程
// ========================================================
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // 学生端：通知主进程课堂已开始（全屏置顶）
    classStarted: (opts) => ipcRenderer.send('class-started', opts),
    // 学生端：通知主进程课堂已结束（恢复普通窗口）
    classEnded: () => ipcRenderer.send('class-ended'),
    // 教师端远程控制学生端全屏开关
    setFullscreen: (enable) => ipcRenderer.send('set-fullscreen', enable),
    // 获取配置（教师机 IP 等）
    getConfig: () => ipcRenderer.invoke('get-config'),
    // 保存配置（管理员页面使用）
    saveConfig: (config) => ipcRenderer.invoke('save-config', config),
    // 验证管理员密码
    verifyPassword: (pwd) => ipcRenderer.invoke('verify-password', pwd),
    // 获取角色（teacher / student）
    getRole: () => ipcRenderer.invoke('get-role'),
    // 学生端：手动触发重连
    manualRetry: () => ipcRenderer.send('manual-retry'),
    // 学生端：接收教师端推送的新管理员密码 hash
    setAdminPassword: (hash) => ipcRenderer.send('set-admin-password', hash),
    // 教师端：读取/保存课堂设置
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    // 教师端：导入课程文件（弹出文件选择对话框，复制到 courses 目录）
    importCourse: () => ipcRenderer.invoke('import-course'),
    // 教师端：导出课程文件（从 courses 目录导出到本地）
    exportCourse: (payload) => ipcRenderer.invoke('export-course', payload),
    // 教师端：切换全屏
    toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
    // 调试：切换开发者工具
    toggleDevTools: () => ipcRenderer.send('toggle-devtools'),
    // 学生端：读取/设置开机自启动
    getAutostart: () => ipcRenderer.invoke('get-autostart'),
    setAutostart: (enable) => ipcRenderer.invoke('set-autostart', enable),
    // 教师端：打开日志目录
    openLogDir: () => ipcRenderer.invoke('open-log-dir'),
    getLogDir: () => ipcRenderer.invoke('get-log-dir'),
    // 教师端：选择提交内容存储目录
    selectSubmissionDir: () => ipcRenderer.invoke('select-submission-dir'),
    // 窗口控制：最小化、最大化/还原、关闭
    minimizeWindow: () => ipcRenderer.send('minimize-window'),
    maximizeWindow: () => ipcRenderer.send('maximize-window'),
    closeWindow: () => ipcRenderer.send('close-window'),
    // 窗口状态监听
    onWindowMaximized: (callback) => ipcRenderer.on('window-maximized', callback),
    onWindowUnmaximized: (callback) => ipcRenderer.on('window-unmaximized', callback),
    removeWindowMaximizedListener: (callback) => ipcRenderer.removeListener('window-maximized', callback),
    removeWindowUnmaximizedListener: (callback) => ipcRenderer.removeListener('window-unmaximized', callback),
    // AI 课件编辑器功能
    saveCourse: (data) => ipcRenderer.invoke('save-course', data),
    openCourseFile: () => ipcRenderer.invoke('open-course-file'),
    saveCourseFile: (data) => ipcRenderer.invoke('save-course-file', data),
    editorLog: (payload) => ipcRenderer.invoke('editor-log', payload),
    // AI 配置
    getAIConfig: () => ipcRenderer.invoke('get-ai-config'),
    saveAIConfig: (config) => ipcRenderer.invoke('save-ai-config', config),
    testAIConnection: (payload) => ipcRenderer.invoke('test-ai-connection', payload),
    // AI 聊天
    proxyAIChat: (payload) => ipcRenderer.send('proxy-ai-chat', payload),
    onAIChatData: (requestId, callback) => ipcRenderer.on(`ai-chat-data-${requestId}`, callback),
    onAIChatError: (requestId, callback) => ipcRenderer.on(`ai-chat-error-${requestId}`, callback),
    removeAIChatDataListener: (requestId, callback) => ipcRenderer.removeListener(`ai-chat-data-${requestId}`, callback),
    removeAIChatErrorListener: (requestId, callback) => ipcRenderer.removeListener(`ai-chat-error-${requestId}`, callback)
});
