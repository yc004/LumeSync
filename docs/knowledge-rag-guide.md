# 知识库 RAG 系统使用指南

## 概述

本项目使用 **better-sqlite3** 构建了一个真正的 RAG（检索增强生成）向量数据库系统，支持高效的语义搜索和全文检索。

**重要提示**：此 RAG 知识库系统**仅用于编辑器端**，不服务于教师端和学生端。

**当前状态**：编辑器前端已完全接入 RAG 向量数据库，所有知识库操作（加载、搜索、添加、更新、删除）都通过向量数据库实现。

## 系统架构

```
知识库 RAG 系统（编辑器专用）
├── electron/main-editor.js  # IPC 接口（12个处理器）
├── server/vector-database.js    # 向量数据库核心（better-sqlite3）
├── server/vector-embedding.js   # 向量嵌入服务（TF-IDF + OpenAI）
├── server/knowledge-manager.js  # 知识库管理器
├── public/editor/01-ai-chat.js # AI 聊天 + RAG 检索
└── public/editor/KnowledgeBase.js  # 知识库管理 UI
```

### 数据流

```
前端 UI (React)
    ↓ IPC
electron/main-editor.js (IPC handlers)
    ↓
server/vector-database.js (SQLite DB)
    ↓
本地文件: knowledge.db (WAL 模式)
```

## 核心功能

### 1. 向量存储
- 使用 better-sqlite3 存储 256/1536 维向量
- 支持 WAL 模式，提高并发性能
- 使用 BLOB 格式存储，节省空间

### 2. 向量嵌入
- **TF-IDF**：本地向量化，无需外部依赖，256 维
- **OpenAI**：高质量向量化，支持 text-embedding-3-small，1536 维

### 3. 检索方式
- **向量搜索**：基于余弦相似度的语义搜索
- **全文搜索**：基于 FTS5 的 BM25 算法
- **混合搜索**：结合向量搜索和全文搜索，0.7 + 0.3 权重

## 快速开始

### 1. 初始化数据库

```bash
# 运行初始化脚本
node server/init-knowledge-db.js
```

这将：
- 创建数据库结构
- 加载内置知识库（15 条）
- 训练 TF-IDF 模型
- 生成向量索引

### 2. 启动编辑器

```bash
npm run start:editor
```

编辑器启动时会自动初始化知识库，数据库文件位于用户数据目录：
- Windows: `%APPDATA%/lumesync-editor/knowledge.db`
- macOS: `~/Library/Application Support/lumesync-editor/knowledge.db`
- Linux: `~/.config/lumesync-editor/knowledge.db`

### 3. 前端已接入的接口

编辑器前端已通过 `window.electronAPI` 接入以下 RAG 接口：

| 接口 | 前端文件 | 功能 |
|------|----------|------|
| `knowledgeDocuments()` | KnowledgeBase.js | 加载知识库列表 |
| `knowledgeSearch()` | KnowledgeBase.js, 01-ai-chat.js | RAG 检索（混合搜索） |
| `knowledgeAdd()` | KnowledgeBase.js | 添加新知识 |
| `knowledgeUpdate()` | KnowledgeBase.js | 更新知识 |
| `knowledgeDelete()` | KnowledgeBase.js | 删除知识 |
| `knowledgeBatchAdd()` | KnowledgeBase.js | 批量添加（文件上传） |

#### 前端调用示例

```javascript
// KnowledgeBase.js 中的使用
const loadKnowledge = async () => {
    // 从向量数据库加载用户知识
    const result = await window.electronAPI.knowledgeDocuments({ limit: 1000 });
    if (result.success) {
        userData = result.documents || [];
    }
};

const handleSave = async () => {
    // 添加到向量数据库
    const result = await window.electronAPI.knowledgeAdd({
        title: formData.title,
        content: formData.content,
        category: formData.category
    });
};
```
    "total": 15,
    "builtin": 15,
    "user": 0,
    "categories": [...]
  }
}
```

#### 搜索知识

```bash
curl "http://localhost:3000/api/knowledge/search?q=如何使用摄像头"
```

响应：
```json
{
  "success": true,
  "results": [
    {
      "id": "builtin_system-api.js_Camera_API",
      "title": "Camera API",
      "content": "...",
      "category": "system-api",
      "tags": [...],
      "isBuiltin": true
    }
  ]
}
```

#### 添加知识

```bash
curl -X POST http://localhost:3000/api/knowledge \
  -H "Content-Type: application/json" \
  -d '{
    "title": "我的知识",
    "content": "这是我的知识内容",
    "category": "user",
    "tags": ["个人", "笔记"]
  }'
