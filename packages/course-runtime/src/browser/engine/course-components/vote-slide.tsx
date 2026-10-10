// ========================================================
// 实时投票组件 - VoteSlide
// ========================================================

const { useEffect, useMemo, useState } = React;

function VoteSlide({ config }) {
    const voteId = String(config?.id || '').trim();
    const question = String(config?.question || '').trim();
    const options = Array.isArray(config?.options) ? config.options : [];
    const anonymous = !!config?.anonymous;
    const theme = config?.theme || {};
    const primaryClass = 'bg-blue-600 hover:bg-blue-500';
    const isHost = !!window.CourseGlobalContext?.isHost;

    const [durationSec, setDurationSec] = useState(60);
    const [status, setStatus] = useState('idle'); // idle | running | ended
    const [endsAt, setEndsAt] = useState(null);
    const [remainingSec, setRemainingSec] = useState(0);
    const [selectedOptionId, setSelectedOptionId] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [result, setResult] = useState(null);
    const [notice, setNotice] = useState('');

    const canStart = voteId && question && options.length >= 2;

    const publishToolbarState = (patch = {}) => {
        if (!window.CourseGlobalContext?.setVoteToolbarState) return;
        window.CourseGlobalContext.setVoteToolbarState({
            voteId,
            question,
            anonymous,
            status,
            durationSec: Math.max(10, Math.min(300, Number(durationSec || 60))),
            remainingSec,
            result,
            canStart,
            ...patch
        });
    };

    const voteOptions = useMemo(() => {
        return options
            .filter(opt => opt && String(opt.id || '').trim() && String(opt.label || '').trim())
            .map(opt => ({ id: String(opt.id).trim(), label: String(opt.label).trim() }));
    }, [options]);

    useEffect(() => {
        const socket = window.CourseGlobalContext?.getSocket?.() || window.socketRef?.current;
        if (!socket) return;

        const onVoteStart = (payload) => {
            if (payload?.voteId !== voteId) return;
            setStatus('running');
            setEndsAt(payload.endsAt || null);
            setRemainingSec(Math.max(0, Math.ceil(((payload.endsAt || Date.now()) - Date.now()) / 1000)));
            setSelectedOptionId('');
            setSubmitted(false);
            setNotice('');
            if (!isHost) {
                setResult(null);
            }
        };

        const onVoteResult = (payload) => {
            if (payload?.voteId !== voteId) return;
            setResult(payload);
        };

        const onVoteEnd = (payload) => {
            if (payload?.voteId !== voteId) return;
            setStatus('ended');
            setEndsAt(null);
            setRemainingSec(0);
            setResult(payload || null);
            setNotice('投票已结束');
        };

        const onSubmitAck = (payload) => {
            if (payload?.voteId !== voteId) return;
            if (payload.success) {
                setSubmitted(true);
                setNotice('投票成功，等待结果...');
            } else {
                setNotice(payload?.error || '提交失败');
            }
        };

        socket.on('vote:start', onVoteStart);
        socket.on('vote:result', onVoteResult);
        socket.on('vote:end', onVoteEnd);
        socket.on('vote:submit:ack', onSubmitAck);

        return () => {
            socket.off('vote:start', onVoteStart);
            socket.off('vote:result', onVoteResult);
            socket.off('vote:end', onVoteEnd);
            socket.off('vote:submit:ack', onSubmitAck);
        };
    }, [voteId, isHost]);

    useEffect(() => {
        if (status !== 'running' || !endsAt) return;
        const timer = setInterval(() => {
            const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
            setRemainingSec(left);
            if (left <= 0) {
                clearInterval(timer);
            }
        }, 300);
        return () => clearInterval(timer);
    }, [status, endsAt]);

    const handleStart = () => {
        const socket = window.CourseGlobalContext?.getSocket?.() || window.socketRef?.current;
        const meta = window.CourseGlobalContext?.getCurrentCourseMeta?.() || {};
        if (!socket || !isHost || !canStart) return;
        const duration = Math.max(10, Math.min(300, Number(durationSec || 60)));
        setDurationSec(duration);
        setNotice('');
        socket.emit('vote:start', {
            voteId,
            question,
            options: voteOptions,
            anonymous,
            durationSec: duration,
            courseId: meta.courseId,
            slideIndex: meta.slideIndex
        });
    };

    const handleEnd = () => {
        const socket = window.CourseGlobalContext?.getSocket?.() || window.socketRef?.current;
        const meta = window.CourseGlobalContext?.getCurrentCourseMeta?.() || {};
        if (!socket || !isHost) return;
        socket.emit('vote:end', {
            voteId,
            courseId: meta.courseId,
            slideIndex: meta.slideIndex
        });
    };

    const handleSubmitVote = () => {
        const socket = window.CourseGlobalContext?.getSocket?.() || window.socketRef?.current;
        const meta = window.CourseGlobalContext?.getCurrentCourseMeta?.() || {};
        if (!socket || isHost || !selectedOptionId || submitted || status !== 'running') return;
        socket.emit('vote:submit', {
            voteId,
            optionId: selectedOptionId,
            courseId: meta.courseId,
            slideIndex: meta.slideIndex
        });
    };

    useEffect(() => {
        publishToolbarState();
    }, [voteId, question, anonymous, status, durationSec, remainingSec, result, canStart]);

    useEffect(() => {
        if (!window.CourseGlobalContext?.clearVoteToolbarState) return;
        return () => {
            window.CourseGlobalContext.clearVoteToolbarState();
        };
    }, []);

    useEffect(() => {
        const onToolbarAction = (evt) => {
            const detail = evt?.detail || {};
            const targetVoteId = String(detail.voteId || '').trim();
            if (targetVoteId && targetVoteId !== voteId) return;

            if (detail.action === 'start') {
                handleStart();
                return;
            }
            if (detail.action === 'end') {
                handleEnd();
                return;
            }
            if (detail.action === 'set-duration') {
                const next = Math.max(10, Math.min(300, Number(detail.durationSec || 60)));
                setDurationSec(next);
            }
        };

        window.addEventListener('vote-toolbar-action', onToolbarAction);
        return () => window.removeEventListener('vote-toolbar-action', onToolbarAction);
    }, [voteId, isHost, canStart, durationSec, status, selectedOptionId, submitted]);


    if (!canStart) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-slate-900 text-red-300">
                VoteSlide 配置无效：请提供 `id`、`question` 和至少 2 个选项
            </div>
        );
    }

    return (

        <div className="w-full h-full overflow-auto bg-slate-900 text-white p-6">
            <div className="max-w-4xl mx-auto">
                <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 mb-5">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                            <p className="text-slate-400 text-sm mb-2">课堂投票</p>
                            <h2 className="text-2xl font-bold">{question}</h2>
                            <p className="text-xs text-slate-500 mt-2">{anonymous ? '匿名投票' : '实名投票'}</p>
                        </div>
                        <div className="text-right">
                            <div className="text-xs text-slate-400">状态</div>
                            <div className={`text-sm font-bold ${status === 'running' ? 'text-green-400' : status === 'ended' ? 'text-slate-300' : 'text-amber-400'}`}>
                                {status === 'running' ? '进行中' : status === 'ended' ? '已结束' : '未开始'}
                            </div>
                            {status === 'running' && (
                                <div className="text-xl font-mono text-yellow-300 mt-1">{remainingSec}s</div>
                            )}
                        </div>
                    </div>

                    {isHost && (
                        <div className="mt-5 text-sm text-slate-400 bg-slate-700/40 border border-slate-600 rounded-lg px-3 py-2">
                            投票控制工具已移动到演示界面右侧工具栏
                        </div>
                    )}

                </div>

                <div className="space-y-3">
                    {voteOptions.map((opt) => {
                        const selected = selectedOptionId === opt.id;
                        return (
                            <button
                                key={opt.id}
                                onClick={() => {
                                    if (!isHost && status === 'running' && !submitted) setSelectedOptionId(opt.id);
                                }}
                                disabled={isHost || status !== 'running' || submitted}
                                className={`w-full text-left border rounded-xl p-4 transition ${selected ? 'border-blue-400 bg-blue-500/10' : 'border-slate-700 bg-slate-800'} ${(isHost || status !== 'running' || submitted) ? 'cursor-default' : 'hover:border-slate-500'}`}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div className="font-medium">{opt.label}</div>
                                </div>
                            </button>
                        );
                    })}

                </div>

                {!isHost && status === 'running' && (
                    <div className="mt-5 flex items-center gap-3">
                        <button
                            onClick={handleSubmitVote}
                            disabled={!selectedOptionId || submitted}
                            className="px-6 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500"
                        >
                            {submitted ? '已提交' : '提交投票'}
                        </button>
                        {anonymous && <span className="text-sm text-slate-400">匿名投票进行中，结果将在结束后公布</span>}
                    </div>
                )}

                {notice && <div className="mt-3 text-sm text-amber-300">{notice}</div>}

            </div>
        </div>
    );
}

window.VoteSlide = VoteSlide;
