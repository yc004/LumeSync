# SQLite 向量数据库 - 完整指南

## 概述

萤火课件编辑器现已升级为使用 SQLite 数据库存储知识库，提供更好的扩展性和性能。

## 数据库特性

### 核心优势

1. **真正的 SQL 数据库**
   - 支持复杂查询和 JOIN 操作
   - 事务支持，保证数据一致性
   - 索引优化，查询速度快

2. **全文搜索（FTS5）**
   - 内置全文搜索引擎
   - 支持 BM25 排序算法
   - 中文分词支持

3. **软删除机制**
   - 数据不会真正删除
   - 可恢复已删除内容
   - 定期清理选项

4. **自动降级**
   - 如果 SQLite 不可用，自动降级到纯内存模式
   - 确保系统始终可用
   - 数据兼容性保证

## 数据库结构

### 表结构

#### 1. knowledge 表（知识表）

```sql
CREATE TABLE knowledge (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT,
    tags TEXT,
    is_builtin INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    word_count INTEGER,
    source_file TEXT,
    deleted_at TEXT
);
```

**索引：**
- `idx_knowledge_category` - 分类索引
- `idx_knowledge_created_at` - 创建时间索引
- `idx_knowledge_is_builtin` - 内置/用户标记索引

#### 2. vectors 表（向量表）

```sql
CREATE TABLE vectors (
    knowledge_id TEXT PRIMARY KEY,
    embedding TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (knowledge_id) REFERENCES knowledge(id) ON DELETE CASCADE
);
```

**索引：**
- `idx_vectors_created_at` - 创建时间索引

#### 3. knowledge_fts 表（全文搜索虚拟表）

```sql
CREATE VIRTUAL TABLE knowledge_fts USING fts5(
    title,
    content,
    tags,
    content=knowledge,
    content_rowid=rowid
);
```

#### 4. schema_migrations 表（迁移记录）

```sql
CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    description TEXT,
    applied_at TEXT NOT NULL
);
```

## 安装和配置

### 1. 安装依赖

```bash
# 方法 1：直接安装（跳过编译）
npm install better-sqlite3@9.4.3 --ignore-scripts

# 方法 2：使用安装脚本
# Windows
install-sqlite.bat

# 方法 3：手动安装（需要编译工具）
npm install better-sqlite3@9.4.3
```

### 2. 验证安装

```javascript
const Database = require('better-sqlite3');
const db = new Database(':memory:');
console.log('SQLite 版本:', db.pragma('user_version', { simple: true }));
db.close();
```

### 3. 初始化数据库

数据库会在服务器启动时自动初始化，也可以手动运行：

```bash
node server/init-db.js
```

## API 接口

### 基础 CRUD

#### 获取所有知识
```
GET /api/knowledge
```

#### 获取统计信息
```
GET /api/knowledge/stats
```

响应示例：
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

### 搜索接口

#### 向量相似度搜索
```
GET /api/knowledge/search?q=搜索词&topK=5&category=分类
```

#### 全文搜索
```
GET /api/knowledge/fulltext?q=搜索词&topK=10
```

**参数说明：**
- `q`: 搜索关键词（必需）
- `topK`: 返回结果数量（默认 5）
- `category`: 分类过滤（可选）

### 知识管理

#### 添加知识
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

#### 更新知识
```
PUT /api/knowledge/:id
Content-Type: application/json

{
  "title": "新标题",
  "content": "新内容"
}
```

#### 删除知识
```
DELETE /api/knowledge/:id
```

#### 批量删除
```
DELETE /api/knowledge
Content-Type: application/json

{
  "ids": ["id1", "id2", "id3"]
}
```

### 数据管理

#### 备份数据库
```
POST /api/knowledge/backup
```

#### 恢复数据库
```
POST /api/knowledge/restore
Content-Type: application/json

{
  "backupPath": "./data/vector-knowledge-backup-2024-01-01.db"
}
```

#### 清理已删除数据
```
POST /api/knowledge/cleanup
```

#### 重新索引
```
POST /api/knowledge/reindex
```

## 使用示例

### 前端调用

```javascript
const service = new KnowledgeService();

// 搜索知识
const results = await service.searchKnowledge('如何使用同步变量', {
    topK: 5,
    category: '系统API'
});

// 添加知识
await service.addKnowledge([{
    title: '自定义知识点',
    content: '这是我的自定义内容...',
    category: '自定义',
    tags: ['test', 'demo']
}]);

// 获取统计
const stats = await service.getStats();
console.log(`总计 ${stats.total} 条知识`);
```

### 直接数据库操作

```javascript
const VectorDatabase = require('./server/vector-database-sqlite');
const db = new VectorDatabase('./data/vector-knowledge.db');

await db.initialize();

// 添加知识
await db.addKnowledge({
    id: 'test-1',
    title: '测试',
    content: '测试内容'
}, [0.1, 0.2, ...]);

// 搜索
const results = db.searchBySimilarity(queryVector, 5);
console.log(results);

db.close();
```

## 性能优化

### 1. WAL 模式

数据库默认启用 WAL 模式，提高并发性能：

```sql
PRAGMA journal_mode = WAL;
```

### 2. 索引优化

确保常用查询字段都有索引：
- `category` - 分类筛选
- `created_at` - 时间排序
- `is_builtin` - 内置/用户区分

### 3. 批量操作

使用批量接口提高性能：

