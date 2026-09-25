// 教室中继（relay）契约。
//
// 设计：docs/architecture/teacher-cross-platform-relay.md
//   - 验证码配对（pairing.js）：8 位数字、3 分钟、5 次尝试、绑定请求与设备；
//   - 授课租约（lease.js）：单租约、epoch 递增、超时进入等待教师；
//   - 固定机状态机（state.js）：关闭 / 等待连接 / 验证中 / 授课中 / 错误，以及发现 TXT；
//   - 缓冲（queue.js）：提交转发队列与按 hash 的课件暂存，容量与过期明确拒绝。
//
// 这些模块是纯逻辑（时间与随机数可注入），Hub 负责接传输、持久化与凭证签发。

const pairing = require('./pairing');
const lease = require('./lease');
const state = require('./state');
const queue = require('./queue');
const events = require('./events');

module.exports = {
    ...pairing,
    ...lease,
    ...state,
    ...queue,
    ...events
};
