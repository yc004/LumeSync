# 投票组件使用指南

## 概述

`VoteSlide` 是一个通用的实时投票组件，支持教师在课堂中发起投票，学生实时参与并提交选择。

## 功能特性

- ✅ **发起投票**：教师端通过演示界面右侧工具栏发起
- ✅ **实时统计**：教师端可在工具栏结果面板查看每个选项票数和百分比
- ✅ **学生参与**：学生端选择选项后提交
- ✅ **时长控制**：可在工具栏设置投票时长（10-300秒）
- ✅ **匿名/实名**：支持匿名和实名两种投票模式
- ✅ **可视化展示**：教师端结果面板使用进度条展示投票结果
- ✅ **倒计时显示**：投票进行中显示剩余投票时间
- ✅ **统一侧边栏标准**：工具栏按钮与点击后弹窗都由通用侧边栏组件渲染（液态玻璃风格）

## 基本用法

### 1. 配置投票

```tsx
const voteConfig = {
    id: 'unique-vote-id',          // 投票唯一标识
    question: '投票问题',           // 投票问题
    anonymous: false,              // 是否匿名投票（可选，默认false）
    theme: {                       // 主题配置（可选）
        primary: 'blue',           // 主色调
        background: 'slate'        // 背景色
    },
    options: [                     // 投票选项
        { id: 'opt1', label: '选项1' },
        { id: 'opt2', label: '选项2' },
        { id: 'opt3', label: '选项3' }
    ]
};
```

### 2. 在课件中使用

```tsx
function VotePage() {
    return <VoteSlide config={voteConfig} />;
}
```

## 配置说明

### 必填字段

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `id` | string | 投票唯一标识 | `'poll-001'` |
| `question` | string | 投票问题 | `'你最喜欢的编程语言是什么？'` |
| `options` | array | 投票选项数组 | 见下方选项配置 |

### 可选字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `anonymous` | boolean | `false` | 是否匿名投票 |
| `theme.primary` | string | `'blue'` | 主色调（Tailwind颜色名） |
| `theme.background` | string | `'slate'` | 背景色（Tailwind颜色名） |

### 选项配置

每个选项必须包含：

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `id` | string | 选项唯一标识 | `'option-a'` |
| `label` | string | 选项显示文本 | `'JavaScript'` |

## 使用场景

### 场景1：课前调研

```tsx
const课前调研投票 = {
    id: 'pre-class-survey',
    question: '你对今天要学习的主题了解程度如何？',
    anonymous: true,
    options: [
        { id: 'none', label: '完全不了解' },
        { id: 'little', label: '略有了解' },
        { id: 'some', label: '基本掌握' },
        { id: 'well', label: '非常熟悉' }
    ]
};
```

### 场景2：知识点检查

```tsx
const知识点检查投票 = {
    id: 'knowledge-check',
    question: '以下哪个是JavaScript的数据类型？',
    anonymous: false,
    options: [
        { id: 'wrong1', label: 'integer' },
        { id: 'correct', label: 'number' },
        { id: 'wrong2', label: 'float' },
        { id: 'wrong3', label: 'string' }
    ]
};
```

### 场景3：课堂互动

```tsx
const课堂互动投票 = {
    id: 'interactive-poll',
    question: '你更喜欢哪种学习方式？',
    anonymous: true,
    options: [
        { id: 'video', label: '视频讲解' },
        { id: 'practice', label: '实战练习' },
        { id: 'discuss', label: '小组讨论' },
        { id: 'reading', label: '自主阅读' }
    ]
};
```

## 教师端操作

### 发起投票

1. 进入包含 `VoteSlide` 的页面
2. 在演示界面右侧投票工具栏设置时长（默认60秒）
3. 点击工具栏“开始投票”按钮
4. 学生端收到投票请求

### 设置时长

- 在右侧投票工具栏输入时长
- 允许范围为 10-300 秒
- 投票开始后时长输入会锁定

### 实时查看结果

投票进行中，教师端可点击右侧工具栏“查看结果”按钮，在结果弹窗查看：
- 每个选项的投票数
- 每个选项的百分比
- 可视化进度条
- 总票数

### 结束投票

- 点击右侧工具栏“结束投票”按钮立即结束
- 或等待倒计时自动结束
- 结束后可继续通过工具栏查看最终结果

### 重新发起投票

- 投票结束后再次点击“开始投票”即可发起新一轮

## 学生端操作

### 接收投票

- 教师发起投票后自动弹出投票窗口
- 显示投票问题和剩余时间

### 提交投票

1. 选择一个选项
2. 点击“提交投票”
3. 提交成功后显示“投票成功，等待结果...”提示

### 查看结果

- 学生端课件页不显示投票统计结果
- 投票结果由教师端在右侧工具栏中查看与讲解

## 完整示例

### 示例1：单页投票课件

