# LumeSync 项目长期记忆

## 仓库与工作区约定

- **已取消 Git 子模块**（2026-10-10）：业务代码全在 `apps/*`（`teacher`、`student`、`classroom-hub`、`editor`），
  共享契约与运行时在 `packages/*`，文档只维护在 `docs/`。根 `package.json` 是脚本入口。
  历史来源（原 `repos/teacher|student|core` 子模块）见 `docs/status/submodules.md`；
  `repos/` 目录与 `.gitmodules` 已不存在，旧文档里的 `repos/...` 路径一律对应 `apps/...`。
- `docs/` 是文档**唯一来源**；`docs-site/content/**` 由 `docs-site/scripts/sync-content.mjs` 生成。
  新增/删除参考页时必须同时改 `sync-content.mjs` 的 `sections` 列表与 `docs/README.md` 目录表，
  然后跑 `pnpm run docs:sync`，用 `pnpm run docs:check` 校验（CI 会比对）。
- 同步脚本会拒绝表内行内代码里出现未转义的 `|`（`docs/reference/*.md` 的表格要注意）。
- 本轮后 `pnpm run test` 覆盖 7 套：契约包 157 + 编辑器 19 + 学生课堂 UI 12 + 教师服务 56 + 教室 Hub 85
  + 会话代理 44 + Electron 教师桌面壳守卫 8 = 381。新增可测包要加 `test:<name>` 脚本并串进根 `test`，
  否则本地不跑（CI 的 `ci.yml` 除了 `pnpm run test` 还会单独跑 `pnpm run test:core`，见下条）。
- `packages/course-runtime`（包名仍是 `@lumesync/core`）的测试**不在根 `test` 链里**：它的 `test` 脚本先跑
  `npm run build`，约 30 秒。CI 用独立步骤 `pnpm run test:core` 覆盖，别误以为没覆盖。
- 所有工作区包（`packages/*`、`apps/*`）直接在本仓提交，不再有「先子模块提交再更新 gitlink」这一步。
- `.workbuddy/memory/` **随仓维护**（已入库）；`.workbuddy/artifacts/` 是本地一次性交付物，已 gitignore。

## 已验证的坑

- **socket.io-client 顶层未知选项会透传给 engine.io/`ws`**：`protocolVersion` 恰好是 node `ws` 的
  WebSocket 协议版本（默认 13），传 `1` 会让真实握手**永远超时**（假 socket 测不出来）。
  契约版本只能放在握手 `auth.protocolVersion`（Hub 读 `handshake.auth.protocolVersion`）。
- 客户端连真实 Hub 的用例才暴露得出传输层问题；写完 socket 相关代码要跑真实 Hub 集成测试。
- Hub 测试夹具的假发现传输必须实现 `{publish, unpublish, browse, destroy}` 四件套，
  relay 模式启动时会 `publish`（缺了会进 error 状态）。
- 沙箱会挡住 `pnpm install`（写 pnpm store 被拒）；`node_modules` 已在仓库里，跑测试不需要重装。
- **编辑器 macOS 打包在本网络下必然失败**：`electron-builder --mac` 在下载完 electron 之后卡在后续请求，
  报 `Timeout awaiting 'request' for 600000ms`（CI 上则是 40 秒后 `apps/editor not a file`）。
  属网络受限，不是配置错误；Windows NSIS 同一次 CI 里是通过的。

## 课件渲染与教师壳（两层结构，易错）

- 课件舞台是**两层**的：渲染引擎（`packages/course-runtime/src/browser/engine/runtime/sync-classroom.tsx`）
  画舞台，`apps/teacher/ui/src/app.tsx` 的 `.teacher-course-stage` 系列样式再包一层。
  **改舞台外观必须同时看这两处**，否则壳里的圆角/边框/阴影会把引擎的改动完全抵消。
