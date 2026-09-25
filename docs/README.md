# 文档目录

本目录是根仓的当前维护入口。文档按入门、架构、参考、开发和项目状态分类。教师端、学生端、Core 与遗留 VS Code 插件源码现已取得，但学生端和 Core 与锁定指针不一致；旧 AI Editor 未克隆。旧 AI Editor 和 VS Code 插件均不进入目标架构。共享契约包（`packages/`）已完成首轮落地，业务行为及三端集成仍待测试。

| 类别 | 文档 | 用途 |
| --- | --- | --- |
| 入门 | [安装与运行](getting-started/running.md) | 获取源码、启动和连接 |
| 架构 | [系统架构](architecture/system.md) | 模块边界、数据流和设计思路 |
| 架构 | [三端架构图解](architecture/three-end-architecture.md) | 教师端、学生端、编辑器的产品视角与交互 |
| 架构 | [当前通信与运行机制](architecture/runtime-mechanisms.md) | 进程、协议、身份、状态和信任边界 |
| 架构 | [课件渲染架构评估](architecture/course-rendering.md) | 播放链路、架构问题与分阶段改进建议 |
| 架构 | [源码级架构评估](architecture/source-review.md) | 问题证据、目标边界与改造顺序 |
| 架构 | [三端目标架构设计](architecture/target-architecture.md) | 语言、框架、通信协议、模块归属与详细图表（讨论稿） |
| 架构 | [跨平台教师端与教室中继模式](architecture/teacher-cross-platform-relay.md) | Windows/macOS 教师端、固定机中继、功能归属与接入流程 |
| 参考 | [功能清单与限制](reference/features.md) | 能力、证据和限制 |
| 参考 | [共享契约包](reference/contracts.md) | `packages/` 下的协议、课件格式与原生桥契约及其接入点 |
| 参考 | [HTTP API 与静态资源](reference/http-api.md) | 教师服务、Core 和下载站的路由、请求与副作用 |
| 参考 | [Socket.IO 课堂事件](reference/socket-events.md) | 连接身份、全部业务事件与消息流 |
| 参考 | [WebView2 原生桥接](reference/native-bridge.md) | 两端页面与 C++ 壳之间的 RPC 和事件 |
| 参考 | [课件格式与 SDK](reference/course-format-sdk.md) | `.lume` 包结构、加载器与运行时上下文 |
| 参考 | [配置与目录](reference/configuration.md) | 环境变量、状态存储、缓存与本机配置 |
| 开发 | [开发指南](development/contributing.md) | 子模块、脚本、构建与维护 |
| 项目状态 | [审查报告](status/audit.md) | 问题、优先级、验证缺口 |
| 项目状态 | [目标架构迁移状态](status/migration.md) | 已落地改动与剩余工作 |
| 项目状态 | [子模块状态](status/submodules.md) | 当前源码与根仓指针的对应关系 |

## 其他资料

- [文档站](../docs-site/content/index.mdx) 的当前说明页面由本目录生成；`docs/` 是说明正文的唯一来源，站点导航首页单独维护，生成方式见[开发指南](development/contributing.md)。旧站点的 API、Socket 和课件示例已归档，尚未重新验证，不作为当前规范。
- [历史资料](archive/README.md) 仅供回溯。原编号章节已移至 [2026 年审查前文档](archive/2026-pre-review/)；旧路径和旧主张不作为当前操作依据。
- [根 README](../README.md) 是项目入口。
