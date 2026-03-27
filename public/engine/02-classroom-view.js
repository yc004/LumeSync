// ========================================================
// 机房视图组件（教师端）
// 功能：显示所有学生座位，支持命名、拖拽排列、在线状态
// 布局和命名持久化到 localStorage，支持多个班级（表）
// ========================================================
function ClassroomView({ onClose, socket, studentLog, podiumAtTop, onPodiumAtTopChange }) {
    const STORAGE_KEY = 'classroom-layouts-v1';
    const podiumOnTop = typeof podiumAtTop === 'boolean' ? podiumAtTop : true;

    // 多班级状态管理
    const [classrooms, setClassrooms] = useState(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            // 兼容旧版本数据（如果存在单个表）
            const oldLayout = JSON.parse(localStorage.getItem('classroom-layout-v1') || '[]');
            if (oldLayout.length > 0 && Object.keys(saved).length === 0) {
                // 迁移旧数据到默认班级
                return {
                    'default': {
                        name: '默认班级',
                        seats: oldLayout.map(s => ({ ...s, ip: s.ip && s.ip.startsWith('::ffff:') ? s.ip.slice(7) : s.ip })),
                        podiumAtTop: true
                    }
                };
            }
            return saved;
        } catch(e) { return {}; }
    });
    const [currentClassroomId, setCurrentClassroomId] = useState(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            const lastUsed = localStorage.getItem('classroom-last-used');
            if (lastUsed && saved[lastUsed]) return lastUsed;
            return Object.keys(saved)[0] || 'default';
        } catch(e) { return 'default'; }
    });
    const [showClassroomMenu, setShowClassroomMenu] = useState(false);
    const [showAddClassroom, setShowAddClassroom] = useState(false);
    const [newClassName, setNewClassName] = useState('');
    const classroomMenuRef = useRef(null);

    // 当前班级数据
    const currentClassroom = classrooms[currentClassroomId] || { name: '默认班级', seats: [], podiumAtTop: true };
    const [seats, setSeats] = useState(currentClassroom.seats || []);
    const [currentPodiumTop, setCurrentPodiumTop] = useState(currentClassroom.podiumAtTop !== undefined ? currentClassroom.podiumAtTop : podiumOnTop);

    // 当切换班级或更新数据时，同步状态
    useEffect(() => {
        const classroom = classrooms[currentClassroomId];
        if (classroom) {
            setSeats(classroom.seats || []);
            setCurrentPodiumTop(classroom.podiumAtTop !== undefined ? classroom.podiumAtTop : podiumOnTop);
        }
    }, [currentClassroomId, classrooms]);

    const [onlineIPs, setOnlineIPs] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');
    const [editStudentId, setEditStudentId] = useState('');
    const [dragId, setDragId] = useState(null);
    const [dragOver, setDragOver] = useState(null);
    const [addRow, setAddRow] = useState(1);
    const [addCol, setAddCol] = useState(1);
    const [addIp, setAddIp] = useState('');
    const [addName, setAddName] = useState('');
    const [addStudentId, setAddStudentId] = useState('');
    const [showAddForm, setShowAddForm] = useState(false);
    const [autoImporting, setAutoImporting] = useState(false);
    const [viewMode, setViewMode] = useState('grid');
    const [importError, setImportError] = useState(null);
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const fileInputRef = useRef(null);
    const moreMenuRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) {
                setShowMoreMenu(false);
            }
            if (classroomMenuRef.current && !classroomMenuRef.current.contains(e.target)) {
                setShowClassroomMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const maxRow = seats.reduce((m, s) => Math.max(m, s.row), 0);
    const maxCol = seats.reduce((m, s) => Math.max(m, s.col), 0);
    const gridRows = Math.max(maxRow, 4);
    const gridCols = Math.max(maxCol, 6);

    const saveClassroom = (classroomId, data) => {
        setClassrooms(prev => {
            const updated = {
                ...prev,
                [classroomId]: { ...prev[classroomId], ...data }
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

            fetch('/api/save-classroom-layout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ layout: updated })
            }).then(res => res.json()).then(result => {
                if (!result.success) {
                    console.warn('[ClassroomView] Failed to persist classroom layout:', result.error);
                }
            }).catch(err => {
                console.warn('[ClassroomView] Error persisting classroom layout:', err);
            });

            return updated;
        });
    };

    const saveSeats = (next) => {
        setSeats(next);
        saveClassroom(currentClassroomId, { seats: next });
    };

    const normalizeIp = ip => ip && ip.startsWith('::ffff:') ? ip.slice(7) : ip;
    const handleClose = () => {
        if (editingId) {
            saveSeats(seats.map(s => s.id === editingId ? { ...s, name: editName } : s));
            setEditingId(null);
        }
        if (onClose) onClose();
    };

    // 切换班级
    const handleSwitchClassroom = (classroomId) => {
        if (classroomId === currentClassroomId) return;
        setCurrentClassroomId(classroomId);
        localStorage.setItem('classroom-last-used', classroomId);
        setShowClassroomMenu(false);
    };

    // 创建新班级
    const handleCreateClassroom = () => {
        if (!newClassName.trim()) return;
        const newId = `classroom-${Date.now()}`;
        saveClassroom(newId, {
            name: newClassName.trim(),
            seats: [],
            podiumAtTop: true
        });
        setNewClassName('');
        setShowAddClassroom(false);
        handleSwitchClassroom(newId);
    };

    // 删除班级
    const handleDeleteClassroom = (e, classroomId) => {
        e.stopPropagation();
        if (Object.keys(classrooms).length <= 1) {
            alert('至少需要保留一个班级');
            return;
        }
        if (!confirm(`确定要删除班级 "${classrooms[classroomId]?.name}" 吗？`)) return;

        setClassrooms(prev => {
            const updated = { ...prev };
            delete updated[classroomId];
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

            fetch('/api/save-classroom-layout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ layout: updated })
            }).catch(err => {
                console.warn('[ClassroomView] Error persisting classroom layout after delete:', err);
            });

            return updated;
        });

        // 如果删除的是当前班级，切换到第一个班级
        if (classroomId === currentClassroomId) {
            const remainingClassrooms = Object.keys(classrooms).filter(id => id !== classroomId);
            if (remainingClassrooms.length > 0) {
                handleSwitchClassroom(remainingClassrooms[0]);
            }
        }
        setShowClassroomMenu(false);
    };

    // 重命名班级
    const handleRenameClassroom = (e, classroomId, newName) => {
        e.stopPropagation();
        saveClassroom(classroomId, { name: newName.trim() });
    };

    // 更新班级的讲台位置
    const handlePodiumAtTopChange = (value) => {
        setCurrentPodiumTop(value);
        saveClassroom(currentClassroomId, { podiumAtTop: value });
        if (onPodiumAtTopChange) {
            onPodiumAtTopChange(value);
        }
    };

    const fetchOnline = () => {
        fetch('/api/students').then(r => r.json()).then(d => {
            setOnlineIPs((d.students || []).map(normalizeIp));
        }).catch(() => {});
    };

    useEffect(() => {
        fetchOnline();
        const t = setInterval(fetchOnline, 3000);

        fetch('/api/classroom-layout')
            .then(r => r.json())
            .then(d => {
                if (!d?.success || !d.layout) return;

                let serverClassrooms = null;
                if (Array.isArray(d.layout)) {
                    serverClassrooms = {
                        default: {
                            name: '默认班级',
                            seats: d.layout.map(s => ({ ...s, ip: normalizeIp(s.ip) })),
                            podiumAtTop: true
                        }
                    };
                } else if (d.layout?.classrooms && typeof d.layout.classrooms === 'object') {
                    serverClassrooms = d.layout.classrooms;
                } else if (typeof d.layout === 'object') {
                    serverClassrooms = d.layout;
                }

                if (!serverClassrooms || Object.keys(serverClassrooms).length === 0) return;

                setClassrooms(serverClassrooms);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(serverClassrooms));

                const lastUsed = localStorage.getItem('classroom-last-used');
                const targetId = (lastUsed && serverClassrooms[lastUsed])
                    ? lastUsed
                    : (Object.keys(serverClassrooms)[0] || 'default');
                setCurrentClassroomId(targetId);
            })
            .catch(err => {
                console.warn('[ClassroomView] Failed to load classroom layout from server:', err);
            });

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
            '# 格式：ip,名称,学号,行,列',
            '# 每行一个座位，# 开头为注释行',
            '# 行列从 1 开始，左上角为 (1,1)',
            '#',
            '# 示例：',
            '192.168.1.101,A01,20230001,1,1',
            '192.168.1.102,A02,20230002,1,2',
            '192.168.1.103,A03,20230003,1,3',
            '192.168.1.104,A04,20230004,1,4',
            '192.168.1.105,A05,20230005,1,5',
            '192.168.1.106,A06,20230006,1,6',
            '192.168.1.201,B01,20230007,2,1',
            '192.168.1.202,B02,20230008,2,2',
            '192.168.1.203,B03,20230009,2,3',
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
            const text = String(ev.target.result || '');
            const trimmedText = text.trim();
            const isJson = String(file.name || '').toLowerCase().endsWith('.json')
                || trimmedText.startsWith('{')
                || trimmedText.startsWith('[');
            if (isJson) {
                try {
                    const parsed = JSON.parse(trimmedText || '{}');
                    // 如果是 v2 格式的班级数据，可以选择创建新班级或覆盖
                    if (parsed && parsed.version === 2 && parsed.classroomId && parsed.classroomName) {
                        const shouldCreateNew = confirm(`导入的班级名称为 "${parsed.classroomName}"\n\n点击"确定"创建新班级\n点击"取消"覆盖当前班级`);
                        if (shouldCreateNew) {
                            const newId = `classroom-${Date.now()}`;
                        saveClassroom(newId, {
                            name: parsed.classroomName,
                            seats: parsed.seats.map((s, idx) => {
                                const ip = normalizeIp(s.ip);
                                return { id: s.id || `seat-${Date.now()}-${ip}-${idx}`, ip, name: s.name || '', studentId: s.studentId || '', row: s.row, col: s.col };
                            }),
                            podiumAtTop: parsed.podiumAtTop !== undefined ? parsed.podiumAtTop : true
                        });
                            handleSwitchClassroom(newId);
                            return;
                        }
                    }
                    // 覆盖当前班级
                    if (parsed && typeof parsed.podiumAtTop === 'boolean') {
                        handlePodiumAtTopChange(parsed.podiumAtTop);
                    }
                    const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.seats) ? parsed.seats : []);
                    const normalized = list
                        .map((s, idx) => {
                            const ip = normalizeIp(s && s.ip ? String(s.ip).trim() : '');
                            const name = s && s.name ? String(s.name) : '';
                            const studentId = s && s.studentId ? String(s.studentId) : '';
                            const row = s && Number.isFinite(Number(s.row)) ? Math.max(1, Number(s.row)) : null;
                            const col = s && Number.isFinite(Number(s.col)) ? Math.max(1, Number(s.col)) : null;
                            if (!ip || !row || !col) return null;
                            const id = s && s.id ? String(s.id) : `seat-${Date.now()}-${ip}-${idx}`;
                            return { id, ip, name, studentId, row, col };
                        })
                        .filter(Boolean);
                    if (normalized.length === 0) {
                        setImportError('JSON 文件中未找到有效座位数据');
                        return;
                    }
                    saveSeats(normalized);
                    return;
                } catch (_) {
                    setImportError('JSON 解析失败，请确认文件格式正确');
                    return;
                }
            }
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
                const studentId = parts[2] ? parts[2].trim() : '';
                const row = parts[3] ? parseInt(parts[3].trim(), 10) : null;
                const col = parts[4] ? parseInt(parts[4].trim(), 10) : null;
                if (!ip) { errors.push(`第 ${idx + 1} 行 IP 为空`); return; }
                if (row !== null && (isNaN(row) || row < 1)) { errors.push(`第 ${idx + 1} 行 行号无效`); return; }
                if (col !== null && (isNaN(col) || col < 1)) { errors.push(`第 ${idx + 1} 行 列号无效`); return; }
                imported.push({ ip, name, studentId, row: row || null, col: col || null });
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
                    nextSeats = nextSeats.map(s => s.ip === item.ip ? { ...s, name: item.name || s.name, studentId: item.studentId || s.studentId, row: r, col: c } : s);
                } else {
                    nextSeats.push({ id: `seat-${Date.now()}-${item.ip}`, ip: item.ip, name: item.name, studentId: item.studentId, row: r, col: c });
                }
            });
            saveSeats(nextSeats);
        };
        reader.readAsText(file, 'utf-8');
        e.target.value = '';
    };

    const downloadBlob = (blob, filename) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };
    const getStamp = () => {
        const d = new Date();
        const p2 = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`;
    };
    const handleExportJson = () => {
        const payload = {
            version: 2,
            exportedAt: new Date().toISOString(),
            classroomId: currentClassroomId,
            classroomName: currentClassroom.name,
            podiumAtTop: currentPodiumTop,
            seats: seats.map(s => ({ ip: s.ip, name: s.name || '', studentId: s.studentId || '', row: s.row, col: s.col }))
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
        downloadBlob(blob, `classroom-${currentClassroom.name}-${getStamp()}.json`);
    };
    const handleExportCsv = () => {
        const content = [
            '# 机房座位列表',
            '# 格式：ip,名称,学号,行,列',
            ...[...seats]
                .sort((a, b) => a.row !== b.row ? a.row - b.row : a.col - b.col)
                .map(s => `${s.ip},${String(s.name || '').replace(/,/g, ' ')},${String(s.studentId || '').replace(/,/g, ' ')},${s.row},${s.col}`)
        ].join('\n');
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        downloadBlob(blob, `classroom-seats-${getStamp()}.csv`);
    };

    const handleAddSeat = () => {
        if (!addIp.trim()) return;
        const id = `seat-${Date.now()}`;
        saveSeats([...seats, { id, ip: normalizeIp(addIp.trim()), name: addName.trim(), studentId: addStudentId.trim(), row: Number(addRow), col: Number(addCol) }]);
        setAddIp(''); setAddName(''); setAddStudentId(''); setShowAddForm(false);
    };

    const handleDelete = (id) => saveSeats(seats.filter(s => s.id !== id));

    const startEdit = (seat) => { setEditingId(seat.id); setEditName(seat.name); setEditStudentId(seat.studentId || ''); };
    const commitEdit = () => {
        saveSeats(seats.map(s => s.id === editingId ? { ...s, name: editName, studentId: editStudentId } : s));
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
                className={`relative flex flex-col items-center justify-center p-1.5 sm:p-2 rounded-xl border-2 cursor-grab select-none transition-all duration-200 group
                    ${isDragging ? 'opacity-40 scale-95' : ''}
                    ${isOnline ? 'bg-green-900/40 border-green-500/60 shadow-green-500/20 shadow-md' : 'bg-slate-800/60 border-slate-600/40'}`}
                style={{ minHeight: 70 }}
            >
                <button
                    onClick={() => handleDelete(seat.id)}
                    className="absolute top-0.5 right-0.5 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-slate-700 hover:bg-red-500 text-slate-400 hover:text-white text-[10px] sm:text-xs items-center justify-center hidden group-hover:flex transition-colors z-10"
                >
                    <i className="fas fa-xmark text-[8px] sm:text-[10px]"></i>
                </button>
                <div className={`w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full mb-1 sm:mb-1.5 ${isOnline ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.8)]' : 'bg-slate-600'}`}></div>
                <span
                    className="text-[10px] sm:text-xs font-bold text-white truncate max-w-full px-0.5 sm:px-1 cursor-text"
                    title={`${seat.name || '未命名'}\n${seat.studentId ? '学号: ' + seat.studentId : ''}\n${seat.ip}`}
                    onDoubleClick={() => startEdit(seat)}
                >
                    {seat.name || <span className="text-slate-500 italic">双击命名</span>}
                </span>
                {seat.studentId && <span className="text-[8px] sm:text-[9px] text-blue-400 font-mono truncate max-w-full px-0.5 sm:px-1">{seat.studentId}</span>}
                <span className="text-[8px] sm:text-[10px] text-slate-500 font-mono mt-0.5 truncate max-w-full px-0.5 sm:px-1">{seat.ip}</span>
                {lastAlert && alertIcons[lastAlert.type] && (
                    <div className={`mt-0.5 sm:mt-1 flex items-center text-[8px] sm:text-[10px] ${alertIcons[lastAlert.type].color}`}>
                        <i className={`fas ${alertIcons[lastAlert.type].icon} mr-0.5 sm:mr-1`}></i>
                        <span className="hidden sm:inline">{alertIcons[lastAlert.type].label}</span>
                    </div>
                )}
            </div>
        );
    };

    const renderList = () => (
        <div className="flex-1 overflow-auto p-3 sm:p-4">
            <table className="w-full min-w-[600px] text-sm text-left border-collapse">
                <thead>
                    <tr className="text-slate-500 text-[10px] sm:text-xs uppercase tracking-wider border-b border-slate-700">
                        <th className="px-2 sm:px-3 py-2 w-6 text-center">#</th>
                        <th className="px-2 sm:px-3 py-2">状态</th>
                        <th className="px-2 sm:px-3 py-2">IP 地址</th>
                        <th className="px-2 sm:px-3 py-2">名称</th>
                        <th className="px-2 sm:px-3 py-2 hidden sm:table-cell">学号</th>
                        <th className="px-2 sm:px-3 py-2 text-center hidden sm:table-cell">行</th>
                        <th className="px-2 sm:px-3 py-2 text-center hidden sm:table-cell">列</th>
                        <th className="px-2 sm:px-3 py-2 hidden md:table-cell">最近告警</th>
                        <th className="px-2 sm:px-3 py-2 text-center">操作</th>
                    </tr>
                </thead>
                <tbody>
                    {seats.length === 0 && (
                        <tr><td colSpan="9" className="text-center text-slate-600 py-12">暂无座位，请导入或手动添加</td></tr>
                    )}
                    {[...seats].sort((a, b) => a.row !== b.row ? a.row - b.row : a.col - b.col).map((seat, idx) => {
                        const isOnline = onlineIPs.includes(seat.ip);
                        const alerts = recentAlerts[seat.ip] || [];
                        const lastAlert = alerts[alerts.length - 1];
                        return (
                            <tr key={seat.id} className="border-b border-slate-800 hover:bg-slate-800/40 transition-colors">
                                <td className="px-2 sm:px-3 py-2 text-slate-600 text-center text-[10px] sm:text-xs">{idx + 1}</td>
                                <td className="px-2 sm:px-3 py-2">
                                    <span className={`inline-flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs font-bold ${isOnline ? 'text-green-400' : 'text-slate-500'}`}>
                                        <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${isOnline ? 'bg-green-400' : 'bg-slate-600'}`}></span>
                                        <span className="hidden sm:inline">{isOnline ? '在线' : '离线'}</span>
                                    </span>
                                </td>
                                <td className="px-2 sm:px-3 py-2 font-mono text-slate-300 text-[10px] sm:text-xs">{seat.ip}</td>
                                <td className="px-2 sm:px-3 py-2">
                                    <span
                                        className="text-white text-[10px] sm:text-xs cursor-text hover:text-blue-300 transition-colors"
                                        onClick={() => startEdit(seat)}
                                        title="点击编辑"
                                    >
                                        {seat.name || <span className="text-slate-600 italic">点击编辑</span>}
                                    </span>
                                </td>
                                <td className="px-2 sm:px-3 py-2 font-mono text-slate-400 text-[10px] sm:text-xs hidden sm:table-cell">{seat.studentId || <span className="text-slate-700 italic">—</span>}</td>
                                <td className="px-2 sm:px-3 py-2 text-center text-slate-400 text-[10px] sm:text-xs hidden sm:table-cell">{seat.row}</td>
                                <td className="px-2 sm:px-3 py-2 text-center text-slate-400 text-[10px] sm:text-xs hidden sm:table-cell">{seat.col}</td>
                                <td className="px-2 sm:px-3 py-2 text-[10px] sm:text-xs hidden md:table-cell">
                                    {lastAlert && alertIcons[lastAlert.type] ? (
                                        <span className={`flex items-center gap-1 ${alertIcons[lastAlert.type].color}`}>
                                            <i className={`fas ${alertIcons[lastAlert.type].icon}`}></i>
                                            {alertIcons[lastAlert.type].label}
                                        </span>
                                    ) : <span className="text-slate-700">—</span>}
                                </td>
                                <td className="px-2 sm:px-3 py-2 text-center">
                                    <button onClick={() => handleDelete(seat.id)} className="text-slate-600 hover:text-red-400 transition-colors text-[10px] sm:text-xs" title="删除">
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
        const rowCount = gridRows + 1;
        const colCount = gridCols + 1;
        for (let vr = 1; vr <= rowCount; vr++) {
            const r = currentPodiumTop ? vr : (rowCount - vr + 1);
            const cols = [];
            for (let c = 1; c <= colCount; c++) {
                const seat = seats.find(s => s.row === r && s.col === c);
                const isOver = dragOver && dragOver.row === r && dragOver.col === c;
                cols.push(
                    <div
                        key={`${vr}-${c}`}
                        onDragOver={e => handleDragOverCell(e, r, c)}
                        onDrop={e => handleDropCell(e, r, c)}
                        className={`min-w-[80px] sm:min-w-[100px] min-h-[70px] sm:min-h-[90px] rounded-xl transition-all duration-150
                            ${isOver && dragId ? 'bg-blue-500/20 border-2 border-blue-400 border-dashed' : ''}
                            ${!seat && !isOver ? 'border border-dashed border-slate-700/40 rounded-xl' : ''}`}
                    >
                        {seat ? renderSeat(seat) : null}
                    </div>
                );
            }
            rows.push(
                <div key={vr} className="flex gap-2 sm:gap-3">
                    <div className="w-6 flex items-center justify-center text-[10px] sm:text-xs text-slate-600 font-mono shrink-0">{r}</div>
                    {cols}
                </div>
            );
        }
        return rows;
    };

    return (
        <div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-2 sm:p-4" onClick={handleClose}>
            <div
                className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-700 flex flex-col overflow-hidden"
                style={{ width: '95vw', maxWidth: 1400, height: '92vh' }}
                onClick={e => e.stopPropagation()}
            >
                {/* 顶栏 */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 sm:px-6 py-3 sm:py-4 bg-slate-800 border-b border-slate-700 shrink-0 gap-3">
                    <div className="flex items-center space-x-2 sm:space-x-3 w-full sm:w-auto min-w-0">
                        <i className="fas fa-chalkboard text-blue-400 text-lg sm:text-xl shrink-0"></i>
                        <h2 className="text-white font-bold text-base sm:text-lg truncate">机房视图</h2>
                        {/* 班级选择器 */}
                        <div className="relative" ref={classroomMenuRef}>
                            <button
                                onClick={() => setShowClassroomMenu(!showClassroomMenu)}
                                className="flex items-center px-2 sm:px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs sm:text-sm font-medium transition-colors border border-slate-600 text-slate-200"
                            >
                                <i className="fas fa-users mr-1 sm:mr-1.5"></i>
                                <span className="max-w-[80px] sm:max-w-[120px] truncate">{currentClassroom.name}</span>
                                <i className={`fas fa-chevron-down ml-1 sm:ml-2 text-xs transition-transform ${showClassroomMenu ? 'rotate-180' : ''}`}></i>
                            </button>
                            {showClassroomMenu && (
                                <div className="absolute left-0 mt-2 w-56 bg-slate-800 rounded-xl shadow-xl border border-slate-700 py-2 z-50">
                                    <div className="px-3 py-2 border-b border-slate-700 flex items-center justify-between">
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">班级列表</span>
                                        <button
                                            onClick={() => { setShowAddClassroom(true); setShowClassroomMenu(false); }}
                                            className="text-xs text-blue-400 hover:text-blue-300 flex items-center"
                                        >
                                            <i className="fas fa-plus mr-1"></i>新建
                                        </button>
                                    </div>
                                    {Object.entries(classrooms).map(([id, cls]) => (
                                        <div
                                            key={id}
                                            onClick={() => handleSwitchClassroom(id)}
                                            className={`px-3 py-2 flex items-center justify-between group transition-colors cursor-pointer ${
                                                id === currentClassroomId ? 'bg-blue-500/20 text-blue-300' : 'hover:bg-slate-700 text-slate-300'
                                            }`}
                                        >
                                            <div className="flex items-center flex-1 min-w-0">
                                                <i className="fas fa-chalkboard-teacher w-4 mr-2 text-slate-500"></i>
                                                <span className="truncate text-sm">{cls.name}</span>
                                                <span className="ml-2 text-xs text-slate-500">({cls.seats?.length || 0}座)</span>
                                            </div>
                                            {id !== currentClassroomId && (
                                                <button
                                                    onClick={(e) => handleDeleteClassroom(e, id)}
                                                    className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all p-1"
                                                    title="删除班级"
                                                >
                                                    <i className="fas fa-trash-can text-xs"></i>
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 bg-green-500/20 text-green-400 rounded-full text-[10px] sm:text-xs font-bold border border-green-500/30 shrink-0">{onlineIPs.length} 在线</span>
                        <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 bg-slate-700 text-slate-400 rounded-full text-[10px] sm:text-xs font-bold shrink-0">{seats.length} 座位</span>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end w-full sm:w-auto">
                        <div className="flex rounded-lg overflow-hidden border border-slate-600">
                            <button onClick={() => setViewMode('grid')} className={`px-2 sm:px-3 py-1.5 text-xs sm:text-sm transition-colors ${viewMode === 'grid' ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`} title="网格视图"><i className="fas fa-table-cells"></i></button>
                            <button onClick={() => setViewMode('list')} className={`px-2 sm:px-3 py-1.5 text-xs sm:text-sm transition-colors ${viewMode === 'list' ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`} title="列表视图"><i className="fas fa-list"></i></button>
                        </div>
                        <button
                            onClick={() => handlePodiumAtTopChange(!currentPodiumTop)}
                            className="hidden sm:flex items-center px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-medium transition-colors border border-slate-600"
                            title={currentPodiumTop ? '讲台在上（点击切换为下）' : '讲台在下（点击切换为上）'}
                        >
                            <i className="fas fa-chalkboard mr-1.5"></i>{currentPodiumTop ? '讲台在上' : '讲台在下'}
                        </button>
                        <button onClick={handleAutoImport} disabled={autoImporting} className="flex items-center px-2 sm:px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs sm:text-sm font-medium transition-colors" title="将当前在线学生自动添加为座位">
                            <i className={`fas ${autoImporting ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'} mr-1 sm:mr-1.5`}></i><span className="hidden sm:inline">自动导入</span><span className="sm:hidden">导入</span>
                        </button>
                        <div className="relative" ref={moreMenuRef}>
                            <button
                                onClick={() => setShowMoreMenu(!showMoreMenu)}
                                className={`flex items-center px-2 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors border border-slate-600 ${showMoreMenu ? 'bg-slate-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}
                            >
                                <i className="fas fa-ellipsis-vertical mr-1 sm:mr-1.5"></i><span className="hidden sm:inline">更多</span>
                            </button>
                            {showMoreMenu && (
                                <div className="absolute right-0 mt-2 w-48 bg-slate-800 rounded-xl shadow-xl border border-slate-700 py-2 z-50">
                                    <input ref={fileInputRef} type="file" accept=".csv,.txt,.json" className="hidden" onChange={(e) => { handleImportFile(e); setShowMoreMenu(false); }} />
                                    <button onClick={() => { fileInputRef.current && fileInputRef.current.click(); }} className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors flex items-center">
                                        <i className="fas fa-file-import w-5 mr-2 text-center"></i>导入列表 (CSV/JSON)
                                    </button>
                                    <button onClick={() => { handleExportCsv(); setShowMoreMenu(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors flex items-center">
                                        <i className="fas fa-table-list w-5 mr-2 text-center"></i>导出列表 (CSV)
                                    </button>
                                    <button onClick={() => { handleExportJson(); setShowMoreMenu(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors flex items-center">
                                        <i className="fas fa-file-export w-5 mr-2 text-center"></i>导出当前班级 (JSON)
                                    </button>
                                    <div className="h-px bg-slate-700 my-1 mx-2"></div>
                                    <button onClick={() => { handleDownloadTemplate(); setShowMoreMenu(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors flex items-center">
                                        <i className="fas fa-download w-5 mr-2 text-center"></i>下载 CSV 模板
                                    </button>
                                </div>
                            )}
                        </div>
                        <button onClick={() => setShowAddForm(v => !v)} className="flex items-center px-2 sm:px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs sm:text-sm font-medium transition-colors border border-slate-600">
                            <i className="fas fa-plus mr-1 sm:mr-1.5"></i><span className="hidden sm:inline">手动添加</span>
                        </button>
                        <button onClick={handleClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
                            <i className="fas fa-xmark text-lg"></i>
                        </button>
                    </div>
                </div>

                {showAddForm && (
                    <div className="px-3 sm:px-6 py-3 bg-slate-800/80 border-b border-slate-700 flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
                        <input value={addIp} onChange={e => setAddIp(e.target.value)} placeholder="IP 地址" className="px-2 sm:px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-xs sm:text-sm text-white placeholder-slate-500 outline-none focus:border-blue-400 w-24 sm:w-36" />
                        <input value={addName} onChange={e => setAddName(e.target.value)} placeholder="学生姓名" className="px-2 sm:px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-xs sm:text-sm text-white placeholder-slate-500 outline-none focus:border-blue-400 w-20 sm:w-32" />
                        <input value={addStudentId} onChange={e => setAddStudentId(e.target.value)} placeholder="学号" className="px-2 sm:px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-xs sm:text-sm text-white placeholder-slate-500 outline-none focus:border-blue-400 w-20 sm:w-32 hidden sm:block" />
                        <span className="text-slate-400 text-xs sm:text-sm">行</span>
                        <input type="number" min="1" value={addRow} onChange={e => setAddRow(e.target.value)} className="px-2 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-xs sm:text-sm text-white outline-none focus:border-blue-400 w-12 sm:w-16 text-center" />
                        <span className="text-slate-400 text-xs sm:text-sm">列</span>
                        <input type="number" min="1" value={addCol} onChange={e => setAddCol(e.target.value)} className="px-2 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-xs sm:text-sm text-white outline-none focus:border-blue-400 w-12 sm:w-16 text-center" />
                        <button onClick={handleAddSeat} className="px-3 sm:px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs sm:text-sm font-bold transition-colors">添加</button>
                        <button onClick={() => setShowAddForm(false)} className="px-2 sm:px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs sm:text-sm transition-colors">取消</button>
                    </div>
                )}

                {showAddClassroom && (
                    <div className="px-6 py-3 bg-slate-800/80 border-b border-slate-700 flex items-center gap-3 shrink-0">
                        <i className="fas fa-users text-slate-400"></i>
                        <input
                            value={newClassName}
                            onChange={e => setNewClassName(e.target.value)}
                            placeholder="输入班级名称（如：高一1班）"
                            className="flex-1 px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 outline-none focus:border-blue-400"
                            autoFocus
                            onKeyDown={e => { if (e.key === 'Enter') handleCreateClassroom(); if (e.key === 'Escape') setShowAddClassroom(false); }}
                        />
                        <button onClick={handleCreateClassroom} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition-colors">创建</button>
                        <button onClick={() => setShowAddClassroom(false)} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors">取消</button>
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
                    <span className="ml-auto text-slate-600">拖拽座位可调整位置 · 点击名称可编辑姓名和学号</span>
                </div>

                {viewMode === 'grid' && currentPodiumTop && (
                    <div className="px-6 pt-4 shrink-0">
                        <div className="flex justify-center">
                            <div className="px-12 py-2 bg-slate-700 border border-slate-600 rounded-xl text-slate-400 text-sm font-bold tracking-widest">讲台</div>
                        </div>
                    </div>
                )}

                {viewMode === 'list' ? renderList() : (
                    <div className="flex-1 overflow-auto p-3 sm:p-6">
                        <div className="flex flex-col gap-3 items-center min-w-max">
                            <div className="flex gap-2 sm:gap-3">
                                <div className="w-6 shrink-0"></div>
                                {Array.from({ length: gridCols + 1 }, (_, i) => (
                                    <div key={i} className="min-w-[80px] sm:min-w-[100px] text-center text-[10px] sm:text-xs text-slate-600 font-mono">{i + 1}</div>
                                ))}
                            </div>
                            {renderGrid()}
                        </div>
                    </div>
                )}

                {viewMode === 'grid' && !currentPodiumTop && (
                    <div className="px-6 pb-5 shrink-0">
                        <div className="flex justify-center">
                            <div className="px-12 py-2 bg-slate-700 border border-slate-600 rounded-xl text-slate-400 text-sm font-bold tracking-widest">讲台</div>
                        </div>
                    </div>
                )}
            </div>

            {editingId && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) setEditingId(null); }}>
                    <div className="bg-slate-800 rounded-xl p-6 w-96 border border-slate-700 shadow-2xl">
                        <h3 className="text-lg font-bold text-white mb-4">编辑座位信息</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">学生姓名</label>
                                <input
                                    autoFocus
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 outline-none focus:border-blue-400"
                                    placeholder="输入学生姓名"
                                    onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingId(null); }}
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">学号</label>
                                <input
                                    value={editStudentId}
                                    onChange={e => setEditStudentId(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 outline-none focus:border-blue-400"
                                    placeholder="输入学号（可选）"
                                    onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingId(null); }}
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-6">
                            <button onClick={() => setEditingId(null)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors">取消</button>
                            <button onClick={commitEdit} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition-colors">保存</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
