// ========================================================
// 学生提交文件浏览组件
// ========================================================

function SubmissionsBrowser({ courses, selectedCourseId: initialCourseId, onClose, socket }) {
    const [selectedCourseId, setSelectedCourseId] = useState(initialCourseId || null);
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [previewContent, setPreviewContent] = useState(null);

    // 获取课程列表（扁平化）
    const courseList = Array.isArray(courses) ? courses : (courses?.courses || []);

    // 加载选中课程的提交文件
    useEffect(() => {
        if (selectedCourseId) {
            loadSubmissions();
        } else {
            setFiles([]);
        }
    }, [selectedCourseId]);

    const loadSubmissions = async () => {
        if (!selectedCourseId) return;
        setLoading(true);
        try {
            const response = await fetch(`/api/submissions/${encodeURIComponent(selectedCourseId)}`);
            const data = await response.json();
            if (data.success) {
                setFiles(data.files || []);
            } else {
                setFiles([]);
            }
        } catch (err) {
            console.error('[loadSubmissions] Error:', err);
            setFiles([]);
        } finally {
            setLoading(false);
        }
    };

    const handlePreviewFile = async (file) => {
        try {
            const res = await fetch(`/api/submissions/${encodeURIComponent(selectedCourseId)}/file/${encodeURIComponent(file.name)}`);
            if (res.ok) {
                const text = await res.text();
                setPreviewContent(text);
                setSelectedFile(file);
            } else {
                alert('预览失败');
            }
        } catch (err) {
            console.error('[previewFile] Error:', err);
            alert('预览失败');
        }
    };

    const handleDownloadFile = async (file) => {
        try {
            const res = await fetch(`/api/submissions/${encodeURIComponent(selectedCourseId)}/file/${encodeURIComponent(file.name)}`);
            if (res.ok) {
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = file.name;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        } catch (err) {
            console.error('[downloadFile] Error:', err);
            alert('下载失败');
        }
    };

    const getFileIcon = (fileName) => {
        const ext = fileName.split('.').pop()?.toLowerCase();
        const icons = {
            'json': { icon: 'fa-file-code', color: 'text-yellow-500', bg: 'bg-yellow-50' },
            'txt': { icon: 'fa-file-lines', color: 'text-blue-500', bg: 'bg-blue-50' },
            'csv': { icon: 'fa-file-csv', color: 'text-green-500', bg: 'bg-green-50' },
            'md': { icon: 'fa-file-lines', color: 'text-purple-500', bg: 'bg-purple-50' },
            'html': { icon: 'fa-file-code', color: 'text-orange-500', bg: 'bg-orange-50' },
            'js': { icon: 'fa-file-code', color: 'text-yellow-400', bg: 'bg-yellow-50' },
            'pdf': { icon: 'fa-file-pdf', color: 'text-red-500', bg: 'bg-red-50' },
        };
        return icons[ext] || { icon: 'fa-file', color: 'text-slate-500', bg: 'bg-slate-50' };
    };

    const renderPreviewContent = () => {
        if (!previewContent || !selectedFile) return null;

        let jsonData = null;
        let isJson = false;
        try {
            jsonData = JSON.parse(previewContent);
            isJson = true;
        } catch {
            // 不是 JSON
        }

        const ext = selectedFile.name.split('.').pop()?.toLowerCase();

        // CSV 文件
        if (ext === 'csv') {
            const lines = previewContent.trim().split('\n');
            const header = lines[0];
            const rows = lines.slice(1);

            return (
                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                            <tr>
                                {header.split(',').map((cell, idx) => (
                                    <th key={idx} className="px-3 py-2 text-left text-xs font-bold text-slate-700 border-r border-slate-200 last:border-r-0 whitespace-nowrap">
                                        {cell.replace(/"/g, '').trim()}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, rowIdx) => {
                                const cells = row.split(',');
                                return (
                                    <tr key={rowIdx} className="border-t border-slate-100 hover:bg-slate-50">
                                        {cells.map((cell, cellIdx) => (
                                            <td key={cellIdx} className="px-3 py-2 text-slate-600 border-r border-slate-200 last:border-r-0 whitespace-nowrap text-xs">
                                                {cell.replace(/"/g, '').trim()}
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            );
        }

        // JSON 文件 - 智能识别格式
        if (isJson && jsonData) {
            if (jsonData.type === 'questionnaire' && jsonData.answers) {
                // 问卷格式
                return (
                    <div className="space-y-4">
                        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-700">问题</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-700">答案</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-700">时间</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {jsonData.answers.map((answer, idx) => (
                                        <tr key={idx} className="border-t border-slate-100">
                                            <td className="px-4 py-3 text-slate-700 font-medium">{answer.question}</td>
                                            <td className="px-4 py-3 text-slate-600">{answer.answer}</td>
                                            <td className="px-4 py-3 text-slate-400 text-xs">{new Date(answer.timestamp).toLocaleString('zh-CN')}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="text-xs text-slate-500">
                            提交时间: {new Date(jsonData.submittedAt).toLocaleString('zh-CN')}
                        </div>
                    </div>
                );
            } else if (jsonData.type === 'quick-note') {
                // 快速留言格式
                return (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <i className="fas fa-comment-dots text-yellow-500 text-2xl"></i>
                            <div>
                                <div className="font-bold text-yellow-800">快速留言</div>
                                <div className="text-xs text-yellow-600">{new Date(jsonData.timestamp).toLocaleString('zh-CN')}</div>
                            </div>
                        </div>
                        <div className="bg-white rounded-lg p-4 text-slate-700">
                            {jsonData.message}
                        </div>
                    </div>
                );
            } else if (jsonData.type === 'form-submission') {
                // 表单提交格式
                return (
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <i className="fas fa-clipboard-list text-purple-500 text-2xl"></i>
                            <div>
                                <div className="font-bold text-purple-800">表单提交</div>
                                <div className="text-xs text-purple-600">{new Date(jsonData.submittedAt).toLocaleString('zh-CN')}</div>
                            </div>
                        </div>
                        {jsonData.csvRow && (
                            <div className="bg-white rounded-lg p-4 text-sm font-mono text-slate-600 whitespace-pre-wrap">
                                {jsonData.csvRow}
                            </div>
                        )}
                    </div>
                );
            }
            // 通用 JSON 格式
            return (
                <pre className="bg-slate-800 text-green-400 p-4 rounded-lg overflow-auto text-xs">
                    {JSON.stringify(jsonData, null, 2)}
                </pre>
            );
        }

        // 普通文本文件
        return (
            <pre className="bg-white border border-slate-200 p-4 rounded-lg overflow-auto text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                {previewContent}
            </pre>
        );
    };

    return (
        <div className="flex flex-col h-screen bg-slate-900 text-white overflow-hidden">
            {/* 顶栏 */}
            <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700 shrink-0">
                <div className="flex items-center space-x-2">
                    <button
                        onClick={onClose}
                        className="flex items-center px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg border border-slate-600 transition-colors text-xs"
                    >
                        <i className="fas fa-arrow-left mr-1.5"></i>返回
                    </button>
                    <div className="h-4 w-px bg-slate-600 mx-2"></div>
                    <i className="fas fa-folder-open text-green-400 text-xl"></i>
                    <h1 className="text-xl font-bold">学生提交文件</h1>
                </div>
                <div className="flex items-center space-x-2">
                    <span className="px-3 py-1.5 bg-green-500/20 text-green-400 rounded-full text-xs font-bold border border-green-500/30">
                        浏览模式
                    </span>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* 左侧课程列表 */}
                <div className="w-64 bg-slate-800/50 border-r border-slate-700 overflow-y-auto shrink-0">
                    <div className="p-3">
                        <div className="text-slate-400 text-xs font-medium mb-3 px-2">选择课程</div>
                        <div className="space-y-1">
                            {courseList.map(course => (
                                <div
                                    key={course.id}
                                    onClick={() => setSelectedCourseId(course.id)}
                                    className={`flex items-center px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                                        selectedCourseId === course.id
                                            ? 'bg-green-500/20 text-green-300'
                                            : 'text-slate-300 hover:bg-slate-700'
                                    }`}
                                >
                                    <div className={`w-6 h-6 rounded mr-2 flex items-center justify-center text-xs bg-gradient-to-br ${course.color}`}>
                                        {course.icon}
                                    </div>
                                    <span className="text-sm truncate flex-1">{course.title}</span>
                                </div>
                            ))}
                            {courseList.length === 0 && (
                                <div className="text-center text-slate-500 py-8 text-xs">
                                    暂无课程
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* 右侧文件列表 */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* 工具栏 */}
                    <div className="flex items-center justify-between px-4 py-2 bg-slate-800/30 border-b border-slate-700 shrink-0">
                        <div className="text-sm text-slate-400">
                            {selectedCourseId ? (
                                <span>
                                    <span className="font-bold text-slate-300">{courseList.find(c => c.id === selectedCourseId)?.title}</span>
                                    <span className="mx-2">·</span>
                                    <span>共 {files.length} 个文件</span>
                                </span>
                            ) : (
                                <span className="text-slate-500">请选择一个课程</span>
                            )}
                        </div>
                        {selectedCourseId && (
                            <button
                                onClick={loadSubmissions}
                                disabled={loading}
                                className="flex items-center px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-xs transition-colors"
                            >
                                <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-sync-alt'} mr-1.5`}></i>
                                刷新
                            </button>
                        )}
                    </div>

                    {/* 文件列表 */}
                    <div className="flex-1 overflow-y-auto p-4">
                        {!selectedCourseId ? (
                            <div className="flex items-center justify-center h-full text-slate-500">
                                <div className="text-center">
                                    <i className="fas fa-book-open text-4xl mb-3 opacity-50"></i>
                                    <p className="text-sm">请在左侧选择一个课程</p>
                                </div>
                            </div>
                        ) : loading && files.length === 0 ? (
                            <div className="flex items-center justify-center h-full text-slate-500">
                                <div className="text-center">
                                    <i className="fas fa-spinner fa-spin text-4xl mb-3"></i>
                                    <p className="text-sm">加载中...</p>
                                </div>
                            </div>
                        ) : files.length === 0 ? (
                            <div className="flex items-center justify-center h-full text-slate-500">
                                <div className="text-center">
                                    <i className="fas fa-inbox text-4xl mb-3 opacity-50"></i>
                                    <p className="text-sm">暂无提交文件</p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {files.map((file, idx) => {
                                    const fileIcon = getFileIcon(file.name);
                                    return (
                                        <div
                                            key={idx}
                                            className="flex items-center p-3 rounded-lg bg-slate-800/30 border border-slate-700 hover:bg-slate-800 hover:border-slate-600 transition-all cursor-pointer group"
                                            onClick={() => handlePreviewFile(file)}
                                        >
                                            <div className={`w-10 h-10 ${fileIcon.bg} rounded-lg flex items-center justify-center shrink-0 mr-3`}>
                                                <i className={`fas ${fileIcon.icon} ${fileIcon.color} text-lg`}></i>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm text-slate-200 truncate font-medium" title={file.name}>
                                                    {file.name}
                                                </div>
                                                <div className="text-xs text-slate-500 mt-0.5">
                                                    {(file.size / 1024).toFixed(1)} KB
                                                    <span className="mx-2">·</span>
                                                    {new Date(file.mtime).toLocaleString('zh-CN')}
                                                </div>
                                            </div>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDownloadFile(file);
                                                }}
                                                className="opacity-0 group-hover:opacity-100 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs transition-all"
                                                title="下载"
                                            >
                                                <i className="fas fa-download"></i>
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 文件预览弹窗 */}
            {selectedFile && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl flex flex-col max-h-[90vh] overflow-hidden">
                        {/* 标题栏 */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
                            <div className="flex items-center gap-3">
                                {(() => {
                                    const fileIcon = getFileIcon(selectedFile.name);
                                    return (
                                        <div className={`w-10 h-10 ${fileIcon.bg} rounded-lg flex items-center justify-center`}>
                                            <i className={`fas ${fileIcon.icon} ${fileIcon.color} text-lg`}></i>
                                        </div>
                                    );
                                })()}
                                <div>
                                    <h3 className="text-base font-bold text-slate-800 truncate max-w-md" title={selectedFile.name}>
                                        {selectedFile.name}
                                    </h3>
                                    <p className="text-xs text-slate-500">{(selectedFile.size / 1024).toFixed(1)} KB · {new Date(selectedFile.mtime).toLocaleString('zh-CN')}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleDownloadFile(selectedFile)}
                                    className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
                                >
                                    <i className="fas fa-download mr-2"></i>下载
                                </button>
                                <button
                                    onClick={() => setSelectedFile(null)}
                                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-200 transition-colors text-slate-500 hover:text-slate-700"
                                >
                                    <i className="fas fa-xmark text-lg"></i>
                                </button>
                            </div>
                        </div>

                        {/* 内容区域 */}
                        <div className="flex-1 overflow-auto p-6 bg-slate-50">
                            {renderPreviewContent()}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// 导出组件
window.SubmissionsBrowser = SubmissionsBrowser;
