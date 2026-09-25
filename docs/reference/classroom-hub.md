# 教室 Hub（apps/classroom-hub）

状态：**已落地首轮**（传输与状态中心），TLS、教师端 session-agent、只读投影与打包仍未实现。
对应设计：[跨平台教师端与教室中继模式](../architecture/teacher-cross-platform-relay.md) §4–§8、
[三端目标架构](../architecture/target-architecture.md) §4/§6。
契约来源：[共享契约包](contracts.md)（`@lumesync/classroom-protocol` 的 `src/relay/*`、`@lumesync/course-format`）。

一个服务，两种部署模式，由 `LUMESYNC_HUB_MODE` 选择：

| 模式 | 部署位置 | host 身份 | 学生连接地址 | 自发现 |
| --- | --- | --- | --- | --- |
| `direct`（默认） | 教师电脑 | `LUMESYNC_HOST_TOKEN`（与现有教师服务一致） | 教师电脑的课堂地址 | 不发布 |
| `relay` | 教室固定台式机 | 校验码配对后签发的**短期设备凭证**（不是 host token） | 固定机的稳定地址 | 发布 `_lumesync-relay._tcp` |

两种模式共用同一份课堂状态、命令处理、提交队列与协议守卫；`relay` 额外启用配对、唯一授课租约、课件暂存与发现广播。

## 1. 进程与生命周期

```js
const { createHub, startHub } = require('@lumesync/classroom-hub');

const hub = await startHub({ port: 0 });   // 端口 0 = 由系统分配（测试用）
// hub.app / hub.server / hub.io / hub.classroom / hub.relay / hub.discovery / hub.submissions
await hub.stop();                          // 关闭发现 + Socket.IO + HTTP
```

- `createHub(options)` 只组装不监听；`startHub(options)` = `createHub` + `start`。
- `hub.start(port)` 监听后才把真实端口交给发现层（`relay.setPort`），因此 `PORT=0` 与显式端口都能得到正确的 TXT 端口。
- `hub.sweep()` 由 `LUMESYNC_HUB_SWEEP_INTERVAL_MS`（默认 1000ms）周期性调用：租约过期 → 等待教师；配对过期 → 回到等待连接。
- 直接运行：`node apps/classroom-hub/index.js` 或 `pnpm run start:hub`。

## 2. HTTP 接口

所有响应为 `{ok, ...}`（`ok` 为 true 或 false）；错误带契约错误码（`@lumesync/classroom-protocol` 的 `ERROR_CODES`）。
未匹配路由返回 `404 {ok:false, code:'resource_not_found'}`，不区分"路由不存在"与"方法不对"，也不回显路径或堆栈。

