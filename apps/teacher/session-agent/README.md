# @lumesync/teacher-session-agent

LumeSync 教师端会话代理：教师桌面应用（Windows/macOS）与教师 UI 共用的课堂客户端，一个客户端覆盖两种模式。

- `direct` —— 连本机教室 Hub（host token），用契约里已声明的旧事件名发课堂命令。
- `relay` —— mDNS 搜索教室 → 配对候选连接 → 验证码证明 → 带设备凭证重连 → 唯一授课租约 →
  HTTP 上传课件 → `course:stage` / `course:publish` → `classroom:command`（带 `leaseId` + `epoch`）→ 提交落盘回执。

业务 UI 不再自己拼 Hub URL、不自己维护重连、不接触 socket.io 对象。协议、事件表、守卫、信封、错误码、
配对证明与租约语义全部来自 [`@lumesync/classroom-protocol`](../../packages/classroom-protocol/README.md)，
课件校验与内容 hash 来自 [`@lumesync/course-format`](../../packages/course-format/README.md)。

- 设计：[跨平台教师端与教室中继模式](../../docs/architecture/teacher-cross-platform-relay.md) §3/§4/§6/§7
- 参考（公开 API、事件、错误码、安全约束、已知限制）：[教师端会话代理](../../docs/reference/session-agent.md)
- 对端：[教室 Hub](../../apps/classroom-hub/README.md) · [教室 Hub 参考](../../docs/reference/classroom-hub.md)

## 用法（中继模式）

```js
const { createSessionAgent } = require('@lumesync/teacher-session-agent');

const agent = createSessionAgent({
    mode: 'relay',
    deviceKey: 'teacher-laptop-01',       // ≥ 8 字符，会写进配对请求并绑定设备凭证
    deviceName: '教师笔记本',              // 固定机屏幕上显示的名字
    classroomsDir: app.getPath('userData') // 可选：记住搜到过的教室，供手动连接
});

agent.on('status', (payload) => ui.setStatus(payload));
agent.on('snapshot', (payload) => ui.applySnapshot(payload));
agent.on('submission', (payload) => ui.addSubmission(payload));
agent.on('error', (error) => ui.showError(error.code, error.message));

const classrooms = await agent.discover({ timeoutMs: 3000 });
await agent.connect({ classroomId: classrooms[0].classroomId, address: classrooms[0].address, port: classrooms[0].port });

const request = await agent.requestPairing();  // 固定机屏幕此时显示验证码
await agent.submitPairingCode(await ui.askTeacherForCode()); // 验证码只在本地参与 HMAC

await agent.acquireLease();
await agent.publishCourse({ courseId: 'lesson-01', filePath: '/courses/lesson-01.lume' });
await agent.selectCourse('lesson-01');
await agent.setSlide(2);

const pending = agent.getPendingSubmissions();  // 确认落盘后回执，学生才看到最终成功
for (const item of pending) await agent.ackSubmission(item.submissionId);

await agent.endSession();                       // 释放租约 → 固定机作废本次设备凭证
```

直接模式只需 `hubUrl` + `hostToken`，其余入口相同：

```js
const agent = createSessionAgent({
    mode: 'direct',
    deviceKey: 'teacher-laptop-01',
    hubUrl: 'http://127.0.0.1:3000',
    hostToken: process.env.LUMESYNC_HOST_TOKEN
});
await agent.connect();
await agent.selectCourse('lesson-01');
```

## 硬性约束

1. **验证码只由人从固定机屏幕上读取**：代理永不获取、回显、记录验证码；它只在本地参与 HMAC 证明计算。
2. **凭证与租约只在内存**：设备凭证、租约、配对 `nonce` 不写磁盘；`endSession()` / 释放租约后清除。
3. **失败一律是类型化错误** `{code, message, attemptsLeft?}`：契约码原样保留，客户端本地情况用 `agent_` 前缀，绝不透出 socket.io 对象。
4. **过期快照直接丢弃**：同一 `sessionId` 下 `revision` 更小的快照不覆盖本地状态；`sessionId` 变化（Hub 重启）会广播 `session-reset` 并放弃失效租约。
5. **重连自己管**：`reconnection: false`，退避重连后拉权威快照并续租；租约过期**不自动重新获取**（必须重新走一次验证码授权）。
6. **协议版本只放在握手 `auth` 里**：不能作为 socket.io 顶层选项，否则会撞上 node `ws` 的 WebSocket 协议版本。

## 文件

| 文件 | 说明 |
| --- | --- |
| `src/agent.js` | 会话代理主体：状态、快照 revision 防护、配对、租约、发布、命令、提交、生命周期 |
| `src/transport.js` | socket.io 连接与握手等待、带超时的 ack、socket 选项 |
| `src/discovery.js` | mDNS 浏览侧：TXT 校验、按协议主版本过滤、合并多网卡重复结果；生产传输基于 bonjour-service |
| `src/registry.js` | 本机教室登记表（`classrooms.json`）：只存公开发现信息，原子替换写入 |
| `src/commands.js` | 类型化命令 ↔ 直接模式事件名、学生事件清单、本地状态更新 |
| `src/errors.js` | 类型化错误与错误码归一 |
| `src/backoff.js` | 重连退避与续租调度的纯函数（可注入时钟与随机数） |

## 测试

```bash
node --test apps/teacher/session-agent/test/*.test.js   # 或在根目录：pnpm run test:session-agent
```

- `unit-*.test.js`：假 socket / 假 Hub / 假时钟，覆盖配对、租约、断线重连、快照防护、课件上传中止、提交去重、发现与登记表、错误归一。
- `integration-agent.test.js`：**真实 Hub**（真实 Express + Socket.IO + course-format + 真实 HTTP 引导凭证），只有发现传输是注入的；覆盖中继闭环与直接模式。
