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

// 获取座位表
router.get('/classroom-layout', (req, res) => {
    try {
        if (!fs.existsSync(config.classroomLayoutPath)) {
            return res.json({ success: true, layout: null });
        }
        const raw = fs.readFileSync(config.classroomLayoutPath, 'utf-8');
        const layout = JSON.parse(raw || 'null');
        res.json({ success: true, layout });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

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

// 获取学生提交文件列表
router.get('/submissions/:courseId', (req, res) => {
    const { courseId } = req.params;

    if (!courseId) {
        return res.status(400).json({ success: false, error: 'Missing courseId parameter' });
    }

    try {
        const submissionsDir = getSubmissionsDir();
        const courseDir = path.join(submissionsDir, courseId);

        if (!fs.existsSync(courseDir)) {
            return res.json({ success: true, courseId, files: [] });
        }

        // 递归读取目录下的所有文件（包括子目录）
        const files = [];
        const scanDir = (dir, relativePath = '') => {
            const entries = fs.readdirSync(dir);
            entries.forEach(entry => {
                const fullPath = path.join(dir, entry);
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    // 递归扫描子目录
                    scanDir(fullPath, path.join(relativePath, entry));
                } else if (stat.isFile()) {
                    // 添加文件信息
                    files.push({
                        name: path.join(relativePath, entry),
                        path: fullPath,
                        size: stat.size,
                        mtime: stat.mtime
                    });
                }
            });
        };

        scanDir(courseDir);

        // 按修改时间倒序排序
        files.sort((a, b) => b.mtime - a.mtime);

        res.json({ success: true, courseId, files });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 下载学生提交文件
router.get('/submissions/:courseId/file/:fileName(*)', (req, res) => {
    const { courseId, fileName } = req.params;

    if (!courseId || !fileName) {
        return res.status(400).json({ success: false, error: 'Missing required parameters' });
    }

    try {
        const submissionsDir = getSubmissionsDir();
        const courseDir = path.join(submissionsDir, courseId);
        const filePath = path.join(courseDir, fileName);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, error: 'File not found' });
        }

        // 从完整路径中提取文件名作为下载名称
        const basename = path.basename(filePath);
        res.download(filePath, basename);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 批量打包下载学生提交文件
router.post('/submissions/:courseId/download-batch', async (req, res) => {
    const { courseId } = req.params;
    const { files } = req.body;

    if (!courseId || !Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ success: false, error: 'Missing required parameters or no files selected' });
    }

    try {
        const archiver = require('archiver');
        const submissionsDir = getSubmissionsDir();
        const courseDir = path.join(submissionsDir, courseId);

        // 设置响应头
        const timestamp = new Date().toISOString().split('T')[0];
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${courseId}_${timestamp}.zip"`);

        // 创建归档
        const archive = archiver('zip', {
            zlib: { level: 9 }
        });

        // 处理错误
        archive.on('error', (err) => {
            console.error('[batch-download] Archive error:', err);
            res.status(500).json({ success: false, error: err.message });
        });

        // 将归档输出到响应流
        archive.pipe(res);

        // 添加选中的文件
        let addedCount = 0;
        for (const fileName of files) {
            const filePath = path.join(courseDir, fileName);
            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                archive.file(filePath, { name: fileName });
                addedCount++;
            }
        }

        console.log(`[batch-download] Adding ${addedCount} files to archive for course ${courseId}`);

        // 完成归档
        await archive.finalize();
    } catch (err) {
        console.error('[batch-download] Error:', err);
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: err.message });
        }
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
