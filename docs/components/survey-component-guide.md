# 问卷组件开发规范

## 概述

`SurveySlide` 是萤火课堂平台提供的标准问卷通用组件，支持整页问卷展示、自动提交、教师端数据收集和 CSV 导出功能。

## 核心特性

- ✅ **整页显示**：问卷自动适配 1280×720 画布，支持滚动浏览
- ✅ **多种题型**：单选题、多选题、简答题、评分题、排序题
- ✅ **自动提交**：学生提交后数据自动发送到教师端
- ✅ **数据合并**：教师端自动合并所有学生提交到一个 CSV 文件
- ✅ **实时进度**：显示已提交学生数量
- ✅ **本地草稿**：支持保存草稿，下次继续填写

## 数据结构

### 1. 问卷配置数据

```typescript
interface SurveyConfig {
  // 问卷标题
  title: string;
  // 问卷描述（可选）
  description?: string;
  // 问题列表
  questions: SurveyQuestion[];
  // 是否必填
  required?: boolean;
  // 是否显示进度条
  showProgress?: boolean;
  // 自定义主题色
  theme?: {
    primary?: string;      // 主色，默认 blue-500
    secondary?: string;    // 次色，默认 slate-700
    background?: string;   // 背景色，默认 slate-50
  };
}

interface SurveyQuestion {
  // 问题唯一标识（用于数据导出）
  id: string;
  // 问题类型
  type: 'single' | 'multiple' | 'text' | 'rating' | 'ranking';
  // 问题标题
  title: string;
  // 问题描述（可选）
  description?: string;
  // 是否必填
  required?: boolean;
  // 选项列表（单选/多选/评分/排序题使用）
  options?: SurveyOption[];
  // 最小/最大值（评分题使用）
  min?: number;
  max?: number;
  // 默认值
  defaultValue?: any;
}

interface SurveyOption {
  // 选项值
  value: string | number;
  // 选项显示文本
  label: string;
  // 选项描述（可选）
  description?: string;
  // 选项图标（可选）
  icon?: string;
}
```

### 2. 提交数据结构

```typescript
interface SurveySubmission {
  // 提交时间戳
  timestamp: number;
  // 问卷唯一标识
  surveyId: string;
  // 答案数据
  answers: Record<string, SurveyAnswer>;
  // 提交状态
  status: 'draft' | 'submitted';
}

interface SurveyAnswer {
  // 问题 ID
  questionId: string;
  // 答案值
  value: any;
  // 提交时间
  timestamp: number;
}
```

**注意：** 学生信息（IP、姓名、学号）由服务器根据学生 IP 自动从座位表查询并添加，客户端不需要也不能手动添加这些信息。

### 3. CSV 导出格式

CSV 文件包含以下列：

```
提交时间,学生IP,学生姓名,学号,题目1,题目2,...,状态
2024-03-25T10:30:15.123Z,192.168.1.100,张三,20230001,A,B,...,submitted
```

**字段说明：**
- **提交时间**：ISO 8601 格式的时间戳
- **学生IP**：学生终端的 IP 地址（服务器自动填充）
- **学生姓名**：从机房座位表中查询的学生姓名（服务器自动填充）
- **学号**：从机房座位表中查询的学生学号（服务器自动填充）
- **题目**：各题目的答案内容
- **状态**：提交状态（`submitted` 已提交）

## 题型说明

### 1. 单选题 (single)

```typescript
{
  id: 'q1',
  type: 'single',
  title: '你对这门课程的满意度如何？',
  options: [
    { value: 'very-satisfied', label: '非常满意' },
    { value: 'satisfied', label: '满意' },
    { value: 'neutral', label: '一般' },
    { value: 'dissatisfied', label: '不满意' }
  ],
  required: true
}
```

**答案格式：** 单个选项值（如 `'very-satisfied'`）

### 2. 多选题 (multiple)

```typescript
{
  id: 'q2',
  type: 'multiple',
  title: '你对课程的哪些方面满意？（可多选）',
  options: [
    { value: 'content', label: '课程内容' },
    { value: 'teaching', label: '教学方式' },
    { value: 'interaction', label: '互动环节' },
    { value: 'materials', label: '学习材料' }
  ],
  required: false
}
```

**答案格式：** 选项值数组（如 `['content', 'teaching']`）

### 3. 简答题 (text)

