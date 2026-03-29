// ========================================================
// 教师端迁移脚本
// 将 electron/main-teacher.js 复制到 apps/teacher/electron/main.js
// ========================================================

const fs = require('fs');
const path = require('path');

const sourceFile = path.join(__dirname, 'electron/main-teacher.js');
const targetDir = path.join(__dirname, 'apps/teacher/electron');
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
        /const serverPath = path\.join\(__dirname, '\.\.', 'server\.js'\);/,
        "const serverPath = path.join(__dirname, '../../../packages/server/index.js');"
    );

    content = content.replace(
        /const \{ loadSettings, saveSettings \} = require\('\.\/config\.js'\);/,
        "const { loadSettings, saveSettings } = require('../../common/electron/config.js');"
    );

    content = content.replace(
        /const \{ Logger \} = require\('\.\/logger\.js'\);/,
        "const { Logger } = require('../../common/electron/logger.js');"
    );

    content = content.replace(
        /const iconPath = path\.join\(__dirname, '\.\.', 'assets', 'tray-icon\.png'\);/,
        "const iconPath = path.join(__dirname, '../../../shared/assets/tray-icon.png');"
    );

    fs.writeFileSync(targetFile, content, 'utf8');
    console.log(`[Migrate] Copied teacher main process`);
}

// 复制 preload.js
const preloadSource = path.join(__dirname, 'electron/preload.js');
const preloadTarget = path.join(__dirname, 'apps/teacher/electron/preload.js');
if (fs.existsSync(preloadSource)) {
    const content = fs.readFileSync(preloadSource, 'utf8');
    fs.writeFileSync(preloadTarget, content, 'utf8');
    console.log(`[Migrate] Copied preload.js`);
}

// 复制 config.js 和 logger.js 到 common
const commonDir = path.join(__dirname, 'apps/common/electron');
if (!fs.existsSync(commonDir)) {
    fs.mkdirSync(commonDir, { recursive: true });
    console.log(`[Migrate] Created directory: ${commonDir}`);
}

const configSource = path.join(__dirname, 'electron/config.js');
const configTarget = path.join(commonDir, 'config.js');
if (fs.existsSync(configSource)) {
    const content = fs.readFileSync(configSource, 'utf8');
    fs.writeFileSync(configTarget, content, 'utf8');
    console.log(`[Migrate] Copied config.js to common`);
}

const loggerSource = path.join(__dirname, 'electron/logger.js');
const loggerTarget = path.join(commonDir, 'logger.js');
if (fs.existsSync(loggerSource)) {
    const content = fs.readFileSync(loggerSource, 'utf8');
    fs.writeFileSync(loggerTarget, content, 'utf8');
    console.log(`[Migrate] Copied logger.js to common`);
}

// 复制 index.html
const htmlSource = path.join(__dirname, 'public/index.html');
const htmlTarget = path.join(__dirname, 'apps/teacher/public/index.html');
const htmlDir = path.join(__dirname, 'apps/teacher/public');
if (!fs.existsSync(htmlDir)) {
    fs.mkdirSync(htmlDir, { recursive: true });
    console.log(`[Migrate] Created directory: ${htmlDir}`);
}

if (fs.existsSync(htmlSource)) {
    let content = fs.readFileSync(htmlSource, 'utf8');

    // 更新引擎路径
    content = content.replace(
        /<script type="text\/babel" src="\/engine\//g,
        '<script type="text/babel" src="/engine/src/'
    );

    content = content.replace(
        /<script type="text\/babel" src="\/components\//g,
        '<script type="text/babel" src="/engine/src/components/'
    );

    fs.writeFileSync(htmlTarget, content, 'utf8');
    console.log(`[Migrate] Copied index.html`);
}

console.log('[Migrate] Teacher migration completed!');
