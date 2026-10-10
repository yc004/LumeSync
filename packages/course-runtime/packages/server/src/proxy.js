// ========================================================
// 代理路由和下载缓存
// ========================================================

const path = require('path');
const fs = require('fs');
const { config } = require('./config');

// 固定 URL 映射
const KNOWN_FILE_URLS = {
    'tailwindcss.js': 'https://cdn.tailwindcss.com',
    'fontawesome.all.min.css': 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'fa-solid-900.woff2': 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2',
    'fa-solid-900.ttf': 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.ttf',
    'fa-regular-400.woff2': 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-regular-400.woff2',
    'fa-regular-400.ttf': 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-regular-400.ttf',
    'fa-brands-400.woff2': 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-brands-400.woff2',
    'fa-brands-400.ttf': 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-brands-400.ttf',
    'react.development.js': 'https://unpkg.com/react@18/umd/react.development.js',
    'react-dom.development.js': 'https://unpkg.com/react-dom@18/umd/react-dom.development.js',
    'babel.min.js': 'https://unpkg.com/@babel/standalone/babel.min.js',
    'babel.min.js.map': 'https://unpkg.com/@babel/standalone/babel.min.js.map',
    'pdf.min.js': 'https://fastly.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
    'pdf.worker.min.js': 'https://fastly.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
    'face-api.min.js': 'https://fastly.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js',
    'prism.min.js': 'https://fastly.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js',
    'prism.min.css': 'https://fastly.jsdelivr.net/npm/prismjs@1.29.0/themes/prism-tomorrow.min.css',
    'katex.min.css': 'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css',
    'lodash.min.js': 'https://fastly.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js',
    'lodash.core.min.js': 'https://fastly.jsdelivr.net/npm/lodash@4.17.21/lodash.core.min.js',
    'lodash.fp.min.js': 'https://fastly.jsdelivr.net/npm/lodash@4.17.21/lodash.fp.min.js',
    'marked.min.js': 'https://fastly.jsdelivr.net/npm/marked@12.0.0/marked.min.js',
    'dayjs.min.js': 'https://fastly.jsdelivr.net/npm/dayjs@1.11.10/dayjs.min.js',
    'chart.umd.min.js': 'https://fastly.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
    'KaTeX_AMS-Regular.woff2': 'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_AMS-Regular.woff2',
    'KaTeX_Caligraphic-Bold.woff2': 'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Caligraphic-Bold.woff2',
    'KaTeX_Caligraphic-Regular.woff2': 'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Caligraphic-Regular.woff2',
    'KaTeX_Fraktur-Bold.woff2': 'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Fraktur-Bold.woff2',
    'KaTeX_Fraktur-Regular.woff2': 'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Fraktur-Regular.woff2',
    'KaTeX_Main-Bold.woff2': 'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Main-Bold.woff2',
    'KaTeX_Main-Italic.woff2': 'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Main-Italic.woff2',
    'KaTeX_Main-Regular.woff2': 'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Main-Regular.woff2',
    'KaTeX_Math-BoldItalic.woff2': 'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Math-BoldItalic.woff2',
    'KaTeX_Math-Italic.woff2': 'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Math-Italic.woff2',
    'KaTeX_Math-Regular.woff2': 'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Math-Regular.woff2',
    'KaTeX_SansSerif-Bold.woff2': 'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_SansSerif-Bold.woff2',
    'KaTeX_SansSerif-Italic.woff2': 'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_SansSerif-Italic.woff2',
    'KaTeX_SansSerif-Regular.woff2': 'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_SansSerif-Regular.woff2',
    'KaTeX_Script-Regular.woff2': 'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Script-Regular.woff2',
    'KaTeX_Size1-Regular.woff2': 'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Size1-Regular.woff2',
    'KaTeX_Size2-Regular.woff2': 'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Size2-Regular.woff2',
    'KaTeX_Size3-Regular.woff2': 'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Size3-Regular.woff2',
    'KaTeX_Size4-Regular.woff2': 'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Size4-Regular.woff2',
    'KaTeX_Typewriter-Regular.woff2': 'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Typewriter-Regular.woff2',
};

