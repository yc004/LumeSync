# LumeSync（萤火课堂）

LumeSync 是面向局域网教室的互动课件工作区。教师端管理课程与课堂，学生端接收状态并参与互动；课件运行时负责播放 `.lume` 课件。本仓库组合子模块，提供统一脚本、共享契约包、文档站、下载站源码和新课件编辑器首轮实现。

> **源码状态（2026-09-26）**：教师端和 VS Code 插件已检出到根仓锁定提交。学生端与教师端内的 Core 已取得当前远端源码，但根仓锁定的提交在可取得的远端历史中缺失，因而版本不匹配。旧 AI Editor 和 VS Code 插件均不纳入目标架构；AI Editor 未克隆，旧插件仅保留作现状审查。详见[子模块状态](docs/status/submodules.md)。共享契约包（`packages/`）已完成首轮落地并有自动化测试；教室 Hub（`apps/classroom-hub`）已完成首轮落地，支持直接模式与教室中继模式（验证码配对、唯一授课租约、课件暂存、提交转发、mDNS 自发现），并带固定机只读投影界面（`GET /projector`，本机可开、显示配对码），但**没有 TLS、没有持久化**；教师端会话代理（`apps/teacher/session-agent`）已完成首轮落地。新课件编辑器（`apps/editor`）已有 Electron MVP、用户自带模型 API Agent，以及受限声明式 `.lumex` 组件导入和离线播放；任意代码插件、旧格式 Babel 隔离替换、锁定版本对齐与跨平台实机验收仍未完成。Electron 教师桌面壳已在 macOS 上运行源码预览，复用现有 React 教师界面；中继模式尚未接入桌面壳，跨机实测未完成。

## 功能

