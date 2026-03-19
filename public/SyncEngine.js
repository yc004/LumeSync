// ========================================================
// ⚙️ 互动课堂底层引擎 (SyncEngine)
// 负责：16:9 画布自适应、全屏、Socket.io 同步、自动角色分配、智能资源调度、课堂监控
// ========================================================

const { useState, useEffect, useRef } = React;

// ========================================================
// 📚 课程选择界面组件（仅教师端）
// ========================================================
function CourseSelector({ courses, currentCourseId, onSelectCourse, onRefresh, socket }) {
    const [selectedId, setSelectedId] = useState(currentCourseId);
    
    const handleSelect = (courseId) => {
        setSelectedId(courseId);
    };
    
    const handleStartCourse = () => {
        if (selectedId && socket) {
            socket.emit('select-course', { courseId: selectedId });
        }
    };
    
    return (
        <div className="flex flex-col h-screen bg-slate-900 text-white overflow-hidden">
            {/* 顶栏 */}
            <div className="flex items-center justify-between px-8 py-5 bg-slate-800 border-b border-slate-700">
                <div className="flex items-center space-x-3">
                    <i className="fas fa-chalkboard-teacher text-blue-400 text-2xl"></i>
                    <h1 className="text-2xl font-bold">教师控制台</h1>
                </div>
                <div className="flex items-center space-x-3">
                    <span className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-full text-sm font-bold border border-blue-500/30">
                        🧑‍🏫 老师端 (主控)
                    </span>
                </div>
            </div>
            
            {/* 主内容区 */}
            <div className="flex-1 overflow-auto p-8">
                <div className="max-w-6xl mx-auto">
                    {/* 标题区 */}
                    <div className="mb-8">
                        <h2 className="text-3xl font-bold mb-2">选择课程</h2>
                        <p className="text-slate-400">从下方列表中选择要讲授的课程，学生将同步进入课堂</p>
                    </div>
                    
                    {/* 刷新按钮 */}
                    <div className="mb-6 flex justify-end">
                        <button 
                            onClick={onRefresh}
                            className="flex items-center px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-sm"
                        >
                            <i className="fas fa-sync-alt mr-2"></i> 刷新课程列表
                        </button>
                    </div>
                    
                    {/* 课程卡片网格 */}
                    {courses.length === 0 ? (
                        <div className="text-center py-20 bg-slate-800/50 rounded-2xl border border-slate-700">
                            <i className="fas fa-folder-open text-6xl text-slate-600 mb-4"></i>
                            <h3 className="text-xl font-bold text-slate-400 mb-2">暂无课程</h3>
                            <p className="text-slate-500">请在 public/courses/ 目录下添加课程文件</p>
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
                                    {/* 选中标记 */}
                                    {selectedId === course.id && (
                                        <div className="absolute top-4 right-4 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                                            <i className="fas fa-check text-white"></i>
                                        </div>
                                    )}
                                    
                                    {/* 图标 */}
                                    <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${course.color} flex items-center justify-center text-3xl mb-4 shadow-lg`}>
                                        {course.icon}
                                    </div>
                                    
                                    {/* 标题 */}
                                    <h3 className="text-xl font-bold mb-2">{course.title}</h3>
                                    
                                    {/* 描述 */}
                                    <p className="text-slate-400 text-sm">{course.desc || '暂无描述'}</p>
                                    
                                    {/* 文件名 */}
                                    <p className="text-slate-600 text-xs mt-4 font-mono">{course.file}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            
            {/* 底部操作栏 */}
            <div className="px-8 py-5 bg-slate-800 border-t border-slate-700">
                <div className="max-w-6xl mx-auto flex justify-between items-center">
                    <div className="text-slate-400 text-sm">
                        共 {courses.length} 个课程
                    </div>
                    <button
                        onClick={handleStartCourse}
                        disabled={!selectedId}
                        className={`flex items-center px-8 py-3 rounded-xl font-bold text-lg transition-all ${
                            selectedId 
                                ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg hover:shadow-blue-500/30' 
                                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                        }`}
                    >
                        <i className="fas fa-play mr-3"></i>
                        开始授课
                    </button>
                </div>
            </div>
        </div>
    );
}

// ========================================================
// 🎓 学生等待界面组件
// ========================================================
function StudentWaitingRoom({ message }) {
    return (
        <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white select-none">
            <div className="text-center">
                <div className="w-24 h-24 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                    <i className="fas fa-graduation-cap text-blue-400 text-4xl"></i>
                </div>
                <h2 className="text-3xl font-bold mb-4">等待老师选择课程...</h2>
                <p className="text-slate-400 max-w-md mx-auto">老师正在准备课程内容，请稍候。课程开始后您将自动进入课堂。</p>
                <div className="mt-8 flex items-center justify-center space-x-2">
                    <span className="w-3 h-3 bg-blue-500 rounded-full animate-bounce"></span>
                    <span className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></span>
                    <span className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></span>
                </div>
            </div>
        </div>
    );
}

function SyncClassroom({ title, slides, onEndCourse, socket, isHost: initialIsHost }) {
    const [currentSlide, setCurrentSlide] = useState(0);
    
    // 角色与状态控制
    const [isHost, setIsHost] = useState(initialIsHost || false);
    const [roleAssigned, setRoleAssigned] = useState(true); // 从父组件传入，已分配
    
    // 学生监控与弹窗状态
    const [studentCount, setStudentCount] = useState(0);
    const [toasts, setToasts] = useState([]);
    
    const socketRef = useRef(socket);

    // 弹窗管理：动态推入新提示，3秒后自动销毁
    const showToast = (message, type) => {
        const id = Date.now() + Math.random();
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 3000);
    };

    useEffect(() => {
        if (!socket) return;
        
        socketRef.current = socket;

        // 监听翻页同步指令
        socket.on('sync-slide', (data) => {
            setCurrentSlide(data.slideIndex);
        });

        // 监听学生上下线状态 (只有后端判断是 host 才会发过来)
        socket.on('student-status', (data) => {
            setStudentCount(data.count);
            // 初始化的时候不弹窗，只有发生上下线动作时才提示
            if (data.action === 'join') {
                showToast(`👋 学生上线 (IP: ${data.ip})`, 'success');
            } else if (data.action === 'leave') {
                showToast(`🏃 学生离开 (IP: ${data.ip})`, 'warning');
            }
        });

        // 如果是老师端，主动请求当前学生人数
        if (isHost) {
            socket.emit('get-student-count');
        }

        return () => {
            // 清理事件监听器
            socket.off('sync-slide');
            socket.off('student-status');
        };
    }, [socket, isHost]);

    // 翻页逻辑
    const goToSlide = (index) => {
        if (index >= 0 && index < slides.length) {
            setCurrentSlide(index);
            // 只有老师端才会发送同步指令给后端
            if (isHost) {
                socketRef.current.emit('sync-slide', { slideIndex: index });
            }
        }
    };

    const nextSlide = () => goToSlide(currentSlide + 1);
    const prevSlide = () => goToSlide(currentSlide - 1);

    // ========================================================
    // 界面渲染
    // ========================================================

    // 还没分配好角色时，显示连接动画
    if (!roleAssigned) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white select-none">
                <i className="fas fa-network-wired fa-fade text-5xl text-blue-500 mb-6"></i>
                <h2 className="text-2xl tracking-widest font-bold">正在连接课堂服务器...</h2>
                <p className="text-slate-400 mt-2">正在验证身份并分配权限</p>
            </div>
        );
    }

    // 分配好角色后，显示主界面
    return (
        <div className="flex flex-col h-screen bg-slate-900 text-slate-800 font-sans overflow-hidden select-none">
            
            {/* 顶栏 (Header) */}
            <div className="flex items-center justify-between px-6 md:px-8 py-4 bg-white shadow-md z-20 relative h-[72px] shrink-0">
                <div className="flex items-center space-x-3">
                    <i className="fas fa-microchip text-blue-600 text-2xl md:text-3xl"></i>
                    <h1 className="text-lg md:text-2xl font-bold text-slate-800 tracking-wide truncate max-w-[200px] md:max-w-none">{title}</h1>
                    
                    {/* 身份标识与学生人数标签 */}
                    <div className="hidden sm:flex items-center ml-4 space-x-2">
                        <span className={`px-3 py-1 text-xs md:text-sm font-bold rounded-full border ${
                            isHost ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-green-50 text-green-600 border-green-200'
                        }`}>
                            {isHost ? '🧑‍🏫 老师端 (主控)' : '👨‍🎓 学生端 (观看)'}
                        </span>
                        
                        {/* 仅老师端显示在线人数 */}
                        {isHost && (
                            <span className="px-3 py-1 text-xs md:text-sm font-bold rounded-full border bg-purple-50 text-purple-600 border-purple-200 flex items-center shadow-inner">
                                <span className="relative flex h-2 w-2 mr-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                                </span>
                                在线学生: {studentCount}
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex items-center space-x-3 md:space-x-4">
                    {/* 结束课程按钮（仅教师端） */}
                    {isHost && onEndCourse && (
                        <button
                            onClick={onEndCourse}
                            className="flex items-center px-3 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg border border-red-200 transition-colors text-sm font-bold"
                            title="结束课程"
                        >
                            <i className="fas fa-stop mr-2"></i>
                            <span className="hidden md:inline">结束课程</span>
                        </button>
                    )}
                    
                    <div className="flex space-x-1.5 hidden md:flex">
                        {slides.map((_, idx) => (
                            <div
                                key={idx}
                                className={`h-2.5 rounded-full transition-all duration-300 ${
                                    idx === currentSlide ? 'w-8 md:w-10 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]' : 'w-2 md:w-3 bg-slate-200'
                                }`}
                            />
                        ))}
                    </div>
                    <button 
                        onClick={() => {
                            if (!document.fullscreenElement) {
                                document.documentElement.requestFullscreen().catch(err => console.log(err));
                            } else {
                                document.exitFullscreen().catch(err => console.log(err));
                            }
                        }} 
                        className="text-slate-400 hover:text-blue-500 transition-colors cursor-pointer bg-slate-50 w-10 h-10 rounded-lg border border-slate-200 hover:shadow-sm flex items-center justify-center" 
                        title="进入/退出全屏"
                    >
                        <i className="fas fa-expand text-lg md:text-xl"></i>
                    </button>
                </div>
            </div>

            {/* 16:9 课件展示区 (Canvas) */}
            <div className="flex-1 relative flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-hidden">
                <div 
                    className="bg-white relative shadow-2xl flex flex-col rounded-2xl transition-all duration-500 ring-4 ring-white/10 overflow-y-auto no-scrollbar"
                    style={{
                        width: '100%',
                        height: '100%',
                        maxWidth: 'calc((100vh - 144px - 2rem) * 16 / 9)', 
                        maxHeight: 'calc(100vw * 9 / 16)'
                    }}
                >
                    {/* 渲染当前页的内容 */}
                    {slides[currentSlide] && slides[currentSlide].component}
                </div>
            </div>

            {/* 底栏 (Navigation Controls) - 根据角色动态渲染 */}
            <div className="flex items-center justify-between px-6 md:px-10 py-4 bg-white border-t border-slate-200 shadow-[0_-4px_15px_-3px_rgba(0,0,0,0.1)] z-20 relative h-[72px] shrink-0">
                {isHost ? (
                    // 老师端：显示完整的翻页控制按钮
                    <>
                        <button
                            onClick={prevSlide}
                            disabled={currentSlide === 0}
                            className={`flex items-center px-4 md:px-6 py-2 md:py-2.5 rounded-xl font-bold text-base md:text-lg transition-all ${
                                currentSlide === 0
                                    ? 'text-slate-400 bg-slate-100 cursor-not-allowed'
                                    : 'text-white bg-blue-500 hover:bg-blue-600 shadow-md hover:-translate-x-1'
                            }`}
                        >
                            <i className="fas fa-chevron-left mr-2"></i>
                            上一页
                        </button>
                        <span className="text-slate-500 font-bold text-base md:text-lg tracking-widest bg-slate-100 px-4 md:px-6 py-1 md:py-2 rounded-full shadow-inner border border-slate-200">
                            {currentSlide + 1} / {slides.length}
                        </span>
                        <button
                            onClick={nextSlide}
                            disabled={currentSlide === slides.length - 1}
                            className={`flex items-center px-4 md:px-6 py-2 md:py-2.5 rounded-xl font-bold text-base md:text-lg transition-all ${
                                currentSlide === slides.length - 1
                                    ? 'text-slate-400 bg-slate-100 cursor-not-allowed'
                                    : 'text-white bg-blue-500 hover:bg-blue-600 shadow-md hover:translate-x-1'
                            }`}
                        >
                            下一页
                            <i className="fas fa-chevron-right ml-2"></i>
                        </button>
                    </>
                ) : (
                    // 学生端：隐藏按钮，仅显示观看状态
                    <div className="w-full flex justify-center items-center">
                        <div className="text-slate-500 font-bold text-sm md:text-lg tracking-widest bg-slate-50 border border-slate-200 px-6 md:px-10 py-2 md:py-2.5 rounded-full flex items-center shadow-inner">
                            <span className="relative flex h-3 w-3 mr-3 md:mr-4">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                            </span>
                            正在观看老师演示 | 进度：{currentSlide + 1} / {slides.length}
                        </div>
                    </div>
                )}
            </div>
            
            {/* 侧边通知弹窗容器 (Toast) */}
            <div className="fixed top-24 right-6 z-50 flex flex-col space-y-3 pointer-events-none">
                {toasts.map(t => (
                    <div key={t.id} className={`px-4 py-3 rounded-xl shadow-xl border backdrop-blur-md font-bold text-sm md:text-base flex items-center toast-animate ${
                        t.type === 'success' ? 'bg-green-500/90 border-green-400 text-white' : 'bg-orange-500/90 border-orange-400 text-white'
                    }`}>
                        {t.message}
                    </div>
                ))}
            </div>
            
            {/* 为 Toast 添加简单的滑入动画 */}
            <style>{`
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                .toast-animate { animation: slideInRight 0.3s ease-out forwards; }
            `}</style>
        </div>
    );
}

// ========================================================
// 🚀 资源调度与渲染接管程序 (Bootstrapper)
// 作用：加载配置表中的脚本和模型，优先测试局域网，失败再切公网
// ========================================================

// 辅助函数：带兜底逻辑的脚本加载器
const loadScriptWithFallback = (localSrc, publicSrc) => {
    const fileName = localSrc.split('/').pop();
    return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = localSrc;
        let hasError = false;
        
        // 捕获脚本执行错误
        const errorHandler = (event) => {
            if (hasError) return;
            hasError = true;
            window.removeEventListener('error', errorHandler);
            // 执行出错，尝试公网兜底
            loadPublicScript(publicSrc, resolve);
        };
        
        window.addEventListener('error', errorHandler, { once: true });
        
        script.onload = () => {
            if (hasError) return;
            window.removeEventListener('error', errorHandler);
            console.log(`[资源引擎] ✅ ${fileName} 已加载`);
            resolve(true);
        };
        
        script.onerror = () => {
            if (hasError) return;
            hasError = true;
            window.removeEventListener('error', errorHandler);
            loadPublicScript(publicSrc, resolve);
        };
        
        document.head.appendChild(script);
    });
};

// 辅助函数：加载公网脚本
const loadPublicScript = (publicSrc, resolve) => {
    const fileName = publicSrc.split('/').pop();
    const fallbackScript = document.createElement('script');
    fallbackScript.src = publicSrc;
    fallbackScript.onload = () => {
        console.log(`[资源引擎] ✅ ${fileName} 已从公网加载`);
        resolve(true);
    };
    fallbackScript.onerror = () => {
        console.error(`[资源引擎] ❌ ${fileName} 加载失败`);
        resolve(false); 
    };
    document.head.appendChild(fallbackScript);
};

// 辅助函数：测试局域网模型库连通性
const checkModelUrlValidity = async (urls) => {
    if (!urls) return '';
    try {
        const testUrl = urls.local.endsWith('/') ? urls.local + 'tiny_face_detector_model-weights_manifest.json' : urls.local + '/tiny_face_detector_model-weights_manifest.json';
        
        const res = await fetch(testUrl, { method: 'HEAD', cache: 'no-cache' });
        if (res.ok) {
            console.log(`[资源引擎] ✅ 局域网模型库连通性测试通过，采用极速本地加载: ${urls.local}`);
            return urls.local;
        }
    } catch (err) {}
    console.warn(`[资源引擎] ⚠️ 未探测到局域网模型，已自动切换至公网 CDN 兜底: ${urls.public}`);
    return urls.public;
};

// ========================================================
// 🚀 主应用组件 - 管理课程选择和课堂状态
// ========================================================
function ClassroomApp() {
    const [isHost, setIsHost] = useState(false);
    const [roleAssigned, setRoleAssigned] = useState(false);
    const [courseCatalog, setCourseCatalog] = useState([]);
    const [currentCourseId, setCurrentCourseId] = useState(null);
    const [currentCourseData, setCurrentCourseData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const socketRef = useRef(null);
    const courseCatalogRef = useRef([]); // 用于解决闭包问题

    useEffect(() => {
        // 初始化 Socket 连接
        socketRef.current = window.io();

        // 监听角色分配和初始状态
        socketRef.current.on('role-assigned', (data) => {
            setIsHost(data.role === 'host');
            const catalog = data.courseCatalog || [];
            setCourseCatalog(catalog);
            courseCatalogRef.current = catalog; // 更新 ref
            setCurrentCourseId(data.currentCourseId);
            setRoleAssigned(true);
            
            // 如果已经有选中的课程，加载它
            if (data.currentCourseId) {
                loadCourse(data.currentCourseId, catalog);
            }
        });

        // 监听课程切换
        socketRef.current.on('course-changed', (data) => {
            setCurrentCourseId(data.courseId);
            loadCourse(data.courseId, courseCatalogRef.current);
        });

        // 监听课程结束
        socketRef.current.on('course-ended', () => {
            setCurrentCourseId(null);
            setCurrentCourseData(null);
            window.CourseData = null;
        });

        // 监听课程列表更新
        socketRef.current.on('course-catalog-updated', (data) => {
            setCourseCatalog(data.courses);
            courseCatalogRef.current = data.courses;
        });

        return () => {
            if (socketRef.current) socketRef.current.disconnect();
        };
    }, []);

    // 加载课程文件
    const loadCourse = async (courseId, catalog) => {
        const courseList = catalog || courseCatalogRef.current;
        const course = courseList.find(c => c.id === courseId);
        if (!course) {
            console.error(`[ClassroomApp] 找不到课程: ${courseId}`);
            return;
        }

        setIsLoading(true);
        
        try {
            // 动态加载课程脚本
            const scriptUrl = `/courses/${course.file}`;
            
            // 清除之前的课程数据
            window.CourseData = null;
            
            // 使用 fetch 获取脚本内容，然后用 Babel 编译
            const response = await fetch(scriptUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch ${scriptUrl}`);
            }
            
            const scriptContent = await response.text();
            
            // 使用 Babel 编译 JSX
            let compiledCode;
            if (window.Babel) {
                try {
                    const result = window.Babel.transform(scriptContent, {
                        presets: ['react'],
                        filename: course.file
                    });
                    compiledCode = result.code;
                } catch (babelErr) {
                    console.error('[ClassroomApp] Babel 编译失败:', babelErr);
                    throw babelErr;
                }
            } else {
                compiledCode = scriptContent;
            }
            
            // 执行编译后的代码
            try {
                // 使用 new Function 在当前全局作用域执行
                const runCode = new Function(compiledCode);
                runCode();
            } catch (execErr) {
                console.error('[ClassroomApp] 执行代码失败:', execErr);
                throw execErr;
            }

            // 等待课程数据准备就绪
            let retries = 100;
            while (!window.CourseData && retries > 0) {
                await new Promise(r => setTimeout(r, 100));
                retries--;
            }

            if (window.CourseData) {
                // 加载依赖
                if (window.CourseData.dependencies && window.CourseData.dependencies.length > 0) {
                    // 先将 filename -> publicSrc 映射注册给服务端
                    // 这样服务端在找不到文件时能用精确 URL 下载，而不是猜测
                    const depMappings = window.CourseData.dependencies
                        .filter(d => d.localSrc && d.publicSrc)
                        .map(d => ({
                            filename: d.localSrc.split('/').pop(),
                            publicSrc: d.publicSrc
                        }));
                    if (depMappings.length > 0) {
                        socketRef.current.emit('register-dependencies', depMappings);
                    }
                    
                    for (const dep of window.CourseData.dependencies) {
                        await loadScriptWithFallback(dep.localSrc, dep.publicSrc);
                    }
                }

                // 检查模型 URL
                window.CourseGlobalContext = {};
                if (window.CourseData.modelsUrls) {
                    const bestModelUrl = await checkModelUrlValidity(window.CourseData.modelsUrls);
                    window.CourseGlobalContext.modelUrl = bestModelUrl;
                }

                setCurrentCourseData(window.CourseData);
            }
        } catch (err) {
            console.error('[ClassroomApp] 加载课程失败:', err);
        } finally {
            setIsLoading(false);
        }
    };

    // 刷新课程列表
    const handleRefreshCourses = () => {
        if (socketRef.current) {
            socketRef.current.emit('refresh-courses');
        }
    };

    // 结束课程
    const handleEndCourse = () => {
        if (socketRef.current && isHost) {
            socketRef.current.emit('end-course');
        }
    };

    // 还没分配好角色时，显示连接动画
    if (!roleAssigned) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white select-none">
                <i className="fas fa-network-wired fa-fade text-5xl text-blue-500 mb-6"></i>
                <h2 className="text-2xl tracking-widest font-bold">正在连接课堂服务器...</h2>
                <p className="text-slate-400 mt-2">正在验证身份并分配权限</p>
            </div>
        );
    }

    // 老师端且未选择课程 - 显示课程选择界面
    if (isHost && !currentCourseId) {
        return (
            <CourseSelector 
                courses={courseCatalog}
                currentCourseId={currentCourseId}
                onSelectCourse={(id) => setCurrentCourseId(id)}
                onRefresh={handleRefreshCourses}
                socket={socketRef.current}
            />
        );
    }

    // 学生端且未选择课程 - 显示等待界面
    if (!isHost && !currentCourseId) {
        return <StudentWaitingRoom />;
    }

    // 加载中
    if (isLoading || !currentCourseData) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white select-none">
                <i className="fas fa-layer-group fa-bounce text-5xl text-purple-500 mb-6"></i>
                <h2 className="text-2xl tracking-widest font-bold">正在加载课程内容...</h2>
                <p className="text-slate-400 mt-3 text-sm flex items-center">
                    <i className="fas fa-bolt text-yellow-400 mr-2"></i> 请稍候
                </p>
            </div>
        );
    }

    // 显示课堂界面
    return (
        <SyncClassroom 
            title={currentCourseData.title}
            slides={currentCourseData.slides}
            onEndCourse={isHost ? handleEndCourse : null}
            socket={socketRef.current}
            isHost={isHost}
        />
    );
}

const bootEngine = async () => {
    let rootElement = document.getElementById('root');
    let domRetries = 50;
    while (!rootElement && domRetries > 0) {
        await new Promise(r => setTimeout(r, 50));
        rootElement = document.getElementById('root');
        domRetries--;
    }
    if (!rootElement) return;

    const root = ReactDOM.createRoot(rootElement);
    
    console.log('[SyncEngine] 启动互动课堂系统');
    
    root.render(<ClassroomApp />);
};

bootEngine();