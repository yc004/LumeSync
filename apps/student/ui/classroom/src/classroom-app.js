// Student-side app shell. Core renders only the course stage.
const React = window.React;
const ReactDOM = window.ReactDOM;
const { useState, useEffect, useRef } = React;

const DEFAULT_SETTINGS = {
    forceFullscreen: true,
    syncFollow: true,
    allowInteract: true,
    syncInteraction: false,
    renderScale: 0.96,
    uiScale: 1.0,
    monitorEnabled: false,
    monitorIntervalSec: 1,
};

const normalizeMonitorIntervalSec = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return 1;
    const clamped = Math.min(5, Math.max(0.5, n));
    return Math.round(clamped * 2) / 2;
};

const getStudentBridge = () => window.studentHost || window.electronAPI || null;

const executePowerControl = async (action) => {
    const bridge = getStudentBridge();
    if (!bridge) throw new Error('student native bridge unavailable');
    if (typeof bridge.powerControl === 'function') {
        return await bridge.powerControl({ action });
    }
    if (action === 'shutdown' && typeof bridge.shutdown === 'function') {
        return await bridge.shutdown();
    }
    if (action === 'restart' && typeof bridge.restart === 'function') {
        return await bridge.restart();
    }
    throw new Error('student power control is not supported by this client');
};

const reportDeviceInfo = async (socket) => {
    const bridge = getStudentBridge();
    if (!socket || !bridge || typeof bridge.getDeviceInfo !== 'function') return;
    try {
        const info = await bridge.getDeviceInfo();
        if (!info || (!info.mac && !info.deviceName)) return;
        socket.emit('student:device-info', {
            mac: info.mac || '',
            deviceName: info.deviceName || '',
            clientId: info.clientId || '',
        });
    } catch (err) {
        console.warn('[student] Failed to report device info:', err);
    }
};

const getSessionAuth = async () => {
    const bridge = getStudentBridge();
    if (!bridge) return null;
    let session = null;
    if (typeof bridge.getSession === 'function') {
        try { session = await bridge.getSession(); } catch (_) {}
    }
    if ((!session || !session.token) && typeof bridge.bootstrapSession === 'function') {
        try { session = await bridge.bootstrapSession(); } catch (_) {}
    }
    if (!session || !session.token || !session.clientId) return null;
    window.__LumeSyncIdentity = {
        role: 'viewer',
        token: String(session.token),
        clientId: String(session.clientId),
        // 协议版本由服务端生成的 /protocol-client.js 提供；缺失时按 legacy 客户端处理。
        protocolVersion: window.LumeSyncProtocol?.protocolVersion,
    };
    return window.__LumeSyncIdentity;
};

function StudentWaitingView({ settings }) {
    useEffect(() => {
        window.electronAPI?.classEnded?.();
        window.electronAPI?.setFullscreen?.(false);
    }, []);

    return (
        <div className="h-screen w-screen flex items-center justify-center bg-[radial-gradient(circle_at_top,#1e40af_0,#020617_45%,#020617_100%)] text-white px-8">
            <div className="max-w-xl text-center">
                <div className="mx-auto mb-8 h-16 w-16 rounded-3xl bg-white/10 border border-white/20 flex items-center justify-center shadow-2xl">
                    <i className="fas fa-person-chalkboard text-3xl text-sky-200"></i>
                </div>
                <h1 className="text-3xl font-black tracking-[0.16em] mb-4">{'\u7b49\u5f85\u8001\u5e08\u4e0a\u8bfe'}</h1>
                <p className="text-slate-300 leading-7">{'\u8001\u5e08\u8fd8\u6ca1\u6709\u5f00\u59cb\u8bfe\u7a0b\uff0c\u8bf7\u4fdd\u6301\u672c\u9875\u9762\u6253\u5f00\u3002'}</p>
                <div className="mt-8 inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/10 px-5 py-2 text-sm text-sky-100">
                    <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-300 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-sky-300"></span>
                    </span>
                    {settings.syncFollow ? '\u540c\u6b65\u4e2d' : '\u81ea\u7531\u6a21\u5f0f'}
                </div>
            </div>
        </div>
    );
}

