# 01 快速开始

## 1. 克隆并初始化

```bash
git clone --recurse-submodules https://github.com/yc004/SyncClassroom.git
cd SyncClassroom
pnpm run repos:init
pnpm install
```

## 2. 常用启动命令

```bash
pnpm run start:teacher
pnpm run start:teacher-server
pnpm run start:student
pnpm run start:core
```

## 3. 典型使用流程

### 正式课堂

1. 教师机启动 `pnpm run start:teacher`
2. 学生机启动 `pnpm run start:student`
3. 学生端连接教师机地址（默认 `http://<teacher-ip>:3000`）

### API 联调

1. 执行 `pnpm run start:teacher-server`
2. 通过浏览器或脚本访问教师端 API

### Runtime 独立调试

1. 执行 `pnpm run start:core`
2. 用于协议与同步能力验证
