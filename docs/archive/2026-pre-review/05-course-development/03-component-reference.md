# 03 组件参考

本章描述当前课件运行时内置的组件和可直接使用的全局挂载对象。

## 1. 可直接使用的组件

当前已明确暴露给课件的组件包括：

- `window.VoteSlide`
- `window.SurveySlide`
- `window.CourseComponents.WebPageSlide`

通常可直接写成：

```tsx
<VoteSlide config={...} />
<SurveySlide config={...} />
<window.CourseComponents.WebPageSlide url="https://example.com" />
```

## 2. `VoteSlide`

### 作用

用于课堂实时投票。教师端发起和结束投票，学生端提交选项，运行时负责同步结果。

### 配置结构

```tsx
<VoteSlide
  config={{
    id: "vote-1",
    question: "你更希望下一节怎么上？",
    anonymous: true,
    options: [
      { id: "demo", label: "演示讲解" },
      { id: "practice", label: "上机练习" },
      { id: "group", label: "分组讨论" }
    ]
  }}
/>
```

### 字段

- `id`：投票唯一标识，必填
- `question`：题干，必填
- `anonymous`：是否匿名，默认 `false`
- `options`：选项数组，至少两个
- `theme`：主题对象，可选

### 运行行为

- 教师端通过右侧工具栏控制开始与结束
- 学生端只能在运行中提交一次
- 匿名投票结束前不会向学生端广播实时结果

## 3. `SurveySlide`

### 作用

用于收集学生填写内容，并自动转换为教师端可保存的数据格式。

### 最小示例

```tsx
<SurveySlide
  config={{
    id: "course-feedback",
    title: "课程反馈",
    questions: [
      {
        type: "single",
        title: "本节课是否听懂？",
        options: [
          { value: "yes", label: "听懂了" },
          { value: "half", label: "部分听懂" },
          { value: "no", label: "没有听懂" }
        ]
      }
    ]
  }}
/>
```

### 顶层字段

- `id`：问卷标识，可选；不传时会回退到课程标识
- `title`：标题
- `description`：说明文字
- `required`：是否默认必填，默认 `true`
- `showProgress`：是否显示进度，默认 `true`
- `theme`：主题对象
- `submitButtonText`：提交按钮文案
- `successMessage`：成功提示
- `errorMessage`：失败提示
- `questions`：题目数组，必填

### 支持题型

- `single`：单选
- `multiple`：多选
- `text`：文本
- `rating`：评分
- `ranking`：排序

### 题目字段

- `id`：题目 ID；不传时自动生成
- `type`：题型
- `title`：题目标题
- `description`：题目说明
- `required`：是否必填
- `options`：选项数组，适用于 `single`、`multiple`、`rating`、`ranking`

### 选项字段

- `value`：选项值
- `label`：展示文案
- `description`：补充说明
- `icon`：图标或 emoji

### 运行行为

- 自动本地保存草稿
- 自动校验必填项
- 自动格式化为提交内容
- 默认通过 `CourseGlobalContext.submitContent` 提交到教师端

## 4. `WebPageSlide`

### 作用

用于在课件中嵌入外部网页。

### 示例

```tsx
<window.CourseComponents.WebPageSlide
  url="https://example.com"
  title="示例网页"
  openLabel="新窗口打开"
/>
```

### 字段

- `url`：网页地址，必填
- `title`：标题
- `openLabel`：打开按钮文案
- `allow`：iframe allow 属性
- `referrerPolicy`：iframe `referrerPolicy`

## 5. 选择原则

- 需要全班即时同步时，用 `VoteSlide`
- 需要收集结构化表单时，用 `SurveySlide`
- 需要嵌入现成网页时，用 `WebPageSlide`
- 需要高度定制交互时，自定义 React 组件并配合 `CourseGlobalContext`

## 6. 下一步

- [课件 SDK 参考](./04-course-sdk.md)
- [API 参考](../07-reference/01-api-reference.md)
