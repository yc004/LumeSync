const path = require('path');
const fs = require('fs');

const publicRoot = process.env.LUMESYNC_PUBLIC_DIR
    || process.env.STATIC_DIR
    || path.join(__dirname, '../../shared/public');
const docsRoot = process.env.LUMESYNC_DOCS_ROOT || path.join(__dirname, '../../shared/docs');

const config = {
    port: process.env.PORT || 3000,
    downloadTimeout: 60000,

    cacheRoot: process.env.LUMESYNC_CACHE_DIR || publicRoot,
    libDir: process.env.LUMESYNC_LIB_DIR || path.join(process.env.LUMESYNC_CACHE_DIR || publicRoot, 'lib'),
    weightsDir: process.env.LUMESYNC_WEIGHTS_DIR || path.join(process.env.LUMESYNC_CACHE_DIR || publicRoot, 'weights'),
    imagesDir: process.env.LUMESYNC_IMAGES_DIR || path.join(process.env.LUMESYNC_CACHE_DIR || publicRoot, 'images'),
    webfontsDir: process.env.LUMESYNC_WEBFONTS_DIR || path.join(process.env.LUMESYNC_CACHE_DIR || publicRoot, 'webfonts'),

    coursesDir: process.env.LUMESYNC_COURSES_DIR || path.join(publicRoot, 'courses'),
    folderDataPath: process.env.LUMESYNC_FOLDER_DATA_PATH || path.join(publicRoot, 'data/course-folders.json'),
    classroomLayoutPath: process.env.LUMESYNC_CLASSROOM_LAYOUT_PATH || path.join(publicRoot, 'data/classroom-layout-v1.json'),

    defaultSubmissionsDir: process.env.LUMESYNC_SUBMISSIONS_DIR || path.join(__dirname, '../../submissions'),
    submissionsConfigFile: process.env.LUMESYNC_SUBMISSIONS_CONFIG || path.join(__dirname, '../../submissions-config.json'),

    skillPath: process.env.LUMESYNC_SKILL_PATH || path.join(docsRoot, 'create-course.md'),
    courseGuidePath: process.env.LUMESYNC_COURSE_GUIDE_PATH || path.join(docsRoot, 'course-template.md'),

    studentLogMax: Number(process.env.LUMESYNC_STUDENT_LOG_MAX || 500),
    annotationMaxSegmentsPerSlide: Number(process.env.LUMESYNC_ANNOTATION_MAX_SEGMENTS_PER_SLIDE || 5000),

    socket: {
        pingInterval: 5000,
        pingTimeout: 8000
    },

    body: {
        limit: '2mb',
        extended: false
    }
};

function initDirectories() {
    const dirs = [
        publicRoot,
        config.libDir,
        config.weightsDir,
        config.imagesDir,
        config.webfontsDir,
        config.coursesDir,
        path.dirname(config.folderDataPath),
        path.dirname(config.classroomLayoutPath),
        getSubmissionsDir()
    ];

    dirs.forEach((dir) => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });

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

function getSubmissionsDir() {
    return process.env.SUBMISSIONS_DIR || config.defaultSubmissionsDir;
}

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
