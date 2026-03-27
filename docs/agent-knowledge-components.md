# 萤火课件组件参考

本文档提供萤火课件所有可用组件的详细参考。

---

## 组件架构说明

萤火课件采用 **React 组件驱动**架构。所有组件都是标准的 React 函数组件，可以通过以下方式使用：

```javascript
// 方式一：直接导入
import { SurveySlide } from './components/SurveySlide';

// 方式二：全局注册
const Component = window.CourseComponents.SurveySlide;

// 方式三：直接使用
<SurveySlide config={config} />
```

---

## 完整组件列表

当前版本提供以下核心组件：

| 组件名 | 用途 | 文件位置 |
|--------|------|---------|
| SurveySlide | 问卷/调查表 | `public/components/SurveySlide.js` |
| WebPageSlide | 网页嵌入 | `public/components/WebPageSlide.js` |
| WindowControls | 窗口控制 | `public/components/WindowControls.js` |
| LogViewer | 日志查看器 | `public/components/LogViewer.js` |

---

## SurveySlide（问卷组件）

### 组件签名

```javascript
<SurveySlide config={SurveyConfig} />
```

### 配置对象结构

```typescript
interface SurveyConfig {
  // 必填属性
  id: string;
  
  // 显示配置
  title: string;
  description?: string;
  required?: boolean;        // 默认: true
  showProgress?: boolean;    // 默认: true
  
  // 主题配置
  theme?: {
    primary?: string;        // 主色调（Tailwind 颜色名）
    background?: string;     // 背景色（Tailwind 颜色名）
  };
  
  // 题目配置
  questions: Question[];
}
```

### Question 类型

```typescript
type Question = 
  | SingleChoiceQuestion
  | MultipleChoiceQuestion
  | TextQuestion
  | RatingQuestion
  | RankingQuestion;

interface BaseQuestion {
  id: string;
  title: string;
  description?: string;
  required?: boolean;      // 默认: false
}
```

### 1. SingleChoiceQuestion（单选题）

```typescript
interface SingleChoiceQuestion extends BaseQuestion {
  type: 'single';
  options: Option[];
}

interface Option {
  value: string | number;
  label: string;
  description?: string;
  icon?: string;
}
```

**示例**：
```javascript
{
  id: 'q1',
  type: 'single',
  title: '你对这门课程的满意度如何？',
  description: '请选择最符合你感受的选项',
  required: true,
  options: [
    { 
      value: 'very-satisfied', 
      label: '非常满意', 
      description: '超出预期',
      icon: '⭐'
    },
    { value: 'satisfied', label: '满意', description: '符合预期' },
    { value: 'neutral', label: '一般', description: '基本符合预期' },
    { value: 'dissatisfied', label: '不满意', description: '未达到预期' }
  ]
}
```

### 2. MultipleChoiceQuestion（多选题）

```typescript
interface MultipleChoiceQuestion extends BaseQuestion {
  type: 'multiple';
  options: Option[];
}
```

**示例**：
```javascript
{
  id: 'q2',
  type: 'multiple',
  title: '你对课程的哪些方面满意？',
  required: true,
  options: [
    { value: 'content', label: '课程内容', icon: '📚' },
    { value: 'teaching', label: '教学方式', icon: '👨‍🏫' },
    { value: 'interaction', label: '互动体验', icon: '💬' },
    { value: 'design', label: '界面设计', icon: '🎨' },
    { value: 'speed', label: '加载速度', icon: '⚡' }
  ]
}
```

### 3. TextQuestion（简答题）

```typescript
interface TextQuestion extends BaseQuestion {
  type: 'text';
  maxLength?: number;      // 最大长度
  placeholder?: string;     // 占位文本
}
```

**示例**：
```javascript
{
  id: 'q3',
  type: 'text',
  title: '请写下你的建议',
  description: '你的建议对我们很重要，请真实填写',
  required: false,
  maxLength: 500,
  placeholder: '请输入你的建议...'
}
```

### 4. RatingQuestion（评分题）

```typescript
interface RatingQuestion extends BaseQuestion {
  type: 'rating';
  options: Option[];      // 必须包含 value 属性
}
```

**示例**：
```javascript
{
  id: 'q4',
  type: 'rating',
  title: '请给教师评分',
  description: '1分最差，5分最好',
  required: true,
  options: [
    { value: 1, label: '非常差', icon: '😠' },
    { value: 2, label: '较差', icon: '😞' },
    { value: 3, label: '一般', icon: '😐' },
    { value: 4, label: '良好', icon: '🙂' },
    { value: 5, label: '优秀', icon: '😊' }
  ]
}
```

