# 05 SDK 示例

本章提供完整可抄用的示例，默认基于当前 SDK 写法。

如果你希望在编辑器里获得补全，可以在本地文件顶部加入：

```ts
/// <reference path="../../types/lumesync-course-sdk.d.ts" />
```

路径按你的实际工程位置调整。

## 1. 最小课件

```tsx
function IntroSlide() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-slate-950 text-white">
      <h1 className="text-5xl font-bold">欢迎进入课堂</h1>
    </div>
  );
}

window.CourseData = {
  id: "hello-course",
  title: "最小课件",
  icon: "👋",
  desc: "只包含一个页面",
  slides: [
    { id: "intro", title: "开场", component: <IntroSlide /> }
  ]
};
```

## 2. 教师控制步骤同步

适合讲解题、逐步揭示内容、课堂演示。

```tsx
function StepSlide() {
  const [step, setStep] = window.CourseGlobalContext.useSyncVar("demo-step", 0);
  const isHost = window.CourseGlobalContext.isHost;

  return (
    <div className="w-full h-full p-10 bg-white">
      <h2 className="text-3xl font-bold mb-6">逐步演示</h2>
      <div className="space-y-4 text-lg">
        {step >= 0 && <div>步骤 1：问题背景</div>}
        {step >= 1 && <div>步骤 2：核心概念</div>}
        {step >= 2 && <div>步骤 3：推导过程</div>}
        {step >= 3 && <div>步骤 4：课堂总结</div>}
      </div>

      {isHost && (
        <div className="mt-8 flex gap-3">
          <button
            className="px-4 py-2 rounded bg-slate-200"
            onClick={() => setStep((v) => Math.max(0, v - 1))}
          >
            上一步
          </button>
          <button
            className="px-4 py-2 rounded bg-blue-600 text-white"
            onClick={() => setStep((v) => Math.min(3, v + 1))}
          >
            下一步
          </button>
        </div>
      )}
    </div>
  );
}
```

## 3. 投票页

```tsx
function VotePage() {
  return (
    <VoteSlide
      config={{
        id: "pace-feedback",
        question: "本节课节奏是否合适？",
        anonymous: true,
        options: [
          { id: "fast", label: "偏快" },
          { id: "ok", label: "合适" },
          { id: "slow", label: "偏慢" }
        ]
      }}
    />
  );
}
```

## 4. 问卷页

```tsx
function SurveyPage() {
  return (
    <SurveySlide
      config={{
        id: "lesson-feedback",
        title: "课堂反馈",
        description: "请用 1 分钟完成填写",
        questions: [
          {
            type: "single",
            title: "你是否理解今天的核心内容？",
            options: [
              { value: "yes", label: "理解" },
              { value: "half", label: "部分理解" },
              { value: "no", label: "不理解" }
            ]
          },
          {
            type: "text",
            title: "请写下你最想继续追问的问题"
          }
        ]
      }}
    />
  );
}
```

## 5. 学生主动提交内容

适合代码片段、简答题、实验结果上传。

```tsx
function SubmitSlide() {
  const [text, setText] = React.useState("");
  const isHost = window.CourseGlobalContext.isHost;

  if (isHost) {
    return <div className="p-10">教师端查看学生提交结果即可。</div>;
  }

  const handleSubmit = async () => {
    await window.CourseGlobalContext.submitContent({
      content: text,
      fileName: "answer.txt",
      mergeFile: false
    });
    alert("提交成功");
  };

  return (
    <div className="w-full h-full p-10 bg-white">
      <h2 className="text-3xl font-bold mb-6">提交你的答案</h2>
      <textarea
        className="w-full h-64 p-4 border rounded"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button
        className="mt-4 px-4 py-2 rounded bg-blue-600 text-white"
        onClick={handleSubmit}
      >
        提交
      </button>
    </div>
  );
}
```

## 6. 嵌入网页

```tsx
function WebSlide() {
  return (
    <window.CourseComponents.WebPageSlide
      url="https://example.com"
      title="外部演示页面"
      openLabel="在新窗口打开"
    />
  );
}
```

## 7. 综合示例

```tsx
function IntroSlide() {
  return <div className="w-full h-full flex items-center justify-center bg-slate-950 text-white">课程导入</div>;
}

function StepSlide() {
  const [step, setStep] = window.CourseGlobalContext.useSyncVar("lesson-step", 0);
  return (
    <div className="p-10">
      <h2 className="text-3xl font-bold mb-4">讲解页</h2>
      <p className="mb-4">当前步骤：{step + 1}</p>
      {window.CourseGlobalContext.isHost && (
        <button className="px-4 py-2 rounded bg-blue-600 text-white" onClick={() => setStep((v) => v + 1)}>
          推进
        </button>
      )}
    </div>
  );
}

function VotePage() {
  return (
    <VoteSlide
      config={{
        id: "knowledge-check",
        question: "你对本节内容掌握如何？",
        anonymous: false,
        options: [
          { id: "good", label: "掌握较好" },
          { id: "normal", label: "一般" },
          { id: "weak", label: "还需练习" }
        ]
      }}
    />
  );
}

window.CourseData = {
  id: "sdk-demo-course",
  title: "SDK 综合示例",
  icon: "🧪",
  desc: "包含讲解和互动",
  color: "from-cyan-500 to-blue-600",
  slides: [
    { id: "intro", title: "导入", component: <IntroSlide /> },
    { id: "step", title: "讲解", component: <StepSlide /> },
    { id: "vote", title: "投票", component: <VotePage /> }
  ]
};
```
