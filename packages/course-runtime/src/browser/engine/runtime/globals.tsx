// ========================================================
// 全局 React Hook 解构 — 所有模块共享
// ========================================================
const { useState, useEffect, useRef, useMemo, useCallback, useContext, useReducer } = React;
const { createPortal } = ReactDOM;

// 创建 portal 容器
let portalRoot = null;
const getPortalRoot = () => {
    if (!portalRoot) {
        portalRoot = document.createElement('div');
        portalRoot.id = 'portal-root';
        portalRoot.style.position = 'fixed';
        portalRoot.style.top = '0';
        portalRoot.style.left = '0';
        portalRoot.style.zIndex = '999999';
        document.body.appendChild(portalRoot);
    }
    return portalRoot;
};

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
    const styles = {
        liquidGlassDark: 'bg-slate-900/70 backdrop-blur-xl border border-white/15 shadow-[0_10px_30px_rgba(15,23,42,0.45)]',
        liquidGlassLight: 'bg-white/75 backdrop-blur-xl border border-white/70 shadow-[0_10px_30px_rgba(15,23,42,0.2)]'
    };

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

    const relayoutSideToolbars = () => {
        const nodes = Array.from(document.querySelectorAll('[data-ls-side-toolbar="1"]'));
        if (!nodes.length) return;

        // 先重置位移，使用自然布局进行测量
        nodes.forEach((node) => {
            node.style.marginTop = '0px';
        });

        const groups = new Map();
        nodes.forEach((node) => {
            const side = node.getAttribute('data-ls-side') || 'right';
            const key = `${side}::${node.offsetParent ? 'has-parent' : 'no-parent'}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(node);
        });

        const viewportTop = 12;
        const viewportBottom = (window.innerHeight || document.documentElement.clientHeight || 0) - 12;
        const gap = 10;

        groups.forEach((groupNodes) => {
            const sorted = groupNodes
                .map((node) => ({ node, rect: node.getBoundingClientRect() }))
                .sort((a, b) => a.rect.top - b.rect.top);

            const placed = [];
            sorted.forEach(({ node, rect }) => {
                let shiftY = 0;

                // 与已放置工具栏避免重叠
                placed.forEach((prevRect) => {
                    const hOverlap = rect.left < prevRect.right && rect.right > prevRect.left;
                    if (!hOverlap) return;
                    const minTop = prevRect.bottom + gap;
                    if (rect.top + shiftY < minTop) {
                        shiftY = minTop - rect.top;
                    }
                });

                // 智能贴边：限制在可视区域内
                if (rect.top + shiftY < viewportTop) {
                    shiftY += viewportTop - (rect.top + shiftY);
                }
                if (rect.bottom + shiftY > viewportBottom) {
                    shiftY -= (rect.bottom + shiftY - viewportBottom);
                }

                node.style.marginTop = `${Math.round(shiftY)}px`;
                const finalRect = node.getBoundingClientRect();
                placed.push(finalRect);
            });
        });
    };

    const SideToolbar = ({
        visible,
        panelVisible = false,
        panel,
        toolbar,
        buttons = null,
        activePopupKey = null,
        onActivePopupChange = null,
        renderPopupContent = null,
        toolbarPrefix = null,
        toolbarSuffix = null,
        popupWrapperClassName = '',
        popupClassName = '',
        buttonBaseClassName = '',
        side = 'right',
        offsetClass = 'right-4 top-1/2 -translate-y-1/2',
        zIndexClass = 'z-[60]',
        containerClassName = '',
        panelClassName = '',
        toolbarClassName = '',
        toolbarExitMs = 220,
        panelExitMs = 180,
        smartEdge = true,
        scale = 1
    }) => {
        const hasPresetToolbar = !!toolbar;
        const popupNode = !hasPresetToolbar && typeof renderPopupContent === 'function'
            ? renderPopupContent(activePopupKey, {
                closePanel: () => onActivePopupChange && onActivePopupChange(null),
                setActivePopupKey: onActivePopupChange
            })
            : panel;
        const effectivePanelVisible = hasPresetToolbar
            ? !!panelVisible
            : !!activePopupKey && !!popupNode;

        const togglePopup = (key) => {
            if (!onActivePopupChange) return;
            onActivePopupChange(activePopupKey === key ? null : key);
        };

        const defaultButtonClass = buttonBaseClassName || 'w-9 h-9 rounded-xl text-sm bg-slate-700 hover:bg-slate-600 disabled:text-slate-500';

        const toolbarNode = hasPresetToolbar
            ? toolbar
            : (
                <div className={`w-16 ${styles.liquidGlassDark} rounded-2xl p-2 text-white flex flex-col items-center gap-2 ${toolbarClassName}`}>
                    {toolbarPrefix}
                    {(Array.isArray(buttons) ? buttons : []).map((btn, idx) => {
                        if (!btn || btn.hidden) return null;
                        if (typeof btn.render === 'function') {
                            return <React.Fragment key={btn.id || idx}>{btn.render({ activePopupKey, setActivePopupKey: onActivePopupChange, togglePopup })}</React.Fragment>;
                        }
                        const active = typeof btn.active === 'function' ? !!btn.active(activePopupKey) : !!btn.active;
                        return (
                            <button
                                key={btn.id || idx}
                                title={btn.title || ''}
                                disabled={!!btn.disabled}
                                onClick={() => {
                                    if (btn.popupKey) togglePopup(btn.popupKey);
                                    if (typeof btn.onClick === 'function') {
                                        btn.onClick({ activePopupKey, setActivePopupKey: onActivePopupChange, togglePopup, button: btn });
                                    }
                                }}
                                className={`${defaultButtonClass} ${active ? 'bg-blue-600 hover:bg-blue-500' : ''} ${btn.className || ''}`}
                            >
                                {btn.iconClass ? <i className={`fas ${btn.iconClass}`}></i> : (btn.content || null)}
                            </button>
                        );
                    })}
                    {toolbarSuffix}
                </div>
            );

        const toolbarPresence = usePresence(!!visible, toolbarExitMs);
        const panelPresence = usePresence(!!visible && !!effectivePanelVisible, panelExitMs);
        const containerRef = useRef(null);

        const isRight = side !== 'left';
        const originClass = isRight ? 'origin-right' : 'origin-left';
        const safeScale = Number.isFinite(Number(scale)) ? Math.min(Math.max(Number(scale), 0.65), 1.25) : 1;
        const scaleOrigin = isRight ? 'right center' : 'left center';
        const motionIn = 'translate-x-0 opacity-100 scale-100';
        const motionOut = isRight ? 'translate-x-3 opacity-0 scale-95' : '-translate-x-3 opacity-0 scale-95';
        const panelIn = 'translate-x-0 opacity-100';
        const panelOut = isRight ? 'translate-x-2 opacity-0' : '-translate-x-2 opacity-0';

        const toolbarMotionClass = toolbarPresence.closing ? motionOut : motionIn;
        const panelMotionClass = panelPresence.closing ? panelOut : panelIn;

        useEffect(() => {
            const el = containerRef.current;
            if (!el) return;

            const schedule = () => {
                window.requestAnimationFrame(() => {
                    relayoutSideToolbars();
                });
            };

            if (!toolbarPresence.render || !smartEdge || !visible) {
                el.style.marginTop = '0px';
                return;
            }

            el.setAttribute('data-ls-side-toolbar', '1');
            el.setAttribute('data-ls-side', side !== 'left' ? 'right' : 'left');

            schedule();
            window.addEventListener('resize', schedule);
            return () => {
                window.removeEventListener('resize', schedule);
                el.style.marginTop = '0px';
                el.removeAttribute('data-ls-side-toolbar');
                el.removeAttribute('data-ls-side');
                schedule();
            };
        }, [smartEdge, visible, side, offsetClass, activePopupKey, panelPresence.render, toolbarPresence.render, safeScale]);

        if (!toolbarPresence.render) return null;

        const node = (
            <div ref={containerRef} className={`fixed ${offsetClass} ${zIndexClass} pointer-events-none ${containerClassName}`}>
                <div
                    className={`relative pointer-events-auto transition-all duration-200 ease-out ${originClass} ${toolbarMotionClass} ${hasPresetToolbar ? toolbarClassName : ''}`}
                    style={{
                        transformOrigin: scaleOrigin,
                        transform: `scale(${safeScale})`
                    }}
                >
                    {toolbarNode}

                    {panelPresence.render && (
                        <div
                            className={`absolute top-1/2 -translate-y-1/2 ${isRight ? 'right-full mr-3' : 'left-full ml-3'} pointer-events-auto transition-all duration-200 ease-out ${panelMotionClass} ${hasPresetToolbar ? panelClassName : popupWrapperClassName}`}
                        >
                            {hasPresetToolbar ? popupNode : <div className={`${popupClassName}`}>{popupNode}</div>}
                        </div>
                    )}
                </div>
            </div>
        );

        return createPortal(node, getPortalRoot());
    };

    return { SideToolbar, usePresence, styles };
})();

if (window.CourseGlobalContext) {
    window.CourseGlobalContext.canvas = window.__LumeSyncCanvas;
}
