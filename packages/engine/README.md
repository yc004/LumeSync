# LumeSync 渲染引擎

## 说明

此包提供 SyncClassroom 的渲染引擎和共享组件。

## 结构

```
packages/engine/
├── index.js                 # 入口文件
├── src/
│   ├── globals.js          # 全局函数和 hooks
│   ├── components/         # 共享组件
│   │   ├── WindowControls.js
│   │   ├── SurveySlide.js
│   │   ├── VoteSlide.js
│   │   ├── WebPageSlide.js
│   │   └── LogViewer.js
│   └── utils/              # 工具函数
└── dist/                   # 构建输出（如果需要）
```

## 使用方式

### 在 HTML 中使用

```html
<!-- 加载引擎 -->
<script type="text/babel" src="/engine/00-globals.js"></script>
<script type="text/babel" src="/engine/01-settings-panel.js"></script>
<!-- ... -->

<!-- 使用组件 -->
<WindowControls />
<SurveySlide />
```

### 导出的全局对象

- `window.__LumeSyncCanvas` - Canvas 相关工具函数
- `window.__LumeSyncUI` - UI 相关组件和函数
- `window.CourseGlobalContext` - 课程全局上下文

## 组件列表

- **WindowControls** - 窗口控制按钮（最小化、最大化、关闭）
- **SurveySlide** - 问卷通用组件
- **VoteSlide** - 投票组件
- **WebPageSlide** - 网页嵌入组件
- **LogViewer** - 日志查看器

## 工具函数

### Canvas 工具

- `getCanvasPoint(evt, canvas)` - 获取 Canvas 上的坐标点
- `getHiDpiContext2d(canvas, w, h)` - 获取高 DPI Canvas 2D 上下文
- `useCanvasDims(padL, padR, padT, padB)` - 使用 Canvas 尺寸的 hook

### UI 工具

- `SideToolbar` - 侧边工具栏组件
- `usePresence(visible, exitMs)` - 显示/消失动画 hook
- `relayoutSideToolbars()` - 重新布局侧边工具栏

## 开发说明

引擎设计为在浏览器环境中直接使用，通过 Babel 实时编译。不需要构建步骤。
