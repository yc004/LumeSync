// ========================================================
// 课程选择界面组件（仅教师端）
// ========================================================
function CourseSelector({ courses, currentCourseId, onSelectCourse, onRefresh, socket, settings, onSettingsChange, studentCount, studentLog }) {
    const [selectedId, setSelectedId] = useState(currentCourseId);
    const [showGuide, setShowGuide] = useState(false);
    const [guideContent, setGuideContent] = useState('');
    const [showSettings, setShowSettings] = useState(false);
    const [showClassroomView, setShowClassroomView] = useState(false);
    const [showCourseManager, setShowCourseManager] = useState(false);
    const [courseList, setCourseList] = useState(courses);
    
    useEffect(() => {
        setCourseList(courses);
    }, [courses]);

    const handleSelect = (courseId) => { setSelectedId(courseId); };

    const handleStartCourse = () => {
        if (selectedId && socket) {
            socket.emit('select-course', { courseId: selectedId });
        }
    };

    const handleDownloadSkill = () => {
        const a = document.createElement('a');
        a.href = '/api/download-skill';
        a.download = 'create-course.md';
        a.click();
    };

    const handleImportCourse = async () => {
        if (!window.electronAPI?.importCourse) return;
        const result = await window.electronAPI.importCourse();
        if (result && result.success && result.imported.length > 0) {
            onRefresh();
        }
    };

    const handleExportCourse = async (courseFile) => {
        if (!window.electronAPI?.exportCourse) return;
        try {
            const result = await window.electronAPI.exportCourse({ courseFile });
            if (!result || result.canceled) return;
            if (!result.success) {
                alert('导出失败：' + (result.error || '未知错误'));
                return;
            }
            alert(`已导出：${result.filename}`);
        } catch (err) {
            alert('导出失败：' + (err?.message || '未知错误'));
        }
    };

    const handleOpenGuide = async () => {
        if (!guideContent) {
            const res = await fetch('/api/course-guide');
            const text = await res.text();
            setGuideContent(text);
        }
        setShowGuide(true);
    };

    const handleDeleteCourse = async (courseId) => {
        if (!confirm(`确定要删除课程 "${courseId}" 吗？此操作不可恢复！`)) {
            return;
        }
        try {
            const res = await fetch('/api/delete-course', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ courseId })
            });
            const result = await res.json();
            if (result.success) {
                onRefresh();
                setCourseList(result.courses);
            } else {
                alert('删除失败：' + (result.error || '未知错误'));
            }
        } catch (err) {
            alert('删除失败：网络错误');
        }
    };

    return (
        <div className="flex flex-col h-screen bg-slate-900 text-white overflow-hidden">
            <div className="flex items-center justify-between px-8 py-5 bg-slate-800 border-b border-slate-700" style={{WebkitAppRegion:'drag'}}>
                <div className="flex items-center space-x-3">
                    <i className="fas fa-chalkboard-teacher text-blue-400 text-2xl"></i>
                    <h1 className="text-2xl font-bold">教师控制台</h1>
                </div>
                <div className="flex items-center space-x-3" style={{WebkitAppRegion:'no-drag'}}>
                    <button
                        onClick={() => setShowClassroomView(true)}
                        className="px-3 py-1.5 bg-purple-500/20 text-purple-300 rounded-full text-sm font-bold border border-purple-500/30 flex items-center hover:bg-purple-500/30 transition-colors"
                        title="点击查看机房视图"
                    >
                        <span className="relative flex h-2 w-2 mr-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                        </span>
                        在线学生: {studentCount}
                    </button>
                    <button
                        onClick={() => setShowSettings(v => !v)}
                        className="flex items-center px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg border border-slate-600 transition-colors text-sm"
                        title="课堂设置"
                    >
                        <i className="fas fa-gear"></i>
                    </button>
                    <span className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-full text-sm font-bold border border-blue-500/30">
                        老师端 (主控)
                    </span>
                    <WindowControls />
                </div>
            </div>

            <div className="flex-1 overflow-auto p-8">
                <div className="max-w-6xl mx-auto">
                    <div className="mb-8">
                        <h2 className="text-3xl font-bold mb-2">选择课程</h2>
                        <p className="text-slate-400">从下方列表中选择要讲授的课程，学生将同步进入课堂</p>
                    </div>

                    <div className="mb-6 flex justify-end gap-3">
                        {window.electronAPI?.importCourse && (
                            <button onClick={handleImportCourse} className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors text-sm font-medium">
                                <i className="fas fa-file-import mr-2"></i> 导入课程
                            </button>
                        )}
                        <button onClick={() => { setCourseList(courses); setShowCourseManager(true); }} className="flex items-center px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg transition-colors text-sm font-medium" title="管理课件">
                            <i className="fas fa-cog mr-2"></i> 课件管理
                        </button>
                        <button onClick={onRefresh} className="flex items-center px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-sm">
                            <i className="fas fa-sync-alt mr-2"></i> 刷新课程列表
                        </button>
                    </div>

                    {courses.length === 0 ? (
                        <div className="text-center py-20 bg-slate-800/50 rounded-2xl border border-slate-700">
                            <i className="fas fa-folder-open text-6xl text-slate-600 mb-4"></i>
                            <h3 className="text-xl font-bold text-slate-400 mb-2">暂无课程</h3>
                            <p className="text-slate-500">点击右上角"导入课程"按钮，或将课程文件放入 public/courses/ 目录</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {courses.map(course => (
                                <div
                                    key={course.id}
                                    onClick={() => handleSelect(course.id)}
                                    className={`relative p-6 rounded-2xl border-2 cursor-pointer transition-all duration-300 ${
                                        selectedId === course.id
                                            ? 'bg-slate-800 border-blue-500 shadow-lg shadow-blue-500/20'
                                            : 'bg-slate-800/50 border-slate-700 hover:border-slate-500 hover:bg-slate-800'
                                    }`}
                                >
                                    {selectedId === course.id && (
                                        <div className="absolute top-4 right-4 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                                            <i className="fas fa-check text-white"></i>
                                        </div>
                                    )}
                                    <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${course.color} flex items-center justify-center text-3xl mb-4 shadow-lg`}>
                                        {course.icon}
                                    </div>
                                    <h3 className="text-xl font-bold mb-2">{course.title}</h3>
                                    <p className="text-slate-400 text-sm">{course.desc || '暂无描述'}</p>
                                    <p className="text-slate-600 text-xs mt-4 font-mono">{course.file}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="px-8 py-5 bg-slate-800 border-t border-slate-700">
                <div className="max-w-6xl mx-auto flex justify-between items-center">
                    <div className="flex items-center space-x-3">
                        <span className="text-slate-400 text-sm">共 {courses.length} 个课程</span>
                        <button onClick={handleDownloadSkill} className="flex items-center px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg transition-colors text-sm font-medium border border-slate-600" title="下载 AI 课件生成 Skill 文件">
                            <i className="fas fa-download mr-2 text-blue-400"></i>下载 Skill
                        </button>
                        <button onClick={handleOpenGuide} className="flex items-center px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg transition-colors text-sm font-medium border border-slate-600" title="查看课件开发教程">
                            <i className="fas fa-book-open mr-2 text-green-400"></i>课件教程
                        </button>
                    </div>
                    <button
                        onClick={handleStartCourse}
                        disabled={!selectedId}
                        className={`flex items-center px-8 py-3 rounded-xl font-bold text-lg transition-all ${
                            selectedId ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg hover:shadow-blue-500/30' : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                        }`}
                    >
                        <i className="fas fa-play mr-3"></i>开始授课
                    </button>
                </div>
            </div>

            {showSettings && (
                <SettingsPanel settings={settings} onSettingsChange={onSettingsChange} socket={socket} onClose={() => setShowSettings(false)} zIndex="z-50" />
            )}

            {showGuide && (
                <div className="fixed inset-0 z-50 flex" onClick={() => setShowGuide(false)}>
                    <div className="ml-auto w-full max-w-2xl h-full bg-white shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 bg-slate-800 border-b border-slate-700 shrink-0">
                            <h3 className="text-white font-bold text-lg flex items-center">
                                <i className="fas fa-book-open mr-2 text-green-400"></i>课件开发教程
                            </h3>
                            <div className="flex items-center space-x-2">
                                <button onClick={handleDownloadSkill} className="flex items-center px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors">
                                    <i className="fas fa-download mr-1.5"></i>下载 Skill
                                </button>
                                <button onClick={() => setShowGuide(false)} className="text-slate-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-700 transition-colors">
                                    <i className="fas fa-xmark text-xl"></i>
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 text-slate-800">
                            <div
                                className="markdown-body text-sm leading-relaxed"
                                dangerouslySetInnerHTML={{ __html: window.marked ? window.marked.parse(guideContent) : guideContent }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {showClassroomView && (
                <ClassroomView
                    onClose={() => setShowClassroomView(false)}
                    socket={socket}
                    studentLog={studentLog}
                    podiumAtTop={settings?.podiumAtTop}
                    onPodiumAtTopChange={(v) => onSettingsChange && onSettingsChange('podiumAtTop', !!v)}
                />
            )}

            {showCourseManager && (
                <div className="fixed inset-0 z-50 flex" onClick={() => setShowCourseManager(false)}>
                    <div className="ml-auto w-full max-w-2xl h-full bg-slate-900 shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 bg-slate-800 border-b border-slate-700 shrink-0">
                            <h3 className="text-white font-bold text-lg flex items-center">
                                <i className="fas fa-cog mr-2 text-amber-400"></i>课件管理
                            </h3>
                            <button onClick={() => setShowCourseManager(false)} className="text-slate-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-700 transition-colors">
                                <i className="fas fa-xmark text-xl"></i>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6">
                            <div className="mb-4 text-slate-400 text-sm">共 {courseList.length} 个课件</div>
                            <div className="space-y-3">
                                {courseList.map(course => (
                                    <div key={course.id} className="flex items-center justify-between p-4 bg-slate-800 rounded-xl border border-slate-700 hover:border-slate-600 transition-colors">
                                        <div className="flex items-center space-x-4">
                                            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${course.color} flex items-center justify-center text-xl shrink-0`}>
                                                {course.icon}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="text-white font-bold truncate">{course.title}</h4>
                                                <p className="text-slate-500 text-xs mt-1 font-mono truncate">{course.file}</p>
                                                {course.desc && (
                                                    <p className="text-slate-400 text-xs mt-1 truncate">{course.desc}</p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {window.electronAPI?.exportCourse && (
                                                <button
                                                    onClick={() => handleExportCourse(course.file)}
                                                    className="flex items-center px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors text-sm font-medium"
                                                    title="导出此课件"
                                                >
                                                    <i className="fas fa-file-export mr-1.5"></i>导出
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleDeleteCourse(course.id)}
                                                className="flex items-center px-3 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors text-sm font-medium"
                                                title="删除此课件"
                                            >
                                                <i className="fas fa-trash mr-1.5"></i>删除
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {courseList.length === 0 && (
                                    <div className="text-center py-12 bg-slate-800/50 rounded-xl border border-slate-700">
                                        <i className="fas fa-folder-open text-4xl text-slate-600 mb-3"></i>
                                        <p className="text-slate-500 text-sm">暂无课件</p>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="px-6 py-4 bg-slate-800 border-t border-slate-700">
                            <p className="text-slate-500 text-xs text-center">删除课件将从服务器移除对应文件，此操作不可恢复</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
