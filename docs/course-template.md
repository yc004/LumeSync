# 萤火课堂 课程开发模板

## 概述

本文档定义了为萤火课堂互动课堂框架创建课程的标准模板和规范。

## 课程文件结构

课程文件位于 `public/courses/` 目录下，使用自有后缀 **`.lume`**（内容仍是 JSX + TypeScript 语法的纯文本脚本）。框架使用 Babel Standalone（`react` + `typescript` 预设）在浏览器中实时编译执行。

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
    { id: 'long-quiz', component: <LongQuizSlide />, scrollable: true }, // 允许滚动的页面
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

### 幻灯片滚动控制

对于内容较多的页面（如长问卷、多表单等），可以通过在幻灯片数组中添加 `scrollable: true` 参数来启用滚动：

```tsx
const mySlides = [
    { id: 'short-page', component: <ShortPage /> },           // 默认不滚动
    { id: 'long-quiz', component: <LongQuiz />, scrollable: true }, // 允许滚动
];
```

**使用场景：**
- 长问卷（题目较多，超出 720px 高度）
- 多表单页面
- 列表或表格内容较多的页面
- 需要垂直滚动查看完整内容的页面

**注意事项：**
- 默认情况下页面不可滚动（`scrollable: false` 或未设置）
- 启用滚动后，页面可以使用鼠标滚轮或触摸滑动进行垂直滚动
- 滚动时标注画布的坐标会自动跟随
- 建议为长页面添加合适的 padding 和间距，提升用户体验

## 渲染约定（重要）

### 固定画布与缩放

- 教师端/学生端使用固定 16:9 画布（1280×720），再按窗口尺寸自动缩放显示
- 教师端"课堂设置"中提供"课件内容缩放"（60%～120%），用于在不改变画布大小的情况下缩放课件内部内容，降低溢出风险

### 兼容性建议

- 推荐使用 `w-full h-full`、`min-h-full` 作为布局基准，避免依赖 `vh/vw` 等视口单位
- 如果需要绝对尺寸，优先使用 `px`（以 1280×720 画布为基准设计）
- 尽量避免把内容渲染到画布外（如大面积 `translate`/绝对定位超出画布）

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

---

## 教师端与学生端交互同步（核心功能）

萤火课堂提供了强大的状态同步机制，使教师端的操作能够自动同步到所有学生端。这是实现互动教学的核心功能。

### API 概览

| API | 用途 | 同步范围 | 适用场景 |
|-----|------|---------|---------|
| `window.CourseGlobalContext.useSyncVar(key, initialValue, options?)` | 需要师生同步的状态变量 | 教师端 → 学生端（实时同步） | K 值选择、答题状态、实验参数 |
| `window.CourseGlobalContext.useLocalVar(key, initialValue, options?)` | 仅本地的 UI 状态变量 | 仅本地（不同步） | 菜单展开、模态框显示、提示框 |

### useSyncVar - 同步变量

用于需要在师生间同步的状态，教师端的任何修改会自动推送到所有连接的学生端。

#### API 签名

```tsx
const [value, setValue] = window.CourseGlobalContext.useSyncVar(
    key: string,              // 唯一标识符
    initialValue: any,         // 初始值
    options?: {               // 可选配置
        persist?: boolean,     // 是否持久化到 localStorage（默认 false）
        immediate?: boolean    // 是否立即同步给已连接学生端（默认 false）
    }
);
```

#### 参数说明

- **key**: 变量的唯一标识符，建议使用格式 `slide-id:variable-name`
  - 示例：`quiz-1:answer`、`knn-demo:k-value`、`experiment:results`
- **initialValue**: 初始值，可以是任何类型（字符串、数字、布尔值、对象、数组等）
- **options**: 可选配置
  - `persist`: 是否持久化到 localStorage，刷新页面后保留值（默认 false）
  - `immediate`: 是否立即同步给已连接的学生端（仅首次设置时生效，默认 false）

#### 使用示例

