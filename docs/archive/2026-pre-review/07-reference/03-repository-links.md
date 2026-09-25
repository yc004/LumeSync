# 仓库链接

本节用于说明整套系统的仓库划分、职责边界和本地路径。

## 根仓库

- `SyncClassroom`
- 作用：系统总览、文档、根级启动脚本、子模块管理
- 本地路径：仓库根目录
- 远端地址：[https://github.com/yc004/SyncClassroom](https://github.com/yc004/SyncClassroom)

## 子仓库清单

### Core

- 仓库名：`LumeSync-Core`
- 职责：连接控制、课堂状态同步、Socket 事件总线、渲染运行时
- 本地路径：`repos/core`
- 远端地址：[https://github.com/yc004/LumeSync-Core](https://github.com/yc004/LumeSync-Core)

### Teacher

- 仓库名：`LumeSync-Teacher`
- 职责：课件与文件管理、教师桌面端、教师侧服务、课堂管理入口
- 本地路径：`repos/teacher`
- 远端地址：[https://github.com/yc004/LumeSync-Teacher](https://github.com/yc004/LumeSync-Teacher)

### Student

- 仓库名：`LumeSync-Student`
- 职责：学生桌面端、课堂接入、状态渲染、互动提交
- 本地路径：`repos/student`
- 远端地址：[https://github.com/yc004/LumeSync-Student](https://github.com/yc004/LumeSync-Student)

### Editor Plugin

- 仓库名：`LumeSync-Editor-Plugin`
- 职责：`.lume` 本地预览、编辑辅助、课件开发配套工具
- 本地路径：`repos/editor-plugin`
- 远端地址：[https://github.com/yc004/LumeSync-Editor-Plugin](https://github.com/yc004/LumeSync-Editor-Plugin)

## 推荐开发方式

1. 在对应子仓库内完成业务开发和提交
2. 根仓只维护文档、脚本和子模块引用
3. 需要同步根仓指针时，再提交根仓中的 `repos/*` 引用变化

## 推荐发布顺序

1. `core`
2. `teacher`
3. `student`
4. `editor-plugin`
