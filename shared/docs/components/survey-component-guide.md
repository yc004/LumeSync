# 问卷组件开发规范

## 概述

`SurveySlide` 是萤火课堂平台提供的标准问卷通用组件，**支持极简配置**。用户只需提供题目配置，引擎会自动处理 ID 生成、数据格式化、提交、草稿保存等所有细节。

## 核心特性

- ✅ **极简配置**：只需提供题目，引擎自动处理所有细节
- ✅ **自动 ID 生成**：无需手动指定 ID，引擎自动生成唯一标识
- ✅ **自动提交**：学生提交后数据自动发送到教师端
- ✅ **数据合并**：教师端自动合并所有学生提交到一个 CSV 文件
- ✅ **自动保存草稿**：每 30 秒自动保存，下次打开自动恢复
- ✅ **必填验证**：自动验证必填项，提示用户完成
- ✅ **多种题型**：单选题、多选题、简答题、评分题、排序题

## 快速开始

### 最简配置

```tsx
const surveyConfig = {
  title: '课程反馈',
  questions: [
    {
      type: 'single',
      title: '你对这门课程的满意度如何？',
      options: [
        { value: 'very-satisfied', label: '非常满意' },
        { value: 'satisfied', label: '满意' },
        { value: 'neutral', label: '一般' }
      ]
    }
  ]
};

return <SurveySlide config={surveyConfig} />;
```

就这么简单！引擎会自动：
- ✅ 生成唯一 ID
- ✅ 验证必填项
- ✅ 保存草稿
- ✅ 提交到教师端
- ✅ 合并为 CSV 文件

## 完整配置

### 问卷配置 (SurveyConfig)

```typescript
interface SurveyConfig {
  // ===== 必填项 =====
  title: string;          // 问卷标题
  questions: SurveyQuestion[];  // 问题列表

  // ===== 可选项 =====
  description?: string;          // 问卷描述
  id?: string;                   // 问卷 ID（自动生成，可覆盖）
  required?: boolean;            // 是否有必填项，默认 true
  showProgress?: boolean;        // 是否显示进度条，默认 true
  submitButtonText?: string;    // 提交按钮文字，默认 "提交问卷"
  successMessage?: string;      // 提交成功提示，默认 "提交成功！感谢您的反馈。"
  errorMessage?: string;        // 提交失败提示，默认 "提交失败，请重试"

  // 主题配置
  theme?: {
    primary?: string;      // 主色，默认 "blue"
    background?: string;   // 背景色，默认 "slate-50"
  };
}

interface SurveyQuestion {
  // ===== 必填项 =====
  type: 'single' | 'multiple' | 'text' | 'rating' | 'ranking';
  title: string;

  // ===== 可选项 =====
  id?: string;           // 问题 ID（自动生成，可覆盖）
  description?: string;  // 问题描述
  required?: boolean;    // 是否必填，默认继承问卷配置
  options?: SurveyOption[];  // 选项（单选/多选/评分/排序题使用）
  defaultValue?: any;    // 默认值
}

interface SurveyOption {
  value: string | number;     // 选项值
  label: string;               // 选项显示文本
  description?: string;        // 选项描述
  icon?: string;               // 选项图标（支持 emoji）
}
```

### 2. 数据提交流程（引擎自动处理）

**完全自动化，无需手动编写任何代码！**

```
用户填写 → 引擎自动验证 → 引擎自动生成 CSV → 引擎自动提交 → 引擎自动合并
```

**引擎自动处理的内容：**
- ✅ 生成唯一问卷 ID
- ✅ 为每个问题生成唯一 ID
- ✅ 验证必填项
- ✅ 格式化为 CSV 格式
- ✅ 调用 `submitContent` API
- ✅ 自动保存和恢复草稿
- ✅ 显示提交状态和错误提示

### 3. CSV 导出格式（引擎自动生成）

CSV 文件自动包含以下列：

```
提交时间,学生IP,学生姓名,学号,题目1,题目2,...,状态
2024-03-25T10:30:15.123Z,192.168.1.100,张三,20230001,A,B,...,submitted
```

