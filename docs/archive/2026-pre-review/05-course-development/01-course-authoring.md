# 01 课件编写说明

本章描述当前版本的课件 SDK 写法。目标不是兼容旧模板，而是给出一套可以直接落地的新约定。

## 1. 运行模型

课件在渲染运行时中执行，运行时已经提供：

- `React`
- `ReactDOM`
- `window.CourseGlobalContext`
- `window.__LumeSyncCanvas`
- `window.__LumeSyncUI`
- 内置组件，如 `window.VoteSlide`、`window.SurveySlide`、`window.CourseComponents.WebPageSlide`

课件作者只需要定义页面组件，并把课程元数据挂到 `window.CourseData`。

## 2. 课件入口约定

每个课件文件都应导出一个 `window.CourseData` 对象。

推荐最小结构：

```tsx
function IntroSlide() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-slate-950 text-white">
      第一页
    </div>
  );
}

window.CourseData = {
  id: "demo-course",
  title: "示例课件",
  icon: "📘",
  desc: "这是一个最小可运行课件",
  color: "from-blue-500 to-cyan-500",
  slides: [
    { id: "intro", title: "介绍", component: <IntroSlide /> }
  ]
};
```

## 3. `window.CourseData` 字段

### 必填字段

- `title`：课件标题
- `slides`：页面数组

### 推荐字段

- `id`：课件唯一标识，便于提交、同步和日志定位
- `icon`：课程图标
- `desc`：课程简介
- `color`：课程封面色带

### `slides` 项结构

每个 slide 推荐包含：

- `id`：页面唯一标识
- `title`：页面标题
- `component`：React 元素

示例：

```tsx
slides: [
  { id: "intro", title: "导入", component: <IntroSlide /> },
  { id: "practice", title: "练习", component: <PracticeSlide /> }
]
```

## 4. 开发边界

课件代码应遵守当前架构边界：

- 不要在课件里硬编码核心服务的文件路径
- 不要假设资源由 core 提供
- 课件资源地址应由教师端托管
- 课堂同步依赖 `window.CourseGlobalContext` 和运行时事件，而不是自行管理 Socket 协议

## 5. 变量与状态

课件内部有两类状态：

- 本地状态：只在当前客户端生效，使用 `useState` 或 `CourseGlobalContext.useLocalVar`
- 同步状态：需要教师端和学生端共享，使用 `CourseGlobalContext.useSyncVar`

同步变量适合用于：

- 当前步骤
- 教师触发的互动状态
- 题目进度
- 全班共享的可视化结果

不适合同步的内容：

- 浏览器局部 UI 开关
- 临时 hover 状态
- 仅学生本地输入但尚未提交的草稿

## 6. 学生提交

学生端提交内容统一通过：

- `window.CourseGlobalContext.submitContent(options)`

提交会经由运行时事件转发到教师端，再由教师端负责落盘和导出。

这意味着：

- 课件不直接写文件
- 学生端不直接访问文件系统
- 核心运行时不负责提交持久化

## 7. 推荐写法

1. 每页只做一个明确任务
2. 重复结构优先封装为函数组件
3. 交互状态尽量通过 SDK 提供的同步 API 管理
4. 页面布局按 `1280x720` 演示区域设计
5. 对外部资源使用 URL，不要写死本地绝对路径

## 8. 下一步

- [课件模板说明](./02-course-template.md)
- [组件参考](./03-component-reference.md)
- [课件 SDK 参考](./04-course-sdk.md)
