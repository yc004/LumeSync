# SyncClassroom Root Repository

这个仓库现在是 **主控仓（super-repo）**，用于统一文档与子仓库入口。

## 子仓库（直接开发、直接推送）

- [LumeSync-Core](https://github.com/yc004/LumeSync-Core) -> `repos/core`
- [LumeSync-Teacher](https://github.com/yc004/LumeSync-Teacher) -> `repos/teacher`
- [LumeSync-Student](https://github.com/yc004/LumeSync-Student) -> `repos/student`
- [LumeSync-Editor-Plugin](https://github.com/yc004/LumeSync-Editor-Plugin) -> `repos/editor-plugin`

## 本地初始化

```bash
git clone --recurse-submodules https://github.com/yc004/SyncClassroom.git
cd SyncClassroom
npm run repos:init
```

## 日常开发

直接在对应子仓库目录操作：

```bash
cd repos/teacher
# 修改代码后
 git add .
 git commit -m "feat: ..."
 git push
```

其他端同理（`repos/core`、`repos/student`、`repos/editor-plugin`）。

## 根目录直接启动指定端

```bash
npm run start:core
npm run start:teacher
npm run start:teacher-server
npm run start:student
```

## 根仓职责

- 维护跨仓文档（`docs/`）
- 维护子仓库索引（`docs/REPO-LINKS.md`）
- 管理子仓库引用版本（`.gitmodules` + gitlink）

## 说明

- 根目录 `repos/*` 是当前主开发路径；根仓不再承载各端业务代码。