**字段说明（自动填充）：**
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
  type: 'single',
  title: '你对这门课程的满意度如何？',
  options: [
    { value: 'very-satisfied', label: '非常满意' },
    { value: 'satisfied', label: '满意' },
    { value: 'neutral', label: '一般' },
    { value: 'dissatisfied', label: '不满意' }
  ]
  // ID 自动生成为 'q1'
  // required 默认继承问卷配置
}
```

### 2. 多选题 (multiple)

```typescript
{
  type: 'multiple',
  title: '你对课程的哪些方面满意？（可多选）',
  options: [
    { value: 'content', label: '课程内容' },
    { value: 'teaching', label: '教学方式' },
    { value: 'interaction', label: '互动环节' },
    { value: 'materials', label: '学习材料' }
  ]
}
```

### 3. 简答题 (text)

```typescript
{
  type: 'text',
  title: '请写下你对课程的建议',
  description: '字数限制：10-500 字'
}
```

### 4. 评分题 (rating)

```typescript
{
  type: 'rating',
  title: '请给教师的教学质量评分',
  options: [
    { value: 1, label: '非常差', icon: '😠' },
    { value: 2, label: '差', icon: '😞' },
    { value: 3, label: '一般', icon: '😐' },
    { value: 4, label: '好', icon: '🙂' },
    { value: 5, label: '非常好', icon: '😊' }
  ]
}
```

### 5. 排序题 (ranking)

```typescript
{
  type: 'ranking',
  title: '请对以下学习资源进行排序（从最重要到最不重要）',
  options: [
    { value: 'video', label: '视频教程' },
    { value: 'slides', label: '幻灯片' },
    { value: 'handout', label: '讲义' },
    { value: 'practice', label: '练习题' }
  ]
}
```

## 完整示例

### 示例 1：最简配置

```tsx
function SurveyPage() {
  const surveyConfig = {
    title: '课程反馈',
    questions: [
      {
        type: 'single',
        title: '你对这门课程的满意度如何？',
        options: [
          { value: 'very-satisfied', label: '非常满意' },
          { value: 'satisfied', label: '满意' },
          { value: 'neutral', label: '一般' }
        ]
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

### 示例 2：自定义配置

```tsx
function SurveyPage() {
  const surveyConfig = {
    title: '课程满意度调查',
    description: '请真实填写，帮助我们改进课程质量',
    submitButtonText: '提交反馈',
    successMessage: '感谢您的反馈！',
    theme: {
      primary: 'emerald',
      background: 'slate-100'
    },
    questions: [
      {
        type: 'single',
        title: '你对这门课程的满意度如何？',
        options: [
          { value: 'very-satisfied', label: '非常满意' },
          { value: 'satisfied', label: '满意' },
          { value: 'neutral', label: '一般' },
          { value: 'dissatisfied', label: '不满意' }
        ],
        required: true
      },
      {
        type: 'multiple',
        title: '你对课程的哪些方面满意？（可多选）',
        options: [
          { value: 'content', label: '课程内容' },
          { value: 'teaching', label: '教学方式' },
          { value: 'interaction', label: '互动环节' },
          { value: 'materials', label: '学习材料' }
        ]
      },
      {
        type: 'text',
        title: '请写下你对课程的建议',
        description: '字数限制：10-500 字'
      },
      {
        type: 'rating',
        title: '请给教师的教学质量评分',
        options: [
          { value: 1, label: '非常差', icon: '😠' },
          { value: 2, label: '差', icon: '😞' },
          { value: 3, label: '一般', icon: '😐' },
          { value: 4, label: '好', icon: '🙂' },
          { value: 5, label: '非常好', icon: '😊' }
        ],
        required: true
      }
    ]
  };

  return <SurveySlide config={surveyConfig} />;
}

window.CourseData = {
  id: 'course-002',
  title: '课程满意度调查',
  slides: [
    { id: 'survey', component: <SurveyPage /> }
  ]
};
```

### 示例 3：简短问卷（投票）

```tsx
function VoteSlide() {
  const voteConfig = {
    title: '投票：你更喜欢哪种教学方式？',
    description: '请选择一项',
    questions: [
      {
        type: 'single',
        title: '教学方式',
        options: [
          { value: 'lecture', label: '传统讲授' },
          { value: 'interactive', label: '互动讨论' },
          { value: 'practice', label: '实践操作' }
        ]
      }
    ]
  };

  return <SurveySlide config={voteConfig} />;
}
```

## 教师端数据收集

**完全自动化，无需编写任何代码！**

教师端会自动：
- ✅ 接收所有学生提交的数据
- ✅ 自动合并到一个 CSV 文件
- ✅ 自动添加学生信息（IP、姓名、学号）
- ✅ 保存到 `submissions` 文件夹

**文件路径：** `submissions/{surveyId}.csv`

**重要说明：**
- ✅ **服务器自动添加学生信息**：学生的 IP、姓名、学号由服务器根据座位表自动填充
- ❌ **客户端不应添加学生信息**：课件代码中不应手动添加或修改学生信息字段
- ✅ **座位表配置**：教师需在机房视图中正确配置学生姓名和学号

## CSV 格式（引擎自动生成）

**格式要求（引擎自动处理）：**

- 编码：UTF-8 with BOM（Excel 兼容）
- 分隔符：逗号（`,`）
- 换行符：`\n`（Linux 风格，Windows 兼容）
- 引号包裹：包含逗号或换行的字段用双引号包裹
- 双引号转义：字段中的双引号替换为 `""`

**字段转义（引擎自动处理）：**

```typescript
// 引擎自动转义 CSV 字段
function escapeCSVField(field) {
  const str = String(field || '');
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
```
    surveyId: config.id,
    answers,
    status: 'submitted'
  };


## 草稿功能（引擎自动处理）

**完全自动化，无需手动编写任何代码！**

引擎会自动：
- ✅ 每 30 秒自动保存草稿
- ✅ 页面加载时自动恢复草稿
- ✅ 提交成功后自动清除草稿
- ✅ 显示草稿保存时间

**存储机制（引擎自动处理）：**

```typescript
// 引擎自动保存草稿
const saveDraft = (answers) => {
  const draft = {
    timestamp: Date.now(),
    answers
  };
  localStorage.setItem(`survey-draft-${surveyId}`, JSON.stringify(draft));
};

// 引擎自动加载草稿
const loadDraft = () => {
  const draftStr = localStorage.getItem(`survey-draft-${surveyId}`);
  return draftStr ? JSON.parse(draftStr) : null;
};

// 引擎自动清除草稿
const clearDraft = () => {
  localStorage.removeItem(`survey-draft-${surveyId}`);
};
```

## 错误处理（引擎自动处理）

**完全自动化，无需手动编写任何代码！**

引擎会自动：
- ✅ 捕获提交错误
- ✅ 显示友好的错误提示
- ✅ 保留用户填写的内容
- ✅ 支持重新提交

**错误处理流程（引擎自动处理）：**

```typescript
// 引擎自动处理错误
try {
  // 验证
  const valid = validateAnswers();
  if (!valid) {
    alert('请填写所有必填项');
    return;
  }

  // 提交
  await submitData();
  alert(fullConfig.successMessage);
  clearDraft();
} catch (error) {
  console.error('提交失败:', error);
  alert(`${fullConfig.errorMessage}：${error.message}`);
}
```
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

## 性能优化（引擎自动处理）

**完全自动化，无需手动编写任何代码！**

引擎会自动：
- ✅ 防抖提交（避免重复提交）
- ✅ 每 30 秒自动保存草稿
- ✅ 懒加载图片（选项图标）
- ✅ 虚拟滚动（问题数量超过 20 时）

## 测试规范

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

- **2026-03-28**:
  - **重大更新：极简配置**：用户只需提供题目，引擎自动处理所有细节
  - 自动生成唯一 ID
  - 自动验证必填项
  - 自动保存草稿
  - 自动提交到教师端
  - 自动合并为 CSV
  - **用户体验大幅提升**：从需要写 50+ 行代码到只需 10 行

- **2026-03-25**:
  - 学生信息由服务器根据座位表自动添加
  - 课件不需要也不应该手动添加学生信息
  - 机房视图支持学号存储和编辑
  - CSV 换行符问题修复

- **2024-03-25**: 初始版本，支持 5 种题型和 CSV 导出

