// ========================================================
// 向量嵌入服务 - TF-IDF + OpenAI 支持
// ========================================================
// 功能：
// 1. TF-IDF 向量化（本地，无依赖）
// 2. OpenAI API 向量化（高质量）
// 3. 批量向量化
// 4. 向量缓存
// ========================================================

const axios = require('axios');

// ========================================================
// TF-IDF 向量化实现
// ========================================================

class TFIDFEmbedding {
    constructor(options = {}) {
        this.maxFeatures = options.maxFeatures || 5000;
        this.vocabulary = new Map(); // 词 -> 索引
        this.idf = new Map(); // 词 -> IDF 值
        this.documentCount = 0;
        this.dimension = 256; // 固定维度
    }

    /**
     * 文本分词（支持中文和英文）
     */
    tokenize(text) {
        // 转换为字符串并处理null/undefined
        const textStr = String(text || '');

        // 移除特殊字符，保留中文、英文、数字
        const cleaned = textStr
            .toLowerCase()
            .replace(/[^\w\u4e00-\u9fa5]+/g, ' ')
            .trim();

        // 简单分词（中文按字符，英文按单词）
        const tokens = [];
        const words = cleaned.split(/\s+/);

        for (const word of words) {
            if (word.length === 0) continue;

            // 检查是否包含中文
            if (/[\u4e00-\u9fa5]/.test(word)) {
                // 中文按字符分割
                for (const char of word) {
                    if (/[\u4e00-\u9fa5]/.test(char)) {
                        tokens.push(char);
                    }
                }
            } else {
                // 英文直接添加
                tokens.push(word);
            }
        }

        return tokens;
    }

    /**
     * 训练 TF-IDF 模型
     */
    fit(documents) {
        this.documentCount = documents.length;

        // 统计词频
        const docFrequency = new Map(); // 词 -> 出现的文档数

        for (const doc of documents) {
            try {
                const tokens = new Set(this.tokenize(doc));
                for (const token of tokens) {
                    docFrequency.set(token, (docFrequency.get(token) || 0) + 1);
                }
            } catch (error) {
                console.error('[TFIDF] Failed to tokenize document:', error);
                // 跳过失败的文档
            }
        }

        // 计算 IDF
        for (const [token, df] of docFrequency.entries()) {
            const idf = Math.log(this.documentCount / (1 + df));
            this.idf.set(token, idf);

            // 构建词汇表
            if (this.vocabulary.size < this.maxFeatures) {
                this.vocabulary.set(token, this.vocabulary.size);
            }
        }

        console.log(`[TFIDF] 训练完成: ${this.vocabulary.size} 个词, ${this.documentCount} 个文档`);
    }

    /**
     * 生成 TF-IDF 向量
     */
    embed(text) {
        const tokens = this.tokenize(text);
        const tf = new Map();

        // 计算 TF
        for (const token of tokens) {
            tf.set(token, (tf.get(token) || 0) + 1);
        }

        // 归一化 TF
        for (const [token, count] of tf.entries()) {
            tf.set(token, count / tokens.length);
        }

        // 生成向量
        const vector = new Float32Array(this.dimension);

        for (const [token, freq] of tf.entries()) {
            const idx = this.vocabulary.get(token);
            if (idx !== undefined && this.idf.has(token)) {
                const tfidf = freq * this.idf.get(token);
                // 使用哈希将词索引映射到固定维度
                const hashIdx = this.hash(token) % this.dimension;
                vector[hashIdx] += tfidf;
            }
        }

        // 归一化向量
        const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
        if (norm > 0) {
            for (let i = 0; i < vector.length; i++) {
                vector[i] /= norm;
            }
        }

        return Array.from(vector);
    }

    /**
     * 批量生成向量
     */
    embedBatch(texts) {
        return texts.map(text => this.embed(text));
    }

    /**
     * 哈希函数（用于将词映射到固定维度）
     */
    hash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash);
    }
}

// ========================================================
// OpenAI 向量化实现
// ========================================================

class OpenAIEmbedding {
    constructor(config = {}) {
        this.apiKey = config.apiKey || '';
        this.baseURL = config.baseURL || 'https://api.openai.com/v1';
        this.model = config.model || 'text-embedding-3-small';
        this.dimension = 1536; // text-embedding-3-small 的维度
        this.timeout = config.timeout || 30000;
    }

