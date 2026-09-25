# 03 子模块协作

## 1. 为什么采用子模块

目标是让本地目录结构和云端仓库结构完全一致，不再依赖导出脚本或同步脚本。

## 2. 基本规则

- `repos/*` 下的每个目录都是一个真实 Git 仓库。
- 改哪个端，就进入哪个子仓提交和推送。
- 根仓只提交文档和子模块指针更新。

## 3. 日常开发

```bash
cd repos/teacher
git add .
git commit -m "feat: ..."
git push
```

其他端相同：

- `repos/core`
- `repos/student`
- `repos/editor-plugin`

## 4. 更新根仓指针

当子仓有新提交后，如需在根仓记录最新版：

```bash
cd ../../
git add repos
git commit -m "chore: update submodule pointers"
git push
```

## 5. 初始化与同步

```bash
npm run repos:init
npm run repos:update
```
