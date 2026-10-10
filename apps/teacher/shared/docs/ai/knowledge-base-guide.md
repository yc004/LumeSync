# RAG 知识库系统指南

## 概述

萤火课件编辑器内置了 RAG（Retrieval-Augmented Generation）知识库系统，为 AI 生成课件提供专业的教学知识和编程指导。

## 系统特性

### 1. 智能检索

基于关键词匹配和相似度算法，自动检索最相关的知识内容：

- **标题匹配权重更高**：知识标题的关键词匹配权重是内容的 2 倍
- **多标签支持**：每个知识可配置多个标签，提高检索准确度
- **分类过滤**：支持按分类进行精确检索

### 2. 分类管理

知识按分类存储，便于管理和查找：

| 分类 | 说明 | 知识数量 |
|------|------|----------|
| 系统API | 萤火课件系统的API和接口 | 7 条 |
| 互动组件 | 选择题、填空题、拖拽等交互组件 | 3 条 |
| 教学策略 | 不同年龄段教学策略、设计原则 | 6 条 |
| 动画效果 | CSS 动画和过渡效果 | 1 条 |
| 样式系统 | Tailwind CSS 使用指南 | 1 条 |
| 状态管理 | React Hooks 状态管理 | 1 条 |
| 多媒体 | 图片、视频等媒体处理 | 1 条 |
| 最佳实践 | 性能优化和代码规范 | 1 条 |

### 3. 文件导入

支持批量导入知识文件：

- **支持格式**：TXT、Markdown、JSON
- **自动切分**：长文档自动按段落和句子边界切分为知识块
- **智能识别**：自动识别标题、标签和分类
- **大文件支持**：支持最大 10MB 的文件

### 4. 批量管理

支持批量操作自定义知识：

- 批量选择（仅非内置知识可选）
- 批量删除
- 快速筛选和搜索

## 目录结构

```
public/knowledge/
├── index.js                    # 主索引文件（自动加载所有分类）
├── processor.js               # 知识处理器（文件导入、自动切分）
├── categories/                # 知识分类目录
│   ├── README.md             # 分类管理说明
│   ├── system-api.js         # 系统API
│   ├── interactive-components.js  # 互动组件
│   ├── teaching-strategies.js     # 教学策略
│   ├── animations.js         # 动画效果
│   ├── styling.js            # 样式系统
│   ├── state-management.js   # 状态管理
│   ├── multimedia.js         # 多媒体
│   └── best-practices.js     # 最佳实践
└── example.json              # 示例文件
```

## 使用方法

### 在 AI 对话中使用

知识库自动为 AI 提供相关背景知识：

```
用户：创建一个关于"分数加减法"的课件

AI：[自动检索教学策略知识]
我理解您想创建一个分数加减法的课件。根据低年级小学生（7-9岁）的教学策略，建议：
- 使用图文并茂的方式展示分数概念
- 采用分步骤的学习方式
- 使用游戏化的选择题和配对任务
...
```

### 在编辑器中管理知识

1. 点击编辑器工具栏的 "RAG 知识库" 按钮
2. 查看所有内置和自定义知识
3. 使用搜索框检索特定知识
4. 点击 "上传文件" 导入新的知识文件
5. 点击 "批量管理" 进行批量操作

## 知识格式

### 基本结构

```javascript
{
    id: 'unique-id',              // 唯一标识符
    title: '知识标题',
    category: '分类名称',
    tags: ['标签1', '标签2', '标签3'],
    content: '知识内容（支持 Markdown）',
    isBuiltin: true              // 是否为内置知识
}
```

### 内容格式建议

使用 Markdown 格式编写知识内容：

```markdown
## 概述

简要介绍知识点

## 功能说明

详细说明功能或概念

### 使用示例

```tsx
// 代码示例
const [value, setValue] = useState(0);
```

### 注意事项

- 注意点1
- 注意点2

## 最佳实践

提供最佳实践建议
```

## API 参考

### retrieveKnowledge(query, topK, category)

根据查询返回最相关的知识块。

**参数：**
- `query` (string): 用户查询关键词
- `topK` (number): 返回前 K 个结果，默认 3
- `category` (string): 可选，按分类过滤

**返回：**
```javascript
[
    {
        id: 'unique-id',
        title: '知识标题',
        category: '分类名称',
        tags: ['标签1', '标签2'],
        content: '知识内容',
        isBuiltin: true
    }
]
```

**示例：**
```javascript
// 检索关于"选择题"的知识
const results = retrieveKnowledge('选择题', 3);

// 按分类检索
const apiDocs = retrieveKnowledge('同步变量', 5, '系统API');
```

### getKnowledgeByCategory(category)

获取指定分类下的所有知识。

**参数：**
- `category` (string): 分类名称

**返回：** 该分类下的所有知识数组

### getAllCategories()

获取所有可用分类。

**返回：** 分类名称数组

