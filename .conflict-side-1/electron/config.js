// ========================================================
// 配置管理 - 读写学生端配置文件
// ========================================================
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

// 配置文件存放在用户数据目录，安装后持久化
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');

const DEFAULT_CONFIG = {
    teacherIp: '192.168.1.100',
    port: 3000,
    adminPasswordHash: '', // SHA-256 hash，空表示未设置（默认密码 admin123）
};

const DEFAULT_SETTINGS = {
    forceFullscreen: true,
    syncFollow: true,
    alertJoin: true,
    alertLeave: true,
    alertFullscreenExit: true,
    alertTabHidden: true,
};

// 默认密码的 SHA-256（admin123）
const DEFAULT_PASSWORD_HASH = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9';

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

function loadSettings() {
    try {
        if (fs.existsSync(SETTINGS_PATH)) {
            const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8');
            return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
        }
    } catch (e) {
        console.error('[Config] 读取设置失败:', e.message);
    }
    return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings) {
    try {
        fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
        return true;
    } catch (e) {
        console.error('[Config] 保存设置失败:', e.message);
        return false;
    }
}

module.exports = { loadConfig, saveConfig, getAdminPasswordHash, loadSettings, saveSettings, CONFIG_PATH };
