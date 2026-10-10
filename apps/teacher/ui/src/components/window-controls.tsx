// ========================================================
// 窗口控制组件 - 最小化、最大化/还原、关闭
// ========================================================
function WindowControls({ forceFullscreen = false }) {
    const [isMaximized, setIsMaximized] = useState(false);

    useEffect(() => {
        if (forceFullscreen) {
            return;
        }

        // 监听窗口最大化/还原状态变化
        const handleMaximize = () => setIsMaximized(true);
        const handleUnmaximize = () => setIsMaximized(false);

        if (window.electronAPI?.onWindowMaximized) {
            window.electronAPI.onWindowMaximized(handleMaximize);
            window.electronAPI.onWindowUnmaximized(handleUnmaximize);
        }

        return () => {
            if (window.electronAPI?.removeWindowMaximizedListener) {
                window.electronAPI.removeWindowMaximizedListener(handleMaximize);
                window.electronAPI.removeWindowUnmaximizedListener(handleUnmaximize);
            }
        };
    }, [forceFullscreen]);

    // 当强制全屏时，不显示窗口控制按钮
    if (forceFullscreen) {
        return null;
    }

    const handleMinimize = () => {
        if (window.electronAPI?.minimizeWindow) {
            window.electronAPI.minimizeWindow();
        }
    };

    const handleMaximize = () => {
        if (window.electronAPI?.maximizeWindow) {
            window.electronAPI.maximizeWindow();
        }
    };

    const handleClose = () => {
        if (window.electronAPI?.closeWindow) {
            window.electronAPI.closeWindow();
        }
    };

    return (
        <div className="flex items-center gap-1 rounded-2xl bg-slate-950/10 p-1 border border-white/20" style={{ WebkitAppRegion: 'no-drag' }}>
            <button
                onClick={handleMinimize}
                className="w-10 h-8 flex items-center justify-center rounded-xl text-slate-500 hover:text-white hover:bg-sky-500/70 transition-colors"
                title="最小化"
            >
                <i className="fas fa-minus text-sm"></i>
            </button>
            <button
                onClick={handleMaximize}
                className="w-10 h-8 flex items-center justify-center rounded-xl text-slate-500 hover:text-white hover:bg-sky-500/70 transition-colors"
                title={isMaximized ? "还原" : "最大化"}
            >
                <i className={`fas ${isMaximized ? 'fa-compress' : 'fa-expand'} text-sm`}></i>
            </button>
            <button
                onClick={handleClose}
                className="w-10 h-8 flex items-center justify-center rounded-xl text-slate-500 hover:text-white hover:bg-rose-500 transition-colors"
                title="关闭"
            >
                <i className="fas fa-xmark text-sm"></i>
            </button>
        </div>
    );
}