function StudentStatusPill({ settings, courseTitle, progress }) {
    return (
        <div className="pointer-events-none fixed left-1/2 top-4 z-[80] -translate-x-1/2 rounded-full border border-white/20 bg-slate-950/65 px-4 py-2 text-xs font-bold text-white shadow-2xl backdrop-blur-xl">
            <span className="text-sky-200">{'\u5b66\u751f\u7aef'}</span>
            <span className="mx-2 text-slate-500">/</span>
            <span>{courseTitle || '\u672a\u9009\u62e9\u8bfe\u7a0b'}</span>
            <span className="mx-2 text-slate-500">/</span>
            <span className="text-emerald-200">{settings.syncFollow ? '\u540c\u6b65\u4e2d' : '\u81ea\u7531\u6a21\u5f0f'}</span>
            {progress && <span className="ml-2 text-slate-300">{Math.round(progress)}%</span>}
        </div>
    );
}

function StudentNavigation({ slideIndex, slideCount, onSlideChange }) {
    const lastIndex = Math.max((slideCount || 1) - 1, 0);
    const goToSlide = (nextIndex) => {
        const clamped = Math.max(0, Math.min(nextIndex, lastIndex));
        onSlideChange(clamped);
    };

    return (
        <div className="fixed bottom-5 left-1/2 z-[90] flex -translate-x-1/2 items-center gap-4 rounded-[28px] border border-white/15 bg-slate-950/75 px-5 py-3 text-white shadow-2xl backdrop-blur-xl">
            <button
                onClick={() => goToSlide(slideIndex - 1)}
                disabled={slideIndex <= 0}
                className={`flex h-11 items-center gap-2 rounded-2xl px-4 text-sm font-black transition-all ${slideIndex <= 0 ? 'cursor-not-allowed bg-white/5 text-slate-500' : 'bg-emerald-500 text-white shadow-lg hover:-translate-x-0.5 hover:bg-emerald-400'}`}
            >
                <i className="fas fa-chevron-left"></i>{'\u4e0a\u4e00\u9875'}
            </button>
            <div className="min-w-[96px] rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-center text-sm font-black tracking-[0.18em] text-slate-100">
                {slideIndex + 1} / {Math.max(slideCount || 1, 1)}
            </div>
            <button
                onClick={() => goToSlide(slideIndex + 1)}
                disabled={slideIndex >= lastIndex}
                className={`flex h-11 items-center gap-2 rounded-2xl px-4 text-sm font-black transition-all ${slideIndex >= lastIndex ? 'cursor-not-allowed bg-white/5 text-slate-500' : 'bg-emerald-500 text-white shadow-lg hover:translate-x-0.5 hover:bg-emerald-400'}`}
            >
                {'\u4e0b\u4e00\u9875'}<i className="fas fa-chevron-right"></i>
            </button>
        </div>
    );
}

const releaseStudentSlideResources = () => {
    window.CameraManager?.release?.();
    if (window._onCamActive) window._onCamActive(false);
};

