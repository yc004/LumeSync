// ========================================================
// Error Boundary: 捕获课件运行时错误，防止整个课堂崩溃
// ========================================================
class CourseErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('[CourseErrorBoundary] 课件运行时错误:', error, errorInfo);
        this.setState({ errorInfo });

        // 可选：上报错误到服务器
        if (window.socket && window.socket.connected) {
            try {
                window.socket.emit('course-runtime-error', {
                    courseId: this.props.courseId,
                    error: error.message,
                    stack: error.stack
                });
            } catch (_) {}
        }
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white px-8">
                    <div className="max-w-2xl w-full">
                        <div className="flex items-center mb-6">
                            <i className="fas fa-exclamation-triangle text-red-500 text-5xl mr-4"></i>
                            <div>
                                <h2 className="text-2xl font-bold text-red-400">课件运行时错误</h2>
                                <p className="text-slate-400 text-sm mt-1">课程内容出现问题，但不影响课堂继续运行</p>
                            </div>
                        </div>

                        <div className="bg-slate-800 rounded-lg p-4 mb-6">
                            <p className="text-red-300 font-mono text-sm break-words">
                                {this.state.error?.toString() || '未知错误'}
                            </p>
                        </div>

                        {this.props.onEndCourse && (
                            <div className="flex gap-4 justify-center">
                                <button
                                    onClick={() => {
                                        this.setState({ hasError: false, error: null, errorInfo: null });
                                        window.location.reload();
                                    }}
                                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition"
                                >
                                    <i className="fas fa-redo mr-2"></i>重新加载
                                </button>
                                <button
                                    onClick={this.props.onEndCourse}
                                    className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-medium transition"
                                >
                                    <i className="fas fa-sign-out-alt mr-2"></i>结束课程
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

// ========================================================
// 课堂主界面组件（教师端 + 学生端共用）
// ========================================================
function SyncClassroom({ courseId, title, slides, onEndCourse, socket, isHost: initialIsHost, initialSlide, settings, onSettingsChange, studentCount, studentLog, studentInfo, hideTopBar = false, hideBottomBar = false }) {
    const [currentSlide, setCurrentSlide] = useState(initialSlide || 0);
    const [isHost, setIsHost] = useState(initialIsHost || false);
    const [roleAssigned, setRoleAssigned] = useState(true);
    const [toasts, setToasts] = useState([]);
    const [showLog, setShowLog] = useState(false);
    const [showClassroomView, setShowClassroomView] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [annotateEnabled, setAnnotateEnabled] = useState(false);
    const [voteToolbarState, setVoteToolbarState] = useState({
        visible: false,
        voteId: '',
        question: '',
        anonymous: false,
        status: 'idle',
        durationSec: 60,
        remainingSec: 0,
        result: null,
        canStart: false
    });
    const [showVoteResultPanel, setShowVoteResultPanel] = useState(false);
    const [showSubmissionsPanel, setShowSubmissionsPanel] = useState(false);
    const [submissionsFiles, setSubmissionsFiles] = useState([]);
    const [submissionsLoading, setSubmissionsLoading] = useState(false);
    const [previewFile, setPreviewFile] = useState(null); // 当前预览的文件
    const [previewContent, setPreviewContent] = useState(null); // 预览内容

    const [annoPopupType, setAnnoPopupType] = useState(null);

    const liquidGlassDarkClass = window.__LumeSyncUI?.styles?.liquidGlassDark || 'bg-slate-900/70 backdrop-blur-xl border border-white/15 shadow-[0_10px_30px_rgba(15,23,42,0.45)]';
    const liquidGlassLightClass = window.__LumeSyncUI?.styles?.liquidGlassLight || 'bg-white/75 backdrop-blur-xl border border-white/70 shadow-[0_10px_30px_rgba(15,23,42,0.2)]';

    const [annoTool, setAnnoTool] = useState('pen'); // pen | marker | highlighter | eraser
    const [annoWidth, setAnnoWidth] = useState(4);
    const [annoColor, setAnnoColor] = useState('#ef4444');

    // 强制渲染计数器，用于课件变量变化时触发重新渲染（已废弃）
    const [renderCounter] = useState(0);

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
    const uiScale = (typeof settings?.uiScale === 'number' && Number.isFinite(settings.uiScale))
        ? Math.min(Math.max(settings.uiScale, 0.8), 1.2)
        : 1.0;

    const annoCanvasRef = useRef(null);
    const annoIsDrawingRef = useRef(false);
    const annoLastPointRef = useRef(null);
    const annoLastSendAtRef = useRef(0);
    const annoSegmentsRef = useRef(new Map());
    const annoPenRef = useRef({ tool: 'pen', color: '#ef4444', width: 4, alpha: 1 });
    const annoStrokePointsRef = useRef([]);

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



    // 自动同步机制：课件注册的变量
    const syncVarsRef = useRef(new Map()); // key -> { value, onChange, sync: boolean }

    // 学生信息（仅学生端）
    const studentInfoRef = useRef({
        ip: '',
        name: '',
        studentId: ''
    });

    // 更新学生信息 ref
    useEffect(() => {
        if (studentInfo) {
            studentInfoRef.current = {
                ip: studentInfo.ip || '',
                name: studentInfo.name || '',
                studentId: studentInfo.studentId || ''
            };
        }
    }, [studentInfo]);

    // 在组件渲染时立即注册 API 函数到全局（课件渲染时会调用）
    if (window.CourseGlobalContext) {
        window.CourseGlobalContext.isHost = !!isHost;
        window.CourseGlobalContext.getSocket = () => socketRef.current;
        window.CourseGlobalContext.getCurrentCourseMeta = () => ({ courseId, slideIndex: currentSlide });
        window.CourseGlobalContext.setVoteToolbarState = (patch = {}) => {
            setVoteToolbarState(prev => ({ ...prev, ...patch, visible: true }));
        };
        window.CourseGlobalContext.clearVoteToolbarState = () => {
            setVoteToolbarState({
                visible: false,
                voteId: '',
                question: '',
                anonymous: false,
                status: 'idle',
                durationSec: 60,
                remainingSec: 0,
                result: null,
                canStart: false
            });
            setShowVoteResultPanel(false);
        };


        window.CourseGlobalContext.useSyncVar = (key, initialValue, options = {}) => {
            const { onChange = null } = options;

            // 初始化存储（如果不存在）
            if (!syncVarsRef.current.has(key)) {
                const resolvedInitialValue = typeof initialValue === 'function' ? initialValue() : initialValue;
                syncVarsRef.current.set(key, {
                    value: resolvedInitialValue,
                    sync: true,
                    onChange,
                    listeners: new Set()
                });
            } else {
                const existed = syncVarsRef.current.get(key);
                existed.sync = true;
                existed.onChange = onChange;
            }

            const varData = syncVarsRef.current.get(key);

            // 使用 React state 让组件能重新渲染
            const [localVal, setLocalVal] = useState(() => varData.value);

            // 监听外部（同步或其它组件）的变化
            useEffect(() => {
                const listener = (newVal) => setLocalVal(newVal);
                varData.listeners.add(listener);

                // 初次挂载时同步一次值
                setLocalVal(varData.value);

                return () => varData.listeners.delete(listener);
            }, [varData]);

            // 设置新值并同步
            const setValue = React.useCallback((newValueOrUpdater) => {
                const oldValue = varData.value;
                const nextValue = (typeof newValueOrUpdater === 'function')
                    ? newValueOrUpdater(oldValue)
                    : newValueOrUpdater;
                varData.value = nextValue;

                // 通知所有使用这个 key 的组件更新
                varData.listeners.forEach(l => l(nextValue));

                // 本地触发 onChange
                if (typeof onChange === 'function') {
                    onChange(nextValue, oldValue);
                }

                // 教师端自动同步到学生端
                if (isHost && socketRef.current && settingsRef.current.syncInteraction) {
                    socketRef.current.emit('sync-var', {
                        courseId,
                        slideIndex: currentSlide,
                        key,
                        value: nextValue
                    });
                }
            }, [key, onChange, isHost, currentSlide]);

            return [localVal, setValue];
        };

        // 注册不需要同步的本地变量 Hook
        window.CourseGlobalContext.useLocalVar = (key, initialValue, options = {}) => {
            const { onChange = null } = options;

            if (!syncVarsRef.current.has(key)) {
                const resolvedInitialValue = typeof initialValue === 'function' ? initialValue() : initialValue;
                syncVarsRef.current.set(key, {
                    value: resolvedInitialValue,
                    sync: false,
                    onChange,
                    listeners: new Set()
                });
            } else {
                const existed = syncVarsRef.current.get(key);
                existed.sync = false;
                existed.onChange = onChange;
            }

            const varData = syncVarsRef.current.get(key);
            const [localVal, setLocalVal] = useState(() => varData.value);

            useEffect(() => {
                const listener = (newVal) => setLocalVal(newVal);
                varData.listeners.add(listener);
                setLocalVal(varData.value);
                return () => varData.listeners.delete(listener);
            }, [varData]);

            const setValue = React.useCallback((newValueOrUpdater) => {
                const oldValue = varData.value;
                const nextValue = (typeof newValueOrUpdater === 'function')
                    ? newValueOrUpdater(oldValue)
                    : newValueOrUpdater;
                varData.value = nextValue;
                varData.listeners.forEach(l => l(nextValue));

                if (typeof onChange === 'function') {
                    onChange(nextValue, oldValue);
                }
            }, [key, onChange]);

            return [localVal, setValue];
        };
        
        // 保留旧的 API 以防代码不兼容，但旧的不会触发重新渲染
        window.CourseGlobalContext.registerSyncVar = (key, initialValue, options = {}) => {
            const [val, setVal] = window.CourseGlobalContext.useSyncVar(key, initialValue, options);
            return { get: () => val, set: setVal };
        };
        window.CourseGlobalContext.registerVar = (key, initialValue, options = {}) => {
            const [val, setVal] = window.CourseGlobalContext.useLocalVar(key, initialValue, options);
            return { get: () => val, set: setVal };
        };

        // 获取学生信息（学生端专用）
        window.CourseGlobalContext.getStudentInfo = () => {
            const info = studentInfoRef.current;
            console.log('[getStudentInfo] Returning:', info);
            return info;
        };

        // 学生端提交内容到教师端
        window.CourseGlobalContext.submitContent = async (options) => {
            if (isHost) {
                throw new Error('教师端不能使用 submitContent，此方法仅供学生端使用');
            }

            const { content, fileName, mergeFile } = options || {};
            console.log('[submitContent] Submitting:', {
                contentType: typeof content,
                fileName,
                mergeFile,
                contentPreview: typeof content === 'string' ? content.substring(0, 100) : '[Object]'
            });
            console.log('[submitContent] Student info:', studentInfoRef.current);
            const submissionId = `submission-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            return new Promise((resolve, reject) => {
                if (!socketRef.current) {
                    reject(new Error('Socket 连接不存在'));
                    return;
                }

                // 监听提交结果
                const timeout = setTimeout(() => {
                    socketRef.current.off('student:submit:result', handleResult);
                    reject(new Error('提交超时，请重试或联系教师'));
                }, 10000);

                const handleResult = (data) => {
                    if (data.submissionId === submissionId) {
                        clearTimeout(timeout);
                        socketRef.current.off('student:submit:result', handleResult);

                        if (data.success) {
                            resolve({ success: true, filePath: data.filePath });
                        } else {
                            reject(new Error(data.error || '提交失败，请重试或联系教师'));
                        }
                    }
                };

                socketRef.current.on('student:submit:result', handleResult);

                // 发送提交数据
                socketRef.current.emit('student:submit', {
                    submissionId,
                    courseId,
                    clientIp: studentInfoRef.current.ip,
                    content,
                    fileName: fileName || 'submission.txt',
                    mergeFile: mergeFile || false
                });
            });
        };
    }

    // 学生端接收同步变量及完整状态
    useEffect(() => {
        if (isHost || !socket) return;
        
        socketRef.current = socket;
        socket.on('sync-var', (data) => {
            if (data.courseId !== courseId || data.slideIndex !== currentSlide) return;

            const { key, value } = data;
            const varData = syncVarsRef.current.get(key);
            if (!varData) return;

            const oldValue = varData.value;
            varData.value = value;

            // 通知所有订阅的 Hook 实例重新渲染
            if (varData.listeners) {
                varData.listeners.forEach(l => l(value));
            }

            // 触发本地 onChange
            if (typeof varData.onChange === 'function') {
                varData.onChange(value, oldValue);
            }
        });

        socket.on('full-sync-state', (data) => {
            if (data.courseId !== courseId) return;
            const state = data.state;
            if (!state) return;
            
            Object.keys(state).forEach(key => {
                const value = state[key];
                const varData = syncVarsRef.current.get(key);
                if (!varData) return;
                
                const oldValue = varData.value;
                if (oldValue === value) return;
                
                varData.value = value;
                
                // 通知所有订阅的 Hook 实例重新渲染
                if (varData.listeners) {
                    varData.listeners.forEach(l => l(value));
                }
                
                // 触发本地 onChange
                if (typeof varData.onChange === 'function') {
                    varData.onChange(value, oldValue);
                }
            });
        });
        
        return () => {
            socket.off('sync-var');
            socket.off('full-sync-state');
        };
    }, [isHost, socket, courseId, currentSlide]);

    // 学生端请求完整同步数据（在进入新页面或教师开启同步时）
    useEffect(() => {
        if (isHost || !socket || !courseId) return;

        if (settings && settings.syncInteraction) {
            socket.emit('request-sync-state', { courseId, slideIndex: currentSlide });
        }
    }, [isHost, socket, courseId, currentSlide, settings?.syncInteraction]);

    // 教师端监听同步请求并发送当前状态
    useEffect(() => {
        if (!isHost || !socket || !courseId) return;

        const handleSyncRequest = (data) => {
            if (data.courseId !== courseId) return;

            // 收集所有需要同步的变量
            const stateToSync = {};
            syncVarsRef.current.forEach((val, key) => {
                if (val.sync) {
                    stateToSync[key] = val.value;
                }
            });

            socket.emit('full-sync-state', {
                targetId: data.requesterId,
                courseId,
                slideIndex: data.slideIndex,
                state: stateToSync
            });
        };

        const handleStudentSubmit = async (data) => {
            const { submissionId, courseId: submitCourseId, clientIp, content, fileName, mergeFile } = data;

            if (submitCourseId !== courseId) return;

            try {
                // 发送到服务器端保存
                const response = await fetch('/api/save-submission', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        courseId: submitCourseId,
                        clientIp,
                        content,
                        fileName,
                        mergeFile
                    })
                });

                const result = await response.json();

                // 返回确认给学生端
                socket.emit('student:submit:ack', {
                    submissionId,
                    success: result.success,
                    error: result.error
                });

                console.log(`[student:submit] Saved: IP=${clientIp} courseId=${courseId} success=${result.success}`);
            } catch (error) {
                console.error('[student:submit] Error:', error);
                socket.emit('student:submit:ack', {
                    submissionId,
                    success: false,
                    error: error.message || '提交失败'
                });
            }
        };

        socket.on('request-sync-state', handleSyncRequest);
        socket.on('student:submit', handleStudentSubmit);
        return () => {
            socket.off('request-sync-state', handleSyncRequest);
            socket.off('student:submit', handleStudentSubmit);
        };
    }, [isHost, socket, courseId]);

    const annoKey = (cid, slideIdx) => `${String(cid || '')}:${Number(slideIdx || 0)}`;
    const colorPresets = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#a855f7', '#0f172a', '#ffffff'];

    const getAnnoBaseSize = () => {
        // 固定按 16:9 比例以及当前缩放计算物理像素尺寸
        // 避免因为 getBoundingClientRect 返回非 16:9 导致画布比例失调变形
        const ui = uiScale || 1;
        const scale = (stageScale || 1) * ui;
        return { w: 1280 * scale, h: 720 * scale };
    };

    const prepareAnnoCanvas = () => {
        const canvas = annoCanvasRef.current;
        if (!canvas) return null;
        const { w: baseW, h: baseH } = getAnnoBaseSize();
        const dpr = window.devicePixelRatio || 1;
        const w = Math.max(1, Math.floor(baseW * dpr));
        const h = Math.max(1, Math.floor(baseH * dpr));
        const resized = canvas.width !== w || canvas.height !== h;
        if (resized) {
            canvas.width = w;
            canvas.height = h;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        return { ctx, baseW, baseH, resized };
    };

    const clearAnnoCanvas = () => {
        const m = prepareAnnoCanvas();
        if (!m) return;
        m.ctx.clearRect(0, 0, m.baseW, m.baseH);
    };

    const drawAnnoSegmentOn = (ctx, baseW, baseH, segment) => {
        if (!ctx || !segment || !Array.isArray(segment.points) || segment.points.length < 2) return;
        const tool = segment.tool || 'pen';
        const alpha = Number.isFinite(Number(segment.alpha)) ? Number(segment.alpha) : 1;
        ctx.globalAlpha = alpha;
        ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
        ctx.strokeStyle = segment.color || '#ef4444';
        ctx.lineWidth = Number(segment.width) || 4;
        const [p0, ...rest] = segment.points;
        const x0 = (p0[0] || 0) * baseW;
        const y0 = (p0[1] || 0) * baseH;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        for (const p of rest) {
            const x = (p[0] || 0) * baseW;
            const y = (p[1] || 0) * baseH;
            ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
    };

    const renderAnnoForCurrent = () => {
        const m = prepareAnnoCanvas();
        if (!m) return;
        m.ctx.clearRect(0, 0, m.baseW, m.baseH);
        const key = annoKey(courseId, currentSlide);
        const segments = annoSegmentsRef.current.get(key) || [];
        for (const seg of segments) drawAnnoSegmentOn(m.ctx, m.baseW, m.baseH, seg);
    };

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
            const nextScale = Math.max(Math.min(scaleW, scaleH, 0.96), 0.8);
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
        socket.on('interaction:sync', (data) => {
            // 学生端接收并应用教师端的交互状态
            if (!isHost && settingsRef.current.syncInteraction && data.courseId === courseId && data.slideIndex === currentSlide) {
                const { event, payload } = data;
                // 触发全局事件，让课件组件可以响应
                window.dispatchEvent(new CustomEvent('teacher-interaction', { detail: { event, payload } }));
            }
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

        const onAnnoState = (data) => {
            if (!data || !data.courseId) return;
            const key = annoKey(data.courseId, data.slideIndex);
            annoSegmentsRef.current.set(key, Array.isArray(data.segments) ? data.segments : []);
            if (key === annoKey(courseId, currentSlide)) {
                renderAnnoForCurrent();
            }
        };

        const onAnnoStroke = (data) => {
            if (!data || !data.courseId) return;
            const key = annoKey(data.courseId, data.slideIndex);
            const arr = annoSegmentsRef.current.get(key) || [];
            const seg = { tool: data.tool, color: data.color, width: data.width, alpha: data.alpha, points: data.points };
            arr.push(seg);
            if (arr.length > 5000) arr.splice(0, arr.length - 5000);
            annoSegmentsRef.current.set(key, arr);
            if (key === annoKey(courseId, currentSlide)) {
                const m = prepareAnnoCanvas();
                if (m && m.resized) {
                    renderAnnoForCurrent();
                } else if (m) {
                    drawAnnoSegmentOn(m.ctx, m.baseW, m.baseH, seg);
                }
            }
        };

        const onAnnoSegment = (data) => {
            if (!data || !data.courseId) return;
            const key = annoKey(data.courseId, data.slideIndex);
            if (key !== annoKey(courseId, currentSlide)) return;
            const m = prepareAnnoCanvas();
            if (m && m.resized) {
                renderAnnoForCurrent();
                const m2 = prepareAnnoCanvas();
                if (m2) drawAnnoSegmentOn(m2.ctx, m2.baseW, m2.baseH, { tool: data.tool, color: data.color, width: data.width, alpha: data.alpha, points: data.points });
            } else if (m) {
                drawAnnoSegmentOn(m.ctx, m.baseW, m.baseH, { tool: data.tool, color: data.color, width: data.width, alpha: data.alpha, points: data.points });
            }
        };

        const onAnnoClear = (data) => {
            if (!data || !data.courseId) return;
            const key = annoKey(data.courseId, data.slideIndex);
            annoSegmentsRef.current.set(key, []);
            if (key === annoKey(courseId, currentSlide)) {
                clearAnnoCanvas();
            }
        };

        socket.on('annotation:state', onAnnoState);
        socket.on('annotation:segment', onAnnoSegment);
        socket.on('annotation:stroke', onAnnoStroke);
        socket.on('annotation:clear', onAnnoClear);

        return () => {
            socket.off('sync-slide');
            socket.off('interaction:sync');
            socket.off('student-status');
            socket.off('student-alert');
            socket.off('annotation:state', onAnnoState);
            socket.off('annotation:segment', onAnnoSegment);
            socket.off('annotation:stroke', onAnnoStroke);
            socket.off('annotation:clear', onAnnoClear);
        };
    }, [socket, isHost, courseId, currentSlide]);

    useEffect(() => {
        const clampWidth = (n) => Math.min(Math.max(Number(n) || 4, 1), 30);
        const tool = annoTool || 'pen';
        const alpha =
            tool === 'highlighter' ? 0.25 :
            tool === 'marker' ? 0.6 :
            1;
        annoPenRef.current = { tool, color: annoColor, width: clampWidth(annoWidth), alpha };
    }, [annoTool, annoColor, annoWidth]);

    useEffect(() => {
        if (socketRef.current && courseId) {
            socketRef.current.emit('annotation:get', { courseId, slideIndex: currentSlide });
        }
        renderAnnoForCurrent();
    }, [courseId, currentSlide]);

    useEffect(() => {
        const canvas = annoCanvasRef.current;
        if (!canvas) return;
        let raf = 0;
        const ro = new ResizeObserver(() => {
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                stopAnnoDrawing();
                renderAnnoForCurrent();
            });
        });
        ro.observe(canvas);
        return () => {
            if (raf) cancelAnimationFrame(raf);
            ro.disconnect();
        };
    }, [courseId, currentSlide]);

    const goToSlide = (index) => {
        if (index >= 0 && index < slides.length) {
            stopAnnoDrawing();
            // 切换页面时释放摄像头，新页面组件 mount 后会自行重新申请
            if (window.CameraManager && window.CameraManager.isActive()) {
                window.CameraManager.release();
            }
            if (window._onCamActive) window._onCamActive(false);
            setCurrentSlide(index);
            if (isHost && socketRef.current) {
                socketRef.current.emit('sync-slide', { slideIndex: index });
            }
        }
    };
    const nextSlide = () => goToSlide(currentSlide + 1);
    const prevSlide = () => goToSlide(currentSlide - 1);

    const getAnnoPoint = (evt) => {
        const canvas = annoCanvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const vw = Math.max(1, rect.width || 0);
        const vh = Math.max(1, rect.height || 0);
        const { w: baseW, h: baseH } = getAnnoBaseSize();
        const nx = (evt.clientX - rect.left) / vw;
        const ny = (evt.clientY - rect.top) / vh;
        const xn = Math.max(0, Math.min(1, nx));
        const yn = Math.max(0, Math.min(1, ny));
        const cx = xn * baseW;
        const cy = yn * baseH;
        return {
            x: cx,
            y: cy,
            xn,
            yn,
        };
    };

    const emitAnnoSegment = (p0, p1) => {
        if (!courseId || !socketRef.current || !isHost) return;
        socketRef.current.emit('annotation:segment', {
            courseId,
            slideIndex: currentSlide,
            tool: annoPenRef.current.tool,
            color: annoPenRef.current.color,
            width: annoPenRef.current.width,
            alpha: annoPenRef.current.alpha,
            points: [
                [p0.xn, p0.yn],
                [p1.xn, p1.yn],
            ],
        });
    };

    const handleAnnoPointerDown = (e) => {
        if (!isHost || !annotateEnabled) return;
        const p = getAnnoPoint(e);
        if (!p) return;
        annoIsDrawingRef.current = true;
        annoLastPointRef.current = p;
        annoLastSendAtRef.current = 0;
        annoStrokePointsRef.current = [[p.xn, p.yn]];
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}

        let m = prepareAnnoCanvas();
        if (m && m.resized) {
            renderAnnoForCurrent();
            m = prepareAnnoCanvas();
        }
        if (m) {
            const tool = annoPenRef.current.tool;
            m.ctx.globalAlpha = annoPenRef.current.alpha;
            m.ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
            m.ctx.fillStyle = tool === 'eraser' ? '#000000' : annoPenRef.current.color;
            const r = Math.max(1, (annoPenRef.current.width || 4) / 2);
            m.ctx.beginPath();
            m.ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            m.ctx.fill();
            m.ctx.globalAlpha = 1;
            m.ctx.globalCompositeOperation = 'source-over';
        }
    };

    const handleAnnoPointerMove = (e) => {
        if (!annoIsDrawingRef.current) return;
        const p = getAnnoPoint(e);
        const last = annoLastPointRef.current;
        if (!p || !last) return;

        let m = prepareAnnoCanvas();
        if (m && m.resized) {
            renderAnnoForCurrent();
            m = prepareAnnoCanvas();
        }
        if (m) {
            const tool = annoPenRef.current.tool;
            m.ctx.globalAlpha = annoPenRef.current.alpha;
            m.ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
            m.ctx.strokeStyle = tool === 'eraser' ? '#000000' : annoPenRef.current.color;
            m.ctx.lineWidth = annoPenRef.current.width;
            m.ctx.beginPath();
            m.ctx.moveTo(last.x, last.y);
            m.ctx.lineTo(p.x, p.y);
            m.ctx.stroke();
            m.ctx.globalAlpha = 1;
            m.ctx.globalCompositeOperation = 'source-over';
        }

        annoStrokePointsRef.current.push([p.xn, p.yn]);
        annoLastPointRef.current = p;
        const now = Date.now();
        if (now - (annoLastSendAtRef.current || 0) >= 20) {
            annoLastSendAtRef.current = now;
            emitAnnoSegment(last, p);
        }
    };

    const finalizeAnnoStroke = () => {
        if (!courseId) return;
        const pts = annoStrokePointsRef.current || [];
        if (pts.length < 2) return;
        const seg = {
            tool: annoPenRef.current.tool,
            color: annoPenRef.current.color,
            width: annoPenRef.current.width,
            alpha: annoPenRef.current.alpha,
            points: pts,
        };
        const key = annoKey(courseId, currentSlide);
        const arr = annoSegmentsRef.current.get(key) || [];
        arr.push(seg);
        if (arr.length > 5000) arr.splice(0, arr.length - 5000);
        annoSegmentsRef.current.set(key, arr);
        if (socketRef.current && isHost) {
            socketRef.current.emit('annotation:stroke', { courseId, slideIndex: currentSlide, ...seg });
        }
    };

    const stopAnnoDrawing = () => {
        if (annoIsDrawingRef.current) finalizeAnnoStroke();
        annoIsDrawingRef.current = false;
        annoLastPointRef.current = null;
        annoStrokePointsRef.current = [];
    };

    const handleAnnoPointerUp = () => stopAnnoDrawing();
    const handleAnnoPointerCancel = () => stopAnnoDrawing();

    const toggleAnnotate = () => {
        if (!isHost) return;
        if (!annotateEnabled) {
            setAnnotateEnabled(true);
            setAnnoPopupType('tools');
            return;
        }
        setAnnoPopupType(v => (v === 'tools' ? null : 'tools'));
    };

    const handleClearAnno = () => {
        if (!courseId) return;
        const key = annoKey(courseId, currentSlide);
        annoSegmentsRef.current.set(key, []);
        clearAnnoCanvas();
        if (socketRef.current && isHost) {
            socketRef.current.emit('annotation:clear', { courseId, slideIndex: currentSlide });
        }
    };

    const renderAnnoPopupContent = (popupKey) => {
        if (!popupKey) return null;
        return (
            <div className={`w-64 ${liquidGlassLightClass} rounded-2xl p-3 z-[9999]`}>
                {popupKey === 'tools' && (
                    <>
                        <div className="text-xs text-slate-500 mb-2">绘制工具</div>
                        <div className="grid grid-cols-4 gap-2">
                            {[
                                { key: 'pen', label: '钢笔', icon: 'fa-pen' },
                                { key: 'marker', label: '记号笔', icon: 'fa-marker' },
                                { key: 'highlighter', label: '荧光笔', icon: 'fa-highlighter' },
                                { key: 'eraser', label: '橡皮', icon: 'fa-eraser' },
                            ].map(t => (
                                <button
                                    key={t.key}
                                    onClick={() => { setAnnoTool(t.key); if (!annotateEnabled) setAnnotateEnabled(true); }}
                                    className={`px-2 py-2 rounded-xl border font-bold text-sm transition-colors flex flex-col items-center justify-center ${
                                        annoTool === t.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                    }`}
                                    title={t.label}
                                >
                                    <i className={`fas ${t.icon} mb-1`}></i>
                                    <span className="text-[11px]">{t.label}</span>
                                </button>
                            ))}
                        </div>
                    </>
                )}

                {popupKey === 'width' && (
                    <>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-slate-600 font-bold text-sm">粗细</span>
                            <span className="text-slate-500 font-mono text-xs bg-slate-100 border border-slate-200 px-2 py-1 rounded-lg">{annoWidth}px</span>
                        </div>
                        <input
                            type="range"
                            min="2"
                            max="20"
                            value={annoWidth}
                            onChange={(e) => setAnnoWidth(Number(e.target.value))}
                            className="w-full"
                        />
                    </>
                )}

                {popupKey === 'color' && (
                    <>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-slate-600 font-bold text-sm">颜色</span>
                            <div className="flex items-center gap-2">
                                <div className="w-5 h-5 rounded-full border border-slate-200" style={{ background: annoColor }} />
                                <input
                                    type="color"
                                    value={annoColor}
                                    disabled={annoTool === 'eraser'}
                                    onChange={(e) => setAnnoColor(e.target.value)}
                                    className={`w-10 h-7 p-0 border-0 bg-transparent ${annoTool === 'eraser' ? 'opacity-40 cursor-not-allowed' : ''}`}
                                    title="选择颜色"
                                />
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {colorPresets.map(c => (
                                <button
                                    key={c}
                                    onClick={() => setAnnoColor(c)}
                                    disabled={annoTool === 'eraser'}
                                    className={`w-7 h-7 rounded-full border transition-all ${
                                        annoTool === 'eraser'
                                            ? 'opacity-40 cursor-not-allowed border-slate-200'
                                            : (annoColor.toLowerCase() === c.toLowerCase() ? 'border-blue-600 ring-2 ring-blue-300' : 'border-slate-200 hover:border-slate-300')
                                    }`}
                                    style={{ background: c }}
                                    title={c}
                                />
                            ))}
                        </div>
                    </>
                )}
            </div>
        );
    };

    const annoToolbarButtons = [
        {
            id: 'anno-tools',
            title: '绘制工具',
            iconClass: 'fa-pen',
            active: annotateEnabled,
            onClick: () => toggleAnnotate()
        },
        {
            id: 'anno-width',
            title: '画笔粗细',
            iconClass: 'fa-grip-lines',
            popupKey: 'width',
            active: annoPopupType === 'width',
            onClick: () => { if (!annotateEnabled) setAnnotateEnabled(true); }
        },
        {
            id: 'anno-color',
            title: '画笔颜色',
            iconClass: 'fa-palette',
            popupKey: 'color',
            active: annoPopupType === 'color',
            className: annoTool === 'eraser' ? 'opacity-50' : '',
            onClick: () => { if (!annotateEnabled) setAnnotateEnabled(true); }
        },
        {
            id: 'anno-clear',
            title: '清空本页',
            iconClass: 'fa-trash-can',
            disabled: !courseId,
            onClick: () => handleClearAnno()
        },
        {
            id: 'anno-exit',
            title: '退出绘制',
            iconClass: 'fa-xmark',
            className: 'bg-red-700/80 hover:bg-red-600',
            onClick: ({ setActivePopupKey }) => { stopAnnoDrawing(); setAnnotateEnabled(false); setActivePopupKey && setActivePopupKey(null); }
        }
    ];

    const renderVotePopupContent = (popupKey) => {
        if (popupKey !== 'result') return null;
        return (
            <div className={`w-72 ${liquidGlassDarkClass} rounded-2xl p-3 text-white max-h-[70vh] overflow-y-auto`}>
                <div className="flex items-center justify-between mb-2">
                    <div className="text-xs text-slate-400">投票结果</div>
                    <button
                        onClick={() => setShowVoteResultPanel(false)}
                        className="text-slate-400 hover:text-white"
                        title="收起"
                    >
                        <i className="fas fa-xmark"></i>
                    </button>
                </div>
                <div className="text-xs text-slate-300 mb-2">总票数：<span className="font-bold text-white">{voteToolbarState.result?.totalVotes || 0}</span></div>
                {(voteToolbarState.result?.options || []).length === 0 && (
                    <div className="text-xs text-slate-500">暂无结果数据</div>
                )}
                {(voteToolbarState.result?.options || []).map(opt => (
                    <div key={opt.id} className="mb-2 last:mb-0">
                        <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-slate-200 truncate pr-2">{opt.label}</span>
                            <span className="text-slate-300">{opt.votes || 0}票 · {opt.percent || 0}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500" style={{ width: `${opt.percent || 0}%` }}></div>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const loadSubmissions = async () => {
        if (!courseId) {
            setSubmissionsFiles([]);
            return;
        }

        setSubmissionsLoading(true);
        try {
            const response = await fetch(`/api/submissions/${encodeURIComponent(courseId)}`);
            const data = await response.json();
            if (data.success) {
                setSubmissionsFiles(data.files || []);
            } else {
                setSubmissionsFiles([]);
            }
        } catch (err) {
            console.error('[loadSubmissions] Error:', err);
            setSubmissionsFiles([]);
        } finally {
            setSubmissionsLoading(false);
        }
    };

    useEffect(() => {
        if (showSubmissionsPanel && courseId) {
            loadSubmissions();
        }
    }, [showSubmissionsPanel, courseId]);

    const handlePreviewFile = async (file) => {
        try {
            const res = await fetch(`/api/submissions/${encodeURIComponent(courseId)}/file/${encodeURIComponent(file.name)}`);
            if (res.ok) {
                const text = await res.text();
                setPreviewContent(text);
                setPreviewFile(file);
            } else {
                alert('预览失败');
            }
        } catch (err) {
            console.error('[previewFile] Error:', err);
            alert('预览失败');
        }
    };

    const renderSubmissionsPopupContent = (popupKey) => {
        if (popupKey !== 'submissions') return null;
        return (
            <div className={`w-80 ${liquidGlassLightClass} rounded-2xl p-3 max-h-[calc(100dvh-180px)] flex flex-col`}>
                <div className="flex items-center justify-between mb-2 shrink-0">
                    <div className="text-xs text-slate-600 font-bold">学生提交文件</div>
                    <button
                        onClick={() => setShowSubmissionsPanel(false)}
                        className="text-slate-400 hover:text-slate-600"
                        title="收起"
                    >
                        <i className="fas fa-xmark"></i>
                    </button>
                </div>

                <div className="flex items-center justify-between mb-2 shrink-0">
                    <div className="text-xs text-slate-500">共 <span className="font-bold text-slate-700">{submissionsFiles.length}</span> 个文件</div>
                    <button
                        onClick={loadSubmissions}
                        disabled={submissionsLoading}
                        className="text-xs text-blue-600 hover:text-blue-700 disabled:text-slate-400 disabled:cursor-not-allowed flex items-center gap-1"
                        title="刷新"
                    >
                        <i className={`fas ${submissionsLoading ? 'fa-spinner fa-spin' : 'fa-rotate'}`}></i>
                        刷新
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0">
                    {submissionsLoading && submissionsFiles.length === 0 ? (
                        <div className="text-center text-slate-400 py-8">
                            <i className="fas fa-spinner fa-spin text-2xl mb-2"></i>
                            <div className="text-xs">加载中...</div>
                        </div>
                    ) : submissionsFiles.length === 0 ? (
                        <div className="text-center text-slate-400 py-8">
                            <i className="fas fa-folder-open text-2xl mb-2"></i>
                            <div className="text-xs">暂无提交文件</div>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {submissionsFiles.map((file, idx) => (
                                <div
                                    key={idx}
                                    className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-100 transition-colors group cursor-pointer"
                                    onClick={() => handlePreviewFile(file)}
                                >
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                        <i className="fas fa-file-lines text-slate-400 shrink-0"></i>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs text-slate-700 truncate font-medium" title={file.name}>
                                                {file.name}
                                            </div>
                                            <div className="text-[10px] text-slate-400">
                                                {(file.size / 1024).toFixed(1)} KB
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                try {
                                                    const res = await fetch(`/api/submissions/${encodeURIComponent(courseId)}/file/${encodeURIComponent(file.name)}`);
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
                                            }}
                                            className="text-xs text-blue-600 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                                            title="下载"
                                        >
                                            <i className="fas fa-download"></i>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // 文件预览弹窗
    const FilePreviewModal = () => {
        if (!previewFile) return null;

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

        const renderJsonContent = (data) => {
            if (data.type === 'questionnaire' && data.answers) {
                // 问卷格式：显示为表格
                return (
                    <div className="space-y-4">
                        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                            <table className="w-full">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-700">问题</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-700">答案</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-700">时间</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.answers.map((answer, idx) => (
                                        <tr key={idx} className="border-t border-slate-100">
                                            <td className="px-4 py-3 text-sm text-slate-700 font-medium">{answer.question}</td>
                                            <td className="px-4 py-3 text-sm text-slate-600">{answer.answer}</td>
                                            <td className="px-4 py-3 text-xs text-slate-400">{new Date(answer.timestamp).toLocaleString('zh-CN')}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="text-xs text-slate-500">
                            提交时间: {new Date(data.submittedAt).toLocaleString('zh-CN')}
                        </div>
                    </div>
                );
            } else if (data.type === 'quick-note') {
                // 快速留言格式
                return (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <i className="fas fa-comment-dots text-yellow-500 text-2xl"></i>
                            <div>
                                <div className="font-bold text-yellow-800">快速留言</div>
                                <div className="text-xs text-yellow-600">{new Date(data.timestamp).toLocaleString('zh-CN')}</div>
                            </div>
                        </div>
                        <div className="bg-white rounded-lg p-4 text-slate-700">
                            {data.message}
                        </div>
                    </div>
                );
            } else if (data.type === 'form-submission') {
                // 表单提交格式
                return (
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <i className="fas fa-clipboard-list text-purple-500 text-2xl"></i>
                            <div>
                                <div className="font-bold text-purple-800">表单提交</div>
                                <div className="text-xs text-purple-600">{new Date(data.submittedAt).toLocaleString('zh-CN')}</div>
                            </div>
                        </div>
                        {data.csvRow && (
                            <div className="bg-white rounded-lg p-4 text-sm font-mono text-slate-600 whitespace-pre-wrap">
                                {data.csvRow}
                            </div>
                        )}
                    </div>
                );
            }
            // 通用 JSON 格式：代码高亮显示
            return (
                <pre className="bg-slate-800 text-green-400 p-4 rounded-lg overflow-auto text-sm">
                    {JSON.stringify(data, null, 2)}
                </pre>
            );
        };

        const renderCsvContent = (content) => {
            const lines = content.trim().split('\n');
            const header = lines[0];
            const rows = lines.slice(1);

            return (
                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-slate-50">
                            <tr>
                                {header.split(',').map((cell, idx) => (
                                    <th key={idx} className="px-3 py-2 text-left text-xs font-bold text-slate-700 border-r border-slate-200 last:border-r-0">
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
                                            <td key={cellIdx} className="px-3 py-2 text-sm text-slate-600 border-r border-slate-200 last:border-r-0">
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
        };

        const renderTextContent = (content, fileName) => {
            const ext = fileName.split('.').pop()?.toLowerCase();

            if (ext === 'csv') {
                return renderCsvContent(content);
            }

            // 普通文本：格式化显示
            return (
                <pre className="bg-white border border-slate-200 p-4 rounded-lg overflow-auto text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                    {content}
                </pre>
            );
        };

        // 智能识别文件格式
        let contentRenderer = null;
        let jsonData = null;
        let isJson = false;

        try {
            jsonData = JSON.parse(previewContent);
            isJson = true;
        } catch {
            // 不是 JSON
        }

        const fileIcon = getFileIcon(previewFile.name);

        if (isJson && jsonData) {
            contentRenderer = renderJsonContent(jsonData);
        } else {
            contentRenderer = renderTextContent(previewContent, previewFile.name);
        }

        return createPortal(
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[999999] flex items-center justify-center p-4 overflow-y-auto" style={{ zIndex: 999999 }}>
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col shrink-0 max-h-full overflow-hidden">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 ${fileIcon.bg} rounded-lg flex items-center justify-center`}>
                                <i className={`fas ${fileIcon.icon} ${fileIcon.color} text-lg`}></i>
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-slate-800">{previewFile.name}</h3>
                                <p className="text-xs text-slate-500">{(previewFile.size / 1024).toFixed(1)} KB</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setPreviewFile(null)}
                            className="text-slate-400 hover:text-slate-600 transition-colors"
                            title="关闭"
                        >
                            <i className="fas fa-xmark text-xl"></i>
                        </button>
                    </div>

                    <div className="overflow-auto p-6 bg-slate-50 max-h-[70vh]">
                        {contentRenderer}
                    </div>

                    <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-white shrink-0">
                        <button
                            onClick={() => setPreviewFile(null)}
                            className="px-4 py-2 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                        >
                            关闭
                        </button>
                        <button
                            onClick={async () => {
                                try {
                                    const res = await fetch(`/api/submissions/${encodeURIComponent(courseId)}/file/${encodeURIComponent(previewFile.name)}`);
                                    if (res.ok) {
                                        const blob = await res.blob();
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = previewFile.name;
                                        document.body.appendChild(a);
                                        a.click();
                                        document.body.removeChild(a);
                                        URL.revokeObjectURL(url);
                                    }
                                } catch (err) {
                                    console.error('[downloadFile] Error:', err);
                                    alert('下载失败');
                                }
                            }}
                            className="px-4 py-2 rounded-lg text-sm font-bold bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                        >
                            <i className="fas fa-download mr-2"></i>下载
                        </button>
                    </div>
                </div>
            </div>
            , getPortalRoot());
    };

    const voteToolbarPrefix = (
        <>
            <div
                className={`w-2.5 h-2.5 rounded-full ${voteToolbarState.status === 'running' ? 'bg-emerald-400' : voteToolbarState.status === 'ended' ? 'bg-slate-300' : 'bg-amber-400'}`}
                title={voteToolbarState.status === 'running' ? '进行中' : voteToolbarState.status === 'ended' ? '已结束' : '未开始'}
            ></div>
            <input
                type="number"
                min="10"
                max="300"
                value={voteToolbarState.durationSec || 60}
                disabled={voteToolbarState.status === 'running'}
                onChange={(e) => {
                    const duration = Math.max(10, Math.min(300, Number(e.target.value || 60)));
                    setVoteToolbarState(prev => ({ ...prev, durationSec: duration }));
                    window.dispatchEvent(new CustomEvent('vote-toolbar-action', { detail: { action: 'set-duration', durationSec: duration, voteId: voteToolbarState.voteId } }));
                }}
                className="w-full h-8 px-1 rounded-lg bg-slate-800 border border-slate-600 text-[11px] text-center text-white disabled:text-slate-500"
                title="投票时长（秒）"
            />
        </>
    );

    const voteToolbarSuffix = voteToolbarState.status === 'running'
        ? <div className="text-[10px] text-amber-300 leading-none" title="剩余秒数">{voteToolbarState.remainingSec || 0}s</div>
        : null;

    const voteToolbarButtons = [
        {
            id: 'vote-start',
            title: '开始投票',
            iconClass: 'fa-play',
            disabled: !voteToolbarState.canStart || voteToolbarState.status === 'running',
            className: 'bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700',
            onClick: () => window.dispatchEvent(new CustomEvent('vote-toolbar-action', { detail: { action: 'start', voteId: voteToolbarState.voteId } }))
        },
        {
            id: 'vote-end',
            title: '结束投票',
            iconClass: 'fa-stop',
            disabled: voteToolbarState.status !== 'running',
            onClick: () => window.dispatchEvent(new CustomEvent('vote-toolbar-action', { detail: { action: 'end', voteId: voteToolbarState.voteId } }))
        },
        {
            id: 'vote-result',
            title: showVoteResultPanel ? '收起结果' : '查看结果',
            iconClass: 'fa-chart-column',
            popupKey: 'result',
            active: showVoteResultPanel,
            className: 'bg-emerald-700/80 hover:bg-emerald-600'
        }
    ];

    const submissionsToolbarButtons = [
        {
            id: 'submissions-view',
            title: '学生提交',
            iconClass: 'fa-folder-open',
            popupKey: 'submissions',
            active: showSubmissionsPanel,
            className: 'bg-purple-700/80 hover:bg-purple-600'
        }
    ];

    const sideToolbarScale = Math.min(Math.max((stageScale || 1) * (uiScale || 1), 0.72), 1);

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
        <div className="flex flex-col h-[100dvh] bg-slate-900 text-slate-800 font-sans select-none relative">

            {/* 顶栏 */}
            {!hideTopBar && (
            <div className="flex items-center justify-between px-6 md:px-8 py-4 bg-white shadow-md z-20 relative h-[72px] shrink-0" style={{WebkitAppRegion:'drag'}}>
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <i className="fas fa-microchip text-blue-600 text-2xl md:text-3xl"></i>
                    <h1 className="flex-1 min-w-0 text-lg md:text-2xl font-bold text-slate-800 tracking-wide truncate">{title}</h1>
                    <div className="hidden sm:flex items-center ml-4 space-x-2 shrink-0">
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
                            <i className="fas fa-stop"></i>
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
            )}

            {/* 课件展示区 */}
            <div className="flex-1 relative flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-hidden">
                <div ref={stageWrapRef} className="relative w-full h-full flex items-center justify-center overflow-hidden">
                    <div
                        className="bg-white text-slate-800 relative shadow-2xl flex flex-col rounded-2xl overflow-hidden shrink-0"
                        style={{
                            width: '1280px',
                            height: '720px',
                            transform: `scale(${stageScale * uiScale})`,
                            transformOrigin: 'center center',
                            transition: 'transform 0.2s ease-out'
                        }}
                    >
                        <div className="w-full h-full relative overflow-hidden">
                            <div
                                className="absolute top-0 left-0"
                                style={{
                                    transform: `scale(${contentScale})`,
                                    transformOrigin: 'top left',
                                    width: `${100 / (contentScale || 1)}%`,
                                    height: `${100 / (contentScale || 1)}%`,
                                    position: 'relative'
                                }}
                            >
                                {/* 课件内容（基于 1280x720 设计尺寸渲染） */}
                                {/* 隐藏的同步状态计数器，用于触发课件重新渲染 */}
                                <div key={renderCounter} style={{ display: 'none' }}></div>
                                <div className={`absolute top-0 left-0 w-full h-full ${slides[currentSlide]?.scrollable === true ? 'overflow-y-auto no-scrollbar' : ''}`}>
                                    {slides[currentSlide] && slides[currentSlide].component}
                                </div>
                                {/* 标注画布：与课件内容处于同一缩放容器中，保证坐标一致 */}
                                <canvas
                                    ref={annoCanvasRef}
                                    className="absolute inset-0 z-40"
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        pointerEvents: (isHost && annotateEnabled) ? 'auto' : 'none',
                                        touchAction: 'none',
                                        cursor: (isHost && annotateEnabled) ? (annoTool === 'eraser' ? 'cell' : 'crosshair') : 'default'
                                    }}
                                    onPointerDown={handleAnnoPointerDown}
                                    onPointerMove={handleAnnoPointerMove}
                                    onPointerUp={handleAnnoPointerUp}
                                    onPointerCancel={handleAnnoPointerCancel}
                                    onPointerLeave={handleAnnoPointerUp}
                                />
                                {!isHost && settings && settings.allowInteract === false && (
                                    <div className="absolute inset-0 z-50" style={{ pointerEvents: 'auto', background: 'transparent' }} title="老师已暂时关闭页面交互"></div>
                                )}
                                {!isHost && settings && settings.syncInteraction === true && (
                                    <div className="absolute top-4 right-4 z-45 px-2 py-1 rounded-lg bg-amber-500/90 text-white text-xs font-bold border border-amber-300 shadow-lg backdrop-blur-sm">
                                        <i className="fas fa-sync fa-spin mr-1"></i>
                                        同步教师交互中
                                    </div>
                                )}
                            </div>
                            {isHost && annotateEnabled && (
                                <div className="absolute top-3 left-3 z-50 px-3 py-1.5 rounded-xl bg-blue-600/90 text-white text-xs font-bold border border-blue-300 shadow-lg backdrop-blur-sm">
                                    标注模式：拖动绘制
                                </div>
                            )}
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
                                            : `${liquidGlassDarkClass} text-white hover:bg-slate-700`
                                    }`}
                                >
                                    <i className={`fas ${camSwitching ? 'fa-spinner fa-spin' : 'fa-camera'}`}></i>
                                    {camSwitching ? '切换中...' : '摄像头'}
                                </button>
                            </div>
                        )}




                    </div>

                    {isHost && window.__LumeSyncUI?.SideToolbar && (
                        <>
                            <window.__LumeSyncUI.SideToolbar
                                visible={true}
                                side="left"
                                offsetClass="left-4 top-1/2 -translate-y-1/2"
                                buttons={annoToolbarButtons}
                                activePopupKey={annoPopupType}
                                onActivePopupChange={setAnnoPopupType}
                                renderPopupContent={renderAnnoPopupContent}
                                buttonBaseClassName="w-9 h-9 rounded-xl text-sm bg-slate-700 hover:bg-slate-600 disabled:text-slate-500"
                                scale={sideToolbarScale}
                            />

                            <window.__LumeSyncUI.SideToolbar
                                visible={voteToolbarState.visible}
                                buttons={voteToolbarButtons}
                                activePopupKey={showVoteResultPanel ? 'result' : null}
                                onActivePopupChange={(key) => setShowVoteResultPanel(key === 'result')}
                                renderPopupContent={renderVotePopupContent}
                                toolbarPrefix={voteToolbarPrefix}
                                toolbarSuffix={voteToolbarSuffix}
                                buttonBaseClassName="w-9 h-9 rounded-xl text-sm bg-slate-700 hover:bg-slate-600 disabled:text-slate-500"
                                scale={sideToolbarScale}
                            />

                            <window.__LumeSyncUI.SideToolbar
                                visible={true}
                                side="left"
                                offsetClass="left-4 top-1/2 -translate-y-1/2"
                                buttons={submissionsToolbarButtons}
                                activePopupKey={showSubmissionsPanel ? 'submissions' : null}
                                onActivePopupChange={(key) => setShowSubmissionsPanel(key === 'submissions')}
                                renderPopupContent={renderSubmissionsPopupContent}
                                buttonBaseClassName="w-9 h-9 rounded-xl text-sm bg-slate-700 hover:bg-slate-600 disabled:text-slate-500"
                                scale={sideToolbarScale}
                            />
                        </>
                    )}


                </div>
            </div>

            {/* 底栏导航 */}
            {!hideBottomBar && (
            <div className="flex items-center justify-between px-6 md:px-10 py-4 bg-white border-t border-slate-200 shadow-[0_-4px_15px_-3px_rgba(0,0,0,0.1)] z-20 relative h-[72px] shrink-0">
                {isHost ? (
                    <>
                        <button onClick={prevSlide} disabled={currentSlide === 0} className={`flex items-center px-4 md:px-6 py-2 md:py-2.5 rounded-xl font-bold text-base md:text-lg transition-all ${currentSlide === 0 ? 'text-slate-400 bg-slate-100 cursor-not-allowed' : 'text-white bg-blue-500 hover:bg-blue-600 shadow-md hover:-translate-x-1'}`}>
                            <i className="fas fa-chevron-left mr-2"></i>上一页
                        </button>
                        <div className="flex items-center gap-3 relative">

                            <span className="text-slate-500 font-bold text-base md:text-lg tracking-widest bg-slate-100 px-4 md:px-6 py-1 md:py-2 rounded-full shadow-inner border border-slate-200">
                                {currentSlide + 1} / {slides.length}
                            </span>


                            <button
                                onClick={() => {
                                    const currentSync = settings && settings.syncInteraction === true;
                                    const newSync = !currentSync;
                                    
                                    // 开启同步时自动禁止学生交互，关闭同步时自动允许学生交互
                                    if (onSettingsChange) {
                                        onSettingsChange({
                                            'syncInteraction': newSync,
                                            'allowInteract': !newSync // true = 允许交互，false = 禁止交互
                                        });
                                    }
                                }}
                                className={`flex items-center px-4 md:px-5 py-2 md:py-2.5 rounded-xl font-bold text-base md:text-lg transition-all border ${
                                    (settings && settings.syncInteraction === true)
                                        ? 'bg-amber-500 text-white border-amber-500 hover:bg-amber-400'
                                        : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                                }`}
                                title={(settings && settings.syncInteraction === true) ? '已开启交互同步（点击关闭）' : '开启教师交互同步（学生端同步所有操作）'}
                            >
                                <i className={`fas ${(settings && settings.syncInteraction === true) ? 'fa-sync' : 'fa-rotate'} mr-2`}></i>
                                {(settings && settings.syncInteraction === true) ? '同步交互' : '开启同步'}
                            </button>


                        </div>
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
            )}

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
                <ClassroomView
                    onClose={() => setShowClassroomView(false)}
                    socket={socketRef.current}
                    studentLog={studentLog}
                    podiumAtTop={settings && settings.podiumAtTop}
                    onPodiumAtTopChange={(v) => onSettingsChange && onSettingsChange('podiumAtTop', !!v)}
                />
            )}

            <div className="fixed top-24 right-6 z-50 flex flex-col space-y-3 pointer-events-none">
                {toasts.map(t => (
                    <div key={t.id} className={`px-4 py-3 rounded-xl shadow-xl border backdrop-blur-md font-bold text-sm md:text-base flex items-center toast-animate ${t.type === 'success' ? 'bg-green-500/90 border-green-400 text-white' : 'bg-orange-500/90 border-orange-400 text-white'}`}>
                        {t.message}
                    </div>
                ))}
            </div>

            {/* 文件预览弹窗 */}
            <FilePreviewModal />

            <style>{`
                @keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
                .toast-animate { animation: slideInRight 0.3s ease-out forwards; }
            `}</style>
        </div>
    );
}
