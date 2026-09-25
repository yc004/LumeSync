# 开发与维护

## 仓库边界

根仓维护文档、工作区脚本、共享契约包（`packages/`）、文档站、下载站和子模块指针。当前检出的 Git 子模块是 `teacher` 与 `student`；`.gitmodules` 仍声明 `ai-editor` 与 `editor-plugin`，但两者已退出目标架构、未参加工作区构建。Core 由工作区路径 `repos/teacher/core` 引用。修改业务代码前先确认子模块已初始化，并检查各子模块自己的开发说明。

## 常用命令

```bash
git submodule status
pnpm install --no-frozen-lockfile   # 工作区含 packages/*，需要重建链接
pnpm run test                       # 契约包 + 教师服务
pnpm run docs:sync
pnpm run docs:check
pnpm run docs:build
```

`pnpm run test` 由两步组成：`pnpm run test:contracts`（`packages/` 下三个契约包）与 `pnpm run test:teacher-server`（教师服务，含协议握手、课程目录与会话引导回归）。契约包通过 `workspace:*` 被 `repos/teacher`、`repos/student` 引用，因此改动契约后必须在根目录重装链接。

修改子模块后，应先在该子模块提交，再在根仓提交更新后的 gitlink。不要用 `repos:update` 当作可重复的安装步骤：它会移动到子模块远端分支，改变根仓原先锁定的组合。

## 共享契约

| 包 | 何时修改 |
| --- | --- |
| `packages/classroom-protocol` | 新增/修改事件、角色、HTTP 路由授权或协议版本时。改事件表后要同步 `docs/reference/socket-events.md` |
| `packages/course-format` | 修改 `.lume` manifest 字段、ZIP 限制或迁移规则时。改后要同步 `docs/reference/course-format-sdk.md` |
| `packages/native-contract` | 修改原生桥动作或消息封装时。对照测试会读取两端 `native/shell/src/main.cpp`，清单与 C++ 分派表必须一起改 |

契约包与当前实现的关系、尚未落地的部分见[共享契约包](../reference/contracts.md)。打包后的教师页面通过服务端生成的 `/protocol-client.js` 读取协议版本，不要在页面里硬编码版本号。

## 文档维护

- 根 [README](../../README.md) 只放项目入口、功能状态、最短启动路径及导航。
- `docs/getting-started` 放安装和运行；`architecture` 放边界、协议全景与数据流；`reference` 放功能、HTTP/Socket/WebView2 接口、课件格式和配置；`status` 放审查与已知问题。
- `docs/` 是当前文档的唯一内容源。`docs-site/scripts/sync-content.mjs` 将入门、架构、参考、开发和状态页生成到 `docs-site/content`；首页为站点导航页。改动文档后运行 `pnpm run docs:sync`，用 `pnpm run docs:check` 检查生成内容是否漂移；构建前也会自动同步。
- 新 API、Socket 或课件用法只有在对照源码并记录验证状态后才放入当前文档。旧站内容保存在 `docs/archive/docs-site-pre-sync`，不作为当前规范。
- `docs/archive` 仅供历史回溯，不应被当前 README 或新手流程引用为规范。

## CI 与发布

发布前先修复 [审查报告](../status/audit.md) 中的 CI 问题，在 Windows 机器上验证桌面构建与安装包路径。现有 `release.yml` 和 `build-branch.yml` 不能作为已验证可用的发布流程。
