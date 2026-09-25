// 平台适配器：把具体原生壳映射到统一的 teacher-platform 接口。
//
//   createWebView2Adapter(window.teacherHost)  —— 过渡期：现有 Windows C++/WebView2 壳
//   createElectronAdapter({ invoke, send })    —— 目标：跨平台 Electron 主进程（受限 preload）
//
// 两个适配器都返回同一组 PLATFORM_METHODS，并给出 capabilities（哪些能力真的可用）。
// 未实现的能力返回 platform_not_implemented，而不是 undefined 或静默失败。

const { HOST_ACTIONS } = require('@lumesync/native-contract');
const {
    PLATFORM_REQUESTS,
    PLATFORM_EVENTS,
    PLATFORM_METHODS,
    PLATFORM_ERROR_CODES,
    ok,
    fail,
    runPlatformCall
} = require('./interface');

const ELECTRON_CHANNEL_PREFIX = 'lumesync:platform:';

function isFunction(value) {
    return typeof value === 'function';
}

function requireBridge(bridge) {
    if (!bridge || typeof bridge !== 'object') {
        throw new Error('createWebView2Adapter 需要原生注入的桥对象（window.teacherHost）');
    }
    return bridge;
}

/**
 * WebView2/现有原ative 壳适配器。
 * 只做映射与归一化，不假设桥的能力：缺失的方法在 capabilities 里标为未实现。
 */
function createWebView2Adapter(bridge, options = {}) {
    const host = requireBridge(bridge);
    const has = (name) => isFunction(host[name]);
    const notImplemented = (method) => () => fail(
        PLATFORM_ERROR_CODES.NOT_IMPLEMENTED,
        `当前原生壳未实现 ${method}`,
        { method }
    );

    const request = (method, nativeMethod, mapper) => async (...args) => {
        if (!has(nativeMethod)) return fail(PLATFORM_ERROR_CODES.NOT_IMPLEMENTED, `当前原生壳未实现 ${method}`, { method });
        const call = () => host[nativeMethod](...args);
        const result = await runPlatformCall(mapper ? () => mapper(call) : call, []);
        // 桥可能用 null 表示"用户取消"
        if (result.ok && result.value === null && options.treatNullAsCanceled !== false) {
            return fail(PLATFORM_ERROR_CODES.USER_CANCELED, `${method} 未返回结果（可能被取消）`, { method });
        }
        return result;
    };

    const event = (nativeMethod) => (...args) => {
        if (!has(nativeMethod)) return fail(PLATFORM_ERROR_CODES.NOT_IMPLEMENTED, `当前原生壳未实现 ${nativeMethod}`, { method: nativeMethod });
        try {
            host[nativeMethod](...args);
            return ok(true);
        } catch (err) {
            return fail(PLATFORM_ERROR_CODES.FAILED, err && err.message ? err.message : String(err));
        }
    };

    const adapter = {
        name: 'webview2',
        // ---- 请求 ----
        getConfig: request('getConfig', 'getConfig'),
        saveConfig: request('saveConfig', 'saveConfig'),
        verifyPassword: request('verifyPassword', 'verifyPassword'),
        getSettings: request('getSettings', 'getSettings'),
        saveSettings: request('saveSettings', 'saveSettings'),
        // 命名与原生桥不同：UI 用平台语义，适配器负责翻译
        openCourse: async () => {
            if (!has('importCourse')) return fail(PLATFORM_ERROR_CODES.NOT_IMPLEMENTED, '当前原生壳未实现 openCourse', { method: 'openCourse' });
            const result = await runPlatformCall(() => host.importCourse(), []);
            if (!result.ok) return result;
            const value = result.value;
            if (value && value.canceled) return fail(PLATFORM_ERROR_CODES.USER_CANCELED, '用户取消导入', { method: 'openCourse' });
            return ok(value);
        },
        saveExport: request('saveExport', 'exportCourse'),
        saveGeneratedPdf: request('saveGeneratedPdf', 'saveGeneratedPdf'),
        selectSubmissionDirectory: request('selectSubmissionDirectory', 'selectSubmissionDir'),
        getSubmissionDirectory: has('getSubmissionDir') ? request('getSubmissionDirectory', 'getSubmissionDir') : notImplemented('getSubmissionDirectory'),
        openLogs: request('openLogs', 'openLogDir'),
        getLogDirectory: request('getLogDirectory', 'getLogDir'),
        getSession: request('getSession', 'getSession'),
        bootstrapSession: request('bootstrapSession', 'bootstrapSession'),
        clearSession: has('clearSession') ? request('clearSession', 'clearSession') : notImplemented('clearSession'),
        getWindowState: has('getWindowState') ? request('getWindowState', 'getWindowState') : notImplemented('getWindowState'),
        // ---- 事件 ----
        classStarted: event('classStarted'),
        classEnded: event('classEnded'),
        setFullscreen: event('setFullscreen'),
        minimizeWindow: event('minimizeWindow'),
        maximizeWindow: event('maximizeWindow'),
        closeWindow: event('closeWindow'),
        openWindow: event('openWindow'),
        beginWindowDrag: event('beginWindowDrag'),
        updateWindowDrag: event('updateWindowDrag'),
        endWindowDrag: event('endWindowDrag'),
        toggleDevTools: event('toggleDevTools'),
        // ---- 诊断 ----
        raw: host
    };

    return withCapabilities(adapter, (method) => {
        const nativeAction = PLATFORM_REQUESTS[method] && PLATFORM_REQUESTS[method].nativeAction;
        if (nativeAction) {
            const spec = HOST_ACTIONS[nativeAction];
            if (spec && !spec.implemented) return false;
        }
        // 事件的命名与原生桥一致，请求类方法按映射表判断
        return has(method) || has(nativeMethodFor(method));
    });
}

