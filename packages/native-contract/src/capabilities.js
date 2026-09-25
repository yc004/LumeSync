// 角色能力清单。
//
// 每个动作声明：kind（rpc/event）、是否真正实现、payload 形状、风险等级。
// 用途有三个：
//   1. 原生壳按清单做 action 白名单校验，不再只按字符串分派；
//   2. 页面按清单生成类型，避免 window.teacherHost 上的方法漂移；
//   3. 测试可以对照 native/shell/src/main.cpp 的实际分派表，发现两端不一致。
//
// transport 取值：
//   native     经 WebView2 消息桥发到 C++ 壳
//   local      在页面里直接 resolve（例如 getRole）
//   local-stub 兼容占位，固定返回 null；不能当作已实现能力

const RISK = {
    READ: 'read',
    WRITE: 'write',
    SYSTEM: 'system'
};

const HOST_ACTIONS = {
    // ---- RPC ----
    getConfig: { kind: 'rpc', transport: 'native', implemented: true, risk: RISK.READ, summary: '读取教师本机配置' },
    saveConfig: { kind: 'rpc', transport: 'native', implemented: true, risk: RISK.WRITE, summary: '保存本机配置并重新导航' },
    verifyPassword: { kind: 'rpc', transport: 'native', implemented: true, risk: RISK.READ, summary: '校验管理密码哈希' },
    getSession: { kind: 'rpc', transport: 'native', implemented: true, risk: RISK.READ, summary: '读取本机 host 会话' },
    bootstrapSession: { kind: 'rpc', transport: 'native', implemented: true, risk: RISK.WRITE, summary: '经本机受保护通道获取 host 会话' },
    getSettings: { kind: 'rpc', transport: 'native', implemented: true, risk: RISK.READ, summary: '读取课堂与窗口设置' },
    saveSettings: { kind: 'rpc', transport: 'native', implemented: true, risk: RISK.WRITE, summary: '保存课堂与窗口设置' },
    importCourse: { kind: 'rpc', transport: 'native', implemented: true, risk: RISK.WRITE, summary: '本机选择并导入课件' },
    exportCourse: { kind: 'rpc', transport: 'native', implemented: true, risk: RISK.WRITE, summary: '导出 .lume 或 PDF' },
    saveGeneratedPdf: { kind: 'rpc', transport: 'native', implemented: true, risk: RISK.WRITE, summary: '保存页面生成的 PDF' },
    openLogDir: { kind: 'rpc', transport: 'native', implemented: true, risk: RISK.SYSTEM, summary: '打开日志目录' },
    getLogDir: { kind: 'rpc', transport: 'native', implemented: true, risk: RISK.READ, summary: '获取日志目录路径' },
    selectSubmissionDir: { kind: 'rpc', transport: 'native', implemented: false, risk: RISK.WRITE, summary: '选择提交目录（当前固定返回 null）' },
    getRole: { kind: 'rpc', transport: 'local', nativeDispatch: true, implemented: true, risk: RISK.READ, summary: '固定返回 host；页面本地 resolve，C++ 仍保留同名分支' },

    // ---- 单向事件 ----
    // classStarted/classEnded/setFullscreen 目前只在注入脚本里暴露，
    // native/shell/src/main.cpp 的 HandleEvent 没有对应分支（对照测试失败项），
    // 因此标为未实现：页面调用不会生效，需在原生壳补齐后再改回来。
    classStarted: { kind: 'event', transport: 'native', nativeDispatch: false, implemented: false, risk: RISK.SYSTEM, summary: '课堂开始（含全屏选项）', note: 'C++ HandleEvent 未分派，调用会被静默丢弃' },
    classEnded: { kind: 'event', transport: 'native', nativeDispatch: false, implemented: false, risk: RISK.SYSTEM, summary: '课堂结束', note: 'C++ HandleEvent 未分派' },
    setFullscreen: { kind: 'event', transport: 'native', nativeDispatch: false, implemented: false, risk: RISK.SYSTEM, summary: '切换全屏', note: 'C++ HandleEvent 未分派' },
    toggleDevTools: { kind: 'event', transport: 'native', implemented: true, risk: RISK.SYSTEM, summary: '开关调试面板' },
    minimizeWindow: { kind: 'event', transport: 'native', implemented: true, risk: RISK.SYSTEM, summary: '最小化窗口' },
    maximizeWindow: { kind: 'event', transport: 'native', implemented: true, risk: RISK.SYSTEM, summary: '最大化/还原窗口' },
    closeWindow: { kind: 'event', transport: 'native', implemented: true, risk: RISK.SYSTEM, summary: '关闭窗口' },
    openWindow: { kind: 'event', transport: 'native', implemented: true, risk: RISK.SYSTEM, summary: '打开子窗口' },
    beginWindowDrag: { kind: 'event', transport: 'native', implemented: true, risk: RISK.SYSTEM, summary: '开始拖动窗口' },
    updateWindowDrag: { kind: 'event', transport: 'native', implemented: true, risk: RISK.SYSTEM, summary: '拖动窗口（占位）' },
    endWindowDrag: { kind: 'event', transport: 'native', implemented: true, risk: RISK.SYSTEM, summary: '结束拖动窗口' }
};

