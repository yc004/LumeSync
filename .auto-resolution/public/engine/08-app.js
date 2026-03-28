// ========================================================
// 主应用组件 + 启动入口
// ========================================================
const ensurePdfJsLoaded = async () => {
    if (window.pdfjsLib && typeof window.pdfjsLib.getDocument === 'function') return true;
    const ok = await loadScriptWithFallback(
        '/lib/pdf.min.js',
        'https://fastly.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js'
    );
    if (!ok || !window.pdfjsLib) return false;
    try {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/lib/pdf.worker.min.js';
    } catch (_) {}
    return true;
};

const getPdfDoc = (pdfUrl) => {
    if (!window.__LumeSyncPdfDocCache) window.__LumeSyncPdfDocCache = new Map();
    const cache = window.__LumeSyncPdfDocCache;
    const key = String(pdfUrl || '');
    if (!key) return Promise.reject(new Error('Missing pdfUrl'));
    const existing = cache.get(key);
    if (existing) return existing;
    const p = window.pdfjsLib.getDocument({ url: key }).promise;
    cache.set(key, p);
    return p;
};

function PdfPageSlide({ pdfUrl, pageNumber }) {
    const canvasRef = useRef(null);
    const [status, setStatus] = useState('loading');

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                setStatus('loading');
                const doc = await getPdfDoc(pdfUrl);
                const page = await doc.getPage(pageNumber);
                if (cancelled) return;

                const canvas = canvasRef.current;
                if (!canvas) return;

                const ctx = canvas.getContext('2d', { alpha: false });
                if (!ctx) throw new Error('Canvas context not available');

                const padding = 24;
                const maxW = 1280 - padding * 2;
                const maxH = 720 - padding * 2;

                const baseViewport = page.getViewport({ scale: 1 });
                const scale = Math.max(0.1, Math.min(maxW / baseViewport.width, maxH / baseViewport.height));
                const viewport = page.getViewport({ scale });

                const outputScale = window.devicePixelRatio || 1;
                canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
                canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
                canvas.style.width = Math.floor(viewport.width) + 'px';
                canvas.style.height = Math.floor(viewport.height) + 'px';

                ctx.setTransform(1, 0, 0, 1, 0, 0);
                if (outputScale !== 1) ctx.scale(outputScale, outputScale);

                await page.render({ canvasContext: ctx, viewport }).promise;
                if (cancelled) return;
                setStatus('done');
            } catch (err) {
                if (cancelled) return;
                console.error('[PDF] render failed:', err);
                setStatus('error');
            }
        })();

        return () => { cancelled = true; };
    }, [pdfUrl, pageNumber]);

    return (
        <div className="w-full h-full bg-slate-50 flex items-center justify-center relative">
            <canvas ref={canvasRef} className="bg-white rounded-xl shadow-xl" />
            {status === 'loading' && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="px-4 py-2 rounded-xl bg-white/90 border border-slate-200 text-slate-600 font-bold">
                        正在渲染 PDF...
                    </div>
                </div>
            )}
            {status === 'error' && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="px-4 py-2 rounded-xl bg-red-50 border border-red-200 text-red-600 font-bold">
                        PDF 渲染失败
                    </div>
                </div>
            )}
            <div className="absolute bottom-4 right-4 px-2 py-1 rounded-lg bg-white/90 border border-slate-200 text-slate-600 text-xs font-bold">
                {pageNumber}
            </div>
        </div>
    );
}

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
    const [loadingProgress, setLoadingProgress] = useState({
        currentStep: '',
        currentFile: '',
        progress: 0,
        totalSteps: 0,
        currentStepIndex: 0
    });

    const DEFAULT_SETTINGS = {
        forceFullscreen: true,
        syncFollow: true,
        allowInteract: true,
        syncInteraction: false,  // 默认关闭教师交互同步
        podiumAtTop: true,
        renderScale: 0.96,
        uiScale: 1.0,
        alertJoin: true,
        alertLeave: true,
        alertFullscreenExit: true,
        alertTabHidden: true,
    };
    const [settings, setSettings] = useState(DEFAULT_SETTINGS);
    const [studentCount, setStudentCount] = useState(0);
    const [sharedStudentLog, setSharedStudentLog] = useState([]);
    const [studentInfo, setStudentInfo] = useState({ ip: '', name: '', studentId: '' });
    const socketRef = useRef(null);
    const courseCatalogRef = useRef([]);
    const settingsRef = useRef(settings);
    const studentCountPollRef = useRef(null);
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
        let next = { ...settingsRef.current, [key]: value };
        
        // 特殊处理：如果是多项更新（传入对象）
        if (typeof key === 'object' && key !== null) {
            next = { ...settingsRef.current, ...key };
        }
        
        setSettings(next);
        if (socketRef.current) socketRef.current.emit('host-settings', next);
        window.electronAPI?.saveSettings?.(next);
    };

    useEffect(() => {
        socketRef.current = window.io();
        // 将 socket 引用暴露到全局，供 CourseGlobalContext.syncInteraction 使用
        window.socketRef = socketRef;

        socketRef.current.on('role-assigned', (data) => {
            setIsHost(data.role === 'host');
            // 处理 courseCatalog 可能是对象 {courses: [...], folders: [...]} 或数组的情况
            let catalog = data.courseCatalog || [];
            if (!Array.isArray(catalog) && catalog.courses) {
                // 如果是完整对象，保持完整对象格式
                catalog = catalog;
            } else if (Array.isArray(catalog) && !catalog.folders) {
                // 如果是数组且没有 folders 属性，转换为完整对象格式
                catalog = { courses: catalog, folders: data.folders || [] };
            }
            setCourseCatalog(catalog);
            courseCatalogRef.current = catalog;
            setCurrentCourseId(data.currentCourseId);
            setRoleAssigned(true);

            // 存储学生信息（从服务器座位表获取）
            if (data.role !== 'host') {
                setStudentInfo({
                    ip: data.clientIp || '',
                    name: data.studentInfo?.name || '',
                    studentId: data.studentInfo?.studentId || ''
                });
            }

            if (data.role !== 'host' && data.hostSettings) {
                setSettings(s => ({ ...s, ...data.hostSettings }));
                const fs = data.hostSettings?.forceFullscreen ?? true;
                window.electronAPI?.setFullscreen(fs);
            }

            if (data.currentCourseId) {
                setInitialSlideIndex(data.currentSlideIndex || 0);
                loadCourse(data.currentCourseId, catalog);
                if (data.role !== 'host') {
                    const fs = data.hostSettings?.forceFullscreen ?? true;
                    window.electronAPI?.classStarted({ forceFullscreen: fs });
                }
            }

            if (data.role === 'host') {
                socketRef.current.emit('get-student-count');
                socketRef.current.emit('host-settings', settingsRef.current);
                if (!studentCountPollRef.current) {
                    studentCountPollRef.current = setInterval(() => {
                        try {
                            if (socketRef.current && socketRef.current.connected) {
                                socketRef.current.emit('get-student-count');
                            }
                        } catch (_) {}
                    }, 3000);
                }
            } else {
                if (studentCountPollRef.current) {
                    clearInterval(studentCountPollRef.current);
                    studentCountPollRef.current = null;
                }
            }
        });

        socketRef.current.on('student-status', (data) => { setStudentCount(data.count); });

        socketRef.current.on('host-settings', (s) => {
            setSettings(prev => {
                const next = { ...prev, ...s };
                window.electronAPI?.setFullscreen(next.forceFullscreen);
                return next;
            });
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
            // 处理 data.courses 可能是对象 {courses: [...], folders: [...]} 或数组的情况
            let catalog = data.courses || [];
            if (!Array.isArray(catalog) && catalog.courses) {
                // 如果是完整对象，保持完整对象格式
                catalog = catalog;
            } else if (Array.isArray(catalog) && !catalog.folders) {
                // 如果是数组且没有 folders 属性，转换为完整对象格式
                catalog = { courses: catalog, folders: data.folders || [] };
            }
            setCourseCatalog(catalog);
            courseCatalogRef.current = catalog;
        });

        socketRef.current.on('student-log-entry', (entry) => {
            setSharedStudentLog(prev => [...prev, entry].slice(-500));
        });

        fetch('/api/student-log').then(r => r.json()).then(d => {
            setSharedStudentLog(d.log || []);
        }).catch(() => {});

        return () => {
            if (studentCountPollRef.current) {
                clearInterval(studentCountPollRef.current);
                studentCountPollRef.current = null;
            }
            if (socketRef.current) socketRef.current.disconnect();
        };
    }, []);

    const loadCourse = async (courseId, catalog) => {
        let courseList = catalog || courseCatalogRef.current;
        // 处理 courseList 可能是对象 {courses: [...], folders: [...]} 的情况
        if (courseList && !Array.isArray(courseList) && courseList.courses) {
            courseList = courseList.courses;
        }
        const course = courseList.find(c => c.id === courseId);
        if (!course) {
            console.error('[ClassroomApp] course not found: ' + courseId);
            return;
        }

        setIsLoading(true);
        setCourseError(null);

        const courseFileLower = String(course.file || '').toLowerCase();
        if (courseFileLower.endsWith('.pdf')) {
            try {
                setLoadingProgress({
                    currentStep: '正在初始化 PDF 播放器',
                    currentFile: 'pdf.js',
                    progress: 10,
                    totalSteps: 3,
                    currentStepIndex: 1
                });

                const ok = await ensurePdfJsLoaded();
                if (!ok) throw new Error('PDF 渲染库加载失败');

                const pdfUrl = `/courses/${course.file}`;
                setLoadingProgress({
                    currentStep: '正在解析 PDF 页数',
                    currentFile: course.file,
                    progress: 50,
                    totalSteps: 3,
                    currentStepIndex: 2
                });

                const doc = await getPdfDoc(pdfUrl);
                const pageCount = Math.max(1, Number(doc.numPages || 1));
                const slides = Array.from({ length: pageCount }, (_, idx) => ({
                    id: `page-${idx + 1}`,
                    component: <PdfPageSlide pdfUrl={pdfUrl} pageNumber={idx + 1} />
                }));

                window.CourseGlobalContext = {
                    canvas: window.__LumeSyncCanvas,
                    getCamera: (onStream) => {
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
                    // 教师交互同步 API
                    syncInteraction: (event, payload = {}) => {
                        if (window.socketRef && window.socketRef.current) {
                            window.socketRef.current.emit('interaction:sync', { event, payload });
                        }
                    },
                };

                setCurrentCourseData({
                    id: course.id,
                    title: course.title || course.id,
                    icon: course.icon || '📄',
                    desc: course.desc || 'PDF课件',
                    color: course.color || 'from-rose-500 to-orange-600',
                    slides
                });

                setLoadingProgress({
                    currentStep: '加载完成',
                    currentFile: '',
                    progress: 100,
                    totalSteps: 3,
                    currentStepIndex: 3
                });
            } catch (err) {
                console.error('[ClassroomApp] load pdf failed:', err);
                setCourseError(err);
            } finally {
                setIsLoading(false);
            }
            return;
        }

        // 计算总步骤数
        let totalSteps = 3; // 基础步骤：获取课程、编译、执行
        let depCount = 0;

        try {
            const scriptUrl = `/courses/${course.file}`;
            window.CourseData = null;

            setLoadingProgress({
                currentStep: '正在获取课程文件',
                currentFile: course.file,
                progress: 5,
                totalSteps,
                currentStepIndex: 1
            });

            const response = await fetch(scriptUrl);
            if (!response.ok) throw new Error(`Failed to fetch ${scriptUrl}`);
            const scriptContent = await response.text();

            setLoadingProgress(prev => ({
                ...prev,
                currentStep: '正在编译课程脚本',
                currentFile: course.file,
                progress: 15,
                currentStepIndex: 2
            }));

            let compiledCode;
            if (window.Babel) {
                try {
                    const babelFilename = String(course.file || '').toLowerCase().endsWith('.lume')
                        ? String(course.file).replace(/\.lume$/i, '.tsx')
                        : course.file;
                    const result = window.Babel.transform(scriptContent, { presets: ['react', 'typescript'], filename: babelFilename });
                    compiledCode = result.code;
                } catch (babelErr) {
                    console.error('[ClassroomApp] Babel compile error:', babelErr);
                    throw babelErr;
                }
            } else {
                compiledCode = scriptContent;
            }

            setLoadingProgress(prev => ({
                ...prev,
                currentStep: '正在执行课程脚本',
                progress: 25,
                currentStepIndex: 3
            }));

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
                // 计算依赖和模型的步骤数
                if (window.CourseData.dependencies && window.CourseData.dependencies.length > 0) {
                    depCount = window.CourseData.dependencies.length;
                    totalSteps += depCount;
                }
                if (window.CourseData.modelsUrls) {
                    totalSteps += 1;
                }

                // 更新总步骤数
                setLoadingProgress(prev => ({ ...prev, totalSteps }));

                // 加载依赖脚本
                if (window.CourseData.dependencies && window.CourseData.dependencies.length > 0) {
                    const depMappings = window.CourseData.dependencies
                        .filter(d => d.localSrc && d.publicSrc)
                        .map(d => ({ filename: d.localSrc.split('/').pop(), publicSrc: d.publicSrc }));
                    if (depMappings.length > 0) socketRef.current.emit('register-dependencies', depMappings);

                    let depIndex = 0;
                    for (const dep of window.CourseData.dependencies) {
                        const fileName = dep.localSrc.split('/').pop();
                        setLoadingProgress({
                            currentStep: '正在加载依赖脚本',
                            currentFile: fileName,
                            progress: 30 + (depIndex / depCount) * 40,
                            totalSteps,
                            currentStepIndex: 4 + depIndex
                        });
                        await loadScriptWithFallback(dep.localSrc, dep.publicSrc);
                        depIndex++;
                    }
                }

                // 加载模型URL
                if (window.CourseData.modelsUrls) {
                    setLoadingProgress({
                        currentStep: '正在检查模型库可用性',
                        currentFile: 'face-api models',
                        progress: 75,
                        totalSteps,
                        currentStepIndex: 4 + depCount
                    });
                    const bestModelUrl = await checkModelUrlValidity(window.CourseData.modelsUrls);
                    window.CourseGlobalContext = {
                        modelUrl: bestModelUrl,
                        canvas: window.__LumeSyncCanvas,
                        getCamera: (onStream) => {
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
                        // 教师交互同步 API
                        syncInteraction: (event, payload = {}) => {
                            if (window.socketRef && window.socketRef.current) {
                                window.socketRef.current.emit('interaction:sync', { event, payload });
                            }
                        },
                    };
                } else {
                    window.CourseGlobalContext = {
                        canvas: window.__LumeSyncCanvas,
                        getCamera: (onStream) => {
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
                        // 教师交互同步 API
                        syncInteraction: (event, payload = {}) => {
                            if (window.socketRef && window.socketRef.current) {
                                window.socketRef.current.emit('interaction:sync', { event, payload });
                            }
                        },
                    };
                }

                setLoadingProgress({
                    currentStep: '正在初始化课程数据',
                    progress: 90,
                    totalSteps,
                    currentStepIndex: totalSteps - 1
                });

                setCurrentCourseData(window.CourseData);

                setLoadingProgress({
                    currentStep: '加载完成',
                    currentFile: '',
                    progress: 100,
                    totalSteps,
                    currentStepIndex: totalSteps
                });
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
        return <StudentWaitingRoom forceFullscreen={settings.forceFullscreen} />;
    }

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white select-none px-8">
                <i className="fas fa-layer-group fa-bounce text-6xl text-purple-500 mb-8"></i>

                <h2 className="text-3xl tracking-widest font-bold mb-3">正在加载课程内容...</h2>

                {/* 进度条 */}
                <div className="w-80 h-2 bg-slate-700 rounded-full overflow-hidden mb-4">
                    <div
                        className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300 ease-out"
                        style={{ width: `${loadingProgress.progress}%` }}
                    ></div>
                </div>

                {/* 当前步骤和文件 */}
                <div className="text-center space-y-2">
                    <p className="text-lg text-slate-200 font-medium">
                        {loadingProgress.currentStep}
                    </p>
                    {loadingProgress.currentFile && (
                        <p className="text-sm text-slate-400 font-mono flex items-center justify-center">
                            <i className="fas fa-file-code mr-2 text-yellow-400"></i>
                            {loadingProgress.currentFile}
                        </p>
                    )}
                </div>

                {/* 步骤进度 */}
                <div className="mt-6 text-sm text-slate-500">
                    步骤 {loadingProgress.currentStepIndex} / {loadingProgress.totalSteps}
                </div>

                <p className="text-slate-400 mt-4 text-sm flex items-center">
                    <i className="fas fa-bolt text-yellow-400 mr-2"></i> 请稍候，正在准备课堂环境
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
            <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white select-none px-8">
                <i className="fas fa-layer-group fa-bounce text-6xl text-purple-500 mb-8"></i>
                <h2 className="text-3xl tracking-widest font-bold mb-3">正在加载课程内容...</h2>
                <p className="text-slate-400 mt-4 text-sm flex items-center">
                    <i className="fas fa-bolt text-yellow-400 mr-2"></i> 请稍候，正在准备课堂环境
                </p>
            </div>
        );
    }

    return (
        <CourseErrorBoundary courseId={currentCourseId} onEndCourse={isHost ? handleEndCourse : null}>
            <SyncClassroom
                courseId={currentCourseId}
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
                studentInfo={studentInfo}
            />
        </CourseErrorBoundary>
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
