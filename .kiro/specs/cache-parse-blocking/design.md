# cache-parse-blocking Bugfix Design

## Overview

`server.js` 存在两个独立的阻塞缺陷，均可导致 Node.js 事件循环被永久占用，服务端完全停止响应：

1. **Bug A — HTTP 超时缺失**：`/lib/:fileName` 缓存代理的 `tryDownloadFromUrl` 使用裸 `http.get` / `https.get`，无超时设置。CDN 连接挂起时请求永不触发 `error` 或 `end`，事件循环被占用。

2. **Bug B — readFileSync 无防护**：`scanCourses()` 对每个 `.js` 文件调用 `fs.readFileSync`，无 try/catch。损坏或权限异常的文件会抛出未捕获异常，中断整个扫描，且若在 Socket.io 事件回调中触发还会导致进程崩溃。

修复策略：最小化改动，仅在两处缺陷点注入防护逻辑，不重构现有架构。

---

## Glossary

- **Bug_Condition (C)**：触发 bug 的输入条件集合
- **Property (P)**：bug 条件成立时期望的正确行为
- **Preservation**：bug 条件不成立时必须保持不变的现有行为
- **tryDownloadFromUrl**：`server.js` 中负责向单个 CDN URL 发起 HTTP/HTTPS 请求的内部函数
- **scanCourses**：`server.js` 中扫描 `public/courses/` 目录、读取课程元数据的函数
- **挂起（hang）**：TCP 连接已建立但服务端不发送任何数据，既不触发 `data` 也不触发 `end`/`error`
- **TIMEOUT_MS**：超时阈值常量，建议值 15000ms

---

## Bug Details

### Bug A — HTTP 超时缺失

#### Bug Condition

当 `/lib/:fileName` 缓存代理向某个 CDN URL 发起请求，且该 URL 对应的服务器建立 TCP 连接后长时间不返回任何数据（连接挂起）时，bug 触发。

```
FUNCTION isBugCondition_A(request)
  INPUT: request — 一次对 /lib/:fileName 的 HTTP 请求
  OUTPUT: boolean

  urlList := resolveUrlList(request.params.fileName)
  FOR EACH url IN urlList DO
    IF tcpConnected(url) AND NOT dataReceivedWithin(url, TIMEOUT_MS) THEN
      RETURN true   // 挂起，bug 触发
    END IF
  END FOR
  RETURN false
END FUNCTION
```

#### 具体示例

- 请求 `/lib/chart.umd.min.js`，jsdelivr CDN 建立连接后 60 秒无数据 → 事件循环被占用，所有后续请求（包括 WebSocket 心跳）无响应
- 四个候选 URL 全部挂起 → `tryNextUrl` 串行等待，服务端完全冻结
- 单个 URL 挂起后触发重定向到另一个挂起 URL → 递归调用链全部挂起

---

### Bug B — readFileSync 无防护

#### Bug Condition

当 `scanCourses()` 遍历 `public/courses/` 目录时，遇到无法正常读取的 `.js` 文件（损坏、权限不足、符号链接失效等）时，bug 触发。

```
FUNCTION isBugCondition_B(file)
  INPUT: file — public/courses/ 目录下的一个 .js 文件路径
  OUTPUT: boolean

  RETURN NOT canReadFile(file)
         OR throwsOnRead(file)   // 包括 EACCES、ENOENT（竞态）、损坏等
END FUNCTION
```

#### 具体示例

- `public/courses/broken.js` 文件权限为 000 → `fs.readFileSync` 抛出 `EACCES`，整个 `scanCourses()` 中断，`courseCatalog` 变为空数组或保持旧值
- 文件在 `readdirSync` 和 `readFileSync` 之间被删除 → 抛出 `ENOENT`，扫描中断
- 文件内容为二进制（非 UTF-8）→ 解码异常，扫描中断

---

## Expected Behavior

### Preservation Requirements

**必须保持不变的行为：**

- 本地 `public/lib/` 已存在的文件，直接由静态中间件返回，不触发代理逻辑（Requirements 3.1）
- CDN 正常响应时，文件被写入本地磁盘并同时流式返回给客户端（Requirements 3.2）
- `scanCourses()` 读取格式正常的课程文件时，正确提取 title、icon、desc、color 并返回课程列表（Requirements 3.3）
- WebSocket 连接、课程切换、翻页同步等实时功能在无网络异常时完全不受影响（Requirements 3.4）

**修复范围约束：**

所有不满足 `isBugCondition_A` 且不满足 `isBugCondition_B` 的输入，修复后行为必须与修复前完全一致。具体包括：
- CDN 正常响应（200、301/302 重定向后 200）的下载流程
- `scanCourses()` 对正常 `.js` 文件的读取和元数据提取
- 图片代理、字体代理、权重文件代理的所有逻辑（不在修复范围内，不得改动）

---

## Hypothesized Root Cause

### Bug A

**根因**：`tryDownloadFromUrl` 调用 `client.get(url, callback)` 后，仅注册了 `.on('error')` 处理网络层错误（如 DNS 失败、连接拒绝），但未设置 socket 超时。当 CDN 服务器接受 TCP 连接后静默不发送数据时，Node.js 的 `http.ClientRequest` 会无限期等待，既不触发 `error` 也不触发响应回调，导致：