| 模块 | 既有文档描述的用途 | 本次验证 |
| --- | --- | --- |
| 教师端 | 课程管理、课堂控制、HTTP/Socket 服务、提交收集 | macOS Electron 源码预览已运行；发行包和跨机验收未完成 |
| 学生端 | 连接教师机、展示课件、互动和提交；正式课堂 UI 归本仓 `repos/student/ui/classroom`（`@lumesync/student-ui`），构建成版本化产物由教师服务分发 | 源码已检出，版本不匹配；课堂 UI 构建与教师侧分发有自动化测试，两机实测未做 |
| Core | `.lume` 渲染及通用运行时控制 | 源码位于 `repos/teacher/core`，版本不匹配 |
| 共享契约包 | 课堂协议、课件格式与原生桥的单一契约来源 | 已落地，`pnpm run test:contracts` 覆盖 |
| 教室 Hub | 课堂状态单一写入者与实时网关；直接模式在教师电脑，中继模式在教室固定机 | 已落地（HTTP + Socket.IO + mDNS 发现 + 固定机只读投影界面），`pnpm run test:hub` 覆盖；无 TLS、无持久化 |
| 教师端会话代理 | 教师端课堂客户端：搜索、验证码配对、授课租约、课件上传、命令与提交回执（[参考](docs/reference/session-agent.md)） | 已落地（`apps/teacher/session-agent`），`pnpm run test:session-agent` 覆盖（40 单元 + 4 集成，集成驱动真实 Hub）；中继模式未接入桌面壳 |
| Electron 教师桌面壳 | macOS/Windows 源码预览：复用现有 React 教师界面并自起本机教师服务（[参考](docs/reference/native-bridge.md#electron-教师桌面壳)） | 已在 macOS 实测直接模式选课、翻页与结束课程；`pnpm run test:teacher-desktop` 覆盖来源与路径守卫；安装包、签名与 Windows 实机未验证 |
| 新课件编辑器 | 独立 Electron 编辑器与 Agent 创作入口（[设计](docs/architecture/editor-design.md)） | 首轮支持标准组件及无脚本 `.lumex` 模板组件导入、属性编辑、精确 hash 锁、`.lume` 离线封装和 Core 白名单 JSON 渲染；Agent 支持用户填写的 OpenAI Chat Completions 兼容 API，结果经类型化命令校验后待审；代码插件、旧格式安全隔离、锁定版本和跨平台发行验收未完成 |
| AI Editor | 旧编辑器，退出目标架构 | 按用户要求未克隆 |
| VS Code 插件 | 旧 `.lume` 编辑和预览入口，退出目标架构 | 源码已检出，仅作现状审查 |
| 文档站 | Nextra / Next.js 文档 | 本仓源码已静态审查 |
| 下载站 | 页面与 GitHub Release webhook 缓存服务 | 本仓源码已静态审查 |

目前没有端到端运行验证结果。[功能清单与限制](docs/reference/features.md) 说明每项能力的证据。

## 仓库结构

```text
.
├── repos/
│   ├── teacher/          # Git 子模块；含工作区包 teacher/core
│   ├── student/          # Git 子模块；含工作区包 student/ui/classroom（正式课堂 UI）与 student/ui/student-host
│   ├── ai-editor/        # 历史子模块声明，未检出，不进入目标架构
│   └── editor-plugin/    # 历史子模块声明，未检出，不进入目标架构
├── apps/
│   ├── classroom-hub/    # 教室 Hub（`@lumesync/classroom-hub`）：direct / relay 两种模式的课堂服务；projector/ 是固定机只读投影界面
│   ├── editor/           # 新课件编辑器 Electron 壳、创作 Agent 与编辑服务
│   └── teacher/          # 教师端领域应用：session-agent（课堂客户端）与 desktop（Electron 源码预览壳）
├── packages/             # 共享包：课堂契约、课件格式/模型/组件扩展与原生桥契约
├── docs/                 # 当前文档与历史资料
├── docs-site/            # Nextra 文档站
├── website/              # 下载站
├── types/                # 课件 SDK 类型声明
├── .github/workflows/     # CI 与发布
├── package.json          # 根脚本
└── pnpm-workspace.yaml   # 工作区包路径
```

`.gitmodules` 声明四个子模块，但当前只检出 `teacher` 与 `student`。Core 的工作区路径为 `repos/teacher/core`，不是根仓的第五个子模块；旧文档中的 `repos/core` 已失效。

## 快速开始

前提：Git、Node.js、pnpm 10.33.0。Windows 桌面壳另需 C++/CMake/WebView2 环境；具体版本待子模块复核。

```bash
git clone https://github.com/yc004/SyncClassroom.git
cd SyncClassroom
git submodule status
```

当前有子模块锁定提交不可取得；以下初始化命令可能失败，应先阅读[子模块状态](docs/status/submodules.md)，不要将远端最新提交当成已验证组合：

```bash
git submodule update --init --recursive
```

常用命令（需要相应子模块）：

```bash
pnpm run start:hub             # 教室 Hub（LUMESYNC_HUB_MODE=direct|relay）
pnpm run start:teacher-server  # 教师服务
pnpm run start:teacher         # 教师桌面端
pnpm run start:teacher:desktop # macOS/Windows Electron 教师端源码预览
pnpm run start:editor          # 新课件编辑器 Electron MVP
pnpm run start:student         # 学生桌面端
pnpm run start:core            # 独立 Core runtime
pnpm run build:student-ui      # 学生课堂 UI 构建产物（教师服务分发；缺产物时 /student.html 返回 503）
pnpm run docs:dev              # 文档站
pnpm run test:hub              # 教室 Hub 测试（真实 Express + Socket.IO + course-format 课件）
pnpm run test:session-agent    # 教师端会话代理测试（单元 + 真实 Hub 集成）
pnpm run test:teacher-desktop  # Electron 桌面壳守卫测试（页面来源 + 课件路径）
pnpm run test:editor           # 编辑器格式往返、Agent 安全和候选草稿测试
pnpm run test                  # 契约包 + 编辑器 + 学生课堂 UI + 教师服务 + 教室 Hub + 会话代理 + 教师桌面壳
```

桌面端启动命令需要 Windows 构建产物。完整步骤见 [安装与运行](docs/getting-started/running.md)。

## 架构与文档

当前教师机提供课程内容和课堂状态，学生端连接教师服务；Core 提供渲染和通用运行时能力。Electron 教师端已有直接模式源码预览，固定机中继模式仍待桌面接入。[三端架构图解](docs/architecture/three-end-architecture.md) 展示现状，[目标架构](docs/architecture/target-architecture.md) 说明设计。

- [文档目录](docs/README.md)
- [功能清单与限制](docs/reference/features.md)
- [共享契约包](docs/reference/contracts.md)
- [审查报告与待修问题](docs/status/audit.md)
- [源码级架构评估与改进建议](docs/architecture/source-review.md)
- [三端目标架构设计（语言、框架、通信协议与图表）](docs/architecture/target-architecture.md)
- [跨平台教师端与教室中继模式设计](docs/architecture/teacher-cross-platform-relay.md)
- [当前通信、身份与运行机制](docs/architecture/runtime-mechanisms.md)
- [HTTP API](docs/reference/http-api.md) · [Socket.IO 事件](docs/reference/socket-events.md) · [WebView2 原生桥](docs/reference/native-bridge.md)
- [教室 Hub（直接模式 / 教室中继模式）](docs/reference/classroom-hub.md)
- [教师端会话代理](docs/reference/session-agent.md)
- [课件格式与 SDK](docs/reference/course-format-sdk.md) · [配置与环境变量](docs/reference/configuration.md)
- [文档站](docs-site/content/index.mdx)：从 `docs/` 当前文档同步生成；旧 API、Socket 与课件示例已归档

## 贡献与许可

业务代码在对应子模块维护，共享契约在 `packages/` 维护，根仓记录子模块提交指针；见 [开发指南](docs/development/contributing.md)。根仓未见 `LICENSE` 文件，使用与再分发条件需要维护者确认。
