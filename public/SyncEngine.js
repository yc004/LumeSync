// ========================================================
// ⚙️ 互动课堂底层引擎 (SyncEngine)
// 负责：16:9 画布自适应、全屏、Socket.io 同步、自动角色分配、智能资源调度、课堂监控
// ========================================================

const { useState, useEffect, useRef } = React;

function SyncClassroom({ title, slides }) {
    const [currentSlide, setCurrentSlide] = useState(0);
    
    // 角色与状态控制
    const [isHost, setIsHost] = useState(false);
    const [roleAssigned, setRoleAssigned] = useState(false);
    
    // 学生监控与弹窗状态
    const [studentCount, setStudentCount] = useState(0);
    const [toasts, setToasts] = useState([]);
    
    const socketRef = useRef(null);

    // 弹窗管理：动态推入新提示，3秒后自动销毁
    const showToast = (message, type) => {
        const id = Date.now() + Math.random();
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 3000);
    };

    useEffect(() => {
        // 1. 初始化 Socket 连接
        socketRef.current = window.io();

        // 2. 监听后端的角色分配指令 (基于 IP)
        socketRef.current.on('role-assigned', (data) => {
            setIsHost(data.role === 'host');
            setRoleAssigned(true); // 标记分配完成，结束加载状态
        });

        // 3. 监听翻页同步指令
        socketRef.current.on('sync-slide', (data) => {
            setCurrentSlide(data.slideIndex);
        });

        // 4. 监听学生上下线状态 (只有后端判断是 host 才会发过来)
        socketRef.current.on('student-status', (data) => {
            setStudentCount(data.count);
            // 初始化的时候不弹窗，只有发生上下线动作时才提示
            if (data.action === 'join') {
                showToast(`👋 学生上线 (IP: ${data.ip})`, 'success');
            } else if (data.action === 'leave') {
                showToast(`🏃 学生离开 (IP: ${data.ip})`, 'warning');
            }
        });

        return () => {
            if(socketRef.current) socketRef.current.disconnect();
        };
    }, []);

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

                <div className="flex items-center space-x-6 md:space-x-8">
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
    return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = localSrc;
        
        script.onload = () => {
            console.log(`[资源引擎] ✅ 局域网脚本加载成功: ${localSrc}`);
            resolve(true);
        };
        
        script.onerror = () => {
            console.warn(`[资源引擎] ⚠️ 局域网脚本加载失败，尝试公网兜底: ${publicSrc}`);
            const fallbackScript = document.createElement('script');
            fallbackScript.src = publicSrc;
            fallbackScript.onload = () => {
                console.log(`[资源引擎] ✅ 公网兜底脚本加载成功: ${publicSrc}`);
                resolve(true);
            };
            fallbackScript.onerror = () => {
                console.error(`[资源引擎] ❌ 严重错误：公网兜底脚本也加载失败: ${publicSrc}`);
                resolve(false); 
            };
            document.head.appendChild(fallbackScript);
        };
        
        document.head.appendChild(script);
    });
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

    let dataRetries = 50; 
    while (!window.CourseData && dataRetries > 0) {
        await new Promise(r => setTimeout(r, 50));
        dataRetries--;
    }

    if (!window.CourseData) {
        root.render(
            <div className="flex h-screen items-center justify-center bg-slate-900 text-white flex-col">
                <div className="text-6xl mb-4">💔</div>
                <h2 className="text-2xl text-red-400 font-bold mb-2">未找到课程数据</h2>
                <p className="text-slate-400 text-sm">请检查 CourseContent.js 文件是否正确导出了 window.CourseData</p>
            </div>
        );
        return;
    }

    root.render(
        <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white select-none">
            <i className="fas fa-layer-group fa-bounce text-5xl text-purple-500 mb-6"></i>
            <h2 className="text-2xl tracking-widest font-bold">正在预加载课堂资源...</h2>
            <p className="text-slate-400 mt-3 text-sm flex items-center">
                <i className="fas fa-bolt text-yellow-400 mr-2"></i> 优先从教师端局域网获取，请稍候
            </p>
        </div>
    );

    console.log(`[SyncEngine] 启动课程装载程序: ${window.CourseData.title}`);

    if (window.CourseData.dependencies && window.CourseData.dependencies.length > 0) {
        for (const dep of window.CourseData.dependencies) {
            console.log(`[资源引擎] 开始调度依赖项: ${dep.name}`);
            await loadScriptWithFallback(dep.localSrc, dep.publicSrc);
        }
    }

    window.CourseGlobalContext = {};
    if (window.CourseData.modelsUrls) {
        const bestModelUrl = await checkModelUrlValidity(window.CourseData.modelsUrls);
        window.CourseGlobalContext.modelUrl = bestModelUrl;
    }

    console.log(`[SyncEngine] 所有前置依赖就绪，开始渲染课件！`);
    root.render(
        <SyncClassroom 
            title={window.CourseData.title} 
            slides={window.CourseData.slides} 
        />
    );
};

bootEngine();