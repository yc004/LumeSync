# @lumesync/classroom-hub

LumeSync 教室 Hub：课堂状态的单一写入者 + HTTP / Socket.IO 网关。一个服务、两种部署模式：

- `direct`（默认，`LUMESYNC_HUB_MODE=direct`）：运行在教师电脑，host 用 `LUMESYNC_HOST_TOKEN` 直连（与现有教师服务同形）。
- `relay`（`LUMESYNC_HUB_MODE=relay`）：运行在教室固定台式机；教师自带电脑用验证码配对后签发的短期设备凭证接入并取得唯一授课租约，学生始终连接固定地址。

协议、角色、事件表、守卫、信封、凭证与中继逻辑全部来自 [`@lumesync/classroom-protocol`](../../packages/classroom-protocol/README.md)；
课件校验与内容 hash 来自 [`@lumesync/course-format`](../../packages/course-format/README.md)。本包不重新实现这些逻辑。

- 设计：[跨平台教师端与教室中继模式](../../docs/architecture/teacher-cross-platform-relay.md)
- 参考（路由、事件、环境变量、持久化、已知限制）：[教室 Hub](../../docs/reference/classroom-hub.md)

## 运行

```bash
LUMESYNC_HUB_MODE=relay PORT=3000 \
LUMESYNC_HUB_CLASSROOM_ID=room-101 LUMESYNC_HUB_CLASSROOM_NAME=三年级一班 \
LUMESYNC_HOST_TOKEN=<本机管理凭证> LUMESYNC_HUB_TOKEN_SECRET=<凭证签名密钥> \
node apps/classroom-hub/index.js      # 或在根目录：pnpm run start:hub
```

## 作为库使用

```js
const { createHub, browseClassroomRelays, createBonjourTransport } = require('@lumesync/classroom-hub');

const hub = await createHub({ port: 0 });        // 只组装；port 0 = 系统分配
await hub.start();
// hub.app / hub.server / hub.io / hub.classroom / hub.relay / hub.discovery / hub.submissions
await hub.stop();

// 教师端（未来的 session-agent）搜索教室：按协议主版本过滤并合并多网卡重复结果
const relays = await browseClassroomRelays({
    transport: createBonjourTransport(),
    timeoutMs: 3000
});
```

发现传输是可注入的 `{publish, unpublish, browse, destroy}`：测试用假传输，生产用 `createBonjourTransport()`（bonjour-service）。
组播不可用时发布失败只记录到 `/api/hub/status` 的 `discovery.lastError` 并继续服务，手动输入地址是文档化的降级入口。

## 文件

| 文件 | 说明 |
| --- | --- |
| `src/hub.js` | 组装：配置、课堂状态、中继域、发现、Express、Socket.IO、生命周期与清理定时器 |
| `src/routes.js` | HTTP：健康检查、协议描述、会话引导、Hub 状态、屏幕（含验证码）、课件暂存、缓存清理 |
| `src/socket.js` | 握手、配对/租约/命令/发布/提交处理器、学生事件通用转发 |
| `src/relay.js` | 中继域：配对绑定、设备凭证、租约联动、暂存归属、命令幂等 |
| `src/classroom.js` | 课堂状态（课程/页码/设置/`revision`/`sessionId`）与契约快照 |
| `src/classroom-controller.js` | 类型化命令 → 状态迁移 + 广播事件 |
| `src/submissions.js` | 提交队列的归属与「入队 → 转发 → 落盘 → 最终成功」 |
| `src/discovery.js` | mDNS 发布/取消发布、TXT 安全检查、教师端搜索助手 |
| `src/discovery-bonjour.js` | 生产发现传输（bonjour-service，延迟创建套接字） |
| `src/protocol.js` `src/http-auth.js` `src/config.js` `src/logger.js` `src/utils.js` | 契约接入、HTTP 授权、配置、日志（不打印任何秘密）、小工具 |

## 测试

```bash
node --test apps/classroom-hub/test/*.test.js    # 或在根目录：pnpm run test:hub
```

用例启动真实 Hub（端口 0）、真实 Socket.IO 客户端与真实 `fetch`；只有发现传输与时钟是注入的。
