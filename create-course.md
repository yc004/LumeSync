# Skill: create-course

## 描述

为 SyncClassroom 互动课堂框架创建课程文件。根据用户提供的课程主题和内容大纲，生成符合框架规范的 JavaScript 课程文件。

## 调用方式

用户说"创建一个关于 XXX 的课程"或"生成 XXX 课件"时调用此 skill。

---

## ⚠️ 运行环境说明（必读，避免报错）

课程文件通过 **Babel Standalone** 在浏览器中实时编译，再用 `new Function(compiledCode)()` 执行。这个环境与标准 Node.js 或 Webpack 项目有重要区别：

### 全局变量

以下变量**直接可用**，无需 import：

| 变量 | 来源 | 说明 |
|------|------|------|
| `React` | 全局 | React 18 |
| `useState`, `useEffect`, `useRef`, `useCallback`, `useMemo` 等 | 需从 React 解构 | 见下方写法 |
| `window.CourseData` | 全局赋值 | 课程数据出口，必须赋值 |
| `window.Chart` | 加载后可用 | Chart.js（需在 dependencies 中声明） |
| `window.katex` | 加载后可用 | KaTeX（需在 dependencies 中声明） |
| `window._` | 加载后可用 | Lodash（需在 dependencies 中声明） |

**正确写法（文件第一行）：**
```javascript
const { useState, useEffect, useRef, useCallback, useMemo } = React;
```

**❌ 绝对禁止：**
```javascript
import React from 'react';           // 报错：不支持 ES Module import
import { useState } from 'react';    // 报错：同上
require('react');                    // 报错：不支持 require
export default function ...          // 报错：不支持 export
```

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
  ```javascript
  // ❌ 错误：Tailwind 无法识别动态拼接的类名
  className={`text-${color}-500`}
  
  // ✅ 正确：使用条件判断选择完整类名
  className={isActive ? 'text-blue-500' : 'text-slate-500'}
  ```

### 外部库使用规则

依赖库通过 `dependencies` 声明后**异步加载**，在幻灯片组件渲染时库可能尚未就绪。

**必须做防御性检查：**
```javascript
function ChartSlide() {
    const ref = useRef(null);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        // ✅ 检查库是否已加载
        if (typeof window.Chart === 'undefined') {
            setReady(false);
            return;
        }
        setReady(true);
        const ctx = ref.current.getContext('2d');
        const chart = new window.Chart(ctx, { /* ... */ });
        // ✅ 组件卸载时销毁图表，防止内存泄漏
        return () => chart.destroy();
    }, []);

    if (!ready) return <div>Chart.js 加载中...</div>;
    return <canvas ref={ref}></canvas>;
}
```

**❌ 错误写法（库未加载时直接使用会报错）：**
```javascript
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

### 步骤 2：设计课程结构

规划幻灯片（建议 4-8 页）：
1. **标题页** - 课程名称、副标题、简介
2. **目录/概述页** - 课程内容概览（可选）
3. **内容页** × N - 核心知识点，每页聚焦一个主题
4. **互动/实践页** - 带 `useState` 的交互组件（可选）
5. **总结页** - 要点回顾

### 步骤 3：生成课程文件

在 `public/courses/` 目录下创建 `.js` 文件，文件名格式：`主题关键词.js`（小写，连字符连接）

---

## 代码规范

### 文件结构（严格按此顺序）

```javascript
// ========================================================
// 🎨 课程内容：[课程名称]
// ========================================================

// 1. 解构 React Hooks（必须在文件顶部）
const { useState, useEffect, useRef } = React;

// 2. 常量定义（可选）
const SOME_CONSTANT = '...';

// 3. 幻灯片组件（每个独立函数）
function IntroSlide() { ... }
function ContentSlide1() { ... }
// ...

// 4. 幻灯片数组
const mySlides = [
    { id: 'intro', component: <IntroSlide /> },
    { id: 'content-1', component: <ContentSlide1 /> },
];

// 5. 课程数据导出（必须是文件最后一部分）
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
```javascript
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
```javascript
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

**交互页（带 useState）：**
```javascript
function InteractiveSlide() {
    const [value, setValue] = useState(0);

    return (
        <div className="flex flex-col min-h-full p-6 md:p-10 bg-white">
            <h2 className="text-3xl font-bold text-slate-800 mb-6 shrink-0">
                <i className="fas fa-hand-pointer mr-3 text-blue-500"></i> 互动演示
            </h2>
            <div className="flex-1 flex flex-col items-center justify-center gap-6">
                <p className="text-2xl font-bold text-slate-700">当前值：{value}</p>
                <button
                    onClick={() => setValue(v => v + 1)}
                    className="px-8 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold text-lg transition-colors"
                >
                    点击 +1
                </button>
            </div>
        </div>
    );
}
```

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

```javascript
dependencies: [
    {
        name: "chartjs",                          // 任意标识符
        localSrc: "/lib/chart.umd.min.js",        // 本地缓存路径（文件名必须与CDN一致）
        publicSrc: "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"
    }
]
```

**⚠️ 注意：`localSrc` 的文件名必须与 CDN URL 最后一段完全一致。**

**常用外部库：**

| 库 | 用途 | localSrc | publicSrc |
|----|------|----------|-----------|
| Chart.js | 图表 | `/lib/chart.umd.min.js` | `https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js` |
| KaTeX | 数学公式 | `/lib/katex.min.js` | `https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js` |
| Lodash | 工具函数 | `/lib/lodash.min.js` | `https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js` |
| Marked | Markdown渲染 | `/lib/marked.min.js` | `https://cdn.jsdelivr.net/npm/marked@12.0.0/marked.min.js` |
| Day.js | 日期处理 | `/lib/dayjs.min.js` | `https://cdn.jsdelivr.net/npm/dayjs@1.11.10/dayjs.min.js` |
| Anime.js | 动画 | `/lib/anime.min.js` | `https://cdn.jsdelivr.net/npm/animejs@3.2.2/lib/anime.min.js` |
| Prism.js | 代码高亮 | `/lib/prism.min.js` | `https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js` |
| face-api.js | 人脸识别 | `/lib/face-api.min.js` | `https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js` |

### modelsUrls（AI 模型，仅 face-api 等需要）

```javascript
modelsUrls: {
    local: "/weights",
    public: "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights"
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
```

### 布局模式

```javascript
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

```javascript
// ✅ 使用图片代理（推荐）
<img src="/images/proxy?url=https://images.unsplash.com/photo-xxx" alt="描述" className="rounded-xl" />

// ❌ 直接引用外部图片（断网时失效）
<img src="https://images.unsplash.com/photo-xxx" />
```

---

## 完整最小示例

```javascript
// ========================================================
// 🎨 课程内容：Python 入门
// ========================================================

const { useState } = React;

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
    const [count, setCount] = useState(0);
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
            <div className="mt-4 flex items-center gap-4">
                <button
                    onClick={() => setCount(c => c + 1)}
                    className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold transition-colors"
                >
                    点击计数
                </button>
                <span className="text-slate-600">已点击 {count} 次</span>
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

1. 每页内容保持简洁，不要在一页塞太多信息
2. 使用 `shrink-0` 防止标题在 flex 容器中被压缩
3. 使用 `flex-1` 让内容区域占满剩余空间
4. 交互组件的 `useEffect` 清理函数要销毁图表/定时器等资源
5. 列表渲染必须加 `key` 属性
6. 文件名将作为课程 ID，使用小写字母和连字符：`python-intro.js`
