# SyncClassroom 课程开发模板

## 概述

本文档定义了为 SyncClassroom 互动课堂框架创建课程的标准模板和规范。

## 课程文件结构

课程文件是位于 `public/courses/` 目录下的 JavaScript 文件，使用 JSX 语法编写。

### 基本模板

```javascript
// ========================================================
// 🎨 课程内容：[课程名称]
// ========================================================

const { useState, useEffect, useRef } = React;

// ================= 常量定义（可选）=================
// 定义课程中使用的常量、图片 URL 等

// ================= SLIDE COMPONENTS =================
// 每个幻灯片是一个独立的 React 函数组件

function Slide1() {
    return (
        <div className="flex flex-col items-center justify-center min-h-full text-center p-8 md:p-12 space-y-8 bg-gradient-to-br from-blue-50 via-white to-indigo-50">
            {/* 幻灯片内容 */}
            <h1 className="text-4xl md:text-6xl font-extrabold text-slate-800">
                幻灯片标题
            </h1>
            <p className="max-w-3xl text-lg md:text-xl text-slate-500">
                幻灯片内容描述
            </p>
        </div>
    );
}

function Slide2() {
    return (
        <div className="flex flex-col min-h-full p-6 md:p-10 bg-white">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-8">
                第二页标题
            </h2>
            {/* 更多内容 */}
        </div>
    );
}

// ================= COURSE DATA =================

const mySlides = [
    { id: 'slide-1', component: <Slide1 /> },
    { id: 'slide-2', component: <Slide2 /> },
    // 添加更多幻灯片...
];

window.CourseData = {
    title: "课程标题",
    icon: "📚",
    desc: "课程简短描述，显示在课程选择卡片上",
    color: "from-blue-500 to-indigo-600",
    dependencies: [],  // 如需引用外部脚本，参考下方 dependencies 说明
    slides: mySlides
};
```

## 组件规范

### 1. 幻灯片组件命名

- 使用 `Slide` 前缀 + 数字/描述，如：`Slide1`, `IntroSlide`, `SummarySlide`
- 组件名使用 PascalCase

### 2. 幻灯片布局

#### 标题页布局
```javascript
<div className="flex flex-col items-center justify-center min-h-full text-center p-8 md:p-12 space-y-8 bg-gradient-to-br from-blue-50 via-white to-indigo-50">
    <div className="w-32 md:w-40 h-32 md:h-40 bg-blue-100 rounded-full flex items-center justify-center">
        <i className="fas fa-icon-name text-blue-600 text-6xl"></i>
    </div>
    <h1 className="text-4xl md:text-6xl font-extrabold text-slate-800">标题</h1>
    <p className="max-w-3xl text-lg md:text-xl text-slate-500">描述</p>
</div>
```

#### 内容页布局
```javascript
<div className="flex flex-col min-h-full p-6 md:p-10 bg-white">
    <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-8 flex items-center">
        <i className="fas fa-icon mr-4 text-color-500"></i> 标题
    </h2>
    {/* 内容区域 */}
</div>
```

### 3. 响应式设计

- 使用 Tailwind CSS 的响应式前缀：`md:`, `lg:`
- 移动端优先，从小屏幕开始设计
- 常用断点：
  - `md:` - 768px 以上
  - `lg:` - 1024px 以上

### 4. 样式规范

#### 颜色系统
- 主色调：`blue-500`, `blue-600`
- 成功/积极：`green-500`, `green-600`
- 警告/注意：`orange-500`, `yellow-500`
- 背景：`slate-50`, `white`, `bg-gradient-to-br`

#### 常用类名
```
布局：flex, flex-col, items-center, justify-center, min-h-full
间距：p-6, md:p-10, space-y-8, gap-4
文字：text-4xl md:text-6xl font-bold text-slate-800
装饰：rounded-2xl, shadow-sm, border, bg-gradient-to-br
```

## window.CourseData 配置

### 必需字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | string | 课程标题 |
| `icon` | string | 课程图标（emoji） |
| `desc` | string | 课程描述 |
| `color` | string | 卡片渐变色，如 `from-blue-500 to-indigo-600` |
| `slides` | array | 幻灯片数组 |

### 可选字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `dependencies` | array | 外部依赖库 |
| `modelsUrls` | object | AI 模型文件地址 |

### dependencies 格式

用于声明课程需要的外部 JavaScript 库。系统会**优先从局域网加载**，如未缓存则自动从公网下载并缓存，供后续使用。

```javascript
dependencies: [
    {
        name: "chartjs",
        localSrc: "/lib/chart.umd.min.js",
        publicSrc: "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"
    },
    {
        name: "katex",
        localSrc: "/lib/katex.min.js",
        publicSrc: "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"
    }
]
```

**工作原理：**
1. 课件加载时，系统自动将 `filename → publicSrc` 的映射注册到服务端
2. 当 `/lib/` 下的文件不存在时，服务端用 `publicSrc` 精确地址自动下载并缓存
3. 后续所有客户端直接从局域网加载，速度提升 10-100 倍
4. **注意**：`localSrc` 中的文件名必须与 CDN 上的实际文件名一致（如 `chart.umd.min.js`，而不是 `chart.js`）

**常用外部库：**

