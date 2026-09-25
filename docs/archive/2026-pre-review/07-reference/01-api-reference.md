# 01 API 参考

本章只记录当前有效的接口边界，不再为旧单仓接口做兼容性导航。

## 1. 教师端数据面 API

教师端是当前唯一的数据面服务，负责课程、目录、布局、提交和教程文件。

基础地址：

- 教师端服务根路径下的 `/api`

### 健康检查

- `GET /api/health`

返回服务状态和端口信息。

### 课程列表

- `GET /api/courses`

返回：

- `courses`
- `folders`
- `currentCourseId`
- `currentSlideIndex`

### 组件清单

- `GET /api/components-manifest`

返回教师端托管的组件文件列表。

### 当前课堂状态

- `GET /api/course-status`

返回：

- `currentCourseId`
- `currentSlideIndex`

### 刷新课程目录

- `POST /api/refresh-courses`

重新扫描课程目录并返回最新目录结构。

### 删除课件

- `DELETE /api/delete-course`

参数：

- `courseId`

### 文件夹管理

- `POST /api/course-folders`
- `DELETE /api/course-folders/:folderId`
- `PUT /api/course-folders/:folderId`
- `PUT /api/course-folders/:folderId/move`
- `PUT /api/course-folders/:folderId/courses/:courseId`

用于创建、删除、重命名、移动文件夹和课件归类。

### 座位表

- `GET /api/classroom-layout`
- `POST /api/save-classroom-layout`

### 学生提交

- `POST /api/save-submission`
- `GET /api/submission-config`
- `POST /api/submission-config`
- `GET /api/submissions/:courseId`
- `GET /api/submissions/:courseId/file/:fileName(*)`
- `POST /api/submissions/:courseId/download-batch`

### 教学辅助文档

- `GET /api/download-skill`
- `GET /api/course-guide`

## 2. 核心运行时 API

核心只保留运行时能力，不负责课程文件管理。

### 健康检查

- `GET /api/health`

### 运行时状态

- `GET /api/runtime-status`

返回：

- `currentCourseId`
- `currentSlideIndex`
- `mode`

### 已废弃数据面接口

以下接口在 core 中已明确废弃，并返回空兼容响应或不再提供课堂状态：

- `/api/students`
- `/api/student-log`
- `/api/courses`
- `/api/course-status`
- `/api/refresh-courses`
- `/api/components-manifest`

这些能力已经迁移到教师端服务。

## 3. 运行时事件协议

课堂控制主要通过 Socket 事件完成。当前已稳定的事件包括：

### 教师端发起

- `select-course`
- `sync-slide`
- `host-settings`
- `end-course`
- `refresh-courses`
- `full-sync-state`
- `interaction:sync`
- `sync-var`
- `vote:start`
- `vote:end`
- `annotation:segment`
- `annotation:stroke`
- `annotation:clear`

### 学生端发起

- `request-sync-state`
- `student:submit`
- `student-alert`
- `student-action`
- `vote:submit`
- `annotation:get`

### 服务端广播 / 回复

- `role-assigned`
- `identity-rejected`
- `participant-joined`
- `participant-left`

### 课堂域事件说明

以上课堂控制、投票、标注、学生监控等事件仍可经由 Socket 转发，但它们已不再代表 core 自身持有的 UI 状态；这些语义应由 teacher / student 端各自管理。

## 4. HTTP 兼容接口

以下接口在 core 中仍返回兼容数据：

- `GET /api/health`
- `POST /api/session/bootstrap`

其余数据面能力已迁移到教师端服务。

## 5. 备注

core 当前职责：连接鉴权、事件转发、运行时脚本分发。
不再承担：课堂 UI 状态、学生监控视图、投票状态存储、标注状态存储、教师设置存储。

更偏课件开发视角的说明见：

- [课堂同步机制](../06-runtime-and-interaction/01-classroom-sync.md)
- [运行时事件说明](../06-runtime-and-interaction/02-runtime-events.md)
- [课件 SDK 参考](../05-course-development/04-course-sdk.md)
