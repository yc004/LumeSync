// ========================================================
// 工具函数
// ========================================================

const fs = require('fs');
const path = require('path');
const { config } = require('./config');

// 下载 Skill 文件
function downloadSkill(res) {
    const skillPath = config.skillPath;
    if (!fs.existsSync(skillPath)) {
        return res.status(404).send('skill file not found');
    }
    res.setHeader('Content-Disposition', 'attachment; filename="create-course.md"');
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.sendFile(skillPath);
}

// 加载课件教程
function loadCourseGuide(res) {
    const guidePath = config.courseGuidePath;
    console.log('[api/course-guide] Guide path:', guidePath);
    console.log('[api/course-guide] Exists:', fs.existsSync(guidePath));

    if (!fs.existsSync(guidePath)) {
        console.error('[api/course-guide] Guide file not found at:', guidePath);
        return res.status(404).send('guide file not found');
    }

    try {
        const content = fs.readFileSync(guidePath, 'utf-8');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.send(content);
    } catch (err) {
        console.error('[api/course-guide] Error reading guide:', err);
        res.status(500).send('Error reading guide file');
    }
}

module.exports = {
    downloadSkill,
    loadCourseGuide
};
