// ========================================================
// 向量数据库核心 - 使用 better-sqlite3 实现 RAG 检索
// ========================================================
// 功能：
// 1. 向量存储和检索
// 2. 余弦相似度计算
// 3. 全文搜索（FTS5）
// 4. 高效批量操作
// ========================================================

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// 数据库路径
const DB_PATH = path.join(__dirname, '..', 'data', 'vector-knowledge.db');
const DB_DIR = path.dirname(DB_PATH);

// 确保数据目录存在
if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

// 数据库实例
let db = null;

/**
 * 初始化数据库
 */
function initializeDatabase() {
    if (db) return db;

    console.log('[VectorDatabase] 初始化数据库...');
    console.log('[VectorDatabase] 数据库路径:', DB_PATH);

    try {
        db = new Database(DB_PATH);
        console.log('[VectorDatabase] 数据库实例创建成功');
    } catch (error) {
        console.error('[VectorDatabase] 创建数据库失败:', error.message);
        throw new Error(`Failed to create database: ${error.message}`);
    }

    // 启用 WAL 模式（提高并发性能）
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = -64000'); // 64MB 缓存

    // 创建知识表
    db.exec(`
        CREATE TABLE IF NOT EXISTS knowledge (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            category TEXT,
            tags TEXT,
            isBuiltin INTEGER DEFAULT 0,
            createdAt INTEGER DEFAULT (strftime('%s', 'now')),
            updatedAt INTEGER DEFAULT (strftime('%s', 'now'))
        )
    `);

    // 创建全文搜索虚拟表（FTS5）
    db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
            title,
            content,
            category,
            tags,
            content_rowid=rowid,
            tokenize='porter unicode61'
        )
    `);

    // 创建触发器：在插入/更新时同步到 FTS 表
    db.exec(`
        CREATE TRIGGER IF NOT EXISTS knowledge_ai AFTER INSERT ON knowledge BEGIN
            INSERT INTO knowledge_fts(rowid, title, content, category, tags)
            VALUES (new.rowid, new.title, new.content, new.category, new.tags);
        END;

        CREATE TRIGGER IF NOT EXISTS knowledge_au AFTER UPDATE ON knowledge BEGIN
            UPDATE knowledge_fts SET title=new.title, content=new.content,
                category=new.category, tags=new.tags WHERE rowid=new.rowid;
        END;

        CREATE TRIGGER IF NOT EXISTS knowledge_ad AFTER DELETE ON knowledge BEGIN
            DELETE FROM knowledge_fts WHERE rowid=old.rowid;
        END;
    `);

    // 创建向量表（存储嵌入向量）
    db.exec(`
        CREATE TABLE IF NOT EXISTS vectors (
            knowledgeId TEXT PRIMARY KEY,
            embedding BLOB NOT NULL,
            embeddingDim INTEGER NOT NULL,
            FOREIGN KEY (knowledgeId) REFERENCES knowledge(id) ON DELETE CASCADE
        )
    `);

    // 创建索引
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge(category);
        CREATE INDEX IF NOT EXISTS idx_knowledge_isBuiltin ON knowledge(isBuiltin);
        CREATE INDEX IF NOT EXISTS idx_knowledge_updatedAt ON knowledge(updatedAt DESC);
    `);

    console.log('[VectorDatabase] 数据库初始化完成');
    return db;
}

/**
 * 获取数据库实例
 */
function getDatabase() {
    if (!db) {
        return initializeDatabase();
    }
    return db;
}

/**
 * 生成唯一 ID
 */