const VIEWER_ACTIONS = {
    // ---- RPC ----
    getConfig: { kind: 'rpc', transport: 'native', implemented: true, risk: RISK.READ, summary: '读取学生本机配置' },
    saveConfig: { kind: 'rpc', transport: 'native', implemented: true, risk: RISK.WRITE, summary: '保存教师地址与端口' },
    verifyPassword: { kind: 'rpc', transport: 'native', implemented: true, risk: RISK.READ, summary: '校验管理密码哈希' },
    getAutostart: { kind: 'rpc', transport: 'native', implemented: true, risk: RISK.READ, summary: '读取开机自启配置' },
    setAutostart: { kind: 'rpc', transport: 'native', implemented: true, risk: RISK.SYSTEM, summary: '设置开机自启' },
    getSession: { kind: 'rpc', transport: 'native', implemented: true, risk: RISK.READ, summary: '读取 viewer 会话' },
    bootstrapSession: { kind: 'rpc', transport: 'native', implemented: true, risk: RISK.WRITE, summary: '经 WinHTTP 领取 viewer 会话' },
    getDeviceInfo: { kind: 'rpc', transport: 'native', implemented: true, risk: RISK.READ, summary: '读取设备名、MAC 与 clientId' },
    powerControl: { kind: 'rpc', transport: 'native', implemented: true, risk: RISK.SYSTEM, summary: '关机/重启（由课堂命令触发）' },
    takeScreenshot: { kind: 'rpc', transport: 'native', implemented: true, risk: RISK.SYSTEM, summary: '截屏并返回 JPEG data URL' },
    getRole: { kind: 'rpc', transport: 'local', nativeDispatch: true, implemented: true, risk: RISK.READ, summary: '固定返回 viewer；页面本地 resolve，C++ 仍保留同名分支' },

    // ---- 单向事件 ----
    classStarted: { kind: 'event', transport: 'native', implemented: true, risk: RISK.SYSTEM, summary: '课堂开始' },
    classEnded: { kind: 'event', transport: 'native', implemented: true, risk: RISK.SYSTEM, summary: '课堂结束' },
    setFullscreen: { kind: 'event', transport: 'native', implemented: true, risk: RISK.SYSTEM, summary: '切换全屏' },
    manualRetry: { kind: 'event', transport: 'native', implemented: true, risk: RISK.SYSTEM, summary: '手动重连' },
    setAdminPassword: { kind: 'event', transport: 'native', implemented: true, risk: RISK.WRITE, summary: '下发管理密码哈希' },
    toggleDevTools: { kind: 'event', transport: 'native', implemented: true, risk: RISK.SYSTEM, summary: '开关调试面板' },
    minimizeWindow: { kind: 'event', transport: 'native', implemented: true, risk: RISK.SYSTEM, summary: '最小化窗口' },
    maximizeWindow: { kind: 'event', transport: 'native', implemented: true, risk: RISK.SYSTEM, summary: '非授课状态最大化/还原窗口' },
    closeWindow: { kind: 'event', transport: 'native', implemented: true, risk: RISK.SYSTEM, summary: '关闭窗口' },

    // ---- 兼容占位：固定返回 null，不能视为学生端能力 ----
    getSettings: { kind: 'rpc', transport: 'local-stub', implemented: false, risk: RISK.READ, summary: '兼容占位，固定返回 null' },
    saveSettings: { kind: 'rpc', transport: 'local-stub', implemented: false, risk: RISK.WRITE, summary: '兼容占位，固定返回 null' },
    importCourse: { kind: 'rpc', transport: 'local-stub', implemented: false, risk: RISK.WRITE, summary: '兼容占位，固定返回 null' },
    exportCourse: { kind: 'rpc', transport: 'local-stub', implemented: false, risk: RISK.WRITE, summary: '兼容占位，固定返回 null' },
    openLogDir: { kind: 'rpc', transport: 'local-stub', implemented: false, risk: RISK.SYSTEM, summary: '兼容占位，固定返回 null' },
    getLogDir: { kind: 'rpc', transport: 'local-stub', implemented: false, risk: RISK.READ, summary: '兼容占位，固定返回 null' },
    selectSubmissionDir: { kind: 'rpc', transport: 'local-stub', implemented: false, risk: RISK.WRITE, summary: '兼容占位，固定返回 null' }
};