| 方法 | 路径 | 授权 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/health` | public | `{ok, app:'LumeSync Hub', mode, protocolVersion, classroomId, pid}` |
| GET | `/api/protocol` | public | 从契约表生成的协议描述（版本、握手、入站/出站事件、scope、命名映射） |
| POST | `/api/session/bootstrap` | public | viewer：签发短期凭证；host：仅 `direct` 模式且仅本机 + `X-LumeSync-Host-Token`。不支持的角色 400，未授权 host 403 |
| GET | `/api/hub/status` | public | 模式、状态机（`state`/`discoveryLabel`）、公开配对信息（**无验证码**）、租约、队列、暂存、发现状态 |
| GET | `/api/hub/screen` | 本机 + `X-LumeSync-Host-Token` | 固定机屏幕内容，**含本次请求的验证码**；无可用屏幕时 409 `relay_no_screen` |
| PUT | `/api/courses/stage/:courseId?courseHash=sha256:…` | host（设备凭证或本机管理凭证） | 原始字节流（如 `application/zip`），按大小上限接收；course-format 校验 + 真实内容 hash 比对后暂存 |
| DELETE | `/api/hub/cache` | host | 教师离开前清理：释放**非当前播放**的暂存版本，返回 `{released, releasedCount, bytesFreed, stage, pendingSubmissions}` |

细节：

- **验证码**只在 `GET /api/hub/screen` 出现，且只允许本机（回环）+ `X-LumeSync-Host-Token`。配对 challenge、`/api/hub/status`、发现报文、日志都不含验证码。
- `/api/hub/status` 的 `lease` 是**脱敏投影**：给出 `state`、`epoch`、`deviceName`、`grantedAt`、`expiresAt`、`remainingMs`、`renewSoon`，但**不给出** `leaseId`/`deviceKey`/`sessionId`（这些是凭证字段，不应出现在公开读取接口）。
- 暂存接口先校验包（ZIP 路径/大小/压缩比/manifest），再用 `computeCourseHash` 算出真实内容 hash：与查询参数不一致 → 400 `course_hash_mismatch`；包不合法 → 400 `request_invalid` + `reason`（course-format 的 code，如 `package_not_a_zip`、`manifest_missing`）+ 前 10 条 `errors`。
- 请求体超过 `LUMESYNC_HUB_STAGE_MAX_BYTES` → 413 `stage_capacity_exceeded`；非法 JSON → 400 `request_invalid`；其余异常一律 500 `internal_error`（不回显 message）。

## 3. Socket.IO 接口

### 3.1 握手

1. **身份**（不通过则 `identity-rejected` 并断开）：
   - `direct`：`role=host` 需要 `LUMESYNC_HOST_TOKEN`；`role=viewer` 需要 `/api/session/bootstrap` 签发的短期凭证。
   - `relay`：`role=viewer` 同上；`role=host` **只**接受配对签发的设备凭证。带了凭证但无效/已撤销 → 明确 `identity-rejected`（不静默降级）。
   - `relay` 且 `role=host` **不带任何凭证** → **配对候选连接（pairing-only）**：只发 `session:accepted`（`payload.pairingOnly=true`）、不发快照、不在教师房间、守门只放行 `teacher:pair.request` / `teacher:pair.verify`，其余事件一律 `event_unknown`。
2. **协议协商**：不支持的版本 → `protocol-rejected` + 断开。
3. `session:accepted` + `classroom:snapshot`；随后挂载 `createInboundGuard({role, scopes:['classroom','relay']})`。
4. 房间：host → `hosts`、`host:<deviceKey>`；viewer → `viewers`、`viewer-ip:<ip>`、`viewer:<clientId>`（提交最终回执定向投递用）。

### 3.2 中继事件（relay 模式）

| 方向 | 事件 | 说明 |
| --- | --- | --- |
| 教师 → Hub | `teacher:pair.request {requestId, deviceKey, deviceName}` | 生成并显示验证码；同一 `requestId` 重复发起是幂等的 |
| Hub → 教师 | `teacher:pair.challenge {requestId, expiresAt, expiresInMs, nonce, classroomId}` | **不含验证码**；`nonce` 与本次请求绑定 |
| 教师 → Hub | `teacher:pair.verify {requestId, nonce, proof}` | `proof = HMAC(验证码, classroomId\|requestId\|deviceKey\|nonce)`（契约 `createPairingProof`） |
| Hub → 教师 | `teacher:pair.accepted {deviceToken, expiresAt, classroomId}` | 绑定设备公钥的短期凭证；**不含租约**；客户端应带该凭证重连 |
| Hub → 教师 | `teacher:pair.rejected {code, message, attemptsLeft}` | 未通过/过期/次数用尽/被占用；租约类拒绝也复用该事件（契约未声明独立的 lease 拒绝事件） |
| 教师 → Hub | `teacher:lease.acquire` | 仅已配对设备；教室空闲时授予唯一租约 |
| Hub → 教师 | `teacher:lease.granted {leaseId, epoch, expiresAt}` | 重复获取返回同一租约（`reused:true`） |
| 教师 → Hub | `teacher:lease.renew {leaseId, epoch}` / `teacher:lease.release {leaseId, epoch}` | 续租 / 结束授课并释放 |
| Hub → 全体 | `teacher:lease.revoked {epoch, reason}` | 释放或撤销后广播；旧 epoch 立即失效 |
| 教师 → Hub | `course:stage {courseId, courseHash, requestId}` | 确认该 hash 已通过 HTTPS 校验并暂存；未暂存 → `course_hash_unknown` |
| 教师 → Hub | `course:publish {courseId, courseHash, requestId, epoch}` | 校验租约 → `stage.publish()` → 切课 + 广播 |
| Hub → 全体 | `course:published {…, revision}` | 信封含 `classroomId`/`sessionId`/`requestId`/`revision`；同时给学生发兼容事件 `course-changed` |
| 教师 → Hub | `classroom:command {type, leaseId, epoch, requestId, payload}` | 类型：`course:select` / `slide:set` / `settings:update` / `annotation:clear` / `course:end` |
| Hub → 请求方 | ack `{requestId, ok, revision}` | 拒绝时带契约 `code`/`message`，并给该 socket 回一份权威 `classroom:snapshot` |
| 学生 → Hub | `student:submit {submissionId, …}` | 入队；ack `{ok:true, status:'queued'}`（**不是最终成功**） |
| Hub → 教师 | `submission:forwarded {submissionId, courseId, clientIp, clientId, fileName, content, sizeBytes, receivedAt, queueSize}` | 定向转发给教师房间（`direct` 模式同时发旧事件名 `student:submit`） |
| 教师 → Hub | `submission:delivered {submissionId}`（兼容 `student:submit:ack`） | `markDelivered()` → 队列副本释放 |
| Hub → 学生 | `student:submit:result {submissionId, success:true}` | **只有**教师确认落盘后才发；队列满时发 `{success:false, code:'queue_full'}` |
| Hub → 全体 | `relay:status` | 状态机每次变化（空闲/正在连接/授课中/错误）广播 |

`classroom:command` 的广播映射（都在契约的出站事件表内）：`course:select → course-changed`、`slide:set → sync-slide`（仅学生房间）、`settings:update → host-settings`、`annotation:clear → annotation:clear`（仅学生房间）、`course:end → course-ended`；每条命令之后都广播 `classroom:snapshot`（`revision` 单调递增）。

### 3.3 学生事件：转发与未处理清单

Hub 的通用转发清单**从契约的入站事件表生成**（`scope=classroom` 且角色含 `viewer` 或 `any`，减去有专门处理器的三个），契约新增 viewer 事件而 Hub 忘记接时测试会失败。

| 事件 | 处理方式 |
| --- | --- |
| `student:alert` | 转发到教师房间（附 `ip`/`clientId`/`receivedAt`） |
| `student:screenshot` | 转发；**不做** `monitorEnabled` 门控（见「已知限制」），大小由契约 schema 限制（>1.4MB 直接 `event_payload_invalid`） |
| `student:device-info` | 转发 |
| `student:power-control:client-ack` | 转发 |
| `student-action` | 转发（现有教师服务只记日志） |
| `request-sync-state` | 转发，教师可据此回 `full-sync-state` |
| `vote:submit` | 转发（**投票结果聚合不在 Hub**，见「已知限制」） |
| `annotation:get` / `annotation-load` | 转发（Hub 不保存注释，学生拿不到 `annotation:state`） |
| `course-runtime-error` | 转发 |

| 事件 | 未转发原因 |
| --- | --- |
| `student:submit` | 有专门处理器：队列 + 落盘回执 |
| `request-classroom-snapshot` / `session:hello` | 有专门处理器：直接回权威快照 |
| `student:power-control` | 角色是 host（教师发起），不是学生事件；Hub 不做 Wake-on-LAN |
| `select-course`、`sync-slide`、`update-settings`、`host-settings`、`end-course`、`refresh-courses`、`get-student-count` | 教师命令，已映射到课堂状态写入路径（`direct` 模式）；`relay` 模式必须走带租约的 `classroom:command` |
| `register-dependencies`、`set-admin-password`、`full-sync-state`、`interaction:sync`、`sync-var`、`vote:start`、`vote:end`、`annotation-add`、`annotation:segment`、`annotation:stroke`、`annotation:clear`、`student:submit:ack` | 契约允许但 Hub 目前没有处理器：**接受（守卫通过）但不产生任何副作用**，不会静默改变课堂状态。`relay` 模式下这些路径待教师端 session-agent 定稿后补齐 |
| `teacher:pair.*`、`teacher:lease.*`、`course:stage`、`course:publish`、`classroom:command`、`submission:delivered` | 中继事件，已在 `relay` 模式实现 |

教师（host）发送 `annotation:get` / `annotation-load` / `course-runtime-error`（契约标为 `any`）时，Hub 明确回绝 `event_forbidden`：通用转发通道只服务学生端事件，Hub 没有注释存储。

## 4. 与契约的接线方式

| 能力 | 契约模块 | Hub 侧接线 |
| --- | --- | --- |
| 协议版本/角色/事件/守卫 | `version`、`roles`、`events`、`guard`、`envelope` | `src/protocol.js`：协商、`createInboundGuard({scopes:['classroom','relay']})`、`createClassroomSnapshot`、`createCommandAck` |
| 验证码配对 | `src/relay/pairing.js`、`state.js` | 8 位 CSPRNG 验证码、3 分钟 TTL、5 次尝试都由契约生成/计数；Hub 只保存「requestId → deviceKey/nonce」的临时绑定并在证明通过后调用 `relayState.markVerified({requestId})`，证明失败调用 `relayState.recordFailure({requestId})`。验证码只在 `screenPayload()` 的屏幕侧被读取用于 HMAC 校验，既不下发也不"提交" |
| 固定机状态机 | `src/relay/state.js` | `disabled → idle → pairing →(已验证) teaching/paired`；发现 TXT 与屏幕内容严格分离；无屏幕时 `enable()` 返回 `relay_no_screen` 并进入 `error` |
| 授课租约 | `src/relay/lease.js` | `acquire/renew/release/revoke/authorizeCommand/describe`；Hub 只做「哪个设备持有」的判定与状态机/凭证联动，`epoch` 递增与过期判定全部在契约里 |
| 提交转发队列 | `src/relay/queue.js` | `enqueue`（满则 `queue_full`）/`markDelivered`；Hub 另外记录 `submissionId → clientId` 以便定向回执 |
| 课件暂存 | `src/relay/queue.js` | `stage/publish/has/currentVersion/clear`；Hub 负责 HTTP 上传与 course-format 校验、真实 hash 计算、字节本体的进程内保留 |
| 课件格式 | `@lumesync/course-format` | `readLumePackage` 校验包与 manifest；`computeCourseHash`（对「路径 + 内容」排序再 hash，重打包不影响 hash） |
| 凭证 | `tokens.js` | viewer 凭证与设备凭证都由 `createSessionToken`/`verifySessionToken` 签发校验；设备凭证绑定 `clientId=deviceKey` 与 `classroomId`，`release`/TTL 后失效 |

关键顺序（与设计 §7 一致）：

```
pair.request → 契约生成验证码（只进屏幕） → challenge(nonce)
pair.verify  → verifyPairingProof → markVerified → 签发设备凭证
lease.acquire→ leases.acquire → completePairing({leaseGranted:true}) → 状态机 teaching + 发现报文 busy
course:stage → course-format 校验 + hash 比对 → stage()
course:publish → authorizePublish(epoch) → stage.publish() → 切课 + course:published + 快照
student:submit → queue.enqueue → submission:forwarded
submission:delivered → queue.markDelivered → 定向 student:submit:result
```

**"已配对但未取得租约"**：证明通过后状态机停在 `pairing`（`status=verified`），只有 `teacher:lease.acquire` 成功才由 `completePairing` 进入 `teaching`（发现报文 `授课中`）。这样做的好处是"每次开始授课都要一次验证码授权"；代价是租约 TTL 过期或教师主动释放后，同一台电脑要**重新配对**（新的验证码）才能再次授课，设备凭证同时作废。

## 5. 持久化

**当前全部在进程内存里，重启即丢失**（设计 §7 要求的"按持久化 sessionId / 课件缓存 / 待提交队列恢复"尚未实现）：

| 数据 | 位置 | 重启后 |
| --- | --- | --- |
| 课堂状态（课程/页码/设置/`revision`/`sessionId`） | `src/classroom.js` | 清空，`sessionId` 重新生成（客户端以新快照为准） |
| 配对请求、设备凭证 | `src/relay.js`（`pairingHints`/`pairedDevices`） | 清空，需重新配对 |
| 授课租约 | 契约的 `createLeaseRegistry`（内存） | 清空；`epoch` 从 1 重新开始 |
| 提交队列 | 契约的 `createSubmissionQueue`（内存） | 丢失（未落盘，因此不会误报"已收取"） |
| 课件暂存字节 | `src/relay.js`（`stagedBytes`） | 丢失，需重新上传 |
| 发现广播 | 无状态 | 启动后按当前状态重新发布 |

Hub 不写日志文件、不写数据库、不创建目录；除 `/api/hub/cache` 外没有任何删除操作。

## 6. 环境变量

| 变量 | 默认 | 作用 |
| --- | --- | --- |
| `LUMESYNC_HUB_MODE` | `direct` | `direct` 或 `relay`；非法值直接抛错，不静默回退 |
| `PORT` | `3000` | HTTP 与 Socket.IO 端口（`0` = 系统分配） |
| `LUMESYNC_HUB_HOST` | `0.0.0.0` | 监听地址 |
| `LUMESYNC_HUB_CLASSROOM_ID` | `classroom-<主机名>`（DNS-SD 安全字符） | 稳定设备 ID，写入发现 TXT |
| `LUMESYNC_HUB_CLASSROOM_NAME` | 主机名 | 教室显示名（发现与屏幕） |
| `LUMESYNC_HOST_TOKEN` | 进程随机 | 管理/host 凭证；中继模式下仅本机回环可用 |
| `LUMESYNC_HUB_TOKEN_SECRET` | 进程随机 | 设备凭证与 viewer 凭证的 HMAC 密钥（两者共用，角色写入 payload） |
| `LUMESYNC_VIEWER_TOKEN_TTL_SEC` | `14400` | viewer 凭证有效期 |
| `LUMESYNC_HUB_DEVICE_TOKEN_TTL_SEC` | `28800` | 配对签发的设备凭证有效期 |
| `LUMESYNC_HUB_CAN_DISPLAY_CODE` | `1` | `0` → 固定机无屏幕：中继进入 `error`，屏幕接口返回 `relay_no_screen` |
| `LUMESYNC_HUB_DISCOVERY` | relay 模式 `1`，direct 模式 `0` | 是否发布 mDNS |
| `LUMESYNC_HUB_DISCOVERY_SERVICE_TYPE` | `_lumesync-relay._tcp.local` | 服务类型（实验室/多教室网络可改） |
| `LUMESYNC_HUB_LEASE_TTL_MS` | 契约 `LEASE_TTL_MS`（60000） | 租约 TTL；过期 → 等待教师 |
| `LUMESYNC_HUB_SWEEP_INTERVAL_MS` | `1000` | 过期清理周期（`0` = 关闭定时器，测试用） |
| `LUMESYNC_HUB_STAGE_MAX_BYTES` | 契约 `COURSE_STAGE_MAX_BYTES`（512MiB） | 课件上传与暂存上限（进程内存） |
| `LUMESYNC_HUB_STAGE_MAX_VERSIONS` | 契约 `COURSE_STAGE_MAX_VERSIONS`（20） | 暂存版本数上限 |
| `LUMESYNC_HUB_STAGE_TTL_MS` | 契约 `COURSE_STAGE_TTL_MS`（24h） | 暂存过期（当前播放版本不清理） |
| `LUMESYNC_HUB_QUEUE_CAPACITY` | 契约 `SUBMISSION_QUEUE_CAPACITY`（200） | 提交队列容量，满则 `queue_full` |
| `LUMESYNC_HUB_QUEUE_TTL_MS` | 契约 `SUBMISSION_QUEUE_TTL_MS`（24h） | 队列条目过期 |
| `LUMESYNC_HUB_JSON_LIMIT` | `2mb` | JSON 请求体上限 |
| `LUMESYNC_HUB_SOCKET_MAX_BYTES` | `2097152` | Socket.IO 单包上限（契约允许截图 1.4MB，默认 1MB 会在传输层断连） |
| `LUMESYNC_PROTOCOL_ALLOW_UNDECLARED` | `0` | 是否放行契约未声明的事件（与教师服务同名同义） |
| `LUMESYNC_HUB_LOG_LEVEL` | `info` | `silent`/`error`/`warn`/`info`/`debug` |

验证码有效期固定为契约的 3 分钟（`PAIRING_TTL_MS`）与 5 次尝试（`PAIRING_MAX_ATTEMPTS`），故意不提供环境变量覆盖。

## 7. 测试

```bash
node --test apps/classroom-hub/test/*.test.js   # 或 pnpm run test:hub
```

用例启动真实 Hub（端口 0）+ 真实 Socket.IO 客户端 + 真实 fetch，只有两处注入：**发现传输**（假传输，绝不起组播）与**时钟**（租约/验证码过期用例）。
覆盖：两种模式的握手与快照、配对快乐路径与攻击面（错误验证码计数、5 次锁定、重放、nonce 不匹配、过期、旧验证码换设备）、租约单持有者/续租/过期 epoch/释放/TTL 交接、命令幂等与越权不改状态、真实 `.lume` 的暂存/发布/清理、提交入队→转发→落盘→最终成功与队列满、通用转发清单与其契约一致性、发现的发布/取消发布/失败降级与搜索助手合并，以及**畸形 payload 冲击每条事件通道**（单个坏消息不能让 Hub 进程退出，也不会改变任何课堂状态）。

## 8. 已知限制与差距

1. **没有 TLS/WSS**：中继模式下教师电脑与学生都在明文 HTTP/Socket.IO 上连接；设计 §8 要求"局域网也用 TLS"，证书分发方式未定。因此设备凭证与验证码握手目前**只在可信局域网**内安全。
2. **没有持久化**（见 §5）。
3. **教师端 session-agent 未实现**：`browseClassroomRelays` / `createRelayBrowser` 已就绪（按协议主版本过滤、合并多网卡重复结果），但还没有客户端使用它；教师桌面壳仍是 Windows C++/WebView2。
4. **没有只读投影界面**（`apps/classroom-hub/projector` 未创建）；固定机屏幕目前通过 `GET /api/hub/screen` 由外部页面轮询。
5. **没有打包/安装**：固定机安装、升级、日志与备份未做。
6. **配对请求没有全局限速**：契约保证"每次请求 5 次尝试"，但没有限制"每秒能新建多少请求"。局域网内可被反复新建请求骚扰（每次都会在固定机屏幕上弹验证码），需要 IP/设备级限速。
7. **公开状态接口脱敏**：`/api/hub/status` 不返回 `leaseId`/`deviceKey`/`sessionId`（与设计文档"返回 `describe()`"相比是收紧，避免把凭证字段公开）。
8. **Hub 不保存课堂业务状态**：注释、投票会话、截图最新帧都不在 Hub；因此 `annotation:get` 只能转发（学生拿不到 `annotation:state`），投票结果也无人聚合（`vote:submit` 转发给教师，但没有反向的 `vote:result` 通道）。设计 §4 期望 Hub 维护这些课堂事件，属未完成项。
9. **教师端 `student:screenshot` 不做 `monitorEnabled` 门控**：现有教师服务在监看关闭时丢弃截图，Hub 选择"先转发、由教师端决定"，以免固定机在设置尚未同步时丢失监看画面；同时截图不落盘。
10. **`describeProtocol()` 在 Hub 本地实现**：契约包未导出该函数（教师服务也是本地实现），Hub 用同一形状从契约表生成，避免两套描述漂移。
11. **不实现 `role-assigned` 与课程目录**：Hub 不托管 `.lume` 库（那是教师电脑的职责），`refresh-courses` 只回空列表；旧教师页面若依赖 `role-assigned` 需要适配。
12. **租约过期后必须重新配对**：见 §4 末尾，是"每次授课一次验证码授权"的直接后果。