function generateId() {
    return `knowledge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 插入知识（带向量）
 */
function insertKnowledge(knowledge, embedding) {
    const db = getDatabase();
    const id = knowledge.id || generateId();
    const now = Math.floor(Date.now() / 1000);

    // 插入知识
    const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO knowledge (id, title, content, category, tags, isBuiltin, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
        id,
        knowledge.title,
        knowledge.content,
        knowledge.category || null,
        knowledge.tags ? JSON.stringify(knowledge.tags) : null,
        knowledge.isBuiltin ? 1 : 0,
        knowledge.createdAt || now,
        now
    );

    // 插入向量（如果提供了embedding）
    if (embedding && embedding.length > 0) {
        const vectorData = Buffer.from(new Float32Array(embedding));
        const insertVectorStmt = db.prepare(`
            INSERT OR REPLACE INTO vectors (knowledgeId, embedding, embeddingDim)
            VALUES (?, ?, ?)
        `);
        insertVectorStmt.run(id, vectorData, embedding.length);
    }

    return id;
}

/**
 * 批量插入知识（事务）
 */
function batchInsertKnowledge(knowledgeList, embeddings = []) {
    const db = getDatabase();

    const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO knowledge (id, title, content, category, tags, isBuiltin, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertVectorStmt = db.prepare(`
        INSERT OR REPLACE INTO vectors (knowledgeId, embedding, embeddingDim)
        VALUES (?, ?, ?)
    `);

    const insertMany = db.transaction((items) => {
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const id = item.id || generateId();
            const now = Math.floor(Date.now() / 1000);

            // 插入知识
            insertStmt.run(
                id,
                item.title,
                item.content,
                item.category || null,
                item.tags ? JSON.stringify(item.tags) : null,
                item.isBuiltin ? 1 : 0,
                item.createdAt || now,
                now
            );

            // 插入向量（如果提供）
            const embedding = embeddings[i];
            if (embedding && embedding.length > 0) {
                const vectorData = Buffer.from(new Float32Array(embedding));
                insertVectorStmt.run(id, vectorData, embedding.length);
            }
        }
    });

    insertMany(knowledgeList);
    console.log(`[VectorDatabase] 批量插入 ${knowledgeList.length} 条知识`);
}

/**
 * 获取知识
 */
function getKnowledge(id) {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM knowledge WHERE id = ?').get(id);

    if (!row) return null;

    return {
        ...row,
        isBuiltin: row.isBuiltin === 1,
        tags: row.tags ? JSON.parse(row.tags) : []
    };
}

/**
 * 获取所有知识
 */
function getAllKnowledge(options = {}) {
    const db = getDatabase();

    let query = 'SELECT * FROM knowledge';
    const params = [];
    const conditions = [];

    if (options.category) {
        conditions.push('category = ?');
        params.push(options.category);
    }

    if (options.isBuiltin !== undefined) {
        conditions.push('isBuiltin = ?');
        params.push(options.isBuiltin ? 1 : 0);
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY updatedAt DESC';

    if (options.limit) {
        query += ' LIMIT ?';
        params.push(options.limit);
    }

    const rows = db.prepare(query).all(...params);

    return rows.map(row => ({
        ...row,
        isBuiltin: row.isBuiltin === 1,
        tags: row.tags ? JSON.parse(row.tags) : []
    }));
}

/**
 * 向量相似度检索（余弦相似度）
 */
function vectorSearch(queryVector, topK = 5, options = {}) {
    const db = getDatabase();

    // 获取所有向量
    let query = `
        SELECT k.id, k.title, k.content, k.category, k.tags, k.isBuiltin, v.embedding, v.embeddingDim
        FROM knowledge k
        INNER JOIN vectors v ON k.id = v.knowledgeId
    `;

    const params = [];
    const conditions = [];

    if (options.category) {
        conditions.push('k.category = ?');
        params.push(options.category);
    }

    if (options.isBuiltin !== undefined) {
        conditions.push('k.isBuiltin = ?');
        params.push(options.isBuiltin ? 1 : 0);
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }

    const rows = db.prepare(query).all(...params);

    // 计算余弦相似度
    const results = rows.map(row => {
        const storedVector = new Float32Array(row.embedding.buffer);
        const similarity = cosineSimilarity(queryVector, storedVector);

        return {
            id: row.id,
            title: row.title,
            content: row.content,
            category: row.category,
            tags: row.tags ? JSON.parse(row.tags) : [],
            isBuiltin: row.isBuiltin === 1,
            similarity
        };
    });

    // 按相似度排序并返回前 topK 个
    return results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK);
}

/**
 * 全文搜索（FTS5）
 */
function fullTextSearch(query, topK = 10, options = {}) {
    const db = getDatabase();

    let searchQuery = `
        SELECT k.id, k.title, k.content, k.category, k.tags, k.isBuiltin, bm25(knowledge_fts) as score
        FROM knowledge k
        INNER JOIN knowledge_fts fts ON k.rowid = fts.rowid
        WHERE knowledge_fts MATCH ?
    `;

    const params = [query];

    if (options.category) {
        searchQuery += ' AND k.category = ?';
        params.push(options.category);
    }

    if (options.isBuiltin !== undefined) {
        searchQuery += ' AND k.isBuiltin = ?';
        params.push(options.isBuiltin ? 1 : 0);
    }

    searchQuery += ' ORDER BY score LIMIT ?';
    params.push(topK);

    const rows = db.prepare(searchQuery).all(...params);

    return rows.map(row => ({
        id: row.id,
        title: row.title,
        content: row.content,
        category: row.category,
        tags: row.tags ? JSON.parse(row.tags) : [],
        isBuiltin: row.isBuiltin === 1,
        score: row.score
    }));
}

/**
 * 混合搜索（向量 + 全文）
 */
function hybridSearch(queryVector, textQuery, topK = 5, options = {}) {
    // 向量搜索
    const vectorResults = vectorSearch(queryVector, topK * 2, options);

    // 全文搜索
    const textResults = fullTextSearch(textQuery, topK * 2, options);

    // 合并结果并去重
    const combined = new Map();

    vectorResults.forEach(item => {
        combined.set(item.id, { ...item, vectorScore: item.similarity, textScore: 0 });
    });

    textResults.forEach(item => {
        if (combined.has(item.id)) {
            combined.get(item.id).textScore = item.score;
        } else {
            combined.set(item.id, { ...item, vectorScore: 0, textScore: item.score });
        }
    });

    // 计算混合分数（0.7 向量 + 0.3 全文）
    const results = Array.from(combined.values()).map(item => ({
        ...item,
        hybridScore: item.vectorScore * 0.7 + (item.textScore / Math.max(...textResults.map(r => r.score))) * 0.3
    }));

    // 按混合分数排序
    return results
        .sort((a, b) => b.hybridScore - a.hybridScore)
        .slice(0, topK)
        .map(({ vectorScore, textScore, hybridScore, ...rest }) => rest);
}

/**
 * 余弦相似度计算
 */
function cosineSimilarity(vec1, vec2) {
    if (vec1.length !== vec2.length) return 0;

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
        dotProduct += vec1[i] * vec2[i];
        norm1 += vec1[i] * vec1[i];
        norm2 += vec2[i] * vec2[i];
    }

    if (norm1 === 0 || norm2 === 0) return 0;
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * 更新知识
 */
function updateKnowledge(id, updates) {
    const db = getDatabase();

    const fields = [];
    const params = [];

    if (updates.title !== undefined) {
        fields.push('title = ?');
        params.push(updates.title);
    }

    if (updates.content !== undefined) {
        fields.push('content = ?');
        params.push(updates.content);
    }

    if (updates.category !== undefined) {
        fields.push('category = ?');
        params.push(updates.category);
    }

    if (updates.tags !== undefined) {
        fields.push('tags = ?');
        params.push(JSON.stringify(updates.tags));
    }

    if (fields.length === 0) return false;

    fields.push('updatedAt = ?');
    params.push(Math.floor(Date.now() / 1000));
    params.push(id);

    const stmt = db.prepare(`UPDATE knowledge SET ${fields.join(', ')} WHERE id = ?`);
    const result = stmt.run(...params);

    return result.changes > 0;
}

/**
 * 更新知识向量
 */
function updateKnowledgeVector(id, embedding) {
    const db = getDatabase();

    if (embedding && embedding.length > 0) {
        const vectorData = Buffer.from(new Float32Array(embedding));
        const updateVectorStmt = db.prepare(`
            INSERT OR REPLACE INTO vectors (knowledgeId, embedding, embeddingDim)
            VALUES (?, ?, ?)
        `);
        updateVectorStmt.run(id, vectorData, embedding.length);
        return true;
    }
    return false;
}

/**
 * 删除知识
 */
function deleteKnowledge(id) {
    const db = getDatabase();

    // 删除向量（级联删除）
    db.prepare('DELETE FROM vectors WHERE knowledgeId = ?').run(id);

    // 删除知识
    const result = db.prepare('DELETE FROM knowledge WHERE id = ?').run(id);

    return result.changes > 0;
}

/**
 * 批量删除知识
 */
function batchDeleteKnowledge(ids) {
    const db = getDatabase();

    const deleteVectors = db.prepare('DELETE FROM vectors WHERE knowledgeId = ?');
    const deleteKnowledge = db.prepare('DELETE FROM knowledge WHERE id = ?');

    const deleteMany = db.transaction((idList) => {
        for (const id of idList) {
            deleteVectors.run(id);
            deleteKnowledge.run(id);
        }
    });

    deleteMany(ids);
    console.log(`[VectorDatabase] 批量删除 ${ids.length} 条知识`);
}

/**
 * 获取统计信息
 */
function getStats() {
    const db = getDatabase();

    const total = db.prepare('SELECT COUNT(*) as count FROM knowledge').get().count;
    const builtin = db.prepare('SELECT COUNT(*) as count FROM knowledge WHERE isBuiltin = 1').get().count;
    const user = total - builtin;

    const categories = db.prepare('SELECT category, COUNT(*) as count FROM knowledge GROUP BY category').all();

    return {
        total,
        builtin,
        user,
        categories
    };
}

/**
 * 清空数据库
 */
function clearDatabase() {
    const db = getDatabase();

    db.prepare('DELETE FROM vectors').run();
    db.prepare('DELETE FROM knowledge').run();

    console.log('[VectorDatabase] 数据库已清空');
}

/**
 * 关闭数据库
 */
function closeDatabase() {
    if (db) {
        db.close();
        db = null;
        console.log('[VectorDatabase] 数据库已关闭');
    }
}

// 导出模块
module.exports = {
    initializeDatabase,
    getDatabase,
    insertKnowledge,
    batchInsertKnowledge,
    getKnowledge,
    getAllKnowledge,
    vectorSearch,
    fullTextSearch,
    hybridSearch,
    updateKnowledge,
    updateKnowledgeVector,
    deleteKnowledge,
    batchDeleteKnowledge,
    getStats,
    clearDatabase,
    closeDatabase
};