```typescript
{
  id: 'q3',
  type: 'text',
  title: '请写下你对课程的建议',
  description: '字数限制：10-500 字',
  required: false
}
```

**答案格式：** 字符串（如 `'课程很有趣，希望增加更多实践环节'`）

### 4. 评分题 (rating)

```typescript
{
  id: 'q4',
  type: 'rating',
  title: '请给教师的教学质量评分',
  min: 1,
  max: 5,
  options: [
    { value: 1, label: '非常差', icon: '😠' },
    { value: 2, label: '差', icon: '😞' },
    { value: 3, label: '一般', icon: '😐' },
    { value: 4, label: '好', icon: '🙂' },
    { value: 5, label: '非常好', icon: '😊' }
  ],
  required: true
}
```

**答案格式：** 数字（如 `5`）

### 5. 排序题 (ranking)

```typescript
{
  id: 'q5',
  type: 'ranking',
  title: '请对以下学习资源进行排序（从最重要到最不重要）',
  options: [
    { value: 'video', label: '视频教程' },
    { value: 'slides', label: '幻灯片' },
    { value: 'handout', label: '讲义' },
    { value: 'practice', label: '练习题' }
  ],
  required: true
}
```

**答案格式：** 排序后的选项值数组（如 `['video', 'practice', 'slides', 'handout']`）

## 开发规范

### 1. 命名规范

- **问卷 ID**：格式 `{课件ID:survey}`，如 `knn-demo:survey`
- **问题 ID**：格式 `q{序号}`，如 `q1`, `q2`, `q3`
- **选项值**：使用小写字母和连字符，如 `very-satisfied`

### 2. 组件使用方式

#### 学生端（在课件中使用）

```tsx
const { useState, useEffect } = React;

function SurveyPage() {
  const surveyConfig = {
    id: 'course-001:survey',
    title: '课程反馈问卷',
    description: '请真实填写，帮助我们改进课程质量',
    required: true,
    showProgress: true,
    questions: [
      {
        id: 'q1',
        type: 'single',
        title: '你对这门课程的满意度如何？',
        options: [
          { value: 'very-satisfied', label: '非常满意' },
          { value: 'satisfied', label: '满意' },
          { value: 'neutral', label: '一般' },
          { value: 'dissatisfied', label: '不满意' }
        ],
        required: true
      }
    ]
  };

  return <SurveySlide config={surveyConfig} />;
}

window.CourseData = {
  id: 'course-001',
  title: '课程反馈',
  slides: [
    { id: 'survey', component: <SurveyPage /> }
  ]
};
```

#### 教师端（数据收集和导出）

教师端自动收集提交数据，通过引擎的 `onStudentSubmit` 回调接收：

```tsx
// 教师端会自动收集所有学生提交的数据
// CSV 文件存储位置：submissions/{surveyId}-YYYY-MM-DD.csv
```

### 3. 数据提交机制

**学生端提交流程：**

1. 学生填写问卷
2. 点击"提交"按钮
3. 验证必填项
4. 调用 `window.CourseGlobalContext.submitContent()` 提交数据
5. 设置 `mergeFile: true` 启用数据合并
6. 服务器根据学生 IP 从座位表查询并填充学生信息
7. 文件名格式：`{surveyId}.csv`

**重要说明：**
- ✅ **服务器自动添加学生信息**：学生的 IP、姓名、学号由服务器根据座位表自动填充
- ❌ **客户端不应添加学生信息**：课件代码中不应手动添加或修改学生信息字段
- ✅ **座位表配置**：教师需在机房视图中正确配置学生姓名和学号

**提交代码示例：**

```tsx
const handleSubmit = async (answers: Record<string, any>) => {
  // 准备提交数据（只包含问卷答案）
  const submission = {
    timestamp: Date.now(),
    surveyId: config.id,
    answers,
    status: 'submitted'
  };

  // 生成 CSV 表头和数据行
  const header = generateCSVHeader(config.questions);
  const csvRow = formatSubmissionAsCSV(submission, config.questions);

  // 提交到服务器（学生信息字段留空，由服务器填充）
  await window.CourseGlobalContext.submitContent({
    content: {
      header,
      row: csvRow
    },
    fileName: `${config.id.replace(/:/g, '_')}.csv`,
    mergeFile: true
  });
};
```

### 4. CSV 生成规范

**CSV 格式要求：**

