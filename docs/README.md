# 文档目录

本目录是根仓的当前维护入口。文档按入门、架构、参考、开发和项目状态分类。教师端、学生端和 Core 源码已并入根仓，但跨机运行尚未验收；旧 AI Editor 和 VS Code 插件不进入目标架构。共享契约、教室 Hub、会话代理和新编辑器已有首轮实现；教师桌面中继接线、隔离课堂播放器和完整扩展机制仍待完成。

| 类别 | 文档 | 用途 |
| --- | --- | --- |
| 入门 | [安装与运行](getting-started/running.md) | 获取源码、启动和连接 |
| 入门 | [新课件编辑器 MVP](getting-started/editor.md) | 启动编辑器、编辑课件和接入模型 API |
| 设计规范 | [客户端 UI 标准](design/client-ui-standard.md) | 所有客户端的新界面与实质改版的规范性要求、组件行为及验收门禁 |
| 设计规范 | [UI 迁移清单](design/ui-migration.md) | 现有界面的差距、优先级和例外登记 |
| 架构 | [系统架构](architecture/system.md) | 模块边界、数据流和设计思路 |
| 架构 | [当前通信与运行机制](architecture/runtime-mechanisms.md) | 进程、协议、身份、状态和信任边界 |
| 架构 | [课件渲染架构评估](architecture/course-rendering.md) | 播放链路、架构问题与分阶段改进建议 |
| 架构 | [课件内容规范与插件机制](architecture/course-content-extensions.md) | 页面编码规则、组件库、插件扩展点、导入与版本锁定方案 |
| 架构 | [新课件编辑器设计](architecture/editor-design.md) | 创作体验、文件生命周期、构建预览、组件扩展与教师端发布 |
| 架构 | [编辑器 Agent 与模型 API](architecture/editor-agent.md) | 用户自带模型 API、受限创作工具、候选草稿审查和密钥边界 |
| 架构 | [源码级架构评估](architecture/source-review.md) | 问题证据、目标边界与改造顺序 |
| 架构 | [三端目标架构设计](architecture/target-architecture.md) | 语言、框架、通信协议、模块归属与详细图表（讨论稿） |
| 架构 | [跨平台教师端与教室中继模式](architecture/teacher-cross-platform-relay.md) | Windows/macOS 教师端、固定机中继、功能归属与接入流程 |
| 参考 | [功能清单与限制](reference/features.md) | 能力、证据和限制 |
| 参考 | [共享契约包](reference/contracts.md) | `packages/` 下的协议、课件格式与原生桥契约及其接入点 |
| 参考 | [教室 Hub（直接模式 / 教室中继模式）](reference/classroom-hub.md) | Hub 的路由、事件、环境变量、持久化与限制 |
| 参考 | [教师端会话代理](reference/session-agent.md) | 教师端客户端的公开 API、事件、错误码与安全约束 |
| 参考 | [HTTP API 与静态资源](reference/http-api.md) | 教师服务、Core 和下载站的路由、请求与副作用 |
| 参考 | [Socket.IO 课堂事件](reference/socket-events.md) | 连接身份、全部业务事件与消息流 |
| 参考 | [WebView2 原生桥接](reference/native-bridge.md) | 两端页面与 C++ 壳之间的 RPC 和事件 |
| 参考 | [课件格式与 SDK](reference/course-format-sdk.md) | `.lume` 包结构、加载器与运行时上下文 |
| 参考 | [配置与目录](reference/configuration.md) | 环境变量、状态存储、缓存与本机配置 |
| 开发 | [开发指南](development/contributing.md) | 工作区、脚本、构建与维护 |
| 项目状态 | [审查报告](status/audit.md) | 问题、优先级、验证缺口 |
| 项目状态 | [目标架构迁移状态](status/migration.md) | 已落地改动与剩余工作 |
| 项目状态 | [源码迁移记录](status/submodules.md) | 原仓库提交与当前目录对应关系 |
| 项目状态 | [代码审查与实施 TODO](status/todo.md) | 对照源码和目标设计的优先级、完成条件及文档归纳 |

## 其他资料

- [文档站](../docs-site/content/index.mdx) 的当前说明页面由本目录生成；`docs/` 是说明正文的唯一来源，站点导航首页单独维护，生成方式见[开发指南](development/contributing.md)。旧站点的 API、Socket 和课件示例已归档，尚未重新验证，不作为当前规范。
- [历史资料](archive/README.md) 仅供回溯。原编号章节已移至 [2026 年审查前文档](archive/2026-pre-review/)；旧路径和旧主张不作为当前操作依据。
- [根 README](../README.md) 是项目入口。