1. `tryNextUrl` 的回调永远不被调用
2. `res` 对象永远不被 `end()`
3. Express 请求处理链挂起，占用事件循环中的一个 pending handle

**验证方式**：在 `client.get()` 返回的 `req` 对象上调用 `req.setTimeout(TIMEOUT_MS)` 并监听 `timeout` 事件，可复现并修复此问题。

### Bug B

**根因**：`scanCourses()` 的 `.map()` 回调中直接调用 `fs.readFileSync(filePath, 'utf-8')`，无任何异常捕获。Node.js 的同步文件 API 在遇到权限错误、文件不存在等情况时会同步抛出异常，该异常会：

1. 中断 `.map()` 的执行，后续文件全部跳过
2. 向上冒泡至调用方（启动时为顶层代码，运行时为 Socket.io 事件回调）
3. 若未被捕获，可能导致进程崩溃

---

## Correctness Properties

Property 1: Bug Condition A — HTTP 请求超时后自动中止并继续重试

_For any_ 对 `/lib/:fileName` 的请求，其中至少一个候选 CDN URL 发生连接挂起（在 TIMEOUT_MS 内无数据），修复后的 `tryDownloadFromUrl` SHALL 在超时后主动销毁该请求，调用 `onError()` 触发 `tryNextUrl` 尝试下一个 URL；若所有 URL 均失败，SHALL 向客户端返回 404/503，不阻塞事件循环。

**Validates: Requirements 2.1, 2.2**

Property 2: Bug Condition B — readFileSync 异常跳过单文件不中断扫描

_For any_ 调用 `scanCourses()` 的场景，其中 `public/courses/` 目录下存在至少一个无法正常读取的 `.js` 文件，修复后的 `scanCourses` SHALL 跳过该文件并输出警告日志，继续处理其余文件，返回包含所有可读课程的列表，不抛出异常。

**Validates: Requirements 2.3**

Property 3: Preservation — 正常下载流程不受影响

_For any_ 对 `/lib/:fileName` 的请求，其中 CDN URL 在 TIMEOUT_MS 内正常响应（200 或重定向后 200），修复后的代码 SHALL 产生与修复前完全相同的行为：文件写入本地磁盘，响应流式返回客户端。

**Validates: Requirements 3.1, 3.2**

Property 4: Preservation — 正常课程文件扫描不受影响

_For any_ 调用 `scanCourses()` 的场景，其中所有 `.js` 文件均可正常读取，修复后的 `scanCourses` SHALL 返回与修复前完全相同的课程列表（id、title、icon、desc、color 均一致）。

**Validates: Requirements 3.3**

---

## Fix Implementation

### 修复 A：为 `tryDownloadFromUrl` 添加超时

**文件**：`server.js`

**函数**：`tryDownloadFromUrl`（约第 155 行）

**当前代码**：
```js
const tryDownloadFromUrl = (url, onSuccess, onError) => {
    const client = url.startsWith('https') ? require('https') : require('http');
    
    client.get(url, (response) => {
        // ...
    }).on('error', (err) => {
        onError();
    });
};
```

**修复后**：
```js
const DOWNLOAD_TIMEOUT_MS = 15000;

const tryDownloadFromUrl = (url, onSuccess, onError) => {
    const client = url.startsWith('https') ? require('https') : require('http');
    
    const req = client.get(url, (response) => {
        // 收到响应头后清除超时（数据传输阶段由 response stream 自行管理）
        req.setTimeout(0);
        // ... 原有重定向和成功处理逻辑不变 ...
    });

    req.setTimeout(DOWNLOAD_TIMEOUT_MS, () => {
        req.destroy(new Error(`请求超时: ${url}`));
    });

    req.on('error', (err) => {
        // destroy() 触发的超时错误和普通网络错误统一走 onError
        onError();
    });
};
```

**关键点**：
1. 在文件顶部（或 `tryDownloadFromUrl` 定义前）声明常量 `DOWNLOAD_TIMEOUT_MS = 15000`
2. 将 `client.get()` 的返回值赋给 `req`
3. 调用 `req.setTimeout(DOWNLOAD_TIMEOUT_MS, callback)`，在回调中调用 `req.destroy()` 主动销毁请求
4. 收到响应头后调用 `req.setTimeout(0)` 取消超时计时器，避免大文件传输被误杀
5. `.on('error')` 已存在，`destroy()` 会触发它，无需额外处理

---

### 修复 B：为 `scanCourses` 的 readFileSync 添加 try/catch

**文件**：`server.js`

**函数**：`scanCourses`（约第 22 行）

**当前代码**：
```js
.map(f => {
    const courseId = f.replace('.js', '');
    const filePath = path.join(coursesDir, f);
    const content = fs.readFileSync(filePath, 'utf-8');
    // ...
    return { id: courseId, ... };
})
```

