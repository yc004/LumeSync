// ========================================================
// 配置管理 - 读写学生端配置文件
// ========================================================
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

// 配置文件存放在用户数据目录，安装后持久化
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

const DEFAULT_CONFIG = {
    teacherIp: '192.168.1.100',
    port: 3000,
    adminPasswordHash: '', // SHA-256 hash，空表示未设置（默认密码 admin123）
};

// 默认密码的 SHA-256（admin123）
const DEFAULT_PASSWORD_HASH = 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3';

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
            return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
        }
    } catch (e) {
        console.error('[Config] 读取配置失败:', e.message);
    }
    return { ...DEFAULT_CONFIG };
}

function saveConfig(config) {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
        return true;
    } catch (e) {
        console.error('[Config] 保存配置失败:', e.message);
        return false;
    }
}

function getAdminPasswordHash(config) {
    return config.adminPasswordHash || DEFAULT_PASSWORD_HASH;
}

module.exports = { loadConfig, saveConfig, getAdminPasswordHash, CONFIG_PATH };
