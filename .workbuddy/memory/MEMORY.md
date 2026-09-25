# LumeSync 项目长期记忆

## 仓库与工作区约定

- 根仓是组合仓：业务代码在 `repos/*` 子模块，共享契约在 `packages/*`，新服务在 `apps/*`
  （`classroom-hub`、`teacher/session-agent`），文档只维护在 `docs/`。根 `package.json` 是脚本入口。
- `docs/` 是文档**唯一来源**；`docs-site/content/**` 由 `docs-site/scripts/sync-content.mjs` 生成。
  新增/删除参考页时必须同时改 `sync-content.mjs` 的 `sections` 列表与 `docs/README.md` 目录表，
  然后跑 `pnpm run docs:sync`，用 `pnpm run docs:check` 校验（CI 会比对）。
- 同步脚本会拒绝表内行内代码里出现未转义的 `|`（`docs/reference/*.md` 的表格要注意）。
- 本轮后 `pnpm run test` 覆盖 6 套：契约包 142 + 学生课堂 UI 12 + 教师服务 55 + 教室 Hub 85 + 会话代理 44
  + Electron 教师桌面壳守卫 8 = 346。新增可测包要加 `test:<name>` 脚本并串进根 `test`，否则 CI 不覆盖。
- 根工作区包（`packages/*`、`apps/*`）不在子模块内，直接在本仓提交；只有 `repos/*` 需要先子模块提交再更新 gitlink。
- `.workbuddy/` 是本地工作区记忆，未被 gitignore、也未入库。

## 已验证的坑

- **socket.io-client 顶层未知选项会透传给 engine.io/`ws`**：`protocolVersion` 恰好是 node `ws` 的
  WebSocket 协议版本（默认 13），传 `1` 会让真实握手**永远超时**（假 socket 测不出来）。
  契约版本只能放在握手 `auth.protocolVersion`（Hub 读 `handshake.auth.protocolVersion`）。
- 客户端连真实 Hub 的用例才暴露得出传输层问题；写完 socket 相关代码要跑真实 Hub 集成测试。
- Hub 测试夹具的假发现传输必须实现 `{publish, unpublish, browse, destroy}` 四件套，
  relay 模式启动时会 `publish`（缺了会进 error 状态）。
- 沙箱会挡住 `pnpm install`（写 pnpm store 被拒）；`node_modules` 已在仓库里，跑测试不需要重装。

## 教室 Hub / 中继语义（易错点）

- relay 模式：host 带**有效设备凭证**才算 host；无凭证 = pairing-only（只 `session:accepted`、无快照、
  守门只放行 `teacher:pair.*`）；带无效凭证 = `identity-rejected` 且**不静默降级**。
- 每次授课一次验证码授权：`teacher:lease.release` 后本次设备凭证立即作废，要重新配对。
- `relay.describeLease()` 返回 `{state, lease: {...}, remainingMs, renewSoon}`（epoch 在 `lease.epoch`）；
  `relay.status()` 返回脱敏投影（`pairedDevices`、`relay.pairing` 不含验证码）。
- 验证码只在 `GET /api/hub/screen`（仅本机回环 + `X-LumeSync-Host-Token`）出现。
- 固定机投影界面 `GET /projector`（`apps/classroom-hub/projector/index.html`）也**只允许回环**；
  它自己不含凭证，凭证靠 URL **片段** `#token=…` 带入 → `sessionStorage` → `replaceState` 抹地址栏。
  用 `file://` 打开读不到接口（同源），必须经 Hub 打开。
- 提交是两段式：`student:submit` → `submission:forwarded` → 教师 `submission:delivered` → 学生才收
  `student:submit:result {success:true}`。

## 前端/HTML 交付物

- 用 `local-ui-visual-check` 的 agent-browser 做真实渲染验证（已装在
  `~/.workbuddy/binaries/node/workspace`，直接复用，不用重装）。
- 起真实 hub 造场景：`LUMESYNC_HUB_MODE=relay LUMESYNC_HUB_DISCOVERY=0 LUMESYNC_HOST_TOKEN=xxx PORT=4319 node apps/classroom-hub/index.js`。
- 脚本要放在**仓库内**才能解析到 socket.io-client（放 /tmp 会 MODULE_NOT_FOUND，NODE_PATH 也不管用）。
- zsh **不做** word splitting：`set -- $V` 不会拆词，循环里 `set viewport $1 $2` 会静默失败、
  视口看起来"没生效"。
- agent-browser 的浏览器会话有时会被重启，之前 open 的页面与 viewport 一起丢失；
  断言前先确认 `document.querySelector(...)` 不是 null，别把会话丢失误判成页面 bug。
- `body{overflow:hidden}` 会让溢出**被截断**而不是滚动，`scrollWidth > innerWidth` 仍能测出来；
  大字号的响应式尺寸要同时受 `vh` 和 `vw` 限制。
