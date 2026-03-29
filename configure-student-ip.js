// ========================================================
// 学生端 IP 配置助手
// ========================================================

const path = require('path');
const fs = require('fs');
const os = require('os');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function getUserIP() {
    const interfaces = os.networkInterfaces();
    for (const name in interfaces) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '未知';
}

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
    console.log('\n🔧 SyncClassroom 学生端 IP 配置助手\n');
    console.log('当前机器 IP 地址:', getUserIP());
    console.log('默认教师端 IP: 192.168.1.100\n');

    console.log('请选择操作：');
    console.log('1. 设置教师端 IP 地址');
    console.log('2. 使用本地测试 (localhost)');
    console.log('3. 查看当前配置');
    console.log('4. 退出\n');

    const choice = await question('请输入选项 (1-4): ');

    if (choice === '1') {
        const newIP = await question('请输入教师端 IP 地址: ');
        const config = {
            teacherIp: newIP.trim(),
            port: 3000,
            adminPasswordHash: ''
        };

        // 这里无法直接修改配置文件，因为配置文件位置依赖于 Electron 的 userData 路径
        console.log('\n💡 提示：配置文件位于学生端应用的数据目录中');
        console.log('请在学生端应用的管理员设置中修改教师端 IP 地址\n');
    } else if (choice === '2') {
        console.log('\n💡 提示：学生端配置中设置教师端 IP 为 127.0.0.1 即可使用本地测试\n');
    } else if (choice === '3') {
        console.log('\n📋 当前配置:');
        console.log('  教师端 IP: 192.168.1.100 (默认)');
        console.log('  端口: 3000');
        console.log('  管理员密码: admin123 (默认)\n');
        console.log('💡 提示：实际配置可能已更改，请查看学生端应用的管理员设置\n');
    } else if (choice === '4') {
        console.log('\n👋 再见！\n');
    } else {
        console.log('\n❌ 无效的选项\n');
    }

    rl.close();
}

main().catch(console.error);
