# Quick Start (Submodule Workflow)

## 1) Clone with submodules

```bash
git clone --recurse-submodules https://github.com/yc004/SyncClassroom.git
cd SyncClassroom
npm run repos:init
```

## 2) Work in target repository directly

Teacher example:

```bash
cd repos/teacher
npm install
npm run start
```

Core example:

```bash
cd ../core
npm install
npm start
```

Student example:

```bash
cd ../student
npm install
npm run start
```

## Root scripts (start specified app)

```bash
npm run start:core
npm run start:teacher
npm run start:teacher-server
npm run start:student
```

## 3) Push directly (no export script)

```bash
cd repos/<target-repo>
git add .
git commit -m "your change"
git push
```

## 4) Update root pointers (optional)

当子仓库有新提交后，如需在根仓记录最新引用：

```bash
cd ../../
git add repos
git commit -m "chore: update submodule pointers"
git push
```
