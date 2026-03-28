# 教师交互同步 - 快速入门

## 30 秒上手

### 第一步：使用 Hook

```javascript
const [myVar, setMyVar] = window.CourseGlobalContext.useSyncVar('my:key', '初始值');
```

### 第二步：使用变量

```javascript
// 读取值
console.log(myVar);

// 设置值（自动同步并重新渲染）
setMyVar('新值');
```

### 第三步：完成！

教师端设置值后，学生端会自动同步更新并重新渲染组件。

---

## 常见场景示例

### 场景 1：选项选择

```javascript
const [selectedOption, setSelectedOption] = window.CourseGlobalContext.useSyncVar('quiz:option', null);

// 点击选项时
setSelectedOption(2); // 自动同步到学生端
```

### 场景 2：开关切换

```javascript
const [showPanel, setShowPanel] = window.CourseGlobalContext.useSyncVar('panel:show', false);

// 切换面板时
setShowPanel(!showPanel); // 自动同步到学生端
```

### 场景 3：拖拽放置

```javascript
const [dragItem, setDragItem] = window.CourseGlobalContext.useSyncVar('drag:item1', { x: 0, y: 0 });

// 拖拽结束时
setDragItem({ x: 100, y: 200 }); // 自动同步到学生端
```

---

## 本地变量（不同步）

```javascript
const [localState, setLocalState] = window.CourseGlobalContext.useLocalVar('local:menu', false);

// 只在本地使用，不会同步
setLocalState(true);
```

---

## 完整示例

```javascript
function MySlide() {
    // 自动同步的 Hook
    const [selectedOption, setSelectedOption] = window.CourseGlobalContext.useSyncVar('quiz:option', null);
    const [showInfo, setShowInfo] = window.CourseGlobalContext.useSyncVar('info:show', false);

    // 本地变量 Hook（不同步）
    const [localMenu, setLocalMenu] = window.CourseGlobalContext.useLocalVar('local:menu', false);

    return (
        <div>
            {/* 选项会自动同步 */}
            <button onClick={() => setSelectedOption(0)}>选项 A</button>
            <button onClick={() => setSelectedOption(1)}>选项 B</button>

            {/* 面板会自动同步 */}
            <button onClick={() => setShowInfo(!showInfo)}>
                {showInfo ? '隐藏' : '显示'}
            </button>

            {/* 本地菜单不会同步 */}
            <button onClick={() => setLocalMenu(!localMenu)}>
                本地菜单
            </button>
        </div>
    );
}
```

---

## 关键要点

- ✅ 使用 `useSyncVar` 实现自动同步
- ✅ 使用 `useLocalVar` 实现本地变量
- ✅ 就像使用 `useState` 一样简单！
- ✅ 无需手动发送/接收事件
- ✅ 学生端自动接收并触发组件重新渲染

---

## 更多文档

- [完整 API 文档](../dev/API.md)
- [交互同步规范](./interaction-sync-guide.md)
- [示例课件](./interaction-sync-example.lume)