**示例 1：KNN 演示的 K 值选择**
```tsx
function KNNDemoSlide() {
    // K 值选择，教师修改后所有学生同步更新
    const [kValue, setKValue] = window.CourseGlobalContext.useSyncVar('knn-demo:k-value', 3);

    return (
        <div className="flex flex-col items-center justify-center h-full p-8 bg-white">
            <h2 className="text-3xl font-bold mb-8">KNN 分类演示</h2>
            <div className="flex items-center gap-4">
                <span className="text-xl">K 值：</span>
                <select
                    value={kValue}
                    onChange={(e) => setKValue(Number(e.target.value))}
                    className="px-4 py-2 border rounded-lg text-xl"
                >
                    <option value={1}>1</option>
                    <option value={3}>3</option>
                    <option value={5}>5</option>
                    <option value={7}>7</option>
                </select>
            </div>
            <p className="mt-4 text-slate-600">当前 K 值：{kValue}</p>
        </div>
    );
}
```

**示例 2：答题状态同步**
```tsx
function QuizSlide() {
    const [selectedOption, setSelectedOption] = window.CourseGlobalContext.useSyncVar('quiz-1:answer', null);

    const options = ['A', 'B', 'C', 'D'];

    return (
        <div className="flex flex-col items-center justify-center h-full p-8 bg-white">
            <h2 className="text-3xl font-bold mb-8">选择题</h2>
            <div className="grid grid-cols-2 gap-4">
                {options.map((opt) => (
                    <button
                        key={opt}
                        onClick={() => setSelectedOption(opt)}
                        className={`p-8 rounded-2xl text-2xl font-bold transition-all ${
                            selectedOption === opt
                                ? 'bg-blue-500 text-white shadow-lg'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                    >
                        {opt}
                    </button>
                ))}
            </div>
            {selectedOption && (
                <p className="mt-8 text-xl text-green-600 font-bold">
                    你选择了：{selectedOption}
                </p>
            )}
        </div>
    );
}
```

**示例 3：持久化设置**
```tsx
function SettingsSlide() {
    // 使用 persist 选项，刷新页面后保留设置
    const [theme, setTheme] = window.CourseGlobalContext.useSyncVar('settings:theme', 'light', {
        persist: true
    });

    return (
        <div className={`flex flex-col items-center justify-center h-full p-8 ${
            theme === 'dark' ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'
        }`}>
            <h2 className="text-3xl font-bold mb-8">主题设置</h2>
            <div className="flex gap-4">
                <button
                    onClick={() => setTheme('light')}
                    className={`px-6 py-3 rounded-xl font-bold ${
                        theme === 'light' ? 'bg-blue-500 text-white' : 'bg-slate-200'
                    }`}
                >
                    浅色
                </button>
                <button
                    onClick={() => setTheme('dark')}
                    className={`px-6 py-3 rounded-xl font-bold ${
                        theme === 'dark' ? 'bg-blue-500 text-white' : 'bg-slate-200'
                    }`}
                >
                    深色
                </button>
            </div>
        </div>
    );
}
```

### useLocalVar - 本地变量

用于仅本地的 UI 状态，如菜单展开、模态框显示、提示框等不需要同步的状态。

#### API 签名

```tsx
const [value, setValue] = window.CourseGlobalContext.useLocalVar(
    key: string,              // 唯一标识符
    initialValue: any,         // 初始值
    options?: {               // 可选配置（与 useSyncVar 相同）
        persist?: boolean,     // 是否持久化到 localStorage（默认 false）
        immediate?: boolean    // 本地变量此选项无意义
    }
);
```

#### 使用示例

**示例 1：菜单展开状态**
```tsx
function MenuSlide() {
    const [menuOpen, setMenuOpen] = window.CourseGlobalContext.useLocalVar('menu:open', false);

    return (
        <div className="flex flex-col h-full p-8 bg-white">
            <h2 className="text-3xl font-bold mb-4">菜单示例</h2>
            <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg"
            >
                {menuOpen ? '收起菜单' : '展开菜单'}
            </button>
            {menuOpen && (
                <div className="mt-4 p-4 bg-slate-100 rounded-lg">
                    <ul className="space-y-2">
                        <li>选项 1</li>
                        <li>选项 2</li>
                        <li>选项 3</li>
                    </ul>
                </div>
            )}
        </div>
    );
}
```

**示例 2：提示框显示**
```tsx
function TooltipSlide() {
    const [showTooltip, setShowTooltip] = window.CourseGlobalContext.useLocalVar('tooltip:visible', false);

    return (
        <div className="flex flex-col items-center justify-center h-full p-8 bg-white">
            <h2 className="text-3xl font-bold mb-8">提示框示例</h2>
            <button
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                className="px-6 py-3 bg-blue-500 text-white rounded-xl font-bold"
            >
                鼠标悬停显示提示
            </button>
            {showTooltip && (
                <div className="mt-4 px-4 py-2 bg-slate-800 text-white rounded-lg">
                    这是一个提示框
                </div>
            )}
        </div>
    );
}
```

### useState vs useSyncVar vs useLocalVar 选择指南

| API | 同步范围 | 适用场景 | 示例 |
|-----|---------|---------|------|
| `useState` | 不同步 | 临时的本地计算变量、DOM 引用、纯计算结果 | `const [hovered, setHovered] = useState(false)` |
| `useLocalVar` | 不同步 | 需要持久化但不需要同步的 UI 状态 | 菜单展开、模态框显示、提示框 |
| `useSyncVar` | 教师端→学生端 | 需要师生同步的业务状态 | K 值选择、答题状态、实验参数 |

#### 决策流程

1. **这个状态需要学生看到吗？**
   - 不需要 → 使用 `useState` 或 `useLocalVar`
   - 需要 → 使用 `useSyncVar`

2. **这个本地状态需要持久化吗（刷新页面后保留）？**
   - 不需要 → 使用 `useState`
   - 需要 → 使用 `useLocalVar`（加上 `persist: true`）

3. **常见用例**
   ```tsx
   // ✅ 正确：K 值需要师生同步
   const [kValue, setKValue] = window.CourseGlobalContext.useSyncVar('knn:k', 3);

   // ✅ 正确：菜单展开仅本地，但需要持久化
   const [menuOpen, setMenuOpen] = window.CourseGlobalContext.useLocalVar('menu:open', false, { persist: true });

   // ✅ 正确：鼠标悬停是临时的，不需要持久化
   const [hovered, setHovered] = useState(false);

   // ❌ 错误：答题状态应该用 useSyncVar
   const [answer, setAnswer] = useState(null);  // 教师改了，学生看不到

   // ❌ 错误：菜单展开不需要同步
   const [menuOpen, setMenuOpen] = window.CourseGlobalContext.useSyncVar('menu:open', false);  // 浪费同步带宽
   ```

### 最佳实践

#### 1. 命名规范

- 使用描述性的 key：`slide-id:variable-name`
- 统一前缀避免冲突：同一个幻灯片的所有共享变量用相同前缀

```tsx
// ✅ 好的命名
const [kValue, setKValue] = window.CourseGlobalContext.useSyncVar('knn:k-value', 3);
const [mode, setMode] = window.CourseGlobalContext.useSyncVar('knn:mode', 'train');

