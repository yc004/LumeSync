# Skill: create-course

## 描述

为 SyncClassroom 互动课堂框架创建一个新的课程文件。根据用户提供的课程主题和内容大纲，生成符合框架规范的 JavaScript 课程文件。

## 调用方式

用户说"创建一个关于 XXX 的课程"或"生成 XXX 课件"时调用此 skill。

## 执行步骤

### 步骤 1: 分析需求

从用户输入中提取：
- 课程主题/标题
- 目标受众（初学者/进阶）
- 内容要点/大纲
- 预计幻灯片数量
- 是否需要特殊依赖（如 face-api.js 等）

### 步骤 2: 设计课程结构

规划幻灯片结构：
1. **标题页** - 课程名称、副标题、引入
2. **目录/概述页** - 课程内容概览
3. **内容页** (多个) - 核心知识点
4. **实践/互动页** (可选) - 练习或演示
5. **总结页** - 要点回顾

### 步骤 3: 生成课程文件

在 `public/courses/` 目录下创建 `.js` 文件，文件名格式：`主题关键词.js`（小写，连字符连接）

### 步骤 4: 遵循代码规范

#### 文件头部
```javascript
// ========================================================
// 🎨 课程内容：[课程名称]
// ========================================================

const { useState, useEffect, useRef } = React;
```

#### 幻灯片组件模板

**标题页：**
```javascript
function IntroSlide() {
    return (
        <div className="flex flex-col items-center justify-center min-h-full text-center p-8 md:p-12 space-y-8 bg-gradient-to-br from-[主色]-50 via-white to-[副色]-50">
            <div className="w-32 md:w-40 h-32 md:h-40 bg-[主色]-100 rounded-full flex items-center justify-center shadow-inner border-4 border-white">
                <i className="fas fa-[图标] text-[主色]-600 text-6xl md:text-[80px] drop-shadow-md"></i>
            </div>
            <h1 className="text-4xl md:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-[主色]-600 to-[副色]-600 tracking-tight">
                [课程标题]
            </h1>
            <h2 className="text-xl md:text-3xl font-bold text-slate-600 mt-4 tracking-wide">
                [副标题]
            </h2>
            <p className="max-w-3xl text-lg md:text-xl text-slate-500 mt-6 leading-relaxed bg-white/80 p-6 rounded-2xl shadow-sm">
                [课程简介]
            </p>
        </div>
    );
}
```

**内容页：**
```javascript
function ContentSlide1() {
    return (
        <div className="flex flex-col min-h-full p-6 md:p-10 bg-white">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-6 md:mb-8 flex items-center shrink-0">
                <i className="fas fa-[图标] mr-4 text-[颜色]-500"></i> [标题]
            </h2>
            
            <div className="bg-[颜色]-50 p-6 rounded-2xl shadow-sm border border-[颜色]-100">
                [内容区域]
            </div>
        </div>
    );
}
```

#### 数据导出
```javascript
const mySlides = [
    { id: 'intro', component: <IntroSlide /> },
    { id: 'content-1', component: <ContentSlide1 /> },
    // ... 更多幻灯片
];

window.CourseData = {
    title: "[课程标题]",
    icon: "[emoji图标]",
    desc: "[简短描述，50字以内]",
    color: "from-[主色]-500 to-[副色]-600",
    dependencies: [], // 或根据需要添加外部脚本依赖
    slides: mySlides
};
```

### 引用外部脚本（dependencies）

如果课程需要使用外部 JavaScript 库（如 Chart.js、KaTeX 等），在 `dependencies` 数组中声明：

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
3. 后续所有学生端直接从局域网加载，速度提升 10-100 倍
4. **注意**：`localSrc` 中的文件名必须与 CDN 上的实际文件名一致（如 `chart.umd.min.js`，而不是 `chart.js`）

**常用外部库推荐：**

