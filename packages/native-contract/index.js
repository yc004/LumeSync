// @lumesync/native-contract
//
// 页面 ↔ 原生壳（WebView2 消息桥，未来 Electron preload IPC）的共享契约：
// 消息封装与回执形状、RPC 超时、按角色的动作能力清单，以及供 C++ 壳与
// 页面共同遵守的校验函数。

const bridge = require('./src/bridge');
const capabilities = require('./src/capabilities');

module.exports = {
    ...bridge,
    ...capabilities
};
