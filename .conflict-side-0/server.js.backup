// Windows 控制台编码修复：移除 emoji，避免 GBK/UTF-8 乱码
// （emoji 在 Windows GBK 控制台下无法正确显示）

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

// 缓存代理连接超时（毫秒）：等待响应头的最长时间，防止 CDN 挂起
// 设置较长以兼容慢速 CDN 首次响应，真正的挂起通常远超此值
const DOWNLOAD_TIMEOUT_MS = 60000;

// 初始化 Express 和 HTTP 服务器
const app = express();
const server = http.createServer(app);

// 初始化 Socket.io
const io = new Server(server, { pingInterval: 5000, pingTimeout: 8000 });

// 解析 JSON / 表单 body（否则 DELETE/POST 的 req.body 可能为 undefined）
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

// ========================================================
// 0. 课程状态管理
// ========================================================

// 扫描 courses 目录获取所有可用课程
const coursesDir = path.join(__dirname, 'public', 'courses');
const folderDataPath = path.join(__dirname, 'public', 'data', 'course-folders.json');

// 加载文件夹配置
function loadFolderData() {
    try {
        if (fs.existsSync(folderDataPath)) {
            const content = fs.readFileSync(folderDataPath, 'utf-8');
            return JSON.parse(content);
        }
    } catch (err) {
        console.warn('[loadFolderData] Failed to load folder data:', err.message);
    }
    return { folders: [], courses: {} };
}

