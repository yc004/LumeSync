// The teacher UI only attaches its host credential to same-origin API calls.
// The native bridge remains the source of the session in direct mode.
//
// 这份包装必须同时满足两个条件，否则会出现"路由要求 host bearer、页面请求却不带凭证"：
//   1. 覆盖包内所有调用点（下面的 `const fetch` 提供词法作用域内的一致引用）；
//   2. 装到 window 上，让内联脚本和课件运行时（window.__LumeSyncApiFetch）也走同一份实现。
// 只做第 1 条时，构建产物过期或构建失败都会让页面悄悄退回不带凭证的原生 fetch。
const browserFetch = window.fetch.bind(window);
const fetch = async (input, init = {}) => {
    const rawUrl = typeof input === 'string' ? input : input?.url;
    const url = new URL(rawUrl || '', window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) {
        return browserFetch(input, init);
    }

    let token = '';
    try {
        const session = await window.teacherHost?.getSession?.();
        token = session?.token ? String(session.token) : '';
    } catch (_) {}
    if (!token) token = String(window.__LumeSyncIdentity?.token || '');

    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return browserFetch(input, { ...init, headers });
};

window.__LumeSyncApiFetch = fetch;
if (!window.__LumeSyncFetchInstalled) {
    window.__LumeSyncFetchInstalled = true;
    window.fetch = fetch;
}
