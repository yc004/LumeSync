// ========================================================
// 课堂主界面组件（教师端 + 学生端共用）
// ========================================================
function SyncClassroom({ courseId, title, slides, onEndCourse, socket, isHost: initialIsHost, initialSlide, settings, onSettingsChange, studentCount, studentLog }) {
    const [currentSlide, setCurrentSlide] = useState(initialSlide || 0);
    const [isHost, setIsHost] = useState(initialIsHost || false);
    const [roleAssigned, setRoleAssigned] = useState(true);
    const [toasts, setToasts] = useState([]);
    const [showLog, setShowLog] = useState(false);
    const [showClassroomView, setShowClassroomView] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [annotateEnabled, setAnnotateEnabled] = useState(false);
    const [annotateMenuOpen, setAnnotateMenuOpen] = useState(false);
    const [annoTool, setAnnoTool] = useState('pen'); // pen | marker | highlighter | eraser
    const [annoWidth, setAnnoWidth] = useState(4);
    const [annoColor, setAnnoColor] = useState('#ef4444');

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

    const annoKey = (cid, slideIdx) => `${String(cid || '')}:${Number(slideIdx || 0)}`;
    const colorPresets = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#a855f7', '#0f172a', '#ffffff'];

    const getAnnoBaseSize = () => {
        const canvas = annoCanvasRef.current;
        if (!canvas) return { w: 1280, h: 720 };
        const rect = canvas.getBoundingClientRect();
        const w = Math.max(1, Math.round(rect.width || 0));
        const h = Math.max(1, Math.round(rect.height || 0));
        if (w <= 1 || h <= 1) return { w: 1280, h: 720 };
        return { w, h };
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
            if (isHost) socketRef.current.emit('sync-slide', { slideIndex: index });
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
            setAnnotateMenuOpen(true);
            return;
        }
        setAnnotateMenuOpen(v => !v);
    };

    useEffect(() => {
        if (!annotateMenuOpen) return;
        const onPointerDown = (e) => {
            const el = e && e.target && (e.target.closest ? e.target.closest('[data-anno-menu]') : null);
            if (!el) setAnnotateMenuOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [annotateMenuOpen]);

    const handleClearAnno = () => {
        if (!courseId) return;
        const key = annoKey(courseId, currentSlide);
        annoSegmentsRef.current.set(key, []);
        clearAnnoCanvas();
        if (socketRef.current && isHost) {
            socketRef.current.emit('annotation:clear', { courseId, slideIndex: currentSlide });
        }
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

    return (
        <div className="flex flex-col h-screen bg-slate-900 text-slate-800 font-sans overflow-hidden select-none">

            {/* 顶栏 */}
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
                                <div className="absolute top-0 left-0 w-full h-full">
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
                        <div className="flex items-center gap-3 relative" data-anno-menu>
                            <span className="text-slate-500 font-bold text-base md:text-lg tracking-widest bg-slate-100 px-4 md:px-6 py-1 md:py-2 rounded-full shadow-inner border border-slate-200">
                                {currentSlide + 1} / {slides.length}
                            </span>
                            <button
                                onClick={toggleAnnotate}
                                className={`flex items-center px-4 md:px-5 py-2 md:py-2.5 rounded-xl font-bold text-base md:text-lg transition-all border ${
                                    annotateEnabled ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-500' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                }`}
                                title="绘制"
                            >
                                <i className="fas fa-pen mr-2"></i>绘制
                            </button>
                            <button
                                onClick={() => onSettingsChange && onSettingsChange('allowInteract', !(settings && settings.allowInteract === false))}
                                className={`flex items-center px-4 md:px-5 py-2 md:py-2.5 rounded-xl font-bold text-base md:text-lg transition-all border ${
                                    (settings && settings.allowInteract === false)
                                        ? 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                                        : 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-500'
                                }`}
                                title={(settings && settings.allowInteract === false) ? '学生交互已禁用（点击开启）' : '学生可交互（点击关闭）'}
                            >
                                <i className={`fas ${(settings && settings.allowInteract === false) ? 'fa-ban' : 'fa-hand-pointer'} mr-2`}></i>
                                {(settings && settings.allowInteract === false) ? '禁止交互' : '允许交互'}
                            </button>

                            {annotateMenuOpen && (
                                <div className="absolute bottom-[64px] left-1/2 -translate-x-1/2 w-[360px] bg-white border border-slate-200 rounded-2xl shadow-2xl p-4 z-[9999]">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="font-bold text-slate-800 flex items-center">
                                            <i className="fas fa-swatchbook mr-2 text-blue-600"></i>绘制工具
                                        </div>
                                        <button
                                            onClick={() => setAnnotateMenuOpen(false)}
                                            className="text-slate-400 hover:text-slate-600"
                                            title="关闭"
                                        >
                                            <i className="fas fa-xmark text-lg"></i>
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-4 gap-2 mb-4">
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

                                    <div className="mb-4">
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
                                    </div>

                                    <div className="mb-4">
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
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={handleClearAnno}
                                            disabled={!courseId}
                                            className={`flex-1 px-4 py-2 rounded-xl font-bold border transition-colors ${
                                                !courseId ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                            }`}
                                        >
                                            <i className="fas fa-trash-can mr-2"></i>清空本页
                                        </button>
                                        <button
                                            onClick={() => { stopAnnoDrawing(); setAnnotateEnabled(false); setAnnotateMenuOpen(false); }}
                                            className="px-4 py-2 rounded-xl font-bold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"
                                        >
                                            退出
                                        </button>
                                    </div>
                                </div>
                            )}
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
                />
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
