# LumeSync 服务器

## 说明

此包提供 SyncClassroom 的 Express 服务器和 Socket.io 服务。

## 结构

```
packages/server/
├── index.js                 # 服务器入口
├── src/
│   ├── config.js           # 配置管理
│   ├── courses.js          # 课程管理
│   ├── data.js             # 数据管理
│   ├── proxy.js            # CDN 代理
│   ├── routes.js           # API 路由
│   ├── socket.js           # Socket.io 处理
│   ├── submissions.js      # 学生提交
│   └── utils.js            # 工具函数
└── dist/                    # 构建输出（如果需要）
```

## 环境变量

- `PORT` - 服务器端口（默认 3000）
- `CHCP` - 控制台代码页（Windows 用）
- `LOG_DIR` - 日志目录
- `STATIC_DIR` - 静态文件目录（默认 ../../shared/public）

## 使用方式

### 直接启动

```bash
node packages/server/index.js
```

### 作为模块使用

```javascript
const { startServer } = require('@lumesync/server');

// 启动服务器
startServer(3000);
```

### 在 Electron 中使用

```javascript
const { spawn } = require('child_process');
const path = require('path');

const serverPath = path.join(__dirname, '../../packages/server/index.js');
const serverProcess = spawn('node', [serverPath], {
    env: {
        ...process.env,
        PORT: '3000'
    }
});
```

## API 端点

### 课程相关

- `GET /api/courses` - 获取课程列表
- `GET /api/courses/:id` - 获取课程详情
- `DELETE /api/courses/:id` - 删除课程

### 数据相关

- `GET /api/data` - 获取文件夹数据
- `POST /api/data` - 创建文件夹
- `PUT /api/data/:id` - 更新文件夹
- `DELETE /api/data/:id` - 删除文件夹

### 学生相关

- `GET /api/students` - 获取在线学生列表
- `GET /api/student-log` - 获取学生操作日志

### 知识库相关

- `GET /api/knowledge/categories` - 获取知识分类
- `GET /api/knowledge/search` - 搜索知识

## Socket.io 事件

### 教师端发送

- `join-teacher` - 教师加入
- `set-course` - 设置当前课程
- `set-slide` - 设置当前幻灯片
- `class-start` - 开始上课
- `class-end` - 结束上课
- `sync-interaction` - 同步交互

### 学生端发送

- `join-student` - 学生加入
- `student-submit` - 学生提交
- `sync-interaction` - 同步交互

### 服务器广播

- `student-joined` - 学生加入
- `student-left` - 学生离开
- `course-changed` - 课程改变
- `slide-changed` - 幻灯片改变
- `class-started` - 开始上课
- `class-ended` - 结束上课
- `interaction-sync` - 交互同步