```

#### 导出知识库

```bash
curl "http://localhost:3000/api/knowledge/export" -o knowledge-export.json
```

## API 端点

### 统计
- `GET /api/knowledge/stats` - 获取统计信息

### 搜索
- `GET /api/knowledge/search` - 搜索知识
  - Query: `q` (必需), `topK`, `category`, `isBuiltin`

### CRUD
- `GET /api/knowledge` - 获取所有知识
- `GET /api/knowledge/:id` - 获取单个知识
- `POST /api/knowledge` - 添加知识
- `PUT /api/knowledge/:id` - 更新知识
- `DELETE /api/knowledge/:id` - 删除知识

### 批量操作
- `POST /api/knowledge/batch-delete` - 批量删除
- `DELETE /api/knowledge/user` - 清空用户知识

### 导入导出
- `POST /api/knowledge/import` - 导入 JSON
- `POST /api/knowledge/import-markdown` - 导入 Markdown
- `GET /api/knowledge/export` - 导出 JSON

### 管理
- `POST /api/knowledge/rebuild-index` - 重建向量索引
- `POST /api/knowledge/reload-builtin` - 重新加载内置知识

### 向量嵌入配置
- `POST /api/knowledge/embedding/config` - 配置嵌入服务
- `GET /api/knowledge/embedding/info` - 获取嵌入服务信息

## 向量嵌入模式切换

### TF-IDF 模式（默认）

```bash
curl -X POST http://localhost:3000/api/knowledge/embedding/config \
  -H "Content-Type: application/json" \
  -d '{"mode": "tfidf"}'
```

- 无需外部依赖
- 256 维向量
- 适合中文分词
- 本地运行

### OpenAI 模式

```bash
curl -X POST http://localhost:3000/api/knowledge/embedding/config \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "openai",
    "apiKey": "your-api-key",
    "baseURL": "https://api.openai.com/v1",
    "model": "text-embedding-3-small"
  }'
```

- 需要有效的 OpenAI API Key
- 1536 维向量
- 高质量语义表示
- 需要网络连接

## 数据库结构

### knowledge 表
```sql
CREATE TABLE knowledge (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT,
    tags TEXT,  -- JSON 数组
    isBuiltin INTEGER,
    createdAt INTEGER,
    updatedAt INTEGER
)
```

### vectors 表
```sql
CREATE TABLE vectors (
    knowledgeId TEXT PRIMARY KEY,
    embedding BLOB NOT NULL,  -- Float32Array
    embeddingDim INTEGER NOT NULL,
    FOREIGN KEY (knowledgeId) REFERENCES knowledge(id)
)
```

### knowledge_fts 表（FTS5）
```sql
CREATE VIRTUAL TABLE knowledge_fts USING fts5(
    title,
    content,
    category,
    tags,
    tokenize='porter unicode61'
)
```

## 性能优化

### 1. WAL 模式
```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
```

### 2. 缓存配置
```sql
PRAGMA cache_size = -64000;  -- 64MB 缓存
```

### 3. 准备语句
所有数据库操作都使用预编译语句，提高执行效率。

### 4. 批量操作
支持批量插入、批量删除，减少数据库事务开销。

## 技术特点

### 1. 真正的向量数据库
- 使用 better-sqlite3 存储和检索向量
- 支持余弦相似度计算
- 混合搜索（向量 + 全文）

### 2. 本地优先
- TF-IDF 模式无需外部依赖
- 数据库文件存储在本地
- 支持离线使用

### 3. 高性能
- better-sqlite3 性能优异
- 支持 WAL 模式和并发读写
- 向量搜索速度快

### 4. 灵活扩展
- 支持多种向量嵌入方式
- 可切换 TF-IDF 和 OpenAI
- 支持自定义知识库导入

## 常见问题

### 1. 数据库文件在哪里？
答：`data/vector-knowledge.db`

### 2. 如何重置知识库？
答：删除 `data/vector-knowledge.db` 文件，然后重新运行初始化脚本。

### 3. 如何添加自定义知识？
答：使用 API 的 `POST /api/knowledge` 端点，或导入 JSON/Markdown 文件。

### 4. 向量搜索质量如何提升？
答：切换到 OpenAI 模式，使用更高质量的嵌入模型。

### 5. 支持中文搜索吗？
答：支持，TF-IDF 模式专门优化了中文分词。

## 开发指南

### 添加新的知识分类

1. 在 `public/knowledge/categories/` 创建新的分类文件
2. 导出知识数组：`module.exports = [...]`
3. 重新运行初始化脚本

### 自定义向量嵌入

1. 继承 `EmbeddingService` 类
2. 实现 `embed()` 方法
3. 在 `vector-embedding.js` 中注册

### 扩展 API

1. 在 `knowledge-api.js` 添加新的路由
2. 在 `knowledge-manager.js` 添加业务逻辑
3. 在 `vector-database.js` 添加数据库操作

## 参考资料

- [better-sqlite3 文档](https://github.com/WiseLibs/better-sqlite3)
- [FTS5 全文搜索](https://www.sqlite.org/fts5.html)
- [RAG 概念](https://www.pinecone.io/learn/what-is-retrieval-augmented-generation/)
- [TF-IDF 算法](https://en.wikipedia.org/wiki/Tf%E2%80%93idf)
