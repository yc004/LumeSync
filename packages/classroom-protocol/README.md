# @lumesync/classroom-protocol

LumeSync 课堂协议的共享契约。教师服务（以及未来的教室 Hub）、教师页面和学生页面共用这一份定义，
不再各自维护事件名、角色矩阵和协议版本字面量。

对应设计：[三端目标架构](../../docs/architecture/target-architecture.md) 第 4 节。

## 内容

| 模块 | 说明 |
| --- | --- |
| `src/version.js` | `PROTOCOL_VERSION`、版本协商。缺少版本字段的客户端按 legacy(0) 处理，声明了更高版本则明确拒绝 |
| `src/roles.js` | `host` / `viewer` 归一（`teacher`→`host`、`student`→`viewer`）与角色判断 |
| `src/events.js` | 入站/出站事件表：允许的角色、payload schema、`status`（current/legacy/planned）、目标架构命名映射 |
| `src/routes.js` | HTTP 路由授权表：`public` / `host` / `bootstrap`，取代正则猜测 |
| `src/envelope.js` | 统一信封 `{protocolVersion, classroomId, sessionId, requestId, revision, epoch, sentAt, payload}`、命令回执、课堂快照 |
| `src/guard.js` | `authorizeEvent` 与 Socket.IO 中间件守卫；带 ack 的非法事件会直接回执而不是静默丢弃 |
| `src/validate.js` | 依赖无关的最小 schema 校验器（字符串/数字/数组/对象/枚举/长度上限） |

## 使用

```js
const { negotiateProtocol, authorizeEvent, createInboundGuard } = require('@lumesync/classroom-protocol');
```

服务端接入示例（`apps/teacher/server/src/protocol.js`）：

```js
const negotiation = protocol.negotiateConnection(socket);   // 版本协商
protocol.attachInboundGuard(socket, role);                  // 角色 + payload 校验
socket.emit('session:accepted', protocol.buildSessionAccepted({ ... }));
```

页面侧不直接 import 本包（教师页面由 Babel 拼接编译，没有模块解析），
服务端用 `buildProtocolClient()` 生成 `/protocol-client.js`，页面读 `window.LumeSyncProtocol`。

## 测试

```bash
node --test packages/classroom-protocol/test/*.test.js
# 或在仓库根目录：pnpm run test:contracts
```

测试覆盖：版本协商分支、事件角色矩阵、payload 校验、路由授权表（含 `/api/session/bootstrap` 回归用例）、
信封与快照、ESM/CJS 入口一致性。
