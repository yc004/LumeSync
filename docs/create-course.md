# Skill: create-course

## 描述

为萤火课堂互动课堂框架创建课程文件。根据用户提供的课程主题和内容大纲，生成符合框架规范的 `.lume` 课程文件（内容仍为 TSX/JSX/TS/JS 脚本文本）。

## 调用方式

用户说"创建一个关于 XXX 的课程"或"生成 XXX 课件"时调用此 skill。

---

## ⚠️ 运行环境说明（必读，避免报错）

课程文件通过 **Babel Standalone**（预设：`react` + `typescript`）在浏览器中实时编译，再用 `new Function(compiledCode)()` 执行。这个环境与标准 Node.js 或 Webpack 项目有重要区别：

### 全局变量

以下变量**直接可用**，无需 import：

| 变量 | 来源 | 说明 |
|------|------|------|
| `React` | 全局 | React 18 |
| `useState`, `useEffect`, `useRef`, `useCallback`, `useMemo` 等 | 需从 React 解构 | 见下方写法 |
| `window.CourseData` | 全局赋值 | 课程数据出口，必须赋值 |
| `window.CourseGlobalContext` | 引擎提供 | 摄像头 API、Canvas缩放换算 API（见下方） |
| `window.CourseComponents.WebPageSlide` / `WebPageSlide` | 引擎提供 | 纯网页页组件（iframe 内嵌 + 打开兜底） |
| `window.Chart` | 加载后可用 | Chart.js（需在 dependencies 中声明） |
| `window.katex` | 加载后可用 | KaTeX（需在 dependencies 中声明） |
| `window._` | 加载后可用 | Lodash（需在 dependencies 中声明） |

**正确写法（文件第一行）：**
```tsx
const { useState, useEffect, useRef, useCallback, useMemo } = React;
```

**❌ 绝对禁止：**
```tsx
import React from 'react';           // 报错：不支持 ES Module import
import { useState } from 'react';    // 报错：同上
require('react');                    // 报错：不支持 require
export default function ...          // 报错：不支持 export
```

### TypeScript 支持

课程文件使用 `.lume` 扩展名（按 TSX 语法编译），支持完整的 TypeScript 类型注解：

```tsx
// 接口定义
interface SlideProps {
    title: string;
    items: string[];
}

// 类型注解
const [count, setCount] = useState<number>(0);
const [text, setText] = useState<string>('');
const ref = useRef<HTMLCanvasElement>(null);

// 函数类型
function handleClick(e: React.MouseEvent<HTMLButtonElement>): void {
    setCount(c => c + 1);
}
```

**注意：** 类型注解仅在编译时使用，运行时会被 Babel 剥离，不影响性能。

### JSX 规则

- JSX 由 Babel 编译，语法与标准 React 相同
- 组件名必须以**大写字母**开头，否则被当作 HTML 标签
- 每个组件必须返回**单一根元素**（可用 `<>...</>` Fragment 包裹）
- 属性使用 `className` 而非 `class`，`htmlFor` 而非 `for`
- 事件处理器使用驼峰命名：`onClick`、`onChange`、`onSubmit`

### 样式系统

- 使用 **Tailwind CSS**（CDN 版，支持所有标准类名）
- 使用 **FontAwesome 6**（图标类名：`fas fa-xxx`、`fab fa-xxx`）
- **不支持** CSS Modules、styled-components、内联 `<style>` 标签（会被忽略）
- 动态类名必须完整拼写，不能字符串拼接：
  ```tsx
  // ❌ 错误：Tailwind 无法识别动态拼接的类名
  className={`text-${color}-500`}
  
  // ✅ 正确：使用条件判断选择完整类名
  className={isActive ? 'text-blue-500' : 'text-slate-500'}
  ```

### 外部库使用规则

依赖库通过 `dependencies` 声明后**异步加载**，在幻灯片组件渲染时库可能尚未就绪。

**必须做防御性检查：**
```tsx
function ChartSlide() {
    const ref = useRef<HTMLCanvasElement>(null);
    const [ready, setReady] = useState<boolean>(false);

    useEffect(() => {
        // ✅ 检查库是否已加载
        if (typeof window.Chart === 'undefined') {
            setReady(false);
            return;
        }
        setReady(true);
        const ctx = ref.current!.getContext('2d')!;
        const chart = new window.Chart(ctx, { /* ... */ });
        // ✅ 组件卸载时销毁图表，防止内存泄漏
        return () => chart.destroy();
    }, []);

    if (!ready) return <div>Chart.js 加载中...</div>;
    return <canvas ref={ref}></canvas>;
}
```

