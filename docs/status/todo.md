# 代码审查与实施 TODO

审查日期：2026-09-27。范围：根工作区的 `apps/`、`packages/`、`website/`、`docs-site/`、构建工作流，以及教师、学生、Core 源码。2026-09-27 已按[源码迁移记录](submodules.md)并入根仓；下列产品能力和实机验收待办仍适用。本页记录的是当前工作区，不代表已发布版本。

## 当前基线

- 共享课堂协议、课件格式、原生桥与教师平台契约已有实现和测试；教师服务已接入部分协议、授权与课件校验。学生课堂 UI 位于 `apps/student/ui/classroom`，由教师服务分发。
- 教室 Hub 的直接/中继模式、发现、配对、唯一租约、课件暂存和提交转发，以及教师会话代理均已实现首轮并有真实 HTTP/Socket.IO 集成测试。固定机投影网页也已存在。
- Electron 教师桌面壳可加载现有教师 UI，当前只接本机直接模式。Electron 课件编辑器支持标准组件、受限声明式 `.lumex` 组件、`.lume` 打包、静态预览和用户自带模型 API 的候选审查。
- 本次执行 `pnpm run test`、`pnpm run docs:check` 均通过。测试不能代替安装包、双机网络、旧课件和 Windows 原生壳验收。
- 教师端 `ea2c0bd`、学生端 `e8d5c78`、Core `35bec94` 已作为普通源码导入 `apps/` 与 `packages/`；仍需验证该组合的安装和运行兼容性。

## P0：先建立可交付、可安全联调的基线

- [ ] **T01 验证三端版本组合。** 来源提交已记录；用代表性 `.lume`、PDF 和互动课件做 Windows 双机连课、翻页、断线恢复、提交及导出烟测。完成条件：CI 能从根仓单次检出复现构建，实机结果与失败样本入库。依据：[源码迁移记录](submodules.md)、[渲染评估](../architecture/course-rendering.md)。
- [ ] **T02 重建教师/学生 Windows 发布链。** 旧 `release.yml`、`build-branch.yml` 因错误路径和失效构建命令已移除；根仓现有 CI 运行测试、文档构建，编辑器有单独安装包构建入口。按当前 CMake/NSIS 脚本建立教师与学生的 Windows 安装包工作流，补回学生卸载密码校验构建步骤（当前缺少 `verify-password.js`），并从干净检出验证安装、卸载与资产命名。依据：[根仓审查](audit.md)、[开发指南](../development/contributing.md)。
- [ ] **T03 封闭旧课件执行与原生桥信任边界。** Core 旧 TSX/JS 分支仍在课堂页面使用 Babel 与 `new Function`；C++ WebView2 消息分派缺完整来源、动作和版本校验。先给旧内容隔离兼容环境，再迁入共享播放器；两个原生壳按 `native-contract` 校验来源、消息版本、动作和参数。完成条件：不可信课件不能访问宿主 DOM、Socket 或原生能力；合法旧课仍可播放。依据：[源码评估](../architecture/source-review.md)、[原生桥](../reference/native-bridge.md)、[渲染评估](../architecture/course-rendering.md)。
- [ ] **T04 收紧教师服务剩余授权面。** 补 viewer 资源授权、依赖 URL/图片代理目标策略、凭证撤销和轮换；按角色与资源归属做回归。现有 host HTTP/Socket 加固是首轮实现，不能把局域网中的任意客户端当作可信。依据：[运行机制](../architecture/runtime-mechanisms.md)、[HTTP API](../reference/http-api.md)。
- [ ] **T05 给中继模式建立受验证的 TLS/WSS。** 设计离线教室的证书签发、固定机身份确认与教师/学生信任引导，并在跨机连接时禁止明文凭证。现有 Hub 用 `http.createServer`，验证码证明需要安全传输层。完成条件：证书首次接入、续期、失效和错误提示均有两机验收。依据：[中继设计](../architecture/teacher-cross-platform-relay.md)、[Hub 参考](../reference/classroom-hub.md)。
- [ ] **T06 持久化固定机关键状态。** Hub 的课堂快照、租约/epoch、已发布课件、暂存元数据和待落盘提交目前在内存；进程重启会丢失。定义可恢复边界与原子存储，尤其保证未确认提交不被虚报成功或静默丢失。完成条件：断电/重启/升级后队列和课堂状态按文档恢复，重复投递幂等。依据：[Hub 参考](../reference/classroom-hub.md)、[迁移状态](migration.md)。

## P1：完成三端架构主链路

