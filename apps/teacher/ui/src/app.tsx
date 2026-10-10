// ========================================================
// Teacher local app shell. Course rendering is provided by /engine from packages/course-runtime.
// ========================================================
const IDENTITY_CLIENT_ID_KEY = 'lumesync_host_client_id';
const RENDER_ENGINE_BUNDLE = '/render-engine.js';
let renderEnginePromise = null;
const TEACHER_LAYER_CLASS = Object.freeze({
    floatingChrome: 'z-[9990]',
    overlay: 'z-[10000]',
    modal: 'z-[10020]',
    drawer: 'z-[10030]',
    popup: 'z-[10040]',
});

const getTeacherLayerClass = (key) => window.__LumeSyncLayer?.[key] || TEACHER_LAYER_CLASS[key] || '';
window.__getTeacherLayerClass = getTeacherLayerClass;

const CLASSROOM_WINDOW_KEY = 'lumesync-classroom-window-open';

window.__LumeSyncIsStandaloneClassroomWindow = () => window.__LumeSyncWindowMode === 'classroom';
window.__LumeSyncClassroomWindowOpen = false;

const syncClassroomWindowFlag = () => {
    try {
        window.__LumeSyncClassroomWindowOpen = localStorage.getItem(CLASSROOM_WINDOW_KEY) === '1';
    } catch (_) {
        window.__LumeSyncClassroomWindowOpen = false;
    }
};

const markClassroomWindowOpened = () => {
    window.__LumeSyncClassroomWindowOpen = true;
    try { localStorage.setItem(CLASSROOM_WINDOW_KEY, '1'); } catch (_) {}
};

const markClassroomWindowClosed = () => {
    window.__LumeSyncClassroomWindowOpen = false;
    try { localStorage.removeItem(CLASSROOM_WINDOW_KEY); } catch (_) {}
};

syncClassroomWindowFlag();

window.__LumeSyncOpenClassroomWindow = () => {
    syncClassroomWindowFlag();
    if (typeof window.openWindow === 'function') {
        if (!window.__LumeSyncClassroomWindowOpen) {
            markClassroomWindowOpened();
        }
        window.openWindow('', {
            mode: 'classroom',
            width: 1800,
            height: 1350,
            title: '机房视图'
        });
    }
};

if (window.__LumeSyncIsStandaloneClassroomWindow?.()) {
    markClassroomWindowOpened();
    window.addEventListener('beforeunload', markClassroomWindowClosed);
    window.addEventListener('pagehide', markClassroomWindowClosed);
    window.addEventListener('unload', markClassroomWindowClosed);
}

window.addEventListener('storage', (event) => {
    if (event.key === CLASSROOM_WINDOW_KEY) {
        syncClassroomWindowFlag();
    }
});

window.__LumeSyncCloseClassroomWindow = markClassroomWindowClosed;
const ensureTeacherShellStyles = () => {
    window.__LumeSyncLayer = { ...(window.__LumeSyncLayer || {}), ...TEACHER_LAYER_CLASS };
    if (document.getElementById('teacher-shell-liquid-style')) return;
    const style = document.createElement('style');
    style.id = 'teacher-shell-liquid-style';
    style.textContent = `
        :root {
            --teacher-bg: #f6f8fc;
            --teacher-surface: rgba(255, 255, 255, 0.94);
            --teacher-surface-soft: rgba(248, 250, 252, 0.92);
            --teacher-border: rgba(226, 232, 240, 0.92);
            --teacher-border-strong: rgba(191, 219, 254, 0.95);
            --teacher-accent: #2563eb;
        }
        .teacher-shell-page {
            background: var(--teacher-bg);
            color: #0f172a;
        }
        .teacher-classroom-shell {
            display: flex;
            flex-direction: column;
            height: 100%;
            overflow: hidden;
            background:
                linear-gradient(180deg, rgba(239, 246, 255, 0.72) 0%, rgba(246, 248, 252, 0) 38%),
                var(--teacher-bg);
        }
        .teacher-classroom-header {
            height: 58px;
            flex: 0 0 58px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 18px;
            padding: 0 18px 0 22px;
            background: rgba(255, 255, 255, 0.88);
            border-bottom: 1px solid rgba(226, 232, 240, 0.92);
            box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
            backdrop-filter: blur(18px) saturate(150%);
            -webkit-backdrop-filter: blur(18px) saturate(150%);
        }
        .teacher-classroom-main {
            min-height: 0;
            flex: 1;
            position: relative;
            display: block;
            /* 课件直接铺满整块工作区，不留内边距：留了就会在课件外面多出一圈底色 */
            padding: 0;
        }
        .teacher-stage-panel {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            gap: 0;
        }
        .teacher-stage-toolbar,
        .teacher-side-panel {
            background: rgba(255, 255, 255, 0.94);
            border: 1px solid rgba(226, 232, 240, 0.92);
            box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
            backdrop-filter: blur(18px) saturate(150%);
            -webkit-backdrop-filter: blur(18px) saturate(150%);
        }
        .teacher-stage-toolbar {
            display: none !important;
        }
        .teacher-side-panel {
            position: absolute;
            right: 18px;
            top: 18px;
            z-index: 9991;
            width: 238px;
            max-height: calc(100% - 36px);
            min-height: 0;
            overflow-y: auto;
            border-radius: 20px;
            padding: 12px;
            box-shadow: 0 18px 44px rgba(15, 23, 42, 0.12);
        }
        .teacher-glass {
            background: var(--teacher-surface);
            border: 1px solid var(--teacher-border);
            box-shadow: 0 18px 48px rgba(15, 23, 42, 0.12);
            backdrop-filter: blur(18px) saturate(150%);
            -webkit-backdrop-filter: blur(18px) saturate(150%);
            color: #0f172a;
        }
        .teacher-glass-dark {
            background: var(--teacher-surface);
            border: 1px solid var(--teacher-border);
            box-shadow: 0 18px 48px rgba(15, 23, 42, 0.12);
            backdrop-filter: blur(18px) saturate(150%);
            -webkit-backdrop-filter: blur(18px) saturate(150%);
            color: #0f172a;
        }
        .teacher-glass-light {
            background: var(--teacher-surface);
            border: 1px solid var(--teacher-border);
            box-shadow: 0 18px 48px rgba(15, 23, 42, 0.12);
            backdrop-filter: blur(18px) saturate(150%);
            -webkit-backdrop-filter: blur(18px) saturate(150%);
            color: #0f172a;
        }
        .teacher-liquid-button {
            border: 1px solid var(--teacher-border);
            background: #fff;
            color: #475569;
            box-shadow: none;
        }
        .teacher-liquid-button:hover {
            background: #f8fafc;
            color: #1d4ed8;
            transform: translateY(-1px);
        }
        .teacher-glass-light .teacher-liquid-button {
            background: #fff;
            color: #475569;
            border-color: var(--teacher-border);
        }
        .teacher-glass-light .teacher-liquid-button:hover {
            background: #f8fafc;
            color: #1d4ed8;
        }
        .teacher-liquid-primary {
            background: #2563eb;
            color: #fff;
            border: 1px solid #2563eb;
            box-shadow: 0 12px 28px rgba(37,99,235,0.22);
        }
        .teacher-liquid-danger {
            background: #fef2f2;
            color: #dc2626;
            border: 1px solid #fecaca;
        }
        /* 课件舞台直接铺满工作区：这里不再给课件加圆角、边框、白底和阴影，
           否则课件看起来像浮在底色上的一张卡片，抵消渲染引擎里的等比铺满。
           非 16:9 时留出的底色由渲染引擎舞台根自身的背景决定，与学生端保持一致。 */
        .teacher-course-stage {
            position: relative;
            flex: 1;
            min-height: 0;
            padding: 0;
            z-index: 1;
            overflow: hidden;
        }
        .teacher-course-stage > * {
            height: 100%;
            overflow: hidden;
        }
        .teacher-glass-drawer {
            background: #fff;
            border-left: 1px solid var(--teacher-border);
            box-shadow: -18px 0 48px rgba(15,23,42,0.14);
            color: #0f172a;
        }
        .teacher-shell-page button,
        .teacher-glass button {
            transition: transform 160ms ease, background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
        }
        .teacher-borderless {
            border-color: transparent !important;
        }
        @keyframes teacherGlassIn {
            from { opacity: 0; transform: translateY(14px) scale(0.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .teacher-glass-enter { animation: teacherGlassIn 260ms ease-out both; }
    `;
    document.head.appendChild(style);
};

