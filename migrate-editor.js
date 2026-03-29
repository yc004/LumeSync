// ========================================================
// 编辑器端迁移脚本
// 将 electron/main-editor.js 复制到 apps/editor/electron/main.js
// ========================================================

const fs = require('fs');
const path = require('path');

const sourceFile = path.join(__dirname, 'electron/main-editor.js');
const targetDir = path.join(__dirname, 'apps/editor/electron');
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
        /const \{ Logger \} = require\('\.\/logger\.js'\);/,
        "const { Logger } = require('../../common/electron/logger.js');"
    );

    content = content.replace(
        /icon: path\.join\(__dirname, '\.\.', 'build', 'icon-editor\.ico'\)/,
        "icon: path.join(__dirname, '../../../shared/build/icon-editor.ico')"
    );

    content = content.replace(
        /preload: path\.join\(__dirname, 'preload\.js'\)/,
        "preload: path.join(__dirname, '../../common/electron/preload.js')"
    );

    content = content.replace(
        /const serverPath = path\.join\(__dirname, '\.\.', 'server\.js'\);/,
        "const serverPath = path.join(__dirname, '../../../packages/server/index.js');"
    );

    // 更新 AI 配置路径
    content = content.replace(
        /const configPath = path\.join\(app\.getPath\('userData'\), 'ai-config\.json'\);/g,
        "const configPath = path.join(app.getPath('userData'), 'ai-config.json');"
    );

    fs.writeFileSync(targetFile, content, 'utf8');
    console.log(`[Migrate] Copied editor main process`);
}

// 复制 editor.js
const editorSource = path.join(__dirname, 'public/editor/02-editor-app.js');
const editorDir = path.join(__dirname, 'apps/editor/public/editor');
if (!fs.existsSync(editorDir)) {
    fs.mkdirSync(editorDir, { recursive: true });
    console.log(`[Migrate] Created directory: ${editorDir}`);
}

if (fs.existsSync(editorSource)) {
    const content = fs.readFileSync(editorSource, 'utf8');
    const editorTarget = path.join(editorDir, '02-editor-app.js');
    fs.writeFileSync(editorTarget, content, 'utf8');
    console.log(`[Migrate] Copied editor app`);
}

// 复制 editor.html
const htmlSource = path.join(__dirname, 'public/editor.html');
const htmlDir = path.join(__dirname, 'apps/editor/public');
const htmlTarget = path.join(htmlDir, 'editor.html');

if (!fs.existsSync(htmlDir)) {
    fs.mkdirSync(htmlDir, { recursive: true });
}

if (fs.existsSync(htmlSource)) {
    let content = fs.readFileSync(htmlSource, 'utf8');

    // 更新引擎路径
    content = content.replace(
        /<script type="text\/babel" src="engine\//g,
        '<script type="text/babel" src="/engine/src/'
    );

    // 更新组件路径
    content = content.replace(
        /<script type="text\/babel" src="editor\//g,
        '<script type="text/babel" src="/editor/'
    );

    fs.writeFileSync(htmlTarget, content, 'utf8');
    console.log(`[Migrate] Copied editor.html`);
}

console.log('[Migrate] Editor migration completed!');
