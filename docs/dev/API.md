# 萤火课堂 课件 API 文档

本文档详细介绍萤火课堂课件开发中可用的 API 接口和全局对象。

## 目录

- [全局对象](#全局对象)
- [React Hooks](#react-hooks)
- [窗口 API](#窗口-api)
- [UI 组件（运行时）](#ui-组件运行时)
- [摄像头 API](#摄像头-api)
- [Socket.io 通信](#socketio-通信)
- [教师交互同步](#教师交互同步)
- [工具函数](#工具函数)
- [课件事件](#课件事件)
- [完整示例](#完整示例)

---

## 全局对象

### React

React 及其 Hooks 可以直接使用，无需导入：

```tsx
const { useState, useEffect, useRef, useCallback, useMemo, useContext } = React;
```

### window.CourseData

课件必须导出此对象以供框架加载：

```tsx
window.CourseData = {
    title: string;              // 课程标题
    icon: string;              // 课程图标（emoji）
    desc: string;              // 课程描述
    color: string;             // 渐变色类名（如 "from-blue-500 to-indigo-600"）
    dependencies: Dependency[]; // 外部依赖声明
    slides: Slide[];           // 幻灯片数组
};
```

## 课件文件

- 课件文件使用 `.lume` 后缀（内容仍是 TSX/JSX/TS/JS 脚本文本），放在 `public/courses/`
- 引擎会按 TSX 语法编译 `.lume`（Babel presets: `react` + `typescript`），所以可直接写 JSX + TypeScript 类型注解

### window.CourseGlobalContext

课件运行时上下文，提供核心 API：

```tsx
window.CourseGlobalContext = {
    // 基础属性
    socket: Socket;            // Socket.io 实例
    isHost: boolean;           // 是否为教师端
    socketId: string;          // 当前客户端 socket ID

    // 状态管理
    currentSlide: number;      // 当前幻灯片索引（只读）
    classroomActive: boolean;  // 课堂是否激活

    // 摄像头管理器
    cameraManager: CameraManager;

    // 提交内容 API（学生端专用）
    submitContent: (options: {
        content: any;         // 要提交的内容（可以是字符串、对象等）
        fileName?: string;     // 文件名（默认 "submission.txt"）
        mergeFile?: boolean;   // 是否合并到同一个文件（默认 false）
    }) => Promise<{ success: boolean }>;

    // 自动同步变量 API（简化版，推荐使用）
    registerSyncVar: (key: string, initialValue: any, options?: { onChange?: (newValue: any, oldValue: any) => void }) => {
        get: () => any;
        set: (value: any) => void;
    };

    // 注册普通变量（不自动同步）
    registerVar: (key: string, initialValue: any, options?: { onChange?: (newValue: any, oldValue: any) => void }) => {
        get: () => any;
        set: (value: any) => void;
    };

    // 教师交互同步 API（高级用法，手动控制）
    syncInteraction: (event: string, payload: any) => void;

    // 辅助方法
    log: (message: string, data?: any) => void;
    error: (message: string, error?: any) => void;
};
```

### window.CourseComponents（内置组件库）

引擎会在全局注册一组可复用组件，供课件直接使用（无需 import）。当前可用组件：

- `WebPageSlide`：将一个 URL 作为"纯网页页"嵌入到课件中，并提供"刷新 / 在新窗口打开"的兜底。
- `SurveySlide`：问卷组件，支持多种题型和数据收集。

## UI 组件（运行时）

### window.__LumeSyncUI

课堂运行时提供的 UI 组件集合，用于构建统一风格（液态玻璃）的侧边工具栏与弹窗。

```tsx
const { SideToolbar, styles } = window.__LumeSyncUI;
```

#### `styles`

| 字段 | 类型 | 说明 |
|------|------|------|
| `liquidGlassDark` | string | 深色液态玻璃样式类（适合深色工具栏/结果弹窗） |
| `liquidGlassLight` | string | 浅色液态玻璃样式类（适合浅色设置弹窗） |

#### `SideToolbar`（通用侧边栏）

支持两种模式：

1. **配置模式（推荐）**：只传按钮定义和弹窗渲染函数
2. **兼容模式**：继续传 `toolbar` / `panel` 自定义 JSX

##### 配置模式关键参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `visible` | boolean | 是否显示侧边栏 |
| `buttons` | array | 按钮定义列表（`id/title/iconClass/popupKey/onClick/...`） |
| `activePopupKey` | string \| null | 当前展开弹窗 key |
| `onActivePopupChange` | function | 切换当前弹窗 key |
| `renderPopupContent` | function | `renderPopupContent(popupKey)` 返回对应弹窗内容 |
| `toolbarPrefix` | ReactNode | 工具栏按钮区前置内容 |
| `toolbarSuffix` | ReactNode | 工具栏按钮区后置内容 |
| `side` | `'left' \| 'right'` | 停靠位置 |

##### 使用示例（配置模式）

```tsx
const [activePopupKey, setActivePopupKey] = useState(null);

const buttons = [
  { id: 'tools', title: '工具', iconClass: 'fa-pen', popupKey: 'tools' },
  { id: 'color', title: '颜色', iconClass: 'fa-palette', popupKey: 'color' },
  { id: 'clear', title: '清空', iconClass: 'fa-trash-can', onClick: () => clearAll() }
];

const renderPopupContent = (popupKey) => {
  if (popupKey === 'tools') return <div className={`w-64 ${styles.liquidGlassLight} rounded-2xl p-3`}>...</div>;
  if (popupKey === 'color') return <div className={`w-64 ${styles.liquidGlassLight} rounded-2xl p-3`}>...</div>;
  return null;
};

<window.__LumeSyncUI.SideToolbar
  visible={true}
  side="left"
  buttons={buttons}
  activePopupKey={activePopupKey}
  onActivePopupChange={setActivePopupKey}
  renderPopupContent={renderPopupContent}
/>;
```

### window.WebPageSlide（网页嵌入组件）

**网页嵌入组件**，用于在课件中嵌入外部网页，并提供刷新和新窗口打开功能。

#### Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `url` | `string` | 必填 | 要嵌入的网页 URL |
| `title` | `string` | `'网页'` | 页面标题 |
| `openLabel` | `string` | `'打开网页'` | 新窗口打开按钮的文本 |
| `allow` | `string` | `'clipboard-read; clipboard-write'` | iframe 的 allow 权限 |
| `referrerPolicy` | `string` | `'no-referrer'` | iframe 的 referrerPolicy |

#### 基本用法

```tsx
function ExternalPageSlide() {
    return (
        <WebPageSlide
            url="https://example.com/survey"
            title="课后问卷"
            openLabel="打开问卷"
        />
    );
}
```

#### 注意事项

- 不是所有网站都允许被 iframe 内嵌（可能有 `X-Frame-Options` / `CSP frame-ancestors` 限制）
- 遇到内嵌限制时，可点击"打开"按钮在新窗口打开

### window.SurveySlide（问卷组件）

**问卷通用组件**，支持整页问卷展示、多种题型、自动提交和数据合并。

#### 功能特性

- ✅ 支持五种题型：单选、多选、简答、评分、排序
- ✅ 自动提交数据到教师端
- ✅ 教师端自动合并所有学生提交为 CSV 文件
- ✅ 支持本地草稿保存
- ✅ 实时进度显示
- ✅ 自定义主题色

#### 配置格式

```tsx
interface SurveyConfig {
    // 必填字段
    id: string;           // 问卷唯一标识
    title: string;        // 问卷标题
    questions: Question[]; // 问题数组

    // 可选字段
    description?: string;  // 问卷描述
    required?: boolean;    // 是否必须完成
    showProgress?: boolean; // 是否显示进度
    theme?: {
        primary?: string;   // 主色调
        background?: string; // 背景色
    };
}

interface Question {
    id: string;          // 问题唯一标识
    type: 'single' | 'multiple' | 'text' | 'rating' | 'ranking'; // 题型
    title: string;        // 问题标题
    options?: Option[];   // 选项（单选、多选、评分、排序需要）
    min?: number;         // 最小值（评分）
    max?: number;         // 最大值（评分）
    required?: boolean;   // 是否必答
}
```
            ],
            required: true
        }
    ]
};

// 3. 在页面中使用
function SurveyPage() {
    return <SurveySlide config={surveyConfig} />;
}
```

#### 题型说明

**1. 单选题 (single)**
```tsx
{
    id: 'q1',
    type: 'single',
    title: '问题标题',
    options: [
        { value: 'option1', label: '选项1' },
        { value: 'option2', label: '选项2' }
    ],
    required: true
}
```

**2. 多选题 (multiple)**
```tsx
{
    id: 'q2',
    type: 'multiple',
    title: '问题标题（可多选）',
    options: [
        { value: 'a', label: '选项 A' },
        { value: 'b', label: '选项 B' }
    ],
    required: false
}
```

**3. 简答题 (text)**
```tsx
{
    id: 'q3',
    type: 'text',
    title: '请写下你的回答',
    description: '字数限制：10-500 字',
    required: false
}
```

**4. 评分题 (rating)**
```tsx
{
    id: 'q4',
    type: 'rating',
    title: '请评分',
    min: 1,
    max: 5,
    options: [
        { value: 1, label: '非常差', icon: '😠' },
        { value: 5, label: '非常好', icon: '😊' }
    ],
    required: true
}
```

**5. 排序题 (ranking)**
```tsx
{
    id: 'q5',
    type: 'ranking',
    title: '请排序（拖拽调整顺序）',
    options: [
        { value: 'a', label: '选项 A' },
        { value: 'b', label: '选项 B' }
    ],
    required: true
}
```

#### 数据提交格式

**学生端提交**：自动格式化为 CSV 行，包含：
- Timestamp（时间戳）
- Student IP（学生 IP）
- Student Name（学生姓名，从机房视图配置获取）
- Question 1, Question 2, ...（各题答案）
- Status（提交状态）

**教师端存储**：
- 位置：`submissions/{courseId}/{surveyId}-YYYY-MM-DD.csv`
- 格式：UTF-8 with BOM（Excel 兼容）
- 合并：所有学生提交合并到同一个 CSV 文件

#### 完整示例

查看 `public/courses/survey-demo.lume` 了解完整使用示例。

#### 详细文档

查看 `docs/survey-component-guide.md` 了解完整的开发规范和详细说明。

**示例：添加一个纯网页页**

```tsx
const mySlides = [
  { id: 'survey', component: <WebPageSlide title="课后问卷" url="https://v.wjx.cn/vm/YAYWWcG.aspx#" openLabel="打开问卷" /> },
];
```

**注意：**
- 不是所有网站都允许被 iframe 内嵌（可能有 `X-Frame-Options` / `CSP frame-ancestors` 限制）。遇到这种情况，可点击组件自带的"打开"按钮在新窗口打开。

---

## React Hooks

### useState

状态管理钩子：

```tsx
const [count, setCount] = useState(0);
const [data, setData] = useState({ name: '', age: 0 });
```

### useEffect

副作用钩子：

```tsx
// 组件挂载时执行
useEffect(() => {
    console.log('Component mounted');
    return () => console.log('Component unmounted');
}, []);

// 依赖变化时执行
useEffect(() => {
    fetchData();
}, [page]);
```

### useRef

引用钩子：

```tsx
const inputRef = useRef<HTMLInputElement>(null);

const handleClick = () => {
    inputRef.current?.focus();
};
```

### useCallback

回调记忆钩子：

```tsx
const handleClick = useCallback(() => {
    console.log('clicked');
}, []);
```

### useMemo

计算值记忆钩子：

```tsx
const expensiveValue = useMemo(() => {
    return computeExpensiveValue(a, b);
}, [a, b]);
```

---

## 窗口 API

### window.openWindow

打开新窗口（教师端独有）：

```tsx
window.openWindow(url: string, options?: {
    width?: number;
    height?: number;
    title?: string;
}): Window | null;
```

**示例：**

```tsx
const openHelper = () => {
    window.openWindow('/api/course-guide', {
        width: 800,
        height: 600,
        title: '课件教程'
    });
};
```

### window.closeWindow

关闭当前窗口：

```tsx
window.closeWindow();
```

---

## 内置组件（系统级）

以下组件主要用于系统界面，而非课件内容。

### WindowControls（窗口控制组件）

**窗口控制按钮组件**，提供最小化、最大化/还原、关闭功能。主要用于 Electron 应用的标题栏。

#### Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `forceFullscreen` | `boolean` | `false` | 是否强制全屏模式（隐藏窗口控制按钮） |

#### 功能特性

- ✅ 最小化窗口
- ✅ 最大化/还原窗口
- ✅ 关闭窗口
- ✅ 自动监听窗口状态变化

#### 使用场景

- 教师端课程选择器标题栏
- 编辑器窗口标题栏
- 等待页面标题栏

#### 基本用法

```tsx
function AppHeader() {
    return (
        <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">萤火课堂</h1>
            <WindowControls />
        </div>
    );
}

// 强制全屏模式（隐藏按钮）
function FullscreenView() {
    return <WindowControls forceFullscreen={true} />; // 返回 null
}
```

#### 注意事项

- 此组件仅在 Electron 环境中有效
- 需要 `window.electronAPI` 支持
- 强制全屏时组件返回 `null`

### LogViewer（日志查看器组件）

**系统日志查看器**，用于显示和过滤应用运行日志。

#### Props

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `visible` | `boolean` | 必填 | 是否显示日志查看器 |
| `onClose` | `() => void` | 必填 | 关闭回调函数 |
| `onOpenLogDir` | `() => void` | 必填 | 打开日志目录回调函数 |

#### 功能特性

- ✅ 日志级别过滤（全部/错误/警告/信息/调试）
- ✅ 关键词搜索
- ✅ 自动滚动到最新日志
- ✅ 手动刷新日志
- ✅ 打开日志文件所在目录
- ✅ 彩色日志显示（不同级别不同颜色）
- ✅ 模态窗口显示

#### 日志数据格式

```tsx
interface LogEntry {
    timestamp: string;    // ISO 时间戳
    level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
    category: string;     // 日志分类（APP、SERVER、COURSE 等）
    message: string;      // 日志内容
}
```

#### 基本用法

```tsx
function App() {
    const [showLogs, setShowLogs] = useState(false);

    const handleOpenLogDir = () => {
        if (window.electronAPI?.openLogDirectory) {
            window.electronAPI.openLogDirectory();
        }
    };

    return (
        <div>
            <button onClick={() => setShowLogs(true)}>
                查看日志
            </button>

            <LogViewer
                visible={showLogs}
                onClose={() => setShowLogs(false)}
                onOpenLogDir={handleOpenLogDir}
            />
        </div>
    );
}
```

#### 注意事项

- 当前版本使用模拟数据，实际日志需要通过 IPC 从主进程读取
- 建议每 2 秒自动刷新一次日志
- 日志查看器默认占据屏幕 80% 高度

---

## 摄像头 API

通过 `window.CourseGlobalContext.cameraManager` 访问。

### CameraManager 方法

#### start()

启动摄像头：

```tsx
const startCamera = async () => {
    try {
        await window.CourseGlobalContext.cameraManager.start();
        console.log('Camera started');
    } catch (err) {
        console.error('Failed to start camera:', err);
    }
};
```

#### stop()

停止摄像头：

```tsx
const stopCamera = () => {
    window.CourseGlobalContext.cameraManager.stop();
};
```

#### getStream()

获取摄像头视频流：

```tsx
const stream = window.CourseGlobalContext.cameraManager.getStream();
if (stream) {
    const videoElement = document.querySelector('video');
    videoElement.srcObject = stream;
}
```

#### isStarted()

检查摄像头是否已启动：

```tsx
if (window.CourseGlobalContext.cameraManager.isStarted()) {
    console.log('Camera is running');
}
```

### 完整示例

```tsx
function CameraSlide() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isActive, setIsActive] = useState(false);

    const handleStart = async () => {
        try {
            await window.CourseGlobalContext.cameraManager.start();
            const stream = window.CourseGlobalContext.cameraManager.getStream();
            if (videoRef.current && stream) {
                videoRef.current.srcObject = stream;
                setIsActive(true);
            }
        } catch (err) {
            console.error('Camera error:', err);
        }
    };

    const handleStop = () => {
        window.CourseGlobalContext.cameraManager.stop();
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        setIsActive(false);
    };

    return (
        <div className="flex flex-col items-center space-y-4">
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full max-w-2xl rounded-lg shadow-lg"
            />
            <div className="flex space-x-4">
                {!isActive ? (
                    <button onClick={handleStart} className="px-6 py-2 bg-blue-500 text-white rounded">
                        启动摄像头
                    </button>
                ) : (
                    <button onClick={handleStop} className="px-6 py-2 bg-red-500 text-white rounded">
                        停止摄像头
                    </button>
                )}
            </div>
        </div>
    );
}
```

---

## Socket.io 通信

通过 `window.CourseGlobalContext.socket` 访问 Socket.io 实例。

### Socket 事件

#### 课堂控制事件

| 事件名 | 方向 | 说明 |
|--------|------|------|
| `class:start` | 教师端 → 学生端 | 开课 |
| `class:end` | 教师端 → 学生端 | 结课 |
| `slide:change` | 教师端 → 学生端 | 切换幻灯片 |
| `settings:update` | 教师端 → 学生端 | 更新设置 |
| `course-catalog-updated` | 教师端 → 教师端 | 课程目录更新（刷新后广播） |

#### 数据同步事件

| 事件名 | 方向 | 说明 |
|--------|------|------|
| `data:sync` | 教师端 → 学生端 | 同步自定义数据 |
| `data:broadcast` | 学生端 → 教师端 | 学生端广播数据 |

### Socket 方法

#### on()

监听事件：

```tsx
useEffect(() => {
    const socket = window.CourseGlobalContext.socket;

    const handleMessage = (data) => {
        console.log('Received:', data);
    };

    socket.on('custom-event', handleMessage);

    return () => {
        socket.off('custom-event', handleMessage);
    };
}, []);
```

#### emit()

发送事件：

```tsx
const handleSendData = () => {
    window.CourseGlobalContext.socket.emit('data:broadcast', {
        type: 'answer',
        value: 'hello'
    });
};
```

### 完整示例

```tsx
function InteractiveSlide() {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');

    useEffect(() => {
        const socket = window.CourseGlobalContext.socket;

        const handleData = (data) => {
            setMessages(prev => [...prev, data]);
        };

        socket.on('data:broadcast', handleData);

        return () => {
            socket.off('data:broadcast', handleData);
        };
    }, []);

    const handleSend = () => {
        if (!input.trim()) return;

        window.CourseGlobalContext.socket.emit('data:broadcast', {
            socketId: window.CourseGlobalContext.socketId,
            message: input,
            timestamp: Date.now()
        });

        setInput('');
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto space-y-2 p-4">
                {messages.map((msg, idx) => (
                    <div key={idx} className="bg-white rounded p-2 shadow">
                        <span className="text-gray-500">{msg.socketId}:</span>
                        <span>{msg.message}</span>
                    </div>
                ))}
            </div>
            <div className="flex p-4 bg-gray-100">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    className="flex-1 px-4 py-2 rounded"
                    placeholder="输入消息..."
                />
                <button onClick={handleSend} className="px-6 py-2 bg-blue-500 text-white rounded ml-2">
                    发送
                </button>
            </div>
        </div>
    );
}
```

### 学生提交内容到教师端

学生端可以通过 `submitContent` API 将内容提交给教师端，教师端会自动保存到文件。

#### 基本用法

```tsx
const handleSubmit = async () => {
    try {
        await window.CourseGlobalContext.submitContent({
            content: '学生的回答内容',
            fileName: 'answer.txt'
        });
        alert('提交成功！');
    } catch (err) {
        alert('提交失败：' + err.message);
    }
};
```

#### 参数说明

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `content` | `any` | 必填 | 要提交的内容（字符串、对象、数组等） |
| `fileName` | `string` | `"submission.txt"` | 保存的文件名 |
| `mergeFile` | `boolean` | `false` | 是否合并所有学生提交到一个文件 |

#### 存储模式

**分离模式（mergeFile = false，默认）**
- 每个学生的提交保存为独立文件
- 文件名格式：`学生名_文件名` 或 `IP_文件名`
- 示例：`张三_answer.txt` 或 `192-168-1-101_answer.txt`

**合并模式（mergeFile = true）**
- 所有学生提交合并到一个文件（CSV 格式）
- 文件名即为 `fileName` 指定的名称
- 格式：`Timestamp,IP,Content`
- **重要**：服务器会自动根据学生 IP 从座位表查询并填充学生姓名和学号
- 示例：
  ```
  提交时间,学生IP,学生姓名,学号,Content
  2024-03-24T10:30:00.000Z,192.168.1.101,张三,20230001,"学生的回答"
  2024-03-24T10:30:15.000Z,192.168.1.102,李四,20230002,"另一个回答"
  ```

#### 重要说明

- ✅ **学生信息由服务器自动添加**：在合并模式下，学生的 IP、姓名、学号由服务器根据座位表自动填充
- ❌ **客户端不应添加学生信息**：课件代码中不应手动添加或修改学生信息字段
- ✅ **座位表配置**：教师需在机房视图中正确配置学生姓名和学号，否则这些字段将为空

#### 完整示例

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
        <div className="flex flex-col items-center justify-center h-full p-8">
            <h2 className="text-2xl font-bold mb-6">问题：1+1=?</h2>
            
            {!submitted ? (
                <div className="flex flex-col items-center gap-4">
                    <input
                        type="text"
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        placeholder="输入答案..."
                        className="px-4 py-2 border rounded-lg w-64"
                        disabled={isSubmitting}
                    />
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || !answer.trim()}
                        className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400"
                    >
                        {isSubmitting ? '提交中...' : '提交答案'}
                    </button>
                </div>
            ) : (
                <div className="text-green-600 font-bold text-lg">
                    已提交答案：{answer}
                </div>
            )}
        </div>
    );
}
```

#### 注意事项

1. **学生端专用**：此 API 仅在学生端可用，教师端调用将返回错误
2. **自动保存**：教师端会自动将内容保存到文件，无需手动下载
3. **默认路径**：文件默认保存在项目根目录的 `submissions` 文件夹中
4. **学生名称**：如果学生在机房视图中有命名，文件名会使用学生名称；否则使用 IP 地址
   - **多班级支持**：学生名称与当前选中的班级相关联，切换班级后学生端提交的文件名会使用新班级中对应的学生名称
5. **超时处理**：提交请求有 10 秒超时限制
6. **错误处理**：建议使用 try-catch 处理提交错误

---

## 工具函数

### Canvas 交互与缩放 API

由于课件可能被引擎通过 `transform: scale()` 进行缩放显示，传统的 `getBoundingClientRect()` 或直接使用 `offsetX/Y` 会导致鼠标点击坐标计算错误。请使用引擎提供的专用 API：

#### 获取准确的点击坐标
```tsx
const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // getCanvasPoint 会自动处理 CSS transform 缩放和 Canvas border 的影响
    const p = window.CourseGlobalContext?.canvas?.getCanvasPoint?.(e, e.currentTarget);
    if (!p) return;
    
    // p.x 和 p.y 即为映射到 Canvas 逻辑布局尺寸上的精确坐标
    console.log('点击逻辑坐标:', p.x, p.y);
    
    // 也可以使用相对比例 (0~1)
    console.log('相对坐标:', p.nx, p.ny);
};
```

#### Canvas 响应式尺寸 Hook
```tsx
function SlideWithCanvas() {
    // 传入 padding (左,右,上,下)，返回 wrapper ref 和计算好的逻辑尺寸
    const { wrapRef, dims } = window.CourseGlobalContext.canvas.useCanvasDims(20, 20, 10, 10);
    
    // ...
    return (
        <div ref={wrapRef} className="flex-1 w-full h-full">
            <canvas width={dims.cw} height={dims.ch} />
        </div>
    );
}
```

#### 获取支持 HiDPI 的 Context
```tsx
useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // 自动根据 devicePixelRatio 设置实际分辨率，并返回已经 scale 好的 context
    // 绘制时直接使用 dims.cw / dims.ch 的逻辑坐标即可，无需再乘 dpr
    const ctx = window.CourseGlobalContext.canvas.getHiDpiContext2d(canvas, dims.cw, dims.ch);
    // ...
}, [dims]);
```

### 日志函数

#### window.CourseGlobalContext.log

记录日志：

```tsx
window.CourseGlobalContext.log('User clicked button', { count: 5 });
```

### window.CourseGlobalContext.error

记录错误：

```tsx
window.CourseGlobalContext.error('Failed to load data', error);
```

---

## 课件事件

### 生命周期事件

#### onLoad

课件加载完成（可选）：

```tsx
window.onLoad = () => {
    console.log('Course loaded');
    // 初始化逻辑
};
```

#### onUnload

课件卸载（可选）：

```tsx
window.onUnload = () => {
    console.log('Course unloading');
    // 清理逻辑
};
```

### 幻灯片事件

#### onSlideEnter

进入幻灯片时触发（在组件中定义）：

```tsx
function Slide1() {
    useEffect(() => {
        // 幻灯片进入时执行
        console.log('Slide 1 entered');

        return () => {
            // 幻灯片离开时执行
            console.log('Slide 1 exited');
        };
    }, []);

    return <div>Slide 1</div>;
}
```

---

## 外部依赖

### 依赖声明

在 `window.CourseData.dependencies` 中声明需要的外部库：

```tsx
window.CourseData = {
    // ...
    dependencies: [
        {
            localSrc: "/lib/chart.umd.min.js",
            publicSrc: "https://fastly.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"
        },
        {
            localSrc: "/lib/katex.min.js",
            publicSrc: "https://fastly.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"
        }
    ],
    // ...
};
```

### 使用外部库

加载后通过 `window` 对象访问：

```tsx
function ChartSlide() {
    const chartRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (typeof Chart !== 'undefined' && chartRef.current) {
            new Chart(chartRef.current, {
                type: 'bar',
                data: {
                    labels: ['A', 'B', 'C'],
                    datasets: [{
                        label: 'Data',
                        data: [10, 20, 30]
                    }]
                }
            });
        }
    }, []);

    return <canvas ref={chartRef}></canvas>;
}
```

---

## 完整示例

以下是一个完整的课件示例，包含多种 API 的使用：

```tsx
// ========================================================
// 课程内容：互动演示
// ========================================================

const { useState, useEffect, useRef } = React;

// ================= 类型定义 =================

interface ChatMessage {
    socketId: string;
    message: string;
    timestamp: number;
}

// ================= SLIDE COMPONENTS =================

function Slide1() {
    return (
        <div className="flex flex-col items-center justify-center min-h-full text-center p-8 space-y-8 bg-gradient-to-br from-blue-50 via-white to-indigo-50">
            <div className="text-8xl">📊</div>
            <h1 className="text-5xl font-bold text-gray-800">互动演示课件</h1>
            <p className="text-xl text-gray-600 max-w-2xl">
                本课件演示了萤火课堂的主要 API 功能
            </p>
        </div>
    );
}

function Slide2() {
    const [count, setCount] = useState(0);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [cameraActive, setCameraActive] = useState(false);

    const startCamera = async () => {
        try {
            await window.CourseGlobalContext.cameraManager.start();
            const stream = window.CourseGlobalContext.cameraManager.getStream();
            if (videoRef.current && stream) {
                videoRef.current.srcObject = stream;
                setCameraActive(true);
            }
            window.CourseGlobalContext.log('Camera started');
        } catch (err) {
            window.CourseGlobalContext.error('Camera error', err);
        }
    };

    const stopCamera = () => {
        window.CourseGlobalContext.cameraManager.stop();
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        setCameraActive(false);
    };

    return (
        <div className="flex flex-col h-full p-8 space-y-6">
            <h2 className="text-3xl font-bold">状态与摄像头演示</h2>

            {/* 状态演示 */}
            <div className="bg-white rounded-lg p-6 shadow">
                <h3 className="text-xl font-semibold mb-4">计数器：{count}</h3>
                <div className="flex space-x-4">
                    <button
                        onClick={() => setCount(c => c + 1)}
                        className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                        增加
                    </button>
                    <button
                        onClick={() => setCount(c => c - 1)}
                        className="px-6 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                    >
                        减少
                    </button>
                </div>
            </div>

            {/* 摄像头演示 */}
            <div className="bg-white rounded-lg p-6 shadow">
                <h3 className="text-xl font-semibold mb-4">摄像头</h3>
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full max-w-2xl rounded-lg bg-gray-900"
                />
                <div className="mt-4 space-x-4">
                    {!cameraActive ? (
                        <button
                            onClick={startCamera}
                            className="px-6 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                        >
                            启动摄像头
                        </button>
                    ) : (
                        <button
                            onClick={stopCamera}
                            className="px-6 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                        >
                            停止摄像头
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

function Slide3() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');

    useEffect(() => {
        const socket = window.CourseGlobalContext.socket;

        const handleMessage = (data: ChatMessage) => {
            setMessages(prev => [...prev, data]);
        };

        socket.on('data:broadcast', handleMessage);

        return () => {
            socket.off('data:broadcast', handleMessage);
        };
    }, []);

    const handleSend = () => {
        if (!input.trim()) return;

        window.CourseGlobalContext.socket.emit('data:broadcast', {
            socketId: window.CourseGlobalContext.socketId,
            message: input,
            timestamp: Date.now()
        });

        setInput('');
    };

    return (
        <div className="flex flex-col h-full">
            <h2 className="text-3xl font-bold p-4">Socket 通信演示</h2>

            {/* 消息列表 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {messages.map((msg, idx) => (
                    <div key={idx} className="bg-white rounded p-3 shadow border-l-4 border-blue-500">
                        <div className="text-sm text-gray-500">
                            {msg.socketId} • {new Date(msg.timestamp).toLocaleTimeString()}
                        </div>
                        <div className="text-lg">{msg.message}</div>
                    </div>
                ))}
            </div>

            {/* 输入框 */}
            <div className="p-4 bg-gray-100 border-t">
                <div className="flex space-x-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        className="flex-1 px-4 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="输入消息并回车发送..."
                        onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                    />
                    <button
                        onClick={handleSend}
                        className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                    >
                        发送
                    </button>
                </div>
            </div>
        </div>
    );
}

// ================= COURSE DATA =================

window.CourseData = {
    title: "互动演示",
    icon: "📊",
    desc: "演示萤火课堂的主要 API 功能",
    color: "from-blue-500 to-indigo-600",
    dependencies: [
        // 在这里声明外部依赖
    ],
    slides: [
        { id: 's1', component: <Slide1 /> },
        { id: 's2', component: <Slide2 /> },
        { id: 's3', component: <Slide3 /> }
    ]
};
```

---

## 常见问题

### Q: 如何判断当前是教师端还是学生端？

```tsx
if (window.CourseGlobalContext.isHost) {
    // 教师端逻辑
} else {
    // 学生端逻辑
}
```

### Q: 如何在幻灯片切换时执行清理操作？

```tsx
function MySlide() {
    useEffect(() => {
        // 进入幻灯片时执行

        return () => {
            // 离开幻灯片时执行清理
            // 例如：停止定时器、关闭摄像头等
        };
    }, []);
}
```

### Q: 如何在教师端同步数据到所有学生端？

```tsx
const syncData = () => {
    window.CourseGlobalContext.socket.emit('data:sync', {
        key: 'myData',
        value: { count: 10, active: true }
    });
};

// 学生端接收
useEffect(() => {
    const socket = window.CourseGlobalContext.socket;

    const handleSync = (data) => {
        console.log('Received sync:', data);
        // 处理同步数据
    };

    socket.on('data:sync', handleSync);

    return () => {
        socket.off('data:sync', handleSync);
    };
}, []);
```

---

## 自动变量同步（推荐）

引擎提供了简化的自动同步机制，课件开发者只需使用类似 `useState` 的 Hook，引擎会自动处理同步逻辑，无需手动发送和接收事件。

### useSyncVar - 自动同步变量 Hook

注册一个会自动同步到所有学生端的变量。行为与 React 的 `useState` 非常相似。

#### 语法

```tsx
const [value, setValue] = window.CourseGlobalContext.useSyncVar(key, initialValue, options);
```

#### 参数

- `key` (string): 变量的唯一标识符
- `initialValue` (any): 变量的初始值
- `options` (object, 可选):
  - `onChange` (function): 变量变化时的回调函数，接收 `(newValue, oldValue)` 两个参数

#### 返回值

返回一个包含当前值和 setter 函数的数组，就像 `useState` 一样：

```tsx
[
    any,          // 当前值
    (value) => void // 设置新值的函数（教师端会自动同步到学生端）
]
```

#### 使用示例

**示例 1：选项选择同步**

```tsx
function QuizSlide() {
    // 使用自动同步的 Hook：当前选中的选项
    const [selectedOption, setSelectedOption] = window.CourseGlobalContext.useSyncVar('quiz:option', null, {
        onChange: (newValue, oldValue) => {
            console.log('选项已改变:', oldValue, '->', newValue);
        }
    });

    const handleOptionClick = (index) => {
        // 设置新值，引擎会自动同步到所有学生端并重新渲染组件
        setSelectedOption(index);
    };

    return (
        <div className="quiz-container">
            {['A', 'B', 'C', 'D'].map((opt, index) => (
                <button
                    key={index}
                    onClick={() => handleOptionClick(index)}
                    className={`option-btn ${selectedOption === index ? 'selected' : ''}`}
                >
                    {opt}
                </button>
            ))}
        </div>
    );
}
```

**示例 2：拖拽位置同步**

```tsx
function DragDropSlide() {
    // 使用同步 Hook
    const [item1Pos, setItem1Pos] = window.CourseGlobalContext.useSyncVar('item1:pos', { x: 0, y: 0 });
    const [item1Target, setItem1Target] = window.CourseGlobalContext.useSyncVar('item1:target', null);

    const handleDrop = (targetId) => {
        setItem1Target(targetId);
    };

    return (
        <div>
            <div style={{ left: item1Pos.x, top: item1Pos.y }}>
                拖拽我
            </div>
            <div onDrop={() => handleDrop('box1')}>目标区域1</div>
            <div onDrop={() => handleDrop('box2')}>目标区域2</div>
        </div>
    );
}
```

**示例 3：面板状态同步**

```tsx
function PanelSlide() {
    const [panelState, setPanelState] = window.CourseGlobalContext.useSyncVar('panel:visible', {
        panel1: false,
        panel2: false,
        panel3: false
    });

    const togglePanel = (panelId) => {
        setPanelState({
            ...panelState,
            [panelId]: !panelState[panelId]
        });
    };

    return (
        <div>
            <button onClick={() => togglePanel('panel1')}>切换面板1</button>
            {panelState.panel1 && <div>面板1内容</div>}
        </div>
    );
}
```

### useLocalVar - 普通变量 Hook（不自动同步）

如果某些变量不需要同步到学生端（例如本地 UI 状态），使用 `useLocalVar`，它的行为完全等同于 `useState`：

```tsx
function MySlide() {
    // 不同步的本地变量
    const [localMenuOpen, setLocalMenuOpen] = window.CourseGlobalContext.useLocalVar('local:menu', false);
    
    const toggleMenu = () => {
        setLocalMenuOpen(!localMenuOpen);
    };

    return (
        <div>
            <button onClick={toggleMenu}>打开菜单</button>
            {localMenuOpen && <div>菜单内容</div>}
        </div>
    );
}
```

### 自动同步 vs 手动同步

| 特性 | 自动同步 (`useSyncVar`) | 手动同步 (`syncInteraction`) |
|------|---------------------------|--------------------------|
| **使用复杂度** | 极低，就像 useState | 较高，需要手动发送和接收 |
| **适用场景** | 状态变量同步 | 复杂的事件同步 |
| **代码量** | 少 | 多 |
| **灵活性** | 标准化 | 完全自定义 |
| **推荐度** | ⭐⭐⭐⭐⭐ | ⭐⭐ |

### 最佳实践

1. **命名规范**：使用 `prefix:name` 格式，例如 `quiz:option`、`drag:position`
2. **变更回调**：利用 `onChange` 处理副作用（如播放动画）
3. **避免循环**：不要在 `onChange` 中再次修改同一个变量
4. **合理分组**：相关的变量使用相同前缀（如 `panel1:visible`、`panel1:content`）

### 注意事项

- 教师端只有在开启"同步教师交互"后，才会自动同步变量
- 学生端会自动接收并应用教师端的变量变化
- 变量仅在当前幻灯片内有效
- 复杂对象（数组、对象）会被完整同步

---

## 手动交互同步（高级用法）

对于更复杂的同步场景，可以使用手动同步方式。

#### 教师端：发起同步

在教师端的课件组件中，使用 `syncInteraction` 方法发起同步：

```tsx
const handleOptionSelect = (questionId: string, optionIndex: number) => {
    // 更新本地状态
    setSelectedOption(prev => ({
        ...prev,
        [questionId]: optionIndex
    }));
    
    // 同步到学生端
    window.CourseGlobalContext.syncInteraction('select-option', {
        questionId,
        optionIndex,
        timestamp: Date.now()
    });
};

const handleDragEnd = (itemId: string, targetId: string, x: number, y: number) => {
    updateItemPosition(itemId, { targetId, x, y });
    
    // 同步拖拽结果
    window.CourseGlobalContext.syncInteraction('item-dropped', {
        itemId,
        targetId,
        position: { x, y }
    });
};

const togglePanel = (panelId: string, show: boolean) => {
    setPanels(prev => ({
        ...prev,
        [panelId]: show
    }));
    
    // 同步面板状态
    window.CourseGlobalContext.syncInteraction('toggle-panel', {
        panelId,
        show
    });
};
```

#### 学生端：接收同步

在学生端的课件组件中，监听 `teacher-interaction` 事件：

```tsx
useEffect(() => {
    const handleTeacherInteraction = (e: CustomEvent) => {
        const { event, payload } = e.detail;
        
        switch (event) {
            case 'select-option':
                setSelectedOption(prev => ({
                    ...prev,
                    [payload.questionId]: payload.optionIndex
                }));
                break;
                
            case 'item-dropped':
                updateItemPosition(payload.itemId, {
                    targetId: payload.targetId,
                    x: payload.position.x,
                    y: payload.position.y
                });
                break;
                
            case 'toggle-panel':
                setPanels(prev => ({
                    ...prev,
                    [payload.panelId]: payload.show
                }));
                break;
                
            default:
                console.warn('[Interaction Sync] Unknown event:', event);
        }
    };
    
    // 监听教师交互事件
    window.addEventListener('teacher-interaction', handleTeacherInteraction);
    
    return () => {
        window.removeEventListener('teacher-interaction', handleTeacherInteraction);
    };
}, []);
```

### 数据同步规范

#### ✅ 推荐同步的数据

以下类型的数据**应该**同步（课件的核心业务状态）：

- **选项选择**：选择题、多选题的选项状态
- **元素状态**：面板显示/隐藏、按钮激活/禁用
- **拖拽放置**：拖拽操作的目标位置
- **数据更新**：输入框内容、数值修改
- **场景切换**：切换不同视图或场景

#### ❌ 不推荐同步的数据

以下类型的数据**不应该**同步（界面显示层面的临时状态）：

- **UI 显示状态**：下拉框打开/关闭、菜单显示
- **工具栏切换**：画笔工具、颜色选择器状态
- **鼠标位置**：鼠标移动轨迹、悬停状态
- **动画过程**：动画播放的中间状态

> **详细规范**：请参阅 [交互同步规范文档](../interaction/interaction-sync-guide.md)


### 最佳实践

1. **幂等性设计**：确保重复应用同一事件不会产生副作用
2. **数据验证**：在接收端验证 payload 的有效性
3. **防抖节流**：对高频事件进行防抖或节流处理
4. **条件同步**：只在数据确实变化时才发起同步

### 注意事项

1. **教师端专用**：此 API 仅在教师端可用，学生端调用无效
2. **设置依赖**：学生端只有在教师开启"同步教师交互"设置后才会接收同步事件
3. **页面限制**：同步事件仅在当前幻灯片页面内生效
4. **性能考虑**：避免同步大量数据或高频触发的事件


## AI 编辑器配置

萤火课件编辑器的 AI 聊天功能使用 Coze API v3。

### 配置参数

在编辑器设置中需要配置以下参数：

| 参数 | 说明 | 示例 |
|------|------|------|
| Base URL | Coze API 服务器地址 | `https://api.coze.cn` |
| API Key | Coze 个人访问令牌 (PAT) | `pat_xxxxx` |
| Model | 模型名称 | `coze-chat-v3.5` |

### API 端点

- **聊天端点：** `/v3/chat/completions`
- **流式响应：** 支持 SSE (Server-Sent Events)
- **请求格式：** 符合 OpenAI 兼容格式

### 请求示例

```json
{
  "model": "coze-chat-v3.5",
  "messages": [
    { "role": "user", "content": "帮我创建一个选择题课件" }
  ],
  "temperature": 0.7,
  "stream": true
}
```

### 技术支持

如有问题，请查看：
- [课件开发模板](./course-template.md)
- [日志系统文档](../ops/LOGGING.md)
- [Coze API v3 迁移指南](../ai/coze-api-v3-migration.md)
- [Agent 系统最佳实践](../ai/agent-knowledge-best-practices.md)
- 在教师端控制台查看浏览器控制台日志
