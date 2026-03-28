require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');

const app = express();

const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

if (!WEBHOOK_SECRET) {
    console.error("[安全警告] 致命错误: 未在 .env 文件中配置 WEBHOOK_SECRET！");
    process.exit(1);
}

const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
const PUBLIC_DIR = path.join(__dirname, 'public');

if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));

app.use(express.static(PUBLIC_DIR));
app.use('/downloads', express.static(DOWNLOAD_DIR));

async function downloadAsset(url, filename) {
    const filePath = path.join(DOWNLOAD_DIR, filename);
    console.log(`[LumeSync] 开始下载: ${filename} (源: ${url})`);

    try {
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'stream',
            headers: {
                'User-Agent': 'LumeSync-Server',
                'Accept': 'application/octet-stream'
            }
        });

        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                console.log(`[LumeSync] 下载完成并保存至: ${filePath}`);
                resolve(filePath);
            });
            writer.on('error', (err) => {
                console.error(`[LumeSync] 文件写入失败: ${err.message}`);
                reject(err);
            });
        });
    } catch (error) {
        console.error(`[LumeSync] 下载请求失败 ${filename}:`, error.message);
    }
}

app.post('/api/webhook/github', (req, res) => {
    const signature = req.headers['x-hub-signature-256'];
    if (!signature) {
        return res.status(401).send('Unauthorized: No signature provided');
    }

    const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
    const digest = 'sha256=' + hmac.update(req.rawBody).digest('hex');
    
    if (signature.length !== digest.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))) {
        return res.status(401).send('Unauthorized: Invalid signature');
    }

    const event = req.headers['x-github-event'];
    if (event !== 'release') {
        return res.status(200).send('Ignored: Not a release event');
    }

    const payload = req.body;
    // 确保是 yc004/SyncClassroom 仓库的发布事件
    if (payload.action === 'published' && payload.repository.full_name === 'yc004/SyncClassroom') {
        const assets = payload.release.assets;
        
        res.status(202).send('Release received, starting background download.');
        console.log(`[LumeSync] 收到 yc004/SyncClassroom 新版本发布: ${payload.release.tag_name}`);

        let versionData = {
            version: payload.release.tag_name,
            date: payload.release.published_at,
            files: []
        };

        // 精准匹配您的命名规则：SyncClassroom-教师端-Setup-*.exe
        assets.forEach(asset => {
            if (asset.name.endsWith('.exe')) {
                let localName = '';
                if (asset.name.includes('教师端')) {
                    localName = 'SyncClassroom-Teacher-Latest.exe';
                } else if (asset.name.includes('学生端')) {
                    localName = 'SyncClassroom-Student-Latest.exe';
                }

                if (localName) {
                    downloadAsset(asset.browser_download_url, localName);
                    versionData.files.push(localName);
                }
            }
        });

        fs.writeFileSync(
            path.join(DOWNLOAD_DIR, 'version.json'), 
            JSON.stringify(versionData, null, 2)
        );

    } else {
        res.status(200).send('Ignored: Action is not "published" or repo mismatch');
    }
});

app.listen(PORT, () => {
    console.log(`[LumeSync] 官网及下载服务已启动，监听端口: ${PORT}`);
    console.log(`[LumeSync] 监听仓库: yc004/SyncClassroom`);
});