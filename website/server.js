require('dotenv').config(); // 加载 .env 文件中的环境变量

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
    console.log(`[LumeSync] 准备下载: ${filename}`);

    try {
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'stream',
            timeout: 300000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/octet-stream'
            }
        });

        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                console.log(`[LumeSync] ✅ 下载成功: ${filename}`);
                resolve(filePath);
            });
            writer.on('error', (err) => {
                console.error(`[LumeSync] ❌ 写入磁盘失败: ${err.message}`);
                reject(err);
            });
        });
    } catch (error) {
        console.error(`[LumeSync] ❌ 下载请求失败 ${filename}: ${error.message}`);
    }
}

app.post('/api/webhook/github', (req, res) => {
    const signature = req.headers['x-hub-signature-256'];
    if (!signature) return res.status(401).send('Unauthorized: No signature provided');

    const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
    const digest = 'sha256=' + hmac.update(req.rawBody).digest('hex');
    
    if (signature.length !== digest.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))) {
        return res.status(401).send('Unauthorized: Invalid signature');
    }

    const event = req.headers['x-github-event'];
    if (event !== 'release') return res.status(200).send('Ignored: Not a release event');

    const payload = req.body;
    const validActions = ['published', 'edited', 'released'];
    const repoName = payload.repository?.full_name?.toLowerCase();

    // ================= 配置您的两个仓库 =================
    const MAIN_REPO = 'yc004/lumesync';
    // 👇 【关键】请将这里改为你实际的 VS Code 插件仓库名 (全小写)
    const EDITOR_REPO = 'yc004/LumeSync-Editor-Plugin'; 
    // ====================================================

    if (validActions.includes(payload.action) && (repoName === MAIN_REPO || repoName === EDITOR_REPO)) {
        const assets = payload.release.assets;
        
        res.status(202).send('Release received, starting background download.');
        console.log(`\n[LumeSync] 收到 ${payload.repository.full_name} 新版本推送 (动作: ${payload.action}): ${payload.release.tag_name}`);

        // 引入 JSON 数据合并逻辑，防止主程序和插件的版本号互相覆盖
        let versionPath = path.join(DOWNLOAD_DIR, 'version.json');
        let versionData = { mainVersion: "v-.-.-", editorVersion: "v-.-.-", date: "", files: [] };
        
        if (fs.existsSync(versionPath)) {
            try { 
                const raw = fs.readFileSync(versionPath, 'utf8');
                versionData = { ...versionData, ...JSON.parse(raw) };
            } catch (e) { console.error("解析已有 version.json 失败"); }
        }

        // 根据不同的仓库更新对应的版本号字段
        if (repoName === MAIN_REPO) {
            versionData.mainVersion = payload.release.tag_name;
            versionData.version = payload.release.tag_name; // 兼容老字段
        } else if (repoName === EDITOR_REPO) {
            versionData.editorVersion = payload.release.tag_name;
        }
        
        versionData.date = payload.release.published_at || payload.release.created_at;

        assets.forEach(asset => {
            // 新增了对 .vsix (VS Code 扩展名) 的支持
            if (asset.name.endsWith('.exe') || asset.name.endsWith('.zip') || asset.name.endsWith('.vsix')) { 
                let localName = '';
                const assetNameLower = asset.name.toLowerCase();
                
                if (repoName === MAIN_REPO) {
                    if (assetNameLower.includes('教师') || assetNameLower.includes('teacher')) {
                        localName = 'LumeSync-Teacher-Latest.exe';
                    } else if (assetNameLower.includes('学生') || assetNameLower.includes('student')) {
                        localName = 'LumeSync-Student-Latest.exe';
                    }
                } else if (repoName === EDITOR_REPO) {
                    // 只要是插件仓库的 .vsix 文件，一律下载为编辑器插件
                    if (assetNameLower.endsWith('.vsix')) {
                        localName = 'LumeSync-Editor-Latest.vsix';
                    }
                }

                if (localName) {
                    const proxyUrl = `https://ghfast.top/${asset.browser_download_url}`;
                    downloadAsset(proxyUrl, localName);
                    if (!versionData.files.includes(localName)) {
                        versionData.files.push(localName);
                    }
                }
            }
        });

        fs.writeFileSync(versionPath, JSON.stringify(versionData, null, 2));
    } else {
        res.status(200).send('Ignored: Action is not valid or repo mismatch');
    }
});

app.listen(PORT, () => {
    console.log(`[LumeSync] 官网及下载服务已启动，监听端口: ${PORT}`);
    console.log(`[LumeSync] 监听仓库: 双核模式 (主应用 + VS Code 插件)`);
});