// ========================================================
// 配置文件
// ========================================================

const path = require('path');
const fs = require('fs');

// 服务器配置
const config = {
    // 服务器端口
    port: process.env.PORT || 3000,

    // 下载超时设置
    downloadTimeout: 60000, // 60秒

    // 缓存目录配置
    cacheRoot: process.env.LUMESYNC_CACHE_DIR || path.join(__dirname, '../../../shared/public'),
    libDir: process.env.LUMESYNC_LIB_DIR || path.join(
        process.env.LUMESYNC_CACHE_DIR || path.join(__dirname, '../../../shared/public'),
        'lib'
    ),
    weightsDir: process.env.LUMESYNC_WEIGHTS_DIR || path.join(
        process.env.LUMESYNC_CACHE_DIR || path.join(__dirname, '../../../shared/public'),
        'weights'
    ),
    imagesDir: process.env.LUMESYNC_IMAGES_DIR || path.join(
        process.env.LUMESYNC_CACHE_DIR || path.join(__dirname, '../../../shared/public'),
        'images'
    ),
    webfontsDir: process.env.LUMESYNC_WEBFONTS_DIR || path.join(
        process.env.LUMESYNC_CACHE_DIR || path.join(__dirname, '../../../shared/public'),
        'webfonts'
    ),

    // 课程目录
    coursesDir: path.join(__dirname, '../../../shared/public/courses'),

    // 文件夹数据路径
    folderDataPath: path.join(__dirname, '../../../shared/public/data/course-folders.json'),

    // 学生提交目录
    defaultSubmissionsDir: path.join(__dirname, '../../../submissions'),
    submissionsConfigFile: path.join(__dirname, '../../../submissions-config.json'),

    // 座位表配置
    classroomLayoutPath: path.join(__dirname, '../../../shared/public/data/classroom-layout-v1.json'),

    // 教程文档路径
    skillPath: path.join(__dirname, '../../../shared/docs/create-course.md'),
    courseGuidePath: path.join(__dirname, '../../../shared/docs/course-template.md'),

    // 日志限制
    studentLogMax: 500,
    annotationMaxSegmentsPerSlide: 5000,

    // Socket.io 配置
    socket: {
        pingInterval: 5000,
        pingTimeout: 8000
    },

    // Body 解析配置
    body: {
        limit: '2mb',
        extended: false
    }
};

// 初始化目录
function initDirectories() {
    const dirs = [
        config.libDir,
        config.weightsDir,
        config.imagesDir,
        config.webfontsDir,
        config.coursesDir,
        getSubmissionsDir()
    ];

    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });

    // 加载提交目录配置
    try {
        if (fs.existsSync(config.submissionsConfigFile)) {
            const configData = JSON.parse(fs.readFileSync(config.submissionsConfigFile, 'utf-8'));
            if (configData.submissionsDir) {
                process.env.SUBMISSIONS_DIR = configData.submissionsDir;
                if (!fs.existsSync(configData.submissionsDir)) {
                    fs.mkdirSync(configData.submissionsDir, { recursive: true });
                }
            }
        }
    } catch (err) {
        console.warn('[config] Failed to load submissions config:', err.message);
    }
}

// 获取提交目录（支持运行时动态更新）
function getSubmissionsDir() {
    return process.env.SUBMISSIONS_DIR || config.defaultSubmissionsDir;
}

// 更新提交目录配置
function setSubmissionsDir(dir) {
    process.env.SUBMISSIONS_DIR = dir;
    try {
        fs.writeFileSync(
            config.submissionsConfigFile,
            JSON.stringify({ submissionsDir: dir }, null, 2),
            'utf-8'
        );
    } catch (err) {
        console.warn('[config] Failed to save submissions config:', err.message);
    }
}

module.exports = {
    config,
    initDirectories,
    getSubmissionsDir,
    setSubmissionsDir
};
