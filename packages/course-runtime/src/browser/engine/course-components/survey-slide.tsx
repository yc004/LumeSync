// ========================================================
// 问卷通用组件 - SurveySlide
// ========================================================

const { useState, useEffect, useCallback } = React;

/**
 * 问卷组件 - 简化版
 * 用户只需提供题目配置，引擎自动处理：
 * - 自动生成唯一 ID
 * - 自动格式化提交数据
 * - 自动提交到教师端
 * - 自动合并为 CSV
 * - 自动保存草稿
 * - 自动验证必填项
 */
function SurveySlide({ config }) {
    // 自动生成问卷 ID
    // 优先级：配置 ID > 课程 ID > 随机 ID
    const courseMeta = window.CourseGlobalContext?.getCurrentCourseMeta?.();
    const courseId = courseMeta?.courseId || 'unknown';
    const surveyId = config.id || courseId;

    // 自动为问题生成 ID（如果未提供）
    const questions = config.questions.map((q, index) => ({
        ...q,
        id: q.id || `q${index + 1}`
    }));

    // 构建完整的配置（自动填充默认值）
    const fullConfig = {
        id: surveyId,
        title: config.title || '问卷',
        description: config.description || '',
        required: config.required !== false, // 默认 true
        showProgress: config.showProgress !== false, // 默认 true
        theme: config.theme || { primary: 'blue', background: 'slate-50' },
        questions,
        submitButtonText: config.submitButtonText || '提交问卷',
        successMessage: config.successMessage || '提交成功！感谢您的反馈。',
        errorMessage: config.errorMessage || '提交失败，请重试'
    };
    // 答案状态
    const [answers, setAnswers] = useState({});
    const [draft, setDraft] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState(null); // 'success' | 'error' | null
    const [errors, setErrors] = useState({});

    // 自动保存草稿
    useEffect(() => {
        const loadDraft = () => {
            try {
                const draftStr = localStorage.getItem(`survey-draft-${surveyId}`);
                if (draftStr) {
                    const savedDraft = JSON.parse(draftStr);
                    setDraft(savedDraft);
                    setAnswers(savedDraft.answers || {});
                }
            } catch (e) {
                console.error('加载草稿失败:', e);
            }
        };

        loadDraft();

        // 每 30 秒自动保存一次草稿
        const autoSaveInterval = setInterval(() => {
            saveDraft();
        }, 30000);

        return () => clearInterval(autoSaveInterval);
    }, [surveyId]);

    // 保存草稿到本地存储
    const saveDraft = useCallback(() => {
        try {
            const draftData = {
                timestamp: Date.now(),
                answers
            };
            localStorage.setItem(`survey-draft-${surveyId}`, JSON.stringify(draftData));
            setDraft(draftData);
        } catch (e) {
            console.error('保存草稿失败:', e);
        }
    }, [surveyId, answers]);

    // 清除草稿
    const clearDraft = useCallback(() => {
        try {
            localStorage.removeItem(`survey-draft-${surveyId}`);
            setDraft(null);
        } catch (e) {
            console.error('清除草稿失败:', e);
        }
    }, [surveyId]);

    // 更新答案
    const handleAnswerChange = useCallback((questionId, value) => {
        setAnswers(prev => ({
            ...prev,
            [questionId]: value
        }));
        // 清除该题目的错误
        if (errors[questionId]) {
            setErrors(prev => {
                const next = { ...prev };
                delete next[questionId];
                return next;
            });
        }
    }, [errors]);

    // 验证答案
    const validateAnswers = () => {
        const newErrors = {};

        fullConfig.questions.forEach(q => {
            if (q.required && !answers[q.id]) {
                newErrors[q.id] = '此题为必填项';
            }
        });

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    // 提交问卷（引擎自动处理所有细节）
    const handleSubmit = useCallback(async () => {
        if (!validateAnswers()) {
            alert('请填写所有必填项');
            return;
        }

        setIsSubmitting(true);
        setSubmitStatus(null);

        try {
            // 引擎自动准备提交数据
            const submission = {
                timestamp: Date.now(),
                surveyId,
                answers,
                status: 'submitted'
            };

            console.log('[SurveySlide] 提交数据:', submission);

            // 引擎自动生成 CSV 格式
            const header = generateCSVHeader(fullConfig.questions);
            const csvRow = formatSubmissionAsCSV(submission, fullConfig.questions);

            // 引擎自动提交到教师端
            await window.CourseGlobalContext.submitContent({
                content: {
                    header,
                    row: csvRow
                },
                fileName: `${surveyId.replace(/:/g, '_')}.csv`,
                mergeFile: true
            });

            // 提交成功
            setSubmitStatus('success');
            clearDraft();
            alert(fullConfig.successMessage);

        } catch (error) {
            console.error('提交失败:', error);
            setSubmitStatus('error');
            alert(`${fullConfig.errorMessage}：${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    }, [fullConfig, surveyId, answers, clearDraft]);

    // 获取已完成的题目数量
    const completedCount = fullConfig.questions.filter(q => answers[q.id]).length;
    const progress = fullConfig.showProgress ? Math.round((completedCount / fullConfig.questions.length) * 100) : null;

    // 主题配置
    const theme = fullConfig.theme;
    const primaryColor = theme.primary || 'blue';
    const bgColor = theme.background || 'slate-50';

    return (
        <div className={`w-full h-full overflow-auto bg-${bgColor}`}>
            {/* 标题区域 */}
            <div className="bg-white border-b border-slate-200 p-6 sticky top-0 z-10 shadow-sm">
                <h1 className="text-2xl font-bold text-slate-800 mb-2">{fullConfig.title}</h1>
                {fullConfig.description && (
                    <p className="text-sm text-slate-600 mb-4">{fullConfig.description}</p>
                )}
                {fullConfig.required && (
                    <p className="text-xs text-amber-600 font-medium">
                        <i className="fas fa-exclamation-circle mr-1"></i>
                        带有 * 的为必填项
                    </p>
                )}
                {progress !== null && (
                    <div className="mt-4">
                        <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                            <span>完成进度</span>
                            <span>{completedCount} / {fullConfig.questions.length} 题 ({progress}%)</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2">
                            <div
                                className={`bg-${primaryColor}-500 h-2 rounded-full transition-all duration-300`}
                                style={{ width: `${progress}%` }}
                            ></div>
                        </div>
                    </div>
                )}
            </div>

            {/* 问卷内容 */}
            <div className="max-w-4xl mx-auto p-6">
                {fullConfig.questions.map((question, index) => (
                    <QuestionCard
                        key={question.id}
                        question={question}
                        answer={answers[question.id]}
                        error={errors[question.id]}
                        onChange={handleAnswerChange}
                        theme={theme}
                        questionNumber={index + 1}
                    />
                ))}
            </div>

            {/* 底部操作栏 */}
            <div className="sticky bottom-0 bg-white border-t border-slate-200 p-4 shadow-sm">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <div className="text-sm text-slate-500">
                        {draft && `已保存草稿：${new Date(draft.timestamp).toLocaleTimeString()}`}
                    </div>
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className={`
                            px-8 py-3 rounded-lg font-bold text-white
                            bg-${primaryColor}-500 hover:bg-${primaryColor}-600
                            disabled:bg-slate-300 disabled:cursor-not-allowed
                            transition-all shadow-lg active:scale-95
                        `}
                    >
                        {isSubmitting ? (
                            <><i className="fas fa-spinner fa-spin mr-2"></i>提交中...</>
                        ) : (
                            <><i className="fas fa-paper-plane mr-2"></i>{fullConfig.submitButtonText}</>
                        )}
                    </button>
                </div>
            </div>

            {/* 提交状态提示 */}
            {submitStatus === 'success' && (
                <div className="fixed top-4 right-4 bg-emerald-500 text-white px-6 py-3 rounded-lg shadow-lg">
                    <i className="fas fa-check-circle mr-2"></i>提交成功！
                </div>
            )}
            {submitStatus === 'error' && (
                <div className="fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg">
                    <i className="fas fa-exclamation-circle mr-2"></i>提交失败
                </div>
            )}
        </div>
    );
}

/**
 * 问题卡片组件
 */
function QuestionCard({ question, answer, error, onChange, theme, questionNumber }) {
    switch (question.type) {
        case 'single':
            return <SingleChoiceQuestion question={question} answer={answer} error={error} onChange={onChange} theme={theme} questionNumber={questionNumber} />;
        case 'multiple':
            return <MultipleChoiceQuestion question={question} answer={answer} error={error} onChange={onChange} theme={theme} questionNumber={questionNumber} />;
        case 'text':
            return <TextQuestion question={question} answer={answer} error={error} onChange={onChange} theme={theme} questionNumber={questionNumber} />;
        case 'rating':
            return <RatingQuestion question={question} answer={answer} error={error} onChange={onChange} theme={theme} questionNumber={questionNumber} />;
        case 'ranking':
            return <RankingQuestion question={question} answer={answer} error={error} onChange={onChange} theme={theme} questionNumber={questionNumber} />;
        default:
            return <div className="text-red-500">不支持的题型: {question.type}</div>;
    }
}

/**
 * 单选题组件
 */
function SingleChoiceQuestion({ question, answer, error, onChange, theme, questionNumber }) {
    const primaryColor = theme.primary || 'blue';

    return (
        <div className="bg-white rounded-lg p-6 mb-4 shadow-sm border border-slate-200">
            <div className="flex items-start mb-4">
                <span className="text-lg font-bold text-slate-800 mr-2">{questionNumber}.</span>
                <div className="flex-1">
                    <h3 className="text-base font-semibold text-slate-800">
                        {question.title}
                        {question.required && <span className="text-amber-500 ml-1">*</span>}
                    </h3>
                    {question.description && (
                        <p className="text-sm text-slate-500 mt-1">{question.description}</p>
                    )}
                </div>
            </div>
            {error && <p className="text-xs text-red-500 mb-3 ml-7"><i className="fas fa-exclamation-circle mr-1"></i>{error}</p>}
            <div className="space-y-3 ml-7">
                {question.options.map((option) => (
                    <label
                        key={option.value}
                        className={`
                            flex items-center p-4 rounded-lg border-2 cursor-pointer transition-all
                            ${answer === option.value 
                                ? `border-${primaryColor}-500 bg-${primaryColor}-50` 
                                : 'border-slate-200 hover:border-slate-300'
                            }
                        `}
                    >
                        <input
                            type="radio"
                            name={`question-${question.id}`}
                            value={option.value}
                            checked={answer === option.value}
                            onChange={() => onChange(question.id, option.value)}
                            className="mr-3 w-5 h-5 accent-current"
                        />
                        <div className="flex-1">
                            <span className="text-base text-slate-700">{option.label}</span>
                            {option.description && (
                                <p className="text-sm text-slate-500 mt-1">{option.description}</p>
                            )}
                        </div>
                        {option.icon && <span className="text-2xl ml-2">{option.icon}</span>}
                    </label>
                ))}
            </div>
        </div>
    );
}

/**
 * 多选题组件
 */
function MultipleChoiceQuestion({ question, answer, error, onChange, theme, questionNumber }) {
    const primaryColor = theme.primary || 'blue';
    const selectedValues = Array.isArray(answer) ? answer : [];

    const handleToggle = (value) => {
        const newValues = selectedValues.includes(value)
            ? selectedValues.filter(v => v !== value)
            : [...selectedValues, value];
        onChange(question.id, newValues);
    };

    return (
        <div className="bg-white rounded-lg p-6 mb-4 shadow-sm border border-slate-200">
            <div className="flex items-start mb-4">
                <span className="text-lg font-bold text-slate-800 mr-2">{questionNumber}.</span>
                <div className="flex-1">
                    <h3 className="text-base font-semibold text-slate-800">
                        {question.title}
                        {question.required && <span className="text-amber-500 ml-1">*</span>}
                    </h3>
                    {question.description && (
                        <p className="text-sm text-slate-500 mt-1">{question.description}</p>
                    )}
                </div>
            </div>
            {error && <p className="text-xs text-red-500 mb-3 ml-7"><i className="fas fa-exclamation-circle mr-1"></i>{error}</p>}
            <div className="space-y-3 ml-7">
                {question.options.map((option) => (
                    <label
                        key={option.value}
                        className={`
                            flex items-center p-4 rounded-lg border-2 cursor-pointer transition-all
                            ${selectedValues.includes(option.value) 
                                ? `border-${primaryColor}-500 bg-${primaryColor}-50` 
                                : 'border-slate-200 hover:border-slate-300'
                            }
                        `}
                    >
                        <input
                            type="checkbox"
                            checked={selectedValues.includes(option.value)}
                            onChange={() => handleToggle(option.value)}
                            className="mr-3 w-5 h-5 accent-current"
                        />
                        <div className="flex-1">
                            <span className="text-base text-slate-700">{option.label}</span>
                            {option.description && (
                                <p className="text-sm text-slate-500 mt-1">{option.description}</p>
                            )}
                        </div>
                        {option.icon && <span className="text-2xl ml-2">{option.icon}</span>}
                    </label>
                ))}
            </div>
        </div>
    );
}

/**
 * 简答题组件
 */
function TextQuestion({ question, answer, error, onChange, theme, questionNumber }) {
    const primaryColor = theme.primary || 'blue';

    const handleChange = (e) => {
        onChange(question.id, e.target.value);
    };

    return (
        <div className="bg-white rounded-lg p-6 mb-4 shadow-sm border border-slate-200">
            <div className="flex items-start mb-4">
                <span className="text-lg font-bold text-slate-800 mr-2">{questionNumber}.</span>
                <div className="flex-1">
                    <h3 className="text-base font-semibold text-slate-800">
                        {question.title}
                        {question.required && <span className="text-amber-500 ml-1">*</span>}
                    </h3>
                    {question.description && (
                        <p className="text-sm text-slate-500 mt-1">{question.description}</p>
                    )}
                </div>
            </div>
            {error && <p className="text-xs text-red-500 mb-3 ml-7"><i className="fas fa-exclamation-circle mr-1"></i>{error}</p>}
            <div className="ml-7">
                <textarea
                    value={answer || ''}
                    onChange={handleChange}
                    className={`w-full p-4 border-2 border-slate-200 rounded-lg focus:border-${primaryColor}-500 focus:outline-none resize-none`}
                    rows={6}
                    placeholder="请输入您的回答..."
                />
                {answer && (
                    <div className="text-xs text-slate-500 mt-2 text-right">
                        {answer.length} 字
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * 评分题组件
 */
function RatingQuestion({ question, answer, error, onChange, theme, questionNumber }) {
    const primaryColor = theme.primary || 'blue';

    return (
        <div className="bg-white rounded-lg p-6 mb-4 shadow-sm border border-slate-200">
            <div className="flex items-start mb-4">
                <span className="text-lg font-bold text-slate-800 mr-2">{questionNumber}.</span>
                <div className="flex-1">
                    <h3 className="text-base font-semibold text-slate-800">
                        {question.title}
                        {question.required && <span className="text-amber-500 ml-1">*</span>}
                    </h3>
                    {question.description && (
                        <p className="text-sm text-slate-500 mt-1">{question.description}</p>
                    )}
                </div>
            </div>
            {error && <p className="text-xs text-red-500 mb-3 ml-7"><i className="fas fa-exclamation-circle mr-1"></i>{error}</p>}
            <div className="space-y-3 ml-7">
                {question.options.map((option) => {
                    const isSelected = answer === option.value;
                    return (
                        <label
                            key={option.value}
                            className={`
                                flex items-center p-4 rounded-lg border-2 cursor-pointer transition-all
                                ${isSelected 
                                    ? `border-${primaryColor}-500 bg-${primaryColor}-50` 
                                    : 'border-slate-200 hover:border-slate-300'
                                }
                            `}
                        >
                            <input
                                type="radio"
                                name={`question-${question.id}`}
                                value={option.value}
                                checked={isSelected}
                                onChange={() => onChange(question.id, option.value)}
                                className="mr-3 w-5 h-5 accent-current"
                            />
                            {option.icon && <span className="text-3xl mr-3">{option.icon}</span>}
                            <div className="flex-1">
                                <span className="text-base text-slate-700">{option.label}</span>
                            </div>
                        </label>
                    );
                })}
            </div>
        </div>
    );
}

/**
 * 排序题组件
 */
function RankingQuestion({ question, answer, error, onChange, theme, questionNumber }) {
    const primaryColor = theme.primary || 'blue';
    const [draggedItem, setDraggedItem] = useState(null);
    const ranking = Array.isArray(answer) ? answer : [];

    // 初始化排序（如果未设置）
    useEffect(() => {
        if (!ranking.length && question.options) {
            onChange(question.id, question.options.map(o => o.value));
        }
    }, [question.options, ranking.length, question.id, onChange]);

    const handleDragStart = (e, index) => {
        setDraggedItem(index);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e, index) => {
        e.preventDefault();
        if (draggedItem === null || draggedItem === index) return;

        const newRanking = [...ranking];
        const [removed] = newRanking.splice(draggedItem, 1);
        newRanking.splice(index, 0, removed);
        
        onChange(question.id, newRanking);
        setDraggedItem(index);
    };

    const handleDragEnd = () => {
        setDraggedItem(null);
    };

    const getOption = (value) => {
        return question.options?.find(o => o.value === value);
    };

    return (
        <div className="bg-white rounded-lg p-6 mb-4 shadow-sm border border-slate-200">
            <div className="flex items-start mb-4">
                <span className="text-lg font-bold text-slate-800 mr-2">{questionNumber}.</span>
                <div className="flex-1">
                    <h3 className="text-base font-semibold text-slate-800">
                        {question.title}
                        {question.required && <span className="text-amber-500 ml-1">*</span>}
                    </h3>
                    {question.description && (
                        <p className="text-sm text-slate-500 mt-1">{question.description}</p>
                    )}
                </div>
            </div>
            {error && <p className="text-xs text-red-500 mb-3 ml-7"><i className="fas fa-exclamation-circle mr-1"></i>{error}</p>}
            <div className="ml-7">
                <p className="text-xs text-slate-500 mb-3">
                    <i className="fas fa-info-circle mr-1"></i>拖拽选项调整顺序
                </p>
                <div className="space-y-2">
                    {ranking
                        .map((value, index) => {
                            const option = getOption(value);
                            if (!option) return null;

                            return (
                                <div
                                    key={value}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, index)}
                                    onDragOver={(e) => handleDragOver(e, index)}
                                    onDragEnd={handleDragEnd}
                                    className={`
                                        flex items-center p-4 rounded-lg border-2 cursor-move transition-all
                                        border-slate-200 bg-white hover:border-${primaryColor}-300
                                    `}
                                >
                                <span className={`w-8 h-8 rounded-full bg-${primaryColor}-500 text-white flex items-center justify-center font-bold mr-3`}>
                                    {index + 1}
                                </span>
                                <div className="flex-1">
                                    <span className="text-base text-slate-700">{option.label}</span>
                                </div>
                                <i className="fas fa-grip-vertical text-slate-400 text-xl"></i>
                            </div>
                            );
                        })
                        .filter(Boolean)
                    }
                </div>
            </div>
        </div>
    );
}

/**
 * 生成 CSV 表头
 */
function generateCSVHeader(questions) {
    const header = [
        '提交时间',
        '学生IP',
        '学生姓名',
        '学号',
        ...questions.map(q => q.title),
        '状态'
    ];
    return header.map(escapeCSVField).join(',');
}

/**
 * 将提交数据格式化为 CSV 行
 * 注意：学生姓名和学号由服务器自动添加，客户端只提交答案数据
 */
function formatSubmissionAsCSV(submission, questions) {
    // 准备时间戳（使用 ISO 格式避免逗号）
    const timestamp = new Date(submission.timestamp).toISOString();

    // 准备答案数据
    const answers = questions.map(q => {
        const answer = submission.answers[q.id];
        return formatAnswerValue(answer, q.type);
    });

    // 组合数据行（学生姓名和学号留空，由服务器填充）
    const row = [
        timestamp,
        '', // 学生IP - 由服务器根据连接IP填充
        '', // 学生姓名 - 由服务器根据座位表填充
        '', // 学号 - 由服务器根据座位表填充
        ...answers,
        submission.status
    ];

    // 转义并返回
    return row.map(escapeCSVField).join(',');
}

/**
 * 格式化答案值为字符串
 */
function formatAnswerValue(value, type) {
    if (value === null || value === undefined || value === '') {
        return '';
    }

    switch (type) {
        case 'multiple':
        case 'ranking':
            return Array.isArray(value) ? value.join(';') : String(value);
        case 'text':
            return String(value).replace(/[\r\n]+/g, ' ').trim();
        default:
            return String(value);
    }
}

/**
 * 转义 CSV 字段
 */
function escapeCSVField(field) {
    const str = String(field || '');
    if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

// 导出组件供课件使用
window.SurveySlide = SurveySlide;
