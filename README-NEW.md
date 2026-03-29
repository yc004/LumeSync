# 萤火互动课堂（SyncClassroom / LumeSync）

基于 React + Electron 的低延迟局域网互动教学系统，包含教师端、学生端，以及 AI 课件编辑器（LumeSync Editor）。

## 项目结构（重构后）

```
SyncClassroom/
├── packages/                          # 共享包
│   ├── engine/                        # 渲染引擎包
│   │   ├── package.json
│   │   ├── index.js                   # 引擎入口
│   │   ├── src/                       # 引擎源码
│   │   │   ├── 00-globals.js         # 全局函数和 hooks
│   │   │   ├── 01-settings-panel.js
│   │   │   ├── ...                   # 其他引擎模块
│   │   │   └── components/            # 共享组件
│   │   │       ├── WindowControls.js
│   │   │       ├── SurveySlide.js
│   │   │       └── ...
│   │   └── README.md
│   │
│   └── server/                        # 服务器包
│       ├── package.json
│       ├── index.js                   # 服务器入口
│       ├── src/                       # 服务器源码
│       │   ├── config.js
│       │   ├── courses.js
│       │   ├── socket.js
│       │   └── ...
│       └── README.md
│
├── apps/                              # 应用
│   ├── common/                        # 公共代码
│   │   └── electron/
│   │       ├── preload.js             # IPC 桥接
│   │       ├── config.js              # 配置管理
│   │       ├── logger.js              # 日志系统
│   │       └── task-scheduler-autostart.js
│   │
│   ├── teacher/                       # 教师端应用
│   │   ├── package.json
│   │   ├── electron/main.js           # 教师端主进程
│   │   ├── public/index.html          # 教师端页面
│   │   └── electron-builder.json      # 构建配置
│   │
│   ├── student/                       # 学生端应用
│   │   ├── package.json
│   │   ├── electron/main.js           # 学生端主进程
│   │   ├── public/index.html
│   │   ├── public/admin.html          # 管理员页面
│   │   ├── public/offline.html        # 离线提示页
│   │   └── electron-builder.json
│   │
│   └── editor/                        # 编辑器应用
│       ├── package.json
│       ├── electron/main.js           # 编辑器主进程
│       ├── public/editor.html         # 编辑器页面
│       ├── public/editor/             # 编辑器代码
│       └── electron-builder.json
│
├── shared/                            # 共享资源
│   ├── public/                        # 公共 HTML/CSS/JS
│   │   ├── lib/                       # 第三方库
│   │   ├── webfonts/
│   │   ├── weights/
│   │   ├── courses/                   # 课件目录
│   │   ├── knowledge/                 # 知识库
│   │   └── data/                      # 数据目录
│   ├── assets/                        # 图标、图片
│   ├── build/                         # 构建相关文件
│   └── docs/                          # 文档
│
├── migrate-*.js                       # 迁移脚本
├── package.json                       # 根 package.json（工作区管理）
└── REFACTORING_PLAN.md                # 重构计划文档
```

## 快速开始

### 环境要求

- Node.js 18+
- Python 3.x（仅在打包/生成图标时需要）

### 启动服务端（Web 版本）

```bash
npm install
npm start
```

访问：
- 教师端（Host）：http://localhost:3000
- 学生端（Viewer）：http://<局域网IP>:3000

### 启动桌面端（Electron）

```bash
npm install
npm run start:teacher    # 教师端
npm run start:student     # 学生端
npm run start:editor     # 编辑器
```

### 打包

```bash
# 一键打包（生成教师端 + 学生端 + 编辑器安装包）
npm run build:all

# 或分步执行
npm run build:teacher
npm run build:student
npm run build:editor
```

## 功能概览

- **课堂同步**：基于 Socket.io 的局域网实时同步（翻页、课程切换、学生状态等）
- **教师交互同步**：教师可开启同步，将操作实时同步到所有学生端（点击、拖拽、面板切换等）
- **课件热加载**：课件为纯文本脚本，运行时由 Babel 编译执行，无需构建工具
- **AI 课件编辑器**：对话式生成互动课件，实时预览 + 源码编辑（16:9 预览比例）
- **跨端桌面应用**：教师端 / 学生端 / 编辑器均提供独立安装包
- **离线资源缓存**：课件依赖的 CDN 资源会自动下载并缓存到本地
- **内容缩放**：教师端"课堂设置"可调课件内容缩放（60%～120%），降低溢出风险
- **多班级管理**：机房视图支持创建和管理多个班级的座位表，适用于一个机房服务于多个班级的场景