// 验证字体文件是否有效
const isValidFontFile = (p) => {
    try {
        const st = fs.statSync(p);
        if (!st.isFile() || st.size < 1024) return false;
        const fd = fs.openSync(p, 'r');
        const buf = Buffer.alloc(4);
        fs.readSync(fd, buf, 0, 4, 0);
        fs.closeSync(fd);
        const sig = buf.toString('ascii');
        if (sig === 'wOFF' || sig === 'wOF2' || sig === 'OTTO' || sig === 'ttcf') return true;
        return buf[0] === 0x00 && buf[1] === 0x01 && buf[2] === 0x00 && buf[3] === 0x00;
    } catch (_) {
        return false;
    }
};

// 字体缓存清理中间件
function fontCacheCleaner(req, res, next) {
    if (req.path.match(/\.(woff2?|ttf|otf|ttc)$/i)) {
        const checkPaths = [
            path.join(config.libDir, req.path.replace('/lib', '')),
            path.join(config.webfontsDir, path.basename(req.path)),
            path.join(__dirname, '..', 'public', req.path)
        ];

        for (const p of checkPaths) {
            if (fs.existsSync(p) && !isValidFontFile(p)) {
                try {
                    fs.unlinkSync(p);
                    console.log(`[cache] deleted corrupted font: ${p}`);
                } catch (_) {}
            }
        }
    }
    next();
}

// 依赖映射表：filename -> publicSrc
const dependencyMap = {};

// 下载并缓存的通用引擎
function downloadAndCache(url, dest, res) {
    const client = url.startsWith('https') ? require('https') : require('http');

    client.get(url, (response) => {
        // 处理 CDN 经常发生的重定向 (301/302)
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            return downloadAndCache(response.headers.location, dest, res);
        }

        if (response.statusCode === 200) {
            // 1. 创建本地文件写入流 (存入硬盘)
            const fileStream = fs.createWriteStream(dest);
            response.pipe(fileStream);

            // 2. 同时把数据流传给正在等待的浏览器 (老师/学生)
            res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
            res.setHeader('Cache-Control', 'public, max-age=31536000'); // 让浏览器也缓存
            response.pipe(res);
        } else {
            res.status(response.statusCode).send('上游 CDN 下载失败');
        }
    }).on('error', (err) => {
        // 如果下载中途出错，删除损坏的残缺文件
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        res.status(500).send('服务器代理下载出错');
    });
}

