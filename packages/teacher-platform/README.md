# @lumesync/teacher-platform

教师端平台能力接口。业务 UI 只依赖这一层，具体实现由不同桌面宿主提供；
设计依据见 [跨平台教师端与教室中继模式设计](../../docs/architecture/teacher-cross-platform-relay.md) §3 与 §9 阶段 1。

## 为什么要有这一层

现有教师 UI 直接调用 `window.teacherHost.*`（Windows C++/WebView2 壳注入），
把窗口、文件、日志、全屏和会话凭证的能力绑死在一种壳上。抽出接口后：

- UI 只认 `openCourse` / `saveExport` / `openLogs` / `setFullscreen` 这类语义；
- Windows WebView2 壳由 `createWebView2Adapter` 适配，过渡期功能不变；
- 跨平台桌面宿主（Electron）实现同一接口，页面经受限 preload IPC 调用，
  不获得 Node.js 全权限；
- 能力清单与 [`@lumesync/native-contract`](../native-contract/README.md) 的动作表同源，
  未实现的能力返回 `platform_not_implemented`，不会在 UI 层静默失败。

## 接口

请求/响应（`PLATFORM_REQUESTS`）：`getConfig`、`saveConfig`、`verifyPassword`、
`getSettings`、`saveSettings`、`openCourse`、`saveExport`、`saveGeneratedPdf`、
`selectSubmissionDirectory`、`getSubmissionDirectory`、`openLogs`、`getLogDirectory`、
`getSession`、`bootstrapSession`、`clearSession`、`getWindowState`。

单向事件（`PLATFORM_EVENTS`）：`classStarted`、`classEnded`、`setFullscreen`、
`minimizeWindow`、`maximizeWindow`、`closeWindow`、`openWindow`、
`beginWindowDrag`、`updateWindowDrag`、`endWindowDrag`、`toggleDevTools`。

所有请求都返回归一结果，调用方不需要处理异常或 `null`：

```js
{ ok: true, value, code: null, message: null }
{ ok: false, value: null, code: 'platform_user_canceled' | 'platform_not_implemented' | …, message }
```

## 用法

```js
const { createWebView2Adapter, createElectronAdapter, validateAdapter } = require('@lumesync/teacher-platform');

// 过渡：现有 Windows 壳
const platform = createWebView2Adapter(window.teacherHost);
const opened = await platform.openCourse();
if (!opened.ok) showMessage(opened.message);

// 目标：Electron 主进程（preload 只暴露 invoke/send 两个函数）
const desktop = createElectronAdapter({
    invoke: (channel, payload) => ipcRenderer.invoke(channel, payload),
    send: (channel, payload) => ipcRenderer.send(channel, payload)
});

// 启动自检：接口是否完整、哪些能力当前壳没实现
const report = validateAdapter(platform);
```

## 测试

```bash
node --test packages/teacher-platform/test/*.test.js
```

覆盖：WebView2 适配器的语义翻译、用户取消与平台异常归一、未实现能力显式报错、
事件类单向调用、**接口对 native-contract 已实现 host 动作的覆盖检查**、
Electron 通道名与主进程异常处理、空适配器降级、能力清单完整性、ESM/CJS 一致。

## 尚未完成

- 教师 UI 的调用点仍直接使用 `window.teacherHost`；按调用点迁移到本接口尚未完成，
  迁移时会先给页面生成浏览器可用的 `window.LumeSyncPlatform`（与 `/protocol-client.js` 同样的生成方式）。
- Electron 宿主本身（`apps/teacher/desktop`）与 `ClassroomConnection` 抽象尚未实现，
  见[迁移状态](../../docs/status/migration.md)。
