# @lumesync/native-contract

页面 ↔ 原生壳的共享契约。教师端与学生端原本各自维护一份 `shared/protocol/*-host.ts`，
学生端还有第二份 `ui/student-host/src/types.d.ts`；现在三处都从这里再导出。

对应设计：[原生桥](../../docs/reference/native-bridge.md)、[跨平台教师端设计](../../docs/architecture/teacher-cross-platform-relay.md) 第 6 节。

## 内容

| 模块 | 说明 |
| --- | --- |
| `src/bridge.js` | 消息封装 `{kind, id, action, payload, version}` 与回执 `{kind:'rpc-result', id, ok, payload, error}`；RPC 超时（10s）、payload 上限（4 MiB）、版本上限校验 |
| `src/capabilities.js` | 按角色的动作能力清单：`kind`（rpc/event）、`transport`（native/local/local-stub）、`implemented`、`nativeDispatch`、`risk`、说明 |
| `index.d.ts` | `TeacherHostApi` / `StudentHostApi` 及配置、会话、设置类型；两端页面与壳的统一类型来源 |

`transport: 'local-stub'` 表示学生端只保留同名方法并固定返回 `null`（`getSettings`、`importCourse` 等），
`implemented: false`，不能当作已实现能力。

## 契约对照测试

`test/capabilities.test.js` 会读取 `apps/teacher/native/shell/src/main.cpp` 与
`apps/student/desktop/shell/src/main.cpp`，把 `HandleRpc` / `HandleEvent` 里实际分派的 `action == L"..."`
与能力清单逐一比对。目前仍有一个原生壳缺陷（已在清单中标注）：

- 教师壳：注入脚本暴露 `classStarted` / `classEnded` / `setFullscreen`，但 `HandleEvent` 没有对应分支，调用被静默丢弃。

学生壳的 `maximizeWindow` 已接入 `HandleEvent`，仅在非授课状态切换最大化；Windows 实机编译与行为仍待验证。

## 使用

```js
const { validateBridgeRequest, authorizeAction, MESSAGE_KINDS } = require('@lumesync/native-contract');

// 原生壳侧：每条来自页面的消息都要校验来源、版本、能力与参数
const check = validateBridgeRequest(message);
if (!check.ok) return respondError(check.code);
const allowed = authorizeAction('viewer', check.value.action, check.value.kind);
```

## 测试

```bash
node --test packages/native-contract/test/*.test.js
# 或在仓库根目录：pnpm run test:contracts
```
