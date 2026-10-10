'use strict';

// 构建产物的路径入口。
//
// 教师服务通过 `require('@lumesync/student-ui/dist')`（或 require.resolve）
// 拿到这里导出的绝对路径，再配合 dist/current.json 解析当前版本，
// 因此消费方不需要 glob 目录，也不需要在教师仓库里硬编码学生仓库路径。
//
// 本文件必须是 CommonJS：教师服务是 CJS 包，用 require 读取它。

const fs = require('fs');
const path = require('path');

const packageRoot = path.join(__dirname, '..');
const srcDir = path.join(packageRoot, 'src');
const distDir = path.join(packageRoot, 'dist');
const manifestPath = path.join(distDir, 'manifest.json');
const currentPath = path.join(distDir, 'current.json');
const buildScriptPath = path.join(packageRoot, 'scripts', 'build.mjs');

// dist/current.json 由 scripts/build.mjs 写入，指向当前有效的版本目录。
function versionDir(version) {
    if (!isSafeVersion(version)) {
        throw new Error(`Invalid student UI version: ${JSON.stringify(version)}`);
    }
    return path.join(distDir, version);
}

function entryPath(version, entry = 'index.html') {
    return path.join(versionDir(version), entry);
}

function isSafeVersion(version) {
    return typeof version === 'string'
        && version.length > 0
        && version.length <= 128
        && /^[A-Za-z0-9._-]+$/.test(version)
        && version !== '.'
        && version !== '..';
}

function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
        return null;
    }
}

function readCurrent() {
    return readJson(currentPath);
}

function readManifest() {
    return readJson(manifestPath);
}

module.exports = {
    packageName: '@lumesync/student-ui',
    packageRoot,
    srcDir,
    distDir,
    manifestPath,
    currentPath,
    buildScriptPath,
    // 从工作区任意目录可执行的构建命令。
    buildCommand: 'pnpm --filter @lumesync/student-ui run build',
    directBuildCommand: `node ${buildScriptPath}`,
    isSafeVersion,
    versionDir,
    entryPath,
    readCurrent,
    readManifest
};
