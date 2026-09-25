const test = require('node:test');
const assert = require('node:assert/strict');

const {
    PLATFORM_METHODS,
    PLATFORM_REQUESTS,
    PLATFORM_EVENTS,
    PLATFORM_ERROR_CODES,
    createWebView2Adapter,
    createElectronAdapter,
    createNullAdapter,
    validateAdapter,
    ELECTRON_CHANNEL_PREFIX
} = require('../index.js');

const { HOST_ACTIONS } = require('@lumesync/native-contract');

/** 模拟现有 Windows 壳注入的 window.teacherHost。 */
function fakeBridge(overrides = {}) {
    const calls = [];
    const record = (name, impl) => (...args) => {
        calls.push({ name, args });
        return impl ? impl(...args) : null;
    };
    const bridge = {
        getConfig: record('getConfig', () => ({ teacherIp: '127.0.0.1', port: 3000 })),
        saveConfig: record('saveConfig', () => true),
        verifyPassword: record('verifyPassword', () => ({ ok: true })),
        getSettings: record('getSettings', () => ({ forceFullscreen: false })),
        saveSettings: record('saveSettings', () => true),
        importCourse: record('importCourse', () => ({ success: true, imported: ['lesson.lume'] })),
        exportCourse: record('exportCourse', () => ({ success: true, filePath: '/tmp/lesson.pdf' })),
        saveGeneratedPdf: record('saveGeneratedPdf', () => ({ success: true })),
        selectSubmissionDir: record('selectSubmissionDir', () => null),
        openLogDir: record('openLogDir', () => '/tmp/logs'),
        getLogDir: record('getLogDir', () => '/tmp/logs'),
        getSession: record('getSession', () => ({ role: 'host', clientId: 'teacher-1', token: 'secret-token' })),
        bootstrapSession: record('bootstrapSession', () => ({ role: 'host', clientId: 'teacher-1', token: 'secret-token' })),
        classStarted: record('classStarted'),
        classEnded: record('classEnded'),
        setFullscreen: record('setFullscreen'),
        minimizeWindow: record('minimizeWindow'),
        maximizeWindow: record('maximizeWindow'),
        closeWindow: record('closeWindow'),
        openWindow: record('openWindow'),
        beginWindowDrag: record('beginWindowDrag'),
        updateWindowDrag: record('updateWindowDrag'),
        endWindowDrag: record('endWindowDrag'),
        toggleDevTools: record('toggleDevTools'),
        ...overrides
    };
    return { bridge, calls };
}

test('WebView2 适配器实现完整接口，并把 UI 语义翻译到原生桥', async () => {
    const { bridge, calls } = fakeBridge();
    const platform = createWebView2Adapter(bridge);

    const validation = validateAdapter(platform);
    assert.equal(validation.ok, true, `缺少方法：${validation.missing.join(', ')}`);

    const opened = await platform.openCourse();
    assert.equal(opened.ok, true);
    assert.deepEqual(opened.value.imported, ['lesson.lume']);
    assert.equal(calls.find((call) => call.name === 'importCourse').args.length, 0);

    const exported = await platform.saveExport({ format: 'pdf', title: '课件' });
    assert.equal(exported.ok, true);
    assert.deepEqual(calls.find((call) => call.name === 'exportCourse').args[0], { format: 'pdf', title: '课件' });

    const logs = await platform.openLogs();
    assert.equal(logs.value, '/tmp/logs');
    assert.equal(calls.some((call) => call.name === 'openLogDir'), true);
});

test('用户取消与平台异常都被归一，不会抛给界面', async () => {
    const { bridge } = fakeBridge({
        importCourse: () => ({ success: false, canceled: true }),
        getSettings: () => { throw new Error('native failure'); }
    });
    const platform = createWebView2Adapter(bridge);

    const canceled = await platform.openCourse();
    assert.equal(canceled.ok, false);
    assert.equal(canceled.code, PLATFORM_ERROR_CODES.USER_CANCELED);

    const failed = await platform.getSettings();
    assert.equal(failed.ok, false);
    assert.equal(failed.code, PLATFORM_ERROR_CODES.FAILED);
    assert.match(failed.message, /native failure/);
});

test('未实现的能力显式返回 platform_not_implemented', async () => {
    const { bridge } = fakeBridge({ selectSubmissionDir: undefined, clearSession: undefined });
    const platform = createWebView2Adapter(bridge);

    const selected = await platform.selectSubmissionDirectory();
    assert.equal(selected.ok, false);
    assert.equal(selected.code, PLATFORM_ERROR_CODES.NOT_IMPLEMENTED);

    // 原生壳暴露但未真正实现的能力（native-contract 标记 implemented:false）
    const capabilities = platform.capabilities();
    assert.equal(capabilities.selectSubmissionDirectory.supported, false);
    assert.equal(capabilities.getConfig.supported, true);
    assert.equal(capabilities.setFullscreen.supported, true);
});

