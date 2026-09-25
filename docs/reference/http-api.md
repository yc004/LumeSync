# HTTP API 与静态资源

状态：**当前源码实现**，审查日期 2026-09-25。本文依据 `repos/teacher/server/index.js`、`server/src/routes.js`、`server/src/proxy.js`、`repos/teacher/core/src/server/create-core-server.ts` 和 `website/server.js`。学生端与 Core 的本地检出不匹配上级锁定提交；未做端到端运行验证。下表是路由清单，不意味着这些接口已经具备可靠的访问控制。目标架构中的 `/api/v1/*` 尚未实现，见[目标协议](../architecture/target-architecture.md)。

## 服务与公共约定

| 服务 | 默认端口 | 作用 |
| --- | --- | --- |
| 教师课堂服务 | `PORT`，默认 3000 | 当前正式课堂页面、课件、业务 API 和 Socket.IO |
| Core 独立 runtime | `PORT` 或启动参数，默认 3000 | 通用转发和兼容空课程 API；**不是**正式教师服务 |
| 下载站 | `PORT`，默认 3000 | 静态下载页、版本文件和 GitHub Release webhook |

三个进程若在同机运行，不能同时占用相同端口。教师服务使用 `express.json({limit:'2mb'})` 与 URL 编码表单解析；Core 独立服务的 JSON 限制为 1 MB。教师 `apiRouter` 同时挂载在 **`/api` 和 `/api/teacher`**，所以下文表格中的 `/api/...` 路径也可换成 `/api/teacher/...`。直接写在 `server/index.js` 的 `/api/students`、`/api/student-log` 和 `/api/session/bootstrap` 不受这个别名覆盖。

教师服务已在首轮迁移中加入路由级 host 授权：写入请求以及课程导出、座位布局、提交文件和目录配置等敏感读取要求 `Authorization: Bearer <host token>`；`/api/students`、`/api/student-log` 也要求 host。课程目录、课件静态文件和部分读取接口仍公开，尚无完整的 viewer 资源授权。

授权判定不再是本模块里的正则，而是[共享契约](contracts.md) `packages/classroom-protocol/src/routes.js` 的路由表（`public` / `host` / `bootstrap`）。**本轮修复**：`apiRouter` 挂在 `/api` 上并带 host 中间件，`/api/session/bootstrap` 由 `server/index.js` 处理，此前"写请求一律 host"的兜底让引导请求先返回 403，viewer 与 host 都领不到凭证；现在该路径在路由表中标为 `bootstrap` 并放行到处理器，回归用例见 `repos/teacher/server/tests/session-bootstrap.test.js`。

host bootstrap 仅允许本机连接并要求 `X-LumeSync-Host-Token`。不要把此阶段当成已可直接暴露到不可信网络的完整安全部署。

教师 UI 通过 `teacherHost.getSession()` 取得本机会话；其 API fetch 包装器只向同源 `/api/` 请求附加 bearer token，不向第三方 URL 发送。该包装器现在同时写入 `window.fetch` 与 `window.__LumeSyncApiFetch`，因此内联脚本与课件运行时也走同一实现；此前只遮蔽打包 IIFE 内的 `fetch`，构建产物过期时会静默退回不带凭证的请求。由于课件仍和教师 UI 共享 JavaScript 上下文，这不是最终隔离方案。

## 教师服务：会话与状态

| 方法与路径 | 输入 | 返回/效果 | 源码 |
| --- | --- | --- | --- |
| `GET /api/health` | 无 | `{ok, app, port, pid, protocolVersion}` | `routes.js` |
| `GET /api/protocol` | 无 | `{success, protocolVersion, supportedVersions, handshake, inboundEvents, outboundEvents, plannedRenames}`；客户端据此判断版本与事件集 | `routes.js` |
| `GET /api/storage-usage` | 无 | `{success, bytes, fileCount, root}`；递归统计应用目录 | `routes.js:96` |
| `POST /api/session/bootstrap` | JSON `{role, clientId?}`；`role` 可为 `host`、`teacher` 或 `viewer`；host 需本机连接及 `X-LumeSync-Host-Token` | `{success, role, clientId, token, expiresAt, clientIp, serverTime}`；host 未授权返回 403，不支持的角色返回 400 | `server/index.js` |
| `GET /api/students` | 无 | `{students: string[]}`，目前按 IP 汇总 | `server/index.js:134` |
| `GET /api/student-log` | 无 | `{log: [...]}`，进程内日志 | `server/index.js:142` |
| `GET /api/course-status` | 无 | `{currentCourseId, currentSlideIndex}` | `routes.js:144` |

viewer token 由 Core 的 `identity.ts` 生成：三段式、HS256 签名，payload 包含 `sub`、`role:'viewer'`、`iat`、`exp`；默认有效期 14,400 秒。host 分支返回服务持有的共享 token，`expiresAt:null`；Socket 比较共享 token，尚无轮换/撤销机制。身份细节见[通信与身份机制](../architecture/runtime-mechanisms.md)。

