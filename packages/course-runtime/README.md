# Course runtime（原 Core）

本包从原 LumeSync-Core 提交 `35bec94dcce0173597e5c2a34d4c64d7e078d65b` 导入到根工作区。目录为 `packages/course-runtime/`，现有 npm 包名暂保留 `@lumesync/core`，以维持教师服务和已有调用方的导入路径。原独立仓库说明见[归档 README](../../docs/archive/core-readme-pre-monorepo.md)。

## 当前职责

- `src/browser/engine/`：浏览器课件加载与渲染；旧 TSX/JS 分支仍使用 Babel 和页面内执行。
- `src/node/`、`packages/`：身份、运行控制和渲染引擎的 Node 入口。
- `src/server/`：可独立启动的旧 Core runtime 服务。

目标是从这里抽出受限的共享课堂播放器。当前导入只改变源码归属和路径，没有完成隔离播放器、旧课件迁移或跨端运行时统一；状态见[实施 TODO](../../docs/status/todo.md)。

## 工作区命令

在根仓运行：

```bash
pnpm run build:core
pnpm run test:core
```

包的构建产物位于本目录 `dist/`，不提交到 Git。教师服务优先读取构建产物，缺失时按现有兼容路径读取本包 `packages/` 下的源模块；教师 Windows 打包脚本会构建并带上 Core 运行文件。
