# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - HTTP 挂起导致事件循环阻塞
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: 启动本地 TCP 服务器接受连接但永不发送数据，模拟 CDN 挂起
  - isBugCondition_A: tcpConnected(url) AND NOT dataReceivedWithin(url, 15000ms)
  - 测试 tryDownloadFromUrl 在挂起 URL 下，onError 应在 15000ms 内被调用
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (证明 bug 存在 — 请求永久挂起，onError 从未被调用)
  - Document counterexamples: "tryDownloadFromUrl(hangingUrl) 在 30s 内未触发 onError，事件循环被占用"
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - 正常 CDN 响应和正常课程文件扫描行为不受影响
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: tryDownloadFromUrl 对正常 200 响应调用 onSuccess，文件内容正确
  - Observe: scanCourses() 对全部正常 .js 文件返回完整课程列表，元数据一致
  - Write property-based test: for all url where dataReceivedWithin(url, 15000ms), onSuccess is called with correct response
  - Write property-based test: for all readable .js files, scanCourses returns same course list as before fix
  - Verify tests pass on UNFIXED code
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 3. Fix for cache-parse-blocking (Bug A + Bug B)

  - [x] 3.1 Implement Bug A fix — 为 tryDownloadFromUrl 添加 15 秒超时
    - 在文件顶部声明常量 DOWNLOAD_TIMEOUT_MS = 15000
    - 将 client.get() 返回值赋给 req 变量
    - 调用 req.setTimeout(DOWNLOAD_TIMEOUT_MS, () => req.destroy(new Error(...)))
    - 收到响应头后调用 req.setTimeout(0) 取消超时，避免大文件传输被误杀
    - 将原有 .on('error') 改为挂在 req 上（destroy() 会触发 error 事件，统一走 onError）
    - _Bug_Condition: isBugCondition_A — tcpConnected(url) AND NOT dataReceivedWithin(url, TIMEOUT_MS)_
    - _Expected_Behavior: onError() called within TIMEOUT_MS + delta; no pending handles remain_
    - _Preservation: CDN 正常响应时 onSuccess 调用行为完全不变 (Requirements 3.1, 3.2)_
    - _Requirements: 2.1, 2.2_

  - [x] 3.2 Implement Bug B fix — 为 scanCourses 的 readFileSync 添加 try/catch + filter(null)
    - 用 try/catch 包裹 fs.readFileSync(filePath, 'utf-8') 调用
    - catch 块中打印警告日志（含文件名和错误信息），return null
    - 在 .map() 后链式调用 .filter(course => course !== null)
    - 原有元数据提取正则逻辑完全不变
    - _Bug_Condition: isBugCondition_B — NOT canReadFile(file) OR throwsOnRead(file)_
    - _Expected_Behavior: scanCourses returns all readable courses, skips unreadable with warning_
    - _Preservation: 所有正常 .js 文件的元数据提取结果与修复前完全一致 (Requirements 3.3)_
    - _Requirements: 2.3_

  - [x] 3.3 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - HTTP 超时后自动中止并触发 onError
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug A is fixed — onError called within TIMEOUT_MS)
    - _Requirements: 2.1, 2.2_

  - [x] 3.4 Verify preservation tests still pass
    - **Property 2: Preservation** - 正常下载流程和正常课程扫描不受影响
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
