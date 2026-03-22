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
        <div className="flex items-center" style={{ WebkitAppRegion: 'no-drag' }}>
            <button
                onClick={handleMinimize}
                className="w-11 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                title="最小化"
            >
                <i className="fas fa-minus text-sm"></i>
            </button>
            <button
                onClick={handleMaximize}
                className="w-11 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                title={isMaximized ? "还原" : "最大化"}
            >
                <i className={`fas ${isMaximized ? 'fa-compress' : 'fa-expand'} text-sm`}></i>
            </button>
            <button
                onClick={handleClose}
                className="w-11 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-red-600 transition-colors"
                title="关闭"
            >
                <i className="fas fa-xmark text-sm"></i>
            </button>
        </div>
    );
}
