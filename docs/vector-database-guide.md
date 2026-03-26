# 向量数据库知识库 - 使用指南

## 概述

萤火课件编辑器现已升级为使用向量数据库存储知识库，提供智能语义搜索能力，无需精确匹配关键词即可找到相关内容。

## 架构说明

### 核心模块

1. **VectorDatabase** (`server/vector-database.js`)
   - 纯内存向量数据库（使用 JSON 持久化）
   - 支持向量存储和相似度搜索
   - 自动保存到 `./data/vector-knowledge.json`

2. **VectorEmbeddingService** (`server/vector-embedding.js`)
   - 生成文本向量嵌入
   - 支持本地 TF-IDF 算法（默认）
   - 可选支持 OpenAI API（需要配置 API key）

3. **KnowledgeManager** (`server/knowledge-manager.js`)
   - 管理知识库的导入、导出、向量化
   - 自动初始化和导入内置知识
   - 提供统一的检索接口

4. **KnowledgeAPI** (`server/knowledge-api.js`)
   - HTTP API 服务
   - 提供前端调用的 REST 接口

5. **KnowledgeService** (`public/knowledge/service.js`)
   - 前端服务封装
   - 负责与后端 API 通信

6. **KnowledgeBaseVector** (`public/editor/KnowledgeBaseVector.js`)
   - 前端 UI 组件（向量数据库版）
   - 支持向量搜索和结果展示

## API 接口

### 1. 获取所有知识

```
GET /api/knowledge
```

响应：
```json
{
  "success": true,
  "data": [...]
}
```

### 2. 向量搜索

```
GET /api/knowledge/search?q=搜索关键词&topK=5&category=分类
```

参数：
- `q`: 搜索关键词（必需）
- `topK`: 返回结果数量（默认 5）
- `category`: 分类过滤（可选）

响应：
```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "title": "...",
      "content": "...",
      "category": "...",
      "tags": [...],
      "similarity": 0.85
    }
  ]
}
```

### 3. 添加知识

```
POST /api/knowledge
Content-Type: application/json

{
  "items": [
    {
      "title": "标题",
      "content": "内容",
      "category": "分类",
      "tags": ["标签1", "标签2"]
    }
  ]
}
```

### 4. 更新知识

```
PUT /api/knowledge/:id
Content-Type: application/json

{
  "title": "新标题",
  "content": "新内容"
}
```

### 5. 删除知识

```
DELETE /api/knowledge/:id
```

### 6. 批量删除

```
DELETE /api/knowledge
Content-Type: application/json

{
  "ids": ["id1", "id2", "id3"]
}
```

### 7. 获取统计信息

```
GET /api/knowledge/stats
```

响应：
```json
{
  "success": true,
  "data": {
    "total": 100,
    "builtinCount": 50,
    "userCount": 50,
    "categoryCount": 10
  }
}
```

### 8. 重新索引

```
POST /api/knowledge/reindex
```

## 使用方式

### 前端集成

在编辑器页面中替换原有的知识库组件：

```html
<!-- 加载服务 -->
<script src="knowledge/service.js"></script>
<script src="knowledge/processor.js"></script>

<!-- 使用新组件 -->
<script src="editor/KnowledgeBaseVector.js"></script>
```

### 自定义嵌入服务

如果需要使用 OpenAI API 生成高质量向量：

```javascript
// 修改 server/knowledge-manager.js
this.embeddingService = new VectorEmbeddingService({
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'text-embedding-3-small'
});
```

设置环境变量：
```bash
export OPENAI_API_KEY="your-api-key"
```

### 切换组件

在 `public/editor.html` 中，替换组件引用：

```javascript
// 原有组件
// window.KnowledgeBase = KnowledgeBase;

// 改为向量数据库版本
window.KnowledgeBase = KnowledgeBaseVector;
```

## 特性

### 1. 语义搜索

无需精确匹配关键词，系统会根据语义相似度找到相关内容：
- 搜索"如何使用"可以找到"使用方法"、"操作指南"等
- 搜索"性能优化"可以找到"提升速度"、"减少延迟"等

### 2. 相似度评分

搜索结果会显示相似度百分比：
- 80% 以上：高度相关
- 60-80%：相关
- 40-60%：部分相关
- 40% 以下：可能不相关

### 3. 混合搜索

支持向量搜索 + 关键词搜索的混合模式，自动降级：
- 优先使用向量搜索（语义理解）
- 如果向量服务不可用，自动降级为关键词搜索

### 4. 自动分块

上传长文档时自动切分为多个知识块，每个块独立向量化，提高检索精度。

### 5. 持久化存储

知识库自动保存到 `./data/vector-knowledge.json`，服务器重启后自动加载。

## 故障排除

### 1. 服务不可用

如果前端显示"服务不可用"：
- 检查服务器是否正常运行
- 检查 `/api/knowledge/stats` 接口是否可访问
- 查看服务器控制台日志

### 2. 向量化失败

如果知识导入时向量化失败：
- 检查文本内容是否过长（超过 8000 字符）
- 检查是否包含无法解析的字符
- 使用关键词搜索作为备用方案

### 3. 搜索结果不准确

如果搜索结果不理想：
- 尝试使用更明确的搜索关键词
- 考虑调整嵌入服务的配置
- 使用重新索引功能重建向量

## 性能优化

### 1. 批量导入

对于大量知识，使用批量导入接口：
```javascript
await service.addKnowledgeBatch(items);
```

### 2. 缓存

前端服务内置 5 分钟缓存，减少服务器请求。

### 3. 向量维度

本地嵌入默认使用 1536 维向量，可根据需要调整：
```javascript
new VectorEmbeddingService({
    dimension: 768 // 降低维度
});
```

## 数据迁移

### 从旧版本迁移

如果已有旧版知识库数据，可以手动迁移：

1. 导出旧数据
2. 批量导入到新向量数据库
3. 执行重新索引

## 技术细节

### 向量算法

默认使用 TF-IDF + Hash 算法生成向量：
- 词频统计
- Hash 函数映射
- 余弦相似度计算

### 相似度计算

使用余弦相似度公式：
```
similarity = (A · B) / (||A|| × ||B||)
```

其中：
- A, B 是向量
- · 表示点积
- ||A|| 表示向量范数

### 文件存储

使用 JSON 格式存储，结构：
```json
{
  "knowledge": [["id1", {...}], ["id2", {...}]],
  "vectors": [["id1", [0.1, 0.2, ...]], ["id2", [...]]],
  "updatedAt": "2026-03-26T..."
}
```

## 后续计划

1. 支持更多嵌入模型（如 BERT、Sentence-Transformers）
2. 添加向量索引优化（如 HNSW、IVF）
3. 支持向量导出和导入
4. 添加知识图谱可视化
5. 支持多模态检索（图片、音频等）

## 常见问题

**Q: 为什么不使用 SQLite？**

A: Windows 环境下 SQLite 原生模块编译困难，使用纯内存方案更简单可靠。

**Q: 本地嵌入质量如何？**

A: 本地 TF-IDF 算法适用于关键词匹配，语义理解能力有限。如需更高质量的语义搜索，建议使用 OpenAI API。

**Q: 知识库数据可以备份吗？**

A: 可以，直接复制 `./data/vector-knowledge.json` 文件即可。

**Q: 如何恢复到旧版本？**

A: 在 `public/editor.html` 中将 `KnowledgeBaseVector` 改回 `KnowledgeBase` 即可。
