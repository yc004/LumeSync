# 源码迁移记录

更新：2026-09-27。教师、学生和 Core 已从原 Git 子模块按下表锁定提交导入根仓。当前工作区的正式源码位于 `apps/` 和 `packages/`；根 `.gitmodules` 与 `repos/` 检出已移除。旧 AI Editor 与 VS Code 插件不进入目标架构。

| 来源仓库 | 导入提交 | 当前目录 | 说明 |
| --- | --- | --- | --- |
| LumeSync-Teacher | `ea2c0bd8ab03c42508842f7ee3a05b5a324722a4` | `apps/teacher/` | 原 `shared/teacher-shell` 已移至 `ui/`；原 Windows 壳仍在 `native/`，跨平台 Electron 壳在 `desktop/` |
| LumeSync-Student | `e8d5c780d2ffcddef07e44a198d461efe0aab593` | `apps/student/` | 原 `native/` 已移至 `desktop/`，课堂 UI 仍在 `ui/classroom/` |
| LumeSync-Core | `35bec94dcce0173597e5c2a34d4c64d7e078d65b` | `packages/course-runtime/` | 包名暂保留 `@lumesync/core` 以维持现有导入协议 |

导入使用对应提交的受版本控制文件；子仓的 `.git` 元数据、独立 CI、重复 npm 锁文件和过期 `dist.stale` 未作为产品源码保留。长期来源以表中提交为准。根仓 `HEAD` 仍记录迁移前的 gitlink，待本次改动提交后由普通文件替代。

目录调整不会自动完成新架构的行为迁移。`packages/course-runtime` 仍包含旧 Core 的浏览器代码路径，教师 UI 与 Hub 的统一接线、隔离播放器和 Windows 实机验收仍见[实施 TODO](todo.md)。

## 历史快照

2026-09-25 首次审查时，学生端和 Core 的早期 gitlink 无法从可访问远端取得；该情况已随之后更新的锁定提交和本次源码导入结束。早期[审查报告](audit.md)和架构评估保留当时证据，不应用来推断当前检出状态。
