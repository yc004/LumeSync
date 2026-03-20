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
const io = new Server(server);

// ========================================================
// 0. 课程状态管理
// ========================================================

// 扫描 courses 目录获取所有可用课程
const coursesDir = path.join(__dirname, 'public', 'courses');

function scanCourses() {
    if (!fs.existsSync(coursesDir)) {
        fs.mkdirSync(coursesDir, { recursive: true });
        return [];
    }
    
    const files = fs.readdirSync(coursesDir);
    const courses = files
        .filter(f => f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.tsx'))
        .map(f => {
            const courseId = f.replace('.js', '');
            const filePath = path.join(coursesDir, f);
            let content;
            try {
                content = fs.readFileSync(filePath, 'utf-8');
            } catch (err) {
                console.warn(`[scanCourses] ⚠️ 跳过无法读取的文件: ${f} (${err.message})`);
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
                color
            };
        })
        .filter(course => course !== null);
    
    return courses;
}

// 当前选中的课程和课程状态
let currentCourseId = null;
let currentSlideIndex = 0;
let courseCatalog = scanCourses();

// ========================================================
// 1. 静态文件托管 (如果在本地硬盘找到了，直接极速返回！)
// ========================================================
// 对 /lib/ 和 /weights/ 使用自定义处理，让不存在的文件进入缓存代理
app.use('/lib', (req, res, next) => {
    const filePath = path.join(__dirname, 'public', 'lib', req.path);
    if (fs.existsSync(filePath)) {
        // 文件存在，直接返回，添加缓存控制头防止浏览器缓存错误版本
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        return res.sendFile(filePath);
    }
    // 文件不存在，进入缓存代理
    next();
});

app.use('/weights', (req, res, next) => {
    const filePath = path.join(__dirname, 'public', 'weights', req.path);
    if (fs.existsSync(filePath)) {
        return res.sendFile(filePath);
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
const libDir = path.join(__dirname, 'public', 'lib');
const weightsDir = path.join(__dirname, 'public', 'weights');
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
    'face-api.min.js':          'https://fastly.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js',
};

app.use('/lib/:fileName', (req, res) => {
    const fileName = req.params.fileName;
    const localPath = path.join(libDir, fileName);
    
    // 优先级：固定映射表 > 课件注册的 publicSrc > npm 包名猜测
    let possibleUrls = [];
    
    if (KNOWN_FILE_URLS[fileName]) {
        // 已知框架文件，使用固定 URL
        possibleUrls = [KNOWN_FILE_URLS[fileName]];
        console.log(`[缓存代理] 下载 ${fileName} (已知地址)...`);
    } else if (dependencyMap[fileName]) {
        // 课件注册的精确地址，将 cdn.jsdelivr.net 替换为 fastly 节点以提升可达性
        const registeredUrl = dependencyMap[fileName].replace('cdn.jsdelivr.net', 'fastly.jsdelivr.net');
        possibleUrls = [registeredUrl, dependencyMap[fileName]];
        console.log(`[缓存代理] 下载 ${fileName} (课件注册地址)...`);
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
        console.log(`[缓存代理] 下载 ${fileName}...`);
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
            console.warn(`[缓存代理] 请求失败 ${url}: ${err.message}`);
            onError();
        });
    };
    
    // 尝试下载，使用第一个成功的
    const tryNextUrl = (index) => {
        if (index >= possibleUrls.length) {
            console.log(`[缓存代理] ❌ 无法找到 ${fileName}`);
            return res.status(404).send(`无法找到脚本: ${fileName}`);
        }
        
        const url = possibleUrls[index];
        
        tryDownloadFromUrl(url, 
            (response, finalUrl) => {
                const size = response.headers['content-length'] || '未知';
                console.log(`[缓存代理] ✅ ${fileName} 已下载 (${size} bytes)`);
                
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
                    console.error(`[缓存代理] 下载出错: ${err.message}`);
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
app.use('/webfonts/:fileName', (req, res) => {
    const fileName = req.params.fileName;
    const localPath = path.join(libDir, fileName);
    if (fs.existsSync(localPath)) {
        return res.sendFile(localPath);
    }
    // 本地不存在，从 KNOWN_FILE_URLS 下载
    const remoteUrl = KNOWN_FILE_URLS[fileName];
    if (remoteUrl) {
        console.log(`[缓存代理] 下载字体 ${fileName} (已知地址)...`);
        return downloadAndCache(remoteUrl, localPath, res);
    }
    res.status(404).send('字体文件未找到');
});

// 代理 2：图片资源代理 - 处理 /images/ 下的外部图片
const imagesDir = path.join(__dirname, 'public', 'images');
if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

app.use('/images/proxy', (req, res) => {
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
    
    console.log(`[图片代理] 下载: ${imageUrl.substring(0, 60)}...`);
    
    // 下载图片
    const client = imageUrl.startsWith('https') ? require('https') : require('http');
    client.get(imageUrl, (response) => {
        if (response.statusCode === 200) {
            const fileStream = fs.createWriteStream(cachePath);
            response.pipe(fileStream);
            
            fileStream.on('finish', () => {
                fileStream.close();
                console.log(`[图片代理] ✅ 已缓存: ${cacheFileName}`);
                res.sendFile(cachePath);
            });
            
            fileStream.on('error', (err) => {
                console.error(`[图片代理] 保存失败: ${err.message}`);
                if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
                res.status(500).send('图片保存失败');
            });
        } else {
            console.error(`[图片代理] 下载失败: ${response.statusCode}`);
            res.status(response.statusCode).send('图片下载失败');
        }
    }).on('error', (err) => {
        console.error(`[图片代理] 请求失败: ${err.message}`);
        res.status(500).send('图片请求失败');
    });
});

// 代理 3：拦截所有的 AI 模型权重文件的请求
app.use('/weights/:fileName', (req, res) => {
    if (req.method === 'HEAD') return res.status(200).end();
    
    const fileName = req.params.fileName;
    console.log(`[缓存代理] 自动帮您从公网抓取缺失模型: ${fileName}`);
    const remoteUrl = `https://fastly.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights/${fileName}`;
    const localPath = path.join(weightsDir, fileName);
    downloadAndCache(remoteUrl, localPath, res);
});

// ========================================================
// 🛠️ API 路由
// ========================================================

// 获取课程列表
app.get('/api/courses', (req, res) => {
    res.json({
        courses: courseCatalog,
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
    res.json({ success: true, courses: courseCatalog });
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

io.on('connection', (socket) => {
    const clientIp = socket.handshake.address;
    const isLocalhost = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1';
    
    const role = isLocalhost ? 'host' : 'viewer';
    console.log(`🟢 用户连接: IP=${clientIp}, 自动分配: ${role === 'host' ? '🧑‍🏫 老师端' : '👨‍🎓 学生端'}`);

    // 发送角色信息和当前课程状态给当前客户端
    socket.emit('role-assigned', { 
        role: role,
        currentCourseId: currentCourseId,
        currentSlideIndex: currentSlideIndex,
        courseCatalog: courseCatalog
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

    // 课程切换（仅老师端可操作）
    socket.on('select-course', (data) => {
        if (role === 'host') {
            const course = courseCatalog.find(c => c.id === data.courseId);
            if (course) {
                currentCourseId = data.courseId;
                currentSlideIndex = 0;
                console.log(`📚 老师切换课程: ${course.title} (${course.id})`);
                // 广播给所有客户端切换课程
                io.emit('course-changed', {
                    courseId: currentCourseId,
                    courseFile: course.file,
                    slideIndex: 0
                });
            }
        }
    });

    // 结束课程（返回课程选择界面）
    socket.on('end-course', () => {
        if (role === 'host') {
            currentCourseId = null;
            currentSlideIndex = 0;
            console.log(`🏠 老师结束课程，返回课程选择界面`);
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
            io.to('hosts').emit('student-alert', { ip: clientIp, type: data.type });
        }
    });

    // 教师端推送设置变更给所有学生
    socket.on('host-settings', (settings) => {
        if (role === 'host') {
            socket.broadcast.emit('host-settings', settings);
        }
    });

    // 刷新课程列表
    socket.on('refresh-courses', () => {
        if (role === 'host') {
            courseCatalog = scanCourses();
            socket.emit('course-catalog-updated', { courses: courseCatalog });
        }
    });

    // 处理断开连接逻辑
    socket.on('disconnect', () => {
        console.log(`🔴 用户离开: IP=${clientIp}`);
        if (role === 'viewer') {
            const remaining = (studentIPs.get(clientIp) || 1) - 1;
            if (remaining <= 0) {
                studentIPs.delete(clientIp);
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
server.listen(PORT, () => {
    console.log(`\n=========================================`);
    console.log(`🚀 互动课堂服务器 (智能代理版) 已启动!`);
    console.log(`👉 老师端 (主控): http://localhost:${PORT}`);
    console.log(`👉 学生端 (观看): http://局域网IP:${PORT}`);
    console.log(`=========================================\n`);
});