// ❌ 不好的命名
const [val, setVal] = window.CourseGlobalContext.useSyncVar('v', 3);
```

#### 2. 数据结构优化

- 简单值优于复杂对象：能用原始类型就不要用对象
- 大数据量考虑分拆：避免一次性同步大数组

```tsx
// ✅ 推荐：简单值
const [kValue, setKValue] = window.CourseGlobalContext.useSyncVar('knn:k', 3);
const [dataset, setDataset] = window.CourseGlobalContext.useSyncVar('knn:dataset', 'iris');

// ⚠️ 可用但注意性能：对象
const [config, setConfig] = window.CourseGlobalContext.useSyncVar('knn:config', { k: 3, mode: 'train' });

// ❌ 避免：大数组同步
const [allData, setAllData] = window.CourseGlobalContext.useSyncVar('data:all', hugeArray);
```

#### 3. 合理使用持久化

- 只在需要时启用 `persist`，避免 localStorage 污染
- 持久化变量应该有明确的语义（设置、偏好等）

```tsx
// ✅ 适合持久化：用户设置
const [theme, setTheme] = window.CourseGlobalContext.useSyncVar('settings:theme', 'light', { persist: true });

// ❌ 不适合持久化：临时状态
const [hovered, setHovered] = window.CourseGlobalContext.useLocalVar('ui:hovered', false, { persist: true });
```

#### 4. 避免过度同步

- 只同步必要的状态，减少网络传输
- 高频更新的状态考虑节流或去抖

```tsx
// ✅ 合理：低频同步（用户操作触发）
const [kValue, setKValue] = window.CourseGlobalContext.useSyncVar('knn:k', 3);

