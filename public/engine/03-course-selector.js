// ========================================================
// 课程选择界面组件（仅教师端）- 类似文件资源管理器
// ========================================================

// 文件夹树节点组件
function FolderTreeNode({ folders, parentId, currentFolder, dragOverFolder, onFolderClick, onContextMenu, onDragOver, onDragLeave, onDrop, courses, depth, expandedFolders, onToggleExpand, onDragStart }) {
    const childFolders = folders.filter(f =>
        parentId === null
            ? (f.parentId === null || f.parentId === undefined)
            : f.parentId === parentId
    );

    if (childFolders.length === 0 && (parentId === null || courses.filter(c => c.folderId === parentId).length === 0)) return null;

    return (
        <>
            {childFolders.map(folder => {
                const isExpanded = expandedFolders.has(folder.id);
                const folderCourses = courses.filter(c => c.folderId === folder.id);
                // 统计该文件夹下的所有课件（包括子文件夹中的课件）
                const getAllCoursesInFolder = (folderId) => {
                    const directCourses = courses.filter(c => c.folderId === folderId);
                    const subFolders = folders.filter(f => f.parentId === folderId);
                    let subCourses = [];
                    subFolders.forEach(sub => {
                        subCourses = subCourses.concat(getAllCoursesInFolder(sub.id));
                    });
                    return directCourses.concat(subCourses);
                };
                const totalCoursesInFolder = getAllCoursesInFolder(folder.id);
                const hasChildren = totalCoursesInFolder.length > 0 || folders.some(f => f.parentId === folder.id);

                return (
                    <div key={folder.id}>
                        <div
                            onClick={() => onFolderClick(folder.id)}
                            onContextMenu={(e) => onContextMenu(e, folder, 'folder')}
                            onDragOver={(e) => onDragOver(e, folder)}
                            onDragLeave={onDragLeave}
                            onDrop={(e) => onDrop(e, folder)}
                            className={`flex items-center px-3 py-2 rounded-lg cursor-pointer transition-colors ${depth > 0 ? 'ml-4' : ''} ${
                                currentFolder === folder.id
                                    ? 'bg-blue-500/20 text-blue-300'
                                    : dragOverFolder === folder.id
                                        ? 'bg-amber-500/20 border border-amber-500/30'
                                        : 'text-slate-300 hover:bg-slate-700'
                            }`}
                        >
                            {/* 展开/折叠图标 */}
                            {hasChildren && (
                                <span
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onToggleExpand(folder.id);
                                    }}
                                    className={`mr-1.5 w-4 text-center ${isExpanded ? 'text-slate-400' : 'text-slate-600'}`}
                                >
                                    <i className={`fas fa-chevron-right text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}></i>
                                </span>
                            )}
                            {!hasChildren && <span className="mr-1.5 w-4"></span>}
                            <i className="fas fa-folder text-amber-400 mr-2 text-sm"></i>
                            <span className="text-sm truncate flex-1">{folder.name}</span>
                            <span className="text-xs text-slate-500 ml-2">
                                {totalCoursesInFolder.length}
                            </span>
                        </div>
                        {/* 显示该文件夹下的课件和子文件夹（仅当展开时） */}
                        {isExpanded && (
                            <>
                                {folderCourses.map(course => (
                                    <div
                                        key={course.id}
                                        onClick={() => onFolderClick(folder.id)}
                                        onContextMenu={(e) => onContextMenu(e, course, 'course')}
                                        onDragStart={(e) => onDragStart(e, course, 'course')}
                                        draggable
                                        className="flex items-center px-3 py-1.5 rounded cursor-pointer transition-colors ml-4 text-slate-400 hover:bg-slate-700 hover:text-slate-300"
                                    >
                                        <i className="fas fa-file-alt text-blue-400 mr-2 text-xs"></i>
                                        <span className="text-xs truncate flex-1">{course.title}</span>
                                    </div>
                                ))}
                                <FolderTreeNode
                                    folders={folders}
                                    parentId={folder.id}
                                    currentFolder={currentFolder}
                                    dragOverFolder={dragOverFolder}
                                    onFolderClick={onFolderClick}
                                    onContextMenu={onContextMenu}
                                    onDragOver={onDragOver}
                                    onDragLeave={onDragLeave}
                                    onDrop={onDrop}
                                    courses={courses}
                                    depth={depth + 1}
                                    expandedFolders={expandedFolders}
                                    onToggleExpand={onToggleExpand}
                                    onDragStart={onDragStart}
                                />
                            </>
                        )}
                    </div>
                );
            })}
            {/* 根级别的课件（不在任何文件夹中） */}
            {parentId === null && courses.filter(c => !c.folderId || c.folderId === null || c.folderId === undefined).map(course => (
                <div
                    key={course.id}
                    onClick={() => onFolderClick(null)}
                    onContextMenu={(e) => onContextMenu(e, course, 'course')}
                    onDragStart={(e) => onDragStart(e, course, 'course')}
                    draggable
                    className="flex items-center px-3 py-1.5 rounded cursor-pointer transition-colors text-slate-400 hover:bg-slate-700 hover:text-slate-300"
                >
                    <i className="fas fa-file-alt text-blue-400 mr-2 text-xs"></i>
                    <span className="text-xs truncate flex-1">{course.title}</span>
                </div>
            ))}
        </>
    );
}

function CourseSelector({ courses, currentCourseId, onSelectCourse, onRefresh, socket, settings, onSettingsChange, studentCount, studentLog }) {
    const [selectedId, setSelectedId] = useState(currentCourseId);
    const [showGuide, setShowGuide] = useState(false);
    const [guideContent, setGuideContent] = useState('');
    const [showSettings, setShowSettings] = useState(false);
    const [showClassroomView, setShowClassroomView] = useState(false);
    const [showSubmissionsBrowser, setShowSubmissionsBrowser] = useState(false);
    const [courseData, setCourseData] = useState({ courses: [], folders: [] });
    const [viewMode, setViewMode] = useState('grid');
    const [currentFolder, setCurrentFolder] = useState(null);
    const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [showRenameDialog, setShowRenameDialog] = useState(false);
    const [renameTarget, setRenameTarget] = useState(null);
    const [renameValue, setRenameValue] = useState('');
    const [contextMenu, setContextMenu] = useState(null);
    const [draggedItem, setDraggedItem] = useState(null);
    const [dragOverFolder, setDragOverFolder] = useState(null);
    const [expandedFolders, setExpandedFolders] = useState(new Set());

    useEffect(() => {
        if (Array.isArray(courses)) {
            setCourseData({ courses, folders: [] });
        } else if (courses && courses.courses && courses.folders) {
            setCourseData({ courses: courses.courses, folders: courses.folders });
        } else {
            setCourseData({ courses: [], folders: [] });
        }
    }, [courses]);

    const handleSelect = (courseId) => { setSelectedId(courseId); };

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

    const handleDeleteCourse = async (courseId) => {
        if (!confirm(`确定要删除课程 "${courseId}" 吗？此操作不可恢复！`)) {
            return;
        }
        try {
            const res = await fetch('/api/delete-course', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ courseId })
            });
            const result = await res.json();
            if (result.success) {
                onRefresh();
                if (result.courses) {
                    if (Array.isArray(result.courses)) {
                        setCourseData({ courses: result.courses, folders: courseData.folders });
                    } else if (result.courses && result.folders) {
                        setCourseData({ courses: result.courses, folders: result.folders });
                    }
                }
            } else {
                alert('删除失败：' + (result.error || '未知错误'));
            }
        } catch (err) {
            alert('删除失败：网络错误');
        }
    };

    const handleRenameFolder = async (folderId, newName) => {
        // 前端验证：检查是否已存在同名文件夹（排除自己）
        const folderToRename = courseData.folders.find(f => f.id === folderId);
        if (folderToRename) {
            const existingFolder = courseData.folders.find(f =>
                f.id !== folderId &&
                f.name === newName &&
                f.parentId === folderToRename.parentId
            );

            if (existingFolder) {
                alert(`文件夹 "${newName}" 已存在，请使用其他名称`);
                return false;
            }
        }

        try {
            const res = await fetch(`/api/course-folders/${folderId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName })
            });
            const result = await res.json();
            if (result.success) {
                if (result.courses) {
                    if (Array.isArray(result.courses)) {
                        setCourseData({ courses: result.courses, folders: result.folders || [] });
                    } else if (result.courses && result.folders) {
                        setCourseData({ courses: result.courses, folders: result.folders });
                    }
                }
                return true;
            } else {
                alert('重命名文件夹失败：' + (result.error || '未知错误'));
                return false;
            }
        } catch (err) {
            alert('重命名文件夹失败：网络错误');
            return false;
        }
    };

    const handleCreateFolder = async (name) => {
        // 前端验证：检查是否已存在同名文件夹
        const existingFolder = courseData.folders.find(f =>
            f.name === name &&
            (currentFolder === null
                ? (f.parentId === null || f.parentId === undefined)
                : f.parentId === currentFolder)
        );

        if (existingFolder) {
            alert(`文件夹 "${name}" 已存在，请使用其他名称`);
            return false;
        }

        try {
            const res = await fetch('/api/course-folders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, parentId: currentFolder })
            });
            const result = await res.json();
            if (result.success) {
                // 服务器返回的响应格式: { success: true, folder: {...}, courses: [...], folders: [...] }
                if (result.courses) {
                    if (Array.isArray(result.courses)) {
                        setCourseData({ courses: result.courses, folders: result.folders || [] });
                    } else if (result.courses && result.folders) {
                        setCourseData({ courses: result.courses, folders: result.folders });
                    }
                } else if (result.folder) {
                    // 如果只返回了新创建的文件夹，手动更新本地状态
                    setCourseData(prev => ({
                        courses: prev.courses,
                        folders: [...prev.folders, result.folder]
                    }));
                }
                return true;
            } else {
                alert('创建文件夹失败：' + (result.error || '未知错误'));
                return false;
            }
        } catch (err) {
            alert('创建文件夹失败：网络错误');
            return false;
        }
    };

    const handleDeleteFolder = async (folderId) => {
        const folder = courseData.folders.find(f => f.id === folderId);
        const coursesInFolder = courseData.courses.filter(c => c.folderId === folderId);
        const msg = coursesInFolder.length > 0
            ? `确定要删除文件夹 "${folder?.name}" 吗？\n该文件夹中有 ${coursesInFolder.length} 个课件，删除后这些课件将移出文件夹。`
            : `确定要删除文件夹 "${folder?.name}" 吗？`;

        if (!confirm(msg)) {
            return false;
        }

        try {
            const res = await fetch(`/api/course-folders/${folderId}`, {
                method: 'DELETE'
            });
            const result = await res.json();
            if (result.success) {
                if (result.courses) {
                    if (Array.isArray(result.courses)) {
                        setCourseData({ courses: result.courses, folders: result.folders || [] });
                    } else if (result.courses && result.folders) {
                        setCourseData({ courses: result.courses, folders: result.folders });
                    }
                }
                return true;
            } else {
                alert('删除文件夹失败：' + (result.error || '未知错误'));
                return false;
            }
        } catch (err) {
            alert('删除文件夹失败：网络错误');
            return false;
        }
    };

    const handleMoveCourseToFolder = async (courseId, folderId) => {
        try {
            const res = await fetch(`/api/course-folders/${folderId || 'null'}/courses/${courseId}`, {
                method: 'PUT'
            });
            const result = await res.json();
            if (result.success) {
                if (result.courses) {
                    if (Array.isArray(result.courses)) {
                        setCourseData({ courses: result.courses, folders: result.folders || [] });
                    } else if (result.courses && result.folders) {
                        setCourseData({ courses: result.courses, folders: result.folders });
                    }
                }
                return true;
            } else {
                alert('移动课件失败：' + (result.error || '未知错误'));
                return false;
            }
        } catch (err) {
            alert('移动课件失败：网络错误');
            return false;
        }
    };

    const handleMoveFolder = async (folderId, targetFolderId) => {
        try {
            const res = await fetch(`/api/course-folders/${folderId}/move`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetFolderId: targetFolderId || 'null' })
            });
            const result = await res.json();
            if (result.success) {
                if (result.courses) {
                    if (Array.isArray(result.courses)) {
                        setCourseData({ courses: result.courses, folders: result.folders || [] });
                    } else if (result.courses && result.folders) {
                        setCourseData({ courses: result.courses, folders: result.folders });
                    }
                }
                return true;
            } else {
                alert('移动文件夹失败：' + (result.error || '未知错误'));
                return false;
            }
        } catch (err) {
            alert('移动文件夹失败：网络错误');
            return false;
        }
    };

    const getBreadcrumbs = () => {
        if (!currentFolder) return [{ id: null, name: '课件库' }];

        // 构建文件夹路径
        const breadcrumbs = [{ id: null, name: '课件库' }];
        const buildPath = (folderId) => {
            const folder = courseData.folders.find(f => f.id === folderId);
            if (!folder) return;
            if (folder.parentId) {
                buildPath(folder.parentId);
            }
            breadcrumbs.push({ id: folder.id, name: folder.name });
        };

        buildPath(currentFolder);
        return breadcrumbs;
    };

    // 获取当前文件夹及其子文件夹
    const getSubFolderIds = (parentId) => {
        const subFolders = courseData.folders.filter(f => f.parentId === parentId);
        let ids = subFolders.map(f => f.id);
        subFolders.forEach(sub => {
            ids = ids.concat(getSubFolderIds(sub.id));
        });
        return ids;
    };

    const folderItems = courseData.folders.filter(f =>
        currentFolder === null
            ? (f.parentId === null || f.parentId === undefined)
            : f.parentId === currentFolder
    );
    const courseItems = courseData.courses.filter(c =>
        currentFolder === null
            ? (c.folderId === null || c.folderId === undefined)
            : c.folderId === currentFolder
    );

    const handleDoubleClick = (item, type) => {
        if (type === 'folder') {
            setCurrentFolder(item.id);
        }
    };

    const handleNewFolder = async () => {
        if (!newFolderName.trim()) return;
        const success = await handleCreateFolder(newFolderName);
        if (success) {
            setNewFolderName('');
            setShowNewFolderDialog(false);
            onRefresh();
        }
    };

    const handleRename = async () => {
        if (!renameValue.trim() || !renameTarget) return;
        const success = await handleRenameFolder(renameTarget.id, renameValue);
        if (success) {
            setRenameValue('');
            setRenameTarget(null);
            setShowRenameDialog(false);
            onRefresh();
        }
    };

    const handleContextMenu = (e, item, type) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            item,
            type
        });
    };

    const handleDragStart = (e, item, type) => {
        e.dataTransfer.effectAllowed = 'move';
        setDraggedItem({ item, type });
        e.dataTransfer.setData('text/plain', JSON.stringify({ id: item.id, type }));
    };

    const handleDragOver = (e, folder) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverFolder(folder.id);
    };

    const handleDragLeave = () => {
        setDragOverFolder(null);
    };

    const handleDrop = async (e, targetFolder) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverFolder(null);

        if (!draggedItem) return;

        // 防止将文件夹拖拽到自己的子文件夹中
        if (draggedItem.type === 'folder') {
            const subFolderIds = getSubFolderIds(draggedItem.item.id);
            if (subFolderIds.includes(targetFolder.id)) {
                alert('不能将文件夹移动到其子文件夹中');
                setDraggedItem(null);
                return;
            }
        }

        // 防止拖拽到自己身上
        if (draggedItem.item.id === targetFolder.id) {
            setDraggedItem(null);
            return;
        }

        let success = false;
        if (draggedItem.type === 'course') {
            success = await handleMoveCourseToFolder(draggedItem.item.id, targetFolder.id);
        } else if (draggedItem.type === 'folder') {
            success = await handleMoveFolder(draggedItem.item.id, targetFolder.id);
        }

        if (success) {
            onRefresh();
        }
        setDraggedItem(null);
    };

    const handleToggleExpand = (folderId) => {
        setExpandedFolders(prev => {
            const newSet = new Set(prev);
            if (newSet.has(folderId)) {
                newSet.delete(folderId);
            } else {
                newSet.add(folderId);
            }
            return newSet;
        });
    };

    // 当选中文件夹时，自动展开该文件夹及其所有父文件夹
    useEffect(() => {
        if (currentFolder) {
            const toExpand = new Set();
            let current = currentFolder;
            while (current) {
                toExpand.add(current);
                const folder = courseData.folders.find(f => f.id === current);
                current = folder?.parentId;
            }
            setExpandedFolders(toExpand);
        }
    }, [currentFolder, courseData.folders]);

    useEffect(() => {
        const handleClickOutside = () => setContextMenu(null);
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    return (
        <div className="flex flex-col h-screen bg-slate-900 text-white overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700 shrink-0" style={{WebkitAppRegion:'drag'}}>
                <div className="flex items-center space-x-2">
                    <i className="fas fa-chalkboard-teacher text-blue-400 text-xl"></i>
                    <h1 className="text-xl font-bold">教师控制台</h1>
                </div>
                <div className="flex items-center space-x-2" style={{WebkitAppRegion:'no-drag'}}>
                    <button
                        onClick={() => setShowClassroomView(true)}
                        className="px-3 py-1.5 bg-purple-500/20 text-purple-300 rounded-full text-xs font-bold border border-purple-500/30 flex items-center hover:bg-purple-500/30 transition-colors"
                        title="点击查看机房视图"
                    >
                        <span className="relative flex h-2 w-2 mr-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                        </span>
                        在线学生: {studentCount}
                    </button>
                    <button
                        onClick={() => setShowSettings(v => !v)}
                        className="flex items-center px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg border border-slate-600 transition-colors text-xs"
                        title="课堂设置"
                    >
                        <i className="fas fa-gear text-sm"></i>
                    </button>
                    <span className="px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-full text-xs font-bold border border-blue-500/30">
                        老师端 (主控)
                    </span>
                    <WindowControls />
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* 左侧树形视图 */}
                <div className="w-64 bg-slate-800/50 border-r border-slate-700 overflow-y-auto shrink-0">
                    <div className="p-3">
                        <div className="flex items-center justify-between mb-3 px-2">
                            <span className="text-slate-400 text-xs font-medium">文件夹</span>
                        </div>
                        <div className="space-y-1">
                            <div
                                onClick={() => setCurrentFolder(null)}
                                className={`flex items-center px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                                    !currentFolder
                                        ? 'bg-blue-500/20 text-blue-300'
                                        : 'text-slate-300 hover:bg-slate-700'
                                }`}
                            >
                                <i className="fas fa-home mr-2 text-sm"></i>
                                <span className="text-sm">课件库</span>
                            </div>
                            <FolderTreeNode
                                folders={courseData.folders}
                                parentId={null}
                                currentFolder={currentFolder}
                                dragOverFolder={dragOverFolder}
                                onFolderClick={setCurrentFolder}
                                onContextMenu={handleContextMenu}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                courses={courseData.courses}
                                depth={0}
                                expandedFolders={expandedFolders}
                                onToggleExpand={handleToggleExpand}
                                onDragStart={handleDragStart}
                            />
                        </div>
                    </div>
                </div>

                {/* 右侧主视图 */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* 工具栏 */}
                    <div className="flex items-center justify-between px-4 py-2 bg-slate-800/30 border-b border-slate-700 shrink-0">
                        <div className="flex items-center space-x-2">
                            <button
                                onClick={() => setCurrentFolder(null)}
                                disabled={!currentFolder}
                                className={`flex items-center px-3 py-1.5 rounded text-sm transition-colors ${
                                    currentFolder ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 cursor-not-allowed'
                                }`}
                            >
                                <i className="fas fa-arrow-left mr-1.5"></i>返回
                            </button>
                            <div className="h-4 w-px bg-slate-600 mx-2"></div>
                            <button
                                onClick={() => setSelectedId(null)}
                                className="flex items-center px-3 py-1.5 rounded text-slate-300 hover:bg-slate-700 text-sm transition-colors"
                            >
                                <i className="fas fa-folder-open mr-1.5"></i>课件选择
                            </button>
                        </div>
                        <div className="flex items-center space-x-2">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-2 rounded transition-colors ${viewMode === 'grid' ? 'bg-blue-500 text-white' : 'text-slate-400 hover:bg-slate-700'}`}
                                title="大图标视图"
                            >
                                <i className="fas fa-th-large"></i>
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`p-2 rounded transition-colors ${viewMode === 'list' ? 'bg-blue-500 text-white' : 'text-slate-400 hover:bg-slate-700'}`}
                                title="详细列表视图"
                            >
                                <i className="fas fa-list"></i>
                            </button>
                            <div className="h-4 w-px bg-slate-600 mx-2"></div>
                            <button
                                onClick={() => setShowNewFolderDialog(true)}
                                className="flex items-center px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-sm font-medium transition-colors"
                            >
                                <i className="fas fa-folder-plus mr-1.5"></i>新建文件夹
                            </button>
                            <button onClick={onRefresh} className="flex items-center px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-sm transition-colors">
                                <i className="fas fa-sync-alt mr-1.5"></i>刷新
                            </button>
                            <button onClick={handleDownloadSkill} className="flex items-center px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium transition-colors" title="下载 AI 课件生成 Skill 文件">
                                <i className="fas fa-download mr-1.5"></i>下载 Skill
                            </button>
                            <button onClick={handleOpenGuide} className="flex items-center px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-sm transition-colors" title="查看课件开发教程">
                                <i className="fas fa-book-open mr-1.5"></i>教程
                            </button>
                            {window.electronAPI?.importCourse && (
                                <button onClick={handleImportCourse} className="flex items-center px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded text-sm font-medium transition-colors">
                                    <i className="fas fa-file-import mr-1.5"></i>导入
                                </button>
                            )}
                        </div>
                    </div>

                    {/* 地址栏 */}
                    <div className="px-4 py-2 bg-slate-800/30 border-b border-slate-700 flex items-center shrink-0">
                        {getBreadcrumbs().map((crumb, idx) => (
                            <React.Fragment key={crumb.id}>
                                {idx > 0 && <i className="fas fa-chevron-right text-slate-600 text-xs mx-2"></i>}
                                <button
                                    onClick={() => setCurrentFolder(crumb.id)}
                                    className="text-sm text-slate-300 hover:text-blue-400 transition-colors"
                                >
                                    {crumb.name}
                                </button>
                            </React.Fragment>
                        ))}
                    </div>

                    {/* 文件列表 */}
                    <div className="flex-1 overflow-y-auto p-4">
                        {viewMode === 'grid' ? (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {folderItems.map(folder => (
                                    <div
                                        key={folder.id}
                                        draggable
                                        onDoubleClick={() => handleDoubleClick(folder, 'folder')}
                                        onContextMenu={(e) => handleContextMenu(e, folder, 'folder')}
                                        onDragStart={(e) => handleDragStart(e, folder, 'folder')}
                                        onDragOver={(e) => handleDragOver(e, folder)}
                                        onDragLeave={handleDragLeave}
                                        onDrop={(e) => handleDrop(e, folder)}
                                        className={`relative flex flex-col items-center p-4 rounded-xl border-2 cursor-pointer transition-all ${
                                            dragOverFolder === folder.id
                                                ? 'bg-amber-500/20 border-amber-500/30'
                                                : draggedItem?.item?.id === folder.id
                                                    ? 'opacity-50'
                                                    : 'bg-slate-800/50 border-slate-700 hover:border-slate-500 hover:bg-slate-800'
                                        }`}
                                    >
                                        <div className="w-16 h-16 bg-amber-500/20 rounded-xl flex items-center justify-center text-3xl mb-3 border border-amber-500/30">
                                            <i className="fas fa-folder text-amber-400"></i>
                                        </div>
                                        <span className="text-white text-sm text-center font-medium truncate w-full">{folder.name}</span>
                                        <span className="text-slate-500 text-xs mt-1">
                                            {courseData.courses.filter(c => c.folderId === folder.id).length +
                                             courseData.folders.filter(f => f.parentId === folder.id).reduce((sum, f) =>
                                                 sum + courseData.courses.filter(c => c.folderId === f.id).length, 0)} 项
                                        </span>
                                    </div>
                                ))}
                                {courseItems.map(course => (
                                    <div
                                        key={course.id}
                                        draggable
                                        onClick={() => handleSelect(course.id)}
                                        onContextMenu={(e) => handleContextMenu(e, course, 'course')}
                                        onDragStart={(e) => handleDragStart(e, course, 'course')}
                                        className={`relative flex flex-col items-center p-4 rounded-xl border-2 cursor-pointer transition-all ${
                                            selectedId === course.id
                                                ? 'bg-blue-500/20 border-blue-500'
                                                : draggedItem?.item?.id === course.id
                                                    ? 'opacity-50'
                                                    : 'bg-slate-800/50 border-slate-700 hover:border-slate-500 hover:bg-slate-800'
                                        }`}
                                    >
                                        <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${course.color} flex items-center justify-center text-3xl mb-3 shadow-lg`}>
                                            {course.icon}
                                        </div>
                                        <span className="text-white text-sm text-center font-medium truncate w-full">{course.title}</span>
                                        <span className="text-slate-500 text-xs mt-1 truncate w-full">{course.file}</span>
                                        {selectedId === course.id && (
                                            <div className="absolute top-2 right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                                                <i className="fas fa-check text-white text-xs"></i>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {/* 表头 */}
                                <div className="flex items-center px-3 py-2 bg-slate-800 rounded-t-lg border-b border-slate-700 text-xs text-slate-400 font-medium">
                                    <div className="w-10"></div>
                                    <div className="flex-1">名称</div>
                                    <div className="w-32">类型</div>
                                    <div className="w-48">文件名</div>
                                </div>
                                {/* 文件夹行 */}
                                {folderItems.map(folder => (
                                    <div
                                        key={folder.id}
                                        draggable
                                        onDoubleClick={() => handleDoubleClick(folder, 'folder')}
                                        onContextMenu={(e) => handleContextMenu(e, folder, 'folder')}
                                        onDragStart={(e) => handleDragStart(e, folder, 'folder')}
                                        onDragOver={(e) => handleDragOver(e, folder)}
                                        onDragLeave={handleDragLeave}
                                        onDrop={(e) => handleDrop(e, folder)}
                                        className={`relative flex items-center px-3 py-3 rounded-lg cursor-pointer transition-colors ${
                                            dragOverFolder === folder.id
                                                ? 'bg-amber-500/20 border border-amber-500/30'
                                                : draggedItem?.item?.id === folder.id
                                                    ? 'opacity-50'
                                                    : 'bg-slate-800/30 hover:bg-slate-800'
                                        }`}
                                    >
                                        <div className="w-10">
                                            <i className="fas fa-folder text-amber-400 text-xl"></i>
                                        </div>
                                        <div className="flex-1 text-white text-sm truncate">{folder.name}</div>
                                        <div className="w-32 text-slate-400 text-sm">文件夹</div>
                                        <div className="w-48 text-slate-500 text-xs truncate">-</div>
                                    </div>
                                ))}
                                {/* 课件行 */}
                                {courseItems.map(course => (
                                    <div
                                        key={course.id}
                                        draggable
                                        onClick={() => handleSelect(course.id)}
                                        onContextMenu={(e) => handleContextMenu(e, course, 'course')}
                                        onDragStart={(e) => handleDragStart(e, course, 'course')}
                                        className={`relative flex items-center px-3 py-3 rounded-lg cursor-pointer transition-colors ${
                                            selectedId === course.id
                                                ? 'bg-blue-500/20'
                                                : draggedItem?.item?.id === course.id
                                                    ? 'opacity-50'
                                                    : 'bg-slate-800/30 hover:bg-slate-800'
                                        }`}
                                    >
                                        <div className="w-10">
                                            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${course.color} flex items-center justify-center`}>
                                                {course.icon}
                                            </div>
                                        </div>
                                        <div className="flex-1 text-white text-sm truncate">{course.title}</div>
                                        <div className="w-32 text-slate-400 text-sm">课件</div>
                                        <div className="w-48 text-slate-500 text-xs truncate">{course.file}</div>
                                        {selectedId === course.id && (
                                            <div className="absolute top-4 right-4 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                                                <i className="fas fa-check text-white text-xs"></i>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {folderItems.length === 0 && courseItems.length === 0 && (
                            <div className="text-center py-12 bg-slate-800/30 rounded-xl border border-slate-700">
                                <i className="fas fa-folder-open text-4xl text-slate-600 mb-3"></i>
                                <p className="text-slate-500 text-sm">此文件夹为空</p>
                                <button
                                    onClick={() => setShowNewFolderDialog(true)}
                                    className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
                                >
                                    <i className="fas fa-folder-plus mr-1.5"></i>新建文件夹
                                </button>
                            </div>
                        )}
                    </div>

                    {/* 状态栏 */}
                    <div className="px-4 py-2 bg-slate-800 border-t border-slate-700 text-xs text-slate-500 flex items-center justify-between shrink-0">
                        <span>{folderItems.length} 个文件夹, {courseItems.length} 个课件</span>
                        {selectedId && (
                            <span className="text-slate-400">已选择: {courseData.courses.find(c => c.id === selectedId)?.title}</span>
                        )}
                    </div>

                    {/* 底部开始按钮 */}
                    <div className="px-4 py-3 bg-slate-800 border-t border-slate-700 flex justify-between items-center shrink-0">
                        <div className="flex items-center space-x-2">
                            <span className="text-slate-400 text-sm">共 {courseData.courses.length} 个课件</span>
                        </div>
                        <button
                            onClick={handleStartCourse}
                            disabled={!selectedId}
                            className={`flex items-center px-8 py-3 rounded-xl font-bold text-lg transition-all ${
                                selectedId ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg hover:shadow-blue-500/30' : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                            }`}
                        >
                            <i className="fas fa-play mr-3"></i>开始授课
                        </button>
                    </div>
                </div>
            </div>

            {/* 新建文件夹对话框 */}
            {showNewFolderDialog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-60">
                    <div className="bg-slate-800 rounded-xl p-6 w-96 border border-slate-700 shadow-2xl">
                        <h3 className="text-white font-bold text-lg mb-4">新建文件夹</h3>
                        <input
                            type="text"
                            value={newFolderName}
                            onChange={e => setNewFolderName(e.target.value)}
                            placeholder="输入文件夹名称"
                            className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 outline-none focus:border-blue-400 mb-4"
                            autoFocus
                            onKeyDown={e => { if (e.key === 'Enter') handleNewFolder(); if (e.key === 'Escape') setShowNewFolderDialog(false); }}
                        />
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowNewFolderDialog(false)}
                                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleNewFolder}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
                            >
                                创建
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 右键菜单 */}
            {contextMenu && (
                <div
                    className="fixed bg-slate-800 rounded-lg border border-slate-700 shadow-xl py-1 z-70 min-w-[150px]"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                    {contextMenu.type === 'folder' && (
                        <>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setRenameTarget(contextMenu.item);
                                    setRenameValue(contextMenu.item.name);
                                    setContextMenu(null);
                                    setShowRenameDialog(true);
                                }}
                                className="w-full px-4 py-2 text-left text-slate-300 hover:bg-slate-700 text-sm flex items-center"
                            >
                                <i className="fas fa-pen w-5 text-slate-400"></i>重命名
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteFolder(contextMenu.item.id);
                                    setContextMenu(null);
                                }}
                                className="w-full px-4 py-2 text-left text-red-400 hover:bg-slate-700 text-sm flex items-center"
                            >
                                <i className="fas fa-trash w-5"></i>删除
                            </button>
                        </>
                    )}
                    {contextMenu.type === 'course' && (
                        <>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedId(contextMenu.item.id);
                                    setContextMenu(null);
                                    setShowSubmissionsBrowser(true);
                                }}
                                className="w-full px-4 py-2 text-left text-green-400 hover:bg-slate-700 text-sm flex items-center"
                            >
                                <i className="fas fa-folder-open w-5"></i>查看学生提交
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteCourse(contextMenu.item.id);
                                    setContextMenu(null);
                                }}
                                className="w-full px-4 py-2 text-left text-red-400 hover:bg-slate-700 text-sm flex items-center"
                            >
                                <i className="fas fa-trash w-5"></i>删除
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* 重命名对话框 */}
            {showRenameDialog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-60" onClick={() => setShowRenameDialog(false)}>
                    <div className="bg-slate-800 rounded-xl p-6 w-96 border border-slate-700 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-white font-bold text-lg mb-4">重命名</h3>
                        <input
                            type="text"
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            placeholder="输入新名称"
                            className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 outline-none focus:border-blue-400 mb-4"
                            autoFocus
                            onKeyDown={e => {
                                if (e.key === 'Enter') {
                                    handleRename();
                                }
                                if (e.key === 'Escape') setShowRenameDialog(false);
                            }}
                        />
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowRenameDialog(false)}
                                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleRename}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
                            >
                                确定
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showSettings && (
                <SettingsPanel settings={settings} onSettingsChange={onSettingsChange} socket={socket} onClose={() => setShowSettings(false)} zIndex="z-50" />
            )}

            {showGuide && (
                <div className="fixed inset-0 z-50 flex" onClick={() => setShowGuide(false)}>
                    <div className="ml-auto w-full max-w-2xl h-full bg-white shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 bg-slate-800 border-b border-slate-700 shrink-0">
                            <h3 className="text-white font-bold text-lg flex items-center">
                                <i className="fas fa-book-open mr-2 text-green-400"></i>课件开发教程
                            </h3>
                            <div className="flex items-center space-x-2">
                                <button onClick={handleDownloadSkill} className="flex items-center px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors">
                                    <i className="fas fa-download mr-1.5"></i>下载 Skill
                                </button>
                                <button onClick={() => setShowGuide(false)} className="text-slate-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-700 transition-colors">
                                    <i className="fas fa-xmark text-xl"></i>
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 text-slate-800">
                            <div
                                className="markdown-body text-sm leading-relaxed"
                                dangerouslySetInnerHTML={{ __html: window.marked ? window.marked.parse(guideContent) : guideContent }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {showClassroomView && (
                <ClassroomView
                    onClose={() => setShowClassroomView(false)}
                    socket={socket}
                    studentLog={studentLog}
                    podiumAtTop={settings?.podiumAtTop}
                    onPodiumAtTopChange={(v) => onSettingsChange && onSettingsChange('podiumAtTop', !!v)}
                />
            )}

            {showSubmissionsBrowser && (
                <window.SubmissionsBrowser
                    courses={courseData}
                    selectedCourseId={selectedId}
                    onClose={() => setShowSubmissionsBrowser(false)}
                    socket={socket}
                />
            )}
        </div>
    );
}