// 处理 /lib/ 路由
function handleLibRequest(req, res) {
    const fileName = req.params.fileName;
    const localPath = path.join(config.libDir, fileName);

    if (!fileName.includes('.') || fileName === 'fonts') {
        return res.status(404).send(`not found: ${fileName}`);
    }

    // 优先：若本地已缓存该文件，直接返回（不触发任何下载）
    if (fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
        const ext = path.extname(fileName).toLowerCase();
        const mimeMap = {
            '.js': 'application/javascript',
            '.css': 'text/css',
            '.woff2': 'font/woff2',
            '.woff': 'font/woff',
            '.ttf': 'font/ttf',
        };
        res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        return res.sendFile(localPath);
    }

    // 以下为下载链路（仅当本地不存在时触发）
    // 优先级：固定映射表 > 课件注册的 publicSrc > npm 包名猜测
    let possibleUrls = [];

    if (KNOWN_FILE_URLS[fileName]) {
        // 已知框架文件，使用固定 URL
        possibleUrls = [KNOWN_FILE_URLS[fileName]];
        console.log(`[proxy] downloading ${fileName} (known url)...`);
    } else if (dependencyMap[fileName]) {
        // 课件注册的精确地址
        const registeredUrl = dependencyMap[fileName].replace('cdn.jsdelivr.net', 'fastly.jsdelivr.net');
        possibleUrls = [registeredUrl, dependencyMap[fileName]];
        console.log(`[proxy] downloading ${fileName} (registered url)...`);
    } else {
        // 从文件名猜测 npm 包名
        let packageName = fileName
            .replace('.umd.min.js', '')
            .replace('.min.js', '')
            .replace('.js', '')
            .replace('.css', '')
            .replace('.woff2', '')
            .replace('.woff', '')
            .replace('.ttf', '')
            .replace('.eot', '');

        const packageMap = { 'chart': 'chart.js' };
        packageName = packageMap[packageName] || packageName;

        possibleUrls = [
            `https://fastly.jsdelivr.net/npm/${packageName}@latest/dist/${fileName}`,
            `https://fastly.jsdelivr.net/npm/${packageName}@latest/${fileName}`,
            `https://cdn.jsdelivr.net/npm/${packageName}@latest/dist/${fileName}`,
            `https://cdn.jsdelivr.net/npm/${packageName}@latest/${fileName}`,
            `https://unpkg.com/${packageName}@latest/dist/${fileName}`,
            `https://unpkg.com/${packageName}@latest/${fileName}`
        ];
        console.log(`[proxy] downloading ${fileName}...`);
    }

    // 尝试从指定 URL 下载
    const tryDownloadFromUrl = (url, onSuccess, onError) => {
        const client = url.startsWith('https') ? require('https') : require('http');

        const req = client.get(url, (response) => {
            // 收到响应头后取消超时
            req.setTimeout(0);

            // 处理重定向
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                response.resume();
                let redirectUrl = response.headers.location;
                if (redirectUrl.startsWith('/')) {
                    const urlObj = new URL(url);
                    redirectUrl = `${urlObj.protocol}//${urlObj.host}${redirectUrl}`;
                }
                return tryDownloadFromUrl(redirectUrl, onSuccess, onError);
            }

            if (response.statusCode === 200) {
                onSuccess(response, url);
            } else {
                response.resume();
                onError();
            }
        });

        req.setTimeout(config.downloadTimeout, () => {
            req.destroy(new Error(`请求超时: ${url}`));
        });

        req.on('error', (err) => {
            console.warn(`[proxy] request failed ${url}: ${err.message}`);
            onError();
        });
    };

    // 尝试下载，使用第一个成功的
    const tryNextUrl = (index) => {
        if (index >= possibleUrls.length) {
            console.log(`[proxy] [FAIL] not found: ${fileName}`);
            return res.status(404).send(`not found: ${fileName}`);
        }

        const url = possibleUrls[index];

        tryDownloadFromUrl(url,
            (response, finalUrl) => {
                const size = response.headers['content-length'] || '未知';
                console.log(`[proxy] [OK] ${fileName} downloaded (${size} bytes)`);

                res.setHeader('Content-Type', response.headers['content-type'] || 'application/javascript');
                res.setHeader('Cache-Control', 'public, max-age=31536000');

                const fileStream = fs.createWriteStream(localPath);

                response.on('data', (chunk) => {
                    fileStream.write(chunk);
                    res.write(chunk);
                });

                response.on('end', () => {
                    fileStream.end();
                    res.end();
                });

                response.on('error', (err) => {
                    fileStream.destroy();
                    console.error(`[proxy] download error: ${err.message}`);
                    if (fs.existsSync(localPath)) {
                        fs.unlinkSync(localPath);
                    }
                    res.status(500).send('下载失败');
                });
            },
            () => {
                tryNextUrl(index + 1);
            }
        );
    };

    tryNextUrl(0);
}

// 处理 /webfonts/ 路由
function handleWebfontsRequest(req, res) {
    const fileName = req.params.fileName;
    if (!fs.existsSync(config.webfontsDir)) {
        fs.mkdirSync(config.webfontsDir, { recursive: true });
    }

    const localPath = path.join(config.webfontsDir, fileName);
    if (fs.existsSync(localPath)) {
        return res.sendFile(localPath);
    }

    const remoteUrl = KNOWN_FILE_URLS[fileName];
    if (remoteUrl) {
        console.log(`[proxy] downloading font ${fileName}...`);
        return downloadAndCache(remoteUrl, localPath, res);
    }

    res.status(404).send('字体文件未找到');
}