### 5. RankingQuestion（排序题）

```typescript
interface RankingQuestion extends BaseQuestion {
  type: 'ranking';
  options: Option[];
}
```

**示例**：
```javascript
{
  id: 'q5',
  type: 'ranking',
  title: '请对以下资源按重要性排序',
  description: '拖拽选项调整顺序',
  required: true,
  options: [
    { value: 'video', label: '视频教程', icon: '🎬' },
    { value: 'slides', label: '幻灯片', icon: '📊' },
    { value: 'notes', label: '笔记文档', icon: '📝' },
    { value: 'quiz', label: '测验题', icon: '❓' },
    { value: 'examples', label: '实例代码', icon: '💻' }
  ]
}
```

### 完整配置示例

```javascript
const surveyConfig = {
  id: 'course-feedback-2024',
  title: '课程反馈问卷',
  description: '请真实填写，帮助我们改进课程质量。',
  required: true,
  showProgress: true,
  theme: {
    primary: 'blue',
    background: 'slate'
  },
  questions: [
    {
      id: 'q1',
      type: 'single',
      title: '你对这门课程的满意度如何？',
      required: true,
      options: [
        { value: '5', label: '非常满意', icon: '⭐⭐⭐⭐⭐' },
        { value: '4', label: '满意', icon: '⭐⭐⭐⭐' },
        { value: '3', label: '一般', icon: '⭐⭐⭐' },
        { value: '2', label: '不满意', icon: '⭐⭐' },
        { value: '1', label: '非常不满意', icon: '⭐' }
      ]
    },
    {
      id: 'q2',
      type: 'multiple',
      title: '你对课程的哪些方面满意？',
      required: true,
      options: [
        { value: 'content', label: '课程内容', icon: '📚' },
        { value: 'teaching', label: '教学方式', icon: '👨‍🏫' },
        { value: 'interaction', label: '互动体验', icon: '💬' },
        { value: 'design', label: '界面设计', icon: '🎨' }
      ]
    },
    {
      id: 'q3',
      type: 'text',
      title: '请写下你的建议',
      description: '你的建议对我们很重要',
      required: false,
      maxLength: 500
    },
    {
      id: 'q4',
      type: 'rating',
      title: '请给教师评分',
      required: true,
      options: [
        { value: 1, label: '非常差', icon: '😠' },
        { value: 2, label: '较差', icon: '😞' },
        { value: 3, label: '一般', icon: '😐' },
        { value: 4, label: '良好', icon: '🙂' },
        { value: 5, label: '优秀', icon: '😊' }
      ]
    },
    {
      id: 'q5',
      type: 'ranking',
      title: '请对以下资源排序',
      required: true,
      options: [
        { value: 'video', label: '视频教程', icon: '🎬' },
        { value: 'slides', label: '幻灯片', icon: '📊' },
        { value: 'notes', label: '笔记文档', icon: '📝' }
      ]
    }
  ]
};

function SurveyPage() {
  return <SurveySlide config={surveyConfig} />;
}
```

### 功能特性

- ✅ 自动保存草稿（每 30 秒）
- ✅ 答案验证（必填项检查）
- ✅ 自动提交到教师端
- ✅ CSV 数据格式化
- ✅ 进度显示
- ✅ 响应式设计
- ✅ 拖拽排序（排序题）

---

## WebPageSlide（网页嵌入组件）

### 组件签名

```javascript
<WebPageSlide props={WebPageProps} />
```

### 属性

```typescript
interface WebPageProps {
  // 必填属性
  url: string;
  
  // 可选属性
  title?: string;              // 默认: '网页'
  openLabel?: string;          // 默认: '打开网页'
  allow?: string;              // 默认: 'clipboard-read; clipboard-write'
  referrerPolicy?: string;     // 默认: 'no-referrer'
}
```

### 属性说明

| 属性 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| url | string | 是 | - | 要嵌入的网页 URL |
| title | string | 否 | '网页' | 显示标题 |
| openLabel | string | 否 | '打开网页' | 打开按钮文本 |
| allow | string | 否 | 'clipboard-read; clipboard-write' | iframe 权限 |
| referrerPolicy | string | 否 | 'no-referrer' | 引用策略 |

