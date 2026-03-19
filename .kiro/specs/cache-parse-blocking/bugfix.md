# Bugfix Requirements Document

## Introduction

服务器在启动或运行过程中，有时会因为缓存代理下载请求无响应（网络挂起）或课程文件读取异常，导致 Node.js 事件循环被阻塞，服务端完全停止响应，必须手动 Ctrl+C 才能恢复。

影响范围：所有连接的师生客户端均无法收到任何响应，课堂中断。

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN `/lib/:fileName` 缓存代理向某个 CDN URL 发起 HTTP/HTTPS 请求，且该请求长时间无响应（连接挂起，既不成功也不报错）THEN 该请求永久挂起，Node.js 事件循环被占用，服务端停止处理所有后续请求

1.2 WHEN 多个候选 CDN URL 均发生连接挂起时 THEN `tryNextUrl` 的串行重试链全部挂起，服务端完全无响应

1.3 WHEN `scanCourses()` 在服务器启动时或收到 `refresh-courses` 事件时被调用，且 `public/courses/` 目录下存在损坏、超大或无法正常读取的 `.js` 文件 THEN `fs.readFileSync` 同步阻塞主线程，服务端在文件读取完成前无法处理任何请求

### Expected Behavior (Correct)

2.1 WHEN `/lib/:fileName` 缓存代理向某个 CDN URL 发起请求，且该请求在合理时间内（如 15 秒）无响应 THEN 系统 SHALL 主动中止该请求并尝试下一个候选 URL，不阻塞事件循环

2.2 WHEN 所有候选 CDN URL 均超时或失败 THEN 系统 SHALL 向客户端返回 404/503 错误响应，并在控制台记录失败日志，不阻塞后续请求

2.3 WHEN `scanCourses()` 读取某个课程文件时发生异常（文件损坏、权限错误等）THEN 系统 SHALL 跳过该文件并记录警告日志，继续处理其余课程文件，不中断服务

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `/lib/:fileName` 请求的文件已存在于本地 `public/lib/` 目录 THEN 系统 SHALL CONTINUE TO 直接返回本地文件，不触发代理下载逻辑

3.2 WHEN `/lib/:fileName` 缓存代理成功从 CDN 下载文件 THEN 系统 SHALL CONTINUE TO 将文件写入本地磁盘并同时流式返回给客户端

3.3 WHEN `scanCourses()` 读取格式正常的课程文件 THEN 系统 SHALL CONTINUE TO 正确提取课程元数据（title、icon、desc、color）并返回课程列表

3.4 WHEN 服务器正常运行且无网络异常 THEN 系统 SHALL CONTINUE TO 正常处理 WebSocket 连接、课程切换、翻页同步等所有实时功能
