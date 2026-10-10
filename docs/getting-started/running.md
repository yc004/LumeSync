# 获取源码与运行现状

状态：2026-09-27 复核。教师、学生和 Core 源码已并入根仓；Windows 原生安装和三端跨机运行尚未验收。macOS Electron 教师端已有本机直接模式源码预览，中继模式客户端已实现但尚未接入桌面 UI。详见[源码迁移记录](../status/submodules.md)与[实施 TODO](../status/todo.md)。

## 环境

- Git、Node.js 和 pnpm 10.33.0。根仓声明 pnpm 版本，未统一固定 Node.js 版本。
- 当前教师和学生桌面壳均为 Windows 构建：需要 CMake、Visual Studio C++ 构建工具、WebView2 SDK/Runtime 与 PowerShell。具体安装和打包结果尚待 Windows 设备验证。
- 文档站和下载站是根仓独立项目；它们不等于课堂服务。

## 获取源码

```bash
git clone https://github.com/yc004/LumeSync.git
cd SyncClassroom
pnpm install --frozen-lockfile
```

当前工作区不需要初始化 Git 子模块。旧 AI Editor 与 VS Code 插件未并入目标架构。

工作区包含根目录、`packages/`（共享契约包）、`docs-site`、`website`、`apps/teacher`、`packages/course-runtime` 与 `apps/student`；`apps/teacher`、`apps/student` 通过 `workspace:*` 引用契约包，因此改动契约后必须重新安装以重建链接。`pnpm install` 仅安装 JavaScript 依赖，不构建 Windows 桌面壳。

## 当前脚本入口

| 命令 | 当前作用 | 运行条件与状态 |
| --- | --- | --- |
| `pnpm run build:student-ui` | 构建学生课堂 UI 的版本化静态产物 | 纯 Node、无新依赖、幂等；教师服务分发它，缺失时 `/student.html` 返回 503 并提示该命令 |
| `pnpm run start:teacher-server` | 启动教师 HTTP/Socket.IO 服务 | 需要教师端与 Core 可用，学生课堂页需要先构建学生 UI；已通过 HTTP/协议层自动化测试，两端连课仍未实测 |
| `pnpm run start:teacher` | 启动现有 Windows 教师桌面壳 | 需要先得到 `LumeSyncTeacherShell.exe`；macOS 用下面的 Electron 预览壳 |
| `pnpm run start:teacher:desktop` | Electron 教师桌面壳（macOS / Windows 源码预览） | 复用现有 React 教师界面并自起本机教师服务；已在 macOS 实测直接模式的选课、翻页与结束课程，发行包与 Windows 实机未验证 |
| `pnpm run start:editor` | 新课件编辑器 MVP | 首次需安装工作区依赖；支持声明式标准组件、`.lume` 源码往返和 Agent API 创作；限制与 API 配置见[编辑器指南](editor.md) |
| `pnpm run start:hub` | 启动教室 Hub（`LUMESYNC_HUB_MODE=direct\|relay`） | 纯 Node 工作区包，relay 模式需要可用组播；无 TLS、无持久化 |
| `pnpm run start:student` | 启动现有 Windows 学生桌面壳 | 需要先构建学生端；Windows 实机仍未验收 |
| `pnpm run test` | 契约包 + 学生课堂 UI + 教师服务 + 教室 Hub + 会话代理 + 教师桌面壳测试 | 覆盖协议握手、越权拒绝、课程校验、会话引导、产物分发、中继配对/租约与桌面壳来源守卫回归 |
| `pnpm run docs:dev` | 启动文档站 | 只需文档站依赖；站点构建时从 `docs/` 同步内容 |
| `pnpm run start:website` | 启动下载站 | 需要 `WEBHOOK_SECRET`；默认端口可能与教师服务冲突 |

根 `package.json` 不再保留旧 AI Editor 与 VS Code 插件脚本，两者也都不进入[目标架构](../architecture/target-architecture.md)。

启动教师服务后，可用 `GET /api/health` 与 `GET /api/protocol` 确认协议版本（当前 `protocolVersion: 1`）与事件清单；客户端连接时应在 Socket.IO `auth` 中带上 `protocolVersion`。学生端访问 `/student.html`，静态资源走 `/classroom/<version>/*`。详见[共享契约包](../reference/contracts.md)与[学生课堂 UI 构建产物](../reference/configuration.md#学生课堂-ui-构建产物)。

## 当前课堂链路

现有实现中，教师服务提供课程、页面和 Socket.IO 课堂事件；学生端配置教师机的局域网地址。教师端选课、翻页、互动和提交功能已能从源码定位，**当前锁定组合仍未完成端到端验证**。具体模块与风险见[源码级评估](../architecture/source-review.md)。

## 常见问题

- **找不到教师/学生/Core 源码**：确认检出的是完成并仓后的根仓提交，目录对应关系见[源码迁移记录](../status/submodules.md)。
- **找不到 Windows `.exe`**：启动脚本不是构建脚本，需要在 Windows 环境完成原生构建。`start:teacher` 与 `start:student` 会先检查 `.exe` 是否存在，缺失时打印所需命令后退出。
- **在 macOS/Linux 上跑 `pnpm run start:teacher` 或 `start:student`**：这两个入口启动的是 Windows C++/WebView2 原生壳，跨平台不可用，脚本会直接提示并退出。教师端改用 `pnpm run start:teacher:desktop`（Electron），或只起服务用 `pnpm run start:teacher-server` 后在浏览器访问 `/student.html` 调试学生课堂界面。
- **`pnpm run start:teacher:desktop` 报 `Cannot read properties of undefined (reading 'setName')`**：说明当前 shell 里设置了 `ELECTRON_RUN_AS_NODE`（常见于从其他 Electron 应用派生的终端）。该变量会让 Electron 退化为纯 Node，`require('electron')` 返回的是包路径字符串而不是 API。执行前 `unset ELECTRON_RUN_AS_NODE` 即可。
- **学生无法连接**：检查教师服务是否启动、两机 IP/端口、防火墙和学生端地址配置；当前没有完整的自动连课验证结果。
- **端口占用**：教师服务与下载站均可能使用 3000 端口，需分别配置。
- **搜索不到教室中继**：教室 Hub 已发布 `_lumesync-relay._tcp` 并支持验证码配对，教师端会话代理也能搜索与配对；但**中继模式尚未接入 Electron 桌面壳**，跨机实测与固定机安装包未完成，组播不可用时需改用[手动地址](../reference/classroom-hub.md)。见[教室中继模式](../architecture/teacher-cross-platform-relay.md)。
