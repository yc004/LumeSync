// ========================================================
// 全局 React Hook 解构 — 所有模块共享
// ========================================================
const { useState, useEffect, useRef } = React;

if (!window.__LumeSyncDevtoolsHotkeyBound) {
    window.__LumeSyncDevtoolsHotkeyBound = true;
    window.addEventListener('keydown', (e) => {
        const key = String(e.key || '').toLowerCase();
        if (key !== 'd') return;
        const mod = e.ctrlKey || e.metaKey;
        if (!mod || !e.shiftKey) return;
        if (!window.electronAPI || typeof window.electronAPI.toggleDevTools !== 'function') return;
        e.preventDefault();
        try { window.electronAPI.toggleDevTools(); } catch (_) {}
    }, true);
}

window.__LumeSyncCanvas = window.__LumeSyncCanvas || (() => {
    const n = (v) => {
        const x = parseFloat(String(v ?? '0'));
        return Number.isFinite(x) ? x : 0;
    };

    const getCanvasPoint = (evt, canvas) => {
        if (!canvas) return null;

        const e = evt && evt.nativeEvent ? evt.nativeEvent : evt;
        const clientX = e && typeof e.clientX === 'number' ? e.clientX : null;
        const clientY = e && typeof e.clientY === 'number' ? e.clientY : null;
        if (clientX === null || clientY === null) return null;

        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;

        const st = getComputedStyle(canvas);
        const bL = n(st.borderLeftWidth);
        const bR = n(st.borderRightWidth);
        const bT = n(st.borderTopWidth);
        const bB = n(st.borderBottomWidth);

        const layoutW = canvas.clientWidth || 0;
        const layoutH = canvas.clientHeight || 0;
        const borderBoxW = layoutW + bL + bR;
        const borderBoxH = layoutH + bT + bB;
        const sX = borderBoxW ? rect.width / borderBoxW : 1;
        const sY = borderBoxH ? rect.height / borderBoxH : 1;

        const contentLeft = rect.left + bL * sX;
        const contentTop = rect.top + bT * sY;
        const contentW = Math.max(rect.width - (bL + bR) * sX, 1);
        const contentH = Math.max(rect.height - (bT + bB) * sY, 1);
        const effectiveLayoutW = layoutW || Math.round(contentW);
        const effectiveLayoutH = layoutH || Math.round(contentH);

        const x = (clientX - contentLeft) * (effectiveLayoutW / contentW);
        const y = (clientY - contentTop) * (effectiveLayoutH / contentH);

        return {
            x,
            y,
            nx: effectiveLayoutW ? x / effectiveLayoutW : 0,
            ny: effectiveLayoutH ? y / effectiveLayoutH : 0,
            width: effectiveLayoutW,
            height: effectiveLayoutH,
        };
    };

    const getHiDpiContext2d = (canvas, w, h) => {
        if (!canvas) return null;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.floor(w * dpr));
        canvas.height = Math.max(1, Math.floor(h * dpr));
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        return ctx;
    };

    const useCanvasDims = (padL, padR, padT, padB) => {
        const wrapRef = useRef(null);
        const [dims, setDims] = useState({ cw: 400, ch: 300, padL, padR, padT, padB });

        useEffect(() => {
            const el = wrapRef.current;
            if (!el) return;
            const update = () => {
                const width = el.clientWidth;
                const height = el.clientHeight;
                if (width > 20 && height > 20) setDims({ cw: Math.floor(width), ch: Math.floor(height), padL, padR, padT, padB });
            };
            update();
            const ro = new ResizeObserver(update);
            ro.observe(el);
            return () => ro.disconnect();
        }, []);

        return { wrapRef, dims };
    };

    return { getCanvasPoint, getHiDpiContext2d, useCanvasDims };
})();

window.__LumeSyncUI = window.__LumeSyncUI || (() => {
    const usePresence = (visible, exitMs = 220) => {
        const [render, setRender] = useState(!!visible);
        const [closing, setClosing] = useState(false);

        useEffect(() => {
            if (visible) {
                setRender(true);
                setClosing(false);
                return;
            }
            if (!render) return;
            setClosing(true);
            const timer = setTimeout(() => {
                setRender(false);
                setClosing(false);
            }, exitMs);
            return () => clearTimeout(timer);
        }, [visible, render, exitMs]);

        return { render, closing };
    };

    const SideToolbar = ({
        visible,
        panelVisible = false,
        panel,
        toolbar,
        side = 'right',
        offsetClass = 'right-4 top-1/2 -translate-y-1/2',
        zIndexClass = 'z-[60]',
        containerClassName = '',
        panelClassName = '',
        toolbarClassName = '',
        toolbarExitMs = 220,
        panelExitMs = 180
    }) => {
        const toolbarPresence = usePresence(!!visible, toolbarExitMs);
        const panelPresence = usePresence(!!visible && !!panelVisible, panelExitMs);

        if (!toolbarPresence.render) return null;

        const isRight = side !== 'left';
        const originClass = isRight ? 'origin-right' : 'origin-left';
        const motionIn = 'translate-x-0 opacity-100 scale-100';
        const motionOut = isRight ? 'translate-x-3 opacity-0 scale-95' : '-translate-x-3 opacity-0 scale-95';
        const panelIn = 'translate-x-0 opacity-100';
        const panelOut = isRight ? 'translate-x-2 opacity-0' : '-translate-x-2 opacity-0';

        const toolbarMotionClass = toolbarPresence.closing ? motionOut : motionIn;
        const panelMotionClass = panelPresence.closing ? panelOut : panelIn;

        return (
            <div className={`absolute ${offsetClass} ${zIndexClass} flex items-center gap-3 pointer-events-none ${containerClassName}`}>
                {isRight && panelPresence.render && (
                    <div className={`pointer-events-auto transition-all duration-200 ease-out ${panelMotionClass} ${panelClassName}`}>
                        {panel}
                    </div>
                )}

                <div className={`pointer-events-auto transition-all duration-200 ease-out ${originClass} ${toolbarMotionClass} ${toolbarClassName}`}>
                    {toolbar}
                </div>

                {!isRight && panelPresence.render && (
                    <div className={`pointer-events-auto transition-all duration-200 ease-out ${panelMotionClass} ${panelClassName}`}>
                        {panel}
                    </div>
                )}
            </div>
        );
    };

    return { SideToolbar, usePresence };
})();

if (window.CourseGlobalContext) {
    window.CourseGlobalContext.canvas = window.__LumeSyncCanvas;
}
