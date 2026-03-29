#!/usr/bin/env node
// ========================================================
// 卸载密码验证工具
// 用法：verify-password.exe --file <pwd_file> --config <config.json>
//       verify-password.exe --file <pwd_file>   (使用默认密码 admin123)
// 返回码：0 = 验证通过，1 = 验证失败，2 = 参数错误
// ========================================================
const crypto = require('crypto');
const fs = require('fs');

const DEFAULT_HASH = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9'; // admin123

const args = process.argv.slice(2);
const fileIdx = args.indexOf('--file');
const configIdx = args.indexOf('--config');

if (fileIdx === -1 || !args[fileIdx + 1]) {
    process.exit(2);
}

const pwdFile = args[fileIdx + 1];
const configFile = configIdx !== -1 ? args[configIdx + 1] : null;

let password = '';
try {
    password = fs.readFileSync(pwdFile, 'utf-8').trim();
} catch (e) {
    process.exit(2);
}

// 读取配置中的 hash
let expectedHash = DEFAULT_HASH;
if (configFile) {
    try {
        const cfg = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
        if (cfg.adminPasswordHash) expectedHash = cfg.adminPasswordHash;
    } catch (e) {
        // 配置读取失败，使用默认 hash
    }
}

const inputHash = crypto.createHash('sha256').update(password).digest('hex');

if (inputHash === expectedHash) {
    process.exit(0); // 验证通过
} else {
    process.exit(1); // 验证失败
}
