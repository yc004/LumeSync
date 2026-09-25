# 02 系统架构

## 1. 总体结构

```text
Teacher Native Shell (C++/WebView2)
  -> Teacher Server (Node.js/Express + Socket)
  -> Course files / submissions / classroom state

Student Native Shell (C++/WebView2)
  -> Connects to teacher server
  -> Receives state sync and renders course pages

Core Repo
  -> Runtime protocol & sync capability extraction

Editor Plugin
  -> Local .lume preview only
```

## 2. 仓库边界

### `repos/core`

负责：
- Socket 会话与同步事件能力
- runtime-control / render-engine 相关抽象

不负责：
- 教师端课程文件管理
- 教师端提交落盘
- 教师端业务 API

### `repos/teacher`

负责：
- 教师端 C++ 原生壳（WebView2）
- 教师端本地服务（HTTP + Socket）
- 课程、布局、提交目录和课堂控制

### `repos/student`

负责：
- 学生端 C++ 原生壳（WebView2）
- Windows 守护服务与安装器
- 学生端配置、本地管理页、离线页

### `repos/editor-plugin`

负责：
- `.lume` 文件本地预览与编辑辅助

## 3. 关键结论

- 教师/学生桌面宿主均为原生 C++ + WebView2，不再依赖 Electron。
- 教师端是课堂数据面的唯一来源。
- 学生端只消费教师端提供的课堂状态与资源。
