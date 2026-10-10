// ========================================================
// 共享设置面板组件（教师端两处复用）
// ========================================================
const { useEffect } = React;

function SettingsPanel({ settings, onSettingsChange, socket, onClose, zIndex = (window.__getTeacherLayerClass?.('drawer') || 'z-[10030]') }) {
    const [newPwd, setNewPwd] = useState('');
    const [pwdStatus, setPwdStatus] = useState(null); // 'ok' | 'err' | null
    const [submissionDir, setSubmissionDir] = useState('');
    const [submissionDirStatus, setSubmissionDirStatus] = useState(null); // 'ok' | 'err' | null
    const clampMonitorInterval = (value) => {
        const n = Number(value);
        if (!Number.isFinite(n)) return 1;
        const clamped = Math.min(5, Math.max(0.5, n));
        return Math.round(clamped * 2) / 2;
    };
    const monitorIntervalValue = clampMonitorInterval(settings?.monitorIntervalSec);
    const renderScaleValue = (typeof settings?.renderScale === 'number' && Number.isFinite(settings.renderScale)) ? settings.renderScale : 0.96;
    // 上限 1：100% 已经是"课件等比铺满可视区"，再往上会被 overflow-hidden 裁掉课件边缘。
    // 这里把历史存档里 >1 的值一并夹回区间，避免滑块停在最大值之外而不动。
    const uiScaleValue = (typeof settings?.uiScale === 'number' && Number.isFinite(settings.uiScale))
        ? Math.min(1, Math.max(0.8, settings.uiScale))
        : 1.0;

    // 加载当前配置的提交目录
    useEffect(() => {
        fetch('/api/submission-config')
            .then(res => res.json())
            .then(data => {
                if (data.submissionsDir) {
                    setSubmissionDir(data.submissionsDir);
                }
            })
            .catch(err => {
                console.error('[SettingsPanel] Failed to load submission config:', err);
            });
    }, []);

    const handleSetPassword = () => {
        if (!newPwd.trim()) return;
        const encoder = new TextEncoder();
        const data = encoder.encode(newPwd.trim());
        crypto.subtle.digest('SHA-256', data).then(buf => {
            const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
            socket && socket.emit('set-admin-password', { hash });
            setNewPwd('');
            setPwdStatus('ok');
            setTimeout(() => setPwdStatus(null), 3000);
        }).catch(() => {
            setPwdStatus('err');
            setTimeout(() => setPwdStatus(null), 3000);
        });
    };

    const handleOpenLogDir = async () => {
        try {
            await window.electronAPI.openLogDir();
        } catch (err) {
            console.error('Failed to open log directory:', err);
            alert('无法打开日志目录');
        }
    };

    const handleSelectSubmissionDir = async () => {
        try {
            const selectedDir = await window.electronAPI.selectSubmissionDir();
            if (selectedDir) {
                setSubmissionDir(selectedDir);
                await handleChangeSubmissionDir(selectedDir);
            }
        } catch (err) {
            console.error('[handleSelectSubmissionDir] error:', err);
            alert('无法选择目录');
        }
    };

    const handleToggleDevTools = () => {
        try {
            if (window.electronAPI && typeof window.electronAPI.toggleDevTools === 'function') {
                window.electronAPI.toggleDevTools();
            } else {
                alert('当前环境不支持打开调试面板');
            }
        } catch (_) {
            alert('无法打开调试面板');
        }
    };

    const handleChangeSubmissionDir = async (dir = submissionDir) => {
        if (!dir.trim()) return;

        try {
            const response = await fetch('/api/submission-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ submissionsDir: dir.trim() })
            });

            const result = await response.json();

            if (result.success) {
                setSubmissionDirStatus('ok');
                setTimeout(() => setSubmissionDirStatus(null), 3000);
            } else {
                setSubmissionDirStatus('err');
                setTimeout(() => setSubmissionDirStatus(null), 3000);
            }
        } catch (err) {
            console.error('[handleChangeSubmissionDir] error:', err);
            setSubmissionDirStatus('err');
            setTimeout(() => setSubmissionDirStatus(null), 3000);
        }
    };

    const panelContent = (
        <>
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
                <h3 className="font-bold text-lg flex items-center text-white">
                    <i className="fas fa-gear mr-2 text-blue-500"></i> 设置
                </h3>
                <button onClick={onClose} className="text-slate-300 hover:text-white">
                    <i className="fas fa-xmark text-xl"></i>
                </button>
            </div>
            <div className="flex-1 px-5 py-4 space-y-4">
                    {[
                        { key: 'forceFullscreen',     label: '强制学生全屏',  icon: 'fa-expand' },
                        { key: 'syncFollow',          label: '学生跟随翻页',  icon: 'fa-rotate' },
                        { key: 'alertJoin',           label: '学生上线提醒',  icon: 'fa-user-plus' },
                        { key: 'alertLeave',          label: '学生离线提醒',  icon: 'fa-user-minus' },
                        { key: 'alertFullscreenExit', label: '退出全屏提醒',  icon: 'fa-compress' },
                        { key: 'alertTabHidden',      label: '切换页面提醒',  icon: 'fa-eye-slash' },
                        { key: 'monitorEnabled',      label: '学生截图监控',  icon: 'fa-camera' },
                    ].map(({ key, label, icon }) => (
                        <div key={key} className="flex items-center justify-between">
                            <span className="flex items-center text-slate-100 font-medium text-sm">
                                <i className={`fas ${icon} w-5 mr-2 text-slate-400`}></i>
                                {label}
                            </span>
                            <button
                                onClick={() => onSettingsChange(key, !settings[key])}
                                className={`relative w-12 h-6 rounded-full transition-colors ${settings[key] ? 'bg-blue-500' : 'bg-slate-300'}`}
                            >
                                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${settings[key] ? 'left-7' : 'left-1'}`}></span>
                            </button>
                        </div>
                    ))}

                    <div className="border-t border-white/10 pt-4">
                        <p className="text-xs font-bold text-sky-200/80 uppercase tracking-wider mb-3 flex items-center">
                            <i className="fas fa-camera w-4 mr-2 text-slate-400"></i>
                            学生截图监控
                        </p>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-slate-100 font-medium">截图间隔</span>
                            <span className="text-sm font-mono text-slate-300">{monitorIntervalValue}s</span>
                        </div>
                        <input
                            type="range"
                            min="0.5"
                            max="5"
                            step="0.5"
                            value={monitorIntervalValue}
                            onChange={e => onSettingsChange('monitorIntervalSec', clampMonitorInterval(e.target.value))}
                            className="w-full"
                        />
                        <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-slate-400">0.5s</span>
                            <button
                                onClick={() => onSettingsChange('monitorIntervalSec', 1)}
                                className="text-xs text-sky-300 hover:text-white font-bold"
                            >
                                恢复默认
                            </button>
                            <span className="text-xs text-slate-400">5s</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                            学生端按该间隔上传屏幕缩略图；关闭“学生截图监控”后停止上传。
                        </p>
                    </div>
                    
                    <div className="border-t border-white/10 pt-4">
                        <p className="text-xs font-bold text-sky-200/80 uppercase tracking-wider mb-3 flex items-center">
                            <i className="fas fa-up-down w-4 mr-2 text-slate-400"></i>
                            课件页面缩放
                        </p>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-slate-100 font-medium">缩放比例</span>
                            <span className="text-sm font-mono text-slate-300">{Math.round(uiScaleValue * 100)}%</span>
                        </div>
                        <input
                            type="range"
                            min="0.8"
                            max="1"
                            step="0.01"
                            value={uiScaleValue}
                            onChange={e => onSettingsChange('uiScale', Number(e.target.value))}
                            className="w-full"
                        />
                        <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-slate-400">80%</span>
                            <button
                                onClick={() => onSettingsChange('uiScale', 1.0)}
                                className="text-xs text-sky-300 hover:text-white font-bold"
                            >
                                恢复默认
                            </button>
                            <span className="text-xs text-slate-400">100%</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                            缩放 1280×720 课件画布显示大小，不影响顶栏/控件；学生端会跟随。100% 即是把课件等比铺满可视区，再往大会裁掉课件边缘，所以上限到 100% 为止。
                        </p>
                    </div>

                    <div className="border-t border-white/10 pt-4">
                        <p className="text-xs font-bold text-sky-200/80 uppercase tracking-wider mb-3 flex items-center">
                            <i className="fas fa-up-down-left-right w-4 mr-2 text-slate-400"></i>
                            课件内容缩放
                        </p>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-slate-100 font-medium">缩放比例</span>
                            <span className="text-sm font-mono text-slate-300">{Math.round(renderScaleValue * 100)}%</span>
                        </div>
                        <input
                            type="range"
                            min="0.6"
                            max="1.2"
                            step="0.01"
                            value={renderScaleValue}
                            onChange={e => onSettingsChange('renderScale', Number(e.target.value))}
                            className="w-full"
                        />
                        <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-slate-400">60%</span>
                            <button
                                onClick={() => onSettingsChange('renderScale', 0.96)}
                                className="text-xs text-sky-300 hover:text-white font-bold"
                            >
                                恢复默认
                            </button>
                            <span className="text-xs text-slate-400">120%</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                            仅缩放课件内部内容，不改变画布大小。调小可减少溢出风险。
                        </p>
                    </div>

                    <div className="border-t border-white/10 pt-4">
                        <p className="text-xs font-bold text-sky-200/80 uppercase tracking-wider mb-3 flex items-center">
                            <i className="fas fa-lock w-4 mr-2 text-slate-400"></i>
                            学生端管理员密码
                        </p>
                        <div className="space-y-2">
                            <input
                                type="password"
                                value={newPwd}
                                onChange={e => setNewPwd(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSetPassword()}
                                placeholder="输入新密码"
                                className="w-full px-3 py-2 text-sm border border-white/15 bg-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-300 text-white placeholder-slate-400"
                            />
                            <button
                                onClick={handleSetPassword}
                                disabled={!newPwd.trim()}
                                className={`w-full py-2 rounded-lg text-sm font-bold transition-colors ${newPwd.trim() ? 'teacher-liquid-primary' : 'bg-white/10 text-slate-500 cursor-not-allowed'}`}
                            >
                                <i className="fas fa-paper-plane mr-2"></i>
                                推送到所有学生端
                            </button>
                            {pwdStatus === 'ok' && (
                                <p className="text-xs text-green-600 flex items-center">
                                    <i className="fas fa-check mr-1"></i> 已推送，在线学生将立即生效
                                </p>
                            )}
                            {pwdStatus === 'err' && (
                                <p className="text-xs text-red-500 flex items-center">
                                    <i className="fas fa-xmark mr-1"></i> 推送失败，请重试
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="border-t border-white/10 pt-4">
                        <p className="text-xs font-bold text-sky-200/80 uppercase tracking-wider mb-3 flex items-center">
                            <i className="fas fa-folder-open w-4 mr-2 text-slate-400"></i>
                            学生提交内容存储位置
                        </p>
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={submissionDir}
                                    onChange={e => setSubmissionDir(e.target.value)}
                                    placeholder="输入存储目录路径"
                                    className="flex-1 px-3 py-2 text-sm border border-white/15 bg-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-300 text-white placeholder-slate-400 font-mono"
                                />
                                <button
                                    onClick={handleSelectSubmissionDir}
                                    className="px-3 py-2 teacher-liquid-button rounded-xl transition-colors flex items-center justify-center gap-2"
                                    title="选择目录"
                                >
                                    <i className="fas fa-folder-open"></i>
                                </button>
                            </div>
                            <button
                                onClick={() => handleChangeSubmissionDir()}
                                disabled={!submissionDir.trim()}
                                className={`w-full py-2 rounded-lg text-sm font-bold transition-colors ${submissionDir.trim() ? 'teacher-liquid-primary' : 'bg-white/10 text-slate-500 cursor-not-allowed'}`}
                            >
                                <i className="fas fa-save mr-2"></i>
                                更新存储位置
                            </button>
                            {submissionDirStatus === 'ok' && (
                                <p className="text-xs text-green-600 flex items-center">
                                    <i className="fas fa-check mr-1"></i> 已更新存储位置
                                </p>
                            )}
                            {submissionDirStatus === 'err' && (
                                <p className="text-xs text-red-500 flex items-center">
                                    <i className="fas fa-xmark mr-1"></i> 更新失败，请检查路径
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="border-t border-white/10 pt-4">
                        <p className="text-xs font-bold text-sky-200/80 uppercase tracking-wider mb-3 flex items-center">
                            <i className="fas fa-file-alt w-4 mr-2 text-slate-400"></i>
                            系统日志
                        </p>
                        <button
                            onClick={handleToggleDevTools}
                            className="teacher-liquid-button w-full py-2 px-3 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 mb-2"
                        >
                            <i className="fas fa-bug text-slate-300"></i>
                            打开调试面板
                        </button>
                        <button
                            onClick={handleOpenLogDir}
                            className="teacher-liquid-button w-full py-2 px-3 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                            <i className="fas fa-folder-open text-slate-300"></i>
                            打开日志目录
                        </button>
                    </div>
            </div>
        </>
    );

    return (
        <div className={`fixed inset-0 ${zIndex} flex justify-end bg-black/20 backdrop-blur-sm`} onClick={onClose}>
            <div
                className="teacher-glass-drawer w-[22rem] h-full flex flex-col overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                {panelContent}
            </div>
        </div>
    );
}

