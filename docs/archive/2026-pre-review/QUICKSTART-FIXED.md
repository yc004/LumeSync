# Quick Start

本文是最短启动路径。更完整的运行说明见 [docs/02-operations/01-quick-start.md](docs/02-operations/01-quick-start.md)。

## 1. 克隆并初始化

```bash
git clone --recurse-submodules https://github.com/yc004/SyncClassroom.git
cd SyncClassroom
npm run repos:init
```

## 2. 直接从根目录启动

```bash
npm run start:teacher
npm run start:student
```

调试服务时也可以单独启动：

```bash
npm run start:teacher-server
npm run start:core
```

## 3. 推荐运行顺序

1. 先启动教师端或教师服务
2. 再启动学生端
3. 学生端输入教师机地址后连接课堂

## 4. 提交代码

不要在根仓直接维护业务代码。进入对应子仓库后直接提交：

```bash
cd repos/teacher
git add .
git commit -m "feat: your change"
git push
```

如果需要在根仓记录新的子模块指针：

```bash
cd ../../
git add repos
git commit -m "chore: update submodule pointers"
git push
```
