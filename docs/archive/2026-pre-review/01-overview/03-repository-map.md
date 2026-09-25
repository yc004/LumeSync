# 03 仓库地图

## 1. 根仓角色

根仓不是业务代码主仓，而是整个系统的总入口。它负责：

- 统一文档
- 统一运行入口
- 子模块管理
- 记录各子仓提交指针

## 2. 子仓库一览

| 仓库 | 本地路径 | 主要职责 |
|---|---|---|
| `LumeSync-Core` | `repos/core` | 运行时内核、事件总线、渲染运行时 |
| `LumeSync-Teacher` | `repos/teacher` | 教师端应用、教师服务、课程与文件管理 |
| `LumeSync-Student` | `repos/student` | 学生端应用、课堂展示与互动 |
| `LumeSync-Editor-Plugin` | `repos/editor-plugin` | 本地课件预览与编辑插件 |

## 3. 根仓与子仓如何配合

- 业务开发：在对应子仓内完成。
- 根仓提交：只记录文档变化和子模块指针变化。
- 根仓不再承担“拆分导出”的职责。

## 4. 推荐阅读路径

- 项目负责人：先看 [系统架构](./02-system-architecture.md)
- 运维或部署人员：看 [快速开始](../02-operations/01-quick-start.md)
- 教师用户：看 [教师端使用说明](../03-teacher-guide/01-teacher-desktop.md)
- 开发者：看 [课件编写说明](../05-course-development/01-course-authoring.md)