```tsx
window.CourseData = {
    title: '课堂投票演示',
    icon: '📊',
    desc: '展示投票组件的使用',
    color: 'from-purple-500 to-pink-600',
    slides: [
        {
            id: 'vote',
            component: (
                <VoteSlide config={{
                    id: 'demo-vote',
                    question: '你对React的理解程度如何？',
                    anonymous: true,
                    theme: {
                        primary: 'purple',
                        background: 'slate'
                    },
                    options: [
                        { id: 'beginner', label: '完全不了解' },
                        { id: 'intermediate', label: '有所了解' },
                        { id: 'advanced', label: '熟练掌握' },
                        { id: 'expert', label: '专家水平' }
                    ]
                }} />
            )
        }
    ]
};
```

### 示例2：多页课件包含投票

```tsx
window.CourseData = {
    title: 'JavaScript 课程',
    icon: '📚',
    desc: 'JavaScript 基础课程',
    color: 'from-yellow-500 to-orange-600',
    slides: [
        {
            id: 'intro',
            component: (
                <div className="p-8">
                    <h1 className="text-3xl font-bold mb-4">欢迎来到 JavaScript 课程</h1>
                    <p className="text-xl mb-4">今天我们将学习基础语法</p>
                </div>
            )
        },
        {
            id: 'pre-survey',
            component: (
                <div className="p-8">
                    <h2 className="text-2xl font-bold mb-4">课前调研</h2>
                    <VoteSlide config={{
                        id: 'js-experience',
                        question: '你之前接触过 JavaScript 吗？',
                        anonymous: true,
                        options: [
                            { id: 'never', label: '从未接触' },
                            { id: 'heard', label: '听说过但没用过' },
                            { id: 'tried', label: '尝试过但不熟练' },
                            { id: 'experienced', label: '有使用经验' }
                        ]
                    }} />
                </div>
            )
        },
        {
            id: 'content',
            component: (
                <div className="p-8">
                    <h2 className="text-2xl font-bold mb-4">变量声明</h2>
                    <pre className="bg-gray-900 text-green-400 p-4 rounded">
                        <code>{`
let name = 'John';
const age = 25;
var old = 'deprecated';
                        `}
                        </code>
                    </pre>
                </div>
            )
        },
        {
            id: 'quiz',
            component: (
                <div className="p-8">
                    <h2 className="text-2xl font-bold mb-4">小测验</h2>
                    <VoteSlide config={{
                        id: 'variable-quiz',
                        question: 'const 声明的变量可以重新赋值吗？',
                        anonymous: false,
                        options: [
                            { id: 'yes', label: '可以' },
                            { id: 'no', label: '不可以' }
                        ]
                    }} />
                </div>
            )
        },
        {
            id: 'feedback',
            component: (
                <div className="p-8">
                    <h2 className="text-2xl font-bold mb-4">课程反馈</h2>
                    <VoteSlide config={{
                        id: 'course-feedback',
                        question: '你对今天课程的满意度？',
                        anonymous: true,
                        theme: {
                            primary: 'green'
                        },
                        options: [
                            { id: 'very-satisfied', label: '非常满意' },
                            { id: 'satisfied', label: '满意' },
                            { id: 'normal', label: '一般' },
                            { id: 'dissatisfied', label: '不满意' }
                        ]
                    }} />
                </div>
            )
        }
    ]
};
```

## 注意事项

1. **投票唯一性**：每个学生只能投票一次，提交后无法修改
2. **时长限制**：投票时长建议在 10-300 秒之间
3. **网络要求**：投票功能依赖 Socket.io 实时通信
4. **教师端限制**：只有教师端可以发起和结束投票
5. **结果查看方式**：投票结果在教师端右侧工具栏中查看，学生端课件页不展示统计结果

## 常见问题

### Q: 如何修改投票时长？
A: 在教师端演示界面右侧投票工具栏中直接输入新的时长（10-300秒），再点击“开始投票”。

### Q: 学生投完票后能修改吗？
A: 不能，每个学生只能投票一次，提交后无法修改。

### Q: 匿名投票和实名投票有什么区别？
A: 
- 匿名投票：不记录学生身份信息
- 实名投票：按学生身份记录提交信息
- 两种模式下，课件页内都不直接展示统计结果，教师通过右侧工具栏查看

### Q: 投票结果会保存吗？
A: 当前版本投票结果仅在内存中保存，刷新或结束课程后会清空。

### Q: 如何清空投票重新开始？
A: 当前流程为投票结束后再次点击“开始投票”发起新一轮。

## 侧边栏扩展标准（开发者）

投票工具栏已接入通用侧边栏能力。后续新增侧边栏功能时，建议按以下方式扩展：

1. 定义 `buttons` 数组（按钮图标、标题、点击行为、可选 `popupKey`）
2. 定义 `renderPopupContent(popupKey)`，按 `popupKey` 返回对应弹窗内容
3. 使用 `activePopupKey` 控制当前展开的弹窗
4. 保持弹窗与工具栏为液态玻璃风格

该模式适用于投票、批注及后续任意侧边工具模块。

## 相关文档

- [API 文档](../dev/API.md) - 完整的 API 参考
- [问卷组件指南](./survey-component-guide.md) - SurveySlide 组件使用
- [课件开发模板](../dev/course-template.md) - 课件开发示例
