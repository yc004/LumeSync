// ========================================================
// 主应用组件 + 启动入口
// ========================================================
function ClassroomApp() {
    const [isHost, setIsHost] = useState(false);
    const [roleAssigned, setRoleAssigned] = useState(false);
    const [courseCatalog, setCourseCatalog] = useState([]);
    const [currentCourseId, setCurrentCourseId] = useState(null);
    const [currentCourseData, setCurrentCourseData] = useState(null);
    const [initialSlideIndex, setInitialSlideIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [courseError, setCourseError] = useState(null);
    const [copyDone, setCopyDone] = useState(false);

    const DEFAULT_SETTINGS = {
        forceFullscreen: true,
        syncFollow: true,
        alertJoin: true,
        alertLeave: true,
        alertFullscreenExit: true,
        alertTabHidden: true,
    };
    const [settings, setSettings] = useState(DEFAULT_SETTINGS);
    const [studentCount, setStudentCount] = useState(0);
    const [sharedStudentLog, setSharedStudentLog] = useState([]);
    const socketRef = useRef(null);
    const courseCatalogRef = useRef([]);
    const settingsRef = useRef(settings);
    useEffect(() => { settingsRef.current = settings; }, [settings]);

    useEffect(() => {
        if (window.electronAPI?.getSettings) {
            window.electronAPI.getSettings().then(saved => {
                if (!saved) return;
                const next = { ...settingsRef.current, ...saved };
                settingsRef.current = next;
                setSettings(next);
                if (socketRef.current && socketRef.current.connected) {
                    socketRef.current.emit('host-settings', next);
                }
            });
        }
    }, []);

    const handleSettingsChange = (key, value) => {
        const next = { ...settingsRef.current, [key]: value };
        setSettings(next);
        if (socketRef.current) socketRef.current.emit('host-settings', next);
        window.electronAPI?.saveSettings?.(next);
    };

    useEffect(() => {
        socketRef.current = window.io();

        socketRef.current.on('role-assigned', (data) => {
            setIsHost(data.role === 'host');
            const catalog = data.courseCatalog || [];
            setCourseCatalog(catalog);
            courseCatalogRef.current = catalog;
            setCurrentCourseId(data.currentCourseId);
            setRoleAssigned(true);

            if (data.currentCourseId) {
                setInitialSlideIndex(data.currentSlideIndex || 0);
                loadCourse(data.currentCourseId, catalog);
                if (data.role !== 'host') {
                    const fs = data.hostSettings?.forceFullscreen ?? true;
                    if (data.hostSettings) setSettings(s => ({ ...s, ...data.hostSettings }));
                    window.electronAPI?.classStarted({ forceFullscreen: fs });
                }
            }

            if (data.role === 'host') {
                socketRef.current.emit('get-student-count');
                socketRef.current.emit('host-settings', settingsRef.current);
            }
        });

        socketRef.current.on('student-status', (data) => { setStudentCount(data.count); });

        socketRef.current.on('host-settings', (s) => {
            setSettings(s);
            window.electronAPI?.setFullscreen(s.forceFullscreen);
        });

        socketRef.current.on('set-admin-password', (data) => {
            window.electronAPI?.setAdminPassword?.(data.hash);
        });

        socketRef.current.on('course-changed', (data) => {
            setCurrentCourseId(data.courseId);
            setInitialSlideIndex(data.slideIndex || 0);
            loadCourse(data.courseId, courseCatalogRef.current);
            const fs = data.hostSettings?.forceFullscreen ?? true;
            if (data.hostSettings) setSettings(s => ({ ...s, ...data.hostSettings }));
            window.electronAPI?.classStarted({ forceFullscreen: fs });
        });

        socketRef.current.on('course-ended', () => {
            setCurrentCourseId(null);
            setCurrentCourseData(null);
            window.CourseData = null;
            window.CameraManager.release();
            if (window._onCamActive) window._onCamActive(false);
            window.electronAPI?.classEnded();
        });

        socketRef.current.on('course-catalog-updated', (data) => {
            setCourseCatalog(data.courses);
            courseCatalogRef.current = data.courses;
        });

        socketRef.current.on('student-log-entry', (entry) => {
            setSharedStudentLog(prev => [...prev, entry].slice(-500));
        });

        fetch('/api/student-log').then(r => r.json()).then(d => {
            setSharedStudentLog(d.log || []);
        }).catch(() => {});

        return () => { if (socketRef.current) socketRef.current.disconnect(); };
    }, []);

    const loadCourse = async (courseId, catalog) => {
        const courseList = catalog || courseCatalogRef.current;
        const course = courseList.find(c => c.id === courseId);
        if (!course) {
            console.error('[ClassroomApp] course not found: ' + courseId);
            return;
        }

        setIsLoading(true);
        setCourseError(null);

        try {
            const scriptUrl = `/courses/${course.file}`;
            window.CourseData = null;

            const response = await fetch(scriptUrl);
            if (!response.ok) throw new Error(`Failed to fetch ${scriptUrl}`);
            const scriptContent = await response.text();

            let compiledCode;
            if (window.Babel) {
                try {
                    const result = window.Babel.transform(scriptContent, { presets: ['react', 'typescript'], filename: course.file });
                    compiledCode = result.code;
                } catch (babelErr) {
                    console.error('[ClassroomApp] Babel compile error:', babelErr);
                    throw babelErr;
                }
            } else {
                compiledCode = scriptContent;
            }

            try {
                const runCode = new Function(compiledCode);
                runCode();
            } catch (execErr) {
                console.error('[ClassroomApp] exec error:', execErr);
                throw execErr;
            }

            let retries = 100;
            while (!window.CourseData && retries > 0) {
                await new Promise(r => setTimeout(r, 100));
                retries--;
            }

            if (window.CourseData) {
                if (window.CourseData.dependencies && window.CourseData.dependencies.length > 0) {
                    const depMappings = window.CourseData.dependencies
                        .filter(d => d.localSrc && d.publicSrc)
                        .map(d => ({ filename: d.localSrc.split('/').pop(), publicSrc: d.publicSrc }));
                    if (depMappings.length > 0) socketRef.current.emit('register-dependencies', depMappings);

                    for (const dep of window.CourseData.dependencies) {
                        await loadScriptWithFallback(dep.localSrc, dep.publicSrc);
                    }
                }

                window.CourseGlobalContext = {
                    // 课件调用此方法获取摄像头流，同时通知引擎显示摄像头选择器
                    // onStream(stream) 可选，每次设备切换时会被回调
                    getCamera: (onStream) => {
                        // 通知引擎层激活摄像头选择器
                        // 用 setTimeout(0) 确保 SyncClassroom 的 useEffect 已完成注册
                        if (window._onCamActive) {
                            window._onCamActive(true);
                        } else {
                            setTimeout(() => {
                                if (window._onCamActive) window._onCamActive(true);
                            }, 0);
                        }
                        return window.CameraManager.getStream(onStream);
                    },
                    releaseCamera: () => window.CameraManager.release(),
                    unregisterCamera: (onStream) => window.CameraManager.unregister(onStream),
                };
                if (window.CourseData.modelsUrls) {
                    const bestModelUrl = await checkModelUrlValidity(window.CourseData.modelsUrls);
                    window.CourseGlobalContext.modelUrl = bestModelUrl;
                }

                setCurrentCourseData(window.CourseData);
            }
        } catch (err) {
            console.error('[ClassroomApp] load course failed:', err);
            setCourseError(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRefreshCourses = () => {
        if (socketRef.current) socketRef.current.emit('refresh-courses');
    };

    const handleEndCourse = () => {
        if (socketRef.current && isHost) socketRef.current.emit('end-course');
    };

    if (!roleAssigned) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white select-none">
                <i className="fas fa-network-wired fa-fade text-5xl text-blue-500 mb-6"></i>
                <h2 className="text-2xl tracking-widest font-bold">正在连接课堂服务器...</h2>
                <p className="text-slate-400 mt-2">正在验证身份并分配权限</p>
            </div>
        );
    }

    if (isHost && !currentCourseId) {
        return (
            <CourseSelector
                courses={courseCatalog}
                currentCourseId={currentCourseId}
                onSelectCourse={(id) => setCurrentCourseId(id)}
                onRefresh={handleRefreshCourses}
                socket={socketRef.current}
                settings={settings}
                onSettingsChange={handleSettingsChange}
                studentCount={studentCount}
                studentLog={sharedStudentLog}
            />
        );
    }

    if (!isHost && !currentCourseId) {
        return <StudentWaitingRoom />;
    }

    if (isLoading) {
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

    if (courseError && !currentCourseData) {
        const errorText = courseError.message || String(courseError);
        const handleCopy = () => {
            navigator.clipboard.writeText(errorText).then(() => {
                setCopyDone(true);
                setTimeout(() => setCopyDone(false), 2000);
            });
        };
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white select-none p-8">
                <i className="fas fa-circle-exclamation text-5xl text-red-400 mb-6"></i>
                <h2 className="text-2xl font-bold mb-2">课程加载失败</h2>
                {isHost ? (
                    <div className="mt-4 w-full max-w-2xl">
                        <div className="bg-red-950/60 border border-red-500/40 rounded-2xl p-6 text-left">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-red-300 font-bold flex items-center"><i className="fas fa-bug mr-2"></i> 错误详情</p>
                                <button onClick={handleCopy} className={`flex items-center px-3 py-1 rounded-lg text-xs font-bold transition-colors ${copyDone ? 'bg-green-600 text-white' : 'bg-red-900/60 hover:bg-red-800/60 text-red-300'}`}>
                                    <i className={`fas ${copyDone ? 'fa-check' : 'fa-copy'} mr-1.5`}></i>
                                    {copyDone ? '已复制' : '复制'}
                                </button>
                            </div>
                            <pre className="text-red-200 text-sm font-mono whitespace-pre-wrap break-all leading-relaxed">{errorText}</pre>
                        </div>
                        <button onClick={() => { setCourseError(null); setCurrentCourseId(null); }} className="mt-6 px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold transition-colors">
                            <i className="fas fa-arrow-left mr-2"></i> 返回课程选择
                        </button>
                    </div>
                ) : (
                    <p className="text-slate-400 mt-2">请等待老师重新加载课程</p>
                )}
            </div>
        );
    }

    if (!currentCourseData) {
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

    return (
        <SyncClassroom
            title={currentCourseData.title}
            slides={currentCourseData.slides}
            onEndCourse={isHost ? handleEndCourse : null}
            socket={socketRef.current}
            isHost={isHost}
            initialSlide={initialSlideIndex}
            settings={settings}
            onSettingsChange={handleSettingsChange}
            studentCount={studentCount}
            studentLog={sharedStudentLog}
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
    console.log('[SyncEngine] starting...');
    root.render(<ClassroomApp />);
};

bootEngine();