## 课件文件格式（.lume）

项目使用自有课件后缀 `.lume`（内容仍是可执行的 TSX/JSX/TS/JS 脚本文本）。

- 教师端导入/导出、编辑器打开/保存统一使用 `.lume`
- 服务端扫描 `shared/public/courses/` 时支持 `.lume`，并兼容旧格式（`.tsx/.ts/.jsx/.js`）
- 教师/学生端渲染使用固定 1280×720 画布并按窗口缩放显示，尽量保证显示一致性

## 包说明

### packages/engine - 渲染引擎

提供所有应用共用的渲染引擎和组件：

- 全局函数和 hooks（getCanvasPoint, useCanvasDims, SideToolbar 等）
- 共享组件（WindowControls, SurveySlide, VoteSlide 等）
- 工具函数

**特点**：纯前端代码，无需构建，通过 Babel 实时编译。

### packages/server - 服务器

提供 Express 服务器和 Socket.io 服务：

- Express HTTP 服务器
- Socket.io 实时通信
- 课程管理 API
- 数据管理 API
- CDN 资源代理和缓存
- 学生提交管理

**特点**：教师端和编辑器端都依赖此包，教师端启动服务器，编辑器端启动独立服务器。

### apps/teacher - 教师端

教师桌面应用：

- 启动本地服务器（3000 端口）
- 提供教师控制界面
- 管理课程和学生
- 同步操作到学生端

**依赖**：packages/server, packages/engine

### apps/student - 学生端

学生桌面应用：

- 连接到教师端服务器
- 接收教师的同步指令
- 全屏锁定（可选）
- 管理员设置（需要密码）

**依赖**：packages/engine（不依赖 server，通过连接教师端）

### apps/editor - 编辑器端

AI 课件编辑器：

- 启动本地服务器（3001 端口）
- AI 对话生成课件
- 实时预览和编辑
- 知识库管理

**依赖**：packages/server, packages/engine

## 重构说明

### 新旧结构对比

**旧结构**：
- 所有代码混在一个项目中
- 三个端共享同一个代码库
- 耦合性强，难以维护

**新结构**：
- 三个端独立为应用
- 渲染引擎和服务端提取为共享包
- 清晰的依赖关系
- 易于维护和扩展

### 向后兼容

为了确保平滑过渡，旧的文件结构仍然保留：

- `public/` - 保留，但推荐使用 `shared/public/`
- `server/` - 保留，但推荐使用 `packages/server/`
- `electron/` - 保留，但推荐使用 `apps/*/electron/`
- `assets/` - 保留，但推荐使用 `shared/assets/`
- `build/` - 保留，但推荐使用 `shared/build/`
- `docs/` - 保留，但推荐使用 `shared/docs/`

确认一切正常后，可以删除这些旧目录。

### 迁移说明

项目已经包含完整的迁移脚本：

1. `migrate-all.js` - 执行所有迁移
2. `migrate-server.js` - 迁移服务器代码
3. `migrate-engine.js` - 迁移渲染引擎
4. `migrate-teacher.js` - 迁移教师端
5. `migrate-student.js` - 迁移学生端
6. `migrate-editor.js` - 迁移编辑器端
7. `migrate-shared.js` - 迁移共享资源

**注意**：迁移脚本已经自动执行过一次。如果需要重新迁移，可以手动运行对应脚本。

## 开发指南

### 添加新的共享组件

1. 在 `packages/engine/src/components/` 中创建组件文件
2. 在 HTML 中通过 `<script type="text/babel" src="/engine/src/components/YourComponent.js">` 引入
3. 组件会自动注册到全局，可以直接使用

### 添加新的服务器 API

1. 在 `packages/server/src/routes.js` 中添加路由
2. 在对应的业务模块中实现逻辑
3. 更新 API 文档

### 修改某个端

1. 进入对应的应用目录（如 `apps/teacher`）
2. 修改主进程或页面代码
3. 本地测试：`npm run start:teacher`
4. 构建测试：`npm run build:teacher`

## 文档

详细文档位于 `shared/docs/` 目录：

- `user/` - 用户使用说明
- `dev/` - 开发者文档
- `components/` - 组件使用指南
- `interaction/` - 交互同步系统
- `ai/` - AI 相关功能

## 许可证

[MIT](https://opensource.org/licenses/MIT)

## 贡献

欢迎贡献代码、报告问题或提出建议！

## 联系方式

如有问题，请通过以下方式联系：

- GitHub Issues
- 项目文档：`shared/docs/`
