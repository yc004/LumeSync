// ========================================================
// 萤火课件编辑器 - 主应用程序
// ========================================================

// 简化的预览组件，用于编辑器中预览课件
function SimplePreview({ title, slides, contentScale = 0.96, uiScale = 1.0 }) {
    const [currentSlide, setCurrentSlide] = useState(0);
    const stageWrapRef = useRef(null);
    const [stageScale, setStageScale] = useState(1);

    const nextSlide = () => {
        if (currentSlide < slides.length - 1) setCurrentSlide(currentSlide + 1);
    };

    const prevSlide = () => {
        if (currentSlide > 0) setCurrentSlide(currentSlide - 1);
    };

    // 实现自适应缩放以保持 16:9
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

        const resizeObserver = new ResizeObserver(updateScale);
        if (stageWrapRef.current) resizeObserver.observe(stageWrapRef.current);
        updateScale();

        return () => resizeObserver.disconnect();
    }, []);

    return (
        <div className="flex flex-col h-full bg-slate-900">
            {/* 简化顶栏 */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-800 border-b border-slate-700 shrink-0">
                <div className="flex items-center space-x-3">
                    <i className="fas fa-microchip text-blue-500 text-xl"></i>
                    <h1 className="text-lg font-bold text-white">{title || '预览'}</h1>
                </div>
                <div className="flex items-center space-x-2">
                    <div className="flex space-x-1">
                        {slides.map((_, idx) => (
                            <div key={idx} className={`h-2 rounded-full transition-all ${idx === currentSlide ? 'w-6 bg-blue-500' : 'w-2 bg-slate-600'}`} />
                        ))}
                    </div>
                </div>
            </div>

            {/* 课件展示区 - 强制 16:9 */}
            <div className="flex-1 relative flex items-center justify-center p-4 overflow-hidden bg-slate-950">
                <div ref={stageWrapRef} className="w-full h-full flex items-center justify-center overflow-hidden">
                    <div
                        style={{
                            width: '1280px',
                            height: '720px',
                            transform: `scale(${stageScale * uiScale})`,
                            transformOrigin: 'center center',
                            transition: 'transform 0.2s ease-out'
                        }}
                        className="bg-white text-slate-800 relative shadow-2xl flex flex-col rounded-xl overflow-y-auto no-scrollbar shrink-0"
                    >
                        <div className="w-full h-full relative overflow-hidden">
                            <div
                                className="absolute top-0 left-0"
                                style={{
                                    transform: `scale(${contentScale})`,
                                    transformOrigin: 'top left',
                                    width: `${100 / (contentScale || 1)}%`,
                                    height: `${100 / (contentScale || 1)}%`,
                                }}
                            >
                                {slides[currentSlide] && slides[currentSlide].component}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 简化底栏 */}
            <div className="flex items-center justify-center gap-4 px-6 py-4 bg-slate-800 border-t border-slate-700 shrink-0">
                <button 
                    onClick={prevSlide} 
                    disabled={currentSlide === 0}
                    className={`flex items-center px-4 py-2 rounded-lg font-bold transition-all ${currentSlide === 0 ? 'text-slate-500 bg-slate-700 cursor-not-allowed' : 'text-white bg-blue-600 hover:bg-blue-500'}`}
                >
                    <i className="fas fa-chevron-left mr-2"></i>上一页
                </button>
                <span className="text-slate-400 font-bold bg-slate-700 px-4 py-2 rounded-lg">
                    {currentSlide + 1} / {slides.length}
                </span>
                <button 
                    onClick={nextSlide} 
                    disabled={currentSlide === slides.length - 1}
                    className={`flex items-center px-4 py-2 rounded-lg font-bold transition-all ${currentSlide === slides.length - 1 ? 'text-slate-500 bg-slate-700 cursor-not-allowed' : 'text-white bg-blue-600 hover:bg-blue-500'}`}
                >
                    下一页<i className="fas fa-chevron-right ml-2"></i>
                </button>
            </div>
        </div>
    );
}

// 提供一个简单的加载提示组件
function SimpleLoading() {
    return (
        <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <i className="fas fa-spinner fa-spin text-3xl mb-4 text-blue-500"></i>
            <p>正在编译并渲染课件...</p>
        </div>
    );
}

// 错误提示组件
function ErrorBoundary({ error, onAutoFix }) {
    if (!error) return null;
    return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-red-400 bg-red-950/20">
            <i className="fas fa-exclamation-triangle text-4xl mb-4"></i>
            <h3 className="font-bold text-lg mb-2">编译或执行失败</h3>
            <pre className="bg-red-900/40 p-4 rounded-xl w-full max-w-2xl overflow-x-auto text-sm font-mono whitespace-pre-wrap show-scrollbar mb-6">{error.toString()}</pre>
            
            {onAutoFix && (
                <button 
                    onClick={onAutoFix}
                    className="px-8 py-3 bg-red-600 hover:bg-red-500 text-white rounded-full font-bold flex items-center shadow-lg transition-all active:scale-95"
                >
                    <i className="fas fa-magic mr-2"></i> 一键修复代码
                </button>
            )}
        </div>
    );
}

// 正在生成状态组件（带计时器）
function GeneratingStatus() {
    const [seconds, setSeconds] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setSeconds(s => s + 1);
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="flex flex-col items-center justify-center h-full text-slate-400 bg-slate-900/50 backdrop-blur-sm">
            <div className="relative mb-6">
                <i className="fas fa-robot text-5xl text-blue-500 animate-pulse"></i>
                <div className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                </div>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">AI 正在努力生成中...</h3>
            <p className="text-slate-400 mb-4 text-center max-w-xs">
                正在根据您的要求编写互动课件代码，生成完成后将自动进行实时预览。
            </p>
            <div className="flex items-center space-x-2 bg-slate-800 px-4 py-2 rounded-full border border-slate-700 shadow-lg">
                <i className="fas fa-clock text-blue-400"></i>
                <span className="font-mono text-blue-400 font-bold">{seconds}s</span>
            </div>
        </div>
    );
}

function EditorApp() {
    const [code, setCode] = useState(`// 在此编写你的 TypeScript 课件代码，或者通过右侧 AI 助手自动生成
window.CourseData = {
    id: 'ai-demo',
    title: '示例课程',
    icon: '💡',
    desc: '在右侧和 AI 聊天，或者直接修改此处的代码。',
    color: 'from-blue-500 to-indigo-600',
    slides: [
        {
            title: '第一页',
            component: <div className="flex items-center justify-center h-full bg-slate-50 text-2xl font-bold text-blue-600">你好，我是萤火课堂！</div>
        }
    ]
};`);
    
    const [viewMode, setViewMode] = useState('preview'); // 'preview' | 'code'
    const [isAIGenerating, setIsAIGenerating] = useState(false);
    const [compiledCourseData, setCompiledCourseData] = useState(null);
    const [compileError, setCompileError] = useState(null);
    const [isCompiling, setIsCompiling] = useState(false);
    const [toasts, setToasts] = useState([]);
    const [currentFilePath, setCurrentFilePath] = useState('');
    const [currentFileName, setCurrentFileName] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [uiScale, setUiScale] = useState(1.0);
    const [renderScale, setRenderScale] = useState(0.96);
    const [showScalePanel, setShowScalePanel] = useState(false);
    const fileInputRef = useRef(null);
    const textareaRef = useRef(null);
    const lineNumbersRef = useRef(null);
    const aiChatRef = useRef(null);
    const autoScrollRef = useRef(true);
    const compileTokenRef = useRef(0);

    const showToast = (message, type = 'info') => {
        const id = Date.now() + Math.random();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 2500);
    };

    useEffect(() => {
        try {
            const raw = localStorage.getItem('lumesync.editor.renderScale');
            const value = Number(raw);
            if (Number.isFinite(value)) {
                setRenderScale(Math.min(Math.max(value, 0.6), 1.2));
            }
        } catch (_) {}
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem('lumesync.editor.renderScale', String(renderScale));
        } catch (_) {}
    }, [renderScale]);

    useEffect(() => {
        try {
            const raw = localStorage.getItem('lumesync.editor.uiScale');
            const value = Number(raw);
            if (Number.isFinite(value)) {
                setUiScale(Math.min(Math.max(value, 0.8), 1.2));
            }
        } catch (_) {}
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem('lumesync.editor.uiScale', String(uiScale));
        } catch (_) {}
    }, [uiScale]);

    const handleAutoFix = () => {
        if (aiChatRef.current) {
            aiChatRef.current.handleAutoFix();
        }
    };

    const handleScroll = () => {
        if (textareaRef.current && lineNumbersRef.current) {
            lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
        }
        if (textareaRef.current) {
            const el = textareaRef.current;
            const distanceToBottom = (el.scrollHeight - el.scrollTop - el.clientHeight);
            autoScrollRef.current = distanceToBottom < 60;
        }
    };

    useEffect(() => {
        if (isAIGenerating) {
            autoScrollRef.current = true;
        }
    }, [isAIGenerating]);

    useEffect(() => {
        if (!isAIGenerating) return;
        if (viewMode !== 'code') return;
        if (!autoScrollRef.current) return;
        if (!textareaRef.current) return;

        requestAnimationFrame(() => {
            const el = textareaRef.current;
            if (!el) return;
            el.scrollTop = el.scrollHeight;
            if (lineNumbersRef.current) {
                lineNumbersRef.current.scrollTop = el.scrollTop;
            }
        });
    }, [code, viewMode, isAIGenerating]);

    const lineCount = code.split('\n').length;
    const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

    const getDefaultFilename = () => {
        let defaultFilename = 'untitled.lume';
        const idMatch = code.match(/id:\s*['"]([^'"]+)['"]/);
        if (idMatch && idMatch[1]) {
            defaultFilename = `${idMatch[1]}.lume`;
        }
        return defaultFilename;
    };

    const normalizeLocalUrl = (u) => {
        const url = String(u || '').trim();
        if (!url) return '';
        if (location.protocol === 'file:' && url.startsWith('/')) return url.slice(1);
        return url;
    };

    const loadScriptWithFallback = (localSrc, publicSrc) => {
        const local = normalizeLocalUrl(localSrc);
        const pub = String(publicSrc || '').trim();
        if (local && document.querySelector(`script[src="${local}"]`)) return Promise.resolve(true);
        if (pub && document.querySelector(`script[src="${pub}"]`)) return Promise.resolve(true);

        return new Promise((resolve) => {
            const tryPublic = () => {
                if (!pub || document.querySelector(`script[src="${pub}"]`)) return resolve(!!pub);
                const s2 = document.createElement('script');
                s2.src = pub;
                s2.onload = () => resolve(true);
                s2.onerror = () => resolve(false);
                document.head.appendChild(s2);
            };

            if (!local) return tryPublic();
            const s1 = document.createElement('script');
            s1.src = local;
            s1.onload = () => resolve(true);
            s1.onerror = () => tryPublic();
            document.head.appendChild(s1);
        });
    };

    const loadCssWithFallback = (id, localHref, publicHref) => {
        const local = normalizeLocalUrl(localHref);
        const pub = String(publicHref || '').trim();
        if (id && document.getElementById(id)) return Promise.resolve(true);

        return new Promise((resolve) => {
            const tryPublic = () => {
                if (!pub) return resolve(false);
                const link2 = document.createElement('link');
                if (id) link2.id = id;
                link2.rel = 'stylesheet';
                link2.href = pub;
                link2.onload = () => resolve(true);
                link2.onerror = () => resolve(false);
                document.head.appendChild(link2);
            };

            if (!local) return tryPublic();
            const link1 = document.createElement('link');
            if (id) link1.id = id;
            link1.rel = 'stylesheet';
            link1.href = local;
            link1.onload = () => resolve(true);
            link1.onerror = () => tryPublic();
            document.head.appendChild(link1);
        });
    };

    const ensureDependencies = async (courseData) => {
        const deps = Array.isArray(courseData?.dependencies) ? courseData.dependencies : [];
        if (!deps.length) return;
        const hasKatex = deps.some(d => String(d?.name || '').toLowerCase().includes('katex') || String(d?.localSrc || '').includes('katex.min.js') || String(d?.publicSrc || '').includes('katex.min.js'));
        if (hasKatex) {
            const katexDep = deps.find(d => String(d?.localSrc || '').includes('katex.min.js') || String(d?.publicSrc || '').includes('katex.min.js'));
            const pubJs = String(katexDep?.publicSrc || '').trim();
            const pubCssRaw = pubJs ? pubJs.replace(/katex\.min\.js(\?.*)?$/i, 'katex.min.css') : 'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css';
            const pubCss = pubCssRaw.replace('cdn.jsdelivr.net', 'fastly.jsdelivr.net');
            await loadCssWithFallback('lumesync-katex-css', '/lib/katex.min.css', pubCss);
        }
        for (const dep of deps) {
            await loadScriptWithFallback(dep?.localSrc, dep?.publicSrc);
        }
    };

    const runCode = async (sourceCode) => {
        const token = ++compileTokenRef.current;
        setIsCompiling(true);
        setCompileError(null);
        
        try {
            // 清理旧的全局状态
            window.CourseData = null;

            // Babel 编译
            const result = window.Babel.transform(sourceCode, { 
                presets: ['react', 'typescript'], 
                filename: 'course.tsx' 
            });

            // 执行代码
            const runFn = new Function(result.code);
            runFn();

            // 获取结果
            if (window.CourseData) {
                await ensureDependencies(window.CourseData);
                if (token !== compileTokenRef.current) return;
                setCompiledCourseData(window.CourseData);
            } else {
                setCompileError(new Error("代码执行成功，但没有找到 window.CourseData 导出"));
            }
        } catch (err) {
            setCompileError(err);
            setCompiledCourseData(null);
        } finally {
            if (token === compileTokenRef.current) setIsCompiling(false);
        }
    };

    // 初次加载和代码变更时尝试编译
    useEffect(() => {
        // AI 正在生成时暂停自动编译，避免由于代码不完整导致的语法错误提示
        if (isAIGenerating) return;

        // 使用防抖避免频繁编译
        const timer = setTimeout(() => {
            if (viewMode === 'preview') {
                runCode(code);
            }
        }, 800);
        return () => clearTimeout(timer);
    }, [code, viewMode, isAIGenerating]);

    const handleAIGeneratedCode = (newCode) => {
        setCode(newCode);
        // 不再强制跳转到预览视图，保持用户当前的视图模式 (预览或源码)
        // setViewMode('preview');
        
        // AI 正在生成时，不执行实时编译，防止显示中间过程的语法错误
        // 编译将由 useEffect 在生成结束 (isAIGenerating 变为 false) 时统一触发
        if (viewMode === 'preview' && !isAIGenerating) {
            runCode(newCode);
        }
    };

    const handleImport = (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            setCode(content);
            setViewMode('code');
            setCurrentFilePath('');
            setCurrentFileName(file.name);
            runCode(content); // 立即编译预览
            showToast(`已导入: ${file.name}`, 'success');
        };
        reader.readAsText(file, 'utf-8');
        // 重置 input 以便可以重复导入同一文件
        event.target.value = '';
    };

    const handleExport = async () => {
        // 尝试从代码中提取 id 作为文件名
        let defaultFilename = 'untitled.lume';
        const idMatch = code.match(/id:\s*['"]([^'"]+)['"]/);
        if (idMatch && idMatch[1]) {
            defaultFilename = `${idMatch[1]}.lume`;
        }

        try {
            // 创建文件内容
            const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);

            // 创建临时下载链接
            const a = document.createElement('a');
            a.href = url;
            a.download = defaultFilename;
            a.click();

            // 清理
            URL.revokeObjectURL(url);

            showToast('导出成功: ' + defaultFilename, 'success');
        } catch (e) {
            console.error('导出失败:', e);
            showToast('导出失败', 'error');
        }
    };

    const handleOpenCourse = async () => {
        if (window.electronAPI?.openCourseFile) {
            const result = await window.electronAPI.openCourseFile();
            if (!result || result.canceled) return;
            if (!result.success) {
                showToast(`打开失败: ${result.error || '未知错误'}`, 'error');
                return;
            }

            const openedContent = result.content || '';
            setCode(openedContent);
            setViewMode('code');
            setCurrentFilePath(result.filePath || '');
            setCurrentFileName(result.filename || '');
            runCode(openedContent);
            showToast(`已打开: ${result.filename}`, 'success');
            return;
        }

        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleSaveCourse = async () => {
        if (window.electronAPI?.saveCourseFile) {
            setIsSaving(true);
            try {
                const result = await window.electronAPI.saveCourseFile({
                    content: code,
                    filePath: currentFilePath || '',
                    suggestedName: currentFileName || getDefaultFilename(),
                });
                if (!result || result.canceled) return;
                if (!result.success) {
                    showToast(`保存失败: ${result.error || '未知错误'}`, 'error');
                    return;
                }

                setCurrentFilePath(result.filePath || '');
                setCurrentFileName(result.filename || '');
                showToast(`已保存: ${result.filename}`, 'success');
                return;
            } finally {
                setIsSaving(false);
            }
        }

        await handleExport();
    };

    const clampedUiScale = Math.min(Math.max(uiScale, 0.8), 1.2);
    const clampedRenderScale = Math.min(Math.max(renderScale, 0.6), 1.2);

    return (
        <div className="flex h-screen w-full bg-slate-900 text-slate-200 overflow-hidden font-sans">
            
            {/* 左侧主要区域 (预览 / 代码) */}
            <div className="flex-1 flex flex-col h-full overflow-hidden relative">
                
                {/* 顶栏 */}
                <div className="flex items-center justify-between px-6 py-4 bg-slate-800 border-b border-slate-700 shrink-0" style={{WebkitAppRegion:'drag'}}>
                    <div className="flex items-center space-x-3">
                        <i className="fas fa-wand-magic-sparkles text-amber-400 text-2xl"></i>
                        <h1 className="text-xl font-bold text-white tracking-wide">AI 课件编辑器</h1>
                    </div>
                    
                    <div className="flex items-center space-x-4" style={{WebkitAppRegion:'no-drag'}}>
                        {/* 视图切换 */}
                        <div className="bg-slate-900 rounded-lg p-1 flex shadow-inner border border-slate-700">
                            <button 
                                onClick={() => setViewMode('preview')}
                                className={`px-4 py-1.5 rounded-md text-sm font-bold transition-colors flex items-center ${viewMode === 'preview' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
                            >
                                <i className="fas fa-eye mr-2"></i> 实时预览
                            </button>
                            <button 
                                onClick={() => setViewMode('code')}
                                className={`px-4 py-1.5 rounded-md text-sm font-bold transition-colors flex items-center ${viewMode === 'code' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
                            >
                                <i className="fas fa-code mr-2"></i> 源码编辑
                            </button>
                        </div>

                        <div className="relative">
                            <button
                                onClick={() => setShowScalePanel(v => !v)}
                                className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors text-sm font-bold flex items-center shadow-md"
                                title="缩放设置"
                            >
                                <i className="fas fa-up-down-left-right mr-2"></i>
                                {Math.round(clampedUiScale * 100)}% / {Math.round(clampedRenderScale * 100)}%
                            </button>
                            {showScalePanel && (
                                <div className="absolute right-0 mt-2 w-72 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl p-4 z-50">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-sm font-bold text-white">缩放设置</span>
                                        <button
                                            onClick={() => setShowScalePanel(false)}
                                            className="text-slate-400 hover:text-slate-200"
                                            title="关闭"
                                        >
                                            <i className="fas fa-xmark"></i>
                                        </button>
                                    </div>
                                    <div className="border border-slate-700 rounded-lg p-3 mb-3">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs text-slate-400 font-bold">课件页面缩放</span>
                                            <span className="text-sm font-mono text-slate-200">{Math.round(clampedUiScale * 100)}%</span>
                                        </div>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs text-slate-400">80%</span>
                                            <span className="text-xs text-slate-400">120%</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0.8"
                                            max="1.2"
                                            step="0.01"
                                            value={clampedUiScale}
                                            onChange={e => setUiScale(Number(e.target.value))}
                                            className="w-full"
                                        />
                                        <div className="flex justify-end mt-3">
                                            <button
                                                onClick={() => setUiScale(1.0)}
                                                className="text-xs text-blue-400 hover:text-blue-300 font-bold"
                                            >
                                                恢复默认
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs text-slate-400 font-bold">课件内容缩放</span>
                                        <span className="text-sm font-mono text-slate-200">{Math.round(clampedRenderScale * 100)}%</span>
                                    </div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs text-slate-400">60%</span>
                                        <span className="text-xs text-slate-400">120%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0.6"
                                        max="1.2"
                                        step="0.01"
                                        value={clampedRenderScale}
                                        onChange={e => setRenderScale(Number(e.target.value))}
                                        className="w-full"
                                    />
                                    <div className="flex justify-end mt-3">
                                        <button
                                            onClick={() => setRenderScale(0.96)}
                                            className="text-xs text-blue-400 hover:text-blue-300 font-bold"
                                        >
                                            恢复默认
                                        </button>
                                    </div>
                                    <div className="border-t border-slate-700 mt-4 pt-3">
                                        <button
                                            onClick={() => {
                                                try {
                                                    if (window.electronAPI && typeof window.electronAPI.toggleDevTools === 'function') {
                                                        window.electronAPI.toggleDevTools();
                                                    }
                                                } catch (_) {}
                                            }}
                                            className="w-full py-2 px-3 text-sm font-bold text-slate-100 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors flex items-center justify-center gap-2"
                                        >
                                            <i className="fas fa-bug"></i>
                                            打开调试面板
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 导出按钮 */}
                        <div className="flex items-center">
                            <button onClick={handleOpenCourse} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors text-sm font-bold flex items-center shadow-md mr-2">
                                <i className="fas fa-folder-open mr-2"></i>打开课件
                            </button>
                            <button
                                onClick={handleSaveCourse}
                                disabled={isSaving}
                                className={`px-4 py-2 rounded-lg transition-colors text-sm font-bold flex items-center shadow-md ${
                                    isSaving ? 'bg-slate-600 text-slate-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-500 text-white'
                                }`}
                            >
                                <i className={`fas ${isSaving ? 'fa-spinner fa-spin' : 'fa-floppy-disk'} mr-2`}></i>
                                {isSaving ? '保存中...' : '保存课件'}
                            </button>
                        </div>

                        {/* 窗口控制 */}
                        <WindowControls />
                    </div>
                </div>

                {/* 内容区域 */}
                <div className="flex-1 relative overflow-hidden bg-slate-950">
                    <div className="absolute top-4 left-4 z-50 flex flex-col gap-2 pointer-events-none">
                        {toasts.map(t => (
                            <div
                                key={t.id}
                                className={`px-4 py-2 rounded-xl shadow-xl border backdrop-blur-md font-bold text-sm pointer-events-none ${
                                    t.type === 'success'
                                        ? 'bg-emerald-600/90 border-emerald-400 text-white'
                                        : t.type === 'error'
                                            ? 'bg-red-600/90 border-red-400 text-white'
                                            : 'bg-slate-800/90 border-slate-600 text-slate-100'
                                }`}
                            >
                                {t.message}
                            </div>
                        ))}
                    </div>
                    {/* 代码编辑器模式 */}
                    <div className={`absolute inset-0 transition-opacity duration-300 ${viewMode === 'code' ? 'opacity-100 z-10 flex' : 'opacity-0 z-0 pointer-events-none flex'}`}>
                        {/* 行号列 */}
                        <div 
                            ref={lineNumbersRef}
                            className="bg-slate-900 text-slate-600 py-6 pr-3 font-mono text-sm text-right select-none overflow-hidden shrink-0 border-r border-slate-800"
                            style={{ minWidth: '3.5rem', lineHeight: '1.625' }}
                        >
                            {lineNumbers.map(n => (
                                <div key={n}>{n}</div>
                            ))}
                        </div>
                        {/* 编辑器主体 */}
                        <textarea
                            ref={textareaRef}
                            value={code}
                            onScroll={handleScroll}
                            onChange={(e) => setCode(e.target.value)}
                            className="flex-1 bg-slate-900 text-slate-300 py-6 px-4 font-mono text-sm resize-none focus:outline-none show-scrollbar code-editor border-none outline-none"
                            spellCheck="false"
                            style={{ whiteSpace: 'pre', overflowX: 'auto', lineHeight: '1.625' }}
                        />
                    </div>

                    {/* 实时预览模式 */}
                    <div className={`absolute inset-0 transition-opacity duration-300 ${viewMode === 'preview' ? 'opacity-100 z-10 bg-slate-900' : 'opacity-0 z-0 pointer-events-none'}`}>
                        {isAIGenerating ? (
                            <GeneratingStatus />
                        ) : isCompiling ? (
                            <SimpleLoading />
                        ) : compileError ? (
                            <ErrorBoundary error={compileError} onAutoFix={handleAutoFix} />
                        ) : compiledCourseData ? (
                            // 使用简化的预览组件，避免 SyncClassroom 的复杂依赖
                            <SimplePreview 
                                title={compiledCourseData.title}
                                slides={compiledCourseData.slides}
                                uiScale={clampedUiScale}
                                contentScale={clampedRenderScale}
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full text-slate-500">无课件数据</div>
                        )}
                    </div>
                </div>
            </div>

            {/* 右侧 AI 聊天面板 */}
            <div className="w-96 shrink-0 h-full flex flex-col border-l border-slate-700 bg-slate-800 shadow-xl relative z-20">
                <AIChat 
                    ref={aiChatRef}
                    onCodeGenerated={handleAIGeneratedCode} 
                    onGeneratingStatusChange={setIsAIGenerating}
                    currentCode={code}
                    compileError={compileError}
                />
            </div>

            <input
                ref={fileInputRef}
                type="file"
                accept=".lume,.tsx,.ts,.jsx,.js"
                className="hidden"
                onChange={handleImport}
            />
            
        </div>
    );
}

// 启动渲染
const bootEditor = async () => {
    let rootElement = document.getElementById('root');
    let retries = 50;
    while (!rootElement && retries > 0) {
        await new Promise(r => setTimeout(r, 50));
        rootElement = document.getElementById('root');
        retries--;
    }
    if (rootElement) {
        const root = ReactDOM.createRoot(rootElement);
        root.render(<EditorApp />);
    }
};

bootEditor();