| 库名称 | 用途 | CDN 地址 | 本地文件名 |
|--------|------|----------|-----------|
| Chart.js | 图表绘制 | `https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js` | `chart.umd.min.js` |
| KaTeX | 数学公式 | `https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js` | `katex.min.js` |
| Prism.js | 代码高亮 | `https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js` | `prism.min.js` |
| face-api.js | 人脸识别 | `https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js` | `face-api.min.js` |

### 断网环境支持

系统支持完全断网的教学环境，**核心框架**（React、Babel、Tailwind CSS、FontAwesome）和**课件依赖**均可自动处理：

| 资源类型 | 处理方式 |
|---------|---------|
| 核心框架（React/Babel/Tailwind/FontAwesome） | 服务端有固定地址映射，首次访问自动下载 |
| 课件声明的 `dependencies` | 服务端接收 `publicSrc` 注册后，首次访问自动下载 |
| 外部图片 | 通过图片代理服务首次访问自动缓存 |

**可选：课前批量预下载核心资源**（教师机需要联网）：
```bash
node download-resources.js
```
此命令预先下载 React、Babel、Tailwind、FontAwesome 等核心框架，适合在正式上课前提前准备，避免课中等待。课件自定义依赖无需手动预下载，首次打开课件时会自动拉取。

**外部图片处理**：
如果课件需要使用外部图片（如 Unsplash），使用图片代理服务：
```javascript
const IMAGE_URL = "/images/proxy?url=https://example.com/image.jpg";
```
图片会在首次访问时自动下载并缓存到 `public/images/`，断网后也可正常显示。

### modelsUrls 格式

用于配置 AI 模型文件的加载路径。适用于需要加载预训练模型的库（如 face-api.js）。

```javascript
modelsUrls: {
    local: "/weights",     // 局域网模型路径（教师端已下载）
    public: "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights"  // 公网模型路径
}
```

**模型缓存机制：**
- 首次使用时，教师端自动从公网下载模型文件到 `public/weights/` 目录
- 学生端直接从教师端局域网获取，加载速度提升 10-100 倍
- 支持断点续传和多文件并行下载

## 幻灯片数组格式

```javascript
const mySlides = [
    { id: '唯一标识符', component: <组件名 /> },
    // 示例：
    { id: 'intro', component: <IntroSlide /> },
    { id: 'content-1', component: <ContentSlide1 /> },
    { id: 'summary', component: <SummarySlide /> },
];
```

## 最佳实践

### 1. 组件组织
- 将可复用的子组件定义在文件顶部
- 每个幻灯片组件保持独立和完整
- 使用有意义的组件名

### 2. 内容设计
- 每页内容不宜过多，保持简洁
- 使用图标增强视觉效果（FontAwesome）
- 适当使用动画：`animate-bounce`, `animate-pulse`

### 3. 交互组件
如需交互，使用 React Hooks：

```javascript
function InteractiveSlide() {
    const [count, setCount] = useState(0);
    
    return (
        <div>
            <p>点击次数: {count}</p>
            <button onClick={() => setCount(count + 1)}>
                点击我
            </button>
        </div>
    );
}
```

### 4. 图片资源
- 使用外部 URL 或 `/courses/images/` 下的本地资源
- 推荐 Unsplash 等免费图库

## 完整示例

参考文件：`public/courses/intro-to-ai.js`

```javascript
// ========================================================
// 🎨 课程内容：AI 基础导论
// ========================================================

const { useState, useEffect, useRef } = React;

// ================= SLIDE COMPONENTS =================

function Slide1() {
    return (
        <div className="flex flex-col items-center justify-center min-h-full text-center p-8 space-y-8 bg-gradient-to-br from-green-50 via-white to-teal-50">
            <div className="w-32 h-32 bg-green-100 rounded-full flex items-center justify-center">
                <i className="fas fa-brain text-green-600 text-6xl"></i>
            </div>
            <h1 className="text-4xl md:text-6xl font-extrabold text-slate-800">
                人工智能基础导论
            </h1>
        </div>
    );
}

function Slide2() {
    return (
        <div className="flex flex-col min-h-full p-6 md:p-10 bg-white">
            <h2 className="text-3xl font-bold text-slate-800 mb-8">
                什么是 AI？
            </h2>
            <p className="text-lg text-slate-600">
                人工智能是...
            </p>
        </div>
    );
}

// ================= COURSE DATA =================

const mySlides = [
    { id: 's1', component: <Slide1 /> },
    { id: 's2', component: <Slide2 /> },
];

window.CourseData = {
    title: "人工智能基础导论",
    icon: "🌟",
    desc: "AI 入门第一课",
    color: "from-green-500 to-teal-600",
    dependencies: [],  // 如需外部库，参考上方 dependencies 格式
    slides: mySlides
};
```

## 调试技巧

1. 打开浏览器开发者工具（F12）
2. 查看 Console 中的 `[ClassroomApp]` 日志
3. 检查 `window.CourseData` 是否正确设置
4. 使用 React DevTools 检查组件树

## 文件命名规范

- 使用小写字母和连字符
- 示例：`intro-to-ai.js`, `face-recognition.js`, `machine-learning-basics.js`
- 文件名将作为课程 ID（去掉 `.js` 后缀）