**❌ 错误写法（库未加载时直接使用会报错）：**
```tsx
// 在组件顶层直接使用，库可能还没加载
const chart = new Chart(ctx, {...});   // ReferenceError
```

---

## 执行步骤

### 步骤 1：分析需求

从用户输入中提取：
- 课程主题/标题
- 目标受众（初学者/进阶）
- 内容要点/大纲
- 是否需要外部库（图表、公式、动画等）
- 是否需要摄像头

### 步骤 2：设计课程结构

规划幻灯片（建议 4-8 页）：
1. **标题页** - 课程名称、副标题、简介
2. **目录/概述页** - 课程内容概览（可选）
3. **内容页** × N - 核心知识点，每页聚焦一个主题
4. **互动/实践页** - 带 `useState` 的交互组件（可选）
5. **总结页** - 要点回顾

### 步骤 3：生成课程文件

在 `public/courses/` 目录下创建 `.lume` 文件，文件名格式：`主题关键词.lume`（小写，连字符连接）

## 渲染约定（避免溢出）

- 课程画布基准为 1280×720（16:9），教师/学生端会按窗口缩放显示
- 教师端可在“课堂设置”中调整“课件内容缩放”（60%～120%），用于缩放课件内部内容以减少溢出
- 尽量使用 `w-full h-full`/`min-h-full` 做布局，不要依赖 `vw/vh` 作为关键尺寸

### Canvas 与坐标处理（防止缩放错位）

由于课件画布可能被教师端通过 `transform: scale()` 进行整体缩放，如果使用常规的 `getBoundingClientRect` 或 `offsetX` 会导致点击坐标偏移。如果需要写交互式的 Canvas，**必须**使用引擎提供的 API：

```tsx
// 1. 获取 Canvas 点击坐标
const p = window.CourseGlobalContext?.canvas?.getCanvasPoint(e, canvasElement);
if (p) {
    console.log("真实逻辑坐标:", p.x, p.y);
    console.log("相对坐标(0-1):", p.nx, p.ny);
}

// 2. Canvas 响应式尺寸 Hook
const { wrapRef, dims } = window.CourseGlobalContext.canvas.useCanvasDims(20, 20, 10, 10); // 上右下左 padding

// 3. 获取 HiDPI context (自动处理设备像素比)
const ctx = window.CourseGlobalContext.canvas.getHiDpiContext2d(canvasElement, dims.cw, dims.ch);
```

---

## 代码规范

### 文件结构（严格按此顺序）

```tsx
// ========================================================
// 课程内容：[课程名称]
// ========================================================

// 1. 解构 React Hooks（必须在文件顶部）
const { useState, useEffect, useRef } = React;

// 2. 类型/接口定义（可选）
interface CardProps {
    title: string;
    content: string;
    color: string;
}

// 3. 常量定义（可选）
const SOME_CONSTANT = '...';

// 4. 子组件（可选，可复用的小组件）
function Card({ title, content, color }: CardProps) {
    return (
        <div className={`p-5 rounded-2xl border ${color}`}>
            <h3 className="font-bold mb-2">{title}</h3>
            <p>{content}</p>
        </div>
    );
}

// 5. 幻灯片组件（每个独立函数）
function IntroSlide() { ... }
function ContentSlide1() { ... }

// 6. 幻灯片数组
const mySlides = [
    { id: 'intro', component: <IntroSlide /> },
    { id: 'content-1', component: <ContentSlide1 /> },
];

// 7. 课程数据导出（必须是文件最后一部分）
window.CourseData = {
    title: "课程标题",
    icon: "📚",
    desc: "简短描述，50字以内",
    color: "from-blue-500 to-indigo-600",
    dependencies: [],
    slides: mySlides
};
```

### 幻灯片组件模板

