# 02 启动模式

## 1. `start:teacher`

用途：
- 启动教师端原生桌面壳（C++ + WebView2）
- 同时拉起教师端本地服务

## 2. `start:teacher-server`

用途：
- 仅启动教师端服务
- 不启动桌面壳

## 3. `start:student`

用途：
- 启动学生端原生桌面壳（C++ + WebView2）
- 连接教师端并同步课堂状态

## 4. `start:core`

用途：
- 启动独立 runtime 服务
- 用于协议调试与能力拆分验证

## 5. 推荐模式

当前主链路建议：
- 教师端：`start:teacher`
- 学生端：`start:student`
- 服务联调：`start:teacher-server`