function StudentApp() {
    const [roleAssigned, setRoleAssigned] = useState(false);
    const [identityError, setIdentityError] = useState('');
    const [courseCatalog, setCourseCatalog] = useState({ courses: [], folders: [] });
    const [currentCourseId, setCurrentCourseId] = useState(null);
    const [currentCourseData, setCurrentCourseData] = useState(null);
    const [initialSlideIndex, setInitialSlideIndex] = useState(0);
    const [currentSlide, setCurrentSlide] = useState(0);
    const [settings, setSettings] = useState(DEFAULT_SETTINGS);
    const [studentInfo, setStudentInfo] = useState({ ip: '', name: '', studentId: '' });
    const [loading, setLoading] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState(null);
    const [courseError, setCourseError] = useState(null);
    const socketRef = useRef(null);
    const catalogRef = useRef(courseCatalog);
    const settingsRef = useRef(settings);
    // 权威状态引用：classroom:snapshot 可能在 state 更新生效前到达，
    // 因此 ref 必须与 setState 同步写入，而不是只靠 effect 同步。
    const courseIdRef = useRef(null);
    const currentSlideRef = useRef(0);
    const snapshotRevisionRef = useRef(-1);
    const captureInFlightRef = useRef(false);
    const screenshotTimerRef = useRef(null);

    useEffect(() => {
        settingsRef.current = settings;
    }, [settings]);

    const normalizeCatalog = (value) => {
        if (!value) return { courses: [], folders: [] };
        if (Array.isArray(value)) return { courses: value, folders: [] };
        return { courses: value.courses || [], folders: value.folders || [] };
    };

    const findCourse = (courseId, catalog) => {
        const normalized = normalizeCatalog(catalog);
        return (normalized.courses || []).find(c => c.id === courseId) || null;
    };

    const loadCourseById = async (courseId, catalog, socket) => {
        const engine = window.LumeSyncRenderEngine;
        if (!engine) throw new Error('Render engine is unavailable');
        const course = findCourse(courseId, catalog);
        if (!course) throw new Error('Course not found: ' + courseId);

        setLoading(true);
        setCourseError(null);
        try {
            const data = await engine.loadCourse(course, {
                socket,
                onProgress: (patch) => setLoadingProgress(patch),
            });
            setCurrentCourseData(data);
        } catch (err) {
            console.error('[StudentApp] load course failed:', err);
            setCourseError(err);
            setCurrentCourseData(null);
        } finally {
            setLoading(false);
        }
    };

    const changeLocalSlide = (slideIndex) => {
        const slideCount = currentCourseData?.slides?.length || 0;
        const lastIndex = Math.max(slideCount - 1, 0);
        const nextSlide = Math.max(0, Math.min(Number(slideIndex) || 0, lastIndex));
        if (nextSlide === currentSlide) return;
        releaseStudentSlideResources();
        setCurrentSlide(nextSlide);
    };

    const stopScreenshotLoop = () => {
        if (screenshotTimerRef.current) {
            clearInterval(screenshotTimerRef.current);
            screenshotTimerRef.current = null;
        }
    };

    const captureAndUploadScreenshot = async () => {
        if (captureInFlightRef.current) return;
        const socket = socketRef.current;
        const bridge = getStudentBridge();
        if (!socket || !socket.connected || !bridge || typeof bridge.takeScreenshot !== 'function') return;
        if (!settingsRef.current?.monitorEnabled || !roleAssigned) return;

        captureInFlightRef.current = true;
        try {
            const payload = await bridge.takeScreenshot({ maxWidth: 320, quality: 70 });
            if (!payload || !payload.dataUrl) return;
            socket.emit('student:screenshot', payload);
        } catch (err) {
            console.warn('[StudentApp] screenshot capture failed:', err);
        } finally {
            captureInFlightRef.current = false;
        }
    };

    useEffect(() => {
        stopScreenshotLoop();
        if (!roleAssigned || !settings.monitorEnabled) return;
        const intervalSec = normalizeMonitorIntervalSec(settings.monitorIntervalSec);
        captureAndUploadScreenshot();
        screenshotTimerRef.current = setInterval(() => {
            captureAndUploadScreenshot();
        }, intervalSec * 1000);
        return () => stopScreenshotLoop();
    }, [roleAssigned, settings.monitorEnabled, settings.monitorIntervalSec]);

    useEffect(() => () => stopScreenshotLoop(), []);


    useEffect(() => {
        let disposed = false;
        (async () => {
            const auth = await getSessionAuth();
            if (disposed) return;
            const socket = auth ? window.io({ auth }) : window.io();
            socketRef.current = socket;
            window.socketRef = socketRef;

            socket.on('identity-rejected', (data) => {
                setIdentityError(data?.message || data?.code || 'Identity verification failed');
                setRoleAssigned(false);
            });

            socket.on('protocol-rejected', (data) => {
                setIdentityError(data?.payload?.message || data?.message || 'Protocol version rejected');
                setRoleAssigned(false);
            });

            socket.on('session:accepted', (data) => {
                console.log('[student] protocol session accepted', {
                    protocolVersion: data?.protocolVersion,
                    sessionId: data?.sessionId,
                    revision: data?.revision,
                    legacy: data?.payload?.legacy,
                });
            });

            socket.on('role-assigned', (data) => {
                if (data.role === 'host') {
                    setIdentityError('Student app connected as host; expected viewer');
                    return;
                }
                const catalog = normalizeCatalog(data.courseCatalog || []);
                catalogRef.current = catalog;
                setCourseCatalog(catalog);
                setStudentInfo({
                    ip: data.clientIp || '',
                    name: data.studentInfo?.name || '',
                    studentId: data.studentInfo?.studentId || '',
                });
                if (data.hostSettings) {
                    setSettings(prev => ({ ...prev, ...data.hostSettings }));
                    window.electronAPI?.setFullscreen?.(data.hostSettings.forceFullscreen ?? true);
                }
                courseIdRef.current = data.currentCourseId || null;
                setCurrentCourseId(data.currentCourseId || null);
                const nextSlide = data.currentSlideIndex || 0;
                currentSlideRef.current = nextSlide;
                setInitialSlideIndex(nextSlide);
                setCurrentSlide(nextSlide);
                setRoleAssigned(true);
                reportDeviceInfo(socket);
                if (data.currentCourseId) {
                    window.electronAPI?.classStarted?.({ forceFullscreen: data.hostSettings?.forceFullscreen ?? true });
                    loadCourseById(data.currentCourseId, catalog, socket);
                }
            });

            socket.on('host-settings', (nextSettings) => {
                setSettings(prev => {
                    const next = { ...prev, ...nextSettings };
                    window.electronAPI?.setFullscreen?.(next.forceFullscreen);
                    return next;
                });
            });

            socket.on('course-changed', (data) => {
                const nextSlide = data.slideIndex || 0;
                courseIdRef.current = data.courseId || null;
                currentSlideRef.current = nextSlide;
                setCurrentCourseId(data.courseId);
                setInitialSlideIndex(nextSlide);
                setCurrentSlide(nextSlide);
                if (data.hostSettings) setSettings(prev => ({ ...prev, ...data.hostSettings }));
                window.electronAPI?.classStarted?.({ forceFullscreen: data.hostSettings?.forceFullscreen ?? true });
                loadCourseById(data.courseId, catalogRef.current, socket);
            });

            socket.on('sync-slide', (data) => {
                if (!settingsRef.current?.syncFollow) return;
                const nextSlide = Number(data?.slideIndex || 0);
                if (Number.isFinite(nextSlide)) {
                    releaseStudentSlideResources();
                    currentSlideRef.current = Math.max(0, Math.floor(nextSlide));
                    setCurrentSlide(currentSlideRef.current);
                }
            });

            // 重连或错过广播时，以服务端快照为准覆盖本地状态。
            // revision 递增，过期或乱序的快照直接丢弃。
            socket.on('classroom:snapshot', (snapshot) => {
                if (!snapshot || typeof snapshot !== 'object') return;
                const revision = Number(snapshot.revision);
                if (Number.isFinite(revision)) {
                    if (revision < snapshotRevisionRef.current) return;
                    snapshotRevisionRef.current = revision;
                }
                if (snapshot.hostSettings) {
                    // 同步写入 ref：后面的 syncFollow 判断必须用最新设置，
                    // 不能等 setState 的 effect 生效。
                    const merged = { ...settingsRef.current, ...snapshot.hostSettings };
                    merged.monitorIntervalSec = normalizeMonitorIntervalSec(merged.monitorIntervalSec);
                    settingsRef.current = merged;
                    setSettings(merged);
                }
                const nextCourseId = snapshot.currentCourseId || null;
                const nextSlide = Math.max(0, Math.floor(Number(snapshot.currentSlideIndex) || 0));
                if (nextCourseId === courseIdRef.current) {
                    // 翻页跟随仍由 syncFollow 决定：快照在每次翻页时都会广播，
                    // 不能在关闭跟随时把学生拉到教师页码。
                    if (settingsRef.current?.syncFollow && nextSlide !== currentSlideRef.current) {
                        releaseStudentSlideResources();
                        currentSlideRef.current = nextSlide;
                        setCurrentSlide(nextSlide);
                    }
                    return;
                }
                console.log('[StudentApp] applying classroom snapshot', { courseId: nextCourseId, slideIndex: nextSlide, revision });
                courseIdRef.current = nextCourseId;
                currentSlideRef.current = nextSlide;
                setCurrentCourseId(nextCourseId);
                setInitialSlideIndex(nextSlide);
                setCurrentSlide(nextSlide);
                if (!nextCourseId) {
                    setCurrentCourseData(null);
                    window.CourseData = null;
                    releaseStudentSlideResources();
                    window.electronAPI?.classEnded?.();
                    return;
                }
                window.electronAPI?.classStarted?.({ forceFullscreen: settingsRef.current?.forceFullscreen ?? true });
                loadCourseById(nextCourseId, catalogRef.current, socket);
            });

            socket.on('course-ended', () => {
                courseIdRef.current = null;
                currentSlideRef.current = 0;
                setCurrentCourseId(null);
                setCurrentCourseData(null);
                setCurrentSlide(0);
                window.CourseData = null;
                releaseStudentSlideResources();
                window.electronAPI?.classEnded?.();
            });

            socket.on('set-admin-password', (data) => {
                window.electronAPI?.setAdminPassword?.(data.hash);
            });

            socket.on('student:power-control', async (data) => {
                const action = String(data?.action || '');
                let accepted = false;
                let error = '';
                try {
                    const result = await executePowerControl(action);
                    accepted = result?.success !== false;
                    error = result?.error || '';
                } catch (err) {
                    error = err?.message || 'power control failed';
                }
                socket.emit('student:power-control:client-ack', {
                    requestId: data?.requestId || '',
                    action,
                    accepted,
                    error
                });
            });
        })();

        return () => {
            disposed = true;
            stopScreenshotLoop();
            socketRef.current?.disconnect?.();
        };
    }, []);

    if (identityError) {
        return (
            <div className="h-screen w-screen flex items-center justify-center bg-slate-950 text-white px-8">
                <div className="max-w-2xl text-center">
                    <i className="fas fa-circle-exclamation text-5xl text-red-400 mb-6"></i>
                    <h1 className="text-2xl font-black tracking-widest mb-3">{'\u8eab\u4efd\u9a8c\u8bc1\u5931\u8d25'}</h1>
                    <p className="text-slate-300 break-all">{identityError}</p>
                </div>
            </div>
        );
    }

    if (!roleAssigned) {
        return (
            <div className="h-screen w-screen flex items-center justify-center bg-slate-950 text-white">
                <div className="text-center">
                    <i className="fas fa-network-wired fa-fade text-5xl text-sky-300 mb-6"></i>
                    <h1 className="text-2xl font-black tracking-widest">{'\u6b63\u5728\u8fde\u63a5\u8bfe\u5802'}</h1>
                    <p className="mt-3 text-slate-400">{'\u8bf7\u7b49\u5f85\u6559\u5e08\u7aef\u5206\u914d\u5b66\u751f\u8eab\u4efd'}</p>
                </div>
            </div>
        );
    }

    if (!currentCourseId) return <StudentWaitingView settings={settings} />;

    if (loading || !currentCourseData) {
        return (
            <div className="h-screen w-screen flex items-center justify-center bg-slate-950 text-white px-8">
                <div className="w-full max-w-lg text-center">
                    <i className="fas fa-layer-group fa-bounce text-6xl text-sky-300 mb-8"></i>
                    <h1 className="text-3xl font-black tracking-widest mb-5">{'\u6b63\u5728\u52a0\u8f7d\u8bfe\u7a0b'}</h1>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                        <div className="h-full bg-sky-300 transition-all" style={{ width: (loadingProgress?.progress || 8) + '%' }}></div>
                    </div>
                    <p className="mt-4 text-sm text-slate-400">{loadingProgress?.currentFile || loadingProgress?.currentStep || '\u51c6\u5907\u8bfe\u7a0b'}</p>
                    {courseError && <p className="mt-4 text-sm text-red-300 break-all">{courseError.message || String(courseError)}</p>}
                </div>
            </div>
        );
    }

    return (
        <window.LumeSyncRenderEngine.CourseErrorBoundary courseId={currentCourseId}>
            <StudentStatusPill settings={settings} courseTitle={currentCourseData.title} progress={loadingProgress?.progress} />
            <window.LumeSyncRenderEngine.CourseStage
                key={currentCourseId}
                courseId={currentCourseId}
                title={currentCourseData.title}
                slides={currentCourseData.slides}
                socket={socketRef.current}
                isHost={false}
                initialSlide={initialSlideIndex}
                currentSlide={currentSlide}
                onSlideChange={changeLocalSlide}
                settings={settings}
                studentInfo={studentInfo}
                renderChrome={false}
                hideTopBar={true}
                hideBottomBar={true}
            />
            {!settings.syncFollow && (
                <StudentNavigation
                    slideIndex={currentSlide}
                    slideCount={currentCourseData.slides?.length || 0}
                    onSlideChange={changeLocalSlide}
                />
            )}
        </window.LumeSyncRenderEngine.CourseErrorBoundary>
    );
}

const bootStudentApp = () => {
    const rootElement = document.getElementById('root');
    if (!rootElement) return;
    ReactDOM.createRoot(rootElement).render(<StudentApp />);
};

bootStudentApp();

