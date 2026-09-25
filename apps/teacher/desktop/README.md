# Electron 教师端预览

macOS 和 Windows 共用的 Electron 教师桌面壳。直接加载现有 React 教师控制台与 Node.js 课堂服务，保留原有课程库、授课、课堂设置、批注、学生管理等页面。主进程提供受限的文件、窗口和会话能力；页面不直接获得 Node.js 权限。

## 本地运行

在仓库根目录执行：

```bash
pnpm install
pnpm run start:teacher:desktop
```

当前是源码预览，需要仓库里的教师服务与学生 UI 构建产物。Electron 主进程自动启动本机课堂服务并选择空闲端口。关闭应用后，课堂服务随主进程退出。

## 当前范围

- 已接入：现有教师界面、课堂 Socket.IO 协议、本机 host 凭证、导入导出文件对话框、提交目录选择、设置保存和窗口控制。
- 待接入：`apps/teacher/session-agent` 的教室自发现、验证码配对、授课租约与中继提交；正式安装包、签名和公证；Windows/macOS 多机联调。
- 现有页面中依赖旧 Windows 原生能力的动作需要逐项回归。此预览中的 `setAdminPassword` 仅有占位返回，未实现原生凭证保存。

## 安全守卫

主进程只有两处把「页面来的输入」变成「本机操作」，两处都先过 `src/guards.cjs` 里的纯函数：

- `isTeacherPageUrl(url, teacherPageBase(port))`：只有本机课堂服务（`http://127.0.0.1:<port>/`）加载的页面才能调用原生能力。每个 `teacher:*` IPC 处理器都会重新校验调用页面的 URL，`will-navigate` 与 `setWindowOpenHandler` 也用它拦截外跳。判定要求端口后必须是路径分隔，因此 `http://127.0.0.1:3000.evil.example` 这类前缀伪装不算命中。
- `safeCoursePath(coursesDir, relative)`：课件导入/导出只接受落在教师课件目录以内的相对路径，绝对路径与 `..` 越界一律抛错。

这两条一旦回归就是提权与越权写文件，所以抽成纯函数并单独测试：

```bash
pnpm run test:teacher-desktop   # 8 个用例（页面来源 + 课件路径）
```

架构和协议详见 [跨平台教师端与教室中继模式](../../../docs/architecture/teacher-cross-platform-relay.md)，桥接接口见 [WebView2 原生桥与 Electron 壳](../../../docs/reference/native-bridge.md#electron-教师桌面壳)。
