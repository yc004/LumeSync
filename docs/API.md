# 萤火课堂 课件 API 文档

本文档详细介绍萤火课堂课件开发中可用的 API 接口和全局对象。

## 目录

- [全局对象](#全局对象)
- [React Hooks](#react-hooks)
- [窗口 API](#窗口-api)
- [摄像头 API](#摄像头-api)
- [Socket.io 通信](#socketio-通信)
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

    // 辅助方法
    log: (message: string, data?: any) => void;
    error: (message: string, error?: any) => void;
};
```

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

---

## 工具函数

### window.CourseGlobalContext.log

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

## 技术支持

如有问题，请查看：
- [课件开发模板](./course-template.md)
- [日志系统文档](./LOGGING.md)
- 在教师端控制台查看浏览器控制台日志
