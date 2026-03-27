# 萤火课件语法参考

## 核心架构说明

萤火课件采用 **React 组件驱动**的架构，而非声明式 JSON 配置。课件通过 React 组件直接构建，每个组件都是标准的 React 函数组件。

## 课件数据结构

```javascript
{
  id: "course-id",
  title: "课件标题",
  description: "课件描述",
  slides: [
    {
      component: <MyComponent />  // React 组件
    }
  ]
}
```

## 组件使用方式

### 方式一：直接导入使用

```javascript
import { SurveySlide } from './components/SurveySlide';

function MySlide() {
  return <SurveySlide config={surveyConfig} />;
}
```

### 方式二：全局注册使用

```javascript
// 组件已经通过 window.CourseComponents 注册
function MySlide() {
  const Component = window.CourseComponents.SurveySlide;
  return <Component config={surveyConfig} />;
}
```

### 方式三：在课件文件中使用

课件文件 (`.lume`) 是标准的 JavaScript 文件，可以直接使用任何 React 组件：

```javascript
window.CourseData = {
  id: 'my-course',
  title: '我的课件',
  slides: [
    {
      component: (
        <SurveySlide config={{
          id: 'survey-demo',
          title: '反馈问卷',
          questions: [...]
        }} />
      )
    }
  ]
};
```

---

## 可用组件列表

萤火课件当前提供以下核心组件：

| 组件名 | 文件位置 | 用途 |
|--------|---------|------|
| `SurveySlide` | `public/components/SurveySlide.js` | 问卷/调查组件 |
| `WebPageSlide` | `public/components/WebPageSlide.js` | 网页嵌入组件 |
| `WindowControls` | `public/components/WindowControls.js` | 窗口控制按钮 |
| `LogViewer` | `public/components/LogViewer.js` | 日志查看器 |

---

## SurveySlide（问卷组件）

### 用途

创建交互式问卷、调查表、意见收集表等，支持多种题型。

### 完整属性

```javascript
<SurveySlide
  config={{
    // 必填属性
    id: string,              // 问卷唯一标识
    
    // 显示配置
    title: string,           // 问卷标题
    description: string,     // 问卷描述
    required: boolean,       // 是否显示必填标记（默认: true）
    showProgress: boolean,   // 是否显示进度条（默认: true）
    
    // 主题配置
    theme: {
      primary: string,      // 主色调，支持 Tailwind 颜色名
      background: string    // 背景色，支持 Tailwind 颜色名
    },
    
    // 题目配置
    questions: array        // 问题数组
  }}
/>
```

### 支持的题型

#### 1. 单选题 (single)

```javascript
{
  id: 'q1',
  type: 'single',
  title: '你对这门课程的满意度如何？',
  description: '请选择最符合你感受的选项',
  required: true,
  options: [
    { value: 'very-satisfied', label: '非常满意', description: '超出预期' },
    { value: 'satisfied', label: '满意', description: '符合预期' },
    { value: 'neutral', label: '一般', description: '基本符合预期' },
    { value: 'dissatisfied', label: '不满意', description: '未达到预期' },
    { value: 'very-dissatisfied', label: '非常不满意', description: '远低于预期' }
  ]
}
```

#### 2. 多选题 (multiple)

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
    { value: 'design', label: '界面设计', icon: '🎨' }
  ]
}
```

#### 3. 简答题 (text)

```javascript
{
  id: 'q3',
  type: 'text',
  title: '请写下你的建议',
  description: '你的建议对我们很重要',
  required: false
}
```

#### 4. 评分题 (rating)

```javascript
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
}
```

#### 5. 排序题 (ranking)

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
    { value: 'quiz', label: '测验题', icon: '❓' }
  ]
}
```

### 问题属性详解

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 问题唯一标识 |
| type | string | 是 | 题型：single/multiple/text/rating/ranking |
| title | string | 是 | 问题标题 |
| description | string | 否 | 问题描述 |
| required | boolean | 否 | 是否必填（默认: false） |
| options | array | 否 | 选项数组（部分题型需要） |
| min | number | 否 | 最小值（评分题） |
| max | number | 否 | 最大值（评分题） |

### 选项属性详解

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| value | string/number | 是 | 选项值 |
| label | string | 是 | 选项文本 |
| description | string | 否 | 选项描述 |
| icon | string | 否 | 选项图标（Emoji 或 Icon 类名） |

### 自动保存

SurveySlide 会自动保存答案到本地存储，每 30 秒保存一次草稿。

### 数据提交

问卷提交后，数据会自动格式化为 CSV 格式并发送到教师端。

### 完整示例