| 库名称 | 用途 | CDN 地址 | 本地文件名 |
|--------|------|----------|-----------|
| Chart.js | 图表绘制 | `https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js` | `chart.umd.min.js` |
| KaTeX | 数学公式 | `https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js` | `katex.min.js` |
| Prism.js | 代码高亮 | `https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js` | `prism.min.js` |
| face-api.js | 人脸识别 | `https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js` | `face-api.min.js` |

**断网环境支持：**

| 资源类型 | 处理方式 |
|---------|---------|
| 核心框架（React/Babel/Tailwind/FontAwesome） | 服务端固定地址映射，首次访问自动下载 |
| 课件 `dependencies` | 服务端接收 `publicSrc` 注册后，首次访问自动下载 |
| 外部图片 | 图片代理服务首次访问自动缓存 |

课件声明的 `dependencies` **无需手动预下载**，首次打开课件时服务端会自动从 `publicSrc` 拉取并缓存。

**AI 模型文件（modelsUrls）：**

如果依赖需要加载模型文件（如 face-api.js 的权重文件），额外配置 `modelsUrls`：

```javascript
window.CourseData = {
    title: "人脸识别课程",
    icon: "🤖",
    desc: "使用 face-api.js 进行实时人脸识别",
    color: "from-blue-500 to-indigo-600",
    dependencies: [
        {
            name: "face-api",
            localSrc: "/lib/face-api.min.js",
            publicSrc: "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js"
        }
    ],
    modelsUrls: {
        local: "/weights",     // 局域网模型路径
        public: "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights"
    },
    slides: mySlides
};
```

**模型文件缓存机制：**
- 首次使用时，教师端自动从公网下载模型文件到 `public/weights/`
- 后续学生端直接从教师端局域网获取，加载速度提升 10-100 倍

### 步骤 5: 样式指南

#### 颜色搭配建议
- 科技/AI 主题：`blue`, `indigo`, `purple`
- 自然/生物主题：`green`, `teal`, `emerald`
- 活力/创意主题：`orange`, `pink`, `rose`
- 商业/专业主题：`slate`, `gray`, `blue`

#### 图标选择（FontAwesome）
- 概念/想法：`fa-lightbulb`
- 学习/教育：`fa-graduation-cap`, `fa-book`
- 技术/代码：`fa-code`, `fa-microchip`, `fa-robot`
- 数据/分析：`fa-chart-line`, `fa-database`
- 用户/人群：`fa-users`, `fa-user-graduate`

#### 布局组件
- 卡片：`bg-white p-6 rounded-2xl shadow-sm border`
- 高亮框：`bg-[颜色]-50 p-6 rounded-2xl border border-[颜色]-100`
- 步骤指示器：带数字的圆角矩形
- 对比布局：左右分栏或上下排列

### 步骤 6: 验证与测试

创建文件后：
1. 检查文件路径是否正确：`public/courses/文件名.js`
2. 验证 JSX 语法是否正确
3. 确保 `window.CourseData` 包含所有必需字段
4. 提醒用户刷新课程列表或重启服务器

## 输出格式

完成课程创建后，向用户报告：
- 课程文件路径
- 课程标题和描述
- 幻灯片数量
- 使用说明（如何查看新课程）

## 示例对话

**用户：** 创建一个关于 Python 编程入门的课程

**助手：** 
1. 确认需求：初学者、基础语法、约 5-6 页
2. 设计结构：标题页 → Python 简介 → 变量与数据类型 → 控制流 → 函数 → 总结
3. 创建文件：`public/courses/python-intro.js`
4. 使用蓝色主题、`fa-python` 图标（或 `fa-code`）
5. 生成代码并保存
6. 报告完成

## 注意事项

1. 课程内容要适合在 16:9 比例的幻灯片中展示
2. 每页内容不要过多，保持简洁明了
3. 使用响应式类名（`md:`, `lg:`）确保在不同屏幕尺寸下正常显示
4. 避免使用外部状态管理，每个幻灯片组件应该是独立的
5. 如需图片，使用图片代理服务确保断网可用：`/images/proxy?url=https://图片地址`（推荐 Unsplash 等免费 HTTPS 图库）
