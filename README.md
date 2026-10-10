# LumeSync（萤火课堂）

LumeSync 是面向局域网教室的互动课件工作区。教师端管理课程与课堂，学生端接收状态并参与互动；课件运行时负责播放 `.lume` 课件。教师端、学生端和原 Core 源码已并入本仓的 pnpm 工作区。

> **源码状态（2026-09-27）**：教师、学生、Core 已从各自锁定提交导入根仓；来源记录见[源码迁移记录](docs/status/submodules.md)。共享契约、教室 Hub、教师会话代理和新课件编辑器已有首轮实现及自动化测试；Hub 有本机只读投影页，但没有 TLS 和持久化，教师桌面仍未接入中继模式。编辑器支持受限声明式 `.lumex` 组件与用户自带模型 API，代码插件、旧课件隔离和跨平台安装实测仍缺。后续工作见[实施 TODO](docs/status/todo.md)。

## 功能

| 模块 | 既有文档描述的用途 | 本次验证 |
| --- | --- | --- |
| 教师端 | 课程管理、课堂控制、HTTP/Socket 服务、提交收集 | macOS Electron 源码预览已运行；发行包和跨机验收未完成 |
| 学生端 | 连接教师机、展示课件、互动和提交；正式课堂 UI 位于 `apps/student/ui/classroom`（`@lumesync/student-ui`），构建成版本化产物由教师服务分发 | 课堂 UI 构建与教师侧分发有自动化测试，两机实测未做 |
| Core | `.lume` 渲染及通用运行时控制 | 源码位于 `packages/course-runtime`（包名暂为 `@lumesync/core`）；旧 TSX/JS 仍走 Babel 与 `new Function` |
| 共享契约包 | 课堂协议、课件格式与原生桥的单一契约来源 | 已落地，`pnpm run test:contracts` 覆盖 |
| 教室 Hub | 课堂状态单一写入者与实时网关；直接模式在教师电脑，中继模式在教室固定机 | 已落地（HTTP + Socket.IO + mDNS 发现 + 固定机只读投影界面），`pnpm run test:hub` 覆盖；无 TLS、无持久化 |
| 教师端会话代理 | 教师端课堂客户端：搜索、验证码配对、授课租约、课件上传、命令与提交回执（[参考](docs/reference/session-agent.md)） | 已落地（`apps/teacher/session-agent`），`pnpm run test:session-agent` 覆盖（40 单元 + 4 集成，集成驱动真实 Hub）；中继模式未接入桌面壳 |
| Electron 教师桌面壳 | macOS/Windows 源码预览：复用现有 React 教师界面并自起本机教师服务（[参考](docs/reference/native-bridge.md#electron-教师桌面壳)） | 已在 macOS 实测直接模式选课、翻页与结束课程；`pnpm run test:teacher-desktop` 覆盖来源与路径守卫；安装包、签名与 Windows 实机未验证 |
| 新课件编辑器 | 独立 Electron 编辑器与 Agent 创作入口（[设计](docs/architecture/editor-design.md)） | 首轮支持标准组件及无脚本 `.lumex` 模板组件导入、属性编辑、精确 hash 锁、`.lume` 离线封装和 Core 白名单 JSON 渲染；Agent 支持用户填写的 OpenAI Chat Completions 兼容 API，结果经类型化命令校验后待审；代码插件、旧格式安全隔离、锁定版本和跨平台发行验收未完成 |
| AI Editor | 旧编辑器，退出目标架构 | 按用户要求未克隆 |
| VS Code 插件 | 旧 `.lume` 编辑和预览入口，退出目标架构 | 当前未检出，历史审查记录在归档文档中 |
| 文档站 | Nextra / Next.js 文档 | 本仓源码已静态审查 |
| 下载站 | 页面与 GitHub Release webhook 缓存服务 | 本仓源码已静态审查 |

目前没有三端跨机端到端验收结果。[功能清单与限制](docs/reference/features.md) 说明每项能力的证据。

## 仓库结构

```text
.
├── apps/
│   ├── classroom-hub/    # server/ 与 projector/：直接/中继课堂服务和固定机投影
│   ├── editor/           # app/：Electron 编辑器、UI 与 Agent
│   ├── student/          # desktop/：Windows 壳；ui/：课堂与本机页面
│   └── teacher/          # desktop/：Electron；ui/：教师页面；server/、session-agent/ 与 native/
├── packages/             # 课堂协议、课件格式、course-runtime、组件扩展及平台契约
├── docs/                 # 当前文档与历史资料
├── docs-site/            # Nextra 文档站
├── website/              # 下载站
├── types/                # 课件 SDK 类型声明
├── .github/workflows/     # CI 与发布
├── package.json          # 根脚本
└── pnpm-workspace.yaml   # 工作区包路径
```

当前代码不再使用 Git 子模块。原仓库提交来源和路径对应关系见[源码迁移记录](docs/status/submodules.md)。

## 快速开始

前提：Git、Node.js、pnpm 10.33.0。Windows 原生桌面壳另需 C++/CMake/WebView2 环境。

```bash
git clone https://github.com/yc004/LumeSync.git
cd LumeSync
pnpm install --frozen-lockfile
```

常用命令：

```bash
pnpm run start:hub             # 教室 Hub（LUMESYNC_HUB_MODE=direct|relay）
pnpm run start:teacher-server  # 教师服务（只跑 HTTP/Socket.IO，不开桌面窗口）
pnpm run start:teacher:desktop # 教师端 Electron 桌面壳（macOS / Windows 源码预览）
pnpm run start:teacher         # 教师端 Windows 原生壳（仅 Windows，需先构建）
pnpm run start:editor          # 新课件编辑器 Electron MVP
pnpm run start:student         # 学生端 Windows 原生壳（仅 Windows，需先构建）
pnpm run build:student-ui      # 学生课堂 UI 构建产物（教师服务分发；缺产物时 /student.html 返回 503）
pnpm run docs:dev              # 文档站
pnpm run test:hub              # 教室 Hub 测试（真实 Express + Socket.IO + course-format 课件）
pnpm run test:session-agent    # 教师端会话代理测试（单元 + 真实 Hub 集成）
pnpm run test:teacher-desktop  # Electron 桌面壳守卫测试（页面来源 + 课件路径）
pnpm run test:editor           # 编辑器格式往返、Agent 安全和候选草稿测试
pnpm run test                  # 契约包 + 编辑器 + 学生课堂 UI + 教师服务 + 教室 Hub + 会话代理 + 教师桌面壳
```

`start:teacher` 与 `start:student` 是 **Windows 原生壳入口**，需要先在 Windows 上构建，
且只能在 Windows 上运行；在 macOS 上开发教师端请用 `start:teacher:desktop`。
完整步骤见 [安装与运行](docs/getting-started/running.md)。

## 架构与文档

当前教师机提供课程内容和课堂状态，学生端连接教师服务；Core 提供渲染和通用运行时能力。Electron 教师端已有直接模式源码预览，固定机中继模式仍待桌面接入。[当前系统架构](docs/architecture/system.md) 展示现状，[目标架构](docs/architecture/target-architecture.md) 说明设计。

- [文档目录](docs/README.md)
- [客户端 UI 标准与 Agent 交付门禁](docs/design/client-ui-standard.md)
- [代码审查与实施 TODO](docs/status/todo.md)
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

业务代码在 `apps/`，共享能力在 `packages/`；见[开发指南](docs/development/contributing.md)。根仓未见 `LICENSE` 文件，使用与再分发条件需要维护者确认。