/** 原生壳 -> 页面的消息（不需要 action 白名单，但仍需按类型校验）。 */
const NATIVE_TO_PAGE_KINDS = ['rpc-result', 'window-maximized', 'window-unmaximized'];

const ACTIONS_BY_ROLE = {
    host: HOST_ACTIONS,
    viewer: VIEWER_ACTIONS
};

// nativeDispatch 默认跟随 transport；显式声明过的（例如 getRole）保持不变。
for (const table of Object.values(ACTIONS_BY_ROLE)) {
    for (const spec of Object.values(table)) {
        if (spec.nativeDispatch === undefined) spec.nativeDispatch = spec.transport === 'native';
    }
}

function getActionSpec(role, action) {
    const table = ACTIONS_BY_ROLE[role];
    if (!table) return null;
    return Object.prototype.hasOwnProperty.call(table, action) ? table[action] : null;
}

/**
 * 原生壳校验页面请求的动作。
 * 未在清单中的动作、角色不匹配的动作、以及未实现的占位动作都必须被拒绝。
 */
function authorizeAction(role, action, kind) {
    const spec = getActionSpec(role, action);
    if (!spec) return { ok: false, code: 'native_action_unknown', message: `未声明的原生动作：${action}` };
    if (kind && spec.kind !== kind) {
        return { ok: false, code: 'native_action_kind_mismatch', message: `${action} 是 ${spec.kind}，不能按 ${kind} 发送` };
    }
    if (!spec.implemented) {
        return { ok: false, code: 'native_action_not_implemented', message: `${action} 在当前原生壳中未实现` };
    }
    return { ok: true, code: null, spec };
}

function listActions(role, options = {}) {
    const table = ACTIONS_BY_ROLE[role] || {};
    return Object.entries(table)
        .filter(([, spec]) => (options.includeUnimplemented ? true : spec.implemented))
        .filter(([, spec]) => (options.kind ? spec.kind === options.kind : true))
        .map(([action]) => action)
        .sort();
}

module.exports = {
    RISK,
    HOST_ACTIONS,
    VIEWER_ACTIONS,
    ACTIONS_BY_ROLE,
    NATIVE_TO_PAGE_KINDS,
    getActionSpec,
    authorizeAction,
    listActions
};
