# 功能清单、证据与限制

日期：2026-09-25。本页区分**源码中存在的入口**、**运行验证状态**与**目标设计**。源码审查覆盖教师端、学生端、Core 和遗留 VS Code 插件；学生端/Core 与上级锁定提交不一致，旧 AI Editor 未检出。未完成 Windows 构建及三端集成测试。

| 功能 | 当前源码依据 | 验证状态 |
| --- | --- | --- |
| 教师端课程扫描、文件夹、导入导出、选课和翻页 | `repos/teacher/server/src/routes.js`、`socket.js`、`shared/teacher-shell/src` | 课程扫描与 `.lume` 校验已有自动化测试；端到端连课未做 |
| 教室座位布局、在线状态和异常日志 | 教师 UI、`server/src/routes.js` 与 `socket.js` | 入口已定位；数据一致性与重启恢复未验证 |
| 学生课堂页面、课件展示、提交与互动 | `repos/teacher/shared/public/student.html`、`student-app.js`；学生壳在 `repos/student/native/shell` | 页面实际归教师仓库；两机实测未完成 |
| 批注、投票、截图监看和电源控制 | 教师 UI、`server/src/socket.js`、学生壳 | 事件与 UI 入口已定位；鉴权与原生桥存在已知风险 |
| ZIP `.lume` 包与 TSX 页面播放 | `repos/teacher/core/src/browser/engine/runtime/app.tsx`；格式校验见 `packages/course-format` | 服务端校验已测试；播放路径的格式兼容与不可信课件隔离未验证 |
| 课堂会话与协议版本握手 | `repos/teacher/server/src/protocol.js`、`packages/classroom-protocol` | 已有自动化测试（版本协商、越权拒绝、快照 revision、引导回归） |
| 教师/学生 Windows 桌面壳 | 两端 `native/shell`、CMake/打包脚本 | 源码已审查；Windows 实际构建未运行 |
| 文档站与下载站 | `docs-site/`、`website/` | 源码已审查；下载站和 CI 有已知缺陷 |

## 目标设计，当前未实现

| 功能 | 设计文档 |
| --- | --- |
| Windows/macOS 共用教师端 | [跨平台教师端](../architecture/teacher-cross-platform-relay.md) |
| 教师自带电脑经固定机中继授课 | [教室中继模式](../architecture/teacher-cross-platform-relay.md) |
| 局域网自动发现、固定机显示验证码、教师电脑输入后连接 | [自发现与验证码接入](../architecture/teacher-cross-platform-relay.md#5-局域网自发现与验证码接入) |
| 全新独立编辑器、共享课件格式和隔离播放器 | [三端目标架构](../architecture/target-architecture.md) |

旧 AI Editor 与 VS Code 插件均已退出目标架构。它们的历史源码或文档仅用于现状回溯，不代表推荐使用的制课流程。

## 已确认问题

- 根仓锁定的学生端与 Core 提交不可从当前可访问的远端取得；见[子模块状态](../status/submodules.md)。
- 教师服务的依赖代理策略、viewer 资源授权、课件隔离与原生桥来源校验仍未完成；原生壳缺少动作白名单，且有两个动作在 C++ 中未分派；见[共享契约包](contracts.md)、[原生桥](native-bridge.md)与[源码级评估](../architecture/source-review.md)。
- 发布工作流和下载站存在旧路径、子模块初始化及资源名称不一致等问题；见[根仓审查](../status/audit.md)。
- 根仓缺少统一许可证文件；分发条件需维护者确认。
