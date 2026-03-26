// ========================================================
// API 路由
// ========================================================

const express = require('express');
const fs = require('fs');
const path = require('path');
const { config, getSubmissionsDir, setSubmissionsDir } = require('./config');
const { scanCourses, deleteCourse } = require('./courses');
const {
    createFolder,
    deleteFolder,
    moveFolder,
    renameFolder,
    moveCourseToFolder
} = require('./data');
const { saveClassroomLayout, saveSubmission } = require('./submissions');
const { loadCourseGuide, downloadSkill } = require('./utils');

const router = express.Router();

// 当前课程状态
let currentCourseId = null;
let currentSlideIndex = 0;
let courseCatalog = scanCourses();

// 健康检查
router.get('/health', (req, res) => {
    res.json({ ok: true, app: 'LumeSync', port: Number(process.env.PORT || 3000) });
});

// 获取课程列表
router.get('/courses', (req, res) => {
    const catalog = typeof courseCatalog === 'object' && 'courses' in courseCatalog
        ? courseCatalog
        : { courses: courseCatalog, folders: [] };
    res.json({
        ...catalog,
        currentCourseId: currentCourseId,
        currentSlideIndex: currentSlideIndex
    });
});

// 获取组件清单（用于编辑器自动加载 public/components 下所有组件）
router.get('/components-manifest', (req, res) => {
    try {
        const componentsDir = path.join(__dirname, '..', 'public', 'components');
        if (!fs.existsSync(componentsDir)) {
            return res.json({ success: true, files: [] });
        }

        const files = fs.readdirSync(componentsDir)
            .filter(name => /\.js$/i.test(name))
            .sort((a, b) => a.localeCompare(b, 'zh-CN'))
            .map(name => `/components/${name}`);

        res.json({ success: true, files });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message, files: [] });
    }
});

// 获取当前课程状态
router.get('/course-status', (req, res) => {
    res.json({
        currentCourseId: currentCourseId,
        currentSlideIndex: currentSlideIndex
    });
});

// 刷新课程列表
router.post('/refresh-courses', (req, res) => {
    courseCatalog = scanCourses();
    res.json({ success: true, ...courseCatalog });
});

// 删除指定课件
router.delete('/delete-course', (req, res) => {
    const courseId = req.body?.courseId || req.query?.courseId || null;
    if (!courseId) {
        return res.status(400).json({ success: false, error: '缺少 courseId 参数' });
    }

    const result = deleteCourse(courseId);
    if (result.success) {
        courseCatalog = scanCourses();
        res.json({ success: true, ...courseCatalog });
    } else {
        res.status(404).json(result);
    }
});

// ========================================================
// 课程文件夹管理 API
// ========================================================

// 创建文件夹
router.post('/course-folders', (req, res) => {
    const { name, icon, parentId } = req.body;

    const result = createFolder(name, icon, parentId);
    if (result.success) {
        courseCatalog = scanCourses();
        res.json({ success: true, folder: result.folder, ...courseCatalog });
    } else {
        res.status(400).json(result);
    }
});

// 删除文件夹
router.delete('/course-folders/:folderId', (req, res) => {
    const result = deleteFolder(req.params.folderId);
    if (result.success) {
        courseCatalog = scanCourses();
        res.json({ success: true, ...courseCatalog });
    } else {
        res.status(400).json(result);
    }
});

// 移动文件夹（必须放在重命名路由之前）
router.put('/course-folders/:folderId/move', (req, res) => {
    const { folderId } = req.params;
    const { targetFolderId } = req.body;

    const result = moveFolder(folderId, targetFolderId);
    if (result.success) {
        courseCatalog = scanCourses();
        res.json({ success: true, ...courseCatalog });
    } else {
        res.status(400).json(result);
    }
});

// 重命名文件夹
router.put('/course-folders/:folderId', (req, res) => {
    const { folderId } = req.params;
    const { name, icon } = req.body;

    const result = renameFolder(folderId, name, icon);
    if (result.success) {
        courseCatalog = scanCourses();
        res.json({ success: true, folder: result.folder, ...courseCatalog });
    } else {
        res.status(400).json(result);
    }
});

// 移动课件到文件夹
router.put('/course-folders/:folderId/courses/:courseId', (req, res) => {
    const { folderId, courseId } = req.params;

    const result = moveCourseToFolder(courseId, folderId);
    if (result.success) {
        courseCatalog = scanCourses();
        res.json({ success: true, ...courseCatalog });
    } else {
        res.status(400).json(result);
    }
});

// ========================================================
// 学生提交和配置 API
// ========================================================

// 保存座位表
router.post('/save-classroom-layout', (req, res) => {
    saveClassroomLayout(req.body.layout, res);
});

// 保存学生提交
router.post('/save-submission', (req, res) => {
    saveSubmission(req.body, res);
});

// 获取提交文件夹路径
router.get('/submission-config', (req, res) => {
    res.json({ submissionsDir: getSubmissionsDir() });
});

// 更新提交文件夹路径
router.post('/submission-config', (req, res) => {
    const { submissionsDir } = req.body;

    if (!submissionsDir || typeof submissionsDir !== 'string') {
        return res.status(400).json({ success: false, error: 'Invalid directory path' });
    }

    try {
        const fs = require('fs');
        if (!fs.existsSync(submissionsDir)) {
            fs.mkdirSync(submissionsDir, { recursive: true });
        }

        setSubmissionsDir(submissionsDir);
        res.json({ success: true, submissionsDir });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ========================================================
// 文档和教程 API
// ========================================================

// 下载 Skill 文件
router.get('/download-skill', (req, res) => {
    downloadSkill(res);
});

// 获取课件教程
router.get('/course-guide', (req, res) => {
    loadCourseGuide(res);
});

// 导出课程状态管理函数
function setCurrentCourseId(id) {
    currentCourseId = id;
}

function setCurrentSlideIndex(index) {
    currentSlideIndex = index;
}

function getCurrentCourseId() {
    return currentCourseId;
}

function getCurrentSlideIndex() {
    return currentSlideIndex;
}

function getCourseCatalog() {
    return courseCatalog;
}

function setCourseCatalog(catalog) {
    courseCatalog = catalog;
}

module.exports = {
    router,
    setCurrentCourseId,
    setCurrentSlideIndex,
    getCurrentCourseId,
    getCurrentSlideIndex,
    getCourseCatalog,
    setCourseCatalog
};
