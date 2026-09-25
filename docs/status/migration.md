# 目标架构迁移状态

更新：2026-09-25。本页记录[目标架构](../architecture/target-architecture.md)与[跨平台教师端设计](../architecture/teacher-cross-platform-relay.md)的实际落地情况。旧审查报告仍保留原始问题证据；已改动项以本页和当前参考文档为准。**当前不是已完成的新三端架构**。

| 工作项 | 状态 | 当前结果与缺口 |
| --- | --- | --- |
| 教师 Socket 身份 | 已完成首轮加固 | host/viewer 必须携有效凭证；拒绝按 IP 回退；`register-dependencies` 和旧 `annotation-add` 要求 host。尚无设备配对、凭证撤销和轮换。 |
| Windows 教师壳 bootstrap | 已同步修改 | 本机 WinHTTP 请求带 host 凭证；第二窗口可用已保存会话重试。Windows 实机编译尚未验证。 |
| 课堂基础状态 | 已完成首轮集中 | 当前课程和页码由单一状态模块持有；连接/切换时发布带 `sessionId`、`revision` 的快照。设置、投票、提交和监看仍分散，快照尚未持久化。 |
| 旧编辑器/插件构建入口 | 已退出根工作区 | 根工作区和命令不再构建旧 AI Editor 与 VS Code 插件；`.gitmodules` 仍声明这两个历史子模块，留待后续仓库迁移。 |
| HTTP 业务授权与路径安全 | 首轮完成，并修复引导路径与绕过缺口 | 写入及敏感读取路由由 [共享路由表](../reference/contracts.md)判定 host bearer；教师 UI 的凭证包装器现同时装到 `window.fetch` 与 `window.__LumeSyncApiFetch`；**修复** `/api/session/bootstrap` 被路由中间件挡住的缺陷（此前 viewer 与 host 均领不到凭证）；**修复**路由表大小写敏感导致的绕过（`GET /api/SUBMISSIONS/...` 曾落到公开兜底，可读他人提交与课件），并让 HEAD、尾斜杠与非标准方法统一按 host 兜底。viewer 资源授权、通用依赖代理策略、课件隔离与存储配额尚未完成。 |
| 共享课件/协议契约 | 首轮完成 | 新增 `packages/classroom-protocol`、`packages/course-format`、`packages/native-contract` 与 `docs/reference/contracts.md`；教师服务完成版本协商、事件守卫、路由表与课件校验接入，教师/学生页面通过 `/protocol-client.js` 取得协议版本。目标事件命名、`requestId` 幂等回执、`classroomId`/`epoch` 尚未使用。 |
| 教师/学生页面协议握手 | 已接入 | 连接声明 `protocolVersion`；不兼容版本收到 `protocol-rejected` 并断开；服务端发 `session:accepted`（含 `sessionId`、`revision`）与 `classroom:snapshot`；学生页按 `revision` 应用快照恢复课程与页码，教师页记录权威 `sessionId`/`revision` 供排查。 |
| 原生桥契约 | 契约已固化，壳未改 | `native-contract` 定义消息封装、回执与按角色能力清单；对照测试发现教师壳 `classStarted`/`classEnded`/`setFullscreen` 与学生壳 `maximizeWindow` 在 C++ 中未分派，调用被静默丢弃，需在原生壳补齐。 |
| Windows/macOS 教师桌面 | 未完成 | 现有教师壳仍是 Windows C++/WebView2。 |
| 教室中继、自动发现、验证码、租约 | 契约层完成，传输与桌面端未开始 | `packages/classroom-protocol/src/relay/` 已提供：8 位验证码配对（CSPRNG、3 分钟、5 次尝试、绑定请求与设备、HMAC 握手证明）、唯一授课租约与 `epoch` 递增、固定机状态机与发现 TXT、提交转发队列（容量满明确拒绝、`submission:delivered` 后才释放副本）、按 `courseHash` 的课件暂存与发布；事件表新增 `scope` 区分直接/中继。尚未实现：`apps/classroom-hub`（mDNS 广播、WSS 网关、课件上传与凭证签发）、教师端 session-agent、TLS 与证书分发。 |
| 学生课堂 UI 归位 | 已完成（改为分发构建产物） | 正式课堂页移到学生端工作区包 `repos/student/ui/classroom`（`@lumesync/student-ui`）：`src/classroom-app.js`、`src/index.html` 按原字节迁移，`scripts/build.mjs` 产出 `dist/<version>/`（版本 = 包版本 + 构建输入内容哈希）、`dist/manifest.json` 与 `dist/current.json`。教师仓库删除 `shared/public/student.html`、`shared/public/student-app.js`，依赖改为 `@lumesync/student-ui: workspace:*`，新增稳定入口 `GET /student.html` 与版本化路径 `GET /classroom/<version>/*`（可用 `LUMESYNC_STUDENT_UI_DIR` 覆盖产物目录）；产物缺失时返回 503 并给出预期路径与构建命令，不回退旧副本。仍缺：学生 Windows 壳按版本路径做原生校验、教师端 Windows 打包脚本（`native/package-native.ps1`）尚未把 `repos/student/ui/classroom/dist` 暂存进安装包（打包产物里只能靠 `LUMESYNC_STUDENT_UI_DIR` 指向外部产物，否则服务器会明确报 503）、两机实测；页面仍在浏览器里由 Babel Standalone 编译（`/lib/babel.min.js` 由教师服务提供）。 |
| 新编辑器 | 未开始 | 旧 AI Editor 和 VS Code 插件不作为新架构基础。 |
| 可复现版本与跨端验收 | 部分改善 | 根工作区 `pnpm run test` 现覆盖契约包、学生课堂 UI 构建产物与教师服务（含协议握手、课程目录、会话引导回归、学生 UI 分发）；学生/Core 检出仍与锁定指针不一致，Windows/macOS 构建与多机联调未验证。 |

迁移应按“可构建基线 → 授权和隔离 → 共享契约 → 跨平台直接模式 → 中继模式 → 新编辑器”的依赖顺序推进。某个代码入口通过单元测试不等于整端功能完成；每项需分别经过桌面构建、多机课堂操作和异常恢复验证。