- 舞台布局：`data-lumesync-stage-root` 固定 `1280×720`，用 uniform `scale(min(w/1280, h/720))` 等比铺满。
  可用区正好 16:9 就是满屏，其余比例只留一侧底色（底色 = 引擎舞台根的 `bg-slate-900`）。
  不要加回上下限：>1 铺不满、<1 会溢出被 `overflow-hidden` 裁掉。
- `uiScale`（「课件页面缩放」）有效上限是 **1**，滑块区间 80%–100%；
  `renderScale`（「课件内容缩放」）是 0.6–1.2。两者别混。
- 学生端 `apps/student/ui/classroom` 直接 `<script src="/render-engine.js">` 复用教师服务分发的引擎包，
  **自身没有包裹层**——引擎一改两个端点同时生效，不需要重建学生 UI。
- `apps/teacher/shared/public/{protocol-client,teacher-app,render-engine}.js` 是**纳入版本控制**的构建产物
  （`.gitignore` 只忽略 `dist/`、`build/`、`.next/`）。改 `packages/course-runtime/src/browser/engine/*`
  或 `apps/teacher/ui/src/*` 之后必须跑 `cd apps/teacher && node server/src/teacher-shell-build.js`
  （等价 `pnpm --filter @lumesync/teacher run build:teacher-shell`，作为主模块跑时 `skipIfFresh:false` 必重建）
  并一起提交。
- **重建不是「无 diff 就说明没事」**：产物头部与每个源码段落前的 `// ---- <相对路径> ----` 注释由构建脚本
  按 `path.relative(apps/teacher, 源文件)` 生成，并仓后这些注释整体从 `core/src/*`、`shared/teacher-shell/src/*`
  变成了 `../../packages/course-runtime/src/*`、`ui/src/*`。**注释 diff 是正常产物更新，不是要回滚的副作用。**
- **产物会静默落后于引擎源清单**（真实踩过）：`render-engine.js` 曾停在并仓之前，缺
  `course-components/document-renderer.js`，而产物里的 `app.tsx` 会调 `window.LumeSyncDocumentRenderer`，
  等于新编辑器的 `lumesync-course-document` 课件在课堂里没有渲染器——原生壳与无 Node 的分发直接读这份
  产物、不会重跑构建，所以只有重建才暴露得出来。`shell-assets.test.js` 已有守卫：按
  `getTeacherRenderEngineSourceOrder()` 核对每个源文件的段落标记与先后顺序，并断言
  `global.LumeSyncDocumentRenderer = Object.freeze(` 存在。加引擎源文件时必须重建产物，否则测试红。
- 注意 `apps/teacher/shared/public/{lib,webfonts,weights}/` 也被跟踪（旧仓 LumeSync-Teacher 本就跟踪）；
  根 `.gitignore` 里的 `public/lib/` 等模式含中间分隔符，**锚定仓库根**，对 `apps/...` 无效。
- 批注 canvas 找舞台根只认 `data-lumesync-stage-root`，别再按 class 名匹配——类名随样式调整即失效。

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
- **`set viewport` 之后的 `reload` 会毁掉查询参数里的身份**：教师壳在拿到凭证后立刻
  `history.replaceState` 抹掉 `?role=&token=`，重载就是无凭证加载 → 被拒成
  `Valid viewer session required`。正确顺序是 `open about:blank` → `set viewport` → `open <带凭证的 URL>`，
  不要 reload。
- 教师控制台里选课要点**两次**且中间要等一帧：先在左侧 `nav` 切到「课件库」（默认停在「首页」），
  再点课程卡片，React 重渲染后「开始授课」按钮才从 disabled 变可用。
- 教师服务用 `... | head -20` 起后台任务，日志写满后管道关闭会 SIGPIPE **杀掉服务**，
  后续渲染验证会看到 `NO_STAGE`。改用 `> /tmp/xxx.log 2>&1` 重定向。
- `body{overflow:hidden}` 会让溢出**被截断**而不是滚动，`scrollWidth > innerWidth` 仍能测出来；
  大字号的响应式尺寸要同时受 `vh` 和 `vw` 限制。