```http
POST /api/session/bootstrap HTTP/1.1
Content-Type: application/json

{"role":"viewer","clientId":"student-01"}
```

该例展示现有请求形状，不应被视为安全的生产部署教程。

## 教师服务：课程与文件夹

| 方法与路径 | 输入 | 返回/效果 | 源码 |
| --- | --- | --- | --- |
| `GET /api/courses` | 无 | `{courses, folders, invalid, currentCourseId, currentSlideIndex}` | `routes.js:112` |
| `GET /api/components-manifest` | 无 | `{success, files}`，扫描缓存目录下 `.js` 组件文件 | `routes.js:124` |
| `POST /api/refresh-courses` | 无 | 重新扫描磁盘并返回 `{success, courses, folders}` | `routes.js:152` |
| `DELETE /api/delete-course` | JSON 或 query `courseId` | 删除课程文件；成功返回新目录，失败 400/404 | `routes.js:158` |
| `GET /api/export-course/:courseId` | 路径课程 ID；query `format=lume` 或 `format=pdf` | 下载现有 `.lume` 或 `.pdf` 文件；不现场生成 PDF | `routes.js:174` |
| `POST /api/course-folders` | JSON `{name, icon?, parentId?}` | 创建实体目录，返回 `{success, folder, courses, folders}` | `routes.js:204` |
| `DELETE /api/course-folders/:folderId` | 路径文件夹 ID | 删除文件夹，返回新目录 | `routes.js:217` |
| `PUT /api/course-folders/:folderId/move` | JSON `{targetFolderId}` | 移动文件夹，返回新目录 | `routes.js:228` |
| `PUT /api/course-folders/:folderId` | JSON `{name, icon?}` | 重命名文件夹，返回 `{success, folder, ...目录}` | `routes.js:242` |
| `PUT /api/course-folders/:folderId/courses/:courseId` | 路径文件夹与课程 ID | 移动课程文件，返回新目录 | `routes.js:256` |

课程由 `server/src/courses.js` 扫描 `coursesDir`，识别 `.lume`、`.tsx`、`.ts`、`.jsx`、`.js`、`.pdf`；同名不同扩展名按优先级选择，`.lume` 最高。课程/文件夹 ID 基于相对路径的 base64url 编码生成；前端不应自行推测磁盘绝对路径。ZIP `.lume` 的格式判定与 manifest 校验由[共享契约](contracts.md) `packages/course-format` 负责：校验失败的包不再静默跳过，而是出现在 `invalid: [{file, code, message}]` 里（`message` 带字段路径与错误码）；包含绝对路径条目、异常压缩比或超限大小的包会被直接拒绝。

## 教师服务：座位、提交与文档

| 方法与路径 | 输入 | 返回/效果 | 源码 |
| --- | --- | --- | --- |
| `GET /api/classroom-layout` | 无 | `{success, layout}`；无文件时 `layout:null` | `routes.js:273` |
| `POST /api/save-classroom-layout` | JSON `{layout}` | 写入布局 JSON，返回 `{success}` | `routes.js:287` |
| `POST /api/save-submission` | JSON `{courseId, clientIp, content, fileName?, mergeFile?}` | 保存文本/JSON 或合并 CSV，返回 `{success, ...}` | `routes.js:293`、`submissions.js` |
| `GET /api/submission-config` | 无 | `{submissionsDir}` | `routes.js:298` |
| `POST /api/submission-config` | JSON `{submissionsDir}` | 创建/切换提交目录，返回 `{success, submissionsDir}` | `routes.js:303` |
| `GET /api/submissions/:courseId` | 路径课程 ID | `{success, courseId, files:[{name,size,mtime}]}`；不返回服务器绝对路径 | `routes.js` |
| `GET /api/submissions/:courseId/file/:fileName(*)` | 路径课程 ID 与相对文件名 | 下载单个提交文件 | `routes.js:374` |
| `POST /api/submissions/:courseId/download-batch` | JSON `{files:string[]}` | 流式返回 ZIP | `routes.js:399` |
| `GET /api/download-skill` | 无 | 下载服务端指定的课件开发 skill 文件 | `routes.js:458` |
| `GET /api/course-guide` | 无 | 返回服务端指定的课件教程 | `routes.js:463` |