**修复后**：
```js
.map(f => {
    const courseId = f.replace('.js', '');
    const filePath = path.join(coursesDir, f);
    let content;
    try {
        content = fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
        console.warn(`[scanCourses] ⚠️ 跳过无法读取的文件: ${f} (${err.message})`);
        return null;  // 标记为跳过
    }
    // ...
    return { id: courseId, ... };
})
.filter(course => course !== null)  // 过滤掉跳过的文件
```

**关键点**：
1. 用 try/catch 包裹 `fs.readFileSync` 调用
2. catch 块中打印警告日志（含文件名和错误信息），返回 `null`
3. 在 `.map()` 后链式调用 `.filter(course => course !== null)` 过滤掉跳过的条目
4. 原有的元数据提取逻辑（正则匹配）完全不变

---

## Testing Strategy

### Validation Approach

两阶段策略：先在**未修复代码**上运行探索性测试，确认 bug 可复现并理解根因；再在**修复后代码**上运行修复验证测试和保留性测试。

---

### Exploratory Bug Condition Checking

**目标**：在未修复代码上制造反例，确认根因分析正确。

**Bug A 探索测试**：

```
TEST: HTTP 挂起导致事件循环阻塞
SETUP: 启动一个本地 TCP 服务器，接受连接但永不发送数据（模拟 CDN 挂起）
ACTION: 向 /lib/test.js 发起请求，possibleUrls 指向该挂起服务器
ASSERT: 请求在 30 秒内仍未收到响应（证明挂起）
ASSERT: 同期发起的其他 HTTP 请求也无响应（证明事件循环被占用）
EXPECTED COUNTEREXAMPLE: 请求永久挂起，无超时，无错误
```

**Bug B 探索测试**：

```
TEST: readFileSync 异常中断 scanCourses
SETUP: 在 public/courses/ 创建一个权限为 000 的 broken.js 文件
ACTION: 调用 scanCourses()
ASSERT: 函数抛出异常（EACCES）
ASSERT: 其他正常课程文件未被处理（courseCatalog 为空或不完整）
EXPECTED COUNTEREXAMPLE: 抛出未捕获异常，扫描中断
```

---

### Fix Checking

**目标**：验证 bug 条件成立时，修复后函数产生期望行为。

**Bug A 修复验证**：
```
FOR ALL url WHERE tcpConnected(url) AND NOT dataReceivedWithin(url, TIMEOUT_MS) DO
  result := tryDownloadFromUrl_fixed(url, onSuccess, onError)
  ASSERT onError() was called within TIMEOUT_MS + delta
  ASSERT no pending handles remain in event loop
END FOR
```

**Bug B 修复验证**：
```
FOR ALL file WHERE isBugCondition_B(file) DO
  result := scanCourses_fixed()  // 目录含该文件
  ASSERT result does NOT throw
  ASSERT result contains all other readable courses
  ASSERT warning log contains file name
END FOR
```

---

### Preservation Checking

**目标**：验证 bug 条件不成立时，修复前后行为完全一致。

```
FOR ALL url WHERE dataReceivedWithin(url, TIMEOUT_MS) DO
  ASSERT downloadAndCache_original(url) produces same file content as downloadAndCache_fixed(url)
END FOR

FOR ALL file WHERE canReadFile(file) DO
  ASSERT scanCourses_original() == scanCourses_fixed()  // 课程列表完全一致
END FOR
```

**推荐使用 Property-Based Testing**，原因：
- 自动生成大量随机文件名、URL 组合，覆盖手工测试难以穷举的边界情况
- 对保留性验证提供强保证：任意正常输入下行为不变

**保留性测试用例**：
1. CDN 正常响应 200 → 文件内容写入磁盘，响应体与原始一致
2. CDN 返回 301 重定向后 200 → 重定向处理逻辑不变
3. `scanCourses()` 读取全部正常文件 → 返回列表与修复前完全一致
4. `scanCourses()` 目录不存在 → 返回空数组（原有逻辑不变）

---

### Unit Tests

- 测试 `tryDownloadFromUrl`：挂起服务器场景下，在 `TIMEOUT_MS + 500ms` 内触发 `onError`
- 测试 `tryDownloadFromUrl`：正常 200 响应场景下，`onSuccess` 被调用，文件内容正确
- 测试 `scanCourses`：目录含损坏文件时，返回其余正常课程，不抛出异常
- 测试 `scanCourses`：所有文件正常时，返回完整课程列表，元数据提取正确
- 测试 `tryNextUrl`：第一个 URL 超时后，自动尝试第二个 URL

### Property-Based Tests

- 生成随机文件名，验证超时后 `onError` 必然被调用（Property 1）
- 生成随机课程文件集合（含部分损坏），验证返回列表仅包含可读文件（Property 2）
- 生成随机正常课程文件，验证修复前后 `scanCourses` 返回结果完全一致（Property 4）

### Integration Tests

- 启动完整服务器，模拟 CDN 挂起，验证其他 WebSocket 消息在超时期间仍可正常处理
- 启动完整服务器，`public/courses/` 含损坏文件，验证 `/api/courses` 返回正常课程列表
- 验证正常下载流程端到端：请求 `/lib/chart.umd.min.js`，文件被写入 `public/lib/`，响应体正确
