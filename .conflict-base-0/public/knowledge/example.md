# 萤火课件编辑器 - 使用指南

## 快速开始

萤火课件编辑器是一个基于 React 的交互式课件制作工具，支持师生实时同步交互。

## 基本概念

### CourseData 结构

萤火课件的核心是 `window.CourseData` 对象，它定义了课件的基本信息和幻灯片内容。

```javascript
window.CourseData = {
    id: "unique-id",
    title: "课件标题",
    icon: "📚",
    desc: "课件描述",
    color: "from-blue-500 to-indigo-600",
    slides: [
        {
            title: "第一页标题",
            component: <div>页面内容</div>
        }
    ]
};
```

### 状态管理

课件支持三种状态管理方式：

#### useSyncVar - 同步变量
教师端的操作会自动同步到所有学生端。

```javascript
const [value, setValue] = useSyncVar("key", initialValue, {
    onChange: (newValue) => {
        console.log("值已改变:", newValue);
    }
});
```

**适用场景**：需要学生看到的互动结果，如答题状态、实验参数等。

#### useLocalVar - 本地变量
仅在本地变化，不会同步到学生端。

```javascript
const [isOpen, setIsOpen] = useLocalVar("menu:open", false);
```

**适用场景**：仅教师端显示的 UI 状态，如菜单展开/折叠、工具提示等。

#### useState - React 标准状态
组件内部状态，不涉及同步。

```javascript
const [count, setCount] = React.useState(0);
```

**适用场景**：临时计算变量、中间计算结果等。

## 常用功能

### 摄像头调用

```javascript
const videoRef = useRef(null);

useEffect(() => {
    const onStream = (stream) => {
        if (videoRef.current) {
            videoRef.current.srcObject = stream;
        }
    };

    window.CourseGlobalContext.getCamera(onStream);

    return () => {
        window.CourseGlobalContext.unregisterCamera(onStream);
    };
}, []);
```

### 学生提交

```javascript
await window.CourseGlobalContext.submitContent({
    content: {
        type: "quiz-answer",
        answer: selectedAnswer
    },
    fileName: "result.txt"
});
```

## 最佳实践

1. **保持简洁**：避免不必要的嵌套，使用语义化组件
2. **合理使用同步变量**：同步变量会产生网络通信，避免频繁更新
3. **组件命名规范**：使用 PascalCase 命名组件
4. **代码注释**：添加必要的注释，便于维护

## 样式系统

萤火课件内置 Tailwind CSS，可以直接使用所有工具类。

### 常用布局类
- `flex`: Flex 布局
- `items-center`: 垂直居中
- `justify-center`: 水平居中
- `w-full`: 宽度 100%
- `h-full`: 高度 100%

### 常用样式类
- `bg-blue-500`: 蓝色背景
- `text-white`: 白色文字
- `rounded-xl`: 圆角
- `shadow-xl`: 阴影
- `font-bold`: 粗体

### 渐变色
- `bg-gradient-to-br`: 从左上到右下渐变
- `from-blue-500 to-indigo-600`: 蓝色到靛蓝

## 常见问题

### Q: 如何调试课件？
A: 在编辑器中可以直接查看代码，使用浏览器的开发者工具进行调试。

### Q: 如何处理异步操作？
A: 使用 async/await 或 Promise.then() 处理异步操作。

### Q: 如何优化性能？
A: 避免频繁的状态更新，使用 useCallback 和 useMemo 优化性能。