    /**
     * 调用 OpenAI API 生成向量
     */
    async embed(text) {
        if (!this.apiKey) {
            throw new Error('OpenAI API key not configured');
        }

        try {
            const response = await axios.post(
                `${this.baseURL}/embeddings`,
                {
                    model: this.model,
                    input: text,
                    encoding_format: 'float'
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.apiKey}`
                    },
                    timeout: this.timeout
                }
            );

            return response.data.data[0].embedding;
        } catch (error) {
            if (error.response) {
                throw new Error(`OpenAI API error: ${error.response.status} - ${error.response.data?.error?.message || 'Unknown error'}`);
            } else if (error.request) {
                throw new Error('OpenAI API request timeout');
            } else {
                throw new Error(`OpenAI API error: ${error.message}`);
            }
        }
    }

    /**
     * 批量生成向量
     */
    async embedBatch(texts) {
        if (!this.apiKey) {
            throw new Error('OpenAI API key not configured');
        }

        try {
            const response = await axios.post(
                `${this.baseURL}/embeddings`,
                {
                    model: this.model,
                    input: texts,
                    encoding_format: 'float'
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.apiKey}`
                    },
                    timeout: this.timeout * texts.length // 扩展超时时间
                }
            );

            return response.data.data.map(item => item.embedding);
        } catch (error) {
            if (error.response) {
                throw new Error(`OpenAI API error: ${error.response.status} - ${error.response.data?.error?.message || 'Unknown error'}`);
            } else if (error.request) {
                throw new Error('OpenAI API request timeout');
            } else {
                throw new Error(`OpenAI API error: ${error.message}`);
            }
        }
    }

    /**
     * 测试 API 连接
     */
    async testConnection() {
        try {
            await this.embed('test');
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

// ========================================================
// 向量服务（统一接口）
// ========================================================

class EmbeddingService {
    constructor() {
        this.tfidfModel = null;
        this.openaiModel = null;
        this.mode = 'tfidf'; // 'tfidf' 或 'openai'
        this.cache = new Map();
    }

    /**
     * 初始化 TF-IDF 模型
     */
    initializeTFIDF(documents) {
        this.tfidfModel = new TFIDFEmbedding();
        this.tfidfModel.fit(documents);
        this.mode = 'tfidf';
        console.log('[EmbeddingService] TF-IDF 模型初始化完成');
    }

    /**
     * 初始化 OpenAI 模型
     */
    initializeOpenAI(config) {
        this.openaiModel = new OpenAIEmbedding(config);
        this.mode = 'openai';
        console.log('[EmbeddingService] OpenAI 模型初始化完成');
    }

    /**
     * 设置模式
     */
    setMode(mode) {
        if (mode !== 'tfidf' && mode !== 'openai') {
            throw new Error('Invalid mode, must be "tfidf" or "openai"');
        }
        this.mode = mode;
        console.log(`[EmbeddingService] 模式切换为: ${mode}`);
    }

    /**
     * 生成向量
     */
    async embed(text) {
        const cacheKey = `${this.mode}:${text}`;

        // 检查缓存
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        let vector;

        if (this.mode === 'openai' && this.openaiModel) {
            vector = await this.openaiModel.embed(text);
        } else if (this.mode === 'tfidf' && this.tfidfModel) {
            vector = this.tfidfModel.embed(text);
        } else {
            throw new Error('No embedding model available');
        }

        // 缓存结果
        this.cache.set(cacheKey, vector);

        return vector;
    }

    /**
     * 批量生成向量
     */
    async embedBatch(texts) {
        if (this.mode === 'openai' && this.openaiModel) {
            // OpenAI 支持批量请求
            return await this.openaiModel.embedBatch(texts);
        } else if (this.mode === 'tfidf' && this.tfidfModel) {
            // TF-IDF 批量处理
            return this.tfidfModel.embedBatch(texts);
        } else {
            throw new Error('No embedding model available');
        }
    }

    /**
     * 清空缓存
     */
    clearCache() {
        this.cache.clear();
        console.log('[EmbeddingService] 缓存已清空');
    }

    /**
     * 获取当前维度
     */
    getDimension() {
        if (this.mode === 'openai' && this.openaiModel) {
            return this.openaiModel.dimension;
        } else if (this.mode === 'tfidf' && this.tfidfModel) {
            return this.tfidfModel.dimension;
        }
        return 0;
    }
}

// 创建单例
const embeddingService = new EmbeddingService();

// 导出模块
module.exports = {
    TFIDFEmbedding,
    OpenAIEmbedding,
    EmbeddingService,
    embeddingService
};
