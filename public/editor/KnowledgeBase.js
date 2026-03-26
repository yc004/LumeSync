// ========================================================
// 萤火课件编辑器 - 知识库管理组件 (重新设计版)
// ========================================================

const KnowledgeBase = () => {
    const { useState, useEffect, useRef } = React;
    const [show, setShow] = useState(false);
    const [knowledgeItems, setKnowledgeItems] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [editingItem, setEditingItem] = useState(null);
    const [formData, setFormData] = useState({ title: '', category: '', content: '', tags: '' });
    const [filteredItems, setFilteredItems] = useState([]);
    const [selectedCategories, setSelectedCategories] = useState([]);
    const [showUploadPanel, setShowUploadPanel] = useState(false);
    const [viewingItem, setViewingItem] = useState(null);
    const [selectedItems, setSelectedItems] = useState(new Set());
    const [batchMode, setBatchMode] = useState(false);
    const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
    const [sortBy, setSortBy] = useState('newest'); // 'newest' | 'oldest' | 'title' | 'category'
    const [showStats, setShowStats] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef(null);
    const [activeTab, setActiveTab] = useState('all'); // 'all' | 'builtin' | 'custom'

    // 切换批量模式
    const toggleBatchMode = () => {
        setBatchMode(prev => {
            const newMode = !prev;
            if (!newMode) {
                setSelectedItems(new Set());
            }
            return newMode;
        });
    };

    // 从内置知识库加载（已废弃，现在从数据库统一加载）
    const loadBuiltinKnowledge = () => {
        const knowledge = window.builtinKnowledgeBase || [];
        console.log('[KnowledgeBase] 内置知识已加载（旧方式）:', knowledge.length, '条');
        return knowledge;
    };

    // 从向量数据库加载所有知识（包括内置知识和用户知识）
    const loadKnowledge = async () => {
        try {
            let allData = [];
            if (window.electronAPI?.knowledgeDocuments) {
                const result = await window.electronAPI.knowledgeDocuments({ limit: 1000 });
                if (result.success) {
                    allData = result.documents || [];
                    const builtinCount = allData.filter(d => d.isBuiltin).length;
                    const customCount = allData.filter(d => !d.isBuiltin).length;
                    console.log(`[KnowledgeBase] 知识库已加载: 总计 ${allData.length} 条 (内置 ${builtinCount} 条, 自定义 ${customCount} 条)`);
                }
            } else {
                // 降级到旧的加载方式
                const builtinData = loadBuiltinKnowledge();
                console.warn('[KnowledgeBase] Electron API 不可用，使用旧方式加载内置知识');
                setKnowledgeItems(builtinData);
                return;
            }

            setKnowledgeItems(allData);
        } catch (error) {
            console.error('[KnowledgeBase] 加载知识库失败:', error);
            const builtinData = loadBuiltinKnowledge();
            setKnowledgeItems(builtinData);
        }
    };

    useEffect(() => {
        loadKnowledge();
    }, []);

    // 排序和过滤知识项
    useEffect(() => {
        let filtered = [...knowledgeItems];

        // 标签过滤
        if (activeTab === 'builtin') {
            filtered = filtered.filter(item => item.isBuiltin);
        } else if (activeTab === 'custom') {
            filtered = filtered.filter(item => !item.isBuiltin);
        }

        // 搜索过滤
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(item => {
                const text = `${item.title} ${(item.tags || []).join(' ')} ${item.content} ${item.category}`.toLowerCase();
                return text.includes(query);
            });
        }

        // 分类过滤
        if (selectedCategories.length > 0) {
            filtered = filtered.filter(item =>
                selectedCategories.includes(item.category)
            );
        }

        // 排序
        filtered.sort((a, b) => {
            switch (sortBy) {
                case 'newest':
                    return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
                case 'oldest':
                    return (a.updatedAt || a.createdAt || 0) - (b.updatedAt || b.createdAt || 0);
                case 'title':
                    return a.title.localeCompare(b.title);
                case 'category':
                    return (a.category || '').localeCompare(b.category || '');
                default:
                    return 0;
            }
        });

        setFilteredItems(filtered);
    }, [searchQuery, selectedCategories, knowledgeItems, sortBy, activeTab]);

    // 获取所有分类
    const categories = [...new Set(knowledgeItems.map(item => item.category))].filter(Boolean);

    // 打开编辑器
    const openEditor = (item = null) => {
        if (item && item.isBuiltin) {
            alert('内置知识由系统管理，不允许修改。如需自定义知识，请点击"添加知识"按钮。');
            return;
        }

        if (item) {
            setEditingItem(item);
            setFormData({
                title: item.title,
                category: item.category,
                content: item.content,
                tags: (item.tags || []).join(', ')
            });
        } else {
            setEditingItem(null);
            setFormData({ title: '', category: '', content: '', tags: '' });
        }
    };

    // 保存知识项
    const handleSave = async () => {
        if (!formData.title.trim() || !formData.content.trim()) {
            alert('请填写标题和内容');
            return;
        }

        try {
            const tags = formData.tags.split(',').map(t => t.trim()).filter(t => t);
            
            if (editingItem) {
                const result = await window.electronAPI.knowledgeUpdate({
                    id: editingItem.id,
                    title: formData.title.trim(),
                    content: formData.content.trim(),
                    category: formData.category.trim() || '未分类',
                    tags,
                    metadata: { updatedAt: new Date().toISOString() }
                });
                if (!result.success) throw new Error(result.error);
            } else {
                const result = await window.electronAPI.knowledgeAdd({
                    title: formData.title.trim(),
                    content: formData.content.trim(),
                    category: formData.category.trim() || '未分类',
                    tags,
                    metadata: { source: 'manual' }
                });
                if (!result.success) throw new Error(result.error);
            }

            await loadKnowledge();
            setEditingItem(null);
            setFormData({ title: '', category: '', content: '', tags: '' });
        } catch (error) {
            alert('保存失败: ' + error.message);
        }
    };

    // 删除知识项
    const handleDelete = async (id) => {
        const item = knowledgeItems.find(item => item.id === id);
        if (item && item.isBuiltin) {
            alert('内置知识由系统管理，不允许删除。');
            return;
        }

        if (!confirm('确定要删除这条知识吗？')) return;

        try {
            const result = await window.electronAPI.knowledgeDelete({ id });
            if (!result.success) throw new Error(result.error);
            await loadKnowledge();
        } catch (error) {
            alert('删除失败: ' + error.message);
        }
    };

    // 批量删除
    const handleBatchDelete = async () => {
        if (selectedItems.size === 0) {
            alert('请先选择要删除的知识项');
            return;
        }

        if (!confirm(`确定要删除选中的 ${selectedItems.size} 条知识吗？`)) return;

        try {
            for (const id of selectedItems) {
                await window.electronAPI.knowledgeDelete({ id });
            }
            await loadKnowledge();
            setSelectedItems(new Set());
            setBatchMode(false);
        } catch (error) {
            alert('删除失败: ' + error.message);
        }
    };

    // 文件上传
    const handleFileUpload = async (event) => {
        const files = Array.from(event.target.files);
        if (!files.length) return;

        for (const file of files) {
            if (file.size > 10 * 1024 * 1024) {
                alert(`文件 ${file.name} 过大，请上传小于 10MB 的文件`);
                return;
            }
        }

        const validExtensions = ['.txt', '.md', '.markdown', '.json', '.js', '.ts', '.jsx', '.tsx'];
        for (const file of files) {
            const extension = '.' + file.name.split('.').pop().toLowerCase();
            if (!validExtensions.includes(extension)) {
                alert(`文件 ${file.name} 格式不支持`);
                return;
            }
        }

        setUploading(true);

        try {
            let ProcessorClass = window.KnowledgeProcessor;
            if (!ProcessorClass) {
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'knowledge/processor.js';
                    script.onload = resolve;
                    script.onerror = reject;
                    document.head.appendChild(script);
                });
                ProcessorClass = window.KnowledgeProcessor;
            }

            const processor = new ProcessorClass();
            const result = await processor.processMultipleFiles(files, {
                chunkSize: 800,
                chunkOverlap: 100,
                defaultCategory: '自定义',
                defaultTags: []
            });

            if (result.errors.length > 0) {
                const errorMessages = result.errors.map(e => `- ${e.file}: ${e.error}`).join('\n');
                alert(`部分文件处理失败：\n${errorMessages}`);
            }

            if (result.chunks.length === 0) {
                throw new Error('没有成功的知识块');
            }

            const addResult = await window.electronAPI.knowledgeBatchAdd({
                documents: result.chunks.map(chunk => ({
                    title: chunk.title,
                    content: chunk.content,
                    category: chunk.category || '自定义',
                    tags: chunk.tags || [],
                    metadata: {
                        source: 'file',
                        fileName: chunk.fileName
                    }
                }))
            });

            if (addResult.success) {
                await loadKnowledge();
                alert(`成功导入 ${addResult.total} 个知识块${result.errors.length > 0 ? `（${result.errors.length} 个文件失败）` : ''}`);
            } else {
                throw new Error(addResult.error);
            }
        } catch (error) {
            console.error('文件处理失败: ' + error.message);
        } finally {
            if (event.target) event.target.value = '';
        }
    };

    // 格式化时间
    const formatDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // 获取分类对应的颜色
    const getCategoryColor = (category) => {
        const colors = {
            '系统API': 'bg-blue-600/20 text-blue-400',
            '交互组件': 'bg-green-600/20 text-green-400',
            '教学策略': 'bg-purple-600/20 text-purple-400',
            '动画效果': 'bg-pink-600/20 text-pink-400',
            '样式设计': 'bg-yellow-600/20 text-yellow-400',
            '状态管理': 'bg-orange-600/20 text-orange-400',
            '多媒体': 'bg-cyan-600/20 text-cyan-400',
            '最佳实践': 'bg-indigo-600/20 text-indigo-400',
            '未分类': 'bg-slate-600/20 text-slate-400',
        };
        return colors[category] || 'bg-slate-600/20 text-slate-300';
    };

    const builtinCount = knowledgeItems.filter(i => i.isBuiltin).length;
    const customCount = knowledgeItems.filter(i => !i.isBuiltin).length;

    return (
        <>
            {/* 触发按钮 */}
            <button
                onClick={() => setShow(true)}
                className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-500 hover:to-blue-500 transition-all shadow-lg hover:shadow-xl text-sm font-bold"
                title="知识库"
            >
                <i className="fas fa-brain"></i>
                <span>知识库</span>
                {knowledgeItems.length > 0 && (
                    <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full">
                        {knowledgeItems.length}
                    </span>
                )}
            </button>

            {/* 知识库主面板 */}
            {show && (
                <div className="fixed inset-0 z-50 bg-slate-900/95 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-slate-800 rounded-3xl w-[1400px] h-[800px] flex flex-col border border-slate-700 shadow-2xl overflow-hidden">
                        {/* 标题栏 */}
                        <div className="flex items-center justify-between p-5 border-b border-slate-700 bg-gradient-to-r from-slate-800 to-slate-850">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg">
                                    <i className="fas fa-brain text-white text-xl"></i>
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-white">AI 知识库</h2>
                                    <p className="text-slate-400 text-sm">管理您的课件知识和教学资源</p>
                                </div>
                                <div className="flex gap-2 ml-4">
                                    <div className="px-3 py-1 bg-purple-600/20 text-purple-400 rounded-full text-xs font-bold">
                                        内置: {builtinCount}
                                    </div>
                                    <div className="px-3 py-1 bg-green-600/20 text-green-400 rounded-full text-xs font-bold">
                                        自定义: {customCount}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setShowStats(true)}
                                    className="p-2 rounded-lg bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-white transition-colors"
                                    title="统计信息"
                                >
                                    <i className="fas fa-chart-pie"></i>
                                </button>
                                <button
                                    onClick={() => setShow(false)}
                                    className="p-2 rounded-lg bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-white transition-colors"
                                >
                                    <i className="fas fa-times text-xl"></i>
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-1 overflow-hidden">
                            {/* 左侧边栏 */}
                            <div className="w-72 p-5 border-r border-slate-700 bg-slate-850 overflow-y-auto">
                                {/* 搜索框 */}
                                <div className="mb-5">
                                    <label className="text-xs font-bold text-slate-400 mb-2 block uppercase tracking-wider">搜索</label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder="搜索知识..."
                                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 pl-10 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
                                        />
                                        <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"></i>
                                    </div>
                                </div>

                                {/* 标签页 */}
                                <div className="mb-5">
                                    <label className="text-xs font-bold text-slate-400 mb-2 block uppercase tracking-wider">知识类型</label>
                                    <div className="flex bg-slate-900 rounded-xl p-1">
                                        <button
                                            onClick={() => setActiveTab('all')}
                                            className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                                                activeTab === 'all'
                                                    ? 'bg-purple-600 text-white'
                                                    : 'text-slate-400 hover:text-white'
                                            }`}
                                        >
                                            全部
                                        </button>
                                        <button
                                            onClick={() => setActiveTab('builtin')}
                                            className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                                                activeTab === 'builtin'
                                                    ? 'bg-amber-600 text-white'
                                                    : 'text-slate-400 hover:text-white'
                                            }`}
                                        >
                                            内置
                                        </button>
                                        <button
                                            onClick={() => setActiveTab('custom')}
                                            className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                                                activeTab === 'custom'
                                                    ? 'bg-green-600 text-white'
                                                    : 'text-slate-400 hover:text-white'
                                            }`}
                                        >
                                            自定义
                                        </button>
                                    </div>
                                </div>

                                {/* 分类筛选 */}
                                {categories.length > 0 && (
                                    <div className="mb-5">
                                        <label className="text-xs font-bold text-slate-400 mb-2 block uppercase tracking-wider">分类筛选</label>
                                        <div className="space-y-1 max-h-48 overflow-y-auto">
                                            {categories.map(category => {
                                                const count = knowledgeItems.filter(i => i.category === category).length;
                                                return (
                                                    <label
                                                        key={category}
                                                        className="flex items-center gap-2 cursor-pointer group p-2 rounded-lg hover:bg-slate-700/50 transition-colors"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedCategories.includes(category)}
                                                            onChange={() => setSelectedCategories(prev =>
                                                                prev.includes(category)
                                                                    ? prev.filter(c => c !== category)
                                                                    : [...prev, category]
                                                            )}
                                                            className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-purple-500 focus:ring-purple-500"
                                                        />
                                                        <span className={`text-sm font-medium ${getCategoryColor(category)}`}>
                                                            {category}
                                                        </span>
                                                        <span className="text-xs text-slate-500 ml-auto">
                                                            {count}
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* 排序选项 */}
                                <div className="mb-5">
                                    <label className="text-xs font-bold text-slate-400 mb-2 block uppercase tracking-wider">排序方式</label>
                                    <select
                                        value={sortBy}
                                        onChange={(e) => setSortBy(e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                                    >
                                        <option value="newest">最新优先</option>
                                        <option value="oldest">最早优先</option>
                                        <option value="title">标题排序</option>
                                        <option value="category">分类排序</option>
                                    </select>
                                </div>

                                {/* 视图切换 */}
                                <div className="mb-5">
                                    <label className="text-xs font-bold text-slate-400 mb-2 block uppercase tracking-wider">视图模式</label>
                                    <div className="flex bg-slate-900 rounded-xl p-1">
                                        <button
                                            onClick={() => setViewMode('grid')}
                                            className={`flex-1 px-3 py-2 rounded-lg text-sm transition-all ${
                                                viewMode === 'grid'
                                                    ? 'bg-purple-600 text-white'
                                                    : 'text-slate-400 hover:text-white'
                                            }`}
                                        >
                                            <i className="fas fa-th-large"></i>
                                        </button>
                                        <button
                                            onClick={() => setViewMode('list')}
                                            className={`flex-1 px-3 py-2 rounded-lg text-sm transition-all ${
                                                viewMode === 'list'
                                                    ? 'bg-purple-600 text-white'
                                                    : 'text-slate-400 hover:text-white'
                                            }`}
                                        >
                                            <i className="fas fa-list"></i>
                                        </button>
                                    </div>
                                </div>

                                {/* 操作按钮 */}
                                <div className="space-y-2">
                                    <button
                                        onClick={() => setShowUploadPanel(true)}
                                        className="w-full px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-xl transition-all font-bold flex items-center justify-center gap-2 shadow-lg"
                                    >
                                        <i className="fas fa-upload"></i>
                                        上传文件
                                    </button>
                                    <button
                                        onClick={() => openEditor()}
                                        className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl transition-all font-bold flex items-center justify-center gap-2 shadow-lg"
                                    >
                                        <i className="fas fa-plus"></i>
                                        添加知识
                                    </button>
                                    <button
                                        onClick={toggleBatchMode}
                                        className={`w-full px-4 py-3 transition-all font-bold flex items-center justify-center gap-2 rounded-xl ${
                                            batchMode
                                                ? 'bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white shadow-lg'
                                                : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                                        }`}
                                    >
                                        <i className="fas fa-tasks"></i>
                                        {batchMode ? '退出批量模式' : '批量管理'}
                                    </button>
                                    {batchMode && (
                                        <div className="space-y-2 pt-2 border-t border-slate-700">
                                            <button
                                                onClick={() => setSelectedItems(new Set(filteredItems.filter(i => !i.isBuiltin).map(i => i.id)))}
                                                className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors text-sm"
                                            >
                                                全选 ({filteredItems.filter(i => !i.isBuiltin).length})
                                            </button>
                                            <button
                                                onClick={() => setSelectedItems(new Set())}
                                                className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors text-sm"
                                            >
                                                取消选择
                                            </button>
                                            <button
                                                onClick={handleBatchDelete}
                                                disabled={selectedItems.size === 0}
                                                className="w-full px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm font-bold"
                                            >
                                                删除选中 ({selectedItems.size})
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 右侧内容区 */}
                            <div className="flex-1 flex flex-col overflow-hidden bg-slate-900">
                                {filteredItems.length === 0 ? (
                                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                                        <div className="w-24 h-24 rounded-full bg-slate-800 flex items-center justify-center mb-4">
                                            <i className="fas fa-folder-open text-4xl"></i>
                                        </div>
                                        <p className="text-lg font-medium mb-2">暂无知识</p>
                                        <p className="text-sm text-slate-500 mb-4">添加您的第一条知识，或上传文件自动导入</p>
                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => openEditor()}
                                                className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-bold"
                                            >
                                                <i className="fas fa-plus mr-2"></i>添加知识
                                            </button>
                                            <button
                                                onClick={() => setShowUploadPanel(true)}
                                                className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors font-bold"
                                            >
                                                <i className="fas fa-upload mr-2"></i>上传文件
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex-1 overflow-y-auto p-5">
                                        {viewMode === 'grid' ? (
                                            <div className="grid grid-cols-2 gap-4">
                                                {filteredItems.map(item => (
                                                    <div
                                                        key={item.id}
                                                        className={`bg-slate-800 rounded-2xl p-5 border-2 transition-all hover:shadow-xl ${
                                                            batchMode
                                                                ? selectedItems.has(item.id)
                                                                    ? 'border-orange-500 bg-orange-900/20'
                                                                    : 'border-slate-700'
                                                                : 'border-slate-700 hover:border-purple-500/50 hover:-translate-y-1'
                                                        }`}
                                                    >
                                                        <div className="flex items-start justify-between gap-3 mb-3">
                                                            <div className="flex items-center gap-2">
                                                                {batchMode && !item.isBuiltin && (
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={selectedItems.has(item.id)}
                                                                        onChange={() => {
                                                                            const newSet = new Set(selectedItems);
                                                                            if (newSet.has(item.id)) {
                                                                                newSet.delete(item.id);
                                                                            } else {
                                                                                newSet.add(item.id);
                                                                            }
                                                                            setSelectedItems(newSet);
                                                                        }}
                                                                        className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-orange-500 focus:ring-orange-500"
                                                                    />
                                                                )}
                                                                {item.isBuiltin && (
                                                                    <span className="px-2 py-0.5 bg-amber-600/20 text-amber-400 text-xs rounded-full font-bold">
                                                                        内置
                                                                    </span>
                                                                )}
                                                                {item.source === 'file' && (
                                                                    <span className="px-2 py-0.5 bg-green-600/20 text-green-400 text-xs rounded-full">
                                                                        文件
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <h3 className="font-bold text-white text-lg mb-2 hover:text-purple-400 transition-colors cursor-pointer" onClick={() => setViewingItem(item)}>
                                                            {item.title}
                                                        </h3>
                                                        {item.category && (
                                                            <span className={`inline-block px-2 py-1 rounded-full text-xs font-bold mb-2 ${getCategoryColor(item.category)}`}>
                                                                {item.category}
                                                            </span>
                                                        )}
                                                        <p className="text-sm text-slate-400 line-clamp-3 mb-3 whitespace-pre-wrap">
                                                            {item.content}
                                                        </p>
                                                        <div className="flex items-center justify-between">
                                                            <p className="text-xs text-slate-500">
                                                                {item.updatedAt && formatDate(item.updatedAt)}
                                                            </p>
                                                            {!item.isBuiltin && !batchMode && (
                                                                <div className="flex gap-1">
                                                                    <button
                                                                        onClick={() => openEditor(item)}
                                                                        className="p-2 rounded-lg bg-slate-700 text-slate-400 hover:bg-blue-600 hover:text-white transition-colors"
                                                                        title="编辑"
                                                                    >
                                                                        <i className="fas fa-edit text-xs"></i>
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDelete(item.id)}
                                                                        className="p-2 rounded-lg bg-slate-700 text-slate-400 hover:bg-red-600 hover:text-white transition-colors"
                                                                        title="删除"
                                                                    >
                                                                        <i className="fas fa-trash text-xs"></i>
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {filteredItems.map(item => (
                                                    <div
                                                        key={item.id}
                                                        className={`bg-slate-800 rounded-xl p-4 border-2 transition-all ${
                                                            batchMode
                                                                ? selectedItems.has(item.id)
                                                                    ? 'border-orange-500 bg-orange-900/20'
                                                                    : 'border-slate-700'
                                                                : 'border-slate-700 hover:border-purple-500/50'
                                                        }`}
                                                    >
                                                        <div className="flex items-start justify-between gap-4">
                                                            <div className="flex-1 cursor-pointer" onClick={() => setViewingItem(item)}>
                                                                <div className="flex items-center gap-2 mb-2">
                                                                    {batchMode && !item.isBuiltin && (
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={selectedItems.has(item.id)}
                                                                            onChange={() => {
                                                                                const newSet = new Set(selectedItems);
                                                                                if (newSet.has(item.id)) {
                                                                                    newSet.delete(item.id);
                                                                                } else {
                                                                                    newSet.add(item.id);
                                                                                }
                                                                                setSelectedItems(newSet);
                                                                            }}
                                                                            className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-orange-500 focus:ring-orange-500"
                                                                        />
                                                                    )}
                                                                    <h3 className="font-bold text-white hover:text-purple-400 transition-colors">
                                                                        {item.title}
                                                                    </h3>
                                                                    {item.isBuiltin && (
                                                                        <span className="px-2 py-0.5 bg-amber-600/20 text-amber-400 text-xs rounded-full font-bold">
                                                                            内置
                                                                        </span>
                                                                    )}
                                                                    {item.source === 'file' && (
                                                                        <span className="px-2 py-0.5 bg-green-600/20 text-green-400 text-xs rounded-full">
                                                                            文件
                                                                        </span>
                                                                    )}
                                                                    {item.category && (
                                                                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getCategoryColor(item.category)}`}>
                                                                            {item.category}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className="text-sm text-slate-400 line-clamp-2 whitespace-pre-wrap">
                                                                    {item.content}
                                                                </p>
                                                                <div className="flex items-center gap-3 mt-2">
                                                                    <p className="text-xs text-slate-500">
                                                                        <i className="fas fa-clock mr-1"></i>
                                                                        {item.updatedAt && formatDate(item.updatedAt)}
                                                                    </p>
                                                                    {item.fileName && (
                                                                        <p className="text-xs text-green-400">
                                                                            <i className="fas fa-file-alt mr-1"></i>
                                                                            {item.fileName}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            {!item.isBuiltin && !batchMode && (
                                                                <div className="flex gap-1">
                                                                    <button
                                                                        onClick={() => openEditor(item)}
                                                                        className="p-2 rounded-lg bg-slate-700 text-slate-400 hover:bg-blue-600 hover:text-white transition-colors"
                                                                        title="编辑"
                                                                    >
                                                                        <i className="fas fa-edit text-xs"></i>
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDelete(item.id)}
                                                                        className="p-2 rounded-lg bg-slate-700 text-slate-400 hover:bg-red-600 hover:text-white transition-colors"
                                                                        title="删除"
                                                                    >
                                                                        <i className="fas fa-trash text-xs"></i>
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 统计信息面板 */}
                    {showStats && (
                        <div className="fixed inset-0 z-[60] bg-slate-900/80 flex items-center justify-center p-4">
                            <div className="bg-slate-800 rounded-2xl w-full max-w-lg border border-slate-600 shadow-2xl">
                                <div className="flex items-center justify-between p-5 border-b border-slate-700">
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <i className="fas fa-chart-pie text-purple-400"></i>
                                        知识库统计
                                    </h3>
                                    <button
                                        onClick={() => setShowStats(false)}
                                        className="p-2 rounded-full bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-white transition-colors"
                                    >
                                        <i className="fas fa-times"></i>
                                    </button>
                                </div>
                                <div className="p-5 space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-slate-900 rounded-xl p-4 text-center">
                                            <div className="text-3xl font-bold text-purple-400 mb-1">{knowledgeItems.length}</div>
                                            <div className="text-xs text-slate-400">总知识数</div>
                                        </div>
                                        <div className="bg-slate-900 rounded-xl p-4 text-center">
                                            <div className="text-3xl font-bold text-amber-400 mb-1">{builtinCount}</div>
                                            <div className="text-xs text-slate-400">内置知识</div>
                                        </div>
                                        <div className="bg-slate-900 rounded-xl p-4 text-center">
                                            <div className="text-3xl font-bold text-green-400 mb-1">{customCount}</div>
                                            <div className="text-xs text-slate-400">自定义知识</div>
                                        </div>
                                        <div className="bg-slate-900 rounded-xl p-4 text-center">
                                            <div className="text-3xl font-bold text-blue-400 mb-1">{categories.length}</div>
                                            <div className="text-xs text-slate-400">分类数</div>
                                        </div>
                                    </div>
                                    <div className="bg-slate-900 rounded-xl p-4">
                                        <h4 className="text-sm font-bold text-slate-300 mb-3">分类分布</h4>
                                        <div className="space-y-2">
                                            {categories.map(cat => {
                                                const count = knowledgeItems.filter(i => i.category === cat).length;
                                                const percentage = (count / knowledgeItems.length * 100).toFixed(1);
                                                return (
                                                    <div key={cat} className="flex items-center gap-3">
                                                        <span className="text-xs text-slate-400 w-24 truncate">{cat}</span>
                                                        <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                                                            <div
                                                                className="h-full bg-gradient-to-r from-purple-500 to-blue-500"
                                                                style={{ width: `${percentage}%` }}
                                                            ></div>
                                                        </div>
                                                        <span className="text-xs text-slate-300 w-16 text-right">{count} ({percentage}%)</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 查看完整内容模态框 */}
                    {viewingItem && (
                        <div className="fixed inset-0 z-[65] bg-slate-900/80 flex items-center justify-center p-4">
                            <div className="bg-slate-800 rounded-2xl w-full max-w-4xl max-h-[85vh] border border-slate-600 shadow-2xl flex flex-col">
                                <div className="flex items-center justify-between p-5 border-b border-slate-700">
                                    <div className="flex items-center gap-3 flex-1">
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                                            <i className="fas fa-book-open text-white text-lg"></i>
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="text-lg font-bold text-white">{viewingItem.title}</h3>
                                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                {viewingItem.isBuiltin && (
                                                    <span className="px-2 py-0.5 bg-amber-600/20 text-amber-400 text-xs rounded-full font-bold">
                                                        内置
                                                    </span>
                                                )}
                                                {viewingItem.source === 'file' && (
                                                    <span className="px-2 py-0.5 bg-green-600/20 text-green-400 text-xs rounded-full">
                                                        文件
                                                    </span>
                                                )}
                                                {viewingItem.category && (
                                                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getCategoryColor(viewingItem.category)}`}>
                                                        {viewingItem.category}
                                                    </span>
                                                )}
                                                {viewingItem.updatedAt && (
                                                    <span className="text-xs text-slate-500">
                                                        {formatDate(viewingItem.updatedAt)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setViewingItem(null)}
                                        className="p-2 rounded-full bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-white transition-colors"
                                    >
                                        <i className="fas fa-times"></i>
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto p-6">
                                    <div className="prose prose-invert prose-slate max-w-none prose-sm">
                                        {window.marked ? (
                                            <div
                                                className="markdown-content"
                                                dangerouslySetInnerHTML={{
                                                    __html: window.marked.parse(viewingItem.content || '')
                                                }}
                                            />
                                        ) : (
                                            <pre className="whitespace-pre-wrap text-slate-300 text-sm leading-relaxed bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                                                {viewingItem.content}
                                            </pre>
                                        )}
                                    </div>
                                </div>

                                <div className="flex justify-end gap-3 p-5 border-t border-slate-700">
                                    {!viewingItem.isBuiltin && (
                                        <button
                                            onClick={() => {
                                                setViewingItem(null);
                                                openEditor(viewingItem);
                                            }}
                                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors text-sm font-bold flex items-center gap-2"
                                        >
                                            <i className="fas fa-edit"></i>
                                            编辑
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setViewingItem(null)}
                                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors text-sm font-bold"
                                    >
                                        关闭
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 编辑/新建模态框 */}
                    {editingItem !== null && (
                        <div className="fixed inset-0 z-[60] bg-slate-900/80 flex items-center justify-center p-4">
                            <div className="bg-slate-800 rounded-2xl w-full max-w-2xl border border-slate-600 shadow-2xl">
                                <div className="flex items-center justify-between p-5 border-b border-slate-700">
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <i className={`fas ${editingItem ? 'fa-edit text-blue-400' : 'fa-plus text-green-400'}`}></i>
                                        {editingItem ? '编辑知识' : '添加知识'}
                                    </h3>
                                    <button
                                        onClick={() => setEditingItem(null)}
                                        className="p-2 rounded-full bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-white transition-colors"
                                    >
                                        <i className="fas fa-times"></i>
                                    </button>
                                </div>

                                <div className="p-5 space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">标题 *</label>
                                        <input
                                            type="text"
                                            value={formData.title}
                                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                            placeholder="输入知识标题"
                                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">分类</label>
                                        <input
                                            type="text"
                                            value={formData.category}
                                            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                            placeholder="例如：教学技巧、课程设计、技术要点..."
                                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
                                            list="category-suggestions"
                                        />
                                        <datalist id="category-suggestions">
                                            {categories.map(cat => (
                                                <option key={cat} value={cat} />
                                            ))}
                                        </datalist>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">标签 (用逗号分隔)</label>
                                        <input
                                            type="text"
                                            value={formData.tags}
                                            onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                                            placeholder="例如：交互, 动画, 组件"
                                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">内容 *</label>
                                        <textarea
                                            value={formData.content}
                                            onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                                            placeholder="输入知识内容，支持 Markdown 格式..."
                                            rows={10}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500 resize-none show-scrollbar font-mono"
                                        />
                                    </div>
                                </div>

                                <div className="flex justify-end gap-3 p-5 border-t border-slate-700">
                                    <button
                                        onClick={() => setEditingItem(null)}
                                        className="px-5 py-2.5 bg-slate-700 text-white rounded-xl hover:bg-slate-600 transition-colors text-sm font-bold"
                                    >
                                        取消
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-xl transition-all text-sm font-bold"
                                    >
                                        <i className="fas fa-save mr-2"></i>
                                        保存
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 文件上传面板 */}
                    {showUploadPanel && (
                        <div className="fixed inset-0 z-[70] bg-slate-900/80 flex items-center justify-center p-4">
                            <div className="bg-slate-800 rounded-2xl w-full max-w-lg border border-slate-600 shadow-2xl">
                                <div className="flex items-center justify-between p-5 border-b border-slate-700">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                                            <i className="fas fa-upload text-white"></i>
                                        </div>
                                        <h2 className="text-lg font-bold text-white">上传文件</h2>
                                    </div>
                                    <button
                                        onClick={() => setShowUploadPanel(false)}
                                        className="p-2 rounded-full bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-white transition-colors"
                                    >
                                        <i className="fas fa-times"></i>
                                    </button>
                                </div>

                                <div className="p-5">
                                    <div className="border-2 border-dashed border-slate-600 rounded-2xl p-10 text-center hover:border-green-500 transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            multiple
                                            accept=".txt,.md,.markdown,.json,.js,.ts,.jsx,.tsx"
                                            onChange={handleFileUpload}
                                            className="hidden"
                                        />
                                        <div className="flex flex-col items-center gap-4">
                                            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center shadow-lg">
                                                <i className="fas fa-cloud-upload-alt text-4xl text-green-400"></i>
                                            </div>
                                            <div>
                                                <h3 className="text-white font-bold mb-2 text-lg">点击或拖拽文件到此处</h3>
                                                <p className="text-slate-400 text-sm">支持 TXT、Markdown、JSON、JS、TS 等格式</p>
                                                <p className="text-slate-500 text-xs mt-1">最大 10MB，支持多文件上传</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-5 p-4 bg-slate-900 rounded-xl space-y-3">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">支持的文件格式</h4>
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2 text-xs text-slate-300">
                                                <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                                                <span><strong>JSON：</strong>自动解析为知识条目或知识条目数组</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-slate-300">
                                                <span className="w-2 h-2 bg-purple-400 rounded-full"></span>
                                                <span><strong>Markdown：</strong>按标题层级自动切分为多个知识块</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-slate-300">
                                                <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                                                <span><strong>TXT：</strong>按段落自动切分为知识块（每块约800字）</span>
                                            </div>
                                        </div>
                                        <div className="mt-3 p-3 bg-gradient-to-r from-purple-600/10 to-blue-600/10 border border-purple-600/30 rounded-xl">
                                            <p className="text-xs text-purple-400">
                                                <i className="fas fa-info-circle mr-2"></i>
                                                自动切分：长文档会按段落和句子边界自动分割为多个知识块，便于检索
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </>
    );
};

window.KnowledgeBase = KnowledgeBase;