### 示例

```javascript
function Example1() {
  return (
    <WebPageSlide 
      url="https://example.com"
      title="示例网站"
      openLabel="在新窗口打开"
    />
  );
}

function Example2() {
  return (
    <WebPageSlide 
      url="https://docs.example.com"
      title="文档中心"
      openLabel="查看文档"
      allow="clipboard-read; clipboard-write; fullscreen"
    />
  );
}
```

### 功能特性

- ✅ 内嵌网页 iframe
- ✅ 刷新按钮
- ✅ 新窗口打开按钮
- ✅ URL 安全处理
- ✅ 响应式设计
- ✅ 错误处理

---

## WindowControls（窗口控制组件）

### 组件签名

```javascript
<WindowControls forceFullscreen={boolean} />
```

### 属性

```typescript
interface WindowControlsProps {
  forceFullscreen?: boolean;    // 默认: false
}
```

### 属性说明

| 属性 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| forceFullscreen | boolean | 否 | false | 是否强制全屏（true 时不显示控制按钮） |

### 示例

```javascript
function PageWithControls() {
  return (
    <div className="relative">
      <h1 className="text-2xl font-bold mb-4">课件内容</h1>
      <p>这里是课件的主要内容</p>
      <WindowControls />
    </div>
  );
}

function FullscreenPage() {
  return (
    <div className="relative">
      <h1 className="text-2xl font-bold mb-4">全屏模式</h1>
      <p>此页面不显示窗口控制按钮</p>
      <WindowControls forceFullscreen={true} />
    </div>
  );
}
```

### 功能特性

- ✅ 最小化按钮
- ✅ 最大化/还原按钮
- ✅ 关闭按钮
- ✅ 自动检测窗口状态
- ✅ 与 Electron API 集成
- ✅ 根据全屏状态自动切换

---

## LogViewer（日志查看器）

### 组件签名

```javascript
<LogViewer 
  visible={boolean}
  onClose={function}
  onOpenLogDir={function}
/>
```

### 属性

```typescript
interface LogViewerProps {
  visible: boolean;
  onClose: () => void;
  onOpenLogDir: () => void;
}
```

### 属性说明

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| visible | boolean | 是 | 是否显示日志窗口 |
| onClose | function | 是 | 关闭回调函数 |
| onOpenLogDir | function | 是 | 打开日志目录回调函数 |

### 示例

```javascript
import { useState } from 'react';

function EditorWithLogs() {
  const [showLogs, setShowLogs] = useState(false);
  
  const handleClose = () => {
    setShowLogs(false);
  };
  
  const handleOpenLogDir = async () => {
    const logDir = await window.electronAPI?.openLogDir?.();
    console.log('日志目录:', logDir);
  };
  
  return (
    <div className="p-4">
      <button 
        onClick={() => setShowLogs(true)}
        className="px-4 py-2 bg-blue-500 text-white rounded"
      >
        查看日志
      </button>
      
      <LogViewer 
        visible={showLogs}
        onClose={handleClose}
        onOpenLogDir={handleOpenLogDir}
      />
    </div>
  );
}
```

### 功能特性

- ✅ 自动日志过滤（ALL/ERROR/WARN/INFO/DEBUG）
- ✅ 日志搜索功能
- ✅ 自动滚动控制
- ✅ 自动刷新日志（2秒间隔）
- ✅ 打开日志目录功能

### 日志级别

| 级别 | 颜色 | 说明 |
|------|------|------|
| ALL | 白色 | 显示所有日志 |
| ERROR | 红色 | 仅显示错误 |
| WARN | 黄色 | 仅显示警告 |
| INFO | 蓝色 | 仅显示信息 |
| DEBUG | 灰色 | 仅显示调试信息 |

---

## 创建自定义组件

萤火课件支持任何标准的 React 组件。

### 基础示例

```javascript
function CustomSlide() {
  return (
    <div className="p-8 bg-white rounded-lg shadow-lg">
      <h1 className="text-3xl font-bold mb-4">自定义幻灯片</h1>
      <p className="text-lg text-gray-600">这是我的自定义组件</p>
    </div>
  );
}
```

### 带状态的示例

