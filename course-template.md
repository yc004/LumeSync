# SyncClassroom 课程开发模板

## 概述

课程文件位于 `public/courses/` 目录下，推荐使用 **TypeScript + JSX（`.tsx`）** 格式编写。框架通过 Babel Standalone 在浏览器中实时编译，类型注解在运行时自动剥离，不影响执行，但能为 AI 生成和编辑器提供完整的类型约束。

也支持纯 `.js` 文件，两种格式可以共存。

---

## 基本模板（.tsx）

```tsx
// ========================================================
// 🎨 课程内容：[课程名称]
// ========================================================

// --- 类型定义 ---
interface Dependency {
    name: string;
    localSrc: string;
    publicSrc: string;
}
interface Slide {
    id: string;
    component: JSX.Element;
}
interface CourseData {
    title: string;
    icon: string;
    desc: string;
    color: string;
    dependencies: Dependency[];
    slides: Slide[];
}

// 声明全局变量（告知编译器 React 和 window 的来源）
declare const React: any;
declare const window: any & { CourseData: CourseData };
const { useState, useEffect, useRef } = React;

// ================= SLIDE COMPONENTS =================

function Slide1(): JSX.Element {
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

function Slide2(): JSX.Element {
    return (
        <div className="flex flex-col min-h-full p-6 md:p-10 bg-white">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-8 shrink-0">
                第二页标题
            </h2>
            <div className="flex-1">{/* 内容 */}</div>
        </div>
    );
}

// ================= COURSE DATA =================

const mySlides: Slide[] = [
    { id: 'slide-1', component: <Slide1 /> },
    { id: 'slide-2', component: <Slide2 /> },
];

window.CourseData = {
    title: "课程标题",
    icon: "📚",
    desc: "课程简短描述，显示在课程选择卡片上",
    color: "from-blue-500 to-indigo-600",
    dependencies: [],
    slides: mySlides,
};
```

---

## 组件规范

### 命名

- 组件名使用 PascalCase，如 `IntroSlide`、`ContentSlide1`、`SummarySlide`
- 每个幻灯片是独立的函数组件，返回类型标注为 `: JSX.Element`

### 标题页布局

```tsx
function IntroSlide(): JSX.Element {
    return (
        <div className="flex flex-col items-center justify-center min-h-full text-center p-8 md:p-12 space-y-8 bg-gradient-to-br from-blue-50 via-white to-indigo-50">
            <div className="w-32 md:w-40 h-32 md:h-40 bg-blue-100 rounded-full flex items-center justify-center shadow-inner border-4 border-white">
                <i className="fas fa-brain text-blue-600 text-6xl md:text-[80px]"></i>
            </div>
            <h1 className="text-4xl md:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 tracking-tight">
                标题
            </h1>
            <p className="max-w-3xl text-lg md:text-xl text-slate-500 bg-white/80 p-6 rounded-2xl shadow-sm">
                描述
            </p>
        </div>
    );
}
```

### 内容页布局

```tsx
function ContentSlide(): JSX.Element {
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
            </div>
        </div>
    );
}
```

### 交互页（带 useState）

```tsx
function InteractiveSlide(): JSX.Element {
    const [count, setCount] = useState<number>(0);

    return (
        <div className="flex flex-col min-h-full p-6 md:p-10 bg-white">
            <h2 className="text-3xl font-bold text-slate-800 mb-6 shrink-0">
                <i className="fas fa-hand-pointer mr-3 text-blue-500"></i> 互动演示
            </h2>
            <div className="flex-1 flex flex-col items-center justify-center gap-6">
                <p className="text-2xl font-bold text-slate-700">当前值：{count}</p>
                <button
                    onClick={() => setCount(v => v + 1)}
                    className="px-8 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold text-lg transition-colors"
                >
                    点击 +1
                </button>
            </div>
        </div>
    );
}
```

### 响应式设计

- 移动端优先，使用 `md:` / `lg:` 前缀
- 标题加 `shrink-0` 防止被 flex 压缩
- 内容区加 `flex-1` 占满剩余空间

---

## window.CourseData 配置

### 必需字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | `string` | 课程标题 |
| `icon` | `string` | 课程图标（emoji） |
| `desc` | `string` | 课程描述，显示在选课卡片 |
| `color` | `string` | 卡片渐变色，如 `from-blue-500 to-indigo-600` |
| `slides` | `Slide[]` | 幻灯片数组 |

### 可选字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `dependencies` | `Dependency[]` | 外部依赖库 |
| `modelsUrls` | `{ local: string; public: string }` | AI 模型文件地址 |

### dependencies 格式

```tsx
dependencies: [
    {
        name: "chartjs",
        localSrc: "/lib/chart.umd.min.js",
        publicSrc: "https://fastly.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"
    },
]
```

**工作原理：**
1. 课件加载时，系统自动将 `filename → publicSrc` 注册到服务端
2. `/lib/` 下文件不存在时，服务端用 `publicSrc` 自动下载并缓存
3. 后续所有客户端直接从局域网加载
4. `localSrc` 的文件名必须与 CDN URL 最后一段完全一致

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

### modelsUrls 格式

```tsx
modelsUrls: {
    local: "/weights",
    public: "https://fastly.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights"
}
```

---

## 断网环境支持

| 资源类型 | 处理方式 |
|---------|---------|
| 核心框架（React/Babel/Tailwind/FontAwesome） | 服务端固定地址映射，首次访问自动下载 |
| 课件 `dependencies` | 服务端接收 `publicSrc` 注册后，首次访问自动下载 |
| 外部图片 | 图片代理服务首次访问自动缓存 |

课前批量预下载（教师机需联网）：
```bash
node download-resources.js
```

外部图片使用代理：
```tsx
<img src="/images/proxy?url=https://images.unsplash.com/photo-xxx" alt="描述" className="rounded-xl" />
```

---

## 最佳实践

1. 每页内容保持简洁，一页聚焦一个主题
2. 标题加 `shrink-0`，内容区加 `flex-1`
3. 交互组件的 `useEffect` 清理函数要销毁图表/定时器
4. 列表渲染必须加 `key` 属性
5. 使用图标增强视觉效果（FontAwesome）

## 文件命名规范

- 推荐 `.tsx` 格式，也支持 `.js`
- 使用小写字母和连字符：`python-intro.tsx`、`face-recognition.tsx`
- 文件名去掉扩展名后作为课程 ID

## 完整示例

参考文件：`public/courses/intro-to-ai.tsx`

## 调试技巧

1. 打开浏览器开发者工具（F12）
2. 查看 Console 中的 `[ClassroomApp]` 日志
3. 检查 `window.CourseData` 是否正确设置
4. 使用 React DevTools 检查组件树