// 保存文件夹配置
function saveFolderData(data) {
    try {
        const dataDir = path.dirname(folderDataPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        fs.writeFileSync(folderDataPath, JSON.stringify(data, null, 2), 'utf-8');
        return true;
    } catch (err) {
        console.error('[saveFolderData] Failed to save folder data:', err.message);
        return false;
    }
}

function scanCourses() {
    if (!fs.existsSync(coursesDir)) {
        fs.mkdirSync(coursesDir, { recursive: true });
        return { courses: [], folders: loadFolderData().folders };
    }

    const files = fs.readdirSync(coursesDir);
    const allowedExts = ['.lume', '.tsx', '.ts', '.jsx', '.js', '.pdf'];
    const extPriority = { '.lume': 5, '.tsx': 4, '.ts': 3, '.jsx': 2, '.js': 1, '.pdf': 0 };

    // 加载文件夹数据
    const folderData = loadFolderData();
    const courseFolderMap = folderData.courses || {};

    const courses = files
        .filter(f => allowedExts.includes(path.extname(f).toLowerCase()))
        .map(f => {
            const filePath = path.join(coursesDir, f);
            const ext = path.extname(f).toLowerCase();
            const courseId = f.replace(/\.(lume|tsx|ts|jsx|js|pdf)$/i, '');

            let mtimeMs = 0;
            try {
                mtimeMs = fs.statSync(filePath).mtimeMs || 0;
            } catch (_) {}

            // 获取课件所属文件夹
            const folderId = courseFolderMap[courseId] || null;

            if (ext === '.pdf') {
                return {
                    id: courseId,
                    file: f,
                    title: courseId,
                    icon: '📄',
                    desc: 'PDF课件',
                    color: 'from-rose-500 to-orange-600',
                    type: 'pdf',
                    folderId,
                    _extPriority: extPriority[ext] || 0,
                    _mtimeMs: mtimeMs
                };
            }

            let content;
            try {
                content = fs.readFileSync(filePath, 'utf-8');
            } catch (err) {
                console.warn(`[scanCourses] [SKIP] 跳过无法读取的文件: ${f} (${err.message})`);
                return null;
            }

            // 尝试从文件中提取课程元数据
            let title = courseId;
            let icon = '📚';
            let desc = '';
            let color = 'from-blue-500 to-indigo-600';

            // 匹配 window.CourseData 中的元数据
            // 先定位 window.CourseData 位置，只从该位置之后提取，避免误匹配幻灯片内容中的同名字段
            const courseDataIndex = content.indexOf('window.CourseData');
            const metaContent = courseDataIndex >= 0 ? content.slice(courseDataIndex) : content;

            const titleMatch = metaContent.match(/title:\s*["'](.+?)["']/);
            const iconMatch = metaContent.match(/icon:\s*["'](.+?)["']/);
            const descMatch = metaContent.match(/desc:\s*["'](.+?)["']/);
            const colorMatch = metaContent.match(/color:\s*["'](.+?)["']/);

            if (titleMatch) title = titleMatch[1];
            if (iconMatch) icon = iconMatch[1];
            if (descMatch) desc = descMatch[1];
            if (colorMatch) color = colorMatch[1];

            return {
                id: courseId,
                file: f,
                title,
                icon,
                desc,
                color,
                type: 'script',
                folderId,
                _extPriority: extPriority[path.extname(f).toLowerCase()] || 0,
                _mtimeMs: mtimeMs
            };
        })
        .filter(course => course !== null);

    const byId = new Map();
    for (const c of courses) {
        const prev = byId.get(c.id);
        if (!prev) {
            byId.set(c.id, c);
            continue;
        }
        const preferCurrent =
            (c._extPriority > prev._extPriority) ||
            (c._extPriority === prev._extPriority && (c._mtimeMs || 0) > (prev._mtimeMs || 0));
        if (preferCurrent) byId.set(c.id, c);
    }

    const deduped = Array.from(byId.values());
    deduped.sort((a, b) => (b._mtimeMs || 0) - (a._mtimeMs || 0));

    return {
        courses: deduped.map(({ _mtimeMs, _extPriority, ...rest }) => rest),
        folders: folderData.folders || []
    };
}

// 当前选中的课程和课程状态
let currentCourseId = null;
let currentSlideIndex = 0;
let courseCatalog = scanCourses();

const cacheRoot = process.env.LUMESYNC_CACHE_DIR
    ? path.resolve(process.env.LUMESYNC_CACHE_DIR)
    : path.join(__dirname, 'public');
const libDir = process.env.LUMESYNC_LIB_DIR
    ? path.resolve(process.env.LUMESYNC_LIB_DIR)
    : path.join(cacheRoot, 'lib');
const weightsDir = process.env.LUMESYNC_WEIGHTS_DIR
    ? path.resolve(process.env.LUMESYNC_WEIGHTS_DIR)
    : path.join(cacheRoot, 'weights');
const imagesDir = process.env.LUMESYNC_IMAGES_DIR
    ? path.resolve(process.env.LUMESYNC_IMAGES_DIR)
    : path.join(cacheRoot, 'images');
const webfontsDir = process.env.LUMESYNC_WEBFONTS_DIR
    ? path.resolve(process.env.LUMESYNC_WEBFONTS_DIR)
    : path.join(cacheRoot, 'webfonts');

// ========================================================
// 1. 静态文件托管 (如果在本地硬盘找到了，直接极速返回！)
// ========================================================

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

// 拦截并清理损坏的字体缓存
app.use((req, res, next) => {
    if (req.path.match(/\.(woff2?|ttf|otf|ttc)$/i)) {
        const checkPaths = [
            path.join(libDir, req.path.replace('/lib', '')),
            path.join(webfontsDir, path.basename(req.path)),
            path.join(__dirname, 'public', req.path)
        ];
        
        for (const p of checkPaths) {
            if (fs.existsSync(p) && !isValidFontFile(p)) {
                try { fs.unlinkSync(p); console.log(`[cache] deleted corrupted font: ${p}`); } catch (_) {}
            }
        }
    }
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

// ========================================================
// 2. ⚡️ 智能缓存代理中心 (核心修复区域)
// 如果上面的静态托管没找到文件，就会流转到这里。
// 服务器会自动去公网下载，并存入本地硬盘，造福后续所有学生！
// ========================================================

// 确保存储目录存在
if (!fs.existsSync(libDir)) fs.mkdirSync(libDir, { recursive: true });
if (!fs.existsSync(weightsDir)) fs.mkdirSync(weightsDir, { recursive: true });

// 依赖映射表：filename -> publicSrc（由前端课件加载时注册）
// 例如：'chart.umd.min.js' -> 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'
const dependencyMap = {};

// 下载并缓存的通用引擎
const downloadAndCache = (url, dest, res) => {
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
};

// 代理 1：通用资源代理 - 处理所有 /lib/ 下的资源（脚本、CSS、字体等）
// 核心框架文件的固定 URL 映射（这些文件不是 npm 包或包名特殊，无法靠猜）
const KNOWN_FILE_URLS = {
    'tailwindcss.js':           'https://cdn.tailwindcss.com',
    'fontawesome.all.min.css':  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'fa-solid-900.woff2':       'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2',
    'fa-solid-900.ttf':         'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.ttf',
    'fa-regular-400.woff2':     'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-regular-400.woff2',
    'fa-regular-400.ttf':       'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-regular-400.ttf',
    'fa-brands-400.woff2':      'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-brands-400.woff2',
    'fa-brands-400.ttf':        'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-brands-400.ttf',
    'react.development.js':     'https://unpkg.com/react@18/umd/react.development.js',
    'react-dom.development.js': 'https://unpkg.com/react-dom@18/umd/react-dom.development.js',
    'babel.min.js':             'https://unpkg.com/@babel/standalone/babel.min.js',
    'babel.min.js.map':         'https://unpkg.com/@babel/standalone/babel.min.js.map',
    'pdf.min.js':               'https://fastly.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
    'pdf.worker.min.js':        'https://fastly.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
    'face-api.min.js':          'https://fastly.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js',
    'katex.min.css':            'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css',
    'KaTeX_AMS-Regular.woff2':            'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_AMS-Regular.woff2',
    'KaTeX_Caligraphic-Bold.woff2':       'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Caligraphic-Bold.woff2',
    'KaTeX_Caligraphic-Regular.woff2':    'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Caligraphic-Regular.woff2',
    'KaTeX_Fraktur-Bold.woff2':           'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Fraktur-Bold.woff2',
    'KaTeX_Fraktur-Regular.woff2':        'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Fraktur-Regular.woff2',
    'KaTeX_Main-Bold.woff2':              'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Main-Bold.woff2',
    'KaTeX_Main-Italic.woff2':            'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Main-Italic.woff2',
    'KaTeX_Main-Regular.woff2':           'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Main-Regular.woff2',
    'KaTeX_Math-BoldItalic.woff2':        'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Math-BoldItalic.woff2',
    'KaTeX_Math-Italic.woff2':            'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Math-Italic.woff2',
    'KaTeX_Math-Regular.woff2':           'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Math-Regular.woff2',
    'KaTeX_SansSerif-Bold.woff2':         'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_SansSerif-Bold.woff2',
    'KaTeX_SansSerif-Italic.woff2':       'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_SansSerif-Italic.woff2',
    'KaTeX_SansSerif-Regular.woff2':      'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_SansSerif-Regular.woff2',
    'KaTeX_Script-Regular.woff2':         'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Script-Regular.woff2',
    'KaTeX_Size1-Regular.woff2':          'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Size1-Regular.woff2',
    'KaTeX_Size2-Regular.woff2':          'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Size2-Regular.woff2',
    'KaTeX_Size3-Regular.woff2':          'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Size3-Regular.woff2',
    'KaTeX_Size4-Regular.woff2':          'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Size4-Regular.woff2',
    'KaTeX_Typewriter-Regular.woff2':     'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Typewriter-Regular.woff2',
};

app.get('/lib/fonts', (_req, res) => {
    res.status(404).send('not found: fonts');
});

app.get('/lib/:fileName', (req, res) => {
    const fileName = req.params.fileName;
    const localPath = path.join(libDir, fileName);

    if (!fileName.includes('.') || fileName === 'fonts') {
        return res.status(404).send(`not found: ${fileName}`);
    }
    
    // 优先级：固定映射表 > 课件注册的 publicSrc > npm 包名猜测
    let possibleUrls = [];
    
    if (KNOWN_FILE_URLS[fileName]) {
        // 已知框架文件，使用固定 URL
        possibleUrls = [KNOWN_FILE_URLS[fileName]];
        console.log(`[proxy] downloading ${fileName} (known url)...`);
    } else if (dependencyMap[fileName]) {
        // 课件注册的精确地址，将 cdn.jsdelivr.net 替换为 fastly 节点以提升可达性
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
            // 收到响应头后取消超时，避免大文件传输被误杀
            req.setTimeout(0);

            // 处理重定向
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                // 必须消费掉重定向响应的 body，否则 socket 会被占用导致连接挂起
                response.resume();
                let redirectUrl = response.headers.location;
                // 如果是相对路径，转换为绝对路径
                if (redirectUrl.startsWith('/')) {
                    const urlObj = new URL(url);
                    redirectUrl = `${urlObj.protocol}//${urlObj.host}${redirectUrl}`;
                }
                // 递归处理重定向
                return tryDownloadFromUrl(redirectUrl, onSuccess, onError);
            }
            
            if (response.statusCode === 200) {
                onSuccess(response, url);
            } else {
                // 消费掉非 200 响应的 body，释放连接
                response.resume();
                onError();
            }
        });

        // 超时后主动销毁请求，destroy() 会触发 error 事件
        req.setTimeout(DOWNLOAD_TIMEOUT_MS, () => {
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
                
                // 设置响应头
                res.setHeader('Content-Type', response.headers['content-type'] || 'application/javascript');
                res.setHeader('Cache-Control', 'public, max-age=31536000');
                
                // 创建文件写入流
                const fileStream = fs.createWriteStream(localPath);
                
                // 同时写入文件和返回响应
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
                // 失败，尝试下一个 URL
                tryNextUrl(index + 1);
            }
        );
    };
    
    tryNextUrl(0);
});

// 代理 1.5：字体文件路由 - FontAwesome CSS 内部引用 /webfonts/xxx，转发到 /lib/ 目录
// （FontAwesome CSS 中字体路径是相对路径 ../webfonts/，浏览器解析后变成 /webfonts/）
app.get('/webfonts/:fileName', (req, res) => {
    const fileName = req.params.fileName;
    if (!fs.existsSync(webfontsDir)) fs.mkdirSync(webfontsDir, { recursive: true });
    
    const localPath = path.join(webfontsDir, fileName);
    if (fs.existsSync(localPath)) {
        return res.sendFile(localPath);
    }
    // 本地不存在，从 KNOWN_FILE_URLS 下载
    const remoteUrl = KNOWN_FILE_URLS[fileName];
    if (remoteUrl) {
        console.log(`[proxy] downloading font ${fileName}...`);
        return downloadAndCache(remoteUrl, localPath, res);
    }
    res.status(404).send('字体文件未找到');
});

app.get('/lib/fonts/:fileName', (req, res) => {
    const fileName = req.params.fileName;
    const fontsDir = path.join(libDir, 'fonts');
    try {
        if (fs.existsSync(fontsDir) && !fs.statSync(fontsDir).isDirectory()) {
            fs.unlinkSync(fontsDir);
        }
        if (!fs.existsSync(fontsDir)) fs.mkdirSync(fontsDir, { recursive: true });
    } catch (_) {}

    const localPath = path.join(fontsDir, fileName);
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

    if (fs.existsSync(localPath)) {
        if (!isValidFontFile(localPath)) {
            try { fs.unlinkSync(localPath); } catch (_) {}
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
                try { fileStream.destroy(); } catch (_) {}
                try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
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
});

// 代理 2：图片资源代理 - 处理 /images/ 下的外部图片
if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

app.get('/images/proxy', (req, res) => {
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
    const cachePath = path.join(imagesDir, cacheFileName);
    
    // 如果已缓存，直接返回
    if (fs.existsSync(cachePath)) {
        return res.sendFile(cachePath);
    }
    
    console.log(`[img-proxy] downloading: ${imageUrl.substring(0, 60)}...`);
    
    // 下载图片
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
});

// 代理 3：拦截所有的 AI 模型权重文件的请求
app.get('/weights/:fileName', (req, res) => {
    if (req.method === 'HEAD') return res.status(200).end();
    
    const fileName = req.params.fileName;
    console.log(`[proxy] fetching model from CDN: ${fileName}`);
    const remoteUrl = `https://fastly.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights/${fileName}`;
    const localPath = path.join(weightsDir, fileName);
    downloadAndCache(remoteUrl, localPath, res);
});

// ========================================================
// 🛠️ API 路由
// ========================================================

app.get('/api/health', (req, res) => {
    res.json({ ok: true, app: 'LumeSync', port: Number(process.env.PORT || 3000) });
});

// 获取课程列表
app.get('/api/courses', (req, res) => {
    const catalog = typeof courseCatalog === 'object' && 'courses' in courseCatalog
        ? courseCatalog
        : { courses: courseCatalog, folders: loadFolderData().folders };
    res.json({
        ...catalog,
        currentCourseId: currentCourseId,
        currentSlideIndex: currentSlideIndex
    });
});

// 获取当前课程状态
app.get('/api/course-status', (req, res) => {
    res.json({
        currentCourseId: currentCourseId,
        currentSlideIndex: currentSlideIndex
    });
});

// 刷新课程列表（重新扫描目录）
app.post('/api/refresh-courses', (req, res) => {
    courseCatalog = scanCourses();
    res.json({ success: true, ...courseCatalog });
});

// 删除指定课件
app.delete('/api/delete-course', (req, res) => {
    const courseId = req.body?.courseId || req.query?.courseId || null;
    if (!courseId) {
        return res.status(400).json({ success: false, error: '缺少 courseId 参数' });
    }

    const catalog = typeof courseCatalog === 'object' && 'courses' in courseCatalog
        ? courseCatalog.courses
        : courseCatalog;
    const course = catalog.find(c => c.id === courseId);
    if (!course) {
        return res.status(404).json({ success: false, error: '课件不存在' });
    }

    const filePath = path.join(coursesDir, course.file);
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`[delete-course] deleted: ${course.file}`);
        }
        // 从文件夹配置中移除
        const folderData = loadFolderData();
        if (folderData.courses && folderData.courses[courseId]) {
            delete folderData.courses[courseId];
            saveFolderData(folderData);
        }
        // 更新课程目录
        courseCatalog = scanCourses();
        res.json({ success: true, ...courseCatalog });
    } catch (err) {
        console.error(`[delete-course] error:`, err);
        res.status(500).json({ success: false, error: '删除文件失败' });
    }
});

// ========================================================
// 课程文件夹管理 API
// ========================================================

// 创建文件夹
app.post('/api/course-folders', (req, res) => {
    const { name, icon, parentId } = req.body;
    if (!name || !name.trim()) {
        return res.status(400).json({ success: false, error: '文件夹名称不能为空' });
    }

    const folderData = loadFolderData();
    folderData.folders = folderData.folders || [];

    // 检查是否已存在同名文件夹
    const parentToCheck = parentId === null || parentId === undefined ? null : parentId;
    const existingFolder = folderData.folders.find(f => {
        const folderParent = f.parentId === null || f.parentId === undefined ? null : f.parentId;
        return f.name === name.trim() && folderParent === parentToCheck;
    });

    if (existingFolder) {
        return res.status(400).json({ success: false, error: `文件夹 "${name}" 已存在` });
    }

    const folderId = `folder-${Date.now()}`;
    const newFolder = {
        id: folderId,
        name: name.trim(),
        icon: icon || '📁',
        parentId: parentId || null,
        createdAt: new Date().toISOString()
    };

    folderData.folders.push(newFolder);

    if (saveFolderData(folderData)) {
        courseCatalog = scanCourses();
        res.json({ success: true, folder: newFolder, ...courseCatalog });
    } else {
        res.status(500).json({ success: false, error: '保存失败' });
    }
});

// 删除文件夹（支持递归删除子文件夹）
app.delete('/api/course-folders/:folderId', (req, res) => {
    const { folderId } = req.params;
    if (!folderId) {
        return res.status(400).json({ success: false, error: '缺少 folderId 参数' });
    }

    const folderData = loadFolderData();
    if (!folderData.folders || !folderData.folders.find(f => f.id === folderId)) {
        return res.status(404).json({ success: false, error: '文件夹不存在' });
    }

    // 递归获取所有子文件夹ID
    const getSubFolderIds = (parentId) => {
        const subFolders = folderData.folders.filter(f => f.parentId === parentId);
        let ids = subFolders.map(f => f.id);
        subFolders.forEach(sub => {
            ids = ids.concat(getSubFolderIds(sub.id));
        });
        return ids;
    };

    const allFolderIdsToDelete = [folderId, ...getSubFolderIds(folderId)];

    // 将这些文件夹中的课件移出文件夹
    if (folderData.courses) {
        for (const courseId in folderData.courses) {
            if (allFolderIdsToDelete.includes(folderData.courses[courseId])) {
                delete folderData.courses[courseId];
            }
        }
    }

    // 删除所有这些文件夹
    folderData.folders = folderData.folders.filter(f => !allFolderIdsToDelete.includes(f.id));

    if (saveFolderData(folderData)) {
        courseCatalog = scanCourses();
        res.json({ success: true, ...courseCatalog });
    } else {
        res.status(500).json({ success: false, error: '保存失败' });
    }
});

// 移动文件夹（必须放在重命名路由之前，避免路由冲突）
app.put('/api/course-folders/:folderId/move', (req, res) => {
    const { folderId } = req.params;
    const { targetFolderId } = req.body;

    if (!folderId) {
        return res.status(400).json({ success: false, error: '缺少 folderId 参数' });
    }

    const folderData = loadFolderData();

    // 验证源文件夹是否存在
    const folderToMove = folderData.folders?.find(f => f.id === folderId);
    if (!folderToMove) {
        return res.status(404).json({ success: false, error: '源文件夹不存在' });
    }

    // 验证目标文件夹是否存在（如果是 'null' 则表示移到根目录）
    if (targetFolderId !== 'null' && !folderData.folders?.find(f => f.id === targetFolderId)) {
        return res.status(404).json({ success: false, error: '目标文件夹不存在' });
    }

    // 不能将文件夹移动到自己的子文件夹中
    if (targetFolderId !== 'null') {
        const isDescendant = (parentId, childId) => {
            if (parentId === childId) return true;
            const childFolders = folderData.folders.filter(f => f.parentId === parentId);
            for (const child of childFolders) {
                if (isDescendant(child.id, childId)) return true;
            }
            return false;
        };
        if (isDescendant(folderId, targetFolderId)) {
            return res.status(400).json({ success: false, error: '不能将文件夹移动到其子文件夹中' });
        }
    }

    // 更新文件夹的parentId
    folderToMove.parentId = targetFolderId === 'null' ? null : targetFolderId;

    if (saveFolderData(folderData)) {
        courseCatalog = scanCourses();
        res.json({ success: true, ...courseCatalog });
    } else {
        res.status(500).json({ success: false, error: '保存失败' });
    }
});

// 重命名文件夹
app.put('/api/course-folders/:folderId', (req, res) => {
    const { folderId } = req.params;
    const { name, icon } = req.body;

    if (!folderId) {
        return res.status(400).json({ success: false, error: '缺少 folderId 参数' });
    }

    if (!name || !name.trim()) {
        return res.status(400).json({ success: false, error: '文件夹名称不能为空' });
    }

    const folderData = loadFolderData();
    const folder = folderData.folders?.find(f => f.id === folderId);

    if (!folder) {
        return res.status(404).json({ success: false, error: '文件夹不存在' });
    }

    // 检查是否已存在同名文件夹（排除自己）
    const folderParent = folder.parentId === null || folder.parentId === undefined ? null : folder.parentId;
    const existingFolder = folderData.folders.find(f => {
        const fParent = f.parentId === null || f.parentId === undefined ? null : f.parentId;
        return f.id !== folderId && f.name === name.trim() && fParent === folderParent;
    });

    if (existingFolder) {
        return res.status(400).json({ success: false, error: `文件夹 "${name}" 已存在` });
    }

    folder.name = name.trim();
    if (icon !== undefined) {
        folder.icon = icon;
    }
    folder.updatedAt = new Date().toISOString();

    if (saveFolderData(folderData)) {
        courseCatalog = scanCourses();
        res.json({ success: true, folder, ...courseCatalog });
    } else {
        res.status(500).json({ success: false, error: '保存失败' });
    }
});

// 移动课件到文件夹
app.put('/api/course-folders/:folderId/courses/:courseId', (req, res) => {
    const { folderId, courseId } = req.params;

    if (!courseId) {
        return res.status(400).json({ success: false, error: '缺少 courseId 参数' });
    }

    const folderData = loadFolderData();

    // 验证文件夹是否存在（如果是 'null' 则表示移出文件夹）
    if (folderId !== 'null' && !folderData.folders?.find(f => f.id === folderId)) {
        return res.status(404).json({ success: false, error: '目标文件夹不存在' });
    }

    // 验证课件是否存在
    const catalog = typeof courseCatalog === 'object' && 'courses' in courseCatalog
        ? courseCatalog.courses
        : courseCatalog;
    if (!catalog.find(c => c.id === courseId)) {
        return res.status(404).json({ success: false, error: '课件不存在' });
    }

    // 更新课件所属文件夹
    folderData.courses = folderData.courses || {};
    if (folderId === 'null') {
        // 移出文件夹
        delete folderData.courses[courseId];
    } else {
        // 移入文件夹
        folderData.courses[courseId] = folderId;
    }

    if (saveFolderData(folderData)) {
        courseCatalog = scanCourses();
        res.json({ success: true, ...courseCatalog });
    } else {
        res.status(500).json({ success: false, error: '保存失败' });
    }
});

// 获取当前在线学生列表
app.get('/api/students', (req, res) => {
    const students = Array.from(studentIPs.keys()).map(ip => ip.startsWith('::ffff:') ? ip.slice(7) : ip);
    res.json({ students });
});

// 获取学生操作日志
app.get('/api/student-log', (req, res) => {
    res.json({ log: studentLog });
});

// 学生提交内容保存 API
// 默认存储位置：项目根目录下的 submissions 文件夹
// 教师端可通过修改 SUBMISSIONS_DIR 环境变量自定义存储位置
const DEFAULT_SUBMISSIONS_DIR = path.join(__dirname, 'submissions');

// 函数：获取当前提交目录（支持运行时动态更新）
function getSubmissionDir() {
    return process.env.SUBMISSIONS_DIR || DEFAULT_SUBMISSIONS_DIR;
}

// 确保存储目录存在
if (!fs.existsSync(getSubmissionDir())) {
    fs.mkdirSync(getSubmissionDir(), { recursive: true });
}

// 尝试从配置文件加载上次保存的路径
const CONFIG_FILE = path.join(__dirname, 'submissions-config.json');
try {
    if (fs.existsSync(CONFIG_FILE)) {
        const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        if (config.submissionsDir) {
            process.env.SUBMISSIONS_DIR = config.submissionsDir;
            console.log(`[config] Loaded submissions directory from config: ${config.submissionsDir}`);
            // 确保目录存在
            if (!fs.existsSync(config.submissionsDir)) {
                fs.mkdirSync(config.submissionsDir, { recursive: true });
            }
        }
    }
} catch (err) {
    console.warn('[config] Failed to load submissions config:', err.message);
}

// 保存座位表到服务器
app.post('/api/save-classroom-layout', (req, res) => {
    const { layout } = req.body;

    if (!layout || typeof layout !== 'object') {
        return res.json({ success: false, error: 'Invalid layout data' });
    }

    try {
        const dataDir = path.join(__dirname, 'public', 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        const layoutPath = path.join(dataDir, 'classroom-layout-v1.json');
        fs.writeFileSync(layoutPath, JSON.stringify(layout, null, 2), 'utf-8');

        console.log(`[classroom-layout] Saved layout to ${layoutPath}`);
        res.json({ success: true });
    } catch (err) {
        console.error('[classroom-layout] Error saving layout:', err);
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/save-submission', (req, res) => {
    const { courseId, clientIp, content, fileName, mergeFile } = req.body;

    if (!courseId || !clientIp) {
        return res.json({ success: false, error: 'Missing required fields' });
    }

    try {
        const submissionsDir = getSubmissionDir();
        console.log(`[save-submission] submissionsDir: ${submissionsDir}`);
        const courseDir = path.join(submissionsDir, courseId);
        console.log(`[save-submission] courseDir: ${courseDir}`);
        if (!fs.existsSync(courseDir)) {
            fs.mkdirSync(courseDir, { recursive: true });
        }
        
        let filePath;
        const baseFileName = fileName || 'submission.txt';
        console.log(`[save-submission] baseFileName: ${baseFileName}`);
        const fileContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
        
        if (mergeFile) {
            // 合并模式：所有学生提交到一个文件（表格格式）
            filePath = path.join(courseDir, baseFileName);

            // 处理新的问卷格式（包含 header 和 row）
            let header, row;
            if (content && typeof content === 'object' && content.header && content.row) {
                // 新格式：包含表头和数据行
                header = content.header;

                // 获取学生信息并填充到数据行中
                const studentInfo = getStudentFromClassroomLayout(clientIp);
                const rowFields = content.row.split(',');
                // 填充学生信息：时间,IP,姓名,学号,答案...
                rowFields[0] = rowFields[0]; // 保留时间戳
                rowFields[1] = clientIp;    // 填充IP
                rowFields[2] = studentInfo?.name || ''; // 填充姓名
                rowFields[3] = studentInfo?.studentId || ''; // 填充学号
                row = rowFields.join(',') + '\n';

                console.log(`[save-submission] New format with header and row`);
                console.log(`[save-submission] Header: "${header}"`);
                console.log(`[save-submission] Row: "${row}"`);
            } else if (typeof content === 'string' && content.includes(',')) {
                // 旧格式：只有数据行
                row = content + '\n';
                console.log(`[save-submission] Old format, row: "${row}"`);
            } else {
                // 兼容旧格式：转换为 CSV 行
                const timestamp = new Date().toISOString();
                row = `${timestamp},${clientIp},${JSON.stringify(content).replace(/"/g, '""')}\n`;
                console.log(`[save-submission] Legacy format, row: "${row}"`);
            }

            // 检查 row 是否为空
            if (!row || row.trim() === '\n') {
                console.error('[save-submission] Row is empty, skipping');
                return res.json({ success: false, error: 'Content is empty' });
            }

            // 检查文件是否存在，不存在则创建表头
            if (!fs.existsSync(filePath)) {
                // 使用 BOM 头解决 Excel 中文乱码
                let contentToWrite = '\uFEFF';

                // 如果有表头，添加表头
                if (header) {
                    contentToWrite += header + '\n';
                } else {
                    // 没有表头，使用默认表头（旧格式）
                    contentToWrite += 'Timestamp,IP,Content\n';
                }

                // 添加数据行
                contentToWrite += row;

                console.log(`[save-submission] Writing new file: "${contentToWrite.substring(0, 200)}..."`);
                fs.writeFileSync(filePath, contentToWrite, 'utf-8');
            } else {
                console.log(`[save-submission] Appending to existing file: "${row.trim()}"`);
                fs.appendFileSync(filePath, row, 'utf-8');
            }
        } else {
            // 分离模式：每个学生一个文件
            // 获取学生姓名（从机房视图配置中获取）
            const classroomLayoutPath = path.join(__dirname, 'public', 'data', 'classroom-layout-v1.json');
            let studentName = clientIp;
            try {
                if (fs.existsSync(classroomLayoutPath)) {
                    const layout = JSON.parse(fs.readFileSync(classroomLayoutPath, 'utf-8'));
                    const studentSeat = Array.isArray(layout) ? layout.find(s => s.ip === clientIp) : null;
                    if (studentSeat && studentSeat.name) {
                        studentName = studentSeat.name;
                    }
                }
            } catch (err) {
                console.warn('[save-submission] Failed to read classroom layout:', err.message);
            }
            
            // 文件名：学生名称_文件名 或 IP_文件名
            const namePrefix = studentName === clientIp ? clientIp.replace(/\./g, '-') : studentName;
            const safeFileName = `${namePrefix}_${baseFileName}`.replace(/[<>:"/\\|?*]/g, '_');
            filePath = path.join(courseDir, safeFileName);
            fs.writeFileSync(filePath, fileContent, 'utf-8');
        }
        
        console.log(`[save-submission] Saved: ${filePath} (merge=${mergeFile})`);
        res.json({ success: true, filePath });
    } catch (err) {
        console.error('[save-submission] Error:', err);
        res.json({ success: false, error: err.message });
    }
});

// 获取提交文件夹路径（供教师端设置使用）
app.get('/api/submission-config', (req, res) => {
    res.json({ submissionsDir: getSubmissionDir() });
});

// 更新提交文件夹路径
app.post('/api/submission-config', (req, res) => {
    const { submissionsDir } = req.body;

    if (!submissionsDir || typeof submissionsDir !== 'string') {
        return res.status(400).json({ success: false, error: 'Invalid directory path' });
    }

    try {
        // 验证并创建目录
        if (!fs.existsSync(submissionsDir)) {
            fs.mkdirSync(submissionsDir, { recursive: true });
        }

        // 更新全局配置
        process.env.SUBMISSIONS_DIR = submissionsDir;

        // 保存到配置文件，下次重启时自动加载
        try {
            fs.writeFileSync(CONFIG_FILE, JSON.stringify({ submissionsDir }, null, 2), 'utf-8');
            console.log(`[config] Saved submissions directory to config file: ${CONFIG_FILE}`);
        } catch (saveErr) {
            console.warn('[config] Failed to save config file:', saveErr.message);
        }

        console.log(`[submission-config] Updated submissions directory to: ${submissionsDir}`);
        res.json({ success: true, submissionsDir });
    } catch (err) {
        console.error('[submission-config] Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 下载 Skill 文件（docs/create-course.md）
app.get('/api/download-skill', (req, res) => {
    const skillPath = path.join(__dirname, 'docs', 'create-course.md');
    if (!fs.existsSync(skillPath)) {
        return res.status(404).send('skill file not found');
    }
    res.setHeader('Content-Disposition', 'attachment; filename="create-course.md"');
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.sendFile(skillPath);
});

// 获取课件教程内容（docs/course-template.md）
app.get('/api/course-guide', (req, res) => {
    const guidePath = path.join(__dirname, 'docs', 'course-template.md');
    console.log('[api/course-guide] Guide path:', guidePath);
    console.log('[api/course-guide] Exists:', fs.existsSync(guidePath));

    if (!fs.existsSync(guidePath)) {
        console.error('[api/course-guide] Guide file not found at:', guidePath);
        return res.status(404).send('guide file not found');
    }
    try {
        const content = fs.readFileSync(guidePath, 'utf-8');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.send(content);
    } catch (err) {
        console.error('[api/course-guide] Error reading guide:', err);
        res.status(500).send('Error reading guide file');
    }
});

// ========================================================
// 🛠️ 诊断路由
// ========================================================
app.get('*', (req, res) => {
    res.status(404).send(`
        <div style="font-family: sans-serif; padding: 40px; background-color: #f8fafc; color: #334155; line-height: 1.6;">
            <h2 style="color: #ef4444;">❌ 找不到页面</h2>
            <p>请确保 index.html 放置在 public 文件夹中。</p>
        </div>
    `);
});

// ========================================================
// 3. Socket.io 实时通信与状态监控逻辑
// ========================================================

let studentIPs = new Map(); // IP -> socket数量，同一IP只计一个学生

// 教师端当前设置（服务端缓存，用于新连接学生同步）
let currentHostSettings = {
    forceFullscreen: true,
    syncFollow: true,
    syncInteraction: false,  // 默认关闭教师交互同步
    allowInteract: true,
    podiumAtTop: true,
    renderScale: 0.96,
    uiScale: 1.0,
    alertJoin: true,
    alertLeave: true,
    alertFullscreenExit: true,
    alertTabHidden: true,
};

// 标注数据（内存缓存）：key = `${courseId}:${slideIndex}` -> segments[]
// segment: { tool, color, width, alpha, points: [[xNorm,yNorm], ...] }
const annotationStore = new Map();
const ANNOTATION_MAX_SEGMENTS_PER_SLIDE = 5000;
const getAnnoKey = (courseId, slideIndex) => `${String(courseId || '')}:${Number(slideIndex || 0)}`;

// 学生操作日志（内存，最多保留 500 条）
const studentLog = [];
const LOG_MAX = 500;

function pushLog(type, ip, extra) {
    const entry = { time: new Date().toISOString(), type, ip, ...extra };
    studentLog.push(entry);
    if (studentLog.length > LOG_MAX) studentLog.shift();
    io.to('hosts').emit('student-log-entry', entry);
    console.log(`[student-log] ${entry.time} | ${type} | IP: ${ip}${extra.slide !== undefined ? ' | slide: ' + extra.slide : ''}`);
}

// 从座位表读取学生信息
function getStudentFromClassroomLayout(clientIp) {
    try {
        const classroomLayoutPath = path.join(__dirname, 'public', 'data', 'classroom-layout-v1.json');
        if (fs.existsSync(classroomLayoutPath)) {
            const layout = JSON.parse(fs.readFileSync(classroomLayoutPath, 'utf-8'));
            // 兼容两种格式：旧格式是数组，新格式是对象 { default: { seats: [] } }
            const seats = Array.isArray(layout) ? layout : (layout['default']?.seats || []);
            const student = seats.find(s => s.ip === clientIp);
            if (student) {
                console.log(`[classroom-layout] Found student for IP ${clientIp}: ${student.name}`);
                return {
                    ip: clientIp,
                    name: student.name || '',
                    studentId: student.studentId || ''
                };
            }
        }
    } catch (err) {
        console.warn('[classroom-layout] Failed to read layout:', err.message);
    }
    console.log(`[classroom-layout] No student found for IP ${clientIp}`);
    return { ip: clientIp, name: '', studentId: '' };
}

io.on('connection', (socket) => {
    // 统一转换为 IPv4，去掉 IPv6 映射前缀 ::ffff:
    const rawIp = socket.handshake.address;
    const clientIp = rawIp.startsWith('::ffff:') ? rawIp.slice(7) : rawIp;
    const isLocalhost = clientIp === '127.0.0.1' || clientIp === '::1';

    const role = isLocalhost ? 'host' : 'viewer';
    console.log(`[conn] IP=${clientIp} role=${role}`);

    // 发送角色信息和当前课程状态给当前客户端
    socket.emit('role-assigned', {
        role: role,
        clientIp: clientIp,
        currentCourseId: currentCourseId,
        currentSlideIndex: currentSlideIndex,
        courseCatalog: courseCatalog,
        hostSettings: currentHostSettings,
        // 为学生端添加座位表信息
        studentInfo: role === 'viewer' ? getStudentFromClassroomLayout(clientIp) : undefined
    });

    // 处理监控逻辑
    if (role === 'host') {
        socket.join('hosts');
        socket.emit('student-status', { count: studentIPs.size, action: 'init' });
    } else {
        const prev = studentIPs.get(clientIp) || 0;
        studentIPs.set(clientIp, prev + 1);
        // 只有该 IP 的第一个连接才触发 join 通知
        if (prev === 0) {
            pushLog('join', clientIp, {});
            io.to('hosts').emit('student-status', { count: studentIPs.size, action: 'join', ip: clientIp });
        }
    }

    // 老师可以主动查询当前学生人数
    socket.on('get-student-count', () => {
        if (role === 'host') {
            socket.emit('student-status', { count: studentIPs.size, action: 'init' });
        }
    });

    // 翻页同步
    socket.on('sync-slide', (data) => {
        if (role === 'host') {
            currentSlideIndex = data.slideIndex;
            socket.broadcast.emit('sync-slide', data);
        }
    });

    // 标注：拉取某页的标注数据
    socket.on('annotation:get', (data) => {
        const courseId = data && data.courseId ? String(data.courseId) : '';
        const slideIndex = data && Number.isFinite(Number(data.slideIndex)) ? Number(data.slideIndex) : 0;
        if (!courseId) return;
        const key = getAnnoKey(courseId, slideIndex);
        const segments = annotationStore.get(key) || [];
        socket.emit('annotation:state', { courseId, slideIndex, segments });
    });

    // 标注：实时线段（仅老师端可发，不落库）
    socket.on('annotation:segment', (data) => {
        if (role !== 'host') return;
        const courseId = data && data.courseId ? String(data.courseId) : '';
        const slideIndex = data && Number.isFinite(Number(data.slideIndex)) ? Number(data.slideIndex) : 0;
        const tool = data && typeof data.tool === 'string' ? data.tool : 'pen';
        const color = data && typeof data.color === 'string' ? data.color : '#ef4444';
        const width = data && Number.isFinite(Number(data.width)) ? Number(data.width) : 4;
        const alpha = data && Number.isFinite(Number(data.alpha)) ? Number(data.alpha) : 1;
        const points = data && Array.isArray(data.points) ? data.points : null;
        if (!courseId || !points || points.length < 2) return;
        socket.broadcast.emit('annotation:segment', { courseId, slideIndex, tool, color, width, alpha, points });
    });

    // 标注：新增一笔（仅老师端可发，落库用于翻页/重连后恢复）
    socket.on('annotation:stroke', (data) => {
        if (role !== 'host') return;
        const courseId = data && data.courseId ? String(data.courseId) : '';
        const slideIndex = data && Number.isFinite(Number(data.slideIndex)) ? Number(data.slideIndex) : 0;
        const tool = data && typeof data.tool === 'string' ? data.tool : 'pen';
        const color = data && typeof data.color === 'string' ? data.color : '#ef4444';
        const width = data && Number.isFinite(Number(data.width)) ? Number(data.width) : 4;
        const alpha = data && Number.isFinite(Number(data.alpha)) ? Number(data.alpha) : 1;
        const points = data && Array.isArray(data.points) ? data.points : null;
        if (!courseId || !points || points.length < 2) return;

        const key = getAnnoKey(courseId, slideIndex);
        const next = annotationStore.get(key) || [];
        next.push({ tool, color, width, alpha, points });
        if (next.length > ANNOTATION_MAX_SEGMENTS_PER_SLIDE) {
            next.splice(0, next.length - ANNOTATION_MAX_SEGMENTS_PER_SLIDE);
        }
        annotationStore.set(key, next);

        socket.broadcast.emit('annotation:stroke', { courseId, slideIndex, tool, color, width, alpha, points });
    });

    // 标注：清空某页（仅老师端可发）
    socket.on('annotation:clear', (data) => {
        if (role !== 'host') return;
        const courseId = data && data.courseId ? String(data.courseId) : '';
        const slideIndex = data && Number.isFinite(Number(data.slideIndex)) ? Number(data.slideIndex) : 0;
        if (!courseId) return;
        annotationStore.delete(getAnnoKey(courseId, slideIndex));
        io.emit('annotation:clear', { courseId, slideIndex });
    });

    // 交互状态同步（教师端广播给所有学生端）
    socket.on('interaction:sync', (data) => {
        if (role !== 'host') return;
        const courseId = data && data.courseId ? String(data.courseId) : '';
        const slideIndex = data && Number.isFinite(Number(data.slideIndex)) ? Number(data.slideIndex) : 0;
        const event = data && typeof data.event === 'string' ? data.event : '';
        const payload = data && typeof data.payload === 'object' ? data.payload : {};
        
        if (!courseId || !event) return;
        
        // 广播给所有学生端（不包括发送的教师端）
        socket.broadcast.emit('interaction:sync', { courseId, slideIndex, event, payload });
    });

    // 自动同步变量（教师端广播给所有学生端）
    socket.on('sync-var', (data) => {
        if (role !== 'host') return;
        const courseId = data && data.courseId ? String(data.courseId) : '';
        const slideIndex = data && Number.isFinite(Number(data.slideIndex)) ? Number(data.slideIndex) : 0;
        const key = data && typeof data.key === 'string' ? data.key : '';
        const value = data && 'value' in data ? data.value : undefined;
        
        if (!courseId || !key) return;
        
        // 广播给所有学生端（不包括发送的教师端）
        socket.broadcast.emit('sync-var', { courseId, slideIndex, key, value });
    });

    // 学生端请求完整同步数据
    socket.on('request-sync-state', (data) => {
        if (role !== 'viewer') return;
        const courseId = data && data.courseId ? String(data.courseId) : '';
        const slideIndex = data && Number.isFinite(Number(data.slideIndex)) ? Number(data.slideIndex) : 0;
        
        if (!courseId) return;
        
        // 定向发送给所有教师端（避免发给其他学生）
        io.to('hosts').emit('request-sync-state', { courseId, slideIndex, requesterId: socket.id });
    });

    // 教师端发送完整同步数据
    socket.on('full-sync-state', (data) => {
        if (role !== 'host') return;
        const targetId = data && data.targetId ? String(data.targetId) : '';
        const courseId = data && data.courseId ? String(data.courseId) : '';
        const slideIndex = data && Number.isFinite(Number(data.slideIndex)) ? Number(data.slideIndex) : 0;
        const state = data && typeof data.state === 'object' ? data.state : {};
        
        if (!courseId) return;
        
        if (targetId) {
            // 定向发送给请求的学生
            io.to(targetId).emit('full-sync-state', { courseId, slideIndex, state });
        } else {
            // 广播给所有学生
            socket.broadcast.emit('full-sync-state', { courseId, slideIndex, state });
        }
    });

    // 课程切换（仅老师端可操作）
    socket.on('select-course', (data) => {
        if (role === 'host') {
            const courses = Array.isArray(courseCatalog) ? courseCatalog : courseCatalog.courses;
            const course = courses.find(c => c.id === data.courseId);
            if (course) {
                annotationStore.clear();
                currentCourseId = data.courseId;
                currentSlideIndex = 0;
                console.log(`[course] switched to: ${course.title} (${course.id})`);
                // 广播给所有客户端切换课程
                io.emit('course-changed', {
                    courseId: currentCourseId,
                    courseFile: course.file,
                    slideIndex: 0,
                    hostSettings: currentHostSettings,
                });
            }
        }
    });

    // 结束课程（返回课程选择界面）
    socket.on('end-course', () => {
        if (role === 'host') {
            annotationStore.clear();
            currentCourseId = null;
            currentSlideIndex = 0;
            console.log(`[course] ended, back to selector`);
            io.emit('course-ended');
        }
    });

    // 注册课件依赖映射（前端加载课程时发来，filename -> publicSrc）
    // 服务端收到后会记住，下次 /lib/:fileName 找不到时直接从 publicSrc 下载
    socket.on('register-dependencies', (deps) => {
        if (Array.isArray(deps)) {
            deps.forEach(({ filename, publicSrc }) => {
                if (filename && publicSrc && !dependencyMap[filename]) {
                    dependencyMap[filename] = publicSrc;
                }
            });
        }
    });

    // 学生端上报异常行为（退出全屏、切换标签页等）
    socket.on('student-alert', (data) => {
        if (role === 'viewer') {
            pushLog(data.type, clientIp, {});
            io.to('hosts').emit('student-alert', { ip: clientIp, type: data.type });
        }
    });

    // 教师端推送设置变更给所有学生
    socket.on('host-settings', (settings) => {
        if (role === 'host') {
            currentHostSettings = { ...currentHostSettings, ...settings };
            socket.broadcast.emit('host-settings', currentHostSettings);
        }
    });

    // 教师端推送新管理员密码给所有学生
    socket.on('set-admin-password', (data) => {
        if (role === 'host' && data && data.hash) {
            console.log('[admin] password update pushed to students');
            socket.broadcast.emit('set-admin-password', { hash: data.hash });
        }
    });

    // 刷新课程列表
    socket.on('refresh-courses', () => {
        if (role === 'host') {
            courseCatalog = scanCourses();
            socket.emit('course-catalog-updated', { courses: courseCatalog });
        }
    });

    // 学生提交内容到教师端
    socket.on('student:submit', (data) => {
        if (role !== 'viewer') return;
        
        const submissionId = data && data.submissionId ? String(data.submissionId) : '';
        const courseId = data && data.courseId ? String(data.courseId) : currentCourseId || '';
        const content = data && data.content !== undefined ? data.content : null;
        const fileName = data && data.fileName ? String(data.fileName) : '';
        const mergeFile = data && typeof data.mergeFile === 'boolean' ? data.mergeFile : false;
        
        if (!submissionId || !courseId) {
            socket.emit('student:submit:result', { 
                submissionId, 
                success: false, 
                error: 'Invalid parameters' 
            });
            return;
        }
        
        // 转发到教师端处理存储
        io.to('hosts').emit('student:submit', {
            submissionId,
            courseId,
            clientIp,
            content,
            fileName,
            mergeFile,
            timestamp: Date.now()
        });
        
        console.log(`[student:submit] IP=${clientIp} courseId=${courseId} submissionId=${submissionId}`);
    });

    // 教师端确认已收到提交
    socket.on('student:submit:ack', (data) => {
        if (role !== 'host') return;
        
        const submissionId = data && data.submissionId ? String(data.submissionId) : '';
        const success = data && typeof data.success === 'boolean' ? data.success : true;
        const error = data && data.error ? String(data.error) : '';
        
        // 转发确认给学生端
        io.emit('student:submit:result', {
            submissionId,
            success,
            error
        });
    });

    // 处理断开连接逻辑
    socket.on('disconnect', () => {
        console.log(`[conn] disconnected: IP=${clientIp}`);
        if (role === 'viewer') {
            const remaining = (studentIPs.get(clientIp) || 1) - 1;
            if (remaining <= 0) {
                studentIPs.delete(clientIp);
                pushLog('leave', clientIp, {});
                io.to('hosts').emit('student-status', { count: studentIPs.size, action: 'leave', ip: clientIp });
            } else {
                studentIPs.set(clientIp, remaining);
            }
        }
    });
});

// ========================================================
// 4. 启动服务器
// ========================================================
const PORT = process.env.PORT || 3000;
server.on('error', (err) => {
    const code = err && err.code ? String(err.code) : 'UNKNOWN';
    const msg = err && err.message ? String(err.message) : String(err);
    console.error(`[server] listen error (${code}): ${msg}`);
    process.exit(1);
});
server.listen(PORT, () => {
    console.log(`\n=========================================`);
    console.log(`[server] SyncClassroom started on port ${PORT}`);
    console.log(`[server] Teacher (host): http://localhost:${PORT}`);
    console.log(`[server] Student (viewer): http://<LAN-IP>:${PORT}`);
    console.log(`=========================================\n`);
});

// ========================================================
// 5. 局域网发现：UDP 广播探测（学生端自动寻找教师端）
// ========================================================
try {
    const dgram = require('dgram');
    const DISCOVERY_PORT = Number(process.env.DISCOVERY_PORT || 31999);
    const discovery = dgram.createSocket('udp4');

    discovery.on('error', (err) => {
        console.error(`[discovery] udp error: ${err.message}`);
    });

    discovery.on('message', (msg, rinfo) => {
        const text = String(msg || '').trim();
        if (text !== 'LUMESYNC_DISCOVER') return;

        const payload = JSON.stringify({
            app: 'LumeSync',
            httpPort: Number(PORT),
            ts: Date.now(),
        });
        const buf = Buffer.from('LUMESYNC_HERE ' + payload);
        discovery.send(buf, rinfo.port, rinfo.address, () => {});
    });

    discovery.bind(DISCOVERY_PORT, () => {
        try {
            discovery.setBroadcast(true);
        } catch (_) {}
        console.log(`[discovery] udp listening on ${DISCOVERY_PORT}`);
    });
} catch (err) {
    console.error(`[discovery] disabled: ${err?.message || String(err)}`);
}