- **编码**：UTF-8 with BOM（Excel 兼容）
- **分隔符**：逗号（`,`）
- **换行符**：`\n`（Linux 风格，Windows 兼容）
- **引号包裹**：包含逗号或换行的字段用双引号包裹
- **双引号转义**：字段中的双引号替换为 `""`

**表头生成函数：**

```typescript
function generateCSVHeader(questions: SurveyQuestion[]): string {
  const header = [
    '提交时间',
    '学生IP',
    '学生姓名',
    '学号',
    ...questions.map(q => q.title),
    '状态'
  ];
  return header.map(escapeCSVField).join(',');
}
```

**数据行生成函数（客户端）：**

```typescript
function formatSubmissionAsCSV(submission: SurveySubmission, questions: SurveyQuestion[]): string {
  const timestamp = new Date(submission.timestamp).toISOString();

  // 准备答案数据
  const answers = questions.map(q => {
    const answer = submission.answers[q.id];
    return formatAnswerValue(answer, q.type);
  });

  // 组合数据行（学生姓名和学号留空，由服务器填充）
  const row = [
    timestamp,
    '', // 学生IP - 由服务器根据连接IP填充
    '', // 学生姓名 - 由服务器根据座位表填充
    '', // 学号 - 由服务器根据座位表填充
    ...answers,
    submission.status
  ];

  return row.map(escapeCSVField).join(',');
}
```

**服务器端数据填充：**

服务器收到提交后，会执行以下操作：
1. 根据学生 IP 查询座位表（`classroom-layout-v1.json`）
2. 填充学生 IP、姓名和学号字段
3. 保存到 CSV 文件

**CSV 字段转义：**

```typescript
function escapeCSVField(field: string): string {
  const str = String(field || '');
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
```
}
```

### 5. 本地存储规范

**草稿存储：**

```typescript
// 保存草稿
const saveDraft = (answers: Record<string, any>) => {
  const draft = {
    timestamp: Date.now(),
    answers
  };
  localStorage.setItem(`survey-draft-${config.id}`, JSON.stringify(draft));
};

// 加载草稿
const loadDraft = () => {
  const draftStr = localStorage.getItem(`survey-draft-${config.id}`);
  return draftStr ? JSON.parse(draftStr) : null;
};

// 清除草稿
const clearDraft = () => {
  localStorage.removeItem(`survey-draft-${config.id}`);
};
```

### 6. 错误处理规范

**提交失败处理：**

```tsx
const handleSubmit = async (answers: Record<string, any>) => {
  try {
    // 验证
    const validation = validateAnswers(answers, config.questions);
    if (!validation.valid) {
      alert(validation.message);
      return;
    }

    // 提交
    await submitData(answers);
    alert('提交成功！');
    clearDraft();
  } catch (error) {
    console.error('提交失败:', error);
    alert('提交失败，请重试或联系教师');
  }
};
```

### 7. UI 设计规范

**布局要求：**

- **整体容器**：`w-full h-full overflow-auto bg-slate-50`
- **标题区域**：`text-2xl font-bold text-slate-800 mb-2`
- **描述区域**：`text-sm text-slate-600 mb-6`
- **问题卡片**：`bg-white rounded-lg p-6 mb-4 shadow-sm border border-slate-200`
- **按钮样式**：使用主题色，圆角 `rounded-lg`

**响应式要求：**

- 最小内容宽度：800px
- 建议使用 flex 布局
- 避免固定高度，使用 `min-h` 代替

### 8. 性能优化

- **防抖提交**：避免重复提交
- **草稿自动保存**：每 30 秒自动保存一次
- **懒加载图片**：选项图标使用懒加载
- **虚拟滚动**：问题数量超过 20 时使用虚拟滚动

### 9. 测试规范

**测试用例：**

1. ✅ 所有题型正常显示和交互
2. ✅ 必填项验证正确
3. ✅ 提交数据格式正确
4. ✅ 草稿保存和加载正确
5. ✅ CSV 导出格式正确
6. ✅ 教师端数据合并正确
7. ✅ 多学生并发提交正确

## 示例课件

查看 `public/courses/survey-demo.lume` 了解完整使用示例。

## 更新日志

- **2026-03-25**:
  - 学生信息由服务器根据座位表自动添加
  - 课件不需要也不应该手动添加学生信息
  - 机房视图支持学号存储和编辑
  - CSV 换行符问题修复

- **2024-03-25**: 初始版本，支持 5 种题型和 CSV 导出