```javascript
const surveyConfig = {
  id: 'course-feedback-survey',
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
        { value: 'very-satisfied', label: '非常满意' },
        { value: 'satisfied', label: '满意' },
        { value: 'neutral', label: '一般' },
        { value: 'dissatisfied', label: '不满意' }
      ]
    },
    {
      id: 'q2',
      type: 'multiple',
      title: '你对课程的哪些方面满意？',
      required: true,
      options: [
        { value: 'content', label: '课程内容' },
        { value: 'teaching', label: '教学方式' },
        { value: 'interaction', label: '互动体验' }
      ]
    },
    {
      id: 'q3',
      type: 'text',
      title: '请写下你的建议',
      required: false
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
        { value: 'video', label: '视频教程' },
        { value: 'slides', label: '幻灯片' },
        { value: 'notes', label: '笔记文档' }
      ]
    }
  ]
};

function SurveyPage() {
  return <SurveySlide config={surveyConfig} />;
}
```

---

## WebPageSlide（网页嵌入组件）

### 用途

在课件中嵌入外部网页或在线工具。

### 属性

| 属性 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| url | string | 是 | - | 要嵌入的网页 URL |
| title | string | 否 | '网页' | 显示标题 |
| openLabel | string | 否 | '打开网页' | 打开按钮文本 |
| allow | string | 否 | 'clipboard-read; clipboard-write' | iframe 权限 |
| referrerPolicy | string | 否 | 'no-referrer' | 引用策略 |

### 示例

```javascript
function WebPageExample() {
  return (
    <WebPageSlide 
      url="https://example.com"
      title="示例网站"
      openLabel="在新窗口打开"
    />
  );
}
```

### 功能特性

- 内嵌网页 iframe
- 刷新按钮
- 新窗口打开按钮
- URL 安全处理
- 响应式设计

---

## WindowControls（窗口控制组件）

### 用途

提供窗口最小化、最大化/还原、关闭按钮。

### 属性

| 属性 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| forceFullscreen | boolean | 否 | false | 是否强制全屏（true 时不显示控制按钮） |

### 示例

```javascript
function PageWithControls() {
  return (
    <div className="relative">
      <h1>课件内容</h1>
      <WindowControls />
    </div>
  );
}
```

### 功能特性

- 最小化按钮
- 最大化/还原按钮
- 关闭按钮
- 自动检测窗口状态
- 与 Electron API 集成

---

## LogViewer（日志查看器）

### 用途

查看和搜索应用日志，支持按级别过滤。

### 属性

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| visible | boolean | 是 | 是否显示日志窗口 |
| onClose | function | 是 | 关闭回调函数 |
| onOpenLogDir | function | 是 | 打开日志目录回调函数 |

### 示例

```javascript
function EditorWithLogs() {
  const [showLogs, setShowLogs] = useState(false);
  
  return (
    <>
      <button onClick={() => setShowLogs(true)}>查看日志</button>
      <LogViewer 
        visible={showLogs}
        onClose={() => setShowLogs(false)}
        onOpenLogDir={() => openLogDirectory()}
      />
    </>
  );
}
```

### 功能特性

- 自动日志过滤（ALL/ERROR/WARN/INFO/DEBUG）
- 日志搜索功能
- 自动滚动控制
- 自动刷新日志（2秒间隔）
- 打开日志目录功能

---

## 创建自定义组件

萤火课件支持使用任何标准的 React 组件。只需确保组件返回有效的 JSX。

### 简单示例

```javascript
function CustomSlide() {
  return (
    <div className="p-8 bg-white rounded-lg shadow">
      <h1 className="text-3xl font-bold mb-4">自定义幻灯片</h1>
      <p className="text-lg">这是我的自定义组件</p>
    </div>
  );
}
```

### 带状态的示例

```javascript
import { useState } from 'react';

function QuizSlide() {
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(false);
  
  const handleAnswer = (isCorrect) => {
    if (answered) return;
    setAnswered(true);
    if (isCorrect) setScore(score + 10);
  };
  
  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-4">2 + 2 = ?</h2>
      <div className="space-x-4">
        <button 
          onClick={() => handleAnswer(false)}
          className="px-4 py-2 bg-gray-200 rounded"
        >
          3
        </button>
        <button 
          onClick={() => handleAnswer(true)}
          className="px-4 py-2 bg-blue-500 text-white rounded"
        >
          4
        </button>
      </div>
      {answered && (
        <p className="mt-4 text-green-600">
          {score > 0 ? `正确！得分：${score}` : '错误，再试一次'}
        </p>
      )}
    </div>
  );
}
```

---

## 课件文件模板

### 基础模板

