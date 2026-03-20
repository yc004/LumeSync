# SyncClassroom 课程开发模板

## 概述

本文档定义了为 SyncClassroom 互动课堂框架创建课程的标准模板和规范。

## 课程文件结构

课程文件是位于 `public/courses/` 目录下的 **TSX 文件**，使用 JSX + TypeScript 语法编写，由 Babel Standalone（`react` + `typescript` 预设）在浏览器中实时编译执行。

### 基本模板

```tsx
// ========================================================
// 课程内容：[课程名称]
// ========================================================

const { useState, useEffect, useRef } = React;

// ================= 类型定义（可选）=================

interface SlideProps {
    title: string;
}

// ================= SLIDE COMPONENTS =================

function Slide1() {
    return (
        <div className="flex flex-col items-center justify-center min-h-full text-center p-8 md:p-12 space-y-8 bg-gradient-to-br from-blue-50 via-white to-indigo-50">
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
        </div>
    );
}

// ================= COURSE DATA =================

const mySlides = [
    { id: 'slide-1', component: <Slide1 /> },
    { id: 'slide-2', component: <Slide2 /> },
];

window.CourseData = {
    title: "课程标题",
    icon: "📚",
    desc: "课程简短描述，显示在课程选择卡片上",
    color: "from-blue-500 to-indigo-600",
    dependencies: [],
    slides: mySlides
};
```

## 组件规范

### 1. 幻灯片组件命名

- 使用 `Slide` 前缀 + 数字/描述，如：`Slide1`, `IntroSlide`, `SummarySlide`
- 组件名使用 PascalCase

### 2. TypeScript 类型注解

支持完整的 TypeScript 语法，推荐为 props 和 state 添加类型：

```tsx
// Props 接口
interface CardProps {
    title: string;
    content: string;
    highlight?: boolean;
}

// 带类型的 state
const [count, setCount] = useState<number>(0);
const [items, setItems] = useState<string[]>([]);
const ref = useRef<HTMLCanvasElement>(null);

// 带类型的子组件
function Card({ title, content, highlight = false }: CardProps) {
    return (
        <div className={highlight ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-slate-100'}>
            <h3>{title}</h3>
            <p>{content}</p>
        </div>
    );
}
```

### 3. 幻灯片布局

#### 标题页布局
```tsx
<div className="flex flex-col items-center justify-center min-h-full text-center p-8 md:p-12 space-y-8 bg-gradient-to-br from-blue-50 via-white to-indigo-50">
    <div className="w-32 md:w-40 h-32 md:h-40 bg-blue-100 rounded-full flex items-center justify-center">
        <i className="fas fa-icon-name text-blue-600 text-6xl"></i>
    </div>
    <h1 className="text-4xl md:text-6xl font-extrabold text-slate-800">标题</h1>
    <p className="max-w-3xl text-lg md:text-xl text-slate-500">描述</p>
</div>
```

#### 内容页布局
```tsx
<div className="flex flex-col min-h-full p-6 md:p-10 bg-white">
    <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-8 flex items-center shrink-0">
        <i className="fas fa-icon mr-4 text-color-500"></i> 标题
    </h2>
    <div className="flex-1">
        {/* 内容区域，flex-1 占满剩余空间 */}
    </div>
</div>
```

### 4. 响应式设计

- 使用 Tailwind CSS 的响应式前缀：`md:`, `lg:`
- 移动端优先，从小屏幕开始设计

### 5. 样式规范

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

```tsx
dependencies: [
    {
        name: "chartjs",
        localSrc: "/lib/chart.umd.min.js",
        publicSrc: "https://fastly.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"
    },
    {
        name: "katex",
        localSrc: "/lib/katex.min.js",
        publicSrc: "https://fastly.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"
    }
]
```

**工作原理：**
1. 课件加载时，系统自动将 `filename → publicSrc` 的映射注册到服务端
2. 当 `/lib/` 下的文件不存在时，服务端用 `publicSrc` 精确地址自动下载并缓存
3. 后续所有客户端直接从局域网加载，速度提升 10-100 倍
4. **注意**：`localSrc` 中的文件名必须与 CDN 上的实际文件名一致（如 `chart.umd.min.js`）
5. **CDN 使用 `fastly.jsdelivr.net`**，不要使用 `cdn.jsdelivr.net`

**常用外部库：**

| 库名称 | 用途 | CDN 地址 | 本地文件名 |
|--------|------|----------|-----------|
| Chart.js | 图表绘制 | `https://fastly.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js` | `chart.umd.min.js` |
| KaTeX | 数学公式 | `https://fastly.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js` | `katex.min.js` |
| Prism.js | 代码高亮 | `https://fastly.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js` | `prism.min.js` |
| face-api.js | 人脸识别 | `https://fastly.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js` | `face-api.min.js` |

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

**外部图片处理**：
```tsx
const IMAGE_URL = "/images/proxy?url=https://example.com/image.jpg";
```

### modelsUrls 格式

```tsx
modelsUrls: {
    local: "/weights",
    public: "https://fastly.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights"
}
```

## 幻灯片数组格式

```tsx
const mySlides = [
    { id: '唯一标识符', component: <组件名 /> },
    { id: 'intro', component: <IntroSlide /> },
    { id: 'content-1', component: <ContentSlide1 /> },
    { id: 'summary', component: <SummarySlide /> },
];
```

## 最佳实践

### 1. 组件组织
- 将可复用的子组件定义在文件顶部，并为其 props 定义 TypeScript 接口
- 每个幻灯片组件保持独立和完整
- 使用有意义的组件名

### 2. 内容设计
- 每页内容不宜过多，保持简洁
- 使用图标增强视觉效果（FontAwesome）
- 适当使用动画：`animate-bounce`, `animate-pulse`

