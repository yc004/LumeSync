# 02 运行时事件说明

## 1. 课堂常见事件

当前运行时中，课堂主链路覆盖以下事件：

- `select-course`
- `sync-slide`
- `host-settings`
- `interaction:sync`
- `student:submit`
- `vote:start`
- `vote:submit`
- `vote:end`
- `annotation:add`
- `annotation:stroke`
- `annotation:clear`

## 2. 事件方向

教师端到学生端：

- 选课
- 翻页
- 设置同步
- 投票开始与结束
- 标注同步

学生端到教师端：

- 提交
- 投票结果
- 异常告警
- 同步状态请求

运行时广播：

- 课程变化
- 课程结束
- 学生状态更新
- 投票实时统计

## 3. 设计原则

- 控制事件走运行时
- 业务文件走教师端
- 渲染只消费 URL 和状态