window.__LumeSyncStartWindowDrag = (event) => {
    if (!event || event.button !== 0) return;
    if (event.target?.closest?.('[data-window-control="true"]')) return;
    if (event.target?.closest?.('button, a, input, textarea, select, label, summary, [role="button"], [data-no-window-drag="true"]')) return;
    if (!window.electronAPI?.beginWindowDrag) return;

    window.electronAPI.beginWindowDrag({ screenX: event.screenX, screenY: event.screenY });
};

const loadGlobalScript = (src) => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script ${src}`));
    document.head.appendChild(script);
});

const ensureRenderEngineLoaded = async () => {
    if (window.LumeSyncRenderEngine?.loadCourse) return window.LumeSyncRenderEngine;
    if (!renderEnginePromise) {
        renderEnginePromise = (async () => {
            await loadGlobalScript(RENDER_ENGINE_BUNDLE);
            if (!window.LumeSyncRenderEngine?.loadCourse) {
                throw new Error('LumeSyncRenderEngine failed to initialize');
            }
            return window.LumeSyncRenderEngine;
        })();
    }
    return renderEnginePromise;
};

const normalizeRole = (role) => {
    const r = String(role || '').trim().toLowerCase();
    if (r === 'host' || r === 'teacher') return 'host';
    if (r === 'viewer' || r === 'student') return 'viewer';
    return '';
};

const pickIdentityFromInjected = () => {
    const src = window.__LumeSyncIdentity || null;
    if (!src || typeof src !== 'object') return null;
    return {
        role: normalizeRole(src.role),
        token: src.token ? String(src.token) : '',
        clientId: src.clientId ? String(src.clientId) : ''
    };
};

const pickIdentityFromQuery = () => {
    try {
        const params = new URLSearchParams(window.location.search || '');
        const role = normalizeRole(params.get('role'));
        const token = params.get('token') || '';
        const clientId = params.get('clientId') || '';
        return { role, token, clientId };
    } catch (_) {
        return { role: '', token: '', clientId: '' };
    }
};

const cleanupSensitiveIdentityQuery = () => {
    try {
        const url = new URL(window.location.href);
        let changed = false;
        for (const key of ['token', 'role', 'clientId']) {
            if (url.searchParams.has(key)) {
                url.searchParams.delete(key);
                changed = true;
            }
        }
        if (changed) {
            window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
        }
    } catch (_) {}
};

const getOrCreateHostClientId = () => {
    try {
        const existing = localStorage.getItem(IDENTITY_CLIENT_ID_KEY);
        if (existing) return existing;
        const next = `host-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem(IDENTITY_CLIENT_ID_KEY, next);
        return next;
    } catch (_) {
        return `host-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }
};

const prepareSocketAuth = async () => {
    const injected = pickIdentityFromInjected() || {};
    const query = pickIdentityFromQuery() || {};

    const rawRole = injected.role || query.role || '';
    const declaredRole = normalizeRole(rawRole);
    const rawToken = injected.token || query.token || '';
    const rawClientId = injected.clientId || query.clientId || '';

    let token = rawToken;
    let clientId = rawClientId || getOrCreateHostClientId();

    if (!token && window.teacherHost?.bootstrapSession) {
        const session = await window.teacherHost.bootstrapSession();
        token = session?.token ? String(session.token) : '';
        clientId = session?.clientId ? String(session.clientId) : clientId;
    }

    if (!token) {
        return null;
    }

    if (declaredRole && declaredRole !== 'host') {
        throw new Error('Teacher console must connect as host');
    }

    window.__LumeSyncIdentity = { role: 'host', token, clientId };
    return {
        role: 'host',
        token,
        clientId,
        // 协议版本来自服务端生成的 /protocol-client.js；缺失时按 legacy 客户端处理。
        protocolVersion: window.LumeSyncProtocol?.protocolVersion
    };
};

function ClassroomApp() {
    const [isHost, setIsHost] = useState(false);
    const [roleAssigned, setRoleAssigned] = useState(false);
    const [identityError, setIdentityError] = useState('');
    const [courseCatalog, setCourseCatalog] = useState([]);
    const [currentCourseId, setCurrentCourseId] = useState(null);
    const [currentCourseData, setCurrentCourseData] = useState(null);
    const [initialSlideIndex, setInitialSlideIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [courseError, setCourseError] = useState(null);
    const [copyDone, setCopyDone] = useState(false);
    const [currentSlide, setCurrentSlide] = useState(0);
    const [showSettings, setShowSettings] = useState(false);
    const [showLog, setShowLog] = useState(false);
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
        monitorEnabled: true,
        monitorIntervalSec: 1,
    };
    const clampMonitorIntervalSec = (value) => {
        const n = Number(value);
        if (!Number.isFinite(n)) return 1;
        const clamped = Math.min(5, Math.max(0.5, n));
        return Math.round(clamped * 2) / 2;
    };
    const [settings, setSettings] = useState(DEFAULT_SETTINGS);
    const [studentCount, setStudentCount] = useState(0);
    const [sharedStudentLog, setSharedStudentLog] = useState([]);
    const [studentScreenshots, setStudentScreenshots] = useState({});
    const [studentInfo, setStudentInfo] = useState({ ip: '', name: '', studentId: '' });
    const socketRef = useRef(null);
    const courseCatalogRef = useRef([]);
    const settingsRef = useRef(settings);
    const studentCountPollRef = useRef(null);
    const activeCourseIdRef = useRef(null);

    // 批注工具状态
    const [annotateEnabled, setAnnotateEnabled] = useState(false);
    const [annoTool, setAnnoTool] = useState('pen');
    const [annoWidth, setAnnoWidth] = useState(4);
    const [annoColor, setAnnoColor] = useState('#ef4444');
    const [annoPopupType, setAnnoPopupType] = useState(null);
    const annoCanvasRef = useRef(null);
    const annoIsDrawingRef = useRef(false);
    const annoLastPointRef = useRef(null);
    const annoLastSendAtRef = useRef(0);
    const annoSegmentsRef = useRef(new Map());
    const annoPenRef = useRef({ tool: 'pen', color: '#ef4444', width: 4, alpha: 1 });
    const annoStrokePointsRef = useRef([]);
    const annoMouseFallbackRef = useRef(false);
    const shellPageRef = useRef(null);
    const teacherStageHostRef = useRef(null);
    const [annoStageRect, setAnnoStageRect] = useState(null);
    const [annoStageUsesFallback, setAnnoStageUsesFallback] = useState(false);
    const annoKey = (cid, slideIdx) => `${String(cid || '')}:${Number(slideIdx || 0)}`;
    const isStandaloneClassroomWindow = window.__LumeSyncIsStandaloneClassroomWindow?.() === true;
    useEffect(() => { settingsRef.current = settings; }, [settings]);

    useEffect(() => {
        if (window.electronAPI?.getSettings) {
            window.electronAPI.getSettings().then(saved => {
                if (!saved) return;
                const next = { ...settingsRef.current, ...saved };
                next.monitorIntervalSec = clampMonitorIntervalSec(next.monitorIntervalSec);
                settingsRef.current = next;
                setSettings(next);
                if (socketRef.current && socketRef.current.connected) {
                    socketRef.current.emit('host-settings', next);
                }
            });
        }
    }, []);

    // ── 批注 canvas 工具函数 ──────────────────────────────────────────
    const findCourseStageElement = (host) => {
        if (!host) return null;
        // 首选渲染引擎写在舞台根上的标记属性；内联尺寸作为兜底。
        // 不要再按 class 名匹配舞台根——类名会随渲染样式调整而失效。
        return (
            host.querySelector('[data-lumesync-stage-root="true"]')
            || host.querySelector('div[style*="width: 1280px"][style*="height: 720px"]')
        );
    };

    const buildFallbackStageRect = (shell, host) => {
        if (!shell || !host) return null;
        const shellRect = shell.getBoundingClientRect();
        const hostRect = host.getBoundingClientRect();
        const inset = 0; // .teacher-course-stage has no inner padding in the classroom workspace
        const width = Math.max(1, hostRect.width - inset * 2);
        const height = Math.max(1, hostRect.height - inset * 2);
        return {
            left: hostRect.left - shellRect.left + inset,
            top: hostRect.top - shellRect.top + inset,
            width,
            height,
        };
    };

    const prepareAnnoCanvas = () => {
        const canvas = annoCanvasRef.current;
        if (!canvas) return null;
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        const w = Math.max(1, Math.floor(rect.width * dpr));
        const h = Math.max(1, Math.floor(rect.height * dpr));
        const resized = canvas.width !== w || canvas.height !== h;
        if (resized) { canvas.width = w; canvas.height = h; }
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        return { ctx, baseW: rect.width, baseH: rect.height, resized };
    };

    const drawAnnoSegmentOn = (ctx, baseW, baseH, seg) => {
        if (!ctx || !seg || !Array.isArray(seg.points) || seg.points.length < 2) return;
        const tool = seg.tool || 'pen';
        ctx.globalAlpha = Number.isFinite(Number(seg.alpha)) ? Number(seg.alpha) : 1;
        ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
        ctx.strokeStyle = seg.color || '#ef4444';
        ctx.lineWidth = Number(seg.width) || 4;
        const [p0, ...rest] = seg.points;
        ctx.beginPath();
        ctx.moveTo((p0[0] || 0) * baseW, (p0[1] || 0) * baseH);
        for (const p of rest) ctx.lineTo((p[0] || 0) * baseW, (p[1] || 0) * baseH);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
    };

    const renderAnnoForCurrent = () => {
        const m = prepareAnnoCanvas();
        if (!m) return;
        m.ctx.clearRect(0, 0, m.baseW, m.baseH);
        const segs = annoSegmentsRef.current.get(annoKey(currentCourseId, currentSlide)) || [];
        for (const seg of segs) drawAnnoSegmentOn(m.ctx, m.baseW, m.baseH, seg);
    };

    const getAnnoPoint = (evt) => {
        const canvas = annoCanvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const vw = Math.max(1, rect.width);
        const vh = Math.max(1, rect.height);
        const xn = Math.max(0, Math.min(1, (evt.clientX - rect.left) / vw));
        const yn = Math.max(0, Math.min(1, (evt.clientY - rect.top) / vh));
        return { x: xn * vw, y: yn * vh, xn, yn };
    };

    const emitAnnoSegment = (p0, p1) => {
        if (!currentCourseId || !socketRef.current) return;
        socketRef.current.emit('annotation:segment', {
            courseId: currentCourseId,
            slideIndex: currentSlide,
            tool: annoPenRef.current.tool,
            color: annoPenRef.current.color,
            width: annoPenRef.current.width,
            alpha: annoPenRef.current.alpha,
            points: [[p0.xn, p0.yn], [p1.xn, p1.yn]],
        });
    };

    const finalizeAnnoStroke = () => {
        const pts = annoStrokePointsRef.current || [];
        if (pts.length < 2) return;
        const seg = { tool: annoPenRef.current.tool, color: annoPenRef.current.color, width: annoPenRef.current.width, alpha: annoPenRef.current.alpha, points: pts };
        const key = annoKey(currentCourseId, currentSlide);
        const arr = annoSegmentsRef.current.get(key) || [];
        arr.push(seg);
        if (arr.length > 5000) arr.splice(0, arr.length - 5000);
        annoSegmentsRef.current.set(key, arr);
        if (socketRef.current && currentCourseId) {
            socketRef.current.emit('annotation:stroke', { courseId: currentCourseId, slideIndex: currentSlide, ...seg });
        }
    };

    const stopAnnoDrawing = () => {
        if (annoIsDrawingRef.current) finalizeAnnoStroke();
        annoIsDrawingRef.current = false;
        annoLastPointRef.current = null;
        annoStrokePointsRef.current = [];
        annoMouseFallbackRef.current = false;
    };

    const handleClearAnno = () => {
        if (!currentCourseId) return;
        annoSegmentsRef.current.set(annoKey(currentCourseId, currentSlide), []);
        const m = prepareAnnoCanvas();
        if (m) m.ctx.clearRect(0, 0, m.baseW, m.baseH);
        if (socketRef.current) socketRef.current.emit('annotation:clear', { courseId: currentCourseId, slideIndex: currentSlide });
    };

    const handleAnnoPointerDown = (e) => {
        if (!annotateEnabled) return;
        annoMouseFallbackRef.current = false;
        const p = getAnnoPoint(e);
        if (!p) return;
        annoIsDrawingRef.current = true;
        annoLastPointRef.current = p;
        annoLastSendAtRef.current = 0;
        annoStrokePointsRef.current = [[p.xn, p.yn]];
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
        let m = prepareAnnoCanvas();
        if (m && m.resized) { renderAnnoForCurrent(); m = prepareAnnoCanvas(); }
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
        if (m && m.resized) { renderAnnoForCurrent(); m = prepareAnnoCanvas(); }
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

    const handleAnnoMouseDown = (e) => {
        if (!annotateEnabled) return;
        if (annoIsDrawingRef.current) return;
        annoMouseFallbackRef.current = true;
        handleAnnoPointerDown(e);
    };

    const handleAnnoMouseMove = (e) => {
        if (!annoMouseFallbackRef.current) return;
        handleAnnoPointerMove(e);
    };

    const handleAnnoMouseUp = () => {
        if (!annoMouseFallbackRef.current) return;
        stopAnnoDrawing();
    };

    // 更新 annoPenRef
    useEffect(() => {
        const tool = annoTool || 'pen';
        const alpha = tool === 'highlighter' ? 0.25 : tool === 'marker' ? 0.6 : 1;
        annoPenRef.current = { tool, color: annoColor, width: Math.min(Math.max(annoWidth, 1), 30), alpha };
    }, [annoTool, annoColor, annoWidth]);

    // 切换页面时重绘
    useEffect(() => {
        if (currentCourseId && socketRef.current) {
            socketRef.current.emit('annotation:get', { courseId: currentCourseId, slideIndex: currentSlide });
        }
        renderAnnoForCurrent();
    }, [currentCourseId, currentSlide]);

    // canvas resize 时重绘
    useEffect(() => {
        const canvas = annoCanvasRef.current;
        if (!canvas) return;
        let raf = 0;
        const ro = new ResizeObserver(() => {
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => { stopAnnoDrawing(); renderAnnoForCurrent(); });
        });
        ro.observe(canvas);
        return () => { if (raf) cancelAnimationFrame(raf); ro.disconnect(); };
    }, [currentCourseId, currentSlide]);

    // 对齐到 core 中真实的 16:9 舞台区域，避免教师端/学生端坐标基准不一致
    useEffect(() => {
        const shell = shellPageRef.current;
        const host = teacherStageHostRef.current;
        if (!shell || !host) return;

        let raf = 0;
        let ro = null;

        const updateStageRect = () => {
            const stageEl = findCourseStageElement(host);
            if (!stageEl) {
                const fallback = buildFallbackStageRect(shell, host);
                if (fallback) {
                    setAnnoStageRect(fallback);
                    setAnnoStageUsesFallback(true);
                }
                return;
            }
            const shellRect = shell.getBoundingClientRect();
            const stageRect = stageEl.getBoundingClientRect();
            setAnnoStageRect({
                left: stageRect.left - shellRect.left,
                top: stageRect.top - shellRect.top,
                width: stageRect.width,
                height: stageRect.height,
            });
            setAnnoStageUsesFallback(false);
        };

        const scheduleUpdate = () => {
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(updateStageRect);
        };

        scheduleUpdate();
        ro = new ResizeObserver(scheduleUpdate);
        ro.observe(shell);
        ro.observe(host);
        window.addEventListener('resize', scheduleUpdate);

        return () => {
            if (raf) cancelAnimationFrame(raf);
            if (ro) ro.disconnect();
            window.removeEventListener('resize', scheduleUpdate);
        };
    }, [currentCourseId, currentSlide, currentCourseData?.id, settings?.renderScale, settings?.uiScale]);
    // ── 批注工具函数结束 ──────────────────────────────────────────────

    const hasAnnoStageRect = annoStageRect && annoStageRect.width > 0 && annoStageRect.height > 0;
    const annoCanvasBoxStyle = hasAnnoStageRect
        ? {
            left: `${annoStageRect.left}px`,
            top: `${annoStageRect.top}px`,
            width: `${annoStageRect.width}px`,
            height: `${annoStageRect.height}px`,
        }
        : {
            left: '12px',
            top: '12px',
            right: '12px',
            bottom: '12px',
        };

    useEffect(() => {
        if (!isHost) return;
        requestAnimationFrame(() => renderAnnoForCurrent());
    }, [isHost, hasAnnoStageRect, annoStageRect?.left, annoStageRect?.top, annoStageRect?.width, annoStageRect?.height, currentCourseId, currentSlide]);

    // 舞台节点可能晚于首帧挂载：如果当前仍是 fallback，持续短时重试直到拿到真实舞台矩形
    useEffect(() => {
        if (!isHost) return;
        if (hasAnnoStageRect && !annoStageUsesFallback) return;
        const shell = shellPageRef.current;
        const host = teacherStageHostRef.current;
        if (!shell || !host) return;
        let raf = 0;
        let attempts = 0;
        const maxAttempts = 240; // ~4 秒（60fps）
        const tryResolve = () => {
            attempts += 1;
            const stageEl = findCourseStageElement(host);
            if (!stageEl) {
                if (!hasAnnoStageRect) {
                    const fallback = buildFallbackStageRect(shell, host);
                    if (fallback) {
                        setAnnoStageRect(fallback);
                        setAnnoStageUsesFallback(true);
                    }
                }
                if (attempts < maxAttempts) raf = requestAnimationFrame(tryResolve);
                return;
            }
            const shellRect = shell.getBoundingClientRect();
            const stageRect = stageEl.getBoundingClientRect();
            if (stageRect.width <= 0 || stageRect.height <= 0) {
                if (attempts < maxAttempts) raf = requestAnimationFrame(tryResolve);
                return;
            }
            setAnnoStageRect({
                left: stageRect.left - shellRect.left,
                top: stageRect.top - shellRect.top,
                width: stageRect.width,
                height: stageRect.height,
            });
            setAnnoStageUsesFallback(false);
        };
        raf = requestAnimationFrame(tryResolve);
        return () => { if (raf) cancelAnimationFrame(raf); };
    }, [isHost, hasAnnoStageRect, annoStageUsesFallback, currentCourseId, currentSlide, currentCourseData?.id]);

    const handleSettingsChange = (key, value) => {
        let next = { ...settingsRef.current, [key]: value };
        
        // 支持一次性传入多个设置项。
        if (typeof key === 'object' && key !== null) {
            next = { ...settingsRef.current, ...key };
        }
        next.monitorIntervalSec = clampMonitorIntervalSec(next.monitorIntervalSec);
        
        setSettings(next);
        if (socketRef.current) socketRef.current.emit('host-settings', next);
        window.electronAPI?.saveSettings?.(next);
    };

    useEffect(() => {
        let disposed = false;

        const setupSocket = async () => {
            let auth;
            try {
                auth = await prepareSocketAuth();
            } catch (err) {
                console.error('[identity] init failed:', err);
                if (!disposed) {
                    setIdentityError(err?.message || String(err));
                    setRoleAssigned(false);
                }
                return;
            }
            if (disposed) return;

            socketRef.current = auth ? window.io({ auth }) : window.io();
            if (auth) cleanupSensitiveIdentityQuery();
            window.socketRef = socketRef;

            socketRef.current.on('identity-rejected', (data) => {
                const msg = data?.message || data?.code || 'Identity verification failed';
                setIdentityError(msg);
                setRoleAssigned(false);
            });

            socketRef.current.on('protocol-rejected', (data) => {
                const msg = data?.payload?.message || data?.message || data?.payload?.code || 'Protocol version rejected';
                setIdentityError(msg);
                setRoleAssigned(false);
            });

            socketRef.current.on('session:accepted', (data) => {
                const accepted = data?.payload || {};
                // 记录权威状态代次，便于排查"页面状态与服务端 revision 漂移"。
                window.__LumeSyncSessionId = data?.sessionId || window.__LumeSyncSessionId;
                window.__LumeSyncRevision = data?.revision ?? window.__LumeSyncRevision;
                console.log('[protocol] session accepted', {
                    protocolVersion: data?.protocolVersion,
                    sessionId: data?.sessionId,
                    revision: data?.revision,
                    legacy: accepted.legacy
                });
            });

            socketRef.current.on('classroom:snapshot', (snapshot) => {
                if (!snapshot || typeof snapshot !== 'object') return;
                window.__LumeSyncSessionId = snapshot.sessionId || window.__LumeSyncSessionId;
                window.__LumeSyncRevision = snapshot.revision ?? window.__LumeSyncRevision;
            });

            socketRef.current.on('role-assigned', (data) => {
                setIdentityError('');
                setIsHost(data.role === 'host');
                let catalog = data.courseCatalog || [];
                if (!Array.isArray(catalog) && catalog.courses) {
                    catalog = catalog;
                } else if (Array.isArray(catalog) && !catalog.folders) {
                    catalog = { courses: catalog, folders: data.folders || [] };
                }
                setCourseCatalog(catalog);
                courseCatalogRef.current = catalog;
                setCurrentCourseId(data.currentCourseId);
                setRoleAssigned(true);

                if (data.role !== 'host') {
                    setStudentInfo({
                        ip: data.clientIp || '',
                        name: data.studentInfo?.name || '',
                        studentId: data.studentInfo?.studentId || ''
                    });
                }

                if (data.role !== 'host' && data.hostSettings) {
                    setSettings(prev => {
                        const next = { ...prev, ...data.hostSettings };
                        next.monitorIntervalSec = clampMonitorIntervalSec(next.monitorIntervalSec);
                        return next;
                    });
                    const fs = data.hostSettings?.forceFullscreen ?? true;
                    window.electronAPI?.setFullscreen(fs);
                }

                if (data.currentCourseId) {
                    setInitialSlideIndex(data.currentSlideIndex || 0);
                    setCurrentSlide(data.currentSlideIndex || 0);
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
                    next.monitorIntervalSec = clampMonitorIntervalSec(next.monitorIntervalSec);
                    window.electronAPI?.setFullscreen(next.forceFullscreen);
                    return next;
                });
            });

            socketRef.current.on('set-admin-password', (data) => {
                window.electronAPI?.setAdminPassword?.(data.hash);
            });

            socketRef.current.on('course-changed', (data) => {
                if (data.courseId && data.courseId === activeCourseIdRef.current) {
                    return;
                }
                activeCourseIdRef.current = data.courseId;
                setCurrentCourseId(data.courseId);
                setInitialSlideIndex(data.slideIndex || 0);
                setCurrentSlide(data.slideIndex || 0);
                loadCourse(data.courseId, courseCatalogRef.current);
                const fs = data.hostSettings?.forceFullscreen ?? true;
                if (data.hostSettings) {
                    setSettings(prev => {
                        const next = { ...prev, ...data.hostSettings };
                        next.monitorIntervalSec = clampMonitorIntervalSec(next.monitorIntervalSec);
                        return next;
                    });
                }
                window.electronAPI?.classStarted({ forceFullscreen: fs });
            });

            socketRef.current.on('course-ended', () => {
                activeCourseIdRef.current = null;
                setCurrentCourseId(null);
                setCurrentCourseData(null);
                setCurrentSlide(0);
                setStudentScreenshots({});
                window.CourseData = null;
                window.CameraManager?.release?.();
                if (window._onCamActive) window._onCamActive(false);
                window.electronAPI?.classEnded();
            });

            socketRef.current.on('course-catalog-updated', (data) => {
                let catalog = data.courses || [];
                if (!Array.isArray(catalog) && catalog.courses) {
                    catalog = catalog;
                } else if (Array.isArray(catalog) && !catalog.folders) {
                    catalog = { courses: catalog, folders: data.folders || [] };
                }
                setCourseCatalog(catalog);
                courseCatalogRef.current = catalog;
            });

            socketRef.current.on('student-log-entry', (entry) => {
                setSharedStudentLog(prev => [...prev, entry].slice(-500));
            });

            socketRef.current.on('student:screenshot', (payload) => {
                if (!payload?.ip || !payload?.dataUrl) return;
                setStudentScreenshots(prev => ({ ...prev, [payload.ip]: payload }));
            });

            socketRef.current.on('student:screenshot:state', (data) => {
                const next = {};
                for (const item of (data?.screenshots || [])) {
                    if (item?.ip && item?.dataUrl) next[item.ip] = item;
                }
                setStudentScreenshots(next);
            });

            socketRef.current.on('student:screenshot:clear', (data) => {
                const ip = data?.ip;
                if (!ip) return;
                setStudentScreenshots(prev => {
                    const next = { ...prev };
                    delete next[ip];
                    return next;
                });
            });

            socketRef.current.on('student:screenshot:reset', () => {
                setStudentScreenshots({});
            });

            fetch('/api/student-log').then(r => r.json()).then(d => {
                setSharedStudentLog(d.log || []);
            }).catch(() => {});

            // 批注：接收服务端广播的笔画（教师自己发出后服务端会回广播）
            socketRef.current.on('annotation:stroke', (data) => {
                if (!data?.courseId) return;
                const key = annoKey(data.courseId, data.slideIndex);
                const arr = annoSegmentsRef.current.get(key) || [];
                const seg = { tool: data.tool, color: data.color, width: data.width, alpha: data.alpha, points: data.points };
                arr.push(seg);
                if (arr.length > 5000) arr.splice(0, arr.length - 5000);
                annoSegmentsRef.current.set(key, arr);
                if (key === annoKey(currentCourseId, currentSlide)) {
                    requestAnimationFrame(() => renderAnnoForCurrent());
                }
            });
            socketRef.current.on('annotation:clear', (data) => {
                if (!data?.courseId) return;
                const key = annoKey(data.courseId, data.slideIndex);
                annoSegmentsRef.current.set(key, []);
                if (key === annoKey(currentCourseId, currentSlide)) {
                    requestAnimationFrame(() => renderAnnoForCurrent());
                }
            });
            socketRef.current.on('annotation:state', (data) => {
                if (!data?.courseId) return;
                const key = annoKey(data.courseId, data.slideIndex);
                annoSegmentsRef.current.set(key, Array.isArray(data.segments) ? data.segments : []);
                if (key === annoKey(currentCourseId, currentSlide)) {
                    requestAnimationFrame(() => renderAnnoForCurrent());
                }
            });
        };

        setupSocket();

        return () => {
            disposed = true;
            if (studentCountPollRef.current) {
                clearInterval(studentCountPollRef.current);
                studentCountPollRef.current = null;
            }
            if (socketRef.current) socketRef.current.disconnect();
        };
    }, []);

    const loadCourse = async (courseId, catalog) => {
        let courseList = catalog || courseCatalogRef.current;
        if (courseList && !Array.isArray(courseList) && courseList.courses) {
            courseList = courseList.courses;
        }
        const course = (courseList || []).find(c => c.id === courseId);
        if (!course) {
            console.error('[TeacherApp] course not found: ' + courseId);
            return;
        }

        setIsLoading(true);
        setCourseError(null);
        setLoadingProgress({
            currentStep: '准备加载',
            currentFile: course.file,
            progress: 5,
            totalSteps: 3,
            currentStepIndex: 1
        });

        try {
            const engine = await ensureRenderEngineLoaded();
            const data = await engine.loadCourse(course, {
                socket: socketRef.current,
                onProgress: (patch) => setLoadingProgress(prev => ({ ...prev, ...patch }))
            });
            setCurrentCourseData(data);
        } catch (err) {
            console.error('[TeacherApp] load course failed:', err);
            setCourseError(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRefreshCourses = () => {
        if (socketRef.current) socketRef.current.emit('refresh-courses');
    };

    const handleStartCourse = (courseId, catalog) => {
        if (!courseId) return;
        const nextCatalog = catalog || courseCatalogRef.current;
        let courseList = nextCatalog;
        if (courseList && !Array.isArray(courseList) && courseList.courses) {
            courseList = courseList.courses;
        }
        if (!(courseList || []).some(c => c.id === courseId)) {
            console.error('[TeacherApp] cannot start missing course: ' + courseId);
            return;
        }
        if (nextCatalog) {
            setCourseCatalog(nextCatalog);
            courseCatalogRef.current = nextCatalog;
        }
        activeCourseIdRef.current = courseId;
        setCurrentCourseId(courseId);
        setInitialSlideIndex(0);
        setCurrentSlide(0);
        loadCourse(courseId, nextCatalog);
        if (socketRef.current?.connected) {
            socketRef.current.emit('select-course', { courseId });
        }
    };

    const handleEndCourse = () => {
        activeCourseIdRef.current = null;
        setCurrentCourseId(null);
        setCurrentCourseData(null);
        setCourseError(null);
        setCurrentSlide(0);
        window.CourseData = null;
        window.CameraManager?.release?.();
        if (window._onCamActive) window._onCamActive(false);
        window.electronAPI?.classEnded?.();
        if (socketRef.current && isHost) socketRef.current.emit('end-course');
    };

    const goToSlide = (index) => {
        if (!currentCourseData || !Array.isArray(currentCourseData.slides)) return;
        if (index < 0 || index >= currentCourseData.slides.length) return;
        if (window.CameraManager && window.CameraManager.isActive()) {
            window.CameraManager.release();
        }
        if (window._onCamActive) window._onCamActive(false);
        setCurrentSlide(index);
        if (socketRef.current) socketRef.current.emit('sync-slide', { slideIndex: index });
    };

    const toggleInteractionSync = () => {
        const newSync = !(settings && settings.syncInteraction === true);
        handleSettingsChange({
            syncInteraction: newSync,
            allowInteract: !newSync
        });
    };

    const handleTitlebarMouseDown = (event) => {
        window.__LumeSyncStartWindowDrag?.(event);
    };

    const handleTitlebarDoubleClick = (event) => {
        if (event.button !== 0) return;
        if (event.target?.closest?.('[data-window-control="true"]')) return;
        window.electronAPI?.maximizeWindow?.();
    };

    if (identityError) {
        return (
            <div className="teacher-shell-page flex h-full items-center justify-center select-none px-8" onMouseDown={handleTitlebarMouseDown}>
                <div className="teacher-glass-dark teacher-glass-enter max-w-2xl rounded-[32px] p-10 text-center">
                    <i className="fas fa-circle-exclamation text-5xl text-rose-300 mb-6"></i>
                    <h2 className="text-2xl tracking-widest font-black">身份验证失败</h2>
                    <p className="text-slate-300 mt-3 text-center break-all">{identityError}</p>
                </div>
            </div>
        );
    }

    if (!roleAssigned) {
        return (
            <div className="teacher-shell-page flex h-full items-center justify-center select-none" onMouseDown={handleTitlebarMouseDown}>
                <div className="teacher-glass-dark teacher-glass-enter rounded-[32px] px-12 py-10 text-center">
                    <i className="fas fa-network-wired fa-fade text-5xl text-blue-600 mb-6"></i>
                    <h2 className="text-2xl tracking-widest font-black">正在连接课堂服务器...</h2>
                    <p className="text-slate-500 mt-2">正在验证身份并分配权限...</p>
                </div>
            </div>
        );
    }

    if (isStandaloneClassroomWindow && isHost) {
        return (
            <ClassroomView
                standalone={true}
                onClose={() => {
                    if (window.electronAPI?.closeWindow) {
                        window.electronAPI.closeWindow();
                        return;
                    }
                    window.close();
                }}
                socket={socketRef.current}
                studentLog={sharedStudentLog}
                studentScreenshots={studentScreenshots}
                monitorEnabled={!!settings?.monitorEnabled}
                monitorIntervalSec={clampMonitorIntervalSec(settings?.monitorIntervalSec)}
                podiumAtTop={settings && settings.podiumAtTop}
                onPodiumAtTopChange={(v) => handleSettingsChange('podiumAtTop', !!v)}
            />
        );
    }

    if (isHost && !currentCourseId) {
        return (
            <CourseSelector
                courses={courseCatalog}
                currentCourseId={currentCourseId}
                onSelectCourse={handleStartCourse}
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
            <div className="teacher-shell-page flex h-full items-center justify-center select-none px-8" onMouseDown={handleTitlebarMouseDown}>
                <div className="teacher-glass-dark teacher-glass-enter flex w-full max-w-xl flex-col items-center rounded-[34px] px-10 py-12 text-slate-900">
                <i className="fas fa-layer-group fa-bounce text-6xl text-blue-600 mb-8"></i>

                <h2 className="text-3xl tracking-widest font-bold mb-3">正在加载课件内容...</h2>

                {/* 进度条 */}
                <div className="w-80 h-2 bg-slate-200 rounded-full overflow-hidden mb-4">
                    <div
                        className="h-full bg-gradient-to-r from-sky-300 to-emerald-300 transition-all duration-300 ease-out"
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

                <p className="text-slate-500 mt-4 text-sm flex items-center">
                    <i className="fas fa-bolt text-yellow-400 mr-2"></i> 请稍候，正在准备课堂环境
                </p>
                </div>
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
            <div className="teacher-shell-page flex h-full flex-col items-center justify-center text-slate-900 select-none p-8" onMouseDown={handleTitlebarMouseDown}>
                <div className="teacher-glass-dark teacher-glass-enter w-full max-w-3xl rounded-[34px] p-8 text-center">
                <i className="fas fa-circle-exclamation text-5xl text-rose-300 mb-6"></i>
                <h2 className="text-2xl font-black mb-2">课件加载失败</h2>
                {isHost ? (
                    <div className="mt-4 w-full max-w-2xl">
                        <div className="bg-red-950/50 border border-red-300/20 rounded-3xl p-6 text-left backdrop-blur-xl">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-red-300 font-bold flex items-center"><i className="fas fa-bug mr-2"></i> 错误详情</p>
                                <button onClick={handleCopy} className={`teacher-liquid-button flex items-center px-3 py-1 rounded-xl text-xs font-bold ${copyDone ? 'text-emerald-600' : 'text-red-600'}`}>
                                    <i className={`fas ${copyDone ? 'fa-check' : 'fa-copy'} mr-1.5`}></i>
                                    {copyDone ? '已复制' : '复制'}
                                </button>
                            </div>
                            <pre className="text-red-600 text-sm font-mono whitespace-pre-wrap break-all leading-relaxed">{errorText}</pre>
                        </div>
                        <button onClick={handleEndCourse} className="teacher-liquid-button mt-6 px-6 py-3 rounded-2xl font-bold">
                            <i className="fas fa-arrow-left mr-2"></i> 返回课件选择
                        </button>
                    </div>
                ) : (
                    <p className="text-slate-500 mt-2">请等待老师重新加载课件</p>
                )}
                </div>
            </div>
        );
    }

    if (!currentCourseData) {
        return (
            <div className="teacher-shell-page flex h-full items-center justify-center text-slate-900 select-none px-8" onMouseDown={handleTitlebarMouseDown}>
                <div className="teacher-glass-dark teacher-glass-enter rounded-[34px] px-12 py-10 text-center">
                    <i className="fas fa-layer-group fa-bounce text-6xl text-blue-600 mb-8"></i>
                    <h2 className="text-3xl tracking-widest font-bold mb-3">正在加载课件内容...</h2>
                    <p className="text-slate-500 mt-4 text-sm flex items-center">
                        <i className="fas fa-bolt text-yellow-400 mr-2"></i> 请稍候，正在准备课堂环境
                    </p>
                </div>
            </div>
        );
    }

    return (
        <window.LumeSyncRenderEngine.CourseErrorBoundary courseId={currentCourseId} onEndCourse={isHost ? handleEndCourse : null}>
            <div ref={shellPageRef} className="teacher-shell-page teacher-classroom-shell font-sans select-none relative">
                <header
                    className="teacher-classroom-header"
                    style={{WebkitAppRegion:'drag'}}
                    onMouseDown={handleTitlebarMouseDown}
                    onDoubleClick={handleTitlebarDoubleClick}
                >
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-blue-600">
                            <i className="fas fa-chalkboard-user text-xl"></i>
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <h1 className="truncate text-xl font-black tracking-tight text-slate-950">{currentCourseData.title}</h1>
                                <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">&#x6388;&#x8bfe;&#x4e2d;</span>
                            </div>
                            <p className="mt-0.5 text-sm font-medium text-slate-500">&#x7b2c; {currentSlide + 1} &#x9875; / &#x5171; {currentCourseData.slides.length} &#x9875;</p>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5" style={{WebkitAppRegion:'no-drag'}} data-window-control="true">
                        <button
                            onClick={() => window.__LumeSyncOpenClassroomWindow?.()}
                            className="flex h-9 items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-3 text-sm font-bold text-blue-700 hover:bg-blue-100"
                            title="&#x67e5;&#x770b;&#x673a;&#x623f;&#x89c6;&#x56fe;"
                        >
                            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                            {studentCount}
                        </button>
                        <button onClick={() => goToSlide(currentSlide - 1)} disabled={currentSlide === 0} className={`flex h-9 w-9 items-center justify-center rounded-2xl text-sm font-bold transition-all ${currentSlide === 0 ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400' : 'teacher-liquid-button'}`} title="&#x4e0a;&#x4e00;&#x9875;">
                            <i className="fas fa-chevron-left"></i>
                        </button>
                        <span className="flex h-9 items-center rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-black text-slate-800">{currentSlide + 1} / {currentCourseData.slides.length}</span>
                        <button onClick={() => goToSlide(currentSlide + 1)} disabled={currentSlide === currentCourseData.slides.length - 1} className={`flex h-9 w-9 items-center justify-center rounded-2xl text-sm font-bold transition-all ${currentSlide === currentCourseData.slides.length - 1 ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400' : 'teacher-liquid-primary'}`} title="&#x4e0b;&#x4e00;&#x9875;">
                            <i className="fas fa-chevron-right"></i>
                        </button>
                        <button
                            onClick={toggleInteractionSync}
                            className={`flex h-9 w-9 items-center justify-center rounded-2xl border text-sm font-bold transition-all ${(settings && settings.syncInteraction === true) ? 'border-blue-200 bg-blue-50 text-blue-700' : 'teacher-liquid-button'}`}
                            title={(settings && settings.syncInteraction === true) ? '同步互动中' : '开启互动同步'}
                        >
                            <i className={`fas ${(settings && settings.syncInteraction === true) ? 'fa-sync' : 'fa-rotate'}`}></i>
                        </button>
                        {isHost && [
                            { icon: 'fa-pen', title: '批注', active: annotateEnabled, onClick: () => setAnnotateEnabled(v => !v) },
                            { icon: 'fa-grip-lines', title: '粗细', active: annoPopupType === 'width', onClick: () => { setAnnotateEnabled(true); setAnnoPopupType(v => v === 'width' ? null : 'width'); } },
                            { icon: 'fa-palette', title: '颜色', active: annoPopupType === 'color', onClick: () => { setAnnotateEnabled(true); setAnnoPopupType(v => v === 'color' ? null : 'color'); } },
                            { icon: 'fa-trash-can', title: '清空批注', active: false, onClick: handleClearAnno },
                        ].map((btn) => (
                            <button
                                key={btn.icon}
                                title={btn.title}
                                onClick={btn.onClick}
                                className={`flex h-9 w-9 items-center justify-center rounded-2xl text-sm transition-colors ${btn.active ? 'border border-blue-600 bg-blue-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                            >
                                <i className={`fas ${btn.icon}`}></i>
                            </button>
                        ))}
                        <button onClick={() => setShowLog(v => !v)} className="teacher-liquid-button relative flex h-9 w-9 items-center justify-center rounded-2xl text-sm" title="&#x5b66;&#x751f;&#x65e5;&#x5fd7;">
                            <i className="fas fa-list-ul"></i>
                            {sharedStudentLog.length > 0 && (
                                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">
                                    {sharedStudentLog.length > 99 ? '99' : sharedStudentLog.length}
                                </span>
                            )}
                        </button>
                        <button onClick={() => setShowSettings(v => !v)} className="teacher-liquid-button flex h-9 w-9 items-center justify-center rounded-2xl text-sm" title="&#x8bfe;&#x5802;&#x8bbe;&#x7f6e;">
                            <i className="fas fa-gear"></i>
                        </button>
                        <button onClick={handleEndCourse} className="teacher-liquid-danger flex h-9 w-9 items-center justify-center rounded-2xl text-sm" title="&#x7ed3;&#x675f;&#x6388;&#x8bfe;">
                            <i className="fas fa-stop"></i>
                        </button>
                        <WindowControls />
                    </div>
                </header>

                <main className="teacher-classroom-main" style={{WebkitAppRegion:'no-drag'}}>
                    <section className="teacher-stage-panel">
                        <div className="teacher-stage-toolbar flex items-center justify-between gap-4">
                            <div className="flex min-w-0 items-center gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                                    <i className="fas fa-layer-group"></i>
                                </div>
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-black text-slate-900">&#x8bfe;&#x4ef6;&#x753b;&#x5e03;</p>
                                    <p className="truncate text-xs font-medium text-slate-500">&#x6d45;&#x8272;&#x5de5;&#x4f5c;&#x533a;&#xff0c;&#x805a;&#x7126;&#x6388;&#x8bfe;&#x5185;&#x5bb9;</p>
                                </div>
                            </div>
                            <div className="hidden min-w-0 flex-1 items-center justify-end gap-1 md:flex">
                                {currentCourseData.slides.slice(0, 18).map((_, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => goToSlide(idx)}
                                        className={`h-2 rounded-full transition-all ${idx === currentSlide ? 'w-8 bg-blue-600' : 'w-2 bg-slate-200 hover:bg-slate-300'}`}
                                        title={`\u7b2c ${idx + 1} \u9875`}
                                    />
                                ))}
                                {currentCourseData.slides.length > 18 && <span className="ml-1 text-xs font-bold text-slate-400">+{currentCourseData.slides.length - 18}</span>}
                            </div>
                        </div>

                        <div ref={teacherStageHostRef} className="teacher-course-stage">
                            <window.LumeSyncRenderEngine.CourseStage
                                courseId={currentCourseId}
                                title={currentCourseData.title}
                                slides={currentCourseData.slides}
                                socket={socketRef.current}
                                isHost={isHost}
                                initialSlide={initialSlideIndex}
                                currentSlide={currentSlide}
                                onSlideChange={(index) => setCurrentSlide(index)}
                                settings={settings}
                                onSettingsChange={handleSettingsChange}
                                studentCount={studentCount}
                                studentLog={sharedStudentLog}
                                studentInfo={studentInfo}
                                renderChrome={false}
                                renderTeacherOverlays={false}
                                hideTopBar={true}
                                hideBottomBar={true}
                            />
                        </div>
                    </section>

                </main>

                {isHost && annoPopupType === 'width' && (
                    <div className="absolute right-56 top-16 z-[9992] w-56 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur-xl" data-window-control="true">
                        <div className="mb-2 flex items-center justify-between">
                            <span className="text-sm font-bold text-slate-700">&#x753b;&#x7b14;&#x7c97;&#x7ec6;</span>
                            <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-mono text-slate-500">{annoWidth}px</span>
                        </div>
                        <input type="range" min="2" max="20" value={annoWidth} onChange={e => setAnnoWidth(Number(e.target.value))} className="w-full" />
                        <div className="mt-2 grid grid-cols-2 gap-2">
                            {['pen','marker','highlighter','eraser'].map(t => (
                                <button key={t} onClick={() => setAnnoTool(t)} className={`rounded-xl border px-2 py-2 text-xs font-bold transition-colors ${annoTool === t ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'}`}>
                                    {t === 'pen' ? '\u94a2\u7b14' : t === 'marker' ? '\u8bb0\u53f7\u7b14' : t === 'highlighter' ? '\u8367\u5149\u7b14' : '\u6a61\u76ae'}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {isHost && annoPopupType === 'color' && (
                    <div className="absolute right-44 top-16 z-[9992] w-56 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur-xl" data-window-control="true">
                        <div className="mb-2 flex items-center justify-between">
                            <span className="text-sm font-bold text-slate-700">&#x753b;&#x7b14;&#x989c;&#x8272;</span>
                            <input type="color" value={annoColor} disabled={annoTool === 'eraser'} onChange={e => setAnnoColor(e.target.value)} className={`h-8 w-10 border-0 bg-transparent p-0 ${annoTool === 'eraser' ? 'cursor-not-allowed opacity-40' : ''}`} />
                        </div>
                        <div className="grid grid-cols-8 gap-2">
                            {['#ef4444','#f97316','#facc15','#22c55e','#3b82f6','#a855f7','#0f172a','#ffffff'].map(c => (
                                <button key={c} onClick={() => setAnnoColor(c)} disabled={annoTool === 'eraser'} className={`h-7 rounded-full border transition-all ${annoTool === 'eraser' ? 'cursor-not-allowed border-slate-200 opacity-40' : (annoColor.toLowerCase() === c.toLowerCase() ? 'border-blue-600 ring-2 ring-blue-300' : 'border-slate-200 hover:border-slate-300')}`} style={{ background: c }} />
                            ))}
                        </div>
                    </div>
                )}

                {isHost && (
                    <canvas
                        ref={annoCanvasRef}
                        className="absolute z-[9980]"
                        style={{
                            ...annoCanvasBoxStyle,
                            display: 'block',
                            pointerEvents: annotateEnabled ? 'auto' : 'none',
                            touchAction: 'none',
                            cursor: annotateEnabled ? (annoTool === 'eraser' ? 'cell' : 'crosshair') : 'default',
                            borderRadius: '20px',
                        }}
                        onPointerDown={handleAnnoPointerDown}
                        onPointerMove={handleAnnoPointerMove}
                        onPointerUp={() => stopAnnoDrawing()}
                        onPointerCancel={() => stopAnnoDrawing()}
                        onPointerLeave={() => stopAnnoDrawing()}
                        onMouseDown={handleAnnoMouseDown}
                        onMouseMove={handleAnnoMouseMove}
                        onMouseUp={handleAnnoMouseUp}
                        onMouseLeave={handleAnnoMouseUp}
                    />
                )}

                {annotateEnabled && isHost && (
                    <div className="absolute left-1/2 top-24 z-[9992] -translate-x-1/2 rounded-2xl border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 shadow-sm pointer-events-none">
                        &#x6807;&#x6ce8;&#x6a21;&#x5f0f;&#xff1a;&#x62d6;&#x52a8;&#x753b;&#x5e03;&#x5373;&#x53ef;&#x7ed8;&#x5236;
                    </div>
                )}

                {showLog && (
                    <div className={`fixed inset-0 ${getTeacherLayerClass('drawer')} flex justify-end bg-slate-950/20 backdrop-blur-sm`} onClick={() => setShowLog(false)}>
                        <div className="teacher-glass-drawer w-96 h-full flex flex-col" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
                                <h3 className="flex items-center text-lg font-black text-slate-950">
                                    <i className="fas fa-list-ul mr-2 text-blue-600"></i> 学生操作日志
                                </h3>
                                <button onClick={() => setShowLog(false)} className="text-slate-400 hover:text-slate-900"><i className="fas fa-xmark text-xl"></i></button>
                            </div>
                            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5 text-sm">
                                {sharedStudentLog.length === 0 ? (
                                    <div className="text-center text-slate-400 mt-16">
                                        <i className="fas fa-inbox text-3xl mb-3 block"></i>暂无记录
                                    </div>
                                ) : (
                                    [...sharedStudentLog].reverse().map((entry, i) => {
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

                {showSettings && (
                    <SettingsPanel settings={settings} onSettingsChange={handleSettingsChange} socket={socketRef.current} onClose={() => setShowSettings(false)} zIndex={getTeacherLayerClass('drawer')} />
                )}
            </div>
        </window.LumeSyncRenderEngine.CourseErrorBoundary>
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

    ensureTeacherShellStyles();

    const root = ReactDOM.createRoot(rootElement);
    console.log('[TeacherApp] starting with core render engine...');
    root.render(<ClassroomApp />);
};

bootEngine();
