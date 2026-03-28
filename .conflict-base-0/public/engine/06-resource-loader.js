// ========================================================
// 资源调度工具函数
// 作用：加载课程依赖脚本，优先局域网，失败自动切公网
// ========================================================

const loadScriptWithFallback = (localSrc, publicSrc) => {
    const fileName = localSrc.split('/').pop();
    return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = localSrc;
        let hasError = false;

        const errorHandler = (event) => {
            if (hasError) return;
            hasError = true;
            window.removeEventListener('error', errorHandler);
            loadPublicScript(publicSrc, resolve);
        };

        window.addEventListener('error', errorHandler, { once: true });

        script.onload = () => {
            if (hasError) return;
            window.removeEventListener('error', errorHandler);
            console.log('[ResourceLoader] OK: ' + fileName);
            resolve(true);
        };

        script.onerror = () => {
            if (hasError) return;
            hasError = true;
            window.removeEventListener('error', errorHandler);
            loadPublicScript(publicSrc, resolve);
        };

        document.head.appendChild(script);
    });
};

const loadPublicScript = (publicSrc, resolve) => {
    const fileName = publicSrc.split('/').pop();
    const fallbackScript = document.createElement('script');
    fallbackScript.src = publicSrc;
    fallbackScript.onload = () => {
        console.log('[ResourceLoader] OK (CDN): ' + fileName);
        resolve(true);
    };
    fallbackScript.onerror = () => {
        console.error('[ResourceLoader] FAIL: ' + fileName);
        resolve(false);
    };
    document.head.appendChild(fallbackScript);
};

const checkModelUrlValidity = async (urls) => {
    if (!urls) return '';
    try {
        const testUrl = urls.local.endsWith('/')
            ? urls.local + 'tiny_face_detector_model-weights_manifest.json'
            : urls.local + '/tiny_face_detector_model-weights_manifest.json';
        const res = await fetch(testUrl, { method: 'HEAD', cache: 'no-cache' });
        if (res.ok) {
            console.log('[ResourceLoader] LAN model OK: ' + urls.local);
            return urls.local;
        }
    } catch (err) {}
    console.warn('[ResourceLoader] LAN model unreachable, using CDN: ' + urls.public);
    return urls.public;
};
