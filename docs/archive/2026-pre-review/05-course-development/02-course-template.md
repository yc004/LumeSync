# 02 课件模板说明

本章给出当前版本推荐的课件模板。它直接面向新的运行时和 SDK，不依赖任何旧模板文档。

## 1. 最小模板

```tsx
function IntroSlide() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-950 to-slate-800 text-white">
      <div className="text-center">
        <h1 className="text-5xl font-bold mb-4">课件标题</h1>
        <p className="text-slate-300">这里写一句课程说明</p>
      </div>
    </div>
  );
}

window.CourseData = {
  id: "starter-course",
  title: "起步课件",
  icon: "🚀",
  desc: "最小可运行模板",
  color: "from-sky-500 to-blue-600",
  slides: [
    { id: "intro", title: "开场", component: <IntroSlide /> }
  ]
};
```

## 2. 标准模板

适合正式课件的结构：

```tsx
function IntroSlide() {
  return <div className="w-full h-full p-10">课程导入</div>;
}

function ConceptSlide() {
  const [step, setStep] = window.CourseGlobalContext.useSyncVar("concept-step", 0);

  return (
    <div className="w-full h-full p-10">
      <h2 className="text-3xl font-bold mb-6">概念讲解</h2>
      <p className="mb-6">当前步骤：{step + 1}</p>
      {window.CourseGlobalContext.isHost && (
        <button
          className="px-4 py-2 rounded bg-blue-600 text-white"
          onClick={() => setStep((v) => v + 1)}
        >
          下一步
        </button>
      )}
    </div>
  );
}

function VotePage() {
  return (
    <VoteSlide
      config={{
        id: "teaching-feedback",
        question: "你是否理解本节内容？",
        anonymous: true,
        options: [
          { id: "yes", label: "理解" },
          { id: "half", label: "部分理解" },
          { id: "no", label: "还不理解" }
        ]
      }}
    />
  );
}

window.CourseData = {
  id: "standard-course",
  title: "标准课件模板",
  icon: "📘",
  desc: "包含讲解页和互动页",
  color: "from-indigo-500 to-cyan-500",
  slides: [
    { id: "intro", title: "导入", component: <IntroSlide /> },
    { id: "concept", title: "讲解", component: <ConceptSlide /> },
    { id: "vote", title: "投票", component: <VotePage /> }
  ]
};
```

## 3. 模板设计原则

- 首页负责建立主题，不堆业务细节
- 每一页只承担一个教学动作
- 讲解页和互动页分开
- 同步状态只放进 `CourseGlobalContext.useSyncVar`
- 学生提交统一走 `submitContent`

## 4. 页面层建议

推荐把页面分成三类：

- 讲授页：展示图文、公式、图表
- 互动页：投票、问卷、提交、演示控制
- 总结页：回顾与收束

## 5. 命名建议

- 课件 `id` 使用稳定英文标识
- slide `id` 用简短语义名，如 `intro`、`practice-1`
- 同步变量名使用带作用域的 key，如 `quiz-step`、`chart-mode`

## 6. 资源使用建议

- 图片、音视频、外部网页一律按 URL 消费
- 不要把资源目录规则写进课件逻辑
- 若需要外部页面，可优先使用 `WebPageSlide`

## 7. 下一步

- [组件参考](./03-component-reference.md)
- [课件 SDK 参考](./04-course-sdk.md)
