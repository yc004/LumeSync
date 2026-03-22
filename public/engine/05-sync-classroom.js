// ========================================================
// 课堂主界面组件（教师端 + 学生端共用）
// ========================================================
function SyncClassroom({ title, slides, onEndCourse, socket, isHost: initialIsHost, initialSlide, settings, onSettingsChange, studentCount, studentLog }) {
    const [currentSlide, setCurrentSlide] = useState(initialSlide || 0);
    const [isHost, setIsHost] = useState(initialIsHost || false);
    const [roleAssigned, setRoleAssigned] = useState(true);
    const [toasts, setToasts] = useState([]);
    const [showLog, setShowLog] = useState(false);
    const [showClassroomView, setShowClassroomView] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    // 摄像头选择器状态
    const [camDevices, setCamDevices] = useState([]);
    const [camActive, setCamActive] = useState(false);   // 是否有课件正在使用摄像头
    const [camSwitching, setCamSwitching] = useState(false);
    const [showCamPicker, setShowCamPicker] = useState(false);
    const stageWrapRef = useRef(null);
    const [stageScale, setStageScale] = useState(1);
    const contentScale = (typeof settings?.renderScale === 'number' && Number.isFinite(settings.renderScale))
        ? Math.min(Math.max(settings.renderScale, 0.6), 1.2)
        : 0.96;

    // 注册全局回调，让 CourseGlobalContext.getCamera() 能触发此组件显示选择器
    useEffect(() => {
        window._onCamActive = (active) => {
            setCamActive(active);
            if (active) setCamDevices([...window.CameraManager.getDevices()]);
            if (!active) setShowCamPicker(false);
        };
        return () => { window._onCamActive = null; };
    }, []);
    const socketRef = useRef(socket);
    const settingsRef = useRef(settings);
    useEffect(() => { settingsRef.current = settings; }, [settings]);

    useEffect(() => {
        if (isHost) return;
        const onFullscreenChange = () => {
            if (!document.fullscreenElement) {
                socketRef.current && socketRef.current.emit('student-alert', { type: 'fullscreen-exit' });
            }
        };
        const onVisibilityChange = () => {
            if (document.hidden) {
                socketRef.current && socketRef.current.emit('student-alert', { type: 'tab-hidden' });
            }
        };
        document.addEventListener('fullscreenchange', onFullscreenChange);
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => {
            document.removeEventListener('fullscreenchange', onFullscreenChange);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, [isHost]);

    useEffect(() => {
        const updateScale = () => {
            if (!stageWrapRef.current) return;
            const availableWidth = stageWrapRef.current.clientWidth - 24;
            const availableHeight = stageWrapRef.current.clientHeight - 24;
            const baseWidth = 1280;
            const baseHeight = 720;
            const scaleW = availableWidth / baseWidth;
            const scaleH = availableHeight / baseHeight;
            const nextScale = Math.max(Math.min(scaleW, scaleH, 0.96), 0.1);
            setStageScale(nextScale);
        };

        const ro = new ResizeObserver(updateScale);
        if (stageWrapRef.current) ro.observe(stageWrapRef.current);
        updateScale();

        return () => ro.disconnect();
    }, []);

    const showToast = (message, type) => {
        const id = Date.now() + Math.random();
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => { setToasts((prev) => prev.filter((t) => t.id !== id)); }, 3000);
    };

    useEffect(() => {
        if (!socket) return;
        socketRef.current = socket;
        socket.on('sync-slide', (data) => {
            if (!isHost && !settingsRef.current.syncFollow) return;
            if (window.CameraManager && window.CameraManager.isActive()) {
                window.CameraManager.release();
            }
            if (window._onCamActive) window._onCamActive(false);
            setCurrentSlide(data.slideIndex);
        });
        socket.on('student-status', (data) => {
            if (data.action === 'join' && settingsRef.current.alertJoin) showToast(`学生上线 (IP: ${data.ip})`, 'success');
            else if (data.action === 'leave' && settingsRef.current.alertLeave) showToast(`学生离开 (IP: ${data.ip})`, 'warning');
        });
        socket.on('student-alert', (data) => {
            const ip = data.ip;
            if (data.type === 'fullscreen-exit' && settingsRef.current.alertFullscreenExit) showToast(`学生退出全屏 (IP: ${ip})`, 'warning');
            else if (data.type === 'tab-hidden' && settingsRef.current.alertTabHidden) showToast(`学生切换页面 (IP: ${ip})`, 'warning');
        });
        return () => {
            socket.off('sync-slide');
            socket.off('student-status');
            socket.off('student-alert');
        };
    }, [socket, isHost]);

    const goToSlide = (index) => {
        if (index >= 0 && index < slides.length) {
            // 切换页面时释放摄像头，新页面组件 mount 后会自行重新申请
            if (window.CameraManager && window.CameraManager.isActive()) {
                window.CameraManager.release();
            }
            if (window._onCamActive) window._onCamActive(false);
            setCurrentSlide(index);
            if (isHost) socketRef.current.emit('sync-slide', { slideIndex: index });
        }
    };
    const nextSlide = () => goToSlide(currentSlide + 1);
    const prevSlide = () => goToSlide(currentSlide - 1);

    if (!roleAssigned) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white select-none">
                <i className="fas fa-network-wired fa-fade text-5xl text-blue-500 mb-6"></i>
                <h2 className="text-2xl tracking-widest font-bold">正在连接课堂服务器...</h2>
                <p className="text-slate-400 mt-2">正在验证身份并分配权限</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-slate-900 text-slate-800 font-sans overflow-hidden select-none">

            {/* 顶栏 */}
            <div className="flex items-center justify-between px-6 md:px-8 py-4 bg-white shadow-md z-20 relative h-[72px] shrink-0" style={{WebkitAppRegion:'drag'}}>
                <div className="flex items-center space-x-3">
                    <i className="fas fa-microchip text-blue-600 text-2xl md:text-3xl"></i>
                    <h1 className="text-lg md:text-2xl font-bold text-slate-800 tracking-wide truncate max-w-[200px] md:max-w-none">{title}</h1>
                    <div className="hidden sm:flex items-center ml-4 space-x-2">
                        <span className={`px-3 py-1 text-xs md:text-sm font-bold rounded-full border ${isHost ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-green-50 text-green-600 border-green-200'}`}>
                            {isHost ? '🧑‍🏫 老师端 (主控)' : '👨‍🎓 学生端 (观看)'}
                        </span>
                        {isHost && (
                            <button
                                onClick={() => setShowClassroomView(true)}
                                className="px-3 py-1 text-xs md:text-sm font-bold rounded-full border bg-purple-50 text-purple-600 border-purple-200 flex items-center shadow-inner hover:bg-purple-100 transition-colors"
                                title="点击查看机房视图"
                                style={{WebkitAppRegion:'no-drag'}}
                            >
                                <span className="relative flex h-2 w-2 mr-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                                </span>
                                在线学生: {studentCount}
                            </button>
                        )}
                    </div>
                </div>
                <div className="flex items-center space-x-3 md:space-x-4" style={{WebkitAppRegion:'no-drag'}}>
                    {isHost && onEndCourse && (
                        <button onClick={onEndCourse} className="flex items-center px-3 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg border border-red-200 transition-colors text-sm font-bold" title="结束课程">
                            <i className="fas fa-stop mr-2"></i><span className="hidden md:inline">结束课程</span>
                        </button>
                    )}
                    {isHost && (
                        <button onClick={() => setShowSettings(v => !v)} className="flex items-center px-3 py-2 bg-slate-50 text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors text-sm font-bold" title="课堂设置">
                            <i className="fas fa-gear"></i>
                        </button>
                    )}
                    {isHost && (
                        <button onClick={() => setShowLog(v => !v)} className="flex items-center px-3 py-2 bg-slate-50 text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors text-sm font-bold relative" title="学生日志">
                            <i className="fas fa-list-ul"></i>
                            {studentLog.length > 0 && (
                                <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                                    {studentLog.length > 99 ? '99' : studentLog.length}
                                </span>
                            )}
                        </button>
                    )}
                    <div className="flex space-x-1.5 hidden md:flex">
                        {slides.map((_, idx) => (
                            <div key={idx} className={`h-2.5 rounded-full transition-all duration-300 ${idx === currentSlide ? 'w-8 md:w-10 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]' : 'w-2 md:w-3 bg-slate-200'}`} />
                        ))}
                    </div>
                    {!isHost && (
                        <WindowControls forceFullscreen={settings.forceFullscreen} />
                    )}
                    {isHost && (
                        <WindowControls />
                    )}
                </div>
            </div>

            {/* 课件展示区 */}
            <div className="flex-1 relative flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-hidden">
                <div ref={stageWrapRef} className="w-full h-full flex items-center justify-center overflow-hidden">
                    <div
                        className="bg-white text-slate-800 relative shadow-2xl flex flex-col rounded-2xl overflow-y-auto no-scrollbar shrink-0"
                        style={{
                            width: '1280px',
                            height: '720px',
                            transform: `scale(${stageScale})`,
                            transformOrigin: 'center center',
                            transition: 'transform 0.2s ease-out'
                        }}
                    >
                        <div className="w-full h-full flex items-center justify-center">
                            <div className="w-full h-full" style={{ zoom: contentScale }}>
                                {slides[currentSlide] && slides[currentSlide].component}
                            </div>
                        </div>

                        {camActive && (
                            <div className="absolute bottom-4 right-4 z-50 flex flex-col items-end gap-2">
                                {showCamPicker && (
                                    <div className="bg-slate-900/95 backdrop-blur-sm border border-slate-600 rounded-xl shadow-2xl p-2 flex flex-col gap-1 min-w-[220px] max-w-[340px]">
                                        <div className="text-xs text-slate-400 font-bold px-2 py-1 border-b border-slate-700 mb-1">选择摄像头</div>
                                        {camDevices.length === 0 && (
                                            <div className="text-xs text-slate-500 px-2 py-1">未检测到设备</div>
                                        )}
                                        <div className="overflow-y-auto max-h-48 flex flex-col gap-1">
                                        {camDevices.map((d, i) => {
                                            const isCurrent = d.deviceId === window.CameraManager.getCurrentDeviceId()
                                                || (!window.CameraManager.getCurrentDeviceId() && i === 0);
                                            return (
                                                <button
                                                    key={d.deviceId}
                                                    disabled={camSwitching}
                                                    onClick={async () => {
                                                        setShowCamPicker(false);
                                                        setCamSwitching(true);
                                                        try {
                                                            await window.CameraManager.switchDevice(d.deviceId);
                                                            setCamDevices([...window.CameraManager.getDevices()]);
                                                        } catch(e) {
                                                            console.error('[CamPicker] switch failed:', e);
                                                        } finally {
                                                            setCamSwitching(false);
                                                        }
                                                    }}
                                                    className={`text-left text-xs px-3 py-2 rounded-lg transition-colors break-all ${
                                                        isCurrent
                                                            ? 'bg-blue-600 text-white font-bold'
                                                            : 'text-slate-200 hover:bg-slate-700'
                                                    }`}
                                                >
                                                    {d.label || ('摄像头 ' + (i + 1))}
                                                </button>
                                            );
                                        })}
                                        </div>
                                    </div>
                                )}
                                <button
                                    onClick={async () => {
                                        await navigator.mediaDevices.enumerateDevices().then(all => {
                                            const vids = all.filter(d => d.kind === 'videoinput');
                                            setCamDevices(vids);
                                        }).catch(() => {});
                                        setShowCamPicker(v => !v);
                                    }}
                                    title="切换摄像头"
                                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold shadow-lg border transition-all ${
                                        camSwitching
                                            ? 'bg-slate-700 border-slate-600 text-slate-400 cursor-wait'
                                            : 'bg-slate-900/90 border-slate-600 text-white hover:bg-slate-700 backdrop-blur-sm'
                                    }`}
                                >
                                    <i className={`fas ${camSwitching ? 'fa-spinner fa-spin' : 'fa-camera'}`}></i>
                                    {camSwitching ? '切换中...' : '摄像头'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 底栏导航 */}
            <div className="flex items-center justify-between px-6 md:px-10 py-4 bg-white border-t border-slate-200 shadow-[0_-4px_15px_-3px_rgba(0,0,0,0.1)] z-20 relative h-[72px] shrink-0">
                {isHost ? (
                    <>
                        <button onClick={prevSlide} disabled={currentSlide === 0} className={`flex items-center px-4 md:px-6 py-2 md:py-2.5 rounded-xl font-bold text-base md:text-lg transition-all ${currentSlide === 0 ? 'text-slate-400 bg-slate-100 cursor-not-allowed' : 'text-white bg-blue-500 hover:bg-blue-600 shadow-md hover:-translate-x-1'}`}>
                            <i className="fas fa-chevron-left mr-2"></i>上一页
                        </button>
                        <span className="text-slate-500 font-bold text-base md:text-lg tracking-widest bg-slate-100 px-4 md:px-6 py-1 md:py-2 rounded-full shadow-inner border border-slate-200">
                            {currentSlide + 1} / {slides.length}
                        </span>
                        <button onClick={nextSlide} disabled={currentSlide === slides.length - 1} className={`flex items-center px-4 md:px-6 py-2 md:py-2.5 rounded-xl font-bold text-base md:text-lg transition-all ${currentSlide === slides.length - 1 ? 'text-slate-400 bg-slate-100 cursor-not-allowed' : 'text-white bg-blue-500 hover:bg-blue-600 shadow-md hover:translate-x-1'}`}>
                            下一页<i className="fas fa-chevron-right ml-2"></i>
                        </button>
                    </>
                ) : (
                    !settings.syncFollow ? (
                        <>
                            <button onClick={prevSlide} disabled={currentSlide === 0} className={`flex items-center px-4 md:px-6 py-2 md:py-2.5 rounded-xl font-bold text-base md:text-lg transition-all ${currentSlide === 0 ? 'text-slate-400 bg-slate-100 cursor-not-allowed' : 'text-white bg-green-500 hover:bg-green-600 shadow-md hover:-translate-x-1'}`}>
                                <i className="fas fa-chevron-left mr-2"></i>上一页
                            </button>
                            <span className="text-slate-500 font-bold text-base md:text-lg tracking-widest bg-slate-100 px-4 md:px-6 py-1 md:py-2 rounded-full shadow-inner border border-slate-200">
                                {currentSlide + 1} / {slides.length}
                            </span>
                            <button onClick={nextSlide} disabled={currentSlide === slides.length - 1} className={`flex items-center px-4 md:px-6 py-2 md:py-2.5 rounded-xl font-bold text-base md:text-lg transition-all ${currentSlide === slides.length - 1 ? 'text-slate-400 bg-slate-100 cursor-not-allowed' : 'text-white bg-green-500 hover:bg-green-600 shadow-md hover:translate-x-1'}`}>
                                下一页<i className="fas fa-chevron-right ml-2"></i>
                            </button>
                        </>
                    ) : (
                        <div className="w-full flex justify-center items-center">
                            <div className="text-slate-500 font-bold text-sm md:text-lg tracking-widest bg-slate-50 border border-slate-200 px-6 md:px-10 py-2 md:py-2.5 rounded-full flex items-center shadow-inner">
                                <span className="relative flex h-3 w-3 mr-3 md:mr-4">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                                </span>
                                正在观看老师演示 | 进度：{currentSlide + 1} / {slides.length}
                            </div>
                        </div>
                    )
                )}
            </div>

            {/* 日志面板 */}
            {isHost && showLog && (
                <div className="fixed inset-0 z-[9997] flex justify-end" onClick={() => setShowLog(false)}>
                    <div className="w-96 h-full bg-white shadow-2xl border-l border-slate-200 flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
                            <h3 className="font-bold text-slate-800 text-lg flex items-center">
                                <i className="fas fa-list-ul mr-2 text-blue-500"></i> 学生操作日志
                            </h3>
                            <button onClick={() => setShowLog(false)} className="text-slate-400 hover:text-slate-600"><i className="fas fa-xmark text-xl"></i></button>
                        </div>
                        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5 text-sm">
                            {studentLog.length === 0 ? (
                                <div className="text-center text-slate-400 mt-16">
                                    <i className="fas fa-inbox text-3xl mb-3 block"></i>暂无记录
                                </div>
                            ) : (
                                [...studentLog].reverse().map((entry, i) => {
                                    const timeStr = new Date(entry.time).toLocaleTimeString('zh-CN', { hour12: false });
                                    const configs = {
                                        'join':            { icon: 'fa-user-plus',  color: 'text-green-600',  bg: 'bg-green-50',  label: '上线' },
                                        'leave':           { icon: 'fa-user-minus', color: 'text-slate-500',  bg: 'bg-slate-50',  label: '离线' },
                                        'fullscreen-exit': { icon: 'fa-compress',   color: 'text-orange-500', bg: 'bg-orange-50', label: '退出全屏' },
                                        'tab-hidden':      { icon: 'fa-eye-slash',  color: 'text-red-500',    bg: 'bg-red-50',    label: '切换页面' },
                                    };
                                    const cfg = configs[entry.type] || { icon: 'fa-circle-info', color: 'text-blue-500', bg: 'bg-blue-50', label: entry.type };
                                    return (
                                        <div key={i} className={`flex items-center space-x-3 px-3 py-2 rounded-lg ${cfg.bg}`}>
                                            <i className={`fas ${cfg.icon} ${cfg.color} w-4 shrink-0`}></i>
                                            <span className={`font-bold ${cfg.color} w-16 shrink-0`}>{cfg.label}</span>
                                            <span className="text-slate-600 font-mono text-xs flex-1 truncate">{entry.ip}</span>
                                            <span className="text-slate-400 text-xs shrink-0">{timeStr}</span>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}

            {isHost && showSettings && (
                <SettingsPanel settings={settings} onSettingsChange={onSettingsChange} socket={socketRef.current} onClose={() => setShowSettings(false)} zIndex="z-[9998]" />
            )}

            {isHost && showClassroomView && (
                <ClassroomView onClose={() => setShowClassroomView(false)} socket={socketRef.current} studentLog={studentLog} />
            )}

            <div className="fixed top-24 right-6 z-50 flex flex-col space-y-3 pointer-events-none">
                {toasts.map(t => (
                    <div key={t.id} className={`px-4 py-3 rounded-xl shadow-xl border backdrop-blur-md font-bold text-sm md:text-base flex items-center toast-animate ${t.type === 'success' ? 'bg-green-500/90 border-green-400 text-white' : 'bg-orange-500/90 border-orange-400 text-white'}`}>
                        {t.message}
                    </div>
                ))}
            </div>
            <style>{`
                @keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
                .toast-animate { animation: slideInRight 0.3s ease-out forwards; }
            `}</style>
        </div>
    );
}