**标题页：**
```tsx
function IntroSlide() {
    return (
        <div className="flex flex-col items-center justify-center min-h-full text-center p-8 md:p-12 space-y-8 bg-gradient-to-br from-blue-50 via-white to-indigo-50">
            <div className="w-32 md:w-40 h-32 md:h-40 bg-blue-100 rounded-full flex items-center justify-center shadow-inner border-4 border-white">
                <i className="fas fa-brain text-blue-600 text-6xl md:text-[80px] drop-shadow-md"></i>
            </div>
            <h1 className="text-4xl md:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 tracking-tight">
                课程标题
            </h1>
            <h2 className="text-xl md:text-3xl font-bold text-slate-600 tracking-wide">
                副标题
            </h2>
            <p className="max-w-3xl text-lg md:text-xl text-slate-500 leading-relaxed bg-white/80 p-6 rounded-2xl shadow-sm">
                课程简介
            </p>
        </div>
    );
}
```

**内容页：**
```tsx
function ContentSlide() {
    return (
        <div className="flex flex-col min-h-full p-6 md:p-10 bg-white">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-6 flex items-center shrink-0">
                <i className="fas fa-lightbulb mr-4 text-yellow-500"></i> 页面标题
            </h2>
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
                    <h3 className="text-xl font-bold text-blue-700 mb-3">子标题</h3>
                    <p className="text-slate-600 leading-relaxed">内容...</p>
                </div>
                <div className="bg-green-50 p-6 rounded-2xl border border-green-100">
                    <h3 className="text-xl font-bold text-green-700 mb-3">子标题</h3>
                    <p className="text-slate-600 leading-relaxed">内容...</p>
                </div>
            </div>
        </div>
    );
}
```

**交互页（带 useState 和类型注解）：**
```tsx
function InteractiveSlide() {
    const [value, setValue] = useState<number>(0);

    return (
        <div className="flex flex-col min-h-full p-6 md:p-10 bg-white">
            <h2 className="text-3xl font-bold text-slate-800 mb-6 shrink-0">
                <i className="fas fa-hand-pointer mr-3 text-blue-500"></i> 互动演示
            </h2>
            <div className="flex-1 flex flex-col items-center justify-center gap-6">
                <p className="text-2xl font-bold text-slate-700">当前值：{value}</p>
                <button
                    onClick={() => setValue((v: number) => v + 1)}
                    className="px-8 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold text-lg transition-colors"
                >
                    点击 +1
                </button>
            </div>
        </div>
    );
}
```

**摄像头页：**
```tsx
function CameraSlide() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [streamActive, setStreamActive] = useState<boolean>(false);

    useEffect(() => {
        const onStream = (stream: MediaStream) => {
            if (videoRef.current) videoRef.current.srcObject = stream;
            setStreamActive(true);
        };

        // 启动摄像头，引擎自动在右下角显示切换按钮
        window.CourseGlobalContext.getCamera(onStream).catch((err: Error) => {
            console.error('Camera error:', err.message);
        });

        return () => {
            // 组件卸载时注销回调（不停止流，引擎管理生命周期）
            window.CourseGlobalContext.unregisterCamera(onStream);
            if (videoRef.current) videoRef.current.srcObject = null;
        };
    }, []);

    return (
        <div className="flex flex-col h-full p-6 md:p-8 bg-white">
            <h2 className="text-2xl md:text-3xl font-bold text-slate-800 mb-4 shrink-0">
                <i className="fas fa-camera mr-3 text-blue-500"></i> 摄像头演示
            </h2>
            <div className="flex-1 flex items-center justify-center">
                <div className="relative bg-black rounded-2xl overflow-hidden border-2 border-slate-800 w-full max-w-2xl aspect-video flex items-center justify-center">
                    {!streamActive && (
                        <span className="text-slate-500 text-sm animate-pulse">等待摄像头...</span>
                    )}
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-contain" />
                </div>
            </div>
        </div>
    );
}
```

---

## 摄像头 API

课件通过 `window.CourseGlobalContext` 调用引擎提供的摄像头能力。引擎负责设备枚举、流管理、VCam fallback 和 localStorage 记忆，课件只需调用简单 API。

### API 说明

| 方法 | 说明 |
|------|------|
| `getCamera(onStream?)` | 获取摄像头流。`onStream(stream)` 回调在首次获取成功及每次切换设备后自动触发。返回 `Promise<MediaStream>`。 |
| `unregisterCamera(onStream)` | 注销回调（组件卸载时调用）。不停止摄像头流，其他课件仍可使用。 |
| `releaseCamera()` | 完全释放摄像头（课程结束时由引擎自动调用，课件一般不需要手动调用）。 |

**引擎自动行为：**
- 调用 `getCamera()` 后，引擎自动在画面右下角显示摄像头切换按钮
- 翻页时引擎自动释放摄像头并隐藏按钮，新页面组件 mount 后重新申请
- `localStorage` 记忆上次选择的设备，下次自动沿用