```javascript
import { useState, useEffect } from 'react';

function InteractiveQuiz() {
  const [score, setScore] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [showResult, setShowResult] = useState(false);
  
  const questions = [
    { id: 1, question: '2 + 2 = ?', answer: '4' },
    { id: 2, question: '3 * 3 = ?', answer: '9' },
    { id: 3, question: '10 - 5 = ?', answer: '5' }
  ];
  
  const handleAnswer = (answer) => {
    if (answer === questions[currentQuestion].answer) {
      setScore(score + 10);
    }
    
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    } else {
      setShowResult(true);
    }
  };
  
  return (
    <div className="p-8 bg-white rounded-lg shadow">
      {showResult ? (
        <div className="text-center">
          <h2 className="text-3xl font-bold mb-4">测试完成！</h2>
          <p className="text-2xl text-blue-600">得分: {score} / {questions.length * 10}</p>
          <button 
            onClick={() => {
              setScore(0);
              setCurrentQuestion(0);
              setShowResult(false);
            }}
            className="mt-4 px-6 py-2 bg-blue-500 text-white rounded"
          >
            重新开始
          </button>
        </div>
      ) : (
        <div>
          <h2 className="text-2xl font-bold mb-4">
            第 {currentQuestion + 1} / {questions.length} 题
          </h2>
          <p className="text-xl mb-6">{questions[currentQuestion].question}</p>
          <div className="grid grid-cols-2 gap-4">
            {['4', '6', '5', '7'].map((option) => (
              <button
                key={option}
                onClick={() => handleAnswer(option)}
                className="px-6 py-3 bg-blue-100 hover:bg-blue-200 rounded text-lg font-semibold transition-colors"
              >
                {option}
              </button>
            ))}
          </div>
          <p className="mt-4 text-gray-600">当前得分: {score}</p>
        </div>
      )}
    </div>
  );
}
```

### 使用外部 API 的示例

```javascript
import { useState, useEffect } from 'react';

function WeatherSlide() {
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const response = await fetch('https://api.example.com/weather');
        const data = await response.json();
        setWeather(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchWeather();
  }, []);
  
  if (loading) {
    return <div className="p-8 text-center">加载中...</div>;
  }
  
  if (error) {
    return <div className="p-8 text-center text-red-600">错误: {error}</div>;
  }
  
  return (
    <div className="p-8 bg-blue-50 rounded-lg">
      <h2 className="text-2xl font-bold mb-4">今日天气</h2>
      <p className="text-4xl font-bold text-blue-600">{weather?.temperature}°C</p>
      <p className="text-lg text-gray-600">{weather?.description}</p>
    </div>
  );
}
```

---

## 样式指南

推荐使用 Tailwind CSS 进行样式设计。

### 常用类名

```javascript
// 布局
<div className="flex">...</div>              // Flex 布局
<div className="grid grid-cols-2">...</div>  // Grid 布局

// 间距
<div className="p-4">...</div>   // padding: 1rem
<div className="m-4">...</div>   // margin: 1rem
<div className="gap-4">...</div>  // gap: 1rem

// 颜色
<div className="bg-white">...</div>     // 背景色
<div className="text-blue-500">...</div> // 文字颜色

// 文字
<div className="text-xl font-bold">...</div>  // 大小 + 粗体
<div className="text-center">...</div>            // 居中对齐

// 圆角和阴影
<div className="rounded-lg shadow-lg">...</div>  // 圆角 + 阴影

// 响应式
<div className="md:text-2xl">...</div>  // 中等屏幕以上更大
```

---

## 组件注册

如果需要创建可在全局使用的组件，可以注册到 `window.CourseComponents`：

```javascript
function MyCustomSlide({ title, content }) {
  return (
    <div className="p-8 bg-white rounded-lg">
      <h2 className="text-2xl font-bold mb-4">{title}</h2>
      <p className="text-lg">{content}</p>
    </div>
  );
}

// 注册到全局
window.CourseComponents = window.CourseComponents || {};
window.CourseComponents.MyCustomSlide = MyCustomSlide;

// 使用
function Page() {
  const Component = window.CourseComponents.MyCustomSlide;
  return <Component title="示例" content="内容" />;
}
```

---

## 注意事项

1. **组件版本**：确保使用最新版本的组件
2. **性能优化**：避免在渲染函数中创建大量对象
3. **错误处理**：建议使用 Error Boundary 包裹复杂组件
4. **状态管理**：合理使用 React Hooks 管理状态
5. **样式隔离**：使用 CSS Modules 或 Tailwind 避免样式冲突
6. **测试**：为自定义组件编写测试用例
