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

const normalizeCourseCatalog = (catalog) => {
    if (Array.isArray(catalog)) {
        return { courses: catalog, folders: [] };
    }
    if (catalog && Array.isArray(catalog.courses)) {
        return {
            courses: catalog.courses,
            folders: Array.isArray(catalog.folders) ? catalog.folders : []
        };
    }
    return { courses: [], folders: [] };
};

function CourseSelector({ courses, currentCourseId, onSelectCourse, onRefresh, socket, settings, onSettingsChange, studentCount, studentLog }) {
    const [selectedId, setSelectedId] = useState(currentCourseId);
    const [showGuide, setShowGuide] = useState(false);
    const [guideContent, setGuideContent] = useState('');
    const [showSubmissionsBrowser, setShowSubmissionsBrowser] = useState(false);
    const [courseData, setCourseData] = useState({ courses: [], folders: [] });
    const [activeTab, setActiveTab] = useState('home');
    const [storageUsage, setStorageUsage] = useState(null);
    const [settingsSection, setSettingsSection] = useState('classroom');
    const [newPwd, setNewPwd] = useState('');
    const [pwdStatus, setPwdStatus] = useState(null);
    const [submissionDir, setSubmissionDir] = useState('');
    const [submissionDirStatus, setSubmissionDirStatus] = useState(null);
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
    const [exportPreview, setExportPreview] = useState(null);
    const previewFrameRef = useRef(null);
    const exportPreviewRef = useRef(null);
    const exportScaleInputId = 'course-export-scale-range';

    useEffect(() => {
        exportPreviewRef.current = exportPreview;
    }, [exportPreview]);

    useEffect(() => {
        let disposed = false;
        const next = normalizeCourseCatalog(courses);
        setCourseData(next);

        if (next.courses.length === 0) {
            fetch('/api/courses')
                .then(res => res.json())
                .then(data => {
                    if (!disposed) setCourseData(normalizeCourseCatalog(data));
                })
                .catch(() => {});
        }

        return () => { disposed = true; };
    }, [courses]);

    useEffect(() => {
        if (!exportPreview) return;

        const handleMessage = (event) => {
            if (String(event.data?.courseId ?? '') !== String(exportPreview.course?.id ?? '')) return;

            if (event.data?.kind === 'lumesync-export-preview-progress') {
                setExportPreview(prev => prev ? {
                    ...prev,
                    status: event.data?.status || prev.status,
                    error: '',
                    progress: Math.min(Math.max(Number(event.data?.progress) || 0, 0), 100),
                    progressLabel: event.data?.label || prev.progressLabel,
                    contentScale: Number(event.data?.contentScale) || prev.contentScale,
                } : prev);
            } else if (event.data?.kind === 'lumesync-export-preview-ready') {
                setExportPreview(prev => prev ? { ...prev, status: 'ready', error: '', progress: 100, progressLabel: 'Preview ready', contentScale: Number(event.data?.contentScale) || prev.contentScale } : prev);
            } else if (event.data?.kind === 'lumesync-export-preview-scale-applied') {
                setExportPreview(prev => prev ? { ...prev, status: 'ready', error: '', progress: 100, progressLabel: 'Scale updated', contentScale: Number(event.data?.contentScale) || prev.contentScale } : prev);
            } else if (event.data?.kind === 'lumesync-export-preview-generating') {
                setExportPreview(prev => prev ? { ...prev, status: 'generating', error: '', progress: Math.max(prev.progress || 0, 0), progressLabel: 'Generating PDF', contentScale: Number(event.data?.contentScale) || prev.contentScale } : prev);
            } else if (event.data?.kind === 'lumesync-export-preview-generated') {
                setExportPreview(null);
            } else if (event.data?.kind === 'lumesync-export-preview-error') {
                setExportPreview(prev => prev ? { ...prev, status: 'error', error: event.data?.error || 'Preview failed' } : prev);
            } else if (event.data?.kind === 'lumesync-export-preview-afterprint') {
                setExportPreview(null);
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [exportPreview]);

    useEffect(() => {
        if (!exportPreview) return;

        const syncFromFrame = () => {
            try {
                const frameState = previewFrameRef.current?.contentWindow?.__lumesyncExportPreviewState;
                if (!frameState) return;
                if (String(frameState.courseId ?? '') !== String(exportPreviewRef.current?.course?.id ?? '')) return;

                setExportPreview(prev => {
                    if (!prev) return prev;
                    if (frameState.status === 'generated') return null;
                    if (frameState.status === 'error') {
                        return {
                            ...prev,
                            status: 'error',
                            error: frameState.error || frameState.label || prev.error,
                            progressLabel: frameState.label || prev.progressLabel,
                        };
                    }
                    return {
                        ...prev,
                        status: frameState.status || prev.status,
                        error: '',
                        progress: Math.min(Math.max(Number(frameState.progress) || 0, 0), 100),
                        progressLabel: frameState.label || prev.progressLabel,
                        contentScale: Number(frameState.contentScale) || prev.contentScale,
                    };
                });
            } catch (_) {}
        };

        syncFromFrame();
        const timer = window.setInterval(syncFromFrame, 200);
        return () => window.clearInterval(timer);
    }, [exportPreview?.course?.id]);

    const handleSelect = (courseId) => { setSelectedId(courseId); };

    const handleStartCourse = () => {
        if (!selectedId) return;
        onSelectCourse?.(selectedId, courseData);
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

    const handleExportCourse = async (course, format) => {
        if (!course?.id) return;

        const normalizedFormat = String(format || '').toLowerCase();
        if (normalizedFormat !== 'pdf' && normalizedFormat !== 'lume') return;

        if (normalizedFormat === 'pdf') {
            const initialScale = 1;
            setExportPreview({
                course,
                status: 'loading',
                error: '',
                progress: 5,
                progressLabel: 'Initializing preview',
                contentScale: initialScale,
                previewUrl: `/export-preview.html?courseId=${encodeURIComponent(course.id)}&title=${encodeURIComponent(course.title || course.id || 'course')}&scale=${initialScale}&t=${Date.now()}`
            });
            return;
        }

        try {
            if (window.electronAPI?.exportCourse) {
                const nativeResult = await window.electronAPI.exportCourse({
                    courseFile: course.file,
                    format: normalizedFormat,
                    title: course.title
                });
                if (nativeResult?.canceled) return;
                if (nativeResult?.success) {
                    return;
                }
                // 兼容旧版教师壳：exportCourse 可能返回 null（未实现）或失败，自动回退到 HTTP 下载。
            }

            const response = await fetch(`/api/export-course/${encodeURIComponent(course.id)}?format=${encodeURIComponent(normalizedFormat)}`);
            if (!response.ok) {
                let errMsg = 'Export failed';
                try {
                    const payload = await response.json();
                    if (payload?.error) errMsg = payload.error;
                } catch (_) {}
                alert(`Export failed: ${errMsg}`);
                return;
            }

            const blob = await response.blob();
            const fallbackName = `${course.title || 'course'}.${normalizedFormat}`;
            const header = response.headers.get('Content-Disposition') || '';
            const matched = header.match(/filename\*=UTF-8''([^;]+)|filename=\"([^\"]+)\"|filename=([^;]+)/i);
            const rawName = matched?.[1] || matched?.[2] || matched?.[3] || fallbackName;
            const downloadName = decodeURIComponent(String(rawName).trim().replace(/^["']|["']$/g, ''));

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = downloadName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            alert('Export failed: network error');
        }
    };

    const handleConfirmPdfExport = () => {
        if (!previewFrameRef.current?.contentWindow || exportPreview?.status !== 'ready') return;
        previewFrameRef.current.contentWindow.postMessage(
            { kind: 'lumesync-export-preview-print' },
            '*'
        );
    };

    const handleExportScaleChange = (nextValue) => {
        const nextScale = Math.min(Math.max(Number(nextValue) || 1, 0.5), 1.5);
        setExportPreview(prev => prev ? { ...prev, contentScale: nextScale } : prev);
        if (previewFrameRef.current?.contentWindow) {
            previewFrameRef.current.contentWindow.postMessage(
                { kind: 'lumesync-export-preview-set-scale', contentScale: nextScale },
                '*'
            );
        }
    };

    const handleExportPreviewFrameLoad = () => {
        if (!previewFrameRef.current?.contentWindow || !exportPreviewRef.current?.course) return;
        previewFrameRef.current.contentWindow.postMessage(
            {
                kind: 'lumesync-export-preview-parent-ready',
                courseId: String(exportPreviewRef.current.course.id ?? ''),
            },
            '*'
        );
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

    useEffect(() => {
        let disposed = false;
        fetch('/api/storage-usage')
            .then(res => res.json())
            .then(data => {
                if (!disposed && data?.success) setStorageUsage(data);
            })
            .catch(() => {});
        return () => { disposed = true; };
    }, []);

    useEffect(() => {
        let disposed = false;
        fetch('/api/submission-config')
            .then(res => res.json())
            .then(data => {
                if (!disposed && data?.submissionsDir) setSubmissionDir(data.submissionsDir);
            })
            .catch(() => {});
        return () => { disposed = true; };
    }, []);

    const selectedCourse = courseData.courses.find(c => c.id === selectedId);
    const totalFolders = courseData.folders.length;
    const totalVisibleItems = folderItems.length + courseItems.length;
    const rootCourseCount = courseData.courses.filter(c => !c.folderId || c.folderId === null || c.folderId === undefined).length;
    const formatBytes = (bytes) => {
        const value = Number(bytes);
        if (!Number.isFinite(value) || value < 0) return '计算中';
        if (value >= 1024 ** 3) return `${(value / (1024 ** 3)).toFixed(1)} GB`;
        if (value >= 1024 ** 2) return `${(value / (1024 ** 2)).toFixed(1)} MB`;
        if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
        return `${Math.round(value)} B`;
    };
    const storageLabel = storageUsage ? formatBytes(storageUsage.bytes) : '计算中';
    const storagePercent = storageUsage ? Math.min(100, Math.max(4, Math.round((Number(storageUsage.bytes) || 0) / (1024 ** 3) * 10))) : 18;
    const pendingItems = [
        { icon: 'fa-calendar-check', color: 'text-emerald-600', bg: 'bg-emerald-50', title: '今日授课准备', detail: selectedCourse ? `已选择「${selectedCourse.title}」` : '到课件库选择课件后即可开始授课', action: selectedCourse ? '已就绪' : '去选择', onClick: () => setActiveTab('courses') },
        { icon: 'fa-user-group', color: 'text-blue-600', bg: 'bg-blue-50', title: '在线学生', detail: `${studentCount || 0} 名学生已连接`, action: '机房', onClick: () => window.__LumeSyncOpenClassroomWindow?.() },
        { icon: 'fa-folder-tree', color: 'text-amber-600', bg: 'bg-amber-50', title: '课件整理', detail: `${totalFolders} 个文件夹，${rootCourseCount} 个根目录课件`, action: '课件库', onClick: () => setActiveTab('courses') },
        { icon: 'fa-clock-rotate-left', color: 'text-violet-600', bg: 'bg-violet-50', title: '课堂日志', detail: `${studentLog?.length || 0} 条学生动态`, action: '记录' },
    ];
    const summaryStats = [
        { label: '课件总数', value: courseData.courses.length, suffix: '个', icon: 'fa-layer-group', tone: 'blue', onClick: () => setActiveTab('courses') },
        { label: '文件夹', value: totalFolders, suffix: '个', icon: 'fa-folder', tone: 'amber' },
        { label: '在线学生', value: studentCount || 0, suffix: '人', icon: 'fa-users', tone: 'emerald', onClick: () => window.__LumeSyncOpenClassroomWindow?.() },
        { label: '课堂记录', value: studentLog?.length || 0, suffix: '条', icon: 'fa-clipboard-list', tone: 'violet' },
    ];
    const quickActions = [
        { label: '开始授课', icon: 'fa-play', onClick: handleStartCourse, primary: true, disabled: !selectedId },
        { label: '导入课件', icon: 'fa-file-import', onClick: handleImportCourse, hidden: !window.electronAPI?.importCourse },
        { label: '新建文件夹', icon: 'fa-folder-plus', onClick: () => setShowNewFolderDialog(true) },
        { label: '刷新资源', icon: 'fa-arrows-rotate', onClick: onRefresh },
        { label: '课件教程', icon: 'fa-book-open', onClick: handleOpenGuide },
    ].filter(action => !action.hidden);
    const toneClasses = {
        blue: 'bg-blue-50 text-blue-600',
        amber: 'bg-amber-50 text-amber-600',
        emerald: 'bg-emerald-50 text-emerald-600',
        violet: 'bg-violet-50 text-violet-600',
    };
    const clampMonitorInterval = (value) => {
        const n = Number(value);
        if (!Number.isFinite(n)) return 1;
        const clamped = Math.min(5, Math.max(0.5, n));
        return Math.round(clamped * 2) / 2;
    };
    const monitorIntervalValue = clampMonitorInterval(settings?.monitorIntervalSec);
    const renderScaleValue = (typeof settings?.renderScale === 'number' && Number.isFinite(settings.renderScale)) ? settings.renderScale : 0.96;
    const uiScaleValue = (typeof settings?.uiScale === 'number' && Number.isFinite(settings.uiScale)) ? settings.uiScale : 1.0;
    const settingToggles = [
        { key: 'forceFullscreen', label: '强制学生全屏', desc: '授课时让学生端保持课堂专注。', icon: 'fa-expand' },
        { key: 'syncFollow', label: '学生跟随翻页', desc: '教师翻页后学生端自动同步页面。', icon: 'fa-rotate' },
        { key: 'alertJoin', label: '学生上线提醒', desc: '学生进入课堂时显示提醒。', icon: 'fa-user-plus' },
        { key: 'alertLeave', label: '学生离线提醒', desc: '学生断开连接时显示提醒。', icon: 'fa-user-minus' },
        { key: 'alertFullscreenExit', label: '退出全屏提醒', desc: '学生退出全屏时记录异常。', icon: 'fa-compress' },
        { key: 'alertTabHidden', label: '切换页面提醒', desc: '学生切换窗口或隐藏页面时提示。', icon: 'fa-eye-slash' },
        { key: 'monitorEnabled', label: '学生截图监控', desc: '按设定间隔采集学生端屏幕缩略图。', icon: 'fa-camera' },
    ];
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
    const handleChangeSubmissionDir = async (dir = submissionDir) => {
        if (!dir.trim()) return;
        try {
            const response = await fetch('/api/submission-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ submissionsDir: dir.trim() })
            });
            const result = await response.json();
            setSubmissionDirStatus(result.success ? 'ok' : 'err');
        } catch (_) {
            setSubmissionDirStatus('err');
        }
        setTimeout(() => setSubmissionDirStatus(null), 3000);
    };
    const handleSelectSubmissionDir = async () => {
        try {
            const selectedDir = await window.electronAPI?.selectSubmissionDir?.();
            if (selectedDir) {
                setSubmissionDir(selectedDir);
                await handleChangeSubmissionDir(selectedDir);
            }
        } catch (_) {
            alert('无法选择目录');
        }
    };
    const handleToggleDevTools = () => {
        try {
            if (window.electronAPI?.toggleDevTools) {
                window.electronAPI.toggleDevTools();
            } else {
                alert('当前环境不支持打开调试面板');
            }
        } catch (_) {
            alert('无法打开调试面板');
        }
    };
    const handleOpenLogDir = async () => {
        try {
            await window.electronAPI?.openLogDir?.();
        } catch (_) {
            alert('无法打开日志目录');
        }
    };

    return (
        <div className="h-full overflow-hidden relative bg-[#f6f8fc] text-slate-900 select-none">
            <div
                className="h-[72px] border-b border-slate-200/80 bg-white/92 backdrop-blur-xl flex items-center justify-between px-6 relative z-30"
                style={{WebkitAppRegion:'drag'}}
                onMouseDown={(event) => window.__LumeSyncStartWindowDrag?.(event)}
            >
                <div className="flex items-center gap-4 min-w-0">
                    <div className="h-10 w-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
                        <i className="fas fa-cubes-stacked text-lg"></i>
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-xl font-black tracking-tight text-slate-950">LumeSync 教师控制台</h1>
                        <p className="text-xs text-slate-500 mt-0.5">课件、班级与授课状态一屏掌握</p>
                    </div>
                </div>
                <div className="flex items-center gap-3" style={{WebkitAppRegion:'no-drag'}} data-window-control="true">
                    <button className="hidden min-[1120px]:flex h-11 w-[420px] items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-400 shadow-inner" title="搜索入口">
                        <i className="fas fa-magnifying-glass text-slate-400"></i>
                        <span>搜索课件、课程、班级、资源...</span>
                    </button>
                    <WindowControls />
                </div>
            </div>

            <div className="flex h-[calc(100%-72px)] overflow-hidden">
                <aside className="w-[244px] shrink-0 border-r border-slate-200/80 bg-white/86 px-4 py-5">
                    <nav className="space-y-2">
                        {[
                            ['home', '首页', 'fa-house'],
                            ['courses', '课件库', 'fa-folder-open'],
                            ['classes', '班级管理', 'fa-users'],
                            ['records', '授课记录', 'fa-clipboard-list'],
                            ['resources', '资源中心', 'fa-box-archive'],
                            ['submissions', '作业与提交', 'fa-square-check'],
                            ['settings', '设置', 'fa-gear'],
                        ].map(([tab, label, icon]) => (
                            <button
                                key={label}
                                onClick={() => {
                                    setActiveTab(tab);
                                    if (tab === 'courses') setCurrentFolder(null);
                                }}
                                className={`flex h-12 w-full items-center gap-3 rounded-2xl px-4 text-left text-sm font-bold transition-colors ${
                                    activeTab === tab ? 'bg-blue-50 text-blue-700 shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                }`}
                            >
                                <i className={`fas ${icon} w-5 text-center`}></i>
                                <span>{label}</span>
                            </button>
                        ))}
                    </nav>
                    <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between text-sm font-bold text-slate-700">
                            <span>软件占用</span>
                            <i className="fas fa-cloud text-blue-500"></i>
                        </div>
                        <div className="mt-3 h-2 rounded-full bg-slate-200 overflow-hidden">
                            <div className="h-full rounded-full bg-blue-600" style={{ width: `${storagePercent}%` }}></div>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">{storageLabel}，{storageUsage?.fileCount || 0} 个文件</p>
                    </div>
                </aside>

                <main className="flex-1 overflow-y-auto p-6">
                    {activeTab === 'home' && (
                    <>
                    <section className="grid gap-5 xl:grid-cols-[1fr_344px]">
                        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm overflow-hidden relative">
                            <div className="relative z-10 max-w-3xl">
                                <p className="text-sm font-bold text-blue-600">下午好，老师</p>
                                <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">今日课堂安排与教学数据一目了然</h2>
                                <p className="mt-3 text-sm text-slate-500">选择课件后即可开始授课，也可以先整理资源或查看学生连接状态。</p>
                            </div>
                            <div className="relative z-10 mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                {summaryStats.map(stat => (
                                    <button
                                        key={stat.label}
                                        onClick={stat.onClick}
                                        className={`rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all ${
                                            stat.onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md' : 'cursor-default'
                                        }`}
                                    >
                                        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneClasses[stat.tone]}`}>
                                            <i className={`fas ${stat.icon}`}></i>
                                        </div>
                                        <div className="mt-4 flex items-end gap-1">
                                            <span className="text-3xl font-black tracking-tight text-slate-950">{stat.value}</span>
                                            <span className="pb-1 text-sm text-slate-500">{stat.suffix}</span>
                                        </div>
                                        <p className="mt-1 text-sm text-slate-500">{stat.label}</p>
                                    </button>
                                ))}
                            </div>
                            <div className="pointer-events-none absolute right-8 top-8 hidden h-48 w-72 rounded-[32px] bg-gradient-to-br from-blue-50 via-cyan-50 to-white xl:block"></div>
                        </div>

                        <aside className="space-y-5">
                            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-black text-slate-950">近期待办</h3>
                                    <button onClick={onRefresh} className="text-xs font-bold text-blue-600 hover:text-blue-700">刷新</button>
                                </div>
                                <div className="mt-4 space-y-3">
                                    {pendingItems.map(item => (
                                        <button key={item.title} onClick={item.onClick} className={`flex w-full items-center gap-3 rounded-2xl p-2 text-left transition-colors ${item.onClick ? 'hover:bg-slate-50' : 'cursor-default'}`}>
                                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.bg} ${item.color}`}>
                                                <i className={`fas ${item.icon}`}></i>
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-bold text-slate-800">{item.title}</p>
                                                <p className="truncate text-xs text-slate-500">{item.detail}</p>
                                            </div>
                                            <span className="text-xs font-bold text-blue-600">{item.action}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                        </aside>
                    </section>
                    </>
                    )}

                    {activeTab === 'courses' && (
                    <section className="mt-5 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-black text-slate-950">我的课件与课程</h3>
                                <div className="mt-2 flex flex-wrap items-center text-sm text-slate-500">
                                    {getBreadcrumbs().map((crumb, idx) => (
                                        <React.Fragment key={crumb.id ?? 'root'}>
                                            {idx > 0 && <i className="fas fa-chevron-right text-slate-300 text-xs mx-2"></i>}
                                            <button onClick={() => setCurrentFolder(crumb.id)} className="font-medium hover:text-blue-600">{crumb.name}</button>
                                        </React.Fragment>
                                    ))}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setCurrentFolder(null)}
                                    disabled={!currentFolder}
                                    className={`flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-bold transition-colors ${
                                        currentFolder ? 'border-slate-200 text-slate-700 hover:bg-slate-50' : 'border-slate-100 text-slate-300 cursor-not-allowed'
                                    }`}
                                >
                                    <i className="fas fa-arrow-left"></i>返回
                                </button>
                                <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                                    <button onClick={() => setViewMode('grid')} className={`h-8 w-8 rounded-lg ${viewMode === 'grid' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`} title="大图标视图">
                                        <i className="fas fa-table-cells-large"></i>
                                    </button>
                                    <button onClick={() => setViewMode('list')} className={`h-8 w-8 rounded-lg ${viewMode === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`} title="详细列表视图">
                                        <i className="fas fa-list"></i>
                                    </button>
                                </div>
                                <button onClick={handleDownloadSkill} className="hidden sm:flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50" title="下载 AI 课件生成 Skill 文件">
                                    <i className="fas fa-download text-blue-600"></i>Skill
                                </button>
                            </div>
                        </div>

                        <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 p-3">
                            <div className="flex flex-wrap items-center gap-3">
                                {quickActions.map(action => (
                                    <button
                                        key={action.label}
                                        onClick={action.onClick}
                                        disabled={action.disabled}
                                        className={`flex h-11 items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-bold transition-colors ${
                                            action.primary
                                                ? (action.disabled ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed' : 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700')
                                                : 'border-slate-200 bg-white text-slate-700 hover:bg-white hover:text-blue-700'
                                        }`}
                                    >
                                        <i className={`fas ${action.icon}`}></i>
                                        <span>{action.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="mt-5 min-h-[260px]">
                            {viewMode === 'grid' ? (
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
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
                                            className={`relative min-h-[154px] cursor-pointer rounded-2xl border p-4 transition-all ${
                                                dragOverFolder === folder.id
                                                    ? 'border-amber-300 bg-amber-50'
                                                    : draggedItem?.item?.id === folder.id
                                                        ? 'opacity-50'
                                                        : 'border-slate-200 bg-white hover:border-amber-200 hover:shadow-md'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-100 bg-amber-50 text-2xl text-amber-500">
                                                    <i className="fas fa-folder"></i>
                                                </div>
                                                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-500">
                                                    {courseData.courses.filter(c => c.folderId === folder.id).length +
                                                     courseData.folders.filter(f => f.parentId === folder.id).reduce((sum, f) =>
                                                         sum + courseData.courses.filter(c => c.folderId === f.id).length, 0)} 项
                                                </span>
                                            </div>
                                            <div className="mt-5">
                                                <p className="truncate text-base font-black text-slate-900">{folder.name}</p>
                                                <p className="mt-1 text-sm text-slate-500">双击进入文件夹</p>
                                            </div>
                                        </div>
                                    ))}
                                    {courseItems.map(course => (
                                        <div
                                            key={course.id}
                                            draggable
                                            onClick={() => handleSelect(course.id)}
                                            onContextMenu={(e) => handleContextMenu(e, course, 'course')}
                                            onDragStart={(e) => handleDragStart(e, course, 'course')}
                                            className={`relative min-h-[176px] cursor-pointer rounded-2xl border p-4 transition-all ${
                                                selectedId === course.id
                                                    ? 'border-blue-500 bg-blue-50 shadow-[0_18px_45px_rgba(37,99,235,0.16)]'
                                                    : draggedItem?.item?.id === course.id
                                                        ? 'opacity-50'
                                                        : 'border-slate-200 bg-white hover:border-blue-200 hover:shadow-md'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${course.color || 'from-blue-500 to-cyan-400'} text-2xl shadow-sm`}>
                                                    {course.icon}
                                                </div>
                                                {selectedId === course.id && (
                                                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm">
                                                        <i className="fas fa-check text-xs"></i>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="mt-5">
                                                <p className="truncate text-base font-black text-slate-900">{course.title}</p>
                                                <p className="mt-1 truncate text-sm text-slate-500">{course.file}</p>
                                            </div>
                                            <div className="mt-4 h-1.5 rounded-full bg-slate-100">
                                                <div className="h-full w-2/3 rounded-full bg-blue-500"></div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="overflow-hidden rounded-2xl border border-slate-200">
                                    <div className="grid grid-cols-[44px_1fr_120px_220px] items-center bg-slate-50 px-4 py-3 text-xs font-bold text-slate-500">
                                        <div></div>
                                        <div>名称</div>
                                        <div>类型</div>
                                        <div>文件名</div>
                                    </div>
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
                                            className={`grid grid-cols-[44px_1fr_120px_220px] items-center border-t border-slate-100 px-4 py-3 text-sm transition-colors ${
                                                dragOverFolder === folder.id ? 'bg-amber-50' : 'hover:bg-slate-50'
                                            }`}
                                        >
                                            <i className="fas fa-folder text-xl text-amber-500"></i>
                                            <div className="truncate font-bold text-slate-900">{folder.name}</div>
                                            <div className="text-slate-500">文件夹</div>
                                            <div className="truncate text-xs text-slate-400">-</div>
                                        </div>
                                    ))}
                                    {courseItems.map(course => (
                                        <div
                                            key={course.id}
                                            draggable
                                            onClick={() => handleSelect(course.id)}
                                            onContextMenu={(e) => handleContextMenu(e, course, 'course')}
                                            onDragStart={(e) => handleDragStart(e, course, 'course')}
                                            className={`grid grid-cols-[44px_1fr_120px_220px] items-center border-t border-slate-100 px-4 py-3 text-sm transition-colors ${
                                                selectedId === course.id ? 'bg-blue-50' : 'hover:bg-slate-50'
                                            }`}
                                        >
                                            <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${course.color || 'from-blue-500 to-cyan-400'}`}>
                                                {course.icon}
                                            </div>
                                            <div className="truncate font-bold text-slate-900">{course.title}</div>
                                            <div className="text-slate-500">课件</div>
                                            <div className="truncate text-xs text-slate-400">{course.file}</div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {folderItems.length === 0 && courseItems.length === 0 && (
                                <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 py-12 text-center">
                                    <i className="fas fa-folder-open text-4xl text-slate-300 mb-3"></i>
                                    <p className="text-sm font-bold text-slate-600">此文件夹为空</p>
                                    <button
                                        onClick={() => setShowNewFolderDialog(true)}
                                        className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-700"
                                    >
                                        <i className="fas fa-folder-plus mr-1.5"></i>新建文件夹
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <div className="text-sm text-slate-500">
                                当前显示 {totalVisibleItems} 项，共 {courseData.courses.length} 个课件
                                {selectedCourse && <span className="ml-3 font-bold text-slate-800">已选择：{selectedCourse.title}</span>}
                            </div>
                            <button
                                onClick={handleStartCourse}
                                disabled={!selectedId}
                                className={`flex h-11 items-center gap-2 rounded-2xl px-6 text-sm font-black transition-colors ${
                                    selectedId ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                }`}
                            >
                                <i className="fas fa-play"></i>开始授课
                            </button>
                        </div>
                    </section>
                    )}

                    {activeTab === 'settings' && (
                        <section className="space-y-5">
                            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                                <p className="text-sm font-bold text-blue-600">系统设置</p>
                                <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">课堂外配置</h2>
                                <p className="mt-2 text-sm text-slate-500">管理默认授课行为、显示比例、提交目录与调试工具。</p>
                            </div>

                            <div className="grid gap-5 xl:grid-cols-[248px_1fr]">
                                <aside className="h-fit rounded-[28px] border border-slate-200 bg-white p-3 shadow-sm">
                                    {[
                                        ['classroom', '课堂行为', 'fa-chalkboard-user'],
                                        ['display', '显示与监控', 'fa-sliders'],
                                        ['security', '安全与提交', 'fa-shield-halved'],
                                        ['system', '系统工具', 'fa-screwdriver-wrench'],
                                    ].map(([key, label, icon]) => (
                                        <button
                                            key={key}
                                            onClick={() => setSettingsSection(key)}
                                            className={`flex h-12 w-full items-center gap-3 rounded-2xl px-4 text-left text-sm font-bold transition-colors ${
                                                settingsSection === key ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                                            }`}
                                        >
                                            <i className={`fas ${icon} w-5 text-center`}></i>
                                            <span>{label}</span>
                                        </button>
                                    ))}
                                </aside>

                                <div className="space-y-5">
                                    {settingsSection === 'classroom' && (
                                        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                                            <div className="flex items-center justify-between gap-4">
                                                <div>
                                                    <h3 className="text-lg font-black text-slate-950">课堂行为</h3>
                                                    <p className="mt-1 text-sm text-slate-500">这些选项会作为每次授课的默认策略。</p>
                                                </div>
                                                <div className="hidden rounded-2xl bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 sm:block">
                                                    {settingToggles.filter(item => settings?.[item.key]).length} 项已开启
                                                </div>
                                            </div>
                                            <div className="mt-5 grid gap-3 lg:grid-cols-2">
                                                {settingToggles.map(item => (
                                                    <div key={item.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                                        <div className="flex items-start justify-between gap-4">
                                                            <div className="min-w-0">
                                                                <div className="flex items-center gap-3">
                                                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm">
                                                                        <i className={`fas ${item.icon}`}></i>
                                                                    </span>
                                                                    <div>
                                                                        <p className="font-black text-slate-900">{item.label}</p>
                                                                        <p className="mt-1 text-xs leading-relaxed text-slate-500">{item.desc}</p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <button
                                                                onClick={() => onSettingsChange(item.key, !settings?.[item.key])}
                                                                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${settings?.[item.key] ? 'bg-blue-600' : 'bg-slate-300'}`}
                                                            >
                                                                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${settings?.[item.key] ? 'left-6' : 'left-1'}`}></span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {settingsSection === 'display' && (
                                        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                                            <h3 className="text-lg font-black text-slate-950">显示与监控</h3>
                                            <p className="mt-1 text-sm text-slate-500">调整教师端画布显示和学生截图频率。</p>
                                            <div className="mt-5 grid gap-4 lg:grid-cols-3">
                                                {[
                                                    ['截图间隔', `${monitorIntervalValue}s`, 0.5, 5, 0.5, monitorIntervalValue, value => onSettingsChange('monitorIntervalSec', clampMonitorInterval(value)), 'monitorIntervalSec', 1],
                                                    ['课件页面缩放', `${Math.round(uiScaleValue * 100)}%`, 0.8, 1.2, 0.01, uiScaleValue, value => onSettingsChange('uiScale', Number(value)), 'uiScale', 1],
                                                    ['课件内容缩放', `${Math.round(renderScaleValue * 100)}%`, 0.6, 1.2, 0.01, renderScaleValue, value => onSettingsChange('renderScale', Number(value)), 'renderScale', 0.96],
                                                ].map(([label, valueLabel, min, max, step, value, onChange, key, resetValue]) => (
                                                    <div key={key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                                        <div className="flex items-center justify-between">
                                                            <span className="font-black text-slate-900">{label}</span>
                                                            <span className="rounded-xl bg-white px-2.5 py-1 text-sm font-black text-blue-700 shadow-sm">{valueLabel}</span>
                                                        </div>
                                                        <input
                                                            type="range"
                                                            min={min}
                                                            max={max}
                                                            step={step}
                                                            value={value}
                                                            onChange={e => onChange(e.target.value)}
                                                            className="mt-5 w-full accent-blue-600"
                                                        />
                                                        <button
                                                            onClick={() => onSettingsChange(key, resetValue)}
                                                            className="mt-3 text-xs font-bold text-blue-600 hover:text-blue-700"
                                                        >
                                                            恢复默认
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {settingsSection === 'security' && (
                                        <div className="grid gap-5 lg:grid-cols-2">
                                            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                                                <h3 className="text-lg font-black text-slate-950">学生端管理员密码</h3>
                                                <p className="mt-1 text-sm text-slate-500">推送后在线学生端会立即生效。</p>
                                                <input
                                                    type="password"
                                                    value={newPwd}
                                                    onChange={e => setNewPwd(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && handleSetPassword()}
                                                    placeholder="输入新密码"
                                                    className="mt-5 h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50"
                                                />
                                                <button
                                                    onClick={handleSetPassword}
                                                    disabled={!newPwd.trim()}
                                                    className={`mt-3 h-11 w-full rounded-2xl text-sm font-black transition-colors ${
                                                        newPwd.trim() ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                                    }`}
                                                >
                                                    <i className="fas fa-paper-plane mr-2"></i>推送到所有学生端
                                                </button>
                                                {pwdStatus === 'ok' && <p className="mt-3 text-xs font-bold text-emerald-600">已推送，在线学生将立即生效</p>}
                                                {pwdStatus === 'err' && <p className="mt-3 text-xs font-bold text-red-500">推送失败，请重试</p>}
                                            </div>

                                            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                                                <h3 className="text-lg font-black text-slate-950">学生提交内容存储位置</h3>
                                                <p className="mt-1 text-sm text-slate-500">设置作业与提交文件保存目录。</p>
                                                <div className="mt-5 flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={submissionDir}
                                                        onChange={e => setSubmissionDir(e.target.value)}
                                                        placeholder="输入存储目录路径"
                                                        className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50"
                                                    />
                                                    <button
                                                        onClick={handleSelectSubmissionDir}
                                                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-blue-600 hover:bg-blue-50"
                                                        title="选择目录"
                                                    >
                                                        <i className="fas fa-folder-open"></i>
                                                    </button>
                                                </div>
                                                <button
                                                    onClick={() => handleChangeSubmissionDir()}
                                                    disabled={!submissionDir.trim()}
                                                    className={`mt-3 h-11 w-full rounded-2xl text-sm font-black transition-colors ${
                                                        submissionDir.trim() ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                                    }`}
                                                >
                                                    <i className="fas fa-save mr-2"></i>更新存储位置
                                                </button>
                                                {submissionDirStatus === 'ok' && <p className="mt-3 text-xs font-bold text-emerald-600">已更新存储位置</p>}
                                                {submissionDirStatus === 'err' && <p className="mt-3 text-xs font-bold text-red-500">更新失败，请检查路径</p>}
                                            </div>
                                        </div>
                                    )}

                                    {settingsSection === 'system' && (
                                        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                                            <h3 className="text-lg font-black text-slate-950">系统工具</h3>
                                            <p className="mt-1 text-sm text-slate-500">用于排查问题与查看本机日志。</p>
                                            <div className="mt-5 grid gap-3 sm:grid-cols-2">
                                                <button onClick={handleToggleDevTools} className="flex h-14 items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-black text-slate-700 hover:bg-white hover:text-blue-700">
                                                    <i className="fas fa-bug text-blue-600"></i>打开调试面板
                                                </button>
                                                <button onClick={handleOpenLogDir} className="flex h-14 items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-black text-slate-700 hover:bg-white hover:text-blue-700">
                                                    <i className="fas fa-folder-open text-blue-600"></i>打开日志目录
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>
                    )}

                    {!['home', 'courses', 'settings'].includes(activeTab) && (
                        <section className="rounded-[28px] border border-slate-200 bg-white p-10 text-center shadow-sm">
                            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                                <i className="fas fa-screwdriver-wrench text-xl"></i>
                            </div>
                            <h3 className="mt-5 text-xl font-black text-slate-950">该模块将在这里打开</h3>
                            <p className="mt-2 text-sm text-slate-500">当前主页已聚焦常用课堂入口，后续模块会沿用同一套简洁布局。</p>
                        </section>
                    )}
                </main>
            </div>

            {/* 新建文件夹对话框 */}
            {showNewFolderDialog && (
                <div className={`fixed inset-0 ${(window.__getTeacherLayerClass?.('modal') || 'z-[10020]')} bg-black/50 flex items-center justify-center`}>
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
                                className="px-4 py-2 teacher-liquid-button rounded-lg text-sm transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleNewFolder}
                                className="px-4 py-2 teacher-liquid-primary rounded-lg text-sm font-medium transition-colors"
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
                    className={`fixed bg-slate-800 rounded-lg border border-slate-700 shadow-xl py-1 ${(window.__getTeacherLayerClass?.('popup') || 'z-[10040]')} min-w-[150px]`}
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
                                    handleExportCourse(contextMenu.item, 'pdf');
                                    setContextMenu(null);
                                }}
                                className="w-full px-4 py-2 text-left text-sky-300 hover:bg-slate-700 text-sm flex items-center"
                            >
                                <i className="fas fa-file-pdf w-5"></i>Export PDF
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleExportCourse(contextMenu.item, 'lume');
                                    setContextMenu(null);
                                }}
                                className="w-full px-4 py-2 text-left text-indigo-300 hover:bg-slate-700 text-sm flex items-center"
                            >
                                <i className="fas fa-file-code w-5"></i>Export .lume
                            </button>
                            <div className="my-1 border-t border-slate-700"></div>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedId(contextMenu.item.id);
                                    setContextMenu(null);
                                    setShowSubmissionsBrowser(true);
                                }}
                                className="w-full px-4 py-2 text-left text-green-400 hover:bg-slate-700 text-sm flex items-center"
                            >
                                <i className="fas fa-folder-open w-5"></i>View submissions
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteCourse(contextMenu.item.id);
                                    setContextMenu(null);
                                }}
                                className="w-full px-4 py-2 text-left text-red-400 hover:bg-slate-700 text-sm flex items-center"
                            >
                                <i className="fas fa-trash w-5"></i>Delete
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* 重命名对话框 */}
            {showRenameDialog && (
                <div className={`fixed inset-0 ${(window.__getTeacherLayerClass?.('modal') || 'z-[10020]')} bg-black/50 flex items-center justify-center`} onClick={() => setShowRenameDialog(false)}>
                    <div className="bg-slate-800 rounded-xl p-6 w-96 border border-slate-700 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-white font-bold text-lg mb-4">Rename</h3>
                        <input
                            type="text"
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            placeholder="Enter a new name"
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
                                className="px-4 py-2 teacher-liquid-button rounded-lg text-sm transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleRename}
                                className="px-4 py-2 teacher-liquid-primary rounded-lg text-sm font-medium transition-colors"
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showGuide && (
                <div className={`fixed inset-0 ${(window.__getTeacherLayerClass?.('modal') || 'z-[10020]')} flex`} onClick={() => setShowGuide(false)}>
                    <div className="teacher-glass-drawer ml-auto w-full max-w-2xl h-full flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
                            <h3 className="text-white font-bold text-lg flex items-center">
                                <i className="fas fa-book-open mr-2 text-green-400"></i>Course guide
                            </h3>
                            <div className="flex items-center space-x-2 text-slate-100">
                                <button onClick={handleDownloadSkill} className="flex items-center px-3 py-1.5 teacher-liquid-primary rounded-lg text-sm font-medium transition-colors">
                                    <i className="fas fa-download mr-1.5"></i>Download Skill
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

            {showSubmissionsBrowser && (
                <window.SubmissionsBrowser
                    courses={courseData}
                    selectedCourseId={selectedId}
                    onClose={() => setShowSubmissionsBrowser(false)}
                    socket={socket}
                />
            )}

            {exportPreview && (
                <div className={`fixed inset-0 ${(window.__getTeacherLayerClass?.('modal') || 'z-[10020]')} bg-slate-950/75 p-6`} onClick={() => setExportPreview(null)}>
                    <div className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-slate-900 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between border-b border-white/10 px-6 py-3">
                            <div>
                                <div className="text-xs font-bold uppercase tracking-[0.28em] text-sky-300">PDF Export</div>
                                <div className="mt-1 text-lg font-black text-white">{exportPreview.course?.title || "Course export preview"}</div>
                                <div className="mt-1 text-xs text-slate-400">
                                    Check the preview before generating the PDF.
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                                    <label htmlFor={exportScaleInputId} className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                                        Scale
                                    </label>
                                    <input
                                        id={exportScaleInputId}
                                        type="range"
                                        min="0.5"
                                        max="1.5"
                                        step="0.05"
                                        value={exportPreview.contentScale || 1}
                                        onChange={(e) => handleExportScaleChange(e.target.value)}
                                        className="h-1.5 w-32 cursor-pointer appearance-none rounded-full bg-white/10 accent-sky-400"
                                    />
                                    <span className="min-w-[46px] text-right text-xs font-black text-sky-300">
                                        {Math.round((exportPreview.contentScale || 1) * 100)}%
                                    </span>
                                    <button
                                        onClick={() => handleExportScaleChange(1)}
                                        className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-bold text-slate-300 transition hover:bg-white/10 hover:text-white"
                                    >
                                        Reset
                                    </button>
                                </div>
                                <button onClick={() => setExportPreview(null)} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white">
                                    <i className="fas fa-xmark text-base"></i>
                                </button>
                            </div>
                        </div>

                        <div className="relative flex-1 bg-slate-950">
                            <iframe
                                ref={previewFrameRef}
                                src={exportPreview.previewUrl}
                                onLoad={handleExportPreviewFrameLoad}
                                title="Course export preview"
                                className="h-full w-full border-0 bg-white"
                            />
                            {exportPreview.status !== 'ready' && (
                                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/45">
                                    <div className={`w-full max-w-md rounded-2xl border px-6 py-4 text-center shadow-2xl ${exportPreview.status === 'error' ? 'border-red-400/30 bg-red-950/80 text-red-100' : 'border-white/10 bg-slate-900/90 text-slate-100'}`}>
                                        <div className="text-lg font-black">{exportPreview.status === "error" ? "Preview failed" : exportPreview.status === "generating" ? "Generating PDF" : "Preparing preview"}</div>
                                        <div className="mt-2 text-sm text-slate-300">
                                            {exportPreview.status === 'error'
                                                ? (exportPreview.error || "Close this window and try again.")
                                                : (exportPreview.progressLabel || "Processing export task, please wait.")}
                                        </div>
                                        {exportPreview.status !== 'error' && (
                                            <>
                                                <div className="mt-3 text-sm font-bold text-sky-300">{Math.round(exportPreview.progress || 0)}%</div>
                                                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                                                    <div className="h-full rounded-full bg-gradient-to-r from-sky-400 via-blue-500 to-cyan-300 transition-all duration-200" style={{ width: `${Math.min(Math.max(exportPreview.progress || 0, 0), 100)}%` }} />
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-between border-t border-white/10 px-6 py-4">
                            <div className="text-sm text-slate-400">
                                {exportPreview.status === 'ready'
                                    ? `Export will use ${Math.round((exportPreview.contentScale || 1) * 100)}% content scale. After confirmation, the PDF will be generated directly without browser print.`
                                    : exportPreview.status === 'generating'
                                        ? `PDF is being generated. Current progress: ${Math.round(exportPreview.progress || 0)}%.`
                                    : exportPreview.status === 'error'
                                        ? "Preview is not available yet, so export is disabled."
                                        : "Export becomes available after the preview is ready."}
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setExportPreview(null)}
                                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleConfirmPdfExport}
                                    disabled={exportPreview.status !== 'ready'}
                                    className={`rounded-xl px-4 py-2 text-sm font-bold transition ${exportPreview.status === 'ready' ? 'teacher-liquid-primary' : 'cursor-not-allowed border border-white/10 bg-white/5 text-slate-500'}`}
                                >
                                    Export PDF
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
