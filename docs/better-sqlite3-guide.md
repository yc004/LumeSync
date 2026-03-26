# Better-SQLite3 向量数据库使用指南

## 概述

本项目使用 **better-sqlite3** 作为向量数据库的底层存储引擎。better-sqlite3 是一个高性能的 SQLite3 封装库，提供同步 API 和优异的性能表现。

## 为什么选择 better-sqlite3？

### 性能优势

1. **同步 API** - 比 async/await 版本快 2-5 倍
2. **准备语句缓存** - 避免重复解析 SQL
3. **WAL 模式** - 支持读写并发
4. **批量操作** - 使用事务批量处理数据
5. **内存映射** - 大数据集性能提升

### 与其他方案对比

| 特性 | better-sqlite3 | sql.js | 内存存储 |
|------|--------------|--------|----------|
| 持久化 | ✅ | ✅ | ❌ |
| 性能 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| 依赖 | 原生模块 | WASM | 无 |
| 扩展性 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐ |
| 安装难度 | 中等 | 简单 | 简单 |

## 安装

### 前置要求

- **Node.js** 16.x 或更高版本
- **Python** 3.x（用于编译原生模块）
- **构建工具**（Windows：Visual Studio Build Tools）

### 安装步骤

```bash
# 安装 better-sqlite3
npm install better-sqlite3

# 或使用项目提供的安装脚本（Windows）
npm run install:sqlite
```

### Windows 构建工具安装

如果在安装时遇到编译错误，需要安装构建工具：

```bash
# 运行安装脚本
install-build-tools.bat

# 然后重新安装
install-better-sqlite3.bat
```

## 数据库配置

### 性能优化配置

数据库初始化时会自动应用以下性能优化：

```javascript
// WAL 模式 - 提高并发性能
this.db.pragma('journal_mode = WAL');

// 同步模式 - 平衡性能和安全
this.db.pragma('synchronous = NORMAL');

// 缓存大小 - 2GB
this.db.pragma('cache_size = -2000');

// 页面大小 - 4096（默认）
this.db.pragma('page_size = 4096');

// 临时存储 - 内存
this.db.pragma('temp_store = MEMORY');

// 内存映射 - 30GB
this.db.pragma('mmap_size = 30000000000');
```

### WAL 模式说明

WAL（Write-Ahead Logging）模式提供以下优势：

- ✅ 读写操作可以并发执行
- ✅ 写入性能提升 2-3 倍
- ✅ 减少磁盘 I/O
- ✅ 更好的崩溃恢复

## 数据库结构

### 表结构

```sql
-- 知识表
CREATE TABLE knowledge (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT,
    tags TEXT,           -- JSON 数组
    is_builtin INTEGER,
    created_at TEXT,
    updated_at TEXT,
    word_count INTEGER,
    source_file TEXT,
    deleted_at TEXT      -- 软删除
);

-- 向量表
CREATE TABLE vectors (
    knowledge_id TEXT PRIMARY KEY,
    embedding BLOB NOT NULL,  -- Float32Array Buffer
    created_at TEXT,
    updated_at TEXT,
    FOREIGN KEY (knowledge_id) REFERENCES knowledge(id) ON DELETE CASCADE
);
```

### 索引

```sql
CREATE INDEX idx_knowledge_category ON knowledge(category);
CREATE INDEX idx_knowledge_created_at ON knowledge(created_at);
CREATE INDEX idx_knowledge_is_builtin ON knowledge(is_builtin);
CREATE INDEX idx_knowledge_deleted_at ON knowledge(deleted_at);
CREATE INDEX idx_vectors_created_at ON vectors(created_at);
```

### 全文搜索（FTS5）

```sql
CREATE VIRTUAL TABLE knowledge_fts USING fts5(
    title,
    content,
    tags,
    content=knowledge,
    content_rowid=rowid
);
```

## API 使用

### 初始化

```javascript
const VectorDatabase = require('./server/vector-database-sqlite');

const db = new VectorDatabase('./data/vector-knowledge.db');
await db.initialize();
```

### 添加知识

```javascript
// 单条添加
db.addKnowledge({
    id: 'kb-001',
    title: '动画基础',
    content: '动画是...',
    category: '动画',
    tags: ['基础', '入门'],
    isBuiltin: false
}, embedding);

// 批量添加
const items = [
    { knowledgeItem: {...}, embedding: [...] },
    { knowledgeItem: {...}, embedding: [...] }
];
db.addKnowledgeBatch(items);
```

### 查询知识

```javascript
// 通过 ID 查询
const knowledge = db.getKnowledgeById('kb-001');

// 查询所有
const all = db.getAllKnowledge();

// 向量相似度搜索
const results = db.searchBySimilarity(queryEmbedding, 10, '动画');

// 全文搜索
const ftsResults = db.searchByFullText('动画基础', 10);

// 关键词搜索
const keywordResults = db.searchByKeyword('动画', 10);
```

### 更新和删除

```javascript
// 更新知识
db.updateKnowledge('kb-001', {
    title: '新的标题',
    content: '新的内容'
});

// 删除知识（软删除）
db.deleteKnowledge('kb-001');

// 批量删除
db.deleteKnowledgeBatch(['kb-001', 'kb-002']);
```

### 统计和维护