// 处理 /lib/fonts/ 路由（KaTeX 字体）
function handleLibFontsRequest(req, res) {
    const fileName = req.params.fileName;
    const fontsDir = path.join(config.libDir, 'fonts');

    try {
        if (fs.existsSync(fontsDir) && !fs.statSync(fontsDir).isDirectory()) {
            fs.unlinkSync(fontsDir);
        }
        if (!fs.existsSync(fontsDir)) {
            fs.mkdirSync(fontsDir, { recursive: true });
        }
    } catch (_) {}

    const localPath = path.join(fontsDir, fileName);

    if (fs.existsSync(localPath)) {
        if (!isValidFontFile(localPath)) {
            try {
                fs.unlinkSync(localPath);
            } catch (_) {}
        } else {
            res.setHeader('Cache-Control', 'public, max-age=31536000');
            return res.sendFile(localPath);
        }
    }

    const remoteUrl = (KNOWN_FILE_URLS[fileName] || `https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/${fileName}`)
        .replace('cdn.jsdelivr.net', 'fastly.jsdelivr.net');
    console.log(`[proxy] downloading katex font ${fileName}...`);

    const downloadFontAtomic = (url) => {
        const client = url.startsWith('https') ? require('https') : require('http');
        const tempPath = localPath + '.part';

        client.get(url, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                response.resume();
                let redirectUrl = response.headers.location;
                if (redirectUrl.startsWith('/')) {
                    const urlObj = new URL(url);
                    redirectUrl = `${urlObj.protocol}//${urlObj.host}${redirectUrl}`;
                }
                return downloadFontAtomic(redirectUrl);
            }
            if (response.statusCode !== 200) {
                response.resume();
                return res.status(response.statusCode).send('上游 CDN 下载失败');
            }

            try {
                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            } catch (_) {}

            const fileStream = fs.createWriteStream(tempPath);
            const fail = () => {
                try {
                    fileStream.destroy();
                } catch (_) {}
                try {
                    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                } catch (_) {}
                if (!res.headersSent) res.status(500).send('下载失败');
            };

            fileStream.on('error', fail);
            response.on('error', fail);

            res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
            res.setHeader('Cache-Control', 'public, max-age=31536000');

            response.pipe(fileStream);
            response.pipe(res);

            fileStream.on('finish', () => {
                fileStream.close(() => {
                    try {
                        fs.renameSync(tempPath, localPath);
                    } catch (_) {
                        try {
                            fs.copyFileSync(tempPath, localPath);
                            fs.unlinkSync(tempPath);
                        } catch (_) {}
                    }
                });
            });
        }).on('error', () => {
            res.status(500).send('服务器代理下载出错');
        });
    };

    return downloadFontAtomic(remoteUrl);
}

// 处理 /images/proxy 路由
function handleImagesProxyRequest(req, res) {
    const imageUrl = req.query.url;
    if (!imageUrl) {
        return res.status(400).send('缺少 url 参数');
    }

    // 生成缓存文件名（使用 URL 的 hash）
    const crypto = require('crypto');
    const urlHash = crypto.createHash('md5').update(imageUrl).digest('hex');
    const urlObj = new URL(imageUrl);
    const ext = path.extname(urlObj.pathname) || '.jpg';
    const cacheFileName = `${urlHash}${ext}`;
    const cachePath = path.join(config.imagesDir, cacheFileName);

    // 如果已缓存，直接返回
    if (fs.existsSync(cachePath)) {
        return res.sendFile(cachePath);
    }

    console.log(`[img-proxy] downloading: ${imageUrl.substring(0, 60)}...`);

    const client = imageUrl.startsWith('https') ? require('https') : require('http');
    client.get(imageUrl, (response) => {
        if (response.statusCode === 200) {
            const fileStream = fs.createWriteStream(cachePath);
            response.pipe(fileStream);

            fileStream.on('finish', () => {
                fileStream.close();
                console.log(`[img-proxy] [OK] cached: ${cacheFileName}`);
                res.sendFile(cachePath);
            });

            fileStream.on('error', (err) => {
                console.error(`[img-proxy] save failed: ${err.message}`);
                if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
                res.status(500).send('图片保存失败');
            });
        } else {
            console.error(`[img-proxy] download failed: ${response.statusCode}`);
            res.status(response.statusCode).send('图片下载失败');
        }
    }).on('error', (err) => {
        console.error(`[img-proxy] request failed: ${err.message}`);
        res.status(500).send('图片请求失败');
    });
}

// 处理 /weights/ 路由
function handleWeightsRequest(req, res) {
    if (req.method === 'HEAD') return res.status(200).end();

    const fileName = req.params.fileName;
    console.log(`[proxy] fetching model from CDN: ${fileName}`);
    const remoteUrl = `https://fastly.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights/${fileName}`;
    const localPath = path.join(config.weightsDir, fileName);
    downloadAndCache(remoteUrl, localPath, res);
}

module.exports = {
    fontCacheCleaner,
    dependencyMap,
    handleLibRequest,
    handleWebfontsRequest,
    handleLibFontsRequest,
    handleImagesProxyRequest,
    handleWeightsRequest
};