### 注意事项

- 每个需要摄像头的幻灯片组件都应在 `useEffect` 里调用 `getCamera` 并在 cleanup 里调用 `unregisterCamera`
- 多个组件可以同时注册不同的 `onStream` 回调，共享同一个流
- 不需要在课件里渲染摄像头选择器，引擎已内置
- 不要在课件里直接调用 `window.CameraManager`，始终通过 `CourseGlobalContext`

---

## window.CourseData 配置

### 必需字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | string | 课程标题 |
| `icon` | string | 课程图标（emoji） |
| `desc` | string | 课程描述，显示在选课卡片 |
| `color` | string | 卡片渐变色，格式：`from-[色]-500 to-[色]-600` |
| `slides` | array | 幻灯片数组，每项：`{ id: string, component: <Component /> }` |

### dependencies 格式

声明课程需要的外部 JavaScript 库。系统优先从局域网缓存加载，未缓存时自动从公网下载并缓存。

```tsx
dependencies: [
    {
        name: "chartjs",                          // 任意标识符
        localSrc: "/lib/chart.umd.min.js",        // 本地缓存路径（文件名必须与CDN一致）
        publicSrc: "https://fastly.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"
    }
]
```

**⚠️ 注意：`localSrc` 的文件名必须与 CDN URL 最后一段完全一致。CDN 使用 `fastly.jsdelivr.net`。**

**常用外部库：**

| 库 | 用途 | localSrc | publicSrc |
|----|------|----------|-----------|
| Chart.js | 图表 | `/lib/chart.umd.min.js` | `https://fastly.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js` |
| KaTeX | 数学公式 | `/lib/katex.min.js` | `https://fastly.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js` |
| Lodash | 工具函数 | `/lib/lodash.min.js` | `https://fastly.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js` |
| Marked | Markdown渲染 | `/lib/marked.min.js` | `https://fastly.jsdelivr.net/npm/marked@12.0.0/marked.min.js` |
| Day.js | 日期处理 | `/lib/dayjs.min.js` | `https://fastly.jsdelivr.net/npm/dayjs@1.11.10/dayjs.min.js` |
| Anime.js | 动画 | `/lib/anime.min.js` | `https://fastly.jsdelivr.net/npm/animejs@3.2.2/lib/anime.min.js` |
| Prism.js | 代码高亮 | `/lib/prism.min.js` | `https://fastly.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js` |
| face-api.js | 人脸识别 | `/lib/face-api.min.js` | `https://fastly.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js` |

### modelsUrls（AI 模型，仅 face-api 等需要）

```tsx
modelsUrls: {
    local: "/weights",
    public: "https://fastly.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights"
}
```

---

## 常见报错与解决方案

| 报错信息 | 原因 | 解决方案 |
|---------|------|---------|
| `Cannot use import statement` | 使用了 ES Module import | 改用全局变量，删除所有 import |
| `React is not defined` | 忘记解构 React | 文件顶部加 `const { useState } = React;` |
| `X is not a function` / `X is not defined` | 外部库未加载就使用 | 在 useEffect 中加 `typeof window.X === 'undefined'` 检查 |
| `Each child in a list should have a unique "key"` | 列表渲染缺少 key | `.map()` 中每个元素加 `key={唯一值}` |
| `window.CourseData is null` | CourseData 未赋值或赋值在异步中 | 确保 `window.CourseData = {...}` 在文件顶层同步执行 |
| 组件渲染空白 | 组件返回了 null 或 undefined | 检查所有条件渲染分支都有返回值 |
| Tailwind 样式不生效 | 使用了动态拼接类名 | 改用完整类名 + 条件判断 |

---

## 样式指南

### 颜色主题建议

| 主题 | 主色 | 副色 |
|------|------|------|
| 科技/AI | `blue` | `indigo` |
| 自然/生物 | `green` | `teal` |
| 数学/逻辑 | `purple` | `violet` |
| 创意/设计 | `pink` | `rose` |
| 商业/管理 | `slate` | `blue` |
| 警示/重点 | `orange` | `amber` |

### 常用 FontAwesome 图标

