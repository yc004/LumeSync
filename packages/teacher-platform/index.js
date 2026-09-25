// @lumesync/teacher-platform
//
// 教师端平台能力接口：文件选择/导入导出、提交目录、日志、窗口、全屏与
// 本地受保护会话凭证。业务 UI 只依赖这一层，具体由 WebView2（过渡）或
// Electron（目标）适配器实现，见 docs/architecture/teacher-cross-platform-relay.md §3。

const iface = require('./src/interface');
const adapters = require('./src/adapters');

module.exports = {
    ...iface,
    ...adapters
};
