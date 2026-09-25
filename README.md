# LumeSync（萤火课堂）

LumeSync 是面向局域网教室的互动课件工作区。教师端管理课程与课堂，学生端接收状态并参与互动；课件运行时负责播放 `.lume` 课件。本仓库组合子模块，提供统一脚本、共享契约包、文档站和下载站源码。新编辑器将在架构确定后独立设计。

> **源码状态（2026-09-25）**：教师端和 VS Code 插件已检出到根仓锁定提交。学生端与教师端内的 Core 已取得当前远端源码，但根仓锁定的提交在可取得的远端历史中缺失，因而版本不匹配。旧 AI Editor 和 VS Code 插件均不纳入目标架构；AI Editor 未克隆，旧插件仅保留作现状审查。详见[子模块状态](docs/status/submodules.md)。共享契约包（`packages/`）已完成首轮落地并有自动化测试。三端集成尚未实测。

## 功能

| 模块 | 既有文档描述的用途 | 本次验证 |
| --- | --- | --- |
| 教师端 | 课程管理、课堂控制、HTTP/Socket 服务、提交收集 | 协议层与课程校验有自动化测试；桌面端未构建 |
| 学生端 | 连接教师机、展示课件、互动和提交 | 源码已检出，版本不匹配 |
| Core | `.lume` 渲染及通用运行时控制 | 源码位于 `repos/teacher/core`，版本不匹配 |
| 共享契约包 | 课堂协议、课件格式与原生桥的单一契约来源 | 已落地，`pnpm run test:contracts` 覆盖 |
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
│   ├── student/          # Git 子模块
│   ├── ai-editor/        # 历史子模块声明，未检出，不进入目标架构
│   └── editor-plugin/    # 历史子模块声明，未检出，不进入目标架构
├── packages/             # 共享契约包：classroom-protocol / course-format / native-contract
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
pnpm run start:teacher-server  # 教师服务
pnpm run start:teacher         # 教师桌面端
pnpm run start:student         # 学生桌面端
pnpm run start:core            # 独立 Core runtime
pnpm run docs:dev              # 文档站
pnpm run test                  # 契约包 + 教师服务测试
```

桌面端启动命令需要 Windows 构建产物。完整步骤见 [安装与运行](docs/getting-started/running.md)。

## 架构与文档

当前教师机提供课程内容和课堂状态，学生端连接教师服务；Core 提供渲染和通用运行时能力。目标架构新增 Windows/macOS 教师端及教室固定机中继模式，均尚未实现。[三端架构图解](docs/architecture/three-end-architecture.md) 展示现状，[目标架构](docs/architecture/target-architecture.md) 说明设计。

- [文档目录](docs/README.md)
- [功能清单与限制](docs/reference/features.md)
- [共享契约包](docs/reference/contracts.md)
- [审查报告与待修问题](docs/status/audit.md)
- [源码级架构评估与改进建议](docs/architecture/source-review.md)
- [三端目标架构设计（语言、框架、通信协议与图表）](docs/architecture/target-architecture.md)
- [跨平台教师端与教室中继模式设计](docs/architecture/teacher-cross-platform-relay.md)
- [当前通信、身份与运行机制](docs/architecture/runtime-mechanisms.md)
- [HTTP API](docs/reference/http-api.md) · [Socket.IO 事件](docs/reference/socket-events.md) · [WebView2 原生桥](docs/reference/native-bridge.md)
- [课件格式与 SDK](docs/reference/course-format-sdk.md) · [配置与环境变量](docs/reference/configuration.md)
- [文档站](docs-site/content/index.mdx)：从 `docs/` 当前文档同步生成；旧 API、Socket 与课件示例已归档

## 贡献与许可

业务代码在对应子模块维护，共享契约在 `packages/` 维护，根仓记录子模块提交指针；见 [开发指南](docs/development/contributing.md)。根仓未见 `LICENSE` 文件，使用与再分发条件需要维护者确认。
