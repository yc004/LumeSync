'use strict';

// Electron 教师壳的安全守卫（纯函数，便于脱离 Electron 单元测试）。
//
// 主进程只有两处把「页面来的输入」变成「本机操作」，两处都必须先过守卫：
//   1. 页面来源：只有本机课堂服务（127.0.0.1:<port>）加载的页面才能调用原生能力，
//      否则任意被打开的远程页面都能读设置、写文件、开目录；
//   2. 课件路径：导入/导出只允许教师课件目录以内的相对路径，否则就是目录穿越。
//
// 这两条一旦回归是提权与越权写文件，不是普通功能缺陷，所以抽出来单独测。

const path = require('node:path');

/** 本机课堂服务地址（不带尾斜杠）。 */
function teacherPageBase(port) {
    return `http://127.0.0.1:${Number(port)}`;
}

/**
 * 页面是否来自本机课堂服务。
 *
 * 必须带路径分隔，因此前缀伪装（形如 `http://127.0.0.1:3000.evil.example`）不算命中；
 * 来源不明（空值、非字符串、别的 host/端口、file:/data:/about: 等）一律拒绝。
 *
 * @param {unknown} url 页面地址（通常是 event.senderFrame.url）
 * @param {unknown} base `teacherPageBase(port)` 的结果
 */
function isTeacherPageUrl(url, base) {
    if (typeof url !== 'string' || url === '') return false;
    if (typeof base !== 'string' || base === '') return false;
    return url.startsWith(`${base}/`);
}

/**
 * 把课件相对路径解析到课件目录内的绝对路径；越界、绝对路径或空值直接抛错。
 *
 * @param {string} coursesDir 课件目录（绝对或相对都会被 resolve）
 * @param {unknown} relative 页面给出的相对路径
 */
function safeCoursePath(coursesDir, relative) {
    if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)) {
        throw new Error('无效课件路径');
    }
    const root = path.resolve(coursesDir);
    const target = path.resolve(root, relative);
    if (!target.startsWith(`${root}${path.sep}`)) {
        throw new Error('课件路径越界');
    }
    return target;
}

module.exports = { teacherPageBase, isTeacherPageUrl, safeCoursePath };