```javascript
// 获取统计信息
const stats = db.getStats();
console.log(stats);
// { total: 100, builtinCount: 50, userCount: 50, categoryCount: 8 }

// 清理已删除的数据
db.cleanupDeleted();

// VACUUM 数据库
db.vacuum();

// 备份数据库
db.backup('./backup/backup.db');

// 获取数据库大小
const size = db.getDatabaseSize();
console.log(`数据库大小: ${size / 1024 / 1024} MB`);

// 关闭数据库
db.close();
```

## 性能基准

基于性能测试结果（100条记录）：

| 操作 | 耗时 | 备注 |
|------|------|------|
| 初始化 | 42ms | 首次创建表 |
| 单条插入 | <1ms | 使用事务 |
| 批量插入（99条） | 19ms | 平均 0.19ms/条 |
| 单条查询 | <1ms | 使用准备语句 |
| 全量查询 | <1ms | 100条记录 |
| 向量搜索 | 7ms | 全量计算相似度 |
| 全文搜索 | <1ms | FTS5 索引 |
| 关键词搜索 | <1ms | LIKE 查询 |
| 批量删除（10条） | 1ms | 软删除 |
| VACUUM | 13ms | 清理碎片 |

### 性能优化要点

1. **使用准备语句** - 避免重复解析 SQL
2. **使用事务** - 批量操作性能提升 10-100 倍
3. **向量存储为 BLOB** - 减少序列化开销
4. **WAL 模式** - 支持读写并发
5. **适当的索引** - 加速查询

## 错误处理

```javascript
try {
    db.initialize();
} catch (error) {
    if (error.message.includes('SQLITE_CANTOPEN')) {
        console.error('无法打开数据库，检查路径和权限');
    } else {
        console.error('数据库错误:', error);
    }
}
```

## 数据迁移

### 从内存存储迁移

```javascript
// 1. 读取旧数据
const oldData = require('./data/knowledge.json');

// 2. 创建向量嵌入
const embeddingService = new VectorEmbeddingService();
for (const item of oldData) {
    const embedding = await embeddingService.generateEmbedding(item.content);
    db.addKnowledge(item, embedding);
}

// 3. 关闭数据库
db.close();
```

### 从 SQL.js 迁移

```javascript
// 导出数据
const sqlJs = new SqlJsDatabase();
const data = sqlJs.getAllKnowledge();

// 导入到 better-sqlite3
const sqlite3 = new VectorDatabase('./data/vector-knowledge.db');
await sqlite3.initialize();

for (const item of data) {
    const embedding = await getEmbedding(item);
    sqlite3.addKnowledge(item, embedding);
}
```

## 最佳实践

### 1. 批量操作

❌ 不推荐：
```javascript
for (const item of items) {
    db.addKnowledge(item, embedding);  // 每次都提交事务
}
```

✅ 推荐：
```javascript
const itemsWithEmbeddings = items.map(item => ({
    knowledgeItem: item,
    embedding: getEmbedding(item)
}));
db.addKnowledgeBatch(itemsWithEmbeddings);  // 单次事务
```

### 2. 使用缓存

```javascript
const cache = new Map();

function getKnowledge(id) {
    if (cache.has(id)) {
        return cache.get(id);
    }
    const knowledge = db.getKnowledgeById(id);
    cache.set(id, knowledge);
    return knowledge;
}
```

### 3. 定期维护

```javascript
// 每周执行一次
setInterval(() => {
    db.cleanupDeleted();
    db.vacuum();
}, 7 * 24 * 60 * 60 * 1000);
```

## 故障排除

### 编译错误

**错误**: `node-gyp rebuild failed`

**解决方案**:
```bash
# 安装构建工具
npm install -g node-gyp
npm install -g windows-build-tools

# 重新安装
npm rebuild better-sqlite3
```

### WAL 文件过大

**错误**: WAL 文件（.db-wal）持续增长

**解决方案**:
```javascript
// 手动 checkpoint
db.pragma('wal_checkpoint(TRUNCATE)');

// 或重启数据库连接
db.close();
db.initialize();
```

### 数据库锁定

**错误**: `SQLITE_BUSY: database is locked`

**解决方案**:
```javascript
// 增加 busy timeout
this.db.pragma('busy_timeout = 5000');

// 或检查是否有其他进程访问
```

## 监控和调优

### 性能监控

```javascript
const start = Date.now();
db.addKnowledgeBatch(items);
const duration = Date.now() - start;
console.log(`批量插入 ${items.length} 条耗时: ${duration}ms`);
```

### 慢查询分析

```javascript
// 启用 SQL 日志
const db = new Database(path, { verbose: console.log });

// 查看执行计划
const plan = db.prepare('EXPLAIN QUERY PLAN SELECT * FROM knowledge WHERE category = ?');
console.log(plan.all());
```

## 相关资源

- [better-sqlite3 文档](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)
- [SQLite 文档](https://www.sqlite.org/docs.html)
- [FTS5 全文搜索](https://www.sqlite.org/fts5.html)

## 版本历史

### v1.0.0 (2026-03-26)
- ✅ 初始版本
- ✅ better-sqlite3 集成
- ✅ 向量存储和检索
- ✅ 全文搜索支持
- ✅ 性能优化配置
