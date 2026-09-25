# 04 课件 SDK 参考

本章汇总当前运行时真正提供给课件的 SDK 接口。

## 1. `window.CourseGlobalContext`

这是课件与课堂运行时之间的主要桥梁。

### 只读属性

- `isHost`：当前是否为教师端

### 方法

#### `getSocket()`

返回当前 Socket 实例。除必须处理底层事件的场景外，不建议课件直接操作。

#### `getCurrentCourseMeta()`

返回当前课程上下文：

```js
{ courseId, slideIndex }
```

#### `useSyncVar(key, initialValue, options?)`

注册一个会在教师端和学生端之间同步的变量。

```tsx
const [step, setStep] = window.CourseGlobalContext.useSyncVar("demo-step", 0);
```

适合：

- 教师控制步骤推进
- 互动题当前状态
- 全班可见结果

#### `useLocalVar(key, initialValue, options?)`

注册一个只在当前客户端生效的变量。

```tsx
const [tab, setTab] = window.CourseGlobalContext.useLocalVar("panel-tab", "intro");
```

#### `registerSyncVar(key, initialValue, options?)`

兼容式包装，返回 `{ get, set }`。新课件优先使用 `useSyncVar`。

#### `registerVar(key, initialValue, options?)`

兼容式包装，返回 `{ get, set }`。新课件优先使用 `useLocalVar`。

#### `getStudentInfo()`

学生端专用，返回当前学生信息：

```js
{ ip, name, studentId }
```

#### `submitContent(options)`

学生端提交内容到教师端。

```tsx
await window.CourseGlobalContext.submitContent({
  content: "学生答案",
  fileName: "answer.txt",
  mergeFile: false
});
```

参数：

- `content`：提交内容，可为字符串或对象
- `fileName`：目标文件名
- `mergeFile`：是否合并写入同一文件

教师端会负责最终保存。

#### `setVoteToolbarState(patch)`

供 `VoteSlide` 等组件更新教师端工具栏状态。普通课件一般不需要直接调用。

#### `clearVoteToolbarState()`

清理投票工具栏状态。

## 2. `window.__LumeSyncCanvas`

Canvas 相关辅助能力。

### `getCanvasPoint(evt, canvas)`

将鼠标或触控事件转换为画布坐标。

### `getHiDpiContext2d(canvas, w, h)`

创建适配高 DPI 屏幕的 2D 上下文。

### `useCanvasDims(padL, padR, padT, padB)`

根据容器变化自动计算画布尺寸。

## 3. `window.__LumeSyncUI`

UI 辅助集合。

### `styles`

当前内置样式变量包括：

- `liquidGlassDark`
- `liquidGlassLight`

### `usePresence(visible, exitMs?)`

用于弹层或浮层的进出场控制。

### `relayoutSideToolbars()`

重排侧边工具栏，避免重叠。

### `SideToolbar`

内置侧边工具栏组件，主要用于运行时界面和控制面板。

## 4. 事件边界

课件通常不需要直接监听原始 Socket 事件，但应知道运行时已经处理这些能力：

- 翻页同步
- 同步变量广播
- 投票开始、提交、结束
- 标注同步
- 学生提交回传

如果课件确实要接入底层事件，优先通过 `getSocket()` 获取连接实例，并保持事件名与运行时协议一致。

## 5. 推荐使用顺序

1. 先用 `window.CourseData` 定义课程和页面
2. 需要共享状态时优先用 `useSyncVar`
3. 需要提交数据时用 `submitContent`
4. 需要复用互动能力时优先使用内置组件

## 6. 配套资源

- 类型声明文件：[types/lumesync-course-sdk.d.ts](../../types/lumesync-course-sdk.d.ts)
- 示例集合：[05-sdk-examples.md](./05-sdk-examples.md)