### reloadKnowledgeBase(options)

重新加载知识库。

**参数：**
- `options` (object): 配置选项
  - `force` (boolean): 是否强制重新加载，默认 false

**示例：**
```javascript
// 重新加载知识库
const updated = reloadKnowledgeBase({ force: true });
```

## 扩展知识库

### 添加新知识

1. 打开对应的分类文件（如 `categories/teaching-strategies.js`）
2. 在数组中添加新的知识对象
3. 确保 ID 唯一
4. 刷新编辑器即可生效

**示例：**
```javascript
{
    id: 'my-new-knowledge',
    title: '我的新知识',
    category: '教学策略',
    tags: ['自定义', '教学', '新知识'],
    content: `## 概述

这是我的新知识内容。

## 使用方法

详细的使用方法...

## 示例

\`\`\`tsx
// 代码示例
\`\`\`
`,
    isBuiltin: true
}
```

### 添加新分类

1. 在 `categories/` 目录下创建新文件（如 `my-category.js`）
2. 导出知识数组
3. 在 `index.js` 中添加加载语句

**示例：**
```javascript
// categories/my-category.js
const myCategoryKnowledge = [
    {
        id: 'example-1',
        title: '示例知识',
        category: '我的分类',
        tags: ['标签'],
        content: '内容...',
        isBuiltin: true
    }
];

if (typeof window !== 'undefined') {
    window.myCategoryKnowledge = myCategoryKnowledge;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = myCategoryKnowledge;
}
```

然后在 `index.js` 中添加：
```javascript
...loadCategory('my-category', 'myCategoryKnowledge'),
```

## 文件导入详解

### 支持的文件格式

#### 1. Markdown 文件

按标题层级自动切分：

```markdown
# 课程大纲

## 第一章：基础知识

这是第一章的内容...

## 第二章：进阶内容

这是第二章的内容...
```

#### 2. TXT 文件

按段落自动切分，每块约 800 字：

```
第一段内容...

第二段内容...

第三段内容...
```

#### 3. JSON 文件

可以是单个知识对象或知识数组：

```json
{
    "title": "知识标题",
    "category": "分类",
    "tags": ["标签1", "标签2"],
    "content": "知识内容..."
}
```

或数组格式：

```json
[
    {
        "title": "知识1",
        "category": "分类",
        "content": "内容1..."
    },
    {
        "title": "知识2",
        "category": "分类",
        "content": "内容2..."
    }
]
```

### 导入配置

```javascript
const result = await processor.processMultipleFiles(files, {
    chunkSize: 800,              // 切分块大小（字数）
    chunkOverlap: 100,            // 块重叠字数
    defaultCategory: '自定义',     // 默认分类
    defaultTags: []               // 默认标签
});
```

## 最佳实践

### 1. 知识编写

- **标题简洁**：使用清晰、描述性的标题
- **标签丰富**：添加多个相关标签，提高检索准确度
- **代码完整**：提供可运行的代码示例
- **结构清晰**：使用 Markdown 标题组织内容

### 2. 分类组织

- **相关聚合**：将相关内容放在同一分类
- **避免重叠**：避免在多个分类中重复相同内容
- **合理粒度**：每个分类包含 3-10 条知识为宜

### 3. 性能优化

- **内容精炼**：避免冗长重复的内容
- **重点突出**：使用加粗、列表等格式突出重点
- **代码精简**：代码示例尽量简洁明了

## 故障排查

### 知识库显示为空

1. 检查分类文件是否正确加载
2. 打开浏览器控制台查看错误信息
3. 确认所有分类文件都有 `isBuiltin: true` 标记

### 检索结果不准确

1. 检查知识标签是否包含相关关键词
2. 在标题中添加更多关键词
3. 考虑将知识拆分为更细的粒度

### 文件导入失败

1. 检查文件格式是否支持
2. 确认文件大小不超过 10MB
3. 查看控制台的错误信息

## 常见问题

**Q: 内置知识可以修改吗？**
A: 不可以，内置知识由系统管理，仅可查看。可以上传自定义知识。

**Q: 自定义知识会保存到哪里？**
A: 自定义知识保存在本地，不会丢失。

**Q: 如何导出知识库？**
A: 目前不支持导出，但可以手动复制分类文件。

**Q: 知识检索是否支持自然语言？**
A: 支持，系统会自动提取关键词并匹配。

**Q: 可以删除内置知识吗？**
A: 不可以，内置知识受保护，无法删除。

## 更新日志

### v1.0.0 (2024-03)

- 初始版本
- 支持 8 个分类，共 21 条内置知识
- 支持文件导入和自动切分
- 支持批量管理和搜索
- RAG 智能检索系统

## 相关文档

- [知识库管理说明](../../public/knowledge/categories/README.md)
- [用户说明-AI课件编辑器](../user/用户说明-AI课件编辑器.md)
- [API 文档](../dev/API.md)
