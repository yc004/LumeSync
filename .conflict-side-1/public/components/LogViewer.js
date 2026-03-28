const React = window.React;
const { useState, useEffect } = React;

// 日志查看器组件
function LogViewer({ visible, onClose, onOpenLogDir }) {
    const [logs, setLogs] = useState([]);
    const [filter, setFilter] = useState('ALL');
    const [search, setSearch] = useState('');
    const [autoScroll, setAutoScroll] = useState(true);

    // 从渲染进程读取日志（需要通过 IPC 调用主进程）
    const loadLogs = async () => {
        try {
            // 这里只是示例，实际需要通过 IPC 从主进程读取日志文件
            // 暂时显示模拟数据
            const sampleLogs = [
                { timestamp: new Date().toISOString(), level: 'INFO', category: 'APP', message: 'Application started' },
                { timestamp: new Date().toISOString(), level: 'INFO', category: 'SERVER', message: 'Server started on port 3000' },
            ];
            setLogs(sampleLogs);
        } catch (err) {
            console.error('Failed to load logs:', err);
        }
    };

    useEffect(() => {
        if (visible) {
            loadLogs();
            // 可以设置定时器自动刷新日志
            const timer = setInterval(loadLogs, 2000);
            return () => clearInterval(timer);
        }
    }, [visible]);

    const filteredLogs = logs.filter(log => {
        const matchesFilter = filter === 'ALL' || log.level === filter;
        const matchesSearch = !search ||
            log.message.toLowerCase().includes(search.toLowerCase()) ||
            log.category.toLowerCase().includes(search.toLowerCase());
        return matchesFilter && matchesSearch;
    });

    const getLevelColor = (level) => {
        switch (level) {
            case 'ERROR': return 'text-red-600 bg-red-50';
            case 'WARN': return 'text-orange-600 bg-orange-50';
            case 'DEBUG': return 'text-slate-500 bg-slate-50';
            default: return 'text-blue-600 bg-blue-50';
        }
    };

    const getLevelIcon = (level) => {
        switch (level) {
            case 'ERROR': return 'fa-times-circle';
            case 'WARN': return 'fa-exclamation-triangle';
            case 'DEBUG': return 'fa-bug';
            default: return 'fa-info-circle';
        }
    };

    if (!visible) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[80vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-200">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <i className="fas fa-file-alt text-blue-500"></i>
                        系统日志
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 text-2xl"
                    >
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                {/* Toolbar */}
                <div className="flex items-center gap-3 p-4 border-b border-slate-200 bg-slate-50">
                    <div className="flex items-center gap-2">
                        <select
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        >
                            <option value="ALL">全部级别</option>
                            <option value="ERROR">错误</option>
                            <option value="WARN">警告</option>
                            <option value="INFO">信息</option>
                            <option value="DEBUG">调试</option>
                        </select>
                    </div>

                    <div className="flex-1 relative">
                        <input
                            type="text"
                            placeholder="搜索日志..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full px-3 py-2 pl-10 border border-slate-300 rounded-lg text-sm"
                        />
                        <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
                    </div>

                    <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={autoScroll}
                            onChange={(e) => setAutoScroll(e.target.checked)}
                            className="rounded"
                        />
                        自动滚动
                    </label>

                    <button
                        onClick={loadLogs}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 flex items-center gap-2"
                    >
                        <i className="fas fa-sync-alt"></i>
                        刷新
                    </button>

                    <button
                        onClick={onOpenLogDir}
                        className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 flex items-center gap-2"
                    >
                        <i className="fas fa-folder-open"></i>
                        打开目录
                    </button>
                </div>

                {/* Log Content */}
                <div className="flex-1 overflow-auto p-4 bg-slate-900 font-mono text-sm">
                    {filteredLogs.length === 0 ? (
                        <div className="text-center text-slate-500 py-12">
                            <i className="fas fa-inbox text-4xl mb-4"></i>
                            <p>暂无日志</p>
                        </div>
                    ) : (
                        filteredLogs.map((log, index) => (
                            <div
                                key={index}
                                className={`py-2 px-3 mb-1 rounded font-mono ${getLevelColor(log.level)}`}
                                style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                            >
                                <span className="opacity-70">
                                    [{log.timestamp}] [{log.level}] [{log.category}]
                                </span>
                                <span className="ml-2">
                                    {log.message}
                                </span>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between p-3 border-t border-slate-200 bg-slate-50 text-sm text-slate-600">
                    <span>共 {filteredLogs.length} 条日志</span>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700"
                    >
                        关闭
                    </button>
                </div>
            </div>
        </div>
    );
}
