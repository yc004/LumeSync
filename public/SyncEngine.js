// ========================================================
// ⚙️ 互动课堂底层引擎 (SyncEngine)
// 负责：16:9 画布自适应、全屏、Socket.io 同步、自动角色分配、智能资源调度、课堂监控
// ========================================================

const { useState, useEffect, useRef } = React;

// ========================================================
// ⚙️ 共享设置面板组件（教师端两处复用）
// ========================================================
function SettingsPanel({ settings, onSettingsChange, socket, onClose, zIndex = 'z-50' }) {
    const [newPwd, setNewPwd] = useState('');
    const [pwdStatus, setPwdStatus] = useState(null); // 'ok' | 'err' | null

    const handleSetPassword = () => {
        if (!newPwd.trim()) return;
        // 在浏览器端计算 SHA-256
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

    return (
        <div className={`fixed inset-0 ${zIndex} flex justify-end`} onClick={onClose}>
            <div
                className="w-80 h-full bg-white shadow-2xl border-l border-slate-200 flex flex-col overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                    <h3 className="font-bold text-slate-800 text-lg flex items-center">
                        <i className="fas fa-gear mr-2 text-blue-500"></i> 课堂设置
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <i className="fas fa-xmark text-xl"></i>
                    </button>
                </div>
                <div className="flex-1 px-6 py-4 space-y-5">
                    {[
                        { key: 'forceFullscreen',     label: '强制学生全屏',  icon: 'fa-expand' },
                        { key: 'syncFollow',          label: '学生跟随翻页',  icon: 'fa-rotate' },
                        { key: 'alertJoin',           label: '学生上线提醒',  icon: 'fa-user-plus' },
                        { key: 'alertLeave',          label: '学生离线提醒',  icon: 'fa-user-minus' },
                        { key: 'alertFullscreenExit', label: '退出全屏提醒',  icon: 'fa-compress' },
                        { key: 'alertTabHidden',      label: '切换页面提醒',  icon: 'fa-eye-slash' },
                    ].map(({ key, label, icon }) => (
                        <div key={key} className="flex items-center justify-between">
                            <span className="flex items-center text-slate-700 font-medium text-sm">
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

                    {/* 分隔线 */}
                    <div className="border-t border-slate-200 pt-4">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center">
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
                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-slate-800"
                            />
                            <button
                                onClick={handleSetPassword}
                                disabled={!newPwd.trim()}
                                className={`w-full py-2 rounded-lg text-sm font-bold transition-colors ${newPwd.trim() ? 'bg-blue-500 hover:bg-blue-600 text-white' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
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
                </div>
            </div>
        </div>
    );
}

// ========================================================
// 🏫 机房视图组件（教师端）
// 功能：显示所有学生座位，支持命名、拖拽排列、在线状态
// 布局和命名持久化到 localStorage
// ========================================================
function ClassroomView({ onClose, socket, studentLog }) {
    const STORAGE_KEY = 'classroom-layout-v1';

    // seats: { id, ip, name, row, col }[]
    // onlineIPs: Set<string>
    const [seats, setSeats] = useState(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            // 规范化历史数据中可能存在的 ::ffff: 前缀
            return saved.map(s => ({ ...s, ip: s.ip && s.ip.startsWith('::ffff:') ? s.ip.slice(7) : s.ip }));
        } catch(e) { return []; }
    });
    const [onlineIPs, setOnlineIPs] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');
    const [dragId, setDragId] = useState(null);
    const [dragOver, setDragOver] = useState(null); // { row, col }
    const [addRow, setAddRow] = useState(1);
    const [addCol, setAddCol] = useState(1);
    const [addIp, setAddIp] = useState('');
    const [addName, setAddName] = useState('');
    const [showAddForm, setShowAddForm] = useState(false);
    const [autoImporting, setAutoImporting] = useState(false);
    const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
    const [importError, setImportError] = useState(null);
    const fileInputRef = useRef(null);

    // 计算网格尺寸
    const maxRow = seats.reduce((m, s) => Math.max(m, s.row), 0);
    const maxCol = seats.reduce((m, s) => Math.max(m, s.col), 0);
    const gridRows = Math.max(maxRow, 4);
    const gridCols = Math.max(maxCol, 6);

    // 持久化
    const saveSeats = (next) => {
        setSeats(next);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    };

    // 规范化 IP：去掉 IPv6 映射前缀 ::ffff:，只保留 IPv4
    const normalizeIp = ip => ip && ip.startsWith('::ffff:') ? ip.slice(7) : ip;

    // 拉取在线学生列表
    const fetchOnline = () => {
        fetch('/api/students').then(r => r.json()).then(d => {
            setOnlineIPs((d.students || []).map(normalizeIp));
        }).catch(() => {});
    };

    useEffect(() => {
        fetchOnline();
        const t = setInterval(fetchOnline, 3000);
        return () => clearInterval(t);
    }, []);

    // 自动导入：把在线但没有座位的 IP 加入未分配区
    const handleAutoImport = () => {
        setAutoImporting(true);
        fetch('/api/students').then(r => r.json()).then(d => {
            const ips = (d.students || []).map(normalizeIp);
            const existing = new Set(seats.map(s => s.ip));
            const newIps = ips.filter(ip => !existing.has(ip));
            if (newIps.length === 0) { setAutoImporting(false); return; }
            // 放到网格末尾
            let row = gridRows;
            let col = 0;
            const added = newIps.map(ip => {
                col++;
                if (col > gridCols) { col = 1; row++; }
                return { id: `seat-${Date.now()}-${ip}`, ip, name: '', row, col };
            });
            saveSeats([...seats, ...added]);
            setAutoImporting(false);
        }).catch(() => setAutoImporting(false));
    };

    // 最近告警：取最后 50 条日志，按 IP 归类
    const recentAlerts = {};
    const logSlice = (studentLog || []).slice(-50);
    logSlice.forEach(e => {
        if (!recentAlerts[e.ip]) recentAlerts[e.ip] = [];
        recentAlerts[e.ip].push(e);
    });

    // 拖拽处理
    const handleDragStart = (e, id) => {
        setDragId(id);
        e.dataTransfer.effectAllowed = 'move';
    };
    const handleDragOverCell = (e, row, col) => {
        e.preventDefault();
        setDragOver({ row, col });
    };
    const handleDropCell = (e, row, col) => {
        e.preventDefault();
        if (!dragId) return;
        // 检查目标格是否已有座位
        const target = seats.find(s => s.row === row && s.col === col);
        const dragged = seats.find(s => s.id === dragId);
        if (!dragged) return;
        if (target && target.id !== dragId) {
            // 交换位置
            saveSeats(seats.map(s => {
                if (s.id === dragId) return { ...s, row: target.row, col: target.col };
                if (s.id === target.id) return { ...s, row: dragged.row, col: dragged.col };
                return s;
            }));
        } else {
            saveSeats(seats.map(s => s.id === dragId ? { ...s, row, col } : s));
        }
        setDragId(null);
        setDragOver(null);
    };
    const handleDragEnd = () => { setDragId(null); setDragOver(null); };

    // 下载模板 CSV
    const handleDownloadTemplate = () => {
        const content = [
            '# 机房座位列表模板',
            '# 格式：ip,名称,行,列',
            '# 每行一个座位，# 开头为注释行',
            '# 行列从 1 开始，左上角为 (1,1)',
            '#',
            '# 示例：',
            '192.168.1.101,A01,1,1',
            '192.168.1.102,A02,1,2',
            '192.168.1.103,A03,1,3',
            '192.168.1.104,A04,1,4',
            '192.168.1.105,A05,1,5',
            '192.168.1.106,A06,1,6',
            '192.168.1.201,B01,2,1',
            '192.168.1.202,B02,2,2',
            '192.168.1.203,B03,2,3',
        ].join('\n');
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'classroom-seats-template.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    // 从文件导入座位列表
    const handleImportFile = (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        setImportError(null);
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target.result;
            const lines = text.split(/\r?\n/);
            const imported = [];
            const errors = [];
            lines.forEach((line, idx) => {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) return;
                const parts = trimmed.split(',');
                if (parts.length < 2) { errors.push(`第 ${idx + 1} 行格式错误`); return; }
                const ip = normalizeIp(parts[0].trim());
                const name = parts[1] ? parts[1].trim() : '';
                const row = parts[2] ? parseInt(parts[2].trim(), 10) : null;
                const col = parts[3] ? parseInt(parts[3].trim(), 10) : null;
                if (!ip) { errors.push(`第 ${idx + 1} 行 IP 为空`); return; }
                if (row !== null && (isNaN(row) || row < 1)) { errors.push(`第 ${idx + 1} 行 行号无效`); return; }
                if (col !== null && (isNaN(col) || col < 1)) { errors.push(`第 ${idx + 1} 行 列号无效`); return; }
                imported.push({ ip, name, row: row || null, col: col || null });
            });
            if (errors.length > 0) {
                setImportError(errors.slice(0, 3).join('；') + (errors.length > 3 ? `…等 ${errors.length} 处错误` : ''));
            }
            if (imported.length === 0) return;
            // 合并：已有座位保留，新 IP 追加；若 IP 已存在则更新名称/位置
            let nextSeats = [...seats];
            // 计算未指定行列时的起始位置
            let autoRow = Math.max(...nextSeats.map(s => s.row || 0), 0) + 1;
            let autoCol = 0;
            imported.forEach(item => {
                const existing = nextSeats.find(s => s.ip === item.ip);
                let r = item.row, c = item.col;
                if (!r || !c) {
                    // 自动排列
                    autoCol++;
                    if (autoCol > gridCols) { autoCol = 1; autoRow++; }
                    r = autoRow; c = autoCol;
                }
                if (existing) {
                    nextSeats = nextSeats.map(s => s.ip === item.ip ? { ...s, name: item.name || s.name, row: r, col: c } : s);
                } else {
                    nextSeats.push({ id: `seat-${Date.now()}-${item.ip}`, ip: item.ip, name: item.name, row: r, col: c });
                }
            });
            saveSeats(nextSeats);
        };
        reader.readAsText(file, 'utf-8');
        // 重置 input，允许重复导入同一文件
        e.target.value = '';
    };

    // 添加座位
    const handleAddSeat = () => {
        if (!addIp.trim()) return;
        const id = `seat-${Date.now()}`;
        saveSeats([...seats, { id, ip: normalizeIp(addIp.trim()), name: addName.trim(), row: Number(addRow), col: Number(addCol) }]);
        setAddIp(''); setAddName(''); setShowAddForm(false);
    };

    // 删除座位
    const handleDelete = (id) => saveSeats(seats.filter(s => s.id !== id));

    // 重命名
    const startEdit = (seat) => { setEditingId(seat.id); setEditName(seat.name); };
    const commitEdit = () => {
        saveSeats(seats.map(s => s.id === editingId ? { ...s, name: editName } : s));
        setEditingId(null);
    };

    const alertIcons = {
        'fullscreen-exit': { icon: 'fa-compress', color: 'text-orange-400', label: '退出全屏' },
        'tab-hidden':      { icon: 'fa-eye-slash', color: 'text-red-400',    label: '切换页面' },
        'join':            { icon: 'fa-user-plus', color: 'text-green-400',  label: '上线' },
        'leave':           { icon: 'fa-user-minus', color: 'text-slate-400', label: '离线' },
    };

    // 渲染单个座位卡片
    const renderSeat = (seat) => {
        const isOnline = onlineIPs.includes(seat.ip);
        const alerts = recentAlerts[seat.ip] || [];
        const lastAlert = alerts[alerts.length - 1];
        const isDragging = dragId === seat.id;

        return (
            <div
                key={seat.id}
                draggable
                onDragStart={e => handleDragStart(e, seat.id)}
                onDragEnd={handleDragEnd}
                className={`relative flex flex-col items-center justify-center p-2 rounded-xl border-2 cursor-grab select-none transition-all duration-200 group
                    ${isDragging ? 'opacity-40 scale-95' : ''}
                    ${isOnline
                        ? 'bg-green-900/40 border-green-500/60 shadow-green-500/20 shadow-md'
                        : 'bg-slate-800/60 border-slate-600/40'
                    }`}
                style={{ minHeight: 80 }}
            >
                {/* 删除按钮 */}
                <button
                    onClick={() => handleDelete(seat.id)}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-slate-700 hover:bg-red-500 text-slate-400 hover:text-white text-xs items-center justify-center hidden group-hover:flex transition-colors z-10"
                >
                    <i className="fas fa-xmark text-[10px]"></i>
                </button>

                {/* 在线指示灯 */}
                <div className={`w-2.5 h-2.5 rounded-full mb-1.5 ${isOnline ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.8)]' : 'bg-slate-600'}`}></div>

                {/* 名称（可编辑） */}
                {editingId === seat.id ? (
                    <input
                        autoFocus
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingId(null); }}
                        className="w-full text-center text-xs bg-slate-700 border border-blue-400 rounded px-1 py-0.5 text-white outline-none"
                        onClick={e => e.stopPropagation()}
                    />
                ) : (
                    <span
                        className="text-xs font-bold text-white truncate max-w-full px-1 cursor-text"
                        title={seat.name || seat.ip}
                        onDoubleClick={() => startEdit(seat)}
                    >
                        {seat.name || <span className="text-slate-500 italic">双击命名</span>}
                    </span>
                )}

                {/* IP */}
                <span className="text-[10px] text-slate-500 font-mono mt-0.5 truncate max-w-full px-1">{seat.ip}</span>

                {/* 最近告警 */}
                {lastAlert && alertIcons[lastAlert.type] && (
                    <div className={`mt-1 flex items-center text-[10px] ${alertIcons[lastAlert.type].color}`}>
                        <i className={`fas ${alertIcons[lastAlert.type].icon} mr-1`}></i>
                        {alertIcons[lastAlert.type].label}
                    </div>
                )}
            </div>
        );
    };

    // 列表视图
    const renderList = () => (
        <div className="overflow-auto flex-1 p-4">
            <table className="w-full text-sm text-left border-collapse">
                <thead>
                    <tr className="text-slate-500 text-xs uppercase tracking-wider border-b border-slate-700">
                        <th className="px-3 py-2 w-6 text-center">#</th>
                        <th className="px-3 py-2">状态</th>
                        <th className="px-3 py-2">IP 地址</th>
                        <th className="px-3 py-2">名称</th>
                        <th className="px-3 py-2 text-center">行</th>
                        <th className="px-3 py-2 text-center">列</th>
                        <th className="px-3 py-2">最近告警</th>
                        <th className="px-3 py-2 text-center">操作</th>
                    </tr>
                </thead>
                <tbody>
                    {seats.length === 0 && (
                        <tr><td colSpan="8" className="text-center text-slate-600 py-12">暂无座位，请导入或手动添加</td></tr>
                    )}
                    {[...seats].sort((a, b) => a.row !== b.row ? a.row - b.row : a.col - b.col).map((seat, idx) => {
                        const isOnline = onlineIPs.includes(seat.ip);
                        const alerts = recentAlerts[seat.ip] || [];
                        const lastAlert = alerts[alerts.length - 1];
                        return (
                            <tr key={seat.id} className="border-b border-slate-800 hover:bg-slate-800/40 transition-colors">
                                <td className="px-3 py-2 text-slate-600 text-center text-xs">{idx + 1}</td>
                                <td className="px-3 py-2">
                                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${isOnline ? 'text-green-400' : 'text-slate-500'}`}>
                                        <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-400' : 'bg-slate-600'}`}></span>
                                        {isOnline ? '在线' : '离线'}
                                    </span>
                                </td>
                                <td className="px-3 py-2 font-mono text-slate-300 text-xs">{seat.ip}</td>
                                <td className="px-3 py-2">
                                    {editingId === seat.id ? (
                                        <input
                                            autoFocus
                                            value={editName}
                                            onChange={e => setEditName(e.target.value)}
                                            onBlur={commitEdit}
                                            onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingId(null); }}
                                            className="bg-slate-700 border border-blue-400 rounded px-2 py-0.5 text-white text-xs outline-none w-32"
                                        />
                                    ) : (
                                        <span
                                            className="text-white text-xs cursor-text hover:text-blue-300 transition-colors"
                                            onDoubleClick={() => startEdit(seat)}
                                            title="双击编辑"
                                        >
                                            {seat.name || <span className="text-slate-600 italic">双击命名</span>}
                                        </span>
                                    )}
                                </td>
                                <td className="px-3 py-2 text-center text-slate-400 text-xs">{seat.row}</td>
                                <td className="px-3 py-2 text-center text-slate-400 text-xs">{seat.col}</td>
                                <td className="px-3 py-2 text-xs">
                                    {lastAlert && alertIcons[lastAlert.type] ? (
                                        <span className={`flex items-center gap-1 ${alertIcons[lastAlert.type].color}`}>
                                            <i className={`fas ${alertIcons[lastAlert.type].icon}`}></i>
                                            {alertIcons[lastAlert.type].label}
                                        </span>
                                    ) : <span className="text-slate-700">—</span>}
                                </td>
                                <td className="px-3 py-2 text-center">
                                    <button
                                        onClick={() => handleDelete(seat.id)}
                                        className="text-slate-600 hover:text-red-400 transition-colors text-xs"
                                        title="删除"
                                    >
                                        <i className="fas fa-trash-can"></i>
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );

    // 构建网格
    const renderGrid = () => {
        const rows = [];
        for (let r = 1; r <= gridRows + 1; r++) {
            const cols = [];
            for (let c = 1; c <= gridCols + 1; c++) {
                const seat = seats.find(s => s.row === r && s.col === c);
                const isOver = dragOver && dragOver.row === r && dragOver.col === c;
                cols.push(
                    <div
                        key={`${r}-${c}`}
                        onDragOver={e => handleDragOverCell(e, r, c)}
                        onDrop={e => handleDropCell(e, r, c)}
                        className={`min-w-[100px] min-h-[90px] rounded-xl transition-all duration-150
                            ${isOver && dragId ? 'bg-blue-500/20 border-2 border-blue-400 border-dashed' : ''}
                            ${!seat && !isOver ? 'border border-dashed border-slate-700/40 rounded-xl' : ''}
                        `}
                    >
                        {seat ? renderSeat(seat) : null}
                    </div>
                );
            }
            rows.push(
                <div key={r} className="flex gap-3">
                    <div className="w-6 flex items-center justify-center text-xs text-slate-600 font-mono shrink-0">{r}</div>
                    {cols}
                </div>
            );
        }
        return rows;
    };

    return (
        <div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center" onClick={onClose}>
            <div
                className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-700 flex flex-col overflow-hidden"
                style={{ width: '90vw', maxWidth: 1100, height: '85vh' }}
                onClick={e => e.stopPropagation()}
            >
                {/* 顶栏 */}
                <div className="flex items-center justify-between px-6 py-4 bg-slate-800 border-b border-slate-700 shrink-0">
                    <div className="flex items-center space-x-3">
                        <i className="fas fa-chalkboard text-blue-400 text-xl"></i>
                        <h2 className="text-white font-bold text-lg">机房视图</h2>
                        <span className="px-2.5 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-bold border border-green-500/30">
                            {onlineIPs.length} 在线
                        </span>
                        <span className="px-2.5 py-1 bg-slate-700 text-slate-400 rounded-full text-xs font-bold">
                            {seats.length} 座位
                        </span>
                    </div>
                    <div className="flex items-center space-x-2">
                        {/* 视图切换 */}
                        <div className="flex rounded-lg overflow-hidden border border-slate-600">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`px-3 py-1.5 text-sm transition-colors ${viewMode === 'grid' ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                                title="网格视图"
                            >
                                <i className="fas fa-table-cells"></i>
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`px-3 py-1.5 text-sm transition-colors ${viewMode === 'list' ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                                title="列表视图"
                            >
                                <i className="fas fa-list"></i>
                            </button>
                        </div>
                        <button
                            onClick={handleAutoImport}
                            disabled={autoImporting}
                            className="flex items-center px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
                            title="将当前在线学生自动添加为座位"
                        >
                            <i className={`fas ${autoImporting ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'} mr-1.5`}></i>
                            自动导入
                        </button>
                        {/* 导入文件 */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv,.txt"
                            className="hidden"
                            onChange={handleImportFile}
                        />
                        <button
                            onClick={() => fileInputRef.current && fileInputRef.current.click()}
                            className="flex items-center px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-medium transition-colors border border-slate-600"
                            title="从 CSV 文件导入座位列表"
                        >
                            <i className="fas fa-file-import mr-1.5"></i>
                            导入列表
                        </button>
                        <button
                            onClick={handleDownloadTemplate}
                            className="flex items-center px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-medium transition-colors border border-slate-600"
                            title="下载座位列表模板文件"
                        >
                            <i className="fas fa-download mr-1.5"></i>
                            模板
                        </button>
                        <button
                            onClick={() => setShowAddForm(v => !v)}
                            className="flex items-center px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-medium transition-colors border border-slate-600"
                        >
                            <i className="fas fa-plus mr-1.5"></i>
                            手动添加
                        </button>
                        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
                            <i className="fas fa-xmark text-lg"></i>
                        </button>
                    </div>
                </div>

                {/* 手动添加表单 */}
                {showAddForm && (
                    <div className="px-6 py-3 bg-slate-800/80 border-b border-slate-700 flex items-center gap-3 shrink-0">
                        <input value={addIp} onChange={e => setAddIp(e.target.value)} placeholder="IP 地址" className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 outline-none focus:border-blue-400 w-36" />
                        <input value={addName} onChange={e => setAddName(e.target.value)} placeholder="计算机名称（可选）" className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 outline-none focus:border-blue-400 w-44" />
                        <span className="text-slate-400 text-sm">行</span>
                        <input type="number" min="1" value={addRow} onChange={e => setAddRow(e.target.value)} className="px-2 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white outline-none focus:border-blue-400 w-16 text-center" />
                        <span className="text-slate-400 text-sm">列</span>
                        <input type="number" min="1" value={addCol} onChange={e => setAddCol(e.target.value)} className="px-2 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white outline-none focus:border-blue-400 w-16 text-center" />
                        <button onClick={handleAddSeat} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition-colors">添加</button>
                        <button onClick={() => setShowAddForm(false)} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors">取消</button>
                    </div>
                )}

                {/* 导入错误提示 */}
                {importError && (
                    <div className="px-6 py-2 bg-red-900/40 border-b border-red-700/50 flex items-center gap-3 shrink-0 text-sm text-red-300">
                        <i className="fas fa-triangle-exclamation text-red-400"></i>
                        <span>{importError}</span>
                        <button onClick={() => setImportError(null)} className="ml-auto text-red-400 hover:text-red-200">
                            <i className="fas fa-xmark"></i>
                        </button>
                    </div>
                )}

                {/* 图例 */}
                <div className="px-6 py-2 bg-slate-900 border-b border-slate-800 flex items-center gap-5 text-xs text-slate-500 shrink-0">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-400 inline-block"></span>在线</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-600 inline-block"></span>离线</span>
                    <span className="flex items-center gap-1.5"><i className="fas fa-compress text-orange-400"></i>退出全屏</span>
                    <span className="flex items-center gap-1.5"><i className="fas fa-eye-slash text-red-400"></i>切换页面</span>
                    <span className="ml-auto text-slate-600">拖拽座位可调整位置 · 双击名称可编辑</span>
                </div>

                {/* 讲台 */}
                <div className="px-6 pt-4 shrink-0">
                    <div className="flex justify-center">
                        <div className="px-12 py-2 bg-slate-700 border border-slate-600 rounded-xl text-slate-400 text-sm font-bold tracking-widest">
                            讲台
                        </div>
                    </div>
                </div>

                {/* 内容区：网格 or 列表 */}
                {viewMode === 'list' ? renderList() : (
                    <div className="flex-1 overflow-auto p-6">
                        <div className="flex flex-col gap-3 items-center">
                            {/* 列号 */}
                            <div className="flex gap-3">
                                <div className="w-6 shrink-0"></div>
                                {Array.from({ length: gridCols + 1 }, (_, i) => (
                                    <div key={i} className="min-w-[100px] text-center text-xs text-slate-600 font-mono">{i + 1}</div>
                                ))}
                            </div>
                            {renderGrid()}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ========================================================
// 📚 课程选择界面组件（仅教师端）
// ========================================================
function CourseSelector({ courses, currentCourseId, onSelectCourse, onRefresh, socket, settings, onSettingsChange, studentCount, studentLog }) {
    const [selectedId, setSelectedId] = useState(currentCourseId);
    const [showGuide, setShowGuide] = useState(false);
    const [guideContent, setGuideContent] = useState('');
    const [showSettings, setShowSettings] = useState(false);
    const [showClassroomView, setShowClassroomView] = useState(false);

    const handleSelect = (courseId) => {
        setSelectedId(courseId);
    };

    const handleStartCourse = () => {
        if (selectedId && socket) {
            socket.emit('select-course', { courseId: selectedId });
        }
    };

    const handleDownloadSkill = () => {
        const a = document.createElement('a');
        a.href = '/api/download-skill';
        a.download = 'create-course.md';
        a.click();
    };

    const handleImportCourse = async () => {
        if (!window.electronAPI?.importCourse) return;
        const result = await window.electronAPI.importCourse();
        if (result && result.success && result.imported.length > 0) {
            // 触发服务端重新扫描，更新课程列表
            onRefresh();
        }
    };

    const handleOpenGuide = async () => {
        if (!guideContent) {
            const res = await fetch('/api/course-guide');
            const text = await res.text();
            setGuideContent(text);
        }
        setShowGuide(true);
    };
    
    return (
        <div className="flex flex-col h-screen bg-slate-900 text-white overflow-hidden">
            {/* 顶栏 */}
            <div className="flex items-center justify-between px-8 py-5 bg-slate-800 border-b border-slate-700" style={{WebkitAppRegion:'drag'}}>
                <div className="flex items-center space-x-3">
                    <i className="fas fa-chalkboard-teacher text-blue-400 text-2xl"></i>
                    <h1 className="text-2xl font-bold">教师控制台</h1>
                </div>
                <div className="flex items-center space-x-3" style={{WebkitAppRegion:'no-drag'}}>
                    {/* 在线学生人数（可点击打开机房视图） */}
                    <button
                        onClick={() => setShowClassroomView(true)}
                        className="px-3 py-1.5 bg-purple-500/20 text-purple-300 rounded-full text-sm font-bold border border-purple-500/30 flex items-center hover:bg-purple-500/30 transition-colors"
                        title="点击查看机房视图"
                    >
                        <span className="relative flex h-2 w-2 mr-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                        </span>
                        在线学生: {studentCount}
                    </button>
                    {/* 设置按钮 */}
                    <button
                        onClick={() => setShowSettings(v => !v)}
                        className="flex items-center px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg border border-slate-600 transition-colors text-sm"
                        title="课堂设置"
                    >
                        <i className="fas fa-gear"></i>
                    </button>
                    <span className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-full text-sm font-bold border border-blue-500/30">
                        老师端 (主控)
                    </span>
                </div>
            </div>
            
            {/* 主内容区 */}
            <div className="flex-1 overflow-auto p-8">
                <div className="max-w-6xl mx-auto">
                    {/* 标题区 */}
                    <div className="mb-8">
                        <h2 className="text-3xl font-bold mb-2">选择课程</h2>
                        <p className="text-slate-400">从下方列表中选择要讲授的课程，学生将同步进入课堂</p>
                    </div>
                    
                    {/* 刷新 + 导入按钮 */}
                    <div className="mb-6 flex justify-end gap-3">
                        {window.electronAPI?.importCourse && (
                            <button
                                onClick={handleImportCourse}
                                className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors text-sm font-medium"
                            >
                                <i className="fas fa-file-import mr-2"></i> 导入课程
                            </button>
                        )}
                        <button 
                            onClick={onRefresh}
                            className="flex items-center px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-sm"
                        >
                            <i className="fas fa-sync-alt mr-2"></i> 刷新课程列表
                        </button>
                    </div>
                    
                    {/* 课程卡片网格 */}
                    {courses.length === 0 ? (
                        <div className="text-center py-20 bg-slate-800/50 rounded-2xl border border-slate-700">
                            <i className="fas fa-folder-open text-6xl text-slate-600 mb-4"></i>
                            <h3 className="text-xl font-bold text-slate-400 mb-2">暂无课程</h3>
                            <p className="text-slate-500">点击右上角"导入课程"按钮，或将课程文件放入 public/courses/ 目录</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {courses.map(course => (
                                <div 
                                    key={course.id}
                                    onClick={() => handleSelect(course.id)}
                                    className={`relative p-6 rounded-2xl border-2 cursor-pointer transition-all duration-300 ${
                                        selectedId === course.id 
                                            ? 'bg-slate-800 border-blue-500 shadow-lg shadow-blue-500/20' 
                                            : 'bg-slate-800/50 border-slate-700 hover:border-slate-500 hover:bg-slate-800'
                                    }`}
                                >
                                    {/* 选中标记 */}
                                    {selectedId === course.id && (
                                        <div className="absolute top-4 right-4 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                                            <i className="fas fa-check text-white"></i>
                                        </div>
                                    )}
                                    
                                    {/* 图标 */}
                                    <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${course.color} flex items-center justify-center text-3xl mb-4 shadow-lg`}>
                                        {course.icon}
                                    </div>
                                    
                                    {/* 标题 */}
                                    <h3 className="text-xl font-bold mb-2">{course.title}</h3>
                                    
                                    {/* 描述 */}
                                    <p className="text-slate-400 text-sm">{course.desc || '暂无描述'}</p>
                                    
                                    {/* 文件名 */}
                                    <p className="text-slate-600 text-xs mt-4 font-mono">{course.file}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            
            {/* 底部操作栏 */}
            <div className="px-8 py-5 bg-slate-800 border-t border-slate-700">
                <div className="max-w-6xl mx-auto flex justify-between items-center">
                    <div className="flex items-center space-x-3">
                        <span className="text-slate-400 text-sm">共 {courses.length} 个课程</span>
                        <button
                            onClick={handleDownloadSkill}
                            className="flex items-center px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg transition-colors text-sm font-medium border border-slate-600"
                            title="下载 AI 课件生成 Skill 文件"
                        >
                            <i className="fas fa-download mr-2 text-blue-400"></i>
                            下载 Skill
                        </button>
                        <button
                            onClick={handleOpenGuide}
                            className="flex items-center px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg transition-colors text-sm font-medium border border-slate-600"
                            title="查看课件开发教程"
                        >
                            <i className="fas fa-book-open mr-2 text-green-400"></i>
                            课件教程
                        </button>
                    </div>
                    <button
                        onClick={handleStartCourse}
                        disabled={!selectedId}
                        className={`flex items-center px-8 py-3 rounded-xl font-bold text-lg transition-all ${
                            selectedId
                                ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg hover:shadow-blue-500/30'
                                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                        }`}
                    >
                        <i className="fas fa-play mr-3"></i>
                        开始授课
                    </button>
                </div>
            </div>

            {/* 设置面板 */}
            {showSettings && (
                <SettingsPanel
                    settings={settings}
                    onSettingsChange={onSettingsChange}
                    socket={socket}
                    onClose={() => setShowSettings(false)}
                    zIndex="z-50"
                />
            )}

            {/* 课件教程面板 */}
            {showGuide && (
                <div className="fixed inset-0 z-50 flex" onClick={() => setShowGuide(false)}>
                    <div className="ml-auto w-full max-w-2xl h-full bg-white shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
                        {/* 面板顶栏 */}
                        <div className="flex items-center justify-between px-6 py-4 bg-slate-800 border-b border-slate-700 shrink-0">
                            <h3 className="text-white font-bold text-lg flex items-center">
                                <i className="fas fa-book-open mr-2 text-green-400"></i>
                                课件开发教程
                            </h3>
                            <div className="flex items-center space-x-2">
                                <button
                                    onClick={handleDownloadSkill}
                                    className="flex items-center px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
                                >
                                    <i className="fas fa-download mr-1.5"></i>
                                    下载 Skill
                                </button>
                                <button onClick={() => setShowGuide(false)} className="text-slate-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-700 transition-colors">
                                    <i className="fas fa-xmark text-xl"></i>
                                </button>
                            </div>
                        </div>
                        {/* 面板内容 */}
                        <div className="flex-1 overflow-y-auto p-6 text-slate-800">
                            <div
                                className="markdown-body text-sm leading-relaxed"
                                dangerouslySetInnerHTML={{ __html: window.marked ? window.marked.parse(guideContent) : guideContent }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* 机房视图 */}
            {showClassroomView && (
                <ClassroomView
                    onClose={() => setShowClassroomView(false)}
                    socket={socket}
                    studentLog={studentLog}
                />
            )}
        </div>
    );
}

// ========================================================
// 🎓 学生等待界面组件
// ========================================================
function StudentWaitingRoom({ message }) {
    return (
        <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white select-none">
            <div className="text-center">
                <div className="w-24 h-24 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                    <i className="fas fa-graduation-cap text-blue-400 text-4xl"></i>
                </div>
                <h2 className="text-3xl font-bold mb-4">等待老师选择课程...</h2>
                <p className="text-slate-400 max-w-md mx-auto">老师正在准备课程内容，请稍候。课程开始后您将自动进入课堂。</p>
                <div className="mt-8 flex items-center justify-center space-x-2">
                    <span className="w-3 h-3 bg-blue-500 rounded-full animate-bounce"></span>
                    <span className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></span>
                    <span className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></span>
                </div>
            </div>
        </div>
    );
}

function SyncClassroom({ title, slides, onEndCourse, socket, isHost: initialIsHost, initialSlide, settings, onSettingsChange, studentCount, studentLog }) {
    const [currentSlide, setCurrentSlide] = useState(initialSlide || 0);
    
    // 角色与状态控制
    const [isHost, setIsHost] = useState(initialIsHost || false);
    const [roleAssigned, setRoleAssigned] = useState(true);
    
    // 学生监控与弹窗状态
    const [toasts, setToasts] = useState([]);
    const [showLog, setShowLog] = useState(false);
    const [showClassroomView, setShowClassroomView] = useState(false);
    
    // 教师设置面板
    const [showSettings, setShowSettings] = useState(false);
    
    const socketRef = useRef(socket);

    // 用 ref 跟踪最新 settings，供事件回调使用
    const settingsRef = useRef(settings);
    useEffect(() => { settingsRef.current = settings; }, [settings]);

    useEffect(() => {
        if (isHost) return;

        const onFullscreenChange = () => {
            if (!document.fullscreenElement) {
                // 仅上报日志，全屏控制由 Electron 主进程负责
                socketRef.current && socketRef.current.emit('student-alert', { type: 'fullscreen-exit' });
            }
        };

        const onVisibilityChange = () => {
            if (document.hidden) {
                socketRef.current && socketRef.current.emit('student-alert', { type: 'tab-hidden' });
            }
        };

        document.addEventListener('fullscreenchange', onFullscreenChange);
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => {
            document.removeEventListener('fullscreenchange', onFullscreenChange);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, [isHost]);

    // 弹窗管理：动态推入新提示，3秒后自动销毁
    const showToast = (message, type) => {
        const id = Date.now() + Math.random();
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 3000);
    };

    useEffect(() => {
        if (!socket) return;
        
        socketRef.current = socket;

        // 监听翻页同步指令
        socket.on('sync-slide', (data) => {
            if (!isHost && !settingsRef.current.syncFollow) return;
            setCurrentSlide(data.slideIndex);
        });

        // 监听学生上下线状态
        socket.on('student-status', (data) => {
            if (data.action === 'join' && settingsRef.current.alertJoin) {
                showToast(`学生上线 (IP: ${data.ip})`, 'success');
            } else if (data.action === 'leave' && settingsRef.current.alertLeave) {
                showToast(`学生离开 (IP: ${data.ip})`, 'warning');
            }
        });

        // 监听学生异常行为
        socket.on('student-alert', (data) => {
            const ip = data.ip;
            if (data.type === 'fullscreen-exit' && settingsRef.current.alertFullscreenExit) {
                showToast(`学生退出全屏 (IP: ${ip})`, 'warning');
            } else if (data.type === 'tab-hidden' && settingsRef.current.alertTabHidden) {
                showToast(`学生切换页面 (IP: ${ip})`, 'warning');
            }
        });

        // 如果是老师端，拉取历史日志（由 ClassroomApp 统一管理，此处无需重复）

        return () => {
            socket.off('sync-slide');
            socket.off('student-status');
            socket.off('student-alert');
        };
    }, [socket, isHost]);

    // 翻页逻辑
    const goToSlide = (index) => {
        if (index >= 0 && index < slides.length) {
            setCurrentSlide(index);
            // 只有老师端才会发送同步指令给后端
            if (isHost) {
                socketRef.current.emit('sync-slide', { slideIndex: index });
            }
        }
    };

    const nextSlide = () => goToSlide(currentSlide + 1);
    const prevSlide = () => goToSlide(currentSlide - 1);

    // ========================================================
    // 界面渲染
    // ========================================================

    // 还没分配好角色时，显示连接动画
    if (!roleAssigned) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white select-none">
                <i className="fas fa-network-wired fa-fade text-5xl text-blue-500 mb-6"></i>
                <h2 className="text-2xl tracking-widest font-bold">正在连接课堂服务器...</h2>
                <p className="text-slate-400 mt-2">正在验证身份并分配权限</p>
            </div>
        );
    }

    // 分配好角色后，显示主界面
    return (
        <div className="flex flex-col h-screen bg-slate-900 text-slate-800 font-sans overflow-hidden select-none">
            
            {/* 顶栏 (Header) */}
            <div className="flex items-center justify-between px-6 md:px-8 py-4 bg-white shadow-md z-20 relative h-[72px] shrink-0" style={{WebkitAppRegion:'drag'}}>
                <div className="flex items-center space-x-3">
                    <i className="fas fa-microchip text-blue-600 text-2xl md:text-3xl"></i>
                    <h1 className="text-lg md:text-2xl font-bold text-slate-800 tracking-wide truncate max-w-[200px] md:max-w-none">{title}</h1>
                    
                    {/* 身份标识与学生人数标签 */}
                    <div className="hidden sm:flex items-center ml-4 space-x-2">
                        <span className={`px-3 py-1 text-xs md:text-sm font-bold rounded-full border ${
                            isHost ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-green-50 text-green-600 border-green-200'
                        }`}>
                            {isHost ? '🧑‍🏫 老师端 (主控)' : '👨‍🎓 学生端 (观看)'}
                        </span>
                        
                        {/* 仅老师端显示在线人数（可点击打开机房视图） */}
                        {isHost && (
                            <button
                                onClick={() => setShowClassroomView(true)}
                                className="px-3 py-1 text-xs md:text-sm font-bold rounded-full border bg-purple-50 text-purple-600 border-purple-200 flex items-center shadow-inner hover:bg-purple-100 transition-colors"
                                title="点击查看机房视图"
                                style={{WebkitAppRegion:'no-drag'}}
                            >
                                <span className="relative flex h-2 w-2 mr-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                                </span>
                                在线学生: {studentCount}
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex items-center space-x-3 md:space-x-4" style={{WebkitAppRegion:'no-drag'}}>
                    {/* 结束课程按钮（仅教师端） */}
                    {isHost && onEndCourse && (
                        <button
                            onClick={onEndCourse}
                            className="flex items-center px-3 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg border border-red-200 transition-colors text-sm font-bold"
                            title="结束课程"
                        >
                            <i className="fas fa-stop mr-2"></i>
                            <span className="hidden md:inline">结束课程</span>
                        </button>
                    )}
                    
                    {/* 设置按钮（仅教师端） */}
                    {isHost && (
                        <button
                            onClick={() => setShowSettings(v => !v)}
                            className="flex items-center px-3 py-2 bg-slate-50 text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors text-sm font-bold"
                            title="课堂设置"
                        >
                            <i className="fas fa-gear"></i>
                        </button>
                    )}
                    
                    {/* 日志按钮（仅教师端） */}
                    {isHost && (
                        <button
                            onClick={() => setShowLog(v => !v)}
                            className="flex items-center px-3 py-2 bg-slate-50 text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors text-sm font-bold relative"
                            title="学生日志"
                        >
                            <i className="fas fa-list-ul"></i>
                            {studentLog.length > 0 && (
                                <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                                    {studentLog.length > 99 ? '99' : studentLog.length}
                                </span>
                            )}
                        </button>
                    )}
                    
                    <div className="flex space-x-1.5 hidden md:flex">
                        {slides.map((_, idx) => (
                            <div
                                key={idx}
                                className={`h-2.5 rounded-full transition-all duration-300 ${
                                    idx === currentSlide ? 'w-8 md:w-10 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]' : 'w-2 md:w-3 bg-slate-200'
                                }`}
                            />
                        ))}
                    </div>
                    <button 
                        onClick={() => {
                            if (!document.fullscreenElement) {
                                document.documentElement.requestFullscreen().catch(err => console.log(err));
                            } else {
                                document.exitFullscreen().catch(err => console.log(err));
                            }
                        }} 
                        className="text-slate-400 hover:text-blue-500 transition-colors cursor-pointer bg-slate-50 w-10 h-10 rounded-lg border border-slate-200 hover:shadow-sm flex items-center justify-center" 
                        title="进入/退出全屏"
                    >
                        <i className="fas fa-expand text-lg md:text-xl"></i>
                    </button>
                </div>
            </div>

            {/* 16:9 课件展示区 (Canvas) */}
            <div className="flex-1 relative flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-hidden">
                <div 
                    className="bg-white relative shadow-2xl flex flex-col rounded-2xl transition-all duration-500 ring-4 ring-white/10 overflow-y-auto no-scrollbar"
                    style={{
                        width: '100%',
                        height: '100%',
                        maxWidth: 'calc((100vh - 144px - 2rem) * 16 / 9)', 
                        maxHeight: 'calc(100vw * 9 / 16)'
                    }}
                >
                    {/* 渲染当前页的内容 */}
                    {slides[currentSlide] && slides[currentSlide].component}
                </div>
            </div>

            {/* 底栏 (Navigation Controls) - 根据角色动态渲染 */}
            <div className="flex items-center justify-between px-6 md:px-10 py-4 bg-white border-t border-slate-200 shadow-[0_-4px_15px_-3px_rgba(0,0,0,0.1)] z-20 relative h-[72px] shrink-0">
                {isHost ? (
                    // 老师端：显示完整的翻页控制按钮
                    <>
                        <button
                            onClick={prevSlide}
                            disabled={currentSlide === 0}
                            className={`flex items-center px-4 md:px-6 py-2 md:py-2.5 rounded-xl font-bold text-base md:text-lg transition-all ${
                                currentSlide === 0
                                    ? 'text-slate-400 bg-slate-100 cursor-not-allowed'
                                    : 'text-white bg-blue-500 hover:bg-blue-600 shadow-md hover:-translate-x-1'
                            }`}
                        >
                            <i className="fas fa-chevron-left mr-2"></i>
                            上一页
                        </button>
                        <span className="text-slate-500 font-bold text-base md:text-lg tracking-widest bg-slate-100 px-4 md:px-6 py-1 md:py-2 rounded-full shadow-inner border border-slate-200">
                            {currentSlide + 1} / {slides.length}
                        </span>
                        <button
                            onClick={nextSlide}
                            disabled={currentSlide === slides.length - 1}
                            className={`flex items-center px-4 md:px-6 py-2 md:py-2.5 rounded-xl font-bold text-base md:text-lg transition-all ${
                                currentSlide === slides.length - 1
                                    ? 'text-slate-400 bg-slate-100 cursor-not-allowed'
                                    : 'text-white bg-blue-500 hover:bg-blue-600 shadow-md hover:translate-x-1'
                            }`}
                        >
                            下一页
                            <i className="fas fa-chevron-right ml-2"></i>
                        </button>
                    </>
                ) : (
                    // 学生端：syncFollow 关闭时显示翻页按钮，开启时显示观看状态
                    !settings.syncFollow ? (
                        <>
                            <button
                                onClick={prevSlide}
                                disabled={currentSlide === 0}
                                className={`flex items-center px-4 md:px-6 py-2 md:py-2.5 rounded-xl font-bold text-base md:text-lg transition-all ${
                                    currentSlide === 0
                                        ? 'text-slate-400 bg-slate-100 cursor-not-allowed'
                                        : 'text-white bg-green-500 hover:bg-green-600 shadow-md hover:-translate-x-1'
                                }`}
                            >
                                <i className="fas fa-chevron-left mr-2"></i>
                                上一页
                            </button>
                            <span className="text-slate-500 font-bold text-base md:text-lg tracking-widest bg-slate-100 px-4 md:px-6 py-1 md:py-2 rounded-full shadow-inner border border-slate-200">
                                {currentSlide + 1} / {slides.length}
                            </span>
                            <button
                                onClick={nextSlide}
                                disabled={currentSlide === slides.length - 1}
                                className={`flex items-center px-4 md:px-6 py-2 md:py-2.5 rounded-xl font-bold text-base md:text-lg transition-all ${
                                    currentSlide === slides.length - 1
                                        ? 'text-slate-400 bg-slate-100 cursor-not-allowed'
                                        : 'text-white bg-green-500 hover:bg-green-600 shadow-md hover:translate-x-1'
                                }`}
                            >
                                下一页
                                <i className="fas fa-chevron-right ml-2"></i>
                            </button>
                        </>
                    ) : (
                        <div className="w-full flex justify-center items-center">
                            <div className="text-slate-500 font-bold text-sm md:text-lg tracking-widest bg-slate-50 border border-slate-200 px-6 md:px-10 py-2 md:py-2.5 rounded-full flex items-center shadow-inner">
                                <span className="relative flex h-3 w-3 mr-3 md:mr-4">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                                </span>
                                正在观看老师演示 | 进度：{currentSlide + 1} / {slides.length}
                            </div>
                        </div>
                    )
                )}
            </div>
            
            {/* 日志面板（仅教师端） */}
            {isHost && showLog && (
                <div className="fixed inset-0 z-[9997] flex justify-end" onClick={() => setShowLog(false)}>
                    <div
                        className="w-96 h-full bg-white shadow-2xl border-l border-slate-200 flex flex-col"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
                            <h3 className="font-bold text-slate-800 text-lg flex items-center">
                                <i className="fas fa-list-ul mr-2 text-blue-500"></i> 学生操作日志
                            </h3>
                            <div className="flex items-center space-x-2">
                                <button onClick={() => setShowLog(false)} className="text-slate-400 hover:text-slate-600">
                                    <i className="fas fa-xmark text-xl"></i>
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5 text-sm">
                            {studentLog.length === 0 ? (
                                <div className="text-center text-slate-400 mt-16">
                                    <i className="fas fa-inbox text-3xl mb-3 block"></i>
                                    暂无记录
                                </div>
                            ) : (
                                [...studentLog].reverse().map((entry, i) => {
                                    const timeStr = new Date(entry.time).toLocaleTimeString('zh-CN', { hour12: false });
                                    const configs = {
                                        'join':            { icon: 'fa-user-plus',    color: 'text-green-600',  bg: 'bg-green-50',  label: '上线' },
                                        'leave':           { icon: 'fa-user-minus',   color: 'text-slate-500',  bg: 'bg-slate-50',  label: '离线' },
                                        'fullscreen-exit': { icon: 'fa-compress',     color: 'text-orange-500', bg: 'bg-orange-50', label: '退出全屏' },
                                        'tab-hidden':      { icon: 'fa-eye-slash',    color: 'text-red-500',    bg: 'bg-red-50',    label: '切换页面' },
                                    };
                                    const cfg = configs[entry.type] || { icon: 'fa-circle-info', color: 'text-blue-500', bg: 'bg-blue-50', label: entry.type };
                                    return (
                                        <div key={i} className={`flex items-center space-x-3 px-3 py-2 rounded-lg ${cfg.bg}`}>
                                            <i className={`fas ${cfg.icon} ${cfg.color} w-4 shrink-0`}></i>
                                            <span className={`font-bold ${cfg.color} w-16 shrink-0`}>{cfg.label}</span>
                                            <span className="text-slate-600 font-mono text-xs flex-1 truncate">{entry.ip}</span>
                                            <span className="text-slate-400 text-xs shrink-0">{timeStr}</span>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* 设置面板（仅教师端） */}
            {isHost && showSettings && (
                <SettingsPanel
                    settings={settings}
                    onSettingsChange={onSettingsChange}
                    socket={socketRef.current}
                    onClose={() => setShowSettings(false)}
                    zIndex="z-[9998]"
                />
            )}

            {/* 机房视图（仅教师端） */}
            {isHost && showClassroomView && (
                <ClassroomView
                    onClose={() => setShowClassroomView(false)}
                    socket={socketRef.current}
                    studentLog={studentLog}
                />
            )}

            {/* 侧边通知弹窗容器 (Toast) */}
            <div className="fixed top-24 right-6 z-50 flex flex-col space-y-3 pointer-events-none">
                {toasts.map(t => (
                    <div key={t.id} className={`px-4 py-3 rounded-xl shadow-xl border backdrop-blur-md font-bold text-sm md:text-base flex items-center toast-animate ${
                        t.type === 'success' ? 'bg-green-500/90 border-green-400 text-white' : 'bg-orange-500/90 border-orange-400 text-white'
                    }`}>
                        {t.message}
                    </div>
                ))}
            </div>
            
            {/* 为 Toast 添加简单的滑入动画 */}
            <style>{`
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                .toast-animate { animation: slideInRight 0.3s ease-out forwards; }
            `}</style>
        </div>
    );
}

// ========================================================
// 🚀 资源调度与渲染接管程序 (Bootstrapper)
// 作用：加载配置表中的脚本和模型，优先测试局域网，失败再切公网
// ========================================================

// 辅助函数：带兜底逻辑的脚本加载器
const loadScriptWithFallback = (localSrc, publicSrc) => {
    const fileName = localSrc.split('/').pop();
    return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = localSrc;
        let hasError = false;
        
        // 捕获脚本执行错误
        const errorHandler = (event) => {
            if (hasError) return;
            hasError = true;
            window.removeEventListener('error', errorHandler);
            // 执行出错，尝试公网兜底
            loadPublicScript(publicSrc, resolve);
        };
        
        window.addEventListener('error', errorHandler, { once: true });
        
        script.onload = () => {
            if (hasError) return;
            window.removeEventListener('error', errorHandler);
            console.log(`[资源引擎] ✅ ${fileName} 已加载`);
            resolve(true);
        };
        
        script.onerror = () => {
            if (hasError) return;
            hasError = true;
            window.removeEventListener('error', errorHandler);
            loadPublicScript(publicSrc, resolve);
        };
        
        document.head.appendChild(script);
    });
};

// 辅助函数：加载公网脚本
const loadPublicScript = (publicSrc, resolve) => {
    const fileName = publicSrc.split('/').pop();
    const fallbackScript = document.createElement('script');
    fallbackScript.src = publicSrc;
    fallbackScript.onload = () => {
        console.log(`[资源引擎] ✅ ${fileName} 已从公网加载`);
        resolve(true);
    };
    fallbackScript.onerror = () => {
        console.error(`[资源引擎] ❌ ${fileName} 加载失败`);
        resolve(false); 
    };
    document.head.appendChild(fallbackScript);
};

// 辅助函数：测试局域网模型库连通性
const checkModelUrlValidity = async (urls) => {
    if (!urls) return '';
    try {
        const testUrl = urls.local.endsWith('/') ? urls.local + 'tiny_face_detector_model-weights_manifest.json' : urls.local + '/tiny_face_detector_model-weights_manifest.json';
        
        const res = await fetch(testUrl, { method: 'HEAD', cache: 'no-cache' });
        if (res.ok) {
            console.log(`[资源引擎] ✅ 局域网模型库连通性测试通过，采用极速本地加载: ${urls.local}`);
            return urls.local;
        }
    } catch (err) {}
    console.warn(`[资源引擎] ⚠️ 未探测到局域网模型，已自动切换至公网 CDN 兜底: ${urls.public}`);
    return urls.public;
};

// ========================================================
// 🚀 主应用组件 - 管理课程选择和课堂状态
// ========================================================
function ClassroomApp() {
    const [isHost, setIsHost] = useState(false);
    const [roleAssigned, setRoleAssigned] = useState(false);
    const [courseCatalog, setCourseCatalog] = useState([]);
    const [currentCourseId, setCurrentCourseId] = useState(null);
    const [currentCourseData, setCurrentCourseData] = useState(null);
    const [initialSlideIndex, setInitialSlideIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [courseError, setCourseError] = useState(null);
    const [copyDone, setCopyDone] = useState(false);
    // Shared state lifted from SyncClassroom
    const DEFAULT_SETTINGS = {
        forceFullscreen: true,
        syncFollow: true,
        alertJoin: true,
        alertLeave: true,
        alertFullscreenExit: true,
        alertTabHidden: true,
    };
    const [settings, setSettings] = useState(DEFAULT_SETTINGS);
    const [studentCount, setStudentCount] = useState(0);
    const [sharedStudentLog, setSharedStudentLog] = useState([]);
    const socketRef = useRef(null);
    const courseCatalogRef = useRef([]);
    const settingsRef = useRef(settings);
    useEffect(() => { settingsRef.current = settings; }, [settings]);

    // 初始化时从 Electron 读取持久化设置（仅教师端有此 API）
    // 加载完成后立即同步给服务端，确保 course-changed 携带正确的 hostSettings
    useEffect(() => {
        if (window.electronAPI?.getSettings) {
            window.electronAPI.getSettings().then(saved => {
                if (!saved) return;
                const next = { ...settingsRef.current, ...saved };
                settingsRef.current = next;
                setSettings(next);
                // 如果 socket 已连接（role-assigned 已触发），立即同步给服务端
                if (socketRef.current && socketRef.current.connected) {
                    socketRef.current.emit('host-settings', next);
                }
            });
        }
    }, []);

    // Update a single setting, broadcast to students, and persist
    const handleSettingsChange = (key, value) => {
        const next = { ...settingsRef.current, [key]: value };
        setSettings(next);
        if (socketRef.current) socketRef.current.emit('host-settings', next);
        window.electronAPI?.saveSettings?.(next);
    };

    useEffect(() => {
        // 初始化 Socket 连接
        socketRef.current = window.io();

        // 监听角色分配和初始状态
        socketRef.current.on('role-assigned', (data) => {
            setIsHost(data.role === 'host');
            const catalog = data.courseCatalog || [];
            setCourseCatalog(catalog);
            courseCatalogRef.current = catalog;
            setCurrentCourseId(data.currentCourseId);
            setRoleAssigned(true);
            
            if (data.currentCourseId) {
                setInitialSlideIndex(data.currentSlideIndex || 0);
                loadCourse(data.currentCourseId, catalog);
                if (data.role !== 'host') {
                    const fs = data.hostSettings?.forceFullscreen ?? true;
                    if (data.hostSettings) setSettings(s => ({ ...s, ...data.hostSettings }));
                    window.electronAPI?.classStarted({ forceFullscreen: fs });
                }
            }

            // 教师端：拉取当前学生人数，并同步持久化设置给服务端
            if (data.role === 'host') {
                socketRef.current.emit('get-student-count');
                // 把本地持久化的设置推给服务端，确保 course-changed 携带正确值
                socketRef.current.emit('host-settings', settingsRef.current);
            }
        });

        // 监听学生上下线（教师端）
        socketRef.current.on('student-status', (data) => {
            setStudentCount(data.count);
        });

        // 监听教师设置变更（学生端）
        socketRef.current.on('host-settings', (s) => {
            setSettings(s);
            window.electronAPI?.setFullscreen(s.forceFullscreen);
        });

        // 监听教师推送的管理员密码变更（学生端）
        socketRef.current.on('set-admin-password', (data) => {
            window.electronAPI?.setAdminPassword?.(data.hash);
        });

        // 监听课程切换
        socketRef.current.on('course-changed', (data) => {
            setCurrentCourseId(data.courseId);
            setInitialSlideIndex(data.slideIndex || 0);
            loadCourse(data.courseId, courseCatalogRef.current);
            const fs = data.hostSettings?.forceFullscreen ?? true;
            if (data.hostSettings) setSettings(s => ({ ...s, ...data.hostSettings }));
            window.electronAPI?.classStarted({ forceFullscreen: fs });
        });

        // 监听课程结束
        socketRef.current.on('course-ended', () => {
            setCurrentCourseId(null);
            setCurrentCourseData(null);
            window.CourseData = null;
            window.electronAPI?.classEnded();
        });

        // 监听课程列表更新
        socketRef.current.on('course-catalog-updated', (data) => {
            setCourseCatalog(data.courses);
            courseCatalogRef.current = data.courses;
        });

        // 教师端：实时接收学生日志（供机房视图使用）
        socketRef.current.on('student-log-entry', (entry) => {
            setSharedStudentLog(prev => [...prev, entry].slice(-500));
        });

        // 教师端：拉取历史日志
        fetch('/api/student-log').then(r => r.json()).then(d => {
            setSharedStudentLog(d.log || []);
        }).catch(() => {});

        return () => {
            if (socketRef.current) socketRef.current.disconnect();
        };
    }, []);

    // 加载课程文件
    const loadCourse = async (courseId, catalog) => {
        const courseList = catalog || courseCatalogRef.current;
        const course = courseList.find(c => c.id === courseId);
        if (!course) {
            console.error(`[ClassroomApp] 找不到课程: ${courseId}`);
            return;
        }

        setIsLoading(true);
        setCourseError(null);
        
        try {
            // 动态加载课程脚本
            const scriptUrl = `/courses/${course.file}`;
            
            // 清除之前的课程数据
            window.CourseData = null;
            
            // 使用 fetch 获取脚本内容，然后用 Babel 编译
            const response = await fetch(scriptUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch ${scriptUrl}`);
            }
            
            const scriptContent = await response.text();
            
            // 使用 Babel 编译 JSX
            let compiledCode;
            if (window.Babel) {
                try {
                    const result = window.Babel.transform(scriptContent, {
                        presets: ['react', 'typescript'],
                        filename: course.file
                    });
                    compiledCode = result.code;
                } catch (babelErr) {
                    console.error('[ClassroomApp] Babel 编译失败:', babelErr);
                    throw babelErr;
                }
            } else {
                compiledCode = scriptContent;
            }
            
            // 执行编译后的代码
            try {
                // 使用 new Function 在当前全局作用域执行
                const runCode = new Function(compiledCode);
                runCode();
            } catch (execErr) {
                console.error('[ClassroomApp] 执行代码失败:', execErr);
                throw execErr;
            }

            // 等待课程数据准备就绪
            let retries = 100;
            while (!window.CourseData && retries > 0) {
                await new Promise(r => setTimeout(r, 100));
                retries--;
            }

            if (window.CourseData) {
                // 加载依赖
                if (window.CourseData.dependencies && window.CourseData.dependencies.length > 0) {
                    // 先将 filename -> publicSrc 映射注册给服务端
                    // 这样服务端在找不到文件时能用精确 URL 下载，而不是猜测
                    const depMappings = window.CourseData.dependencies
                        .filter(d => d.localSrc && d.publicSrc)
                        .map(d => ({
                            filename: d.localSrc.split('/').pop(),
                            publicSrc: d.publicSrc
                        }));
                    if (depMappings.length > 0) {
                        socketRef.current.emit('register-dependencies', depMappings);
                    }
                    
                    for (const dep of window.CourseData.dependencies) {
                        await loadScriptWithFallback(dep.localSrc, dep.publicSrc);
                    }
                }

                // 检查模型 URL
                window.CourseGlobalContext = {};
                if (window.CourseData.modelsUrls) {
                    const bestModelUrl = await checkModelUrlValidity(window.CourseData.modelsUrls);
                    window.CourseGlobalContext.modelUrl = bestModelUrl;
                }

                setCurrentCourseData(window.CourseData);
            }
        } catch (err) {
            console.error('[ClassroomApp] 加载课程失败:', err);
            setCourseError(err);
        } finally {
            setIsLoading(false);
        }
    };

    // 刷新课程列表
    const handleRefreshCourses = () => {
        if (socketRef.current) {
            socketRef.current.emit('refresh-courses');
        }
    };

    // 结束课程
    const handleEndCourse = () => {
        if (socketRef.current && isHost) {
            socketRef.current.emit('end-course');
        }
    };

    // 还没分配好角色时，显示连接动画
    if (!roleAssigned) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white select-none">
                <i className="fas fa-network-wired fa-fade text-5xl text-blue-500 mb-6"></i>
                <h2 className="text-2xl tracking-widest font-bold">正在连接课堂服务器...</h2>
                <p className="text-slate-400 mt-2">正在验证身份并分配权限</p>
            </div>
        );
    }

    // 老师端且未选择课程 - 显示课程选择界面
    if (isHost && !currentCourseId) {
        return (
            <CourseSelector 
                courses={courseCatalog}
                currentCourseId={currentCourseId}
                onSelectCourse={(id) => setCurrentCourseId(id)}
                onRefresh={handleRefreshCourses}
                socket={socketRef.current}
                settings={settings}
                onSettingsChange={handleSettingsChange}
                studentCount={studentCount}
                studentLog={sharedStudentLog}
            />
        );
    }

    // 学生端且未选择课程 - 显示等待界面
    if (!isHost && !currentCourseId) {
        return <StudentWaitingRoom />;
    }

    // 加载中
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white select-none">
                <i className="fas fa-layer-group fa-bounce text-5xl text-purple-500 mb-6"></i>
                <h2 className="text-2xl tracking-widest font-bold">正在加载课程内容...</h2>
                <p className="text-slate-400 mt-3 text-sm flex items-center">
                    <i className="fas fa-bolt text-yellow-400 mr-2"></i> 请稍候
                </p>
            </div>
        );
    }

    // 加载失败（仅教师端显示错误详情）
    if (courseError && !currentCourseData) {
        const errorText = courseError.message || String(courseError);
        const handleCopy = () => {
            navigator.clipboard.writeText(errorText).then(() => {
                setCopyDone(true);
                setTimeout(() => setCopyDone(false), 2000);
            });
        };
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white select-none p-8">
                <i className="fas fa-circle-exclamation text-5xl text-red-400 mb-6"></i>
                <h2 className="text-2xl font-bold mb-2">课程加载失败</h2>
                {isHost ? (
                    <div className="mt-4 w-full max-w-2xl">
                        <div className="bg-red-950/60 border border-red-500/40 rounded-2xl p-6 text-left">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-red-300 font-bold flex items-center">
                                    <i className="fas fa-bug mr-2"></i> 错误详情
                                </p>
                                <button
                                    onClick={handleCopy}
                                    className={`flex items-center px-3 py-1 rounded-lg text-xs font-bold transition-colors ${copyDone ? 'bg-green-600 text-white' : 'bg-red-900/60 hover:bg-red-800/60 text-red-300'}`}
                                >
                                    <i className={`fas ${copyDone ? 'fa-check' : 'fa-copy'} mr-1.5`}></i>
                                    {copyDone ? '已复制' : '复制'}
                                </button>
                            </div>
                            <pre className="text-red-200 text-sm font-mono whitespace-pre-wrap break-all leading-relaxed">
                                {errorText}
                            </pre>
                        </div>
                        <button
                            onClick={() => { setCourseError(null); setCurrentCourseId(null); }}
                            className="mt-6 px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold transition-colors"
                        >
                            <i className="fas fa-arrow-left mr-2"></i> 返回课程选择
                        </button>
                    </div>
                ) : (
                    <p className="text-slate-400 mt-2">请等待老师重新加载课程</p>
                )}
            </div>
        );
    }

    // 无课程数据（兜底）
    if (!currentCourseData) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white select-none">
                <i className="fas fa-layer-group fa-bounce text-5xl text-purple-500 mb-6"></i>
                <h2 className="text-2xl tracking-widest font-bold">正在加载课程内容...</h2>
                <p className="text-slate-400 mt-3 text-sm flex items-center">
                    <i className="fas fa-bolt text-yellow-400 mr-2"></i> 请稍候
                </p>
            </div>
        );
    }

    // 显示课堂界面
    return (
        <SyncClassroom 
            title={currentCourseData.title}
            slides={currentCourseData.slides}
            onEndCourse={isHost ? handleEndCourse : null}
            socket={socketRef.current}
            isHost={isHost}
            initialSlide={initialSlideIndex}
            settings={settings}
            onSettingsChange={handleSettingsChange}
            studentCount={studentCount}
            studentLog={sharedStudentLog}
        />
    );
}

const bootEngine = async () => {
    let rootElement = document.getElementById('root');
    let domRetries = 50;
    while (!rootElement && domRetries > 0) {
        await new Promise(r => setTimeout(r, 50));
        rootElement = document.getElementById('root');
        domRetries--;
    }
    if (!rootElement) return;

    const root = ReactDOM.createRoot(rootElement);
    
    console.log('[SyncEngine] 启动互动课堂系统');
    
    root.render(<ClassroomApp />);
};

bootEngine();