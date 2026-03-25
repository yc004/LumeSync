// ========================================================
// 萤火课件编辑器 - AI 聊天与生成核心
// ========================================================

const AI_PROMPT = (typeof window.__LUMESYNC_AI_PROMPT__ === 'string' && window.__LUMESYNC_AI_PROMPT__.trim())
    ? window.__LUMESYNC_AI_PROMPT__
    : '';

const AIChat = React.forwardRef(({ onCodeGenerated, onGeneratingStatusChange, currentCode, compileError, onEditSelectedCode }, ref) => {
    const { useState, useEffect, useRef, useImperativeHandle } = React;
    const [messages, setMessages] = useState([{ 
        role: 'assistant', 
        content: '你好！我是萤火课件 AI 助手。为了帮你生成最合适的互动课件，请告诉我课件的**主题**、**授课年级**（如低年级、高年级）以及**课程时长**。\n\n**提示**：使用"修改"、"更改"、"添加"、"删除"等词汇时，我会自动识别相关代码并只输出修改指令，而不需要重新生成整个课件。' 
    }]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [config, setConfig] = useState({ apiKey: '', baseURL: 'https://api.openai.com/v1', model: 'gpt-4o' });
    const [showConfig, setShowConfig] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState({ type: '', message: '' });
    const [attachments, setAttachments] = useState([]);
    const [attachmentNotice, setAttachmentNotice] = useState(null);
    const chatEndRef = useRef(null);
    const fileInputRef = useRef(null);
    const [selectedCode, setSelectedCode] = useState(null); // 选中的代码片段
    const REQUEST_TIMEOUT_MS = 30000;
    const MAX_FILES = 6;
    const MAX_TOTAL_BYTES = 6 * 1024 * 1024;
    const MAX_TEXT_BYTES = 500 * 1024;
    const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

    // 智能识别与用户请求相关的代码段
    const extractRelevantCode = (fullCode, userRequest) => {
        if (!fullCode || !userRequest) return null;

        const keywords = userRequest.toLowerCase()
            .replace(/[，。！？\s]+/g, ' ')
            .split(' ')
            .filter(w => w.length > 1);

        if (keywords.length === 0) return null;

        const lines = fullCode.split('\n');
        let relevantLines = [];
        let inRelevantBlock = false;
        let braceCount = 0;
        let blockStartIdx = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineLower = line.toLowerCase();

            // 检查是否包含关键词
            const hasKeyword = keywords.some(kw => {
                if (lineLower.includes(kw)) {
                    // 排除常见的非代码行
                    if (line.trim().startsWith('//') || line.trim().startsWith('*')) return false;
                    if (line.includes('window.CourseData')) return false;
                    return true;
                }
                return false;
            });

            if (hasKeyword) {
                inRelevantBlock = true;
                // 向上找函数或组件定义的开始
                const startIdx = Math.max(0, i - 10);
                for (let j = startIdx; j <= i; j++) {
                    if (lines[j].includes('function ') || lines[j].includes('= (') || lines[j].includes('= async (')) {
                        braceCount = (lines[j].match(/{/g) || []).length;
                        relevantLines = lines.slice(j, i + 1);
                        blockStartIdx = j;
                        break;
                    }
                }
                if (relevantLines.length === 0) {
                    braceCount = (line.match(/{/g) || []).length;
                    blockStartIdx = i;
                    relevantLines.push(line);
                }
            } else if (inRelevantBlock) {
                relevantLines.push(line);
                braceCount += (line.match(/{/g) || []).length;
                braceCount -= (line.match(/}/g) || []).length;

                if (braceCount <= 0) {
                    // 包裹一些上下文（前后各几行）
                    const extraContext = 3;
                    const contextStart = Math.max(0, blockStartIdx - extraContext);
                    const contextEnd = Math.min(lines.length, i + extraContext + 1);
                    const withContext = lines.slice(contextStart, contextEnd);
                    // 返回代码片段和起始行号
                    return {
                        code: withContext.join('\n'),
                        startLine: contextStart
                    };
                }
            }
        }

        // 如果没找到代码块，返回包含关键词的行及其上下文
        const matchingIndices = [];
        lines.forEach((line, idx) => {
            if (keywords.some(kw => line.toLowerCase().includes(kw))) {
                matchingIndices.push(idx);
            }
        });
        
        if (matchingIndices.length > 0) {
            const firstMatchIdx = matchingIndices[0];
            const lastMatchIdx = matchingIndices[matchingIndices.length - 1];
            const contextLines = 10;
            const start = Math.max(0, firstMatchIdx - contextLines);
            const end = Math.min(lines.length, lastMatchIdx + contextLines + 1);
            return {
                code: lines.slice(start, end).join('\n'),
                startLine: start
            };
        }

        return null;
    };

    // 判断是否应该使用部分修改模式
    const shouldUsePartialEdit = (userRequest, currentCode) => {
        if (!currentCode) return false;
        
        const partialEditKeywords = [
            '修改', '更改', '调整', '增加', '添加', '删除', '移除', 
            '改为', '变成', '让', '把', '让...变成', '让...改为',
            '优化', '改进', '修复', 'bug', '错误', '问题',
            '改成', '换成', '替换'
        ];

        const requestLower = userRequest.toLowerCase();
        const isPartialEdit = partialEditKeywords.some(kw => requestLower.includes(kw));
        
        // 检查是否能找到相关代码
        const relevantCodeInfo = extractRelevantCode(currentCode, userRequest);
        
        return isPartialEdit && relevantCodeInfo;
    };

    // 应用 AI 返回的修改指令
    const applyEditInstructions = (fullCode, instructions, snippetStartLine = 0) => {
        if (!instructions || !fullCode) return null;

        const lines = fullCode.split('\n');
        const instructionLines = instructions.split('\n');
        
        // 解析指令格式
        // 支持以下格式：
        // 1. 替换: 行号 -> 新代码
        // 2. 删除: 行号
        // 3. 插入: 行号 -> 新代码
        // 4. 搜索替换: 搜索文本 -> 替换文本
        // 注意：行号是相对于代码片段的，需要映射到完整代码
        
        let resultLines = [...lines];
        
        for (const instr of instructionLines) {
            const trimmed = instr.trim();
            if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) continue;

            if (trimmed.startsWith('替换:') || trimmed.startsWith('Replace:')) {
                const parts = trimmed.split(/[:：]/);
                if (parts.length >= 2) {
                    const relativeLineNum = parseInt(parts[1].trim()) - 1;
                    const newCode = parts.slice(2).join(':').trim();
                    const absoluteLineNum = snippetStartLine + relativeLineNum;
                    if (!isNaN(relativeLineNum) && absoluteLineNum >= 0 && absoluteLineNum < resultLines.length) {
                        resultLines[absoluteLineNum] = newCode;
                    }
                }
            } else if (trimmed.startsWith('删除:') || trimmed.startsWith('Delete:')) {
                const parts = trimmed.split(/[:：]/);
                if (parts.length >= 2) {
                    const relativeLineNum = parseInt(parts[1].trim()) - 1;
                    const absoluteLineNum = snippetStartLine + relativeLineNum;
                    if (!isNaN(relativeLineNum) && absoluteLineNum >= 0 && absoluteLineNum < resultLines.length) {
                        resultLines.splice(absoluteLineNum, 1);
                    }
                }
            } else if (trimmed.startsWith('插入:') || trimmed.startsWith('Insert:')) {
                const parts = trimmed.split(/[:：]/);
                if (parts.length >= 2) {
                    const relativeLineNum = parseInt(parts[1].trim()) - 1;
                    const newCode = parts.slice(2).join(':').trim();
                    const absoluteLineNum = snippetStartLine + relativeLineNum;
                    if (!isNaN(relativeLineNum) && absoluteLineNum >= 0 && absoluteLineNum <= resultLines.length) {
                        resultLines.splice(absoluteLineNum, 0, newCode);
                    }
                }
            } else if (trimmed.startsWith('搜索替换:') || trimmed.startsWith('FindAndReplace:')) {
                const parts = trimmed.split(/[:：]/);
                if (parts.length >= 3) {
                    const searchText = parts[1].trim();
                    const replaceText = parts[2].trim();
                    for (let i = 0; i < resultLines.length; i++) {
                        if (resultLines[i].includes(searchText)) {
                            resultLines[i] = resultLines[i].replace(searchText, replaceText);
                        }
                    }
                }
            }
        }
        
        return resultLines.join('\n');
    };

    const handleAutoFix = () => {
        if (!compileError) return;
        const errorMsg = compileError instanceof Error ? compileError.message : String(compileError);
        const fixPrompt = `我在运行你生成的代码时遇到了以下语法/编译错误：\n\n\`\`\`\n${errorMsg}\n\`\`\`\n\n请分析并修复这段代码。确保返回完整的、修复后的代码块。`;
        handleSend(fixPrompt);
    };

    // 暴露给父组件的方法
    useImperativeHandle(ref, () => ({
        handleAutoFix
    }));

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

        const blocks = [];
        const re = /```(?:typescript|ts|tsx|javascript|js|jsx)?\s*\n([\s\S]*?)(?:\n```|```|$)/g;
        let m;
        while ((m = re.exec(text)) !== null) {
            const code = String(m[1] || '').trim();
            if (code) blocks.push(code);
            if (blocks.length > 10) break;
        }

        const preferred = blocks
            .filter(b => b.includes('window.CourseData'))
            .sort((a, b) => b.length - a.length)[0];

        if (preferred) {
            onCodeGenerated(preferred);
            return;
        }

        const fallback = blocks.sort((a, b) => b.length - a.length)[0];
        if (fallback && fallback.length >= 80) {
            onCodeGenerated(fallback);
            return;
        }

        if (text.includes('window.CourseData')) {
            const fenceStart = text.lastIndexOf('```', text.indexOf('window.CourseData'));
            if (fenceStart >= 0) {
                const afterFence = text.slice(fenceStart + 3);
                const firstLineBreak = afterFence.indexOf('\n');
                const bodyStart = firstLineBreak >= 0 ? afterFence.slice(firstLineBreak + 1) : afterFence;
                const fenceEnd = bodyStart.indexOf('```');
                const body = (fenceEnd >= 0 ? bodyStart.slice(0, fenceEnd) : bodyStart).trim();
                if (body.includes('window.CourseData')) {
                    onCodeGenerated(body);
                    return;
                }
            }
            onCodeGenerated(text.trim());
        }
    };

    const getExt = (name) => {
        const m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
        return m ? m[1] : '';
    };

    const isTextLikeExt = (ext) => {
        return ['lume', 'js', 'jsx', 'ts', 'tsx', 'json', 'md', 'txt', 'log', 'css', 'html', 'yml', 'yaml'].includes(ext);
    };

    const readAsDataURL = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('readAsDataURL failed'));
        reader.readAsDataURL(file);
    });

    const summarizeAttachmentsForChat = (list) => {
        if (!list.length) return '';
        const lines = list.map(a => {
            const kb = Math.max(1, Math.round((a.size || 0) / 1024));
            return `- ${a.name} (${kb}KB)`;
        });
        return `\n\n[附件]\n${lines.join('\n')}`;
    };

    const buildUserContentForApi = ({ messageText, currentCodeText, files }) => {
        const textParts = [];
        if (currentCodeText) {
            textParts.push(`当前课件代码如下：\n\`\`\`javascript\n${currentCodeText}\n\`\`\``);
        }
        textParts.push(`用户的新请求：${messageText}`);

        const textFiles = files.filter(f => f.kind === 'text' && f.text);
        for (const f of textFiles) {
            const ext = getExt(f.name);
            const fence = ext && ['js', 'jsx', 'ts', 'tsx', 'json', 'css', 'html', 'md'].includes(ext) ? ext : '';
            const truncatedHint = f.truncated ? '\n\n[提示] 文件内容过大，已截断用于调试。' : '';
            textParts.push(
                `\n附件文件：${f.name}\n\`\`\`${fence}\n${f.text}\n\`\`\`${truncatedHint}`
            );
        }

        const baseText = textParts.join('\n\n');
        const images = files.filter(f => f.kind === 'image' && f.dataUrl);
        if (!images.length) return baseText;

        return [
            { type: 'text', text: baseText },
            ...images.map(img => ({ type: 'image_url', image_url: { url: img.dataUrl } }))
        ];
    };

    const ingestFiles = async (fileList) => {
        const incoming = Array.from(fileList || []);
        if (!incoming.length) return;

        const kept = [];
        const rejected = [];
        let totalBytes = 0;
        for (const a of attachments) totalBytes += a.size || 0;

        for (const file of incoming) {
            if (attachments.length + kept.length >= MAX_FILES) break;
            if (!file || !file.name) continue;

            const size = Number(file.size) || 0;
            if (totalBytes + size > MAX_TOTAL_BYTES) {
                rejected.push(`${file.name} 超出总大小限制`);
                continue;
            }

            const ext = getExt(file.name);
            const isImage = String(file.type || '').startsWith('image/');
            const isText = isTextLikeExt(ext) || String(file.type || '').startsWith('text/');

            if (isImage) {
                if (size > MAX_IMAGE_BYTES) {
                    rejected.push(`${file.name} 图片过大`);
                    continue;
                }
                const dataUrl = await readAsDataURL(file);
                kept.push({
                    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
                    name: file.name,
                    size,
                    kind: 'image',
                    dataUrl
                });
                totalBytes += size;
                continue;
            }

            if (isText) {
                const text = await file.text();
                let finalText = text;
                let truncated = false;
                if (size > MAX_TEXT_BYTES) {
                    truncated = true;
                    const head = text.slice(0, 180000);
                    const tail = text.slice(Math.max(0, text.length - 40000));
                    finalText = `${head}\n\n/* ...(truncated)... */\n\n${tail}`;
                }
                kept.push({
                    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
                    name: file.name,
                    size,
                    kind: 'text',
                    truncated,
                    text: finalText
                });
                totalBytes += size;
                continue;
            }

            rejected.push(`${file.name} 不支持的文件类型`);
        }

        if (kept.length) {
            setAttachments(prev => [...prev, ...kept]);
        }
        if (rejected.length) {
            setAttachmentNotice({ type: 'error', message: rejected.slice(0, 2).join('；') + (rejected.length > 2 ? '…' : '') });
            setTimeout(() => setAttachmentNotice(null), 2500);
        }
    };

    const handleSend = async (overrideInput = null) => {
        const messageText = overrideInput || input;
        const hasAttachmentOnly = !overrideInput && attachments.length > 0 && !String(messageText || '').trim();
        if ((!messageText.trim() && !hasAttachmentOnly) || loading || !config.apiKey) {
            if (!config.apiKey) setShowConfig(true);
            return;
        }
        if (!AI_PROMPT) {
            setAttachmentNotice({ type: 'error', message: '提示词未加载：请检查 editor/ai-prompt.js' });
            setTimeout(() => setAttachmentNotice(null), 2500);
            return;
        }

        const sendingAttachments = overrideInput ? [] : attachments;
        
        // 检测是否使用部分修改模式
        const usePartialEdit = shouldUsePartialEdit(messageText, currentCode);
        const relevantCodeInfo = usePartialEdit ? extractRelevantCode(currentCode, messageText) : null;
        const relevantCode = relevantCodeInfo?.code || null;
        
        // 检测模型是否支持多模态（图片）输入
        const visionSupportedModels = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-vision-preview', 'gpt-4-turbo', 'claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku', 'claude-3.5-sonnet', 'claude-3.5-opus'];
        const hasImageAttachment = sendingAttachments.some(a => a.kind === 'image');
        const modelName = config.model || '';
        const supportsVision = visionSupportedModels.some(m => modelName.toLowerCase().includes(m.toLowerCase()));
        
        if (hasImageAttachment && !supportsVision) {
            setAttachmentNotice({ type: 'error', message: `当前模型 "${modelName}" 不支持图片输入。请使用支持多模态的模型，如 gpt-4o、gpt-4o-mini 或 Claude 3 系列。` });
            setTimeout(() => setAttachmentNotice(null), 4000);
            return;
        }

        const userDisplayContent = messageText + summarizeAttachmentsForChat(sendingAttachments);
        const userMsg = { role: 'user', content: userDisplayContent };
        const newMessages = [...messages, userMsg];
        const assistantIndex = newMessages.length;
        
        setMessages([...newMessages, { role: 'assistant', content: usePartialEdit ? '正在分析代码并生成修改指令...' : '正在思考...' }]);
        if (!overrideInput) {
            setInput('');
            setAttachments([]);
        }
        setLoading(true);
        if (onGeneratingStatusChange) onGeneratingStatusChange(true);

        const requestId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
        let currentFullText = '';
        let lastAppliedLen = 0;

        // 如果是部分修改模式，修改提示词
        let systemPrompt = AI_PROMPT;
        if (usePartialEdit && relevantCode) {
            systemPrompt = AI_PROMPT + `

【部分修改模式（重要）】
用户要求对现有代码进行修改，而不是重新生成整个课件。
当前代码片段如下：
\`\`\`javascript
${relevantCode}
\`\`\`

**你的任务：**
1. 分析用户的修改请求
2. 只对相关代码段进行修改，不要重新生成整个课件
3. 输出修改指令，而不是完整代码

**修改指令格式：**
使用以下格式之一来描述修改：
- 替换: 行号 -> 新代码内容
- 删除: 行号
- 插入: 行号 -> 新代码内容
- 搜索替换: 搜索文本 -> 替换文本

**示例：**
\`\`\`
替换: 15 -> const [count, setCount] = window.CourseGlobalContext.useSyncVar('example:count', 0);
插入: 16 -> useEffect(() => { console.log('Count changed:', count); }, [count]);
搜索替换: setCount(count + 1) -> setCount(prev => prev + 1)
\`\`\`

**注意事项：**
- 行号是相对于当前代码片段的（从1开始）
- 如果需要多行代码，使用 "替换" 或 "插入"，代码中可以包含换行
- 只输出修改指令，不要输出其他解释
- 如果修改涉及多个地方，可以输出多个指令（每行一个）
- 代码中的换行符请在指令中用 \\n 表示
`;
        }

        const apiMessagesToSend = [
            { role: 'system', content: systemPrompt },
            ...newMessages.filter(m => m.role !== 'system').map(m => {
                if (m.role === 'user' && m === userMsg) {
                    let apiContent;
                    if (usePartialEdit && relevantCode) {
                        // 部分修改模式：只发送相关代码片段
                        apiContent = [
                            { type: 'text', text: `用户请求：${messageText}\n\n代码片段（已包含在系统提示中）` }
                        ];
                    } else {
                        // 完整生成模式：发送全部代码
                        const includeCurrentCode = !!currentCode;
                        const normalizedMessageText = String(messageText || '').trim() ? messageText : '（无文本，见附件）';
                        apiContent = buildUserContentForApi({
                            messageText: normalizedMessageText,
                            currentCodeText: includeCurrentCode ? currentCode : '',
                            files: sendingAttachments
                        });
                    }
                    return { role: 'user', content: apiContent };
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

                        // 部分修改模式：检查是否有修改指令
                        if (usePartialEdit) {
                            const hasEditInstruction = 
                                currentFullText.includes('替换:') || 
                                currentFullText.includes('删除:') || 
                                currentFullText.includes('插入:') ||
                                currentFullText.includes('搜索替换:');
                            if (hasEditInstruction && (currentFullText.length - lastAppliedLen >= 50)) {
                                lastAppliedLen = currentFullText.length;
                                const editedCode = applyEditInstructions(currentCode, currentFullText, relevantCodeInfo?.startLine);
                                if (editedCode && editedCode !== currentCode) {
                                    onCodeGenerated(editedCode);
                                }
                            }
                        } else {
                            // 完整生成模式：流式更新代码
                            const shouldTryApply =
                                (currentFullText.includes('window.CourseData') || currentFullText.includes('```')) &&
                                (currentFullText.length - lastAppliedLen >= 120);
                            if (shouldTryApply) {
                                lastAppliedLen = currentFullText.length;
                                applyGeneratedCode(currentFullText);
                            }
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

            // 最终应用代码
            if (currentFullText) {
                if (usePartialEdit && relevantCodeInfo) {
                    const editedCode = applyEditInstructions(currentCode, currentFullText, relevantCodeInfo.startLine);
                    if (editedCode && editedCode !== currentCode) {
                        onCodeGenerated(editedCode);
                    }
                } else {
                    applyGeneratedCode(currentFullText);
                }
            }

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
                    const hasCode = msg.role === 'assistant' && (msg.content.includes('```') || msg.content.includes('window.CourseData'));
                    
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
                {/* 错误修复提示 */}
                {compileError && !loading && (
                    <div className="flex flex-col items-center p-4 bg-red-900/20 rounded-xl border border-red-900/50 mx-2 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="flex items-center text-red-400 text-xs font-bold mb-3">
                            <i className="fas fa-bug mr-2"></i> 课件代码存在语法错误
                        </div>
                        <button 
                            onClick={handleAutoFix}
                            className="w-full py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-bold flex items-center justify-center transition-all shadow-lg active:scale-95"
                        >
                            <i className="fas fa-magic mr-2"></i> 一键修复
                        </button>
                    </div>
                )}
                <div ref={chatEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-slate-800 border-t border-slate-700">
                {attachmentNotice?.message && (
                    <div className={`mb-3 text-xs font-bold rounded-lg px-3 py-2 ${
                        attachmentNotice.type === 'success'
                            ? 'text-emerald-200 bg-emerald-900/30 border border-emerald-900/40'
                            : 'text-red-300 bg-red-900/30 border border-red-900/40'
                    }`}>
                        {attachmentNotice.message}
                    </div>
                )}
                {!!attachments.length && (
                    <div className="mb-3 flex flex-wrap gap-2">
                        {attachments.map(a => (
                            <div key={a.id} className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200">
                                {a.kind === 'image' ? (
                                    <img src={a.dataUrl} alt={a.name} className="w-7 h-7 rounded object-cover border border-slate-700" />
                                ) : (
                                    <i className="fas fa-file-lines text-slate-400"></i>
                                )}
                                <span className="max-w-[180px] truncate">{a.name}</span>
                                <button
                                    onClick={() => setAttachments(prev => prev.filter(x => x.id !== a.id))}
                                    className="text-slate-400 hover:text-slate-200"
                                    title="移除"
                                    type="button"
                                >
                                    <i className="fas fa-xmark"></i>
                                </button>
                            </div>
                        ))}
                        <button
                            onClick={() => setAttachments([])}
                            className="text-xs text-slate-400 hover:text-slate-200 px-2"
                            type="button"
                        >
                            清空附件
                        </button>
                    </div>
                )}

                <div
                    className="relative"
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                        e.preventDefault();
                        if (e.dataTransfer?.files?.length) ingestFiles(e.dataTransfer.files);
                    }}
                >
                    <textarea 
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                        onPaste={e => {
                            const items = e.clipboardData?.items ? Array.from(e.clipboardData.items) : [];
                            const files = items
                                .filter(it => String(it.type || '').startsWith('image/'))
                                .map(it => it.getAsFile())
                                .filter(Boolean);
                            if (files.length) {
                                ingestFiles(files);
                                setAttachmentNotice({ type: 'success', message: `已添加 ${files.length} 张图片` });
                                setTimeout(() => setAttachmentNotice(null), 2000);
                            }
                        }}
                        placeholder="描述你想要的课件内容或修改要求 (Shift+Enter 换行)..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-12 pr-12 py-3 text-sm text-white focus:outline-none focus:border-blue-500 resize-none h-24 show-scrollbar"
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={loading}
                        className={`absolute bottom-3 left-3 w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                            loading ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                        }`}
                        title="上传图片/文件"
                        type="button"
                    >
                        <i className="fas fa-paperclip text-xs"></i>
                    </button>
                    <button 
                        onClick={handleSend}
                        disabled={loading || (!input.trim() && !attachments.length)}
                        className={`absolute bottom-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                            loading || (!input.trim() && !attachments.length) ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-500'
                        }`}
                    >
                        <i className="fas fa-paper-plane text-xs"></i>
                    </button>
                </div>
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.lume,.js,.jsx,.ts,.tsx,.json,.md,.txt,.log"
                    className="hidden"
                    onChange={async (e) => {
                        const files = e.target.files;
                        if (files?.length) await ingestFiles(files);
                        e.target.value = '';
                    }}
                />
            </div>
        </div>
    );
});
