const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

// 初始化 Express 和 HTTP 服务器
const app = express();
const server = http.createServer(app);

// 初始化 Socket.io
const io = new Server(server);

// ========================================================
// 1. 静态文件托管 (如果在本地硬盘找到了，直接极速返回！)
// ========================================================
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

// 代理 1：拦截核心脚本库的请求
app.use('/lib/face-api.min.js', (req, res) => {
    // 欺骗前端引擎：当引擎发 HEAD 探测局域网通不通时，直接告诉它“我支持！”
    if (req.method === 'HEAD') return res.status(200).end();
    
    console.log(`[缓存代理] 自动帮您从公网抓取缺失脚本: face-api.min.js`);
    const remoteUrl = 'https://fastly.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
    const localPath = path.join(libDir, 'face-api.min.js');
    downloadAndCache(remoteUrl, localPath, res);
});

// 代理 2：拦截所有的 AI 模型权重文件的请求
app.use('/weights/:fileName', (req, res) => {
    if (req.method === 'HEAD') return res.status(200).end();
    
    const fileName = req.params.fileName;
    console.log(`[缓存代理] 自动帮您从公网抓取缺失模型: ${fileName}`);
    const remoteUrl = `https://fastly.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights/${fileName}`;
    const localPath = path.join(weightsDir, fileName);
    downloadAndCache(remoteUrl, localPath, res);
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

let studentCount = 0; // 记录当前在线学生总数

io.on('connection', (socket) => {
    const clientIp = socket.handshake.address;
    const isLocalhost = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1';
    
    const role = isLocalhost ? 'host' : 'viewer';
    console.log(`🟢 用户连接: IP=${clientIp}, 自动分配: ${role === 'host' ? '🧑‍🏫 老师端' : '👨‍🎓 学生端'}`);

    // 发送角色信息给当前客户端
    socket.emit('role-assigned', { role: role });

    // 处理监控逻辑
    if (role === 'host') {
        socket.join('hosts'); // 老师加入专属的接收通知频道
        socket.emit('student-status', { count: studentCount, action: 'init' }); // 初始化告诉老师当前的人数
    } else {
        studentCount++; // 学生加入，人数+1
        // 仅将通知发给房间内的老师端，保护隐私且避免学生端互相干扰
        io.to('hosts').emit('student-status', { count: studentCount, action: 'join', ip: clientIp });
    }

    // 翻页同步
    socket.on('sync-slide', (data) => {
        if (role === 'host') {
            socket.broadcast.emit('sync-slide', data);
        }
    });

    // 处理断开连接逻辑
    socket.on('disconnect', () => {
        console.log(`🔴 用户离开: IP=${clientIp}`);
        if (role === 'viewer') {
            studentCount--; // 学生离开，人数-1
            io.to('hosts').emit('student-status', { count: studentCount, action: 'leave', ip: clientIp });
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