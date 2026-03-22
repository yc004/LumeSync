// ========================================================
// 萤火课件编辑器 - AI 聊天与生成核心
// ========================================================

const AI_PROMPT = `
你是一个专业的互动课件开发专家，负责为"萤火课堂"平台编写互动课件。该平台使用基于 React 18、TypeScript 和 TailwindCSS 的自定义引擎。

**你的工作流程：**
1. **需求确认**：在开始编写代码前，你必须确保已知晓课件的**主题**、**授课年级**、**课程时长**。如果用户信息不全，请以专业的语气询问用户。
2. **制定策略**：根据年级调整课件制作策略：
   - **低年级（1-3年级）**：重点在于吸引注意力。增加大量有趣的动画、大尺寸按钮、丰富的色彩，以及多个可以由学生自主操作的互动页面（如拖拽、点击反馈、简单的游戏化练习）。避免长篇大论的文字。
   - **中年级（4-6年级）**：增加探索性。提供实验模拟、逻辑连线等中等难度的互动，文字与互动并重。
   - **高年级（7年级及以上）**：侧重于知识深度和逻辑。提供动态图表、公式推导演示、复杂的模拟系统，交互应服务于对抽象概念的理解。
3. **代码实现**：编写完整、可运行、无错误的 TypeScript (TSX) 代码。

**引擎核心架构和规则：**
- \`window.CourseData\` : 用于注册课程的全局变量，必须暴露此对象。
- **布局优化**：所有内容必须针对 **16:9** 比例进行优化（标准分辨率为 1280x720）。
- **防止溢出**：确保组件内容在 16:9 容器内自适应，禁止出现内容被裁切或超出容器的情况。
- 使用 Tailwind CSS 控制样式，严禁内联样式。
- 所有 React Hook 均需通过 \`React.useState\`、\`React.useEffect\` 获取。
- 组件不要做 \`export\` 或 \`import\`，这些是纯客户端运行脚本。
- 使用 TypeScript 类型注解。

**标准模板参考：**
\`\`\`typescript
// 课程 definition 必须赋值给 window.CourseData
window.CourseData = {
    id: 'ai-generated-course',
    title: '主题名称',
    icon: '📝',
    desc: '课程简介',
    color: 'from-blue-500 to-indigo-600',
    slides: [
        {
            title: '页面标题',
            component: <MyComponent />
        }
    ]
};

function MyComponent(): JSX.Element {
    return (
        <div className="flex flex-col items-center justify-center h-full w-full bg-slate-50">
            <h1 className="text-4xl font-bold text-blue-600">内容</h1>
        </div>
    );
}
\`\`\`

请确保你的回答既有专业的解释，也有符合要求的代码块。在信息不足时，优先引导用户提供背景信息。
`;

