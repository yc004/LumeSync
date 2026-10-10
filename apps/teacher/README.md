# LumeSync Teacher

教师端应用位于根工作区 `apps/teacher/`。现有 Windows 路径使用 **C++/WebView2 + 本地 Node 服务**；跨平台 Electron 壳在 `desktop/`，当前仅有直接模式源码预览。

## 目录结构

```text
native/                   C++ 原生宿主与安装器
native/shell/             教师端 WebView2 壳
server/                   本地课堂服务（HTTP + Socket）
desktop/                  Electron 教师桌面壳
session-agent/            直接/中继会话客户端
ui/                       React 教师界面源码
../../packages/course-runtime/
                          共享 Core SDK 与浏览器运行时
shared/public/            课件与静态资源
shared/assets/            图标资源
scripts/start-native.js   原生壳启动脚本
scripts/migrate-legacy-lume.js
                          旧版 .lume 迁移脚本
```

## 常用命令

```bash
pnpm install
pnpm run start
pnpm run build:teacher-native
pnpm run build:teacher-native-installer
```

说明：

- `start` 启动教师端原生壳，要求先完成 C++ 构建。
- `build:teacher-native` 会构建 Web 资源、C++ shell，并生成 `dist/teacher-native` 运行目录。
- `build:teacher-native-installer` 会在 native 包基础上继续生成安装器。

## Native Shell 生命周期

教师端主进程由 `native/shell` 提供，负责创建 WebView2 窗口、启动本地 Node 课堂服务，并在退出时清理相关资源。

启动流程：

1. 原生 shell 启动后创建主窗口和系统托盘图标。
2. WebView2 准备完成后，shell 检查本地课堂服务端口是否可用。
3. 如果服务未运行，shell 使用 `node.exe server/index.js` 启动本地服务。
4. shell 会向 Node 服务注入 `LUMESYNC_SERVER_PID_FILE`，服务启动后把自己的 PID 写入该文件。

关闭流程：

1. 点击教师端关闭按钮或收到前端 `closeWindow` 事件时，主窗口销毁。
2. shell 先关闭 WebView2，再终止自己启动的 Node 服务进程。
3. 如果当前窗口复用了已有服务，shell 会读取 `teacher-server.pid` 清理对应 `node.exe`。
4. 如果 PID 文件不存在，shell 还会按教师端端口查找监听中的 `node.exe` 作为兜底清理。

托盘行为：

- 主窗口运行期间会显示 LumeSync Teacher 托盘图标。
- 托盘右键菜单提供“退出教师端（含后端服务）”，会同时清理本地服务和同名教师端进程。
- 如果 Windows Explorer 重启，shell 会收到 `TaskbarCreated` 消息并重新注册托盘图标。

PID 文件位置由原生 shell 注入，默认位于 LumeSync 的 ProgramData 运行目录：

```text
<ProgramData>/LumeSync Teacher/data/teacher-server.pid
```

## `.lume` 课件格式

新版 `.lume` 是标准 Zip 包：

```text
/
├── manifest.json
├── assets/
└── slides/
```

播放器会读取 `manifest.json`，按 `pages` 顺序加载 `slides/*.tsx`，并把 `assets/*` 映射成浏览器可访问的 Object URL。旧版单文件 `.lume` 不再作为播放器直接运行格式，需要通过迁移脚本包装为新版 Zip 格式：

```bash
pnpm run migrate-legacy-lume -- <input.lume> <output.lume>
```

## 打包输出

- 运行目录：`dist/teacher-native`
- 安装包：`dist/installer/LumeSync Teacher Native Setup 1.0.0.exe`

## 相关文档

- [server/src/README.md](./server/src/README.md)
- [Core 运行时](../../packages/course-runtime/README.md)
