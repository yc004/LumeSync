# 开发与维护

## 仓库边界

本仓是一个 pnpm 工作区：`apps/` 放教师、学生、编辑器和教室 Hub，`packages/` 放共享契约、课件格式、组件扩展和原 Core 运行时。教师、学生和 Core 已从子模块并入根仓，来源提交见[源码迁移记录](../status/submodules.md)。业务代码与共享包都在根仓维护。

学生端有两个工作区包（`pnpm-workspace.yaml` 的 `apps/student/ui/*`）：`apps/student/ui/classroom`（`@lumesync/student-ui`，正式课堂 UI 的构建产物）与 `apps/student/ui/student-host`（本机管理/离线页）。正式课堂页**不再**位于教师仓库。

## 学生课堂 UI

正式课堂页归学生端所有，教师服务只分发构建产物（见[目标架构 §6](../architecture/target-architecture.md)、[HTTP API](../reference/http-api.md)）。

```bash
pnpm run build:student-ui            # = pnpm --filter @lumesync/student-ui run build
pnpm run test:student-ui             # 构建产物 + 页面源码契约测试
node apps/student/ui/classroom/scripts/build.mjs   # 不经 pnpm 的直接调用
```

- 源码：`apps/student/ui/classroom/src/{index.html,classroom-app.js}`（字节级迁移，`classroom-app.js` 带 BOM）。页面仍以 `text/babel` 在浏览器里编译，依赖 `/lib/*`、`/socket.io/socket.io.js`、`/protocol-client.js`、`/render-engine.js` 由教师服务提供。
- 产物：`apps/student/ui/classroom/dist/<version>/`，版本 = 包版本 + 构建输入内容哈希；`dist/manifest.json` 记录每个文件的 sha256，`dist/current.json` 指向当前版本。`dist/` 不入库，改完源码必须重新构建，否则教师服务在 `/student.html` 与 `/classroom/*` 上返回 503。
- 构建脚本把 `src/index.html` 里的 `src="classroom-app.js"` 重写成 `/classroom/<version>/classroom-app.js`；修改该行时必须保留这一处引用，否则构建会显式失败。
- 教师侧通过 `require('@lumesync/student-ui/dist')` 解析产物目录（`exports` 的 `./dist`），可用 `LUMESYNC_STUDENT_UI_DIR` 覆盖。

## 常用命令

```bash
pnpm install --frozen-lockfile      # 工作区含 packages/*、apps/* 与 apps/student/ui/*
pnpm run test                       # 契约包 + 学生课堂 UI + 教师服务 + 教室 Hub + 会话代理 + 教师桌面壳
pnpm run test:hub                   # 教室 Hub（真实 Express + Socket.IO + course-format 课件）
pnpm run test:session-agent         # 教师端会话代理（单元 + 驱动真实 Hub 的集成）
pnpm run test:teacher-desktop       # Electron 桌面壳的页面来源与课件路径守卫
pnpm run docs:sync
pnpm run docs:check
pnpm run docs:build
```

`pnpm run test` 串行运行契约包、编辑器、学生课堂 UI、教师服务、教室 Hub、会话代理与教师桌面壳测试。Core 的构建与单独测试使用 `pnpm run build:core`、`pnpm run test:core`。

新增可测包时应加上 `test:<name>` 脚本并串进根 `test`，否则它不会被 CI 覆盖。契约包通过 `workspace:*` 被 `apps/teacher`、`apps/student` 引用，因此改动契约后必须在根目录重装链接。教师服务测试会在开始时重新构建学生课堂 UI（构建幂等），所以单独运行 `node --test server/tests/*.test.js` 也不依赖手工预构建，但服务本身不会在缺少产物时回退。

所有工作区源码都直接在本仓提交。课堂服务代码在 `apps/classroom-hub/server/`，教师 React 界面在 `apps/teacher/ui/`，学生 C++ 壳在 `apps/student/desktop/`，编辑器实现位于 `apps/editor/app/`。

## 共享契约

| 包 | 何时修改 |
| --- | --- |
| `packages/classroom-protocol` | 新增/修改事件、角色、HTTP 路由授权或协议版本时。改事件表后要同步 `docs/reference/socket-events.md` |
| `packages/course-format` | 修改 `.lume` manifest 字段、ZIP 限制或迁移规则时。改后要同步 `docs/reference/course-format-sdk.md` |
| `packages/native-contract` | 修改原生桥动作或消息封装时。对照测试会读取两端 `native/shell/src/main.cpp`，清单与 C++ 分派表必须一起改 |
| `packages/teacher-platform` | 新增/修改教师端平台能力（文件、导入导出、提交目录、日志、窗口、全屏、会话凭证）时。测试会校验接口对 `native-contract` 已实现动作的覆盖 |

契约包与当前实现的关系、尚未落地的部分见[共享契约包](../reference/contracts.md)。打包后的教师页面通过服务端生成的 `/protocol-client.js` 读取协议版本，不要在页面里硬编码版本号；教师端的平台能力通过 `@lumesync/teacher-platform` 接口访问，不要再往 UI 里新增 `window.teacherHost` 的直接调用。`apps/teacher/desktop` 目前用受限 preload 兼容现有 `window.teacherHost`/`window.electronAPI` 调用点，是过渡实现，不是新的接口约定。

## 编辑器设计文档

新课件内容规范与编辑器方案已部分实现：`packages/course-model` 和 `apps/editor` 支持声明式文档与 Agent，`packages/component-extensions` 支持无脚本 `.lumex` 模板组件。相关设计文档位于 `docs/architecture/`：`course-content-extensions.md`（内容规范与插件机制）、`editor-design.md`（编辑器设计）、`editor-agent.md`（编辑器 Agent 与模型 API）。它们与 `course-rendering.md` 评估配套阅读；实现变化应同步更新这些文档和 `docs-site/scripts/sync-content.mjs` 的同步内容。

## 文档维护

- 根 [README](../../README.md) 只放项目入口、功能状态、最短启动路径及导航。
- `docs/getting-started` 放安装和运行；`architecture` 放边界、协议全景与数据流；`reference` 放功能、HTTP/Socket/WebView2 接口、课件格式和配置；`status` 放审查与已知问题。
- `docs/` 是当前文档的唯一内容源。`docs-site/scripts/sync-content.mjs` 将入门、架构、参考、开发和状态页生成到 `docs-site/content`；首页为站点导航页。改动文档后运行 `pnpm run docs:sync`，用 `pnpm run docs:check` 检查生成内容是否漂移；构建前也会自动同步。
- 新 API、Socket 或课件用法只有在对照源码并记录验证状态后才放入当前文档。旧站内容保存在 `docs/archive/docs-site-pre-sync`，不作为当前规范。
- `docs/archive` 仅供历史回溯，不应被当前 README 或新手流程引用为规范。

## CI 与发布

根仓 `ci.yml` 运行工作区测试和文档构建，`editor-desktop.yml` 单独构建编辑器安装包，`deploy-docs-pages.yml` 发布文档站。旧 `release.yml` 和 `build-branch.yml` 因引用失效路径已移除；教师、学生 Windows 安装包仍需独立验收与发布工作流。