```
教育：fa-graduation-cap  fa-book  fa-chalkboard-teacher
技术：fa-code  fa-microchip  fa-robot  fa-brain
数据：fa-chart-line  fa-database  fa-table
交互：fa-hand-pointer  fa-sliders-h  fa-toggle-on
状态：fa-check-circle  fa-times-circle  fa-exclamation-triangle
摄像头：fa-camera  fa-video  fa-eye
```

### 布局模式

```tsx
// 卡片
<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">

// 彩色高亮框
<div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">

// 全屏居中（标题页）
<div className="flex flex-col items-center justify-center min-h-full text-center p-8">

// 内容页（顶部标题 + 剩余空间内容）
<div className="flex flex-col min-h-full p-6 md:p-10 bg-white">
    <h2 className="... shrink-0">标题</h2>  {/* shrink-0 防止标题被压缩 */}
    <div className="flex-1 ...">内容</div>   {/* flex-1 占满剩余空间 */}
</div>
```

---

## 图片使用

外部图片通过代理服务自动缓存，断网后仍可访问：

```tsx
// ✅ 使用图片代理（推荐）
<img src="/images/proxy?url=https://images.unsplash.com/photo-xxx" alt="描述" className="rounded-xl" />

// ❌ 直接引用外部图片（断网时失效）
<img src="https://images.unsplash.com/photo-xxx" />
```

---

## 完整最小示例

```tsx
// ========================================================
// 课程内容：Python 入门
// ========================================================

const { useState } = React;

interface CounterProps {
    label: string;
}

function Counter({ label }: CounterProps) {
    const [count, setCount] = useState<number>(0);
    return (
        <div className="flex items-center gap-4">
            <button
                onClick={() => setCount((c: number) => c + 1)}
                className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold transition-colors"
            >
                {label}
            </button>
            <span className="text-slate-600">已点击 {count} 次</span>
        </div>
    );
}

function IntroSlide() {
    return (
        <div className="flex flex-col items-center justify-center min-h-full text-center p-8 space-y-6 bg-gradient-to-br from-blue-50 via-white to-indigo-50">
            <div className="w-32 h-32 bg-blue-100 rounded-full flex items-center justify-center">
                <i className="fas fa-code text-blue-600 text-6xl"></i>
            </div>
            <h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
                Python 入门
            </h1>
            <p className="max-w-2xl text-lg text-slate-500 bg-white/80 p-6 rounded-2xl">
                从零开始学习 Python 编程语言
            </p>
        </div>
    );
}

function ContentSlide() {
    return (
        <div className="flex flex-col min-h-full p-8 bg-white">
            <h2 className="text-3xl font-bold text-slate-800 mb-6 shrink-0">
                <i className="fas fa-terminal mr-3 text-blue-500"></i> 变量与数据类型
            </h2>
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-blue-50 p-5 rounded-2xl border border-blue-100">
                    <h3 className="font-bold text-blue-700 mb-3">整数 (int)</h3>
                    <code className="text-sm bg-white p-3 rounded-lg block">x = 42</code>
                </div>
                <div className="bg-green-50 p-5 rounded-2xl border border-green-100">
                    <h3 className="font-bold text-green-700 mb-3">字符串 (str)</h3>
                    <code className="text-sm bg-white p-3 rounded-lg block">name = "Python"</code>
                </div>
            </div>
            <div className="mt-4">
                <Counter label="点击计数" />
            </div>
        </div>
    );
}

const mySlides = [
    { id: 'intro', component: <IntroSlide /> },
    { id: 'content', component: <ContentSlide /> },
];

window.CourseData = {
    title: "Python 入门",
    icon: "🐍",
    desc: "从零开始学习 Python 编程",
    color: "from-blue-500 to-indigo-600",
    dependencies: [],
    slides: mySlides
};
```

---

## 注意事项

1. 课程文件必须使用 `.tsx` 扩展名，放在 `public/courses/` 目录下
2. 每页内容保持简洁，不要在一页塞太多信息
3. 使用 `shrink-0` 防止标题在 flex 容器中被压缩
4. 使用 `flex-1` 让内容区域占满剩余空间
5. 交互组件的 `useEffect` 清理函数要销毁图表/定时器等资源
6. 列表渲染必须加 `key` 属性
7. 文件名将作为课程 ID，使用小写字母和连字符：`python-intro.tsx`
8. TypeScript 类型注解是可选的，但推荐为 props 和 state 添加类型
9. 需要摄像头时，通过 `window.CourseGlobalContext.getCamera(onStream)` 调用，不要直接操作 `window.CameraManager`