// ⚠️ 需要优化：高频同步（可以考虑节流）
const [mousePos, setMousePos] = window.CourseGlobalContext.useSyncVar('canvas:mouse', { x: 0, y: 0 });
```

#### 5. 类型安全

- 使用 TypeScript 类型注解
- 确保 initialValue 的类型与预期一致

```tsx
// ✅ 推荐：带类型注解
const [count, setCount] = window.CourseGlobalContext.useSyncVar<number>('counter', 0);
const [items, setItems] = window.CourseGlobalContext.useSyncVar<string[]>('list', []);

// ⚠️ 注意：TypeScript 可能无法推断复杂类型
interface Config {
    k: number;
    mode: 'train' | 'test';
}
const [config, setConfig] = window.CourseGlobalContext.useSyncVar<Config>('knn:config', {
    k: 3,
    mode: 'train'
});
```

### 完整示例：互动实验课程

```tsx
// ========================================================
// 课程内容：KNN 分类互动实验
// ========================================================

const { useState, useEffect, useMemo } = React;

// ================= 类型定义 =================

interface DataPoint {
    x: number;
    y: number;
    label: string;
}

// ================= 辅助函数 =================

function euclideanDistance(p1: DataPoint, p2: DataPoint): number {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

// ================= 幻灯片组件 =================

function Slide1() {
    return (
        <div className="flex flex-col items-center justify-center min-h-full text-center p-8 space-y-8 bg-gradient-to-br from-purple-50 via-white to-blue-50">
            <div className="w-32 h-32 bg-purple-100 rounded-full flex items-center justify-center">
                <i className="fas fa-chart-network text-purple-600 text-6xl"></i>
            </div>
            <h1 className="text-5xl font-extrabold text-slate-800">KNN 分类互动实验</h1>
            <p className="max-w-2xl text-lg text-slate-600 bg-white/80 p-6 rounded-2xl">
                通过互动演示理解 K 最近邻算法的工作原理
            </p>
        </div>
    );
}

function Slide2() {
    // K 值：师生同步
    const [kValue, setKValue] = window.CourseGlobalContext.useSyncVar<number>('knn:k-value', 3);
    // 数据集：师生同步
    const [dataset, setDataset] = window.CourseGlobalContext.useSyncVar<string>('knn:dataset', 'iris');
    // 设置面板展开：仅本地，但持久化
    const [showSettings, setShowSettings] = window.CourseGlobalContext.useLocalVar('knn:settings-open', false, {
        persist: true
    });

    // 模拟数据点（仅本地计算）
    const dataPoints: DataPoint[] = useMemo(() => {
        return [
            { x: 100, y: 150, label: 'A' },
            { x: 200, y: 100, label: 'A' },
            { x: 150, y: 200, label: 'A' },
            { x: 400, y: 350, label: 'B' },
            { x: 500, y: 400, label: 'B' },
            { x: 450, y: 450, label: 'B' },
        ];
    }, []);

    // 鼠标位置：仅本地临时状态
    const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

    return (
        <div className="flex flex-col min-h-full p-6 bg-white">
            <h2 className="text-3xl font-bold text-slate-800 mb-4 shrink-0">
                <i className="fas fa-robot mr-3 text-blue-500"></i> KNN 分类演示
            </h2>

            <div className="flex-1 flex gap-4">
                {/* 主显示区域 */}
                <div className="flex-1 bg-slate-50 rounded-2xl p-6 relative border-2 border-slate-200"
                     onMouseMove={(e) => {
                         const rect = e.currentTarget.getBoundingClientRect();
                         setMousePos({
                             x: e.clientX - rect.left,
                             y: e.clientY - rect.top
                         });
                     }}
                     onMouseLeave={() => setMousePos(null)}>
                    <p className="text-slate-600">当前 K 值：{kValue}</p>
                    <p className="text-slate-600">数据集：{dataset}</p>
                    {mousePos && (
                        <div className="absolute text-xs text-slate-500">
                            鼠标位置：({mousePos.x.toFixed(0)}, {mousePos.y.toFixed(0)})
                        </div>
                    )}
                </div>

                {/* 设置面板 */}
                {showSettings && (
                    <div className="w-64 bg-white rounded-2xl p-4 border border-slate-200 shrink-0">
                        <h3 className="font-bold mb-4">参数设置</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">K 值</label>
                                <select
                                    value={kValue}
                                    onChange={(e) => setKValue(Number(e.target.value))}
                                    className="w-full px-3 py-2 border rounded-lg"
                                >
                                    <option value={1}>1</option>
                                    <option value={3}>3</option>
                                    <option value={5}>5</option>
                                    <option value={7}>7</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">数据集</label>
                                <select
                                    value={dataset}
                                    onChange={(e) => setDataset(e.target.value)}
                                    className="w-full px-3 py-2 border rounded-lg"
                                >
                                    <option value="iris">Iris</option>
                                    <option value="mnist">MNIST</option>
                                    <option value="custom">自定义</option>
                                </select>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <button
                onClick={() => setShowSettings(!showSettings)}
                className="mt-4 px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
                {showSettings ? '隐藏设置' : '显示设置'}
            </button>
        </div>
    );
}

// ================= 课程数据 =================

const mySlides = [
    { id: 'intro', component: <Slide1 /> },
    { id: 'demo', component: <Slide2 /> },
];

window.CourseData = {
    title: "KNN 分类互动实验",
    icon: "🤖",
    desc: "通过互动演示理解 KNN 算法",
    color: "from-purple-500 to-blue-600",
    dependencies: [],
    slides: mySlides
};
```

## 提交内容 API（学生端）

学生端课件可以通过 `window.CourseGlobalContext.submitContent` 将内容提交给教师端，教师端会自动保存到文件。

### API 说明

```tsx
window.CourseGlobalContext.submitContent(options: {
    content: any;         // 要提交的内容（字符串、对象、数组等）
    fileName?: string;    // 文件名（默认 "submission.txt"）
    mergeFile?: boolean;  // 是否合并到同一个文件（默认 false）
}) => Promise<{ success: boolean }>;
```

### 参数说明

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `content` | `any` | 必填 | 要提交的内容（字符串、对象、数组等） |
| `fileName` | `string` | `"submission.txt"` | 保存的文件名 |
| `mergeFile` | `boolean` | `false` | 是否合并所有学生提交到一个文件 |

### 存储模式

#### 模式 1：每个学生一个文件（mergeFile = false，默认）

每个学生的提交保存为独立文件，文件命名规则：
- 如果学生端有名称：`{学生名称}-{文件名}`
- 如果学生端无名称：`{IP地址}-{文件名}`
- 示例：`张三-answer.txt`、`192.168.1.101-answer.txt`

#### 模式 2：合并为一个文件（mergeFile = true）

所有学生的提交合并到一个 CSV 文件中，格式：
```
Timestamp,IP,Content,StudentName
2024-03-24T10:30:00.000Z,192.168.1.101,"学生的回答",张三
2024-03-24T10:30:15.000Z,192.168.1.102,"另一个回答",李四
```

### 使用示例

```tsx
function QuizSlide() {
    const [answer, setAnswer] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!answer.trim()) return;

        setIsSubmitting(true);
        try {
            await window.CourseGlobalContext.submitContent({
                content: {
                    question: '1+1=?',
                    answer: answer,
                    timestamp: new Date().toISOString()
                },
                fileName: 'quiz-result.json',
                mergeFile: false  // 每个学生一个文件
            });
            setSubmitted(true);
        } catch (err) {
            console.error('提交失败:', err);
            alert('提交失败，请重试');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center h-full p-8 bg-white">
            <h2 className="text-2xl font-bold mb-6">问题：1+1=？</h2>
            <input
                type="text"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                className="w-64 px-4 py-2 border rounded-lg mb-4"
                placeholder="输入你的答案"
                disabled={submitted}
            />
            <button
                onClick={handleSubmit}
                disabled={submitted || isSubmitting}
                className="px-6 py-2 bg-blue-500 text-white rounded-lg disabled:bg-gray-300"
            >
                {isSubmitting ? '提交中...' : submitted ? '已提交' : '提交答案'}
            </button>
        </div>
    );
}
```

### 注意事项

- 仅学生端可以使用此 API，教师端调用会失败
- 提交的文件会保存在教师端的 `submissions/{课程ID}/` 目录下（可配置）
- 合并模式只支持简单内容，复杂对象建议使用独立文件模式
- 提交超时时间为 30 秒，超时会抛出错误

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