```javascript
// 推荐：批量添加
await service.addKnowledgeBatch(items);

// 不推荐：逐个添加
for (const item of items) {
    await service.addKnowledge(item);
}
```

### 4. 缓存

前端服务内置 5 分钟缓存，减少服务器请求。

## 数据备份和恢复

### 自动备份

建议设置定时备份：

```javascript
// 每天备份一次
setInterval(async () => {
    await service.backup();
}, 24 * 60 * 60 * 1000);
```

### 手动备份

```javascript
// 备份到指定路径
await service.backup('./backups/knowledge-2024-01-01.db');

// 恢复
await service.restore('./backups/knowledge-2024-01-01.db');
```

### 备份文件格式

备份是完整的 SQLite 数据库文件，可以直接用 SQLite 工具打开：

```bash
# 使用命令行工具
sqlite3 vector-knowledge-backup.db
```

## 数据迁移

### 从 JSON 迁移到 SQLite

如果之前使用纯 JSON 存储，可以迁移：

```javascript
const fs = require('fs');

// 读取 JSON 数据
const data = JSON.parse(fs.readFileSync('./data/vector-knowledge.json', 'utf-8'));

// 转换并导入到 SQLite
const items = data.knowledge.map(([id, knowledge]) => ({
    ...knowledge,
    embedding: data.vectors.get(id)
}));

await db.addKnowledgeBatch(items);
```

### 迁移到其他数据库

SQLite 数据可以导出为 SQL：

```bash
sqlite3 vector-knowledge.db .dump > backup.sql
```

然后导入到其他数据库：
```bash
sqlite3 new.db < backup.sql
```

## 故障排除

### 1. 数据库锁定

如果遇到 "database is locked" 错误：
- 确保只有一个进程在访问数据库
- 检查是否有未关闭的连接
- 使用 WAL 模式减少锁争用

### 2. 内存不足

如果数据量很大，考虑：
- 增加 SQLite 页面缓存大小
- 定期清理已删除数据
- 使用分区表

### 3. 性能问题

优化建议：
- 检查查询是否使用索引
- 使用 EXPLAIN QUERY PLAN 分析查询
- 考虑使用全文搜索替代 LIKE

### 4. 自动降级

如果显示"服务不可用"且使用内存模式：
- 检查 better-sqlite3 是否正确安装
- 查看服务器日志中的错误信息
- 参考安装指南重新安装

## 高级功能

### 1. 全文搜索优化

使用 FTS5 的高级特性：

```sql
-- 使用 Porter 词干提取器
CREATE VIRTUAL TABLE knowledge_fts USING fts5(
    title,
    content,
    tokenize = 'porter unicode61'
);
```

### 2. 自定义排序

按相关度排序：

```sql
SELECT * FROM knowledge_fts
WHERE knowledge_fts MATCH '搜索词'
ORDER BY bm25(knowledge_fts)
LIMIT 10;
```

### 3. 复合搜索

结合向量搜索和全文搜索：

```javascript
// 向量搜索获得语义相关结果
const vectorResults = await db.searchBySimilarity(queryVector, 20);

// 全文搜索获得精确匹配结果
const ftsResults = await db.searchByFullText(query, 20);

// 合并和去重
const combined = [...new Set([...vectorResults, ...ftsResults])];
```

## 监控和维护

### 1. 数据库大小

定期检查数据库大小：

```javascript
const fs = require('fs');
const stats = fs.statSync('./data/vector-knowledge.db');
console.log(`数据库大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
```

### 2. 性能监控

```javascript
// 查询性能
const start = Date.now();
const results = await service.searchKnowledge('搜索词');
console.log(`查询耗时: ${Date.now() - start}ms`);
```

### 3. 定期维护

```javascript
// 定期清理
await service.cleanup();

// 定期重建索引
db.exec('REINDEX');
```

## 扩展性

SQLite 数据库提供了良好的扩展性：

1. **水平扩展** - 可以将数据分片到多个数据库文件
2. **垂直扩展** - SQLite 可以处理 TB 级数据
3. **查询能力** - 支持复杂的 SQL 查询
4. **功能扩展** - 可以添加自定义函数和聚合函数

## 最佳实践

1. **定期备份** - 每天至少备份一次
2. **使用事务** - 批量操作使用事务
3. **索引优化** - 为常用查询添加索引
4. **监控性能** - 关注查询时间
5. **清理数据** - 定期清理已删除数据
6. **版本控制** - 使用迁移系统管理结构变更

## 参考资源

- [SQLite 官方文档](https://www.sqlite.org/docs.html)
- [better-sqlite3 文档](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)
- [FTS5 全文搜索](https://www.sqlite.org/fts5.html)
- [SQLite 性能优化](https://www.sqlite.org/optoverview.html)

## FAQ

**Q: SQLite 能处理多少数据？**

A: SQLite 理论上可处理 140TB 数据，实际应用中处理 GB 级数据毫无问题。

**Q: 可以同时有多个写操作吗？**

A: 可以，使用 WAL 模式后支持并发读写。

**Q: 数据库损坏怎么办？**

A: SQLite 有自动恢复机制。如果有备份，使用备份恢复；如果没有，尝试 `PRAGMA integrity_check` 检查。

**Q: 如何迁移到其他数据库？**

A: 可以使用 SQLite 的 `.dump` 命令导出为 SQL，然后导入到其他数据库。也可以编写脚本逐条迁移。

**Q: 性能如何？**

A: 对于知识库这种规模的数据，SQLite 性能非常优秀。查询通常在毫秒级别完成。
