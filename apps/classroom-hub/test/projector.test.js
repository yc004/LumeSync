// 固定机只读投影界面（GET /projector）。
//
// 判定标准（来自设计 §7 与 [教室 Hub] §2）：
//   - 页面只服务固定机本机：局域网来源即使带管理凭证也拿不到页面；
//   - 页面本身不含验证码、不含管理凭证——凭证由操作者用 #token= 带入，由页面自己去读屏幕接口；
//   - 页面必须能在没有外网的教室局域网里工作，因此不允许任何外部资源引用；
//   - 投影界面不是「验证码的第二个出口」：它只是 /api/hub/screen 的一个本机消费者。

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    TEST_HOST_TOKEN,
    ADMIN_HEADERS,
    startTestHub,
    pairTeacher,
    readScreen
} = require('./helpers');

function fetchText(hub, path) {
    return fetch(`${hub.url()}${path}`, { headers: ADMIN_HEADERS });
}

test('投影界面在本机可打开，且响应里没有验证码与管理凭证', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    // 先制造一个真实的配对请求，确保「此时确实存在验证码」再断言页面不含它。
    const paired = await pairTeacher(hub, { deviceKey: 'device-key-teacher-1' });
    const screen = await readScreen(hub);
    const code = screen.body.pairing.code;
    assert.match(code, /^\d{8}$/, '前置条件：固定机屏幕上应该有 8 位验证码');

    const response = await fetchText(hub, '/projector');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') || '', /text\/html/);
    assert.equal(response.headers.get('cache-control'), 'no-store');

    const html = await response.text();
    assert.ok(html.includes('LumeSync 教室固定机'), '页面应说明自己是固定机界面');
    assert.ok(!html.includes(code), '页面源码不得包含验证码');
    assert.ok(!html.includes(TEST_HOST_TOKEN), '页面源码不得包含管理凭证');
    assert.ok(!html.includes(hub.config.hostToken), '页面源码不得包含管理凭证');
});

test('投影界面只服务本机：局域网来源被拒绝且拿到的是 JSON 错误', async (t) => {
    // 注入 isLoopback=false 模拟局域网来源，验证规则本身（与屏幕接口的边界测试一致）。
    const hub = await startTestHub({ mode: 'relay', isLoopback: () => false });
    t.after(() => hub.stop());

    const response = await fetchText(hub, '/projector');
    assert.equal(response.status, 403);
    assert.match(response.headers.get('content-type') || '', /application\/json/);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(body.code, 'host_authorization_required');
    assert.ok(!String(body.message).includes('<'), '拒绝响应不应回显页面内容');
});

test('投影界面不引用任何外部资源（教室局域网通常没有外网）', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    const html = await (await fetchText(hub, '/projector')).text();
    const external = [
        /(?:src|href)\s*=\s*["']\s*(?:https?:)?\/\//i,
        /@import\s+(?:url\()?["']?\s*(?:https?:)?\/\//i,
        /url\(\s*["']?(?:https?:)?\/\//i,
        /cdn\./i
    ];
    for (const pattern of external) {
        assert.ok(!pattern.test(html), `不应出现外部资源引用：${pattern}`);
    }
    // 页面必须自己声明编码与中文语言，否则固定机浏览器可能按本地默认编码渲染。
    assert.match(html, /<html lang="zh-CN">/);
    assert.match(html, /<meta charset="utf-8">/);
});

test('投影界面在直接模式下也能打开，由页面自己说明中继已关闭', async (t) => {
    const hub = await startTestHub({ mode: 'direct' });
    t.after(() => hub.stop());

    const response = await fetchText(hub, '/projector');
    assert.equal(response.status, 200, '直接模式下也应给出可读页面，而不是 JSON 404');
    const html = await response.text();
    assert.ok(html.includes('中继桥未开启'), '页面应带有直接模式/中继关闭的说明文案');
});

test('投影地址带管理凭证片段，且片段不进入路径与查询串', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    const withToken = hub.projectorUrl();
    assert.equal(withToken, `${hub.url()}/projector#token=${hub.config.hostToken}`);
    assert.ok(!withToken.includes('?token='), '凭证必须放在片段里，不能放在查询串（会进日志与 Referer）');

    const bare = hub.projectorUrl({ withToken: false });
    assert.equal(bare, `${hub.url()}/projector`);
    assert.ok(!bare.includes(hub.config.hostToken));
});

test('投影路由不放宽 404 兜底：同前缀的其它路径仍然 404', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    for (const path of ['/projector/index.html', '/projector/../package.json', '/projectors']) {
        const response = await fetchText(hub, path);
        const contentType = response.headers.get('content-type') || '';
        assert.ok(
            response.status === 404 || response.status === 403,
            `${path} 不应被投影路由接住（实际 ${response.status}）`
        );
        assert.ok(!contentType.includes('text/html'), `${path} 不应返回页面（实际 ${contentType}）`);
    }
});
