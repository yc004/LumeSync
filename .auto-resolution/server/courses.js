// ========================================================
// 课程扫描和管理
// ========================================================

const path = require('path');
const fs = require('fs');
const { config } = require('./config');
const { loadFolderData, saveFolderData } = require('./data');

// 扫描课程目录获取所有可用课程
function scanCourses() {
    if (!fs.existsSync(config.coursesDir)) {
        fs.mkdirSync(config.coursesDir, { recursive: true });
        return { courses: [], folders: loadFolderData().folders };
    }

    const files = fs.readdirSync(config.coursesDir);
    const allowedExts = ['.lume', '.tsx', '.ts', '.jsx', '.js', '.pdf'];
    const extPriority = {
        '.lume': 5,
        '.tsx': 4,
        '.ts': 3,
        '.jsx': 2,
        '.js': 1,
        '.pdf': 0
    };

    // 加载文件夹数据
    const folderData = loadFolderData();
    const courseFolderMap = folderData.courses || {};

    const courses = files
        .filter(f => allowedExts.includes(path.extname(f).toLowerCase()))
        .map(f => {
            const filePath = path.join(config.coursesDir, f);
            const ext = path.extname(f).toLowerCase();
            const courseId = f.replace(/\.(lume|tsx|ts|jsx|js|pdf)$/i, '');

            let mtimeMs = 0;
            try {
                mtimeMs = fs.statSync(filePath).mtimeMs || 0;
            } catch (_) {}

            // 获取课件所属文件夹
            const folderId = courseFolderMap[courseId] || null;

            if (ext === '.pdf') {
                return {
                    id: courseId,
                    file: f,
                    title: courseId,
                    icon: '📄',
                    desc: 'PDF课件',
                    color: 'from-rose-500 to-orange-600',
                    type: 'pdf',
                    folderId,
                    _extPriority: extPriority[ext] || 0,
                    _mtimeMs: mtimeMs
                };
            }

            let content;
            try {
                content = fs.readFileSync(filePath, 'utf-8');
            } catch (err) {
                console.warn(`[scanCourses] [SKIP] 跳过无法读取的文件: ${f} (${err.message})`);
                return null;
            }

            // 尝试从文件中提取课程元数据
            let title = courseId;
            let icon = '📚';
            let desc = '';
            let color = 'from-blue-500 to-indigo-600';

            // 匹配 window.CourseData 中的元数据
            const courseDataIndex = content.indexOf('window.CourseData');
            const metaContent = courseDataIndex >= 0 ? content.slice(courseDataIndex) : content;

            const titleMatch = metaContent.match(/title:\s*["'](.+?)["']/);
            const iconMatch = metaContent.match(/icon:\s*["'](.+?)["']/);
            const descMatch = metaContent.match(/desc:\s*["'](.+?)["']/);
            const colorMatch = metaContent.match(/color:\s*["'](.+?)["']/);

            if (titleMatch) title = titleMatch[1];
            if (iconMatch) icon = iconMatch[1];
            if (descMatch) desc = descMatch[1];
            if (colorMatch) color = colorMatch[1];

            return {
                id: courseId,
                file: f,
                title,
                icon,
                desc,
                color,
                type: 'script',
                folderId,
                _extPriority: extPriority[path.extname(f).toLowerCase()] || 0,
                _mtimeMs: mtimeMs
            };
        })
        .filter(course => course !== null);

    // 去重：按 ID 保留优先级最高或修改时间最新的版本
    const byId = new Map();
    for (const c of courses) {
        const prev = byId.get(c.id);
        if (!prev) {
            byId.set(c.id, c);
            continue;
        }
        const preferCurrent =
            (c._extPriority > prev._extPriority) ||
            (c._extPriority === prev._extPriority && (c._mtimeMs || 0) > (prev._mtimeMs || 0));
        if (preferCurrent) byId.set(c.id, c);
    }

    const deduped = Array.from(byId.values());
    deduped.sort((a, b) => (b._mtimeMs || 0) - (a._mtimeMs || 0));

    return {
        courses: deduped.map(({ _mtimeMs, _extPriority, ...rest }) => rest),
        folders: folderData.folders || []
    };
}

// 删除课程
function deleteCourse(courseId) {
    const catalog = scanCourses();
    const course = catalog.courses.find(c => c.id === courseId);

    if (!course) {
        return { success: false, error: '课件不存在' };
    }

    const filePath = path.join(config.coursesDir, course.file);
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`[delete-course] deleted: ${course.file}`);
        }
        // 从文件夹配置中移除
        const folderData = loadFolderData();
        if (folderData.courses && folderData.courses[courseId]) {
            delete folderData.courses[courseId];
            saveFolderData(folderData);
        }
        return { success: true, catalog: scanCourses() };
    } catch (err) {
        console.error(`[delete-course] error:`, err);
        return { success: false, error: '删除文件失败' };
    }
}

module.exports = {
    scanCourses,
    deleteCourse
};