function nativeMethodFor(method) {
    const spec = PLATFORM_REQUESTS[method];
    if (spec && spec.nativeAction) return spec.nativeAction;
    return method;
}

/**
 * Electron 适配器。
 * 主进程实现 `lumesync:platform:<method>` 通道；invoke 用于请求，send 用于事件。
 * 页面侧只能拿到这两个函数（受限 preload），拿不到 Node.js 权限。
 */
function createElectronAdapter({ invoke, send, channelPrefix = ELECTRON_CHANNEL_PREFIX } = {}) {
    if (!isFunction(invoke) || !isFunction(send)) {
        throw new Error('createElectronAdapter 需要 invoke 与 send 函数（preload 暴露的窄接口）');
    }

    const adapter = { name: 'electron' };

    for (const method of Object.keys(PLATFORM_REQUESTS)) {
        adapter[method] = async (...args) => {
            try {
                const result = await invoke(`${channelPrefix}${method}`, args.length > 1 ? args : args[0]);
                // 主进程既可以返回归一结果，也可以直接返回业务值
                if (result && typeof result === 'object' && typeof result.ok === 'boolean') return result;
                if (result === null || result === undefined) {
                    return fail(PLATFORM_ERROR_CODES.UNAVAILABLE, `${method} 未返回结果`, { method });
                }
                return ok(result);
            } catch (err) {
                return fail(PLATFORM_ERROR_CODES.FAILED, err && err.message ? err.message : String(err), { method });
            }
        };
    }

    for (const method of Object.keys(PLATFORM_EVENTS)) {
        adapter[method] = (...args) => {
            try {
                send(`${channelPrefix}${method}`, args.length > 1 ? args : args[0]);
                return ok(true);
            } catch (err) {
                return fail(PLATFORM_ERROR_CODES.FAILED, err && err.message ? err.message : String(err), { method });
            }
        };
    }

    return withCapabilities(adapter, () => true);
}

/** 测试与降级用：所有请求/事件都返回 not_implemented。 */
function createNullAdapter(name = 'null') {
    const adapter = { name };
    for (const method of Object.keys(PLATFORM_REQUESTS)) {
        adapter[method] = async () => fail(PLATFORM_ERROR_CODES.NOT_IMPLEMENTED, `${name} 适配器未实现 ${method}`, { method });
    }
    for (const method of Object.keys(PLATFORM_EVENTS)) {
        adapter[method] = () => fail(PLATFORM_ERROR_CODES.NOT_IMPLEMENTED, `${name} 适配器未实现 ${method}`, { method });
    }
    return withCapabilities(adapter, () => false);
}

function withCapabilities(adapter, supports) {
    adapter.capabilities = () => {
        const result = {};
        for (const method of PLATFORM_METHODS) {
            result[method] = {
                supported: !!supports(method),
                kind: PLATFORM_REQUESTS[method] ? 'request' : 'event',
                risk: (PLATFORM_REQUESTS[method] || PLATFORM_EVENTS[method]).risk,
                summary: (PLATFORM_REQUESTS[method] || PLATFORM_EVENTS[method]).summary
            };
        }
        return result;
    };
    return adapter;
}

/** 校验一个适配器是否实现了完整接口（缺哪些方法一目了然）。 */
function validateAdapter(adapter) {
    if (!adapter || typeof adapter !== 'object') {
        return { ok: false, missing: PLATFORM_METHODS.slice(), unsupported: [] };
    }
    const missing = PLATFORM_METHODS.filter((method) => !isFunction(adapter[method]));
    const capabilities = isFunction(adapter.capabilities) ? adapter.capabilities() : null;
    const unsupported = capabilities
        ? PLATFORM_METHODS.filter((method) => capabilities[method] && !capabilities[method].supported)
        : [];
    return { ok: missing.length === 0, missing, unsupported, capabilities };
}

module.exports = {
    ELECTRON_CHANNEL_PREFIX,
    createWebView2Adapter,
    createElectronAdapter,
    createNullAdapter,
    validateAdapter,
    withCapabilities
};
