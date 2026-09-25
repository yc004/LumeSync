// 教师端平台能力接口（platform surface）。
//
// 设计约束（teacher-cross-platform-relay.md §3、§9 阶段 1）：
//   - 业务 UI 不直接依赖某个原生壳，而是调用这里的窄接口；
//   - 现有 Windows WebView2 壳（window.teacherHost）在过渡期继续可用，
//     由 createWebView2Adapter 适配；
//   - 跨平台桌面宿主（Electron）实现同一接口，页面经受限 preload IPC 调用，
//     不获得 Node.js 全权限；
//   - 能力清单与 packages/native-contract 的动作表保持单一来源，
//     未实现的能力必须显式标记，不能在 UI 层静默失败。

const { HOST_ACTIONS, RISK } = require('@lumesync/native-contract');

// 请求/响应类能力：调用方等待结果。
const PLATFORM_REQUESTS = {
    getConfig: { summary: '读取本机教师配置', risk: RISK.READ },
    saveConfig: { summary: '保存本机教师配置', risk: RISK.WRITE },
    verifyPassword: { summary: '校验管理密码哈希', risk: RISK.READ },
    getSettings: { summary: '读取课堂与窗口设置', risk: RISK.READ },
    saveSettings: { summary: '保存课堂与窗口设置', risk: RISK.WRITE },
    openCourse: { summary: '本机选择并导入课件', risk: RISK.WRITE, nativeAction: 'importCourse' },
    saveExport: { summary: '导出 .lume 或 PDF 到本机', risk: RISK.WRITE, nativeAction: 'exportCourse' },
    saveGeneratedPdf: { summary: '保存页面生成的 PDF', risk: RISK.WRITE },
    selectSubmissionDirectory: { summary: '选择提交目录', risk: RISK.WRITE, nativeAction: 'selectSubmissionDir' },
    getSubmissionDirectory: { summary: '读取当前提交目录', risk: RISK.READ },
    openLogs: { summary: '打开日志目录', risk: RISK.SYSTEM, nativeAction: 'openLogDir' },
    getLogDirectory: { summary: '读取日志目录路径', risk: RISK.READ, nativeAction: 'getLogDir' },
    getSession: { summary: '读取本机受保护会话凭证', risk: RISK.READ },
    bootstrapSession: { summary: '获取 host 会话（仅本机通道）', risk: RISK.WRITE },
    clearSession: { summary: '清除本机保存的会话凭证', risk: RISK.WRITE },
    getWindowState: { summary: '读取窗口状态（最大化/全屏）', risk: RISK.READ }
};

// 单向事件：调用方不等待结果。
const PLATFORM_EVENTS = {
    classStarted: { summary: '课堂开始（可带全屏选项）', risk: RISK.SYSTEM },
    classEnded: { summary: '课堂结束', risk: RISK.SYSTEM },
    setFullscreen: { summary: '切换全屏', risk: RISK.SYSTEM },
    minimizeWindow: { summary: '最小化窗口', risk: RISK.SYSTEM },
    maximizeWindow: { summary: '最大化/还原窗口', risk: RISK.SYSTEM },
    closeWindow: { summary: '关闭窗口', risk: RISK.SYSTEM },
    openWindow: { summary: '打开子窗口', risk: RISK.SYSTEM },
    beginWindowDrag: { summary: '开始拖动窗口', risk: RISK.SYSTEM },
    updateWindowDrag: { summary: '拖动窗口（占位）', risk: RISK.SYSTEM },
    endWindowDrag: { summary: '结束拖动窗口', risk: RISK.SYSTEM },
    toggleDevTools: { summary: '开关调试面板', risk: RISK.SYSTEM }
};

const PLATFORM_METHODS = [...Object.keys(PLATFORM_REQUESTS), ...Object.keys(PLATFORM_EVENTS)];

/** 归一化成功结果。 */
function ok(value) {
    return { ok: true, value: value === undefined ? null : value, code: null, message: null };
}

/** 归一化失败结果：能力缺失、平台错误、用户取消要能区分。 */
function fail(code, message, extra = {}) {
    return { ok: false, value: null, code, message: message || code, ...extra };
}

const PLATFORM_ERROR_CODES = {
    NOT_IMPLEMENTED: 'platform_not_implemented',
    INVALID_ARGUMENT: 'platform_invalid_argument',
    USER_CANCELED: 'platform_user_canceled',
    UNAVAILABLE: 'platform_unavailable',
    FAILED: 'platform_failed'
};

/** 把任意返回值/异常包成归一结果。 */
async function runPlatformCall(fn, args, { allowEmpty = true } = {}) {
    try {
        const value = await fn(...args);
        if (!allowEmpty && (value === undefined || value === null)) {
            return fail(PLATFORM_ERROR_CODES.UNAVAILABLE, '平台未返回结果');
        }
        return ok(value === undefined ? null : value);
    } catch (err) {
        return fail(PLATFORM_ERROR_CODES.FAILED, err && err.message ? err.message : String(err));
    }
}

module.exports = {
    PLATFORM_REQUESTS,
    PLATFORM_EVENTS,
    PLATFORM_METHODS,
    PLATFORM_ERROR_CODES,
    ok,
    fail,
    runPlatformCall
};
