# LumeSync Student

学生端应用位于根工作区 `apps/student/`，当前采用 **C++ 原生壳 + WebView2 + Windows 守护服务** 架构。

## 目录结构

```text
desktop/                    C++ 原生壳、守护服务与 NSIS 安装器
desktop/shell/              学生端 WebView2 宿主
desktop/service/            LumeSyncStudentGuard 服务
desktop/installer/          NSIS 安装脚本
scripts/start-native.js     原生壳启动脚本
ui/student-host/            本地管理页与离线页（TypeScript）
shared/protocol/            宿主桥接协议类型
shared/assets/              图标资源
shared/build/               打包辅助脚本
docs/                       学生端运行与部署文档
```

## 常用命令

```bash
pnpm install
pnpm run build:host-ui
pnpm run build:native:configure
pnpm run build:native
pnpm run start
pnpm run build:student-native
pnpm run build:student-native-installer
```

说明：
- `start` 启动原生学生端壳（要求先完成 C++ 构建）。
- `build` 已指向 `build:student-native`，用于生成原生运行目录。

## 输出位置

- 运行目录：`dist/student-native`
- 安装包：`dist/installer/LumeSync Student Native Setup 1.0.0.exe`

## 相关文档

- [docs/native-student-runtime.md](./docs/native-student-runtime.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [SECURITY.md](./SECURITY.md)
