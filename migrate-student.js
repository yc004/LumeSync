// ========================================================
// 学生端迁移脚本
// 将 electron/main-student.js 复制到 apps/student/electron/main.js
// ========================================================

const fs = require('fs');
const path = require('path');

const sourceFile = path.join(__dirname, 'electron/main-student.js');
const targetDir = path.join(__dirname, 'apps/student/electron');
const targetFile = path.join(targetDir, 'main.js');

// 创建目标目录
if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    console.log(`[Migrate] Created directory: ${targetDir}`);
}

// 复制主进程文件
if (fs.existsSync(sourceFile)) {
    let content = fs.readFileSync(sourceFile, 'utf8');

    // 更新路径引用
    content = content.replace(
        /const \{ loadConfig, saveConfig, getAdminPasswordHash \} = require\('\.\/config\.js'\);/,
        "const { loadConfig, saveConfig, getAdminPasswordHash } = require('../../common/electron/config.js');"
    );

    content = content.replace(
        /const \{ Logger \} = require\('\.\/logger\.js'\);/,
        "const { Logger } = require('../../common/electron/logger.js');"
    );

    content = content.replace(
        /const \{ AutoLauncher \} = require\('\.\/task-scheduler-autostart\.js'\);/,
        "const { AutoLauncher } = require('../../common/electron/task-scheduler-autostart.js');"
    );

    content = content.replace(
        /const iconPath = path\.join\(__dirname, '\.\.', 'assets', 'tray-icon\.png'\);/,
        "const iconPath = path.join(__dirname, '../../../shared/assets/tray-icon.png');"
    );

    content = content.replace(
        /path\.join\(__dirname, 'admin\.html'\)/,
        "path.join(__dirname, '../../shared/electron/admin.html')"
    );

    content = content.replace(
        /path\.join\(__dirname, 'offline\.html'\)/,
        "path.join(__dirname, '../../shared/electron/offline.html')"
    );

    content = content.replace(
        /preload: path\.join\(__dirname, 'preload\.js'\)/,
        "preload: path.join(__dirname, '../../common/electron/preload.js')"
    );

    fs.writeFileSync(targetFile, content, 'utf8');
    console.log(`[Migrate] Copied student main process`);
}

// 复制 task-scheduler-autostart.js 到 common
const autostartSource = path.join(__dirname, 'electron/task-scheduler-autostart.js');
const autostartTarget = path.join(__dirname, 'apps/common/electron/task-scheduler-autostart.js');
if (fs.existsSync(autostartSource)) {
    const content = fs.readFileSync(autostartSource, 'utf8');
    fs.writeFileSync(autostartTarget, content, 'utf8');
    console.log(`[Migrate] Copied task-scheduler-autostart.js to common`);
}

// 复制 admin.html 和 offline.html 到 shared
const sharedDir = path.join(__dirname, 'apps/shared');
if (!fs.existsSync(sharedDir)) {
    fs.mkdirSync(sharedDir, { recursive: true });
}

const adminSource = path.join(__dirname, 'electron/admin.html');
const adminTarget = path.join(sharedDir, 'admin.html');
if (fs.existsSync(adminSource)) {
    const content = fs.readFileSync(adminSource, 'utf8');
    fs.writeFileSync(adminTarget, content, 'utf8');
    console.log(`[Migrate] Copied admin.html`);
}

const offlineSource = path.join(__dirname, 'electron/offline.html');
const offlineTarget = path.join(sharedDir, 'offline.html');
if (fs.existsSync(offlineSource)) {
    const content = fs.readFileSync(offlineSource, 'utf8');
    fs.writeFileSync(offlineTarget, content, 'utf8');
    console.log(`[Migrate] Copied offline.html`);
}

// 创建学生端 index.html（指向教师端的 HTML）
const htmlDir = path.join(__dirname, 'apps/student/public');
if (!fs.existsSync(htmlDir)) {
    fs.mkdirSync(htmlDir, { recursive: true });
}

const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SyncClassroom 学生端</title>
    <style>
        html, body { width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; }
        iframe { width: 100%; height: 100%; border: none; }
    </style>
</head>
<body>
    <!-- 学生端通过 URL 连接到教师端 -->
    <script>
        // 学生端会动态加载教师端的页面
        // URL 由 Electron 主进程传入
    </script>
</body>
</html>`;

const htmlTarget = path.join(htmlDir, 'index.html');
fs.writeFileSync(htmlTarget, htmlContent, 'utf8');
console.log(`[Migrate] Created index.html`);

console.log('[Migrate] Student migration completed!');
