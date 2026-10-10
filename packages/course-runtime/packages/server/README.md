# LumeSync Core Server

## 说明

此包提供 core 侧的 Express + Socket.io 服务入口。

当前定位：

- 提供连接入口
- 做身份校验与角色分配
- 提供 Socket 事件转发
- 暴露运行时脚本与兼容 HTTP 接口

不再负责：

- 课程目录管理
- 教师端业务 API
- 学生提交持久化
- 投票、标注、课堂 UI 状态存储

## 入口

```bash
node packages/server/index.js
```

## 当前 HTTP 接口

- `GET /api/health`
- `GET /api/runtime-status`
- `GET /api/students`（兼容）
- `GET /api/student-log`（兼容）
- `POST /api/session/bootstrap`
- `GET /api/courses`（空兼容响应）
- `GET /api/course-status`（空兼容响应）
- `POST /api/refresh-courses`（空兼容响应）
- `GET /api/components-manifest`（空兼容响应）

## 当前 Socket 责任

服务端只直接管理这些保留事件：

- `role-assigned`
- `identity-rejected`
- `participant-joined`
- `participant-left`

其他课堂域事件只做转发，不在 core 里维护状态。

## 说明

如果需要课堂控制、投票、标注、学生监控等业务能力，请接入 teacher 端服务，而不是继续向 core 增加状态逻辑。