`save-submission` 的 `mergeFile` 分支按班级与日期建目录，写入 CSV，使用座位表中的姓名和学号；普通分支按课程及学生生成文件。提交的 Socket 入口并不直接落盘，而是转给教师 UI，再由 UI 调用本 HTTP 接口，见[Socket 事件](socket-events.md#学生提交链路)。首轮迁移已限制课程 ID、文件名和下载路径，批量下载最多 200 项，并拒绝越界符号链接；仍需校验存储目录配置、并发写入和空间配额。

## 教师服务：静态资源与代理

| 路径 | 用途与当前行为 |
| --- | --- |
| `/courses/*` | 直接从课程目录提供文件，供教师/学生播放器获取课件 |
| `/components/*`、`/engine/*` | 组件缓存与 Core 引擎源码 |
| `/student.html` | 学生课堂 UI 的稳定入口（学生 Windows 壳导航的地址）：返回当前版本产物的 `index.html`，`Cache-Control: no-store`。产物缺失或损坏时返回 **503**，正文与日志给出预期路径和构建命令，不回退旧副本 |
| `/classroom/<version>/*` | 学生课堂 UI 版本化资源：`/classroom/<version>/classroom-app.js` 映射到 `repos/student/ui/classroom/dist/<version>/…`，内容寻址，响应 `Cache-Control: public, max-age=31536000, immutable`；`/classroom/manifest.json` 与 `/classroom/current.json` 为 no-store 指针。产物不可用时整段路径返回 503 |
| `/teacher-app.js`、`/render-engine.js`、其他静态页 | 从 `STATIC_DIR`/缓存根目录提供；两个 bundle 设置 `Cache-Control: no-store`。学生课堂页**不再**从这里提供（原 `shared/public/student.html`、`student-app.js` 已删除） |
| `/lib/:fileName` | 优先本地缓存；否则按固定 CDN 映射、Socket 注册的依赖 URL、包名猜测顺序下载并缓存 |
| `/webfonts/:fileName`、`/lib/fonts/:fileName` | 字体缓存与代理 |
| `/weights/:fileName` | 从 face-api.js 权重地址下载缓存；`HEAD` 返回 200 |
| `/images/proxy?url=...` | 仅接受公网 HTTP/HTTPS 标准端口，预解析并固定公网 IPv4，拒绝本地地址与非图片响应；单图上限 5 MB、超时 15 秒，按内容 hash 缓存 |

学生课堂 UI 由学生端仓库的 `@lumesync/student-ui` 构建，产物目录由工作区依赖解析，可用 `LUMESYNC_STUDENT_UI_DIR` 覆盖；构建命令与版本方案见[配置](configuration.md#学生课堂-ui-构建产物)。页面引用的 `/protocol-client.js`、`/render-engine.js`、`/lib/*`、`/socket.io/socket.io.js`、`/courses/*` 仍由教师服务提供，只有课堂页本身是学生端产物。回归用例：`repos/teacher/server/tests/student-ui-distribution.test.js`。

`server/src/proxy.js` 是资源代理实现。`register-dependencies` Socket 事件现要求 host，但其 URL 仍可影响 `/lib/:fileName` 的下载地址；该链路还缺目标域名、重定向和大小限制。课件依赖加载还会调用 Core 的 `script-cache.ts` 预缓存。图片代理完成了首轮公网地址检查，但不能替代统一的出站网络策略。

## Core 独立服务的 HTTP API

`repos/teacher/core/src/server/create-core-server.ts` 提供另一个 Express 服务。它不托管实际课件文件，下列兼容路由故意返回空课程数据；不能将其与教师服务 `/api/courses` 混用。

| 方法与路径 | 当前返回/用途 |
| --- | --- |
| `GET /api/health` | Core 健康状态 |
| `GET /api/courses` | `{courses:[], folders:[], mode:'core-runtime'}` |
| `GET /api/course-status` | `{mode:'core-runtime'}` |
| `POST /api/refresh-courses` | 空目录与 `mode:'core-runtime'` |
| `GET /api/components-manifest` | 空 `files` 与 `mode:'core-runtime'` |
| `GET /api/runtime-status` | 当前 hosts/viewers 的连接快照 |
| `GET /api/students` | 兼容学生 IP 列表 |
| `GET /api/student-log` | 兼容连接日志 |
| `POST /api/session/bootstrap` | 只接受 viewer；按 Core secret 签发 viewer token |
| `/engine/*`、`/engine/src/*` | 静态引擎源文件 |

Core 独立服务的 Socket 是通用转发器，不包含教师服务的选课、投票、提交存储等业务状态机；详见[Socket 事件](socket-events.md#core-独立-runtime-服务)。

## 下载站 API

`website/server.js` 提供 `POST /api/webhook/github`：要求 `X-Hub-Signature-256`，用 `WEBHOOK_SECRET` 对原始 JSON 请求体做 HMAC-SHA256 校验；只处理 `X-GitHub-Event: release` 与 `published`、`edited`、`released` 动作。通过检查后立即返回 202，后台下载 Release 资产到 `/downloads/*`，并写 `downloads/version.json`；静态首页位于 `/`。当前仓库名大小写、下载文件名和“下载完成前写版本信息”等问题见[审查报告](../status/audit.md)。旧 VS Code 插件 webhook 分支仍在源码中，但已退出目标架构。

## 接口维护规则

本页列出的是源码路由与实际行为，**不是安全部署保证**。新增或修改接口时，应同时更新[共享契约](contracts.md)的路由授权表、请求/响应示例、角色要求、错误码、持久化副作用及验证状态。未带有效 host bearer 的受保护接口返回 403，body 中包含 `host_authorization_required`。计划中的版本化 API（`/api/v1/*`、中继模式接口）必须单独写在[目标架构](../architecture/target-architecture.md)，不能混进当前路由表。