- [ ] **T07 将 `session-agent` 接入教师桌面和 UI。** 提供教室搜索/手动地址、验证码配对、租约状态与交接、课件发布、提交最终落盘回执；把 UI 的课堂连接抽为 `ClassroomConnection`，覆盖直接与中继模式。完成条件：Windows/macOS 教师桌面经固定机与真实学生端完成一节课。依据：[教师桌面壳](../../apps/teacher/desktop/README.md)、[会话代理](../reference/session-agent.md)。
- [ ] **T08 完成教师 UI 平台接口迁移。** 逐个把 `window.teacherHost`/`window.electronAPI` 调用改成 `window.LumeSyncPlatform`，补齐目录选择、全屏、日志、导入导出等能力；对 Windows WebView2 与 Electron 执行相同的能力回归。依据：[平台包](../../packages/teacher-platform/README.md)、[跨平台设计](../architecture/teacher-cross-platform-relay.md)。
- [ ] **T09 完成固定机产品化。** 让投影页成为可自启、全屏、崩溃自恢复的 kiosk；提供固定机安装、升级、日志、备份与停止/恢复流程；配对新请求增加 IP/设备级全局限速。投影网页本身已实现，勿重复开发。依据：[Hub 参考](../reference/classroom-hub.md)。
- [ ] **T10 把课堂业务状态收敛到 Hub。** 当前 Hub 不维护批注、投票结果和最新监看状态，`annotation:get` 仅转发，投票缺结果回流。定义授权、聚合、快照和断线重放，完成条件：教师交接/学生重连后这些状态可一致恢复。依据：[中继设计](../architecture/teacher-cross-platform-relay.md)、[Hub 参考](../reference/classroom-hub.md)。
- [ ] **T11 完成协议迁移。** 对目标事件名建立兼容窗口，逐步加入每个命令的 `requestId` 去重与回执；直接模式补课堂 ID/epoch 语义，并明确旧客户端的退出条件。依据：[共享契约](../reference/contracts.md)、[目标架构](../architecture/target-architecture.md)。
- [ ] **T12 建立统一课程运行时。** 将浏览器端校验对齐 `course-format`，补运行版本/依赖完整性检查、课程实例生命周期、取消与 dispose、失败回滚和资源缓存上限；创建共享的隔离 `course-player`/`course-runtime`。完成条件：编辑器预览、教师播放、学生播放对同一产物一致，快速切课不回写旧结果。依据：[渲染评估](../architecture/course-rendering.md)、[编辑器设计](../architecture/editor-design.md)。
- [ ] **T13 完成学生壳与课堂 UI 的版本交付。** 在 Windows 安装器中验证版本化 UI 路径、manifest 和 Core 组合；缺产物时明确失败，不能静默回退到过期页面。依据：[迁移状态](migration.md)、[功能清单](../reference/features.md)。

## P2：编辑器、扩展与交付体验

- [ ] **T14 实现编辑器目标内容模型。** 补图片/视频/字体/数据资源、主题 token、布局/插槽、互动组件与访问性校验；当前四种标准组件及 `.lumex` 无脚本模板只覆盖首轮。完成条件：保存/重开/离线课堂播放后资源与组件锁保持一致。依据：[编辑器设计](../architecture/editor-design.md)、[扩展设计](../architecture/course-content-extensions.md)。
- [ ] **T15 实现代码页和可执行插件的隔离构建链。** 建立 `course-build`、权限化扩展 API、按版本/hash 锁定的产物、离线分发与导出适配；先完成 T03/T12 的运行隔离，再允许代码扩展。当前 `.lumex` CLI 和声明式模板已存在，勿把它称作任意代码插件。依据：[扩展设计](../architecture/course-content-extensions.md)、[编辑器设计](../architecture/editor-design.md)。
- [ ] **T16 补齐编辑器工作流。** 页面树拖放/分组、画布缩放和选中、资源面板、诊断定位、教师/学生/导出三种预览、外部文件变更检测、发布报告，以及给教师端的本地交接。当前静态 HTML 预览不等于课堂播放器。依据：[编辑器设计](../architecture/editor-design.md)。
- [ ] **T17 完成旧课件迁移。** 对旧 TSX/JS 包做只读检查、兼容播放、显式迁移报告与原件备份；不能把 `course-format` 的旧脚本迁移工具等同于完整可编辑迁移。依据：[编辑器设计](../architecture/editor-design.md)、[课件格式](../reference/course-format-sdk.md)。
- [ ] **T18 扩展 Agent 使用控制。** 增加多服务配置/能力适配、流式进度、预算与用量、材料发送授权及来源标记、长课件分阶段审查；保持候选命令的类型校验和用户接受门槛。依据：[Agent 设计](../architecture/editor-agent.md)。
- [ ] **T19 完成桌面发行验收。** 编辑器已有 macOS DMG/ZIP、Windows NSIS 配置及双平台构建入口，但安装、文件关联、离线启动、签名/公证仍需真实产物验证；教师桌面及固定机也需独立安装链。依据：[编辑器指南](../getting-started/editor.md)、[迁移状态](migration.md)。
- [ ] **T20 修复下载站发布链。** 统一页面与服务端资产名；修正仓库名匹配、旧插件 webhook 分支、资产 URL 来源校验、下载失败与并发更新；只在资产校验并原子落盘后更新版本索引。依据：[根仓审查](audit.md)、[下载站](../../website/server.js)。
- [ ] **T21 明确许可证与可复现构建环境。** 根仓许可证/第三方再分发清单需维护者确定；图标脚本改用项目自有 `environment.yml`（明确环境名与 Python 版本），CI 使用同一 Conda 环境。依据：[根仓审查](audit.md)。
- [ ] **T22 分批落实客户端 UI 标准。** 先修学生课堂的响应式/滚动、教师机房视图的键盘与目标尺寸，再统一编辑器、学生管理页和固定机投影的 token、状态与反馈。每批按窗口尺寸、对比度、键盘和减少动效验收；现有界面不能因规范发布而自动视为达标。依据：[客户端 UI 标准](../design/client-ui-standard.md)、[迁移清单](../design/ui-migration.md)。

