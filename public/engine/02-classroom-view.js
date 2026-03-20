// ========================================================
// 机房视图组件（教师端）
// 功能：显示所有学生座位，支持命名、拖拽排列、在线状态
// 布局和命名持久化到 localStorage
// ========================================================
function ClassroomView({ onClose, socket, studentLog }) {
    const STORAGE_KEY = 'classroom-layout-v1';

    const [seats, setSeats] = useState(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            return saved.map(s => ({ ...s, ip: s.ip && s.ip.startsWith('::ffff:') ? s.ip.slice(7) : s.ip }));
        } catch(e) { return []; }
    });
    const [onlineIPs, setOnlineIPs] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');
    const [dragId, setDragId] = useState(null);
    const [dragOver, setDragOver] = useState(null);
    const [addRow, setAddRow] = useState(1);
    const [addCol, setAddCol] = useState(1);
    const [addIp, setAddIp] = useState('');
    const [addName, setAddName] = useState('');
    const [showAddForm, setShowAddForm] = useState(false);
    const [autoImporting, setAutoImporting] = useState(false);
    const [viewMode, setViewMode] = useState('grid');
    const [importError, setImportError] = useState(null);
    const fileInputRef = useRef(null);

    const maxRow = seats.reduce((m, s) => Math.max(m, s.row), 0);
    const maxCol = seats.reduce((m, s) => Math.max(m, s.col), 0);
    const gridRows = Math.max(maxRow, 4);
    const gridCols = Math.max(maxCol, 6);

    const saveSeats = (next) => {
        setSeats(next);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    };

    const normalizeIp = ip => ip && ip.startsWith('::ffff:') ? ip.slice(7) : ip;

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

    const handleAutoImport = () => {
        setAutoImporting(true);
        fetch('/api/students').then(r => r.json()).then(d => {
            const ips = (d.students || []).map(normalizeIp);
            const existing = new Set(seats.map(s => s.ip));
            const newIps = ips.filter(ip => !existing.has(ip));
            if (newIps.length === 0) { setAutoImporting(false); return; }
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

    const recentAlerts = {};
    const logSlice = (studentLog || []).slice(-50);
    logSlice.forEach(e => {
        if (!recentAlerts[e.ip]) recentAlerts[e.ip] = [];
        recentAlerts[e.ip].push(e);
    });

    const handleDragStart = (e, id) => { setDragId(id); e.dataTransfer.effectAllowed = 'move'; };
    const handleDragOverCell = (e, row, col) => { e.preventDefault(); setDragOver({ row, col }); };
    const handleDropCell = (e, row, col) => {
        e.preventDefault();
        if (!dragId) return;
        const target = seats.find(s => s.row === row && s.col === col);
        const dragged = seats.find(s => s.id === dragId);
        if (!dragged) return;
        if (target && target.id !== dragId) {
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
            let nextSeats = [...seats];
            let autoRow = Math.max(...nextSeats.map(s => s.row || 0), 0) + 1;
            let autoCol = 0;
            imported.forEach(item => {
                const existing = nextSeats.find(s => s.ip === item.ip);
                let r = item.row, c = item.col;
                if (!r || !c) {
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
        e.target.value = '';
    };

    const handleAddSeat = () => {
        if (!addIp.trim()) return;
        const id = `seat-${Date.now()}`;
        saveSeats([...seats, { id, ip: normalizeIp(addIp.trim()), name: addName.trim(), row: Number(addRow), col: Number(addCol) }]);
        setAddIp(''); setAddName(''); setShowAddForm(false);
    };

    const handleDelete = (id) => saveSeats(seats.filter(s => s.id !== id));

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
                    ${isOnline ? 'bg-green-900/40 border-green-500/60 shadow-green-500/20 shadow-md' : 'bg-slate-800/60 border-slate-600/40'}`}
                style={{ minHeight: 80 }}
            >
                <button
                    onClick={() => handleDelete(seat.id)}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-slate-700 hover:bg-red-500 text-slate-400 hover:text-white text-xs items-center justify-center hidden group-hover:flex transition-colors z-10"
                >
                    <i className="fas fa-xmark text-[10px]"></i>
                </button>
                <div className={`w-2.5 h-2.5 rounded-full mb-1.5 ${isOnline ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.8)]' : 'bg-slate-600'}`}></div>
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
                <span className="text-[10px] text-slate-500 font-mono mt-0.5 truncate max-w-full px-1">{seat.ip}</span>
                {lastAlert && alertIcons[lastAlert.type] && (
                    <div className={`mt-1 flex items-center text-[10px] ${alertIcons[lastAlert.type].color}`}>
                        <i className={`fas ${alertIcons[lastAlert.type].icon} mr-1`}></i>
                        {alertIcons[lastAlert.type].label}
                    </div>
                )}
            </div>
        );
    };

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
                                    <button onClick={() => handleDelete(seat.id)} className="text-slate-600 hover:text-red-400 transition-colors text-xs" title="删除">
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
                            ${!seat && !isOver ? 'border border-dashed border-slate-700/40 rounded-xl' : ''}`}
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
                        <span className="px-2.5 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-bold border border-green-500/30">{onlineIPs.length} 在线</span>
                        <span className="px-2.5 py-1 bg-slate-700 text-slate-400 rounded-full text-xs font-bold">{seats.length} 座位</span>
                    </div>
                    <div className="flex items-center space-x-2">
                        <div className="flex rounded-lg overflow-hidden border border-slate-600">
                            <button onClick={() => setViewMode('grid')} className={`px-3 py-1.5 text-sm transition-colors ${viewMode === 'grid' ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`} title="网格视图"><i className="fas fa-table-cells"></i></button>
                            <button onClick={() => setViewMode('list')} className={`px-3 py-1.5 text-sm transition-colors ${viewMode === 'list' ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`} title="列表视图"><i className="fas fa-list"></i></button>
                        </div>
                        <button onClick={handleAutoImport} disabled={autoImporting} className="flex items-center px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors" title="将当前在线学生自动添加为座位">
                            <i className={`fas ${autoImporting ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'} mr-1.5`}></i>自动导入
                        </button>
                        <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleImportFile} />
                        <button onClick={() => fileInputRef.current && fileInputRef.current.click()} className="flex items-center px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-medium transition-colors border border-slate-600" title="从 CSV 文件导入座位列表">
                            <i className="fas fa-file-import mr-1.5"></i>导入列表
                        </button>
                        <button onClick={handleDownloadTemplate} className="flex items-center px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-medium transition-colors border border-slate-600" title="下载座位列表模板文件">
                            <i className="fas fa-download mr-1.5"></i>模板
                        </button>
                        <button onClick={() => setShowAddForm(v => !v)} className="flex items-center px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-medium transition-colors border border-slate-600">
                            <i className="fas fa-plus mr-1.5"></i>手动添加
                        </button>
                        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
                            <i className="fas fa-xmark text-lg"></i>
                        </button>
                    </div>
                </div>

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

                {importError && (
                    <div className="px-6 py-2 bg-red-900/40 border-b border-red-700/50 flex items-center gap-3 shrink-0 text-sm text-red-300">
                        <i className="fas fa-triangle-exclamation text-red-400"></i>
                        <span>{importError}</span>
                        <button onClick={() => setImportError(null)} className="ml-auto text-red-400 hover:text-red-200"><i className="fas fa-xmark"></i></button>
                    </div>
                )}

                <div className="px-6 py-2 bg-slate-900 border-b border-slate-800 flex items-center gap-5 text-xs text-slate-500 shrink-0">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-400 inline-block"></span>在线</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-600 inline-block"></span>离线</span>
                    <span className="flex items-center gap-1.5"><i className="fas fa-compress text-orange-400"></i>退出全屏</span>
                    <span className="flex items-center gap-1.5"><i className="fas fa-eye-slash text-red-400"></i>切换页面</span>
                    <span className="ml-auto text-slate-600">拖拽座位可调整位置 · 双击名称可编辑</span>
                </div>

                <div className="px-6 pt-4 shrink-0">
                    <div className="flex justify-center">
                        <div className="px-12 py-2 bg-slate-700 border border-slate-600 rounded-xl text-slate-400 text-sm font-bold tracking-widest">讲台</div>
                    </div>
                </div>

                {viewMode === 'list' ? renderList() : (
                    <div className="flex-1 overflow-auto p-6">
                        <div className="flex flex-col gap-3 items-center">
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
