# SyncClassroom 项目重构方案

## 当前问题

1. **结构混乱**: 一个项目包含三个端（教师端、学生端、编辑器端），耦合性强
2. **代码重复**: 各端之间有很多重复代码
3. **渲染引擎不清晰**: 渲染引擎分散在 `public/engine/` 中，没有明确的管理
4. **构建配置复杂**: 三个构建配置文件有大量重复内容

## 重构目标

1. **端分离**: 将三个端分离为独立的应用
2. **渲染引擎公用**: 提取渲染引擎为共享包
3. **服务端共享**: 服务端作为共享包
4. **减少耦合**: 清晰的依赖关系
5. **保证功能**: 重构后所有功能正常运行

## 新项目结构

```
SyncClassroom/
├── packages/                          # 共享包
│   ├── engine/                        # 渲染引擎包
│   │   ├── package.json
│   │   ├── index.js                   # 引擎入口
│   │   ├── src/
│   │   │   ├── globals.js             # 全局函数和 hooks
│   │   │   ├── components/            # 共享组件
│   │   │   │   ├── WindowControls.js
│   │   │   │   ├── SurveySlide.js
│   │   │   │   ├── VoteSlide.js
│   │   │   │   ├── WebPageSlide.js
│   │   │   │   └── LogViewer.js
│   │   │   └── utils/
│   │   └── dist/                      # 构建输出
│   │
│   └── server/                        # 服务端包
│       ├── package.json
│       ├── index.js                   # 服务器入口
│       ├── src/
│       │   ├── config.js
│       │   ├── courses.js
│       │   ├── data.js
│       │   ├── proxy.js
│       │   ├── routes.js
│       │   ├── socket.js
│       │   ├── submissions.js
│       │   └── utils.js
│       └── dist/                      # 构建输出
│
├── apps/                              # 应用
│   ├── common/                        # 公共资源
│   │   ├── assets/                    # 图标、图片等
│   │   └── electron/                  # 公共 Electron 代码
│   │       ├── preload.js
│   │       ├── config.js
│   │       └── logger.js
│   │
│   ├── teacher/                       # 教师端应用
│   │   ├── package.json
│   │   ├── electron/
│   │   │   └── main.js                # 教师端主进程
│   │   ├── public/
│   │   │   ├── index.html
│   │   │   └── courses/               # 课件目录（可选，默认使用共享的）
│   │   └── electron-builder.json
│   │
│   ├── student/                       # 学生端应用
│   │   ├── package.json
│   │   ├── electron/
│   │   │   └── main.js                # 学生端主进程
│   │   ├── public/
│   │   │   ├── index.html
│   │   │   ├── admin.html
│   │   │   └── offline.html
│   │   └── electron-builder.json
│   │
│   └── editor/                        # 编辑器应用
│       ├── package.json
│       ├── electron/
│       │   └── main.js                # 编辑器主进程
│       ├── public/
│       │   ├── index.html
│       │   └── editor/                # 编辑器特定代码
│       └── electron-builder.json
│
├── shared/                            # 共享资源（旧版本兼容）
│   ├── public/                        # 公共 HTML、CSS、JS
│   │   ├── lib/                       # 第三方库缓存
│   │   ├── webfonts/
│   │   ├── weights/
│   │   ├── courses/                   # 课件目录
│   │   ├── knowledge/                 # 知识库
│   │   └── data/                      # 数据目录
│   └── docs/                          # 文档
│
├── package.json                       # 根 package.json（工作区管理）
├── pnpm-workspace.yaml               # PNPM 工作区配置（可选）
├── package-lock.json
└── README.md
```

## 包的职责

### packages/engine
- **职责**: 提供渲染引擎和共享组件
- **包含**:
  - 全局函数和 hooks（getCanvasPoint, useCanvasDims, SideToolbar 等）
  - 共享组件（WindowControls, SurveySlide, VoteSlide 等）
  - 工具函数
- **依赖**: 无（纯前端代码）

### packages/server
- **职责**: 提供 Express 服务器和 Socket.io 服务
- **包含**:
  - Express 服务器
  - Socket.io 处理
  - API 路由
  - 课程管理
  - 数据管理
  - CDN 代理
- **依赖**: express, socket.io, better-sqlite3 等

### apps/teacher
- **职责**: 教师端桌面应用
- **包含**:
  - Electron 主进程（启动服务器，打开教师端窗口）
  - 教师端 HTML
  - 教师端特定逻辑
- **依赖**: packages/server, packages/engine

### apps/student
- **职责**: 学生端桌面应用
- **包含**:
  - Electron 主进程（连接教师端服务器）
  - 学生端 HTML
  - 学生端特定逻辑（全屏锁定、管理员设置等）
- **依赖**: packages/engine

### apps/editor
- **职责**: AI 课件编辑器
- **包含**:
  - Electron 主进程（启动本地服务器）
  - 编辑器 HTML
  - 编辑器特定逻辑（AI 聊天、课件编辑等）
- **依赖**: packages/server, packages/engine

## 实施步骤

1. **创建目录结构** - 按照上述结构创建目录
2. **提取渲染引擎** - 将 `public/engine/` 和 `public/components/` 移动到 `packages/engine/`
3. **提取服务端** - 将 `server/` 移动到 `packages/server/`
4. **创建应用** - 创建三个应用的基本结构
5. **更新构建配置** - 更新 electron-builder 配置
6. **更新 package.json** - 添加工作区支持和新的脚本
7. **测试验证** - 确保所有功能正常工作

## 迁移策略

### 阶段一：准备工作
1. 创建新的目录结构
2. 设置 PNPM/Yarn 工作区（可选，便于开发）
3. 准备基础配置文件

### 阶段二：提取共享包
1. 提取渲染引擎到 `packages/engine`
2. 提取服务端到 `packages/server`
3. 为每个包创建 `package.json`

### 阶段三：创建应用
1. 创建教师端应用 `apps/teacher`
2. 创建学生端应用 `apps/student`
3. 创建编辑器应用 `apps/editor`

### 阶段四：配置和构建
1. 更新构建配置
2. 更新根 `package.json`
3. 测试构建过程

### 阶段五：验证和清理
1. 测试所有端的功能
2. 清理旧代码
3. 更新文档

## 注意事项

1. **向后兼容**: 保持旧版本结构可工作一段时间
2. **渐进式迁移**: 可以先保持旧版本运行，逐步迁移
3. **测试覆盖**: 每个步骤都要测试
4. **文档更新**: 及时更新文档

## 预期效果

重构后的项目将具有以下优点：

1. **清晰的结构**: 每个应用职责明确
2. **低耦合**: 应用之间通过共享包交互
3. **高内聚**: 相关代码在一起
4. **易维护**: 修改某个端不影响其他端
5. **易扩展**: 添加新端更容易
6. **独立开发**: 每个应用可以独立开发测试

## 兼容性考虑

为了保持向后兼容，我们可以在一段时间内保留旧的结构：

```
SyncClassroom/
├── public/          # 保留，但标记为 deprecated
├── server/          # 保留，但标记为 deprecated
├── electron/        # 保留，但标记为 deprecated
├── packages/        # 新的共享包
└── apps/            # 新的应用结构
```

在稳定运行一段时间后，可以逐步删除旧代码。