## 文档归纳与维护 TODO

**正式入口**：根 [README](../../README.md) 说明产品与启动；[文档目录](../README.md) 列出当前维护页。`docs/` 是正文唯一来源；`docs-site/content/` 中 27 个对应页面由 `docs-site/scripts/sync-content.mjs` 生成，另有独立站点首页。改正文后运行 `pnpm run docs:sync`，不要单独编辑镜像。

| 文档组 | 数量 | 用途与可信边界 |
| --- | ---: | --- |
| `docs/getting-started/` | 2 | 当前运行和新编辑器操作；实机未验收处以状态页为准 |
| `docs/design/` | 2 | 客户端 UI 规范与现有界面迁移清单；新界面和实质改版须遵守 |
| `docs/architecture/` | 9 | 当前机制、源码评估与**目标设计**混合；设计中的接口/目录不能直接当成已实现 API |
| `docs/reference/` | 9 | 当前接口、格式、配置和功能证据；随代码变更更新 |
| `docs/development/` | 1 | 工作区、测试、构建与贡献流程 |
| `docs/status/` | 4 | 审查、迁移、源码迁移记录与本 TODO；最适合查询完成度 |
| `docs/archive/` | 68 | 审查前编号文档、旧站点、旧开发/用户/组件/互动/AI/项目材料；只供历史追溯 |
| `apps/`、`packages/` 的 README | 按模块分布 | 模块局部 API/运行说明；与正式状态页矛盾时应核对源码 |
| `apps/teacher/`、`apps/student/` 内文档 | 导入时保留 | 各模块实现说明与历史用户文档；不由根仓文档站同步，当前操作以根仓文档为准 |

- [ ] **D01 逐页校准剩余状态描述。** 本轮已更正[源码迁移记录](submodules.md)、[功能清单](../reference/features.md)、[共享契约](../reference/contracts.md)及 `packages/teacher-platform/README.md` 的明显矛盾。继续核对[迁移状态](migration.md)及架构页中的历史提交、旧插件和“尚未实施”表述；明确“源码存在/测试通过/实机验收”三层状态。
- [ ] **D02 清理目标设计中的历史状态。** 旧三端图解已从当前导航移除，旧版仍可在[归档资料](../archive/README.md)回溯；[目标架构](../architecture/target-architecture.md)末尾仍需逐项更新落地状态，避免把已完成的目录迁移写成“尚未实施”。
- [ ] **D03 为每项主链路建立可复查验收记录。** 版本矩阵、Windows/macOS 安装、双机课堂、断线/重启、旧课兼容、TLS、资源隔离都需记录测试设备、提交、产物和结果；自动化单测通过不应自动勾选对应产品 TODO。

推荐阅读顺序：[当前功能与限制](../reference/features.md) → [迁移状态](migration.md) → 本 TODO → 对应[架构设计](../architecture/target-architecture.md)和[接口参考](../reference/contracts.md)。旧资料先看[归档说明](../archive/README.md)。
