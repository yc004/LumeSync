# 共享契约包

状态：**已落地首轮**（2026-09-25）。本页描述根工作区 `packages/` 下三个契约包的内容、接入点与验证方式。
它们对应[目标架构](../architecture/target-architecture.md)第 6 节的模块归属，
是迁移顺序中"抽出共享契约"这一步的实际产物。

## 包与职责

| 包 | 职责 | 主要消费方 |
| --- | --- | --- |
| [`@lumesync/classroom-protocol`](../../packages/classroom-protocol/README.md) | 协议版本与协商、角色矩阵、入站/出站事件表、HTTP 路由授权表、消息信封、课堂快照、入站守卫 | 教师服务、教师页面、学生页面、未来的教室 Hub |
| [`@lumesync/course-format`](../../packages/course-format/README.md) | `.lume` manifest schema 与校验、ZIP 读写与安全限制、内容 hash、旧脚本课件迁移 | 教师服务（课程扫描、导入）、编辑器与播放器（后续接入） |
| [`@lumesync/native-contract`](../../packages/native-contract/README.md) | 原生桥消息封装与回执、按角色的动作能力清单、教师/学生桥类型 | 两端页面、C++ 原生壳（对照校验）、未来的 Electron preload |

三个包都不发布到 npm，通过 pnpm 工作区（`workspace:*`）被 `repos/teacher` 与 `repos/student` 引用；
`pnpm-workspace.yaml` 中的 `packages/*` 是它们的工作区入口。

## 已经接入的位置

| 位置 | 接入方式 |
| --- | --- |
| `repos/teacher/server/src/protocol.js` | 版本协商、入站守卫、`session:accepted` / `protocol-rejected` / 快照构造、`/api/protocol` 的协议描述 |
| `repos/teacher/server/src/socket.js` | 连接时协商版本并按角色挂载 `socket.use` 守卫；合法事件照常进入原有处理器 |
| `repos/teacher/server/src/http-auth.js` | 路由授权改为查 `classroom-protocol` 的路由表，删除了本地正则 |
| `repos/teacher/server/src/classroom-state.js` | 快照由 `createClassroomSnapshot` 构造，字段与客户端理解一致 |
| `repos/teacher/server/src/courses.js` | `.lume` 校验改为 `course-format` 的同步校验器；损坏课件进入目录结果的 `invalid` |
| `repos/teacher/server/src/teacher-shell-build.js` | 生成 `/protocol-client.js`，把协议版本与事件清单注入页面 |
| `repos/teacher/shared/teacher-shell/src/{api-fetch.ts,app.tsx}` | 凭证包装器装到 `window.fetch`；握手带上 `protocolVersion`，处理 `session:accepted` / `protocol-rejected` |
| `repos/teacher/shared/public/student-app.js` | 同上（学生课堂页仍由教师仓库托管，见迁移状态）；并按 `revision` 消费 `classroom:snapshot`：课程或页码与服务端不一致时以服务端为准，过期快照丢弃 |
| `repos/teacher/shared/protocol/teacher-host.ts`、`repos/student/shared/protocol/student-host.ts`、`repos/student/ui/student-host/src/types.d.ts` | 只再从 `native-contract` 导出类型，不再各自定义 |
| `repos/teacher/scripts/legacy-lume-migrator.js` | 旧迁移脚本变为 `course-format` 的兼容层 |

## 本轮修掉的两个实际缺陷

1. **会话引导被授权中间件挡住。** `apiRouter` 挂在 `/api` 上并带 host 授权中间件，
   `/api/session/bootstrap` 又由 `server/index.js` 处理，于是"写请求一律要求 host"的兜底规则
   先返回 403：viewer 与 host 都领不到凭证。现在路由表把该路径标为 `bootstrap`，
   由处理器自己执行"本机 + `X-LumeSync-Host-Token`"或"签发 viewer 凭证"的规则。
   回归用例：`repos/teacher/server/tests/session-bootstrap.test.js`。
2. **教师页面的凭证包装器没有装到全局。** 原来只在打包后的 IIFE 里遮蔽 `fetch`，
   内联脚本与课件运行时拿到的仍是原生 `fetch`；构建产物过期时页面会在"路由要求凭证"下静默失败。
   现在同时设置 `window.__LumeSyncApiFetch` 与 `window.fetch`。

## 尚未完成

| 项目 | 现状 |
| --- | --- |
| 目标事件命名（`course:select`、`slide:set`、`submission:create`…） | 已在事件表中登记映射，服务端仍只发当前事件名；需要双发过渡窗口 |
| `requestId` 幂等去重与命令回执 | 契约提供 `createCommandAck`，服务端尚未对所有命令回执 |
| `classroomId` / `epoch`（授课租约） | 契约有字段，教室中继模式未实现，因此没有实际使用 |
| `course-format` 在播放器与编辑器中的复用 | 教师服务已用；浏览器运行时仍走 Core 内的旧 `validateLumeManifest` |
| `native-contract` 的版本字段 | 契约要求消息带 `version`，两端 C++ 壳尚未发送；能力清单对照测试会暴露漂移 |
| `course-runtime`、`teacher-platform` | 尚未创建 |

## 验证方式

```bash
pnpm run test:contracts        # 三个契约包的用例
pnpm run test:teacher-server   # 教师服务用例（含协议握手、引导回归与授权回归）
pnpm run test                  # 以上两者
```

契约包测试包括：ESM/CJS 导出一致性、事件表角色矩阵与当前处理器行为一致、
路由授权表与既有 `http-auth` 断言一致、ZIP 路径/大小/压缩比限制、迁移可复现性，
以及 C++ 壳动作分派与能力清单的一致性对照。

教师服务侧另有两组面向真实客户端的回归用例：`client-payload-contract.test.js`
按教师页/学生页/Core 的真实调用点校验 payload 不被契约误伤；
`api-authorization.test.js` 用真实 HTTP 请求确认大小写、尾斜杠、HEAD 与非标准方法
都不能绕过 host 授权。