test('事件类调用是单向的，并记录到底层桥', () => {
    const { bridge, calls } = fakeBridge();
    const platform = createWebView2Adapter(bridge);

    assert.equal(platform.setFullscreen(true).ok, true);
    assert.equal(platform.beginWindowDrag({}).ok, true);
    assert.deepEqual(calls.find((call) => call.name === 'setFullscreen').args, [true]);
});

test('接口覆盖 native-contract 中已实现的全部 host 动作', () => {
    const implementedHostActions = Object.entries(HOST_ACTIONS)
        .filter(([, spec]) => spec.implemented && spec.transport !== 'local-stub')
        .map(([action]) => action);

    // 请求类方法要么与原生动作同名，要么通过 nativeAction 映射；事件类与原生同名。
    const mappedNativeActions = new Set([
        ...Object.entries(PLATFORM_REQUESTS).map(([name, spec]) => spec.nativeAction || name),
        ...Object.keys(PLATFORM_EVENTS)
    ]);

    const uncovered = implementedHostActions.filter((action) => !mappedNativeActions.has(action));
    assert.deepEqual(
        uncovered.filter((action) => action !== 'getRole'),
        [],
        `平台接口未覆盖的原生能力：${uncovered.join(', ')}`
    );
});

test('Electron 适配器按通道名调用 preload 的窄接口', async () => {
    const invocations = [];
    const events = [];
    const platform = createElectronAdapter({
        invoke: async (channel, payload) => {
            invocations.push({ channel, payload });
            if (channel === `${ELECTRON_CHANNEL_PREFIX}getSession`) return { role: 'host', clientId: 't', token: 'secret' };
            if (channel === `${ELECTRON_CHANNEL_PREFIX}openCourse`) return { ok: false, code: 'platform_user_canceled', message: '用户取消' };
            return true;
        },
        send: (channel, payload) => events.push({ channel, payload })
    });

    assert.equal(validateAdapter(platform).ok, true);
    const session = await platform.getSession();
    assert.equal(session.ok, true);
    assert.equal(session.value.token, 'secret');

    const canceled = await platform.openCourse();
    assert.equal(canceled.ok, false);
    assert.equal(canceled.code, 'platform_user_canceled');

    platform.setFullscreen(true);
    assert.deepEqual(events[0], { channel: `${ELECTRON_CHANNEL_PREFIX}setFullscreen`, payload: true });

    // 主进程抛错时也是归一结果
    const failing = createElectronAdapter({
        invoke: async () => { throw new Error('ipc down'); },
        send: () => {}
    });
    const result = await failing.getConfig();
    assert.equal(result.ok, false);
    assert.match(result.message, /ipc down/);
});

test('Electron 适配器缺少 preload 接口时直接抛错（配置错误不能静默）', () => {
    assert.throws(() => createElectronAdapter({ send: () => {} }), /需要 invoke 与 send/);
    assert.throws(() => createElectronAdapter({}), /需要 invoke 与 send/);
});

test('空适配器可用于测试与降级：所有能力都标记为未实现', async () => {
    const platform = createNullAdapter('test');
    const validation = validateAdapter(platform);
    assert.equal(validation.ok, true);
    assert.equal(validation.unsupported.length, PLATFORM_METHODS.length);
    assert.equal((await platform.getConfig()).code, PLATFORM_ERROR_CODES.NOT_IMPLEMENTED);
});

test('能力清单与接口定义一一对应', () => {
    const platform = createWebView2Adapter(fakeBridge().bridge);
    const capabilities = platform.capabilities();
    assert.deepEqual(Object.keys(capabilities).sort(), PLATFORM_METHODS.slice().sort());
    for (const [method, spec] of Object.entries(capabilities)) {
        assert.ok(['request', 'event'].includes(spec.kind), `${method} 缺少 kind`);
        assert.ok(spec.risk, `${method} 缺少 risk`);
        assert.ok(spec.summary, `${method} 缺少说明`);
    }
});

test('ESM 与 CJS 入口导出一致', async () => {
    const esm = await import('../index.mjs');
    const cjs = require('../index.js');
    assert.deepEqual(
        Object.keys(esm).filter((name) => name !== 'default').sort(),
        Object.keys(cjs).sort()
    );
});
