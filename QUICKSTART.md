# SyncClassroom 快速开始指南

## 重构完成！

你的项目已经成功重构为清晰的多应用结构。以下是使用新结构的快速指南。

## 项目结构概览

```
SyncClassroom/
├── packages/           # 共享包
│   ├── engine/        # 渲染引擎（所有端公用）
│   └── server/        # 服务器
├── apps/              # 应用
│   ├── teacher/       # 教师端
│   ├── student/       # 学生端
│   └── editor/        # 编辑器端
└── shared/            # 共享资源
```

## 快速开始

### 1. 启动服务器

```bash
npm start
```

服务器将在 http://localhost:3000 启动。

### 2. 启动教师端

```bash
npm run start:teacher
```

教师端将启动内置服务器并打开教师控制界面。

### 3. 启动学生端

```bash
npm run start:student
```

学生端将连接到教师端（默认配置下连接到 http://192.168.1.100:3000）。

### 4. 启动编辑器

```bash
npm run start:editor
```

编辑器将在 http://localhost:3001 启动。

## 构建安装包

### 构建单个端

```bash
npm run build:teacher    # 构建教师端
npm run build:student    # 构建学生端
npm run build:editor     # 构建编辑器
```

### 构建所有端

```bash
npm run build:all
```

安装包将输出到 `dist/` 目录：
- `dist/teacher/` - 教师端安装包
- `dist/student/` - 学生端安装包
- `dist/editor/` - 编辑器安装包

## 开发工作流

### 修改渲染引擎

1. 编辑 `packages/engine/src/` 中的文件
2. 重新启动对应的应用（教师端/学生端/编辑器端）
3. 引擎代码会自动重新加载（通过 Babel 实时编译）

### 修改服务器

1. 编辑 `packages/server/src/` 中的文件
2. 重启服务器或应用
3. 服务器代码需要重启才能生效

### 修改教师端

1. 编辑 `apps/teacher/electron/main.js` 或 `apps/teacher/public/index.html`
2. 重新启动教师端

### 修改学生端

1. 编辑 `apps/student/electron/main.js`
2. 重新启动学生端

### 修改编辑器

1. 编辑 `apps/editor/electron/main.js` 或 `apps/editor/public/editor/` 中的文件
2. 重新启动编辑器

## 验证项目结构

运行验证脚本检查项目结构是否正确：

```bash
node verify-structure.js
```

## 旧文件保留

为了向后兼容，以下旧目录仍然保留：

- `public/` - 推荐使用 `shared/public/`
- `server/` - 推荐使用 `packages/server/`
- `electron/` - 推荐使用 `apps/*/electron/`
- `assets/` - 推荐使用 `shared/assets/`
- `build/` - 推荐使用 `shared/build/`
- `docs/` - 推荐使用 `shared/docs/`

**注意**: 旧的启动命令（如 `electron electron/main-teacher.js`）仍然可以使用，但推荐使用新的 npm 脚本。

## 常见问题

### Q: 如何切换学生端连接的教师 IP？

编辑 `apps/student/electron/main.js` 中的 `config.teacherIp`，或在学生端的管理员设置中修改。

### Q: 如何添加新的课件？

将课件文件放到 `shared/public/courses/` 目录，刷新教师端即可识别。

### Q: 如何修改默认端口？

编辑以下文件：
- 教师端：`packages/server/index.js` 中的 `config.port`
- 编辑器：`apps/editor/electron/main.js` 中的 `PORT`

### Q: 如何添加新的共享组件？

在 `packages/engine/src/components/` 中创建组件文件，在 HTML 中通过 `<script type="text/babel" src="/engine/src/components/YourComponent.js">` 引入。

## 文档位置

- 项目说明：`README-NEW.md`
- 重构计划：`REFACTORING_PLAN.md`
- 重构总结：`REFACTORING_SUMMARY.md`
- 用户文档：`shared/docs/user/`
- 开发文档：`shared/docs/dev/`
- 组件文档：`shared/docs/components/`

## 下一步

1. 测试各端功能是否正常
2. 根据需要修改配置
3. 开发新的课件
4. 构建安装包进行测试

## 需要帮助？

如果遇到问题：

1. 检查 `verify-structure.js` 的输出
2. 查看控制台日志
3. 参考文档：`shared/docs/`
4. 查看 REFACTORING_SUMMARY.md 了解详细的重构说明

---

恭喜！你的项目已经成功重构！🎉