```javascript
window.CourseData = {
  id: 'my-course',
  title: '课件标题',
  description: '课件描述',
  slides: [
    {
      component: <FirstSlide />
    },
    {
      component: <SecondSlide />
    }
  ]
};
```

### 使用 SurveySlide 的完整课件

```javascript
window.CourseData = {
  id: 'survey-demo',
  title: '课程反馈',
  description: '学生反馈调查',
  slides: [
    {
      component: (
        <div className="p-12 text-center">
          <h1 className="text-4xl font-bold mb-6">欢迎参加课程反馈</h1>
          <p className="text-xl text-gray-600">请真实填写，帮助我们改进课程质量</p>
        </div>
      )
    },
    {
      component: (
        <SurveySlide 
          config={{
            id: 'course-feedback',
            title: '课程反馈问卷',
            description: '感谢你的参与',
            questions: [
              {
                id: 'q1',
                type: 'single',
                title: '你对这门课程的满意度如何？',
                options: [
                  { value: '5', label: '非常满意' },
                  { value: '4', label: '满意' },
                  { value: '3', label: '一般' },
                  { value: '2', label: '不满意' },
                  { value: '1', label: '非常不满意' }
                ],
                required: true
              }
            ]
          }} 
        />
      )
    }
  ]
};
```

---

## 教师交互同步

萤火课件支持教师端交互同步功能，允许教师将操作实时同步到所有学生端。

### 两种同步方式

#### 方式一：自动变量同步（推荐）

使用 `useSyncVar` Hook，类似 React 的 `useState`，会自动同步到学生端：

```javascript
// 自动同步的变量
const [selectedOption, setSelectedOption] = window.CourseGlobalContext.useSyncVar('quiz:option', null);

const handleOptionClick = (index) => {
  // 教师端设置值时，自动同步到所有学生端
  setSelectedOption(index);
};

return (
  <div>
    {['A', 'B', 'C'].map((opt, index) => (
      <button
        key={index}
        onClick={() => handleOptionClick(index)}
        className={selectedOption === index ? 'active' : ''}
      >
        {opt}
      </button>
    ))}
  </div>
);
```

#### 方式二：手动事件同步

使用 `syncInteraction` 方法手动发送交互事件：

```javascript
// 教师端：发起同步
const handleOptionClick = (questionId, optionIndex) => {
  setSelectedOption(prev => ({
    ...prev,
    [questionId]: optionIndex
  }));

  // 同步到学生端
  if (window.CourseGlobalContext?.syncInteraction) {
    window.CourseGlobalContext.syncInteraction('selectOption', {
      questionId,
      optionIndex,
      timestamp: Date.now()
    });
  }
};

// 学生端：接收同步
useEffect(() => {
  const handleTeacherInteraction = (e) => {
    const { event, payload } = e.detail;

    if (event === 'selectOption') {
      setSelectedOption(prev => ({
        ...prev,
        [payload.questionId]: payload.optionIndex
      }));
    }
  };

  window.addEventListener('teacher-interaction', handleTeacherInteraction);

  return () => {
    window.removeEventListener('teacher-interaction', handleTeacherInteraction);
  };
}, []);
```

### 本地变量（不自动同步）

对于不需要同步的本地 UI 状态，使用 `useLocalVar`：

```javascript
const [localMenuOpen, setLocalMenuOpen] = window.CourseGlobalContext.useLocalVar('local:menu', false);
```

### 同步数据规范

#### 推荐同步的数据

以下类型的数据**应该**同步：

- ✅ 选项选择状态
- ✅ 元素显示/隐藏状态
- ✅ 拖拽放置结果
- ✅ 输入框内容
- ✅ 场景切换

#### 不推荐同步的数据

以下类型的数据**不应该**同步：

- ❌ 下拉框打开/关闭状态
- ❌ 工具栏切换状态
- ❌ 鼠标移动轨迹
- ❌ 动画播放中间状态

### 注意事项

1. 教师端只有在开启"同步教师交互"设置后，才会自动同步变量
2. 学生端会自动接收并应用教师端的变量变化
3. 变量仅在当前幻灯片内有效
4. 复杂对象（数组、对象）会被完整同步

---

## 注意事项

1. **组件导入**：组件可以通过 `window.CourseComponents` 访问，或直接导入
2. **状态管理**：可以使用 React Hooks (`useState`, `useEffect` 等)
3. **样式**：建议使用 Tailwind CSS 进行样式设计
4. **数据提交**：自定义组件可以使用 WebSocket 或 API 提交数据
5. **错误处理**：建议使用 Error Boundary 包裹复杂组件
6. **交互同步**：需要多端互动的课件，应使用交互同步功能