function AIChat({ onCodeGenerated, onGeneratingStatusChange, currentCode }) {
    const [messages, setMessages] = useState([{ 
        role: 'assistant', 
        content: '你好！我是萤火课件 AI 助手。为了帮你生成最合适的互动课件，请告诉我课件的**主题**、**授课年级**（如低年级、高年级）以及**课程时长**。' 
    }]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [config, setConfig] = useState({ apiKey: '', baseURL: 'https://api.openai.com/v1', model: 'gpt-4o' });
    const [showConfig, setShowConfig] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState({ type: '', message: '' });
    const chatEndRef = useRef(null);
    const REQUEST_TIMEOUT_MS = 30000;

    const safeEditorLog = async (level, category, message, data = null) => {
        try {
            if (window.electronAPI?.editorLog) {
                await window.electronAPI.editorLog({ level, category, message, data });
            }
        } catch (_) {}
    };

    useEffect(() => {
        if (window.electronAPI?.getAIConfig) {
            window.electronAPI.getAIConfig().then(c => {
                if (c && c.apiKey) setConfig(c);
                else setShowConfig(true);
            });
        }
    }, []);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSaveConfig = () => {
        if (window.electronAPI?.saveAIConfig) {
            window.electronAPI.saveAIConfig(config);
        }
        setTestResult({ type: '', message: '' });
        setShowConfig(false);
    };

    const handleOpenLogDir = async () => {
        try {
            const logDir = await window.electronAPI?.openLogDir?.();
            if (logDir) {
                setTestResult({ type: 'success', message: `日志目录：${logDir}` });
            }
        } catch (error) {
            setTestResult({ type: 'error', message: `打开日志目录失败：${error.message}` });
        }
    };

    const handleTestConfig = async () => {
        const baseURL = (config.baseURL || '').trim().replace(/\/+$/, '');
        const apiKey = (config.apiKey || '').trim();
        const model = (config.model || '').trim();

        if (!baseURL || !apiKey || !model) {
            setTestResult({ type: 'error', message: '请先完整填写 Base URL、API Key 和 Model' });
            return;
        }

        setTesting(true);
        setTestResult({ type: '', message: '' });

        try {
            const testResp = await window.electronAPI.testAIConnection({
                baseURL,
                apiKey,
                model,
                timeoutMs: REQUEST_TIMEOUT_MS
            });

            if (!testResp?.success) {
                throw new Error(testResp?.error || 'API request failed');
            }

            const elapsedText = testResp?.elapsedMs ? ` (${testResp.elapsedMs}ms)` : '';
            setTestResult({ type: 'success', message: `连接成功${elapsedText}` });
        } catch (error) {
            setTestResult({ type: 'error', message: `连接失败: ${error.message}` });
        } finally {
            setTesting(false);
        }
    };

    const applyGeneratedCode = (text) => {
        if (!text) return;
        
        // 1. 尝试从 markdown 格式中提取代码块
        let extractedCode = '';
        const codeMatch = text.match(/```(?:typescript|ts|tsx|javascript|js|jsx)?\n([\s\S]*?)(?:\n```|$)/);
        
        if (codeMatch) {
            extractedCode = codeMatch[1].trim();
        } else if (text.includes('window.CourseData')) {
            extractedCode = text.trim();
        }

        // 2. 检查并同步代码
        if (extractedCode.includes('window.CourseData')) {
            onCodeGenerated(extractedCode);
        }
    };

    const handleSend = async () => {
        if (!input.trim() || loading || !config.apiKey) {
            if (!config.apiKey) setShowConfig(true);
            return;
        }

        const userMsg = { role: 'user', content: input };
        const newMessages = [...messages, userMsg];
        const assistantIndex = newMessages.length;
        
        setMessages([...newMessages, { role: 'assistant', content: '正在思考...' }]);
        setInput('');
        setLoading(true);
        if (onGeneratingStatusChange) onGeneratingStatusChange(true);

        const requestId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
        let currentFullText = '';

        const apiMessagesToSend = [
            { role: 'system', content: AI_PROMPT },
            ...newMessages.filter(m => m.role !== 'system').map(m => {
                 if (m.role === 'user' && currentCode && m === userMsg) {
                     return { 
                         role: 'user', 
                         content: `当前课件代码如下：\n\`\`\`javascript\n${currentCode}\n\`\`\`\n\n用户的新请求：${m.content}` 
                     };
                 }
                 return { role: m.role, content: m.content };
            })
        ];

        try {
            if (!window.electronAPI?.proxyAIChat) {
                throw new Error('未检测到 Electron 环境或 API 不可用');
            }

            await new Promise((resolve, reject) => {
                const cleanupData = window.electronAPI.onAIChatData(requestId, (data) => {
                    if (data.done) {
                        if (data.content && !currentFullText) currentFullText = data.content;
                        cleanup();
                        resolve();
                        return;
                    }

                    if (data.delta) {
                        currentFullText += data.delta;
                        
                        setMessages(prev => {
                            const next = [...prev];
                            if (next.length <= assistantIndex) {
                                while (next.length < assistantIndex) next.push({ role: 'user', content: '...' });
                                next[assistantIndex] = { role: 'assistant', content: currentFullText };
                            } else {
                                next[assistantIndex] = { ...next[assistantIndex], content: currentFullText };
                            }
                            return next;
                        });

                        // 流式更新代码
                        if (currentFullText.includes('window.CourseData') && currentFullText.length % 20 === 0) {
                             applyGeneratedCode(currentFullText);
                        }
                    }
                });

                const cleanupError = window.electronAPI.onAIChatError(requestId, (err) => {
                    cleanup();
                    reject(new Error(err.message || 'AI 请求失败'));
                });

                const cleanup = () => {
                    cleanupData();
                    cleanupError();
                };

                window.electronAPI.proxyAIChat({
                    requestId,
                    baseURL: config.baseURL,
                    apiKey: config.apiKey,
                    model: config.model,
                    messages: apiMessagesToSend,
                    temperature: 0.7,
                    stream: true
                });
            });

            if (currentFullText) applyGeneratedCode(currentFullText);

        } catch (error) {
            console.error('[AIChat] Error:', error.message);
            const errMsg = error.message;
            setMessages(prev => {
                const next = [...prev];
                const content = currentFullText 
                    ? `${currentFullText}\n\n[发生错误: ${errMsg}]` 
                    : `请求失败: ${errMsg}`;
                if (next[assistantIndex]) next[assistantIndex].content = content;
                else next.push({ role: 'assistant', content });
                return next;
            });
            if (currentFullText) applyGeneratedCode(currentFullText);
        } finally {
            setLoading(false);
            if (onGeneratingStatusChange) onGeneratingStatusChange(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-800 border-l border-slate-700">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-800">
                <div className="flex items-center space-x-2">
                    <i className="fas fa-robot text-blue-400"></i>
                    <h2 className="font-bold text-white">AI 课件助手</h2>
                </div>
                <button onClick={() => setShowConfig(true)} className="text-slate-400 hover:text-white transition-colors" title="AI 设置">
                    <i className="fas fa-cog"></i>
                </button>
            </div>

            {/* Config Modal */}
            {showConfig && (
                <div className="absolute inset-0 z-50 bg-slate-900/80 flex items-center justify-center p-4">
                    <div className="bg-slate-800 rounded-xl p-6 w-full max-w-sm border border-slate-600 shadow-2xl">
                        <h3 className="text-lg font-bold mb-4 text-white">AI API 设置</h3>
                        
                        <label className="block text-xs font-bold text-slate-400 mb-1">Base URL</label>
                        <input type="text" value={config.baseURL} onChange={e => setConfig({...config, baseURL: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 mb-4" />
                        
                        <label className="block text-xs font-bold text-slate-400 mb-1">API Key</label>
                        <input type="password" value={config.apiKey} onChange={e => setConfig({...config, apiKey: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 mb-4" placeholder="sk-..." />
                        
                        <label className="block text-xs font-bold text-slate-400 mb-1">Model</label>
                        <input type="text" value={config.model} onChange={e => setConfig({...config, model: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 mb-6" />
                        
                        {testResult.message && (
                            <div className={`text-xs mb-4 ${testResult.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                                {testResult.message}
                            </div>
                        )}

                        <div className="flex justify-end space-x-3">
                            <button onClick={handleOpenLogDir} className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-500 transition-colors text-sm">
                                打开日志目录
                            </button>
                            <button onClick={() => setShowConfig(false)} className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors text-sm">取消</button>
                            <button onClick={handleTestConfig} disabled={testing} className={`px-4 py-2 rounded-lg transition-colors text-sm ${testing ? 'bg-slate-600 text-slate-300 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-500'}`}>
                                {testing ? '测试中...' : '测试连接'}
                            </button>
                            <button onClick={handleSaveConfig} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors text-sm">保存</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Message List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 show-scrollbar">
                {messages.map((msg, i) => {
                    // 处理助手消息，提取文本和代码标识
                    let displayText = msg.content;
                    let hasCode = msg.role === 'assistant' && msg.content.includes('window.CourseData');
                    
                    if (hasCode) {
                        // 移除代码块部分，只显示文字说明
                        displayText = msg.content.replace(/```(?:typescript|ts|tsx|javascript|js|jsx)?\n[\s\S]*?(?:\n```|$)/g, '').trim();
                        // 如果移除代码后没文字了，给个默认提示
                        if (!displayText) displayText = '我已为您生成了代码：';
                    }

                    return (
                        <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                            <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-slate-700 text-slate-200 rounded-bl-none'} chat-selectable shadow-sm`}>
                                <div 
                                    className={`text-sm leading-relaxed ${msg.role === 'assistant' ? 'markdown-content' : 'whitespace-pre-wrap'}`}
                                    dangerouslySetInnerHTML={
                                        msg.role === 'assistant' 
                                            ? { __html: window.marked ? window.marked.parse(displayText) : displayText } 
                                            : null
                                    }
                                >
                                    {msg.role === 'user' ? displayText : null}
                                </div>
                                {hasCode && (
                                    <div className="mt-3 pt-3 border-t border-slate-600/50">
                                        <div className="text-blue-400 font-bold flex items-center text-xs">
                                            <i className="fas fa-check-circle mr-2"></i> 已生成/更新课件代码
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
                {loading && (
                    <div className="flex items-start">
                        <div className="bg-slate-700 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm">
                            <i className="fas fa-circle-notch fa-spin text-blue-400"></i>
                        </div>
                    </div>
                )}
                <div ref={chatEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-slate-800 border-t border-slate-700">
                <div className="relative">
                    <textarea 
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                        placeholder="描述你想要的课件内容或修改要求 (Shift+Enter 换行)..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-4 pr-12 py-3 text-sm text-white focus:outline-none focus:border-blue-500 resize-none h-24 show-scrollbar"
                    />
                    <button 
                        onClick={handleSend}
                        disabled={loading || !input.trim()}
                        className={`absolute bottom-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${loading || !input.trim() ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-500'}`}
                    >
                        <i className="fas fa-paper-plane text-xs"></i>
                    </button>
                </div>
            </div>
        </div>
    );
}