### 3. 交互组件
使用 React Hooks，推荐加类型注解：

```tsx
function InteractiveSlide() {
    const [count, setCount] = useState<number>(0);
    const [active, setActive] = useState<boolean>(false);
    
    return (
        <div>
            <p>点击次数: {count}</p>
            <button onClick={() => setCount((c: number) => c + 1)}>
                点击我
            </button>
        </div>
    );
}
```

### 4. 图片资源
- 使用图片代理服务确保断网可用：`/images/proxy?url=...`

## 完整示例

```tsx
// ========================================================
// 课程内容：AI 基础导论
// ========================================================

const { useState, useEffect } = React;

// ================= 类型定义 =================

interface FeatureCardProps {
    icon: string;
    title: string;
    desc: string;
    color: string;
}

// ================= 子组件 =================

function FeatureCard({ icon, title, desc, color }: FeatureCardProps) {
    return (
        <div className={`p-5 rounded-2xl border ${color}`}>
            <i className={`fas ${icon} text-2xl mb-3`}></i>
            <h3 className="font-bold text-lg mb-2">{title}</h3>
            <p className="text-sm leading-relaxed">{desc}</p>
        </div>
    );
}

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
            <p className="max-w-2xl text-lg text-slate-500 bg-white/80 p-6 rounded-2xl">
                探索 AI 的核心概念与应用
            </p>
        </div>
    );
}

function Slide2() {
    const features: FeatureCardProps[] = [
        { icon: 'fa-robot', title: '机器学习', desc: '让机器从数据中自动学习规律', color: 'bg-blue-50 border-blue-100' },
        { icon: 'fa-eye', title: '计算机视觉', desc: '让机器理解和分析图像', color: 'bg-green-50 border-green-100' },
        { icon: 'fa-comments', title: '自然语言处理', desc: '让机器理解和生成人类语言', color: 'bg-purple-50 border-purple-100' },
    ];

    return (
        <div className="flex flex-col min-h-full p-6 md:p-10 bg-white">
            <h2 className="text-3xl font-bold text-slate-800 mb-6 shrink-0">
                <i className="fas fa-sitemap mr-3 text-green-500"></i> AI 的主要分支
            </h2>
            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                {features.map((f, i) => (
                    <FeatureCard key={i} {...f} />
                ))}
            </div>
        </div>
    );
}

function Slide3() {
    const [selected, setSelected] = useState<number | null>(null);
    const options: string[] = ['监督学习', '无监督学习', '强化学习'];

    return (
        <div className="flex flex-col min-h-full p-6 md:p-10 bg-white">
            <h2 className="text-3xl font-bold text-slate-800 mb-6 shrink-0">
                <i className="fas fa-question-circle mr-3 text-blue-500"></i> 小测验
            </h2>
            <div className="flex-1 flex flex-col justify-center gap-4">
                <p className="text-xl text-slate-600 mb-4">AlphaGo 下围棋属于哪种学习方式？</p>
                {options.map((opt, i) => (
                    <button
                        key={i}
                        onClick={() => setSelected(i)}
                        className={`p-4 rounded-xl border-2 text-left font-medium transition-all ${
                            selected === i
                                ? i === 2 ? 'border-green-500 bg-green-50 text-green-700' : 'border-red-400 bg-red-50 text-red-700'
                                : 'border-slate-200 hover:border-blue-300 text-slate-700'
                        }`}
                    >
                        {opt}
                        {selected === i && (i === 2 ? ' ✓ 正确！' : ' ✗ 再想想')}
                    </button>
                ))}
            </div>
        </div>
    );
}

// ================= COURSE DATA =================

const mySlides = [
    { id: 's1', component: <Slide1 /> },
    { id: 's2', component: <Slide2 /> },
    { id: 's3', component: <Slide3 /> },
];

window.CourseData = {
    title: "人工智能基础导论",
    icon: "🌟",
    desc: "AI 入门第一课",
    color: "from-green-500 to-teal-600",
    dependencies: [],
    slides: mySlides
};
```

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

### 使用模式

```tsx
function CameraSlide() {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const onStream = (stream: MediaStream) => {
            if (videoRef.current) videoRef.current.srcObject = stream;
        };

        // 启动摄像头，引擎自动显示切换按钮
        window.CourseGlobalContext.getCamera(onStream).catch((err: Error) => {
            console.error('Camera error:', err.message);
        });

        return () => {
            // 组件卸载时注销回调（不停止流）
            window.CourseGlobalContext.unregisterCamera(onStream);
            if (videoRef.current) videoRef.current.srcObject = null;
        };
    }, []);

    return (
        <div className="flex flex-col h-full p-6 bg-white">
            <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-xl" />
        </div>
    );
}
```

### 注意事项

- 每个需要摄像头的幻灯片组件都应在 `useEffect` 里调用 `getCamera` 并在 cleanup 里调用 `unregisterCamera`
- 多个组件可以同时注册不同的 `onStream` 回调，共享同一个流
- 不需要在课件里渲染摄像头选择器，引擎已内置
- 不要在课件里直接调用 `window.CameraManager`，始终通过 `CourseGlobalContext`

## 调试技巧

1. 打开浏览器开发者工具（F12）
2. 查看 Console 中的 `[ClassroomApp]` 日志
3. 检查 `window.CourseData` 是否正确设置
4. 使用 React DevTools 检查组件树

## 文件命名规范

- 使用 `.tsx` 扩展名
- 文件名使用小写字母和连字符
- 示例：`intro-to-ai.tsx`, `face-recognition.tsx`, `machine-learning-basics.tsx`
- 文件名将作为课程 ID（去掉 `.tsx` 后缀）
