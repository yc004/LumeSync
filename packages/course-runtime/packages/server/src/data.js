// ========================================================
// 文件夹数据管理
// ========================================================

const path = require('path');
const fs = require('fs');
const { config } = require('./config');

// 加载文件夹配置
function loadFolderData() {
    try {
        if (fs.existsSync(config.folderDataPath)) {
            const content = fs.readFileSync(config.folderDataPath, 'utf-8');
            return JSON.parse(content);
        }
    } catch (err) {
        console.warn('[loadFolderData] Failed to load folder data:', err.message);
    }
    return { folders: [], courses: {} };
}

// 保存文件夹配置
function saveFolderData(data) {
    try {
        const dataDir = path.dirname(config.folderDataPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        fs.writeFileSync(config.folderDataPath, JSON.stringify(data, null, 2), 'utf-8');
        return true;
    } catch (err) {
        console.error('[saveFolderData] Failed to save folder data:', err.message);
        return false;
    }
}

// 创建文件夹
function createFolder(name, icon, parentId) {
    if (!name || !name.trim()) {
        return { success: false, error: '文件夹名称不能为空' };
    }

    const folderData = loadFolderData();
    folderData.folders = folderData.folders || [];

    // 检查是否已存在同名文件夹
    const parentToCheck = parentId === null || parentId === undefined ? null : parentId;
    const existingFolder = folderData.folders.find(f => {
        const folderParent = f.parentId === null || f.parentId === undefined ? null : f.parentId;
        return f.name === name.trim() && folderParent === parentToCheck;
    });

    if (existingFolder) {
        return { success: false, error: `文件夹 "${name}" 已存在` };
    }

    const folderId = `folder-${Date.now()}`;
    const newFolder = {
        id: folderId,
        name: name.trim(),
        icon: icon || '📁',
        parentId: parentId || null,
        createdAt: new Date().toISOString()
    };

    folderData.folders.push(newFolder);

    if (saveFolderData(folderData)) {
        return { success: true, folder: newFolder, folderData };
    } else {
        return { success: false, error: '保存失败' };
    }
}

// 删除文件夹（支持递归删除子文件夹）
function deleteFolder(folderId) {
    if (!folderId) {
        return { success: false, error: '缺少 folderId 参数' };
    }

    const folderData = loadFolderData();
    if (!folderData.folders || !folderData.folders.find(f => f.id === folderId)) {
        return { success: false, error: '文件夹不存在' };
    }

    // 递归获取所有子文件夹ID
    const getSubFolderIds = (parentId) => {
        const subFolders = folderData.folders.filter(f => f.parentId === parentId);
        let ids = subFolders.map(f => f.id);
        subFolders.forEach(sub => {
            ids = ids.concat(getSubFolderIds(sub.id));
        });
        return ids;
    };

    const allFolderIdsToDelete = [folderId, ...getSubFolderIds(folderId)];

    // 将这些文件夹中的课件移出文件夹
    if (folderData.courses) {
        for (const courseId in folderData.courses) {
            if (allFolderIdsToDelete.includes(folderData.courses[courseId])) {
                delete folderData.courses[courseId];
            }
        }
    }

    // 删除所有这些文件夹
    folderData.folders = folderData.folders.filter(f => !allFolderIdsToDelete.includes(f.id));

    if (saveFolderData(folderData)) {
        return { success: true, folderData };
    } else {
        return { success: false, error: '保存失败' };
    }
}

// 移动文件夹
function moveFolder(folderId, targetFolderId) {
    if (!folderId) {
        return { success: false, error: '缺少 folderId 参数' };
    }

    const folderData = loadFolderData();

    // 验证源文件夹是否存在
    const folderToMove = folderData.folders?.find(f => f.id === folderId);
    if (!folderToMove) {
        return { success: false, error: '源文件夹不存在' };
    }

    // 验证目标文件夹是否存在（如果是 'null' 则表示移到根目录）
    if (targetFolderId !== 'null' && !folderData.folders?.find(f => f.id === targetFolderId)) {
        return { success: false, error: '目标文件夹不存在' };
    }

    // 不能将文件夹移动到自己的子文件夹中
    if (targetFolderId !== 'null') {
        const isDescendant = (parentId, childId) => {
            if (parentId === childId) return true;
            const childFolders = folderData.folders.filter(f => f.parentId === parentId);
            for (const child of childFolders) {
                if (isDescendant(child.id, childId)) return true;
            }
            return false;
        };
        if (isDescendant(folderId, targetFolderId)) {
            return { success: false, error: '不能将文件夹移动到其子文件夹中' };
        }
    }

    // 更新文件夹的parentId
    folderToMove.parentId = targetFolderId === 'null' ? null : targetFolderId;

    if (saveFolderData(folderData)) {
        return { success: true, folderData };
    } else {
        return { success: false, error: '保存失败' };
    }
}

// 重命名文件夹
function renameFolder(folderId, name, icon) {
    if (!folderId) {
        return { success: false, error: '缺少 folderId 参数' };
    }

    if (!name || !name.trim()) {
        return { success: false, error: '文件夹名称不能为空' };
    }

    const folderData = loadFolderData();
    const folder = folderData.folders?.find(f => f.id === folderId);

    if (!folder) {
        return { success: false, error: '文件夹不存在' };
    }

    // 检查是否已存在同名文件夹（排除自己）
    const folderParent = folder.parentId === null || folder.parentId === undefined ? null : folder.parentId;
    const existingFolder = folderData.folders.find(f => {
        const fParent = f.parentId === null || f.parentId === undefined ? null : f.parentId;
        return f.id !== folderId && f.name === name.trim() && fParent === folderParent;
    });

    if (existingFolder) {
        return { success: false, error: `文件夹 "${name}" 已存在` };
    }

    folder.name = name.trim();
    if (icon !== undefined) {
        folder.icon = icon;
    }
    folder.updatedAt = new Date().toISOString();

    if (saveFolderData(folderData)) {
        return { success: true, folder, folderData };
    } else {
        return { success: false, error: '保存失败' };
    }
}

// 移动课件到文件夹
function moveCourseToFolder(courseId, folderId) {
    if (!courseId) {
        return { success: false, error: '缺少 courseId 参数' };
    }

    const folderData = loadFolderData();

    // 验证文件夹是否存在（如果是 'null' 则表示移出文件夹）
    if (folderId !== 'null' && !folderData.folders?.find(f => f.id === folderId)) {
        return { success: false, error: '目标文件夹不存在' };
    }

    // 更新课件所属文件夹
    folderData.courses = folderData.courses || {};
    if (folderId === 'null') {
        // 移出文件夹
        delete folderData.courses[courseId];
    } else {
        // 移入文件夹
        folderData.courses[courseId] = folderId;
    }

    if (saveFolderData(folderData)) {
        return { success: true, folderData };
    } else {
        return { success: false, error: '保存失败' };
    }
}

module.exports = {
    loadFolderData,
    saveFolderData,
    createFolder,
    deleteFolder,
    moveFolder,
    renameFolder,
    moveCourseToFolder
};
