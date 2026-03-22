const AutoLaunch = require('auto-launch');

/**
 * AutoLaunch 管理器
 * 使用 auto-launch 库处理所有平台的开机自启动
 */
class AutoLauncher {
    constructor(appName, exePath) {
        // 确保使用绝对路径
        if (!require('path').isAbsolute(exePath)) {
            throw new Error('路径必须是绝对路径');
        }

        this.appName = appName;
        this.exePath = exePath;

        // 创建 auto-launch 实例
        this.launcher = new AutoLaunch({
            name: appName,
            path: exePath,
            isHidden: false
        });
    }

    /**
     * 设置开机自启动
     * @param {boolean} enable - 是否启用
     * @returns {Promise<boolean>}
     */
    async enable(enable) {
        try {
            if (enable) {
                await this.launcher.enable();
            } else {
                await this.launcher.disable();
            }
            console.log(`[AutoLaunch] 自启动已${enable ? '开启' : '关闭'}`);
            return true;
        } catch (err) {
            console.error('[AutoLaunch] 设置自启动失败:', err.message);
            throw err;
        }
    }

    /**
     * 检查开机自启动是否启用
     * @returns {Promise<boolean>}
     */
    async isEnabled() {
        try {
            const enabled = await this.launcher.isEnabled();
            return enabled;
        } catch (err) {
            console.error('[AutoLaunch] 检查自启动状态失败:', err.message);
            return false;
        }
    }
}

// 保持向后兼容的导出
function createAutostartTask(enable) {
    throw new Error('createAutostartTask 已弃用，请使用 AutoLauncher 类');
}

function getAutostartTask() {
    throw new Error('getAutostartTask 已弃用，请使用 AutoLauncher 类');
}

// 测试运行
if (require.main === module) {
    const action = process.argv[2];
    const appName = 'LumeSync Student';
    const exePath = process.execPath;

    const launcher = new AutoLauncher(appName, exePath);

    (async () => {
        try {
            if (action === 'enable') {
                await launcher.enable(true);
            } else if (action === 'disable') {
                await launcher.enable(false);
            } else if (action === 'check') {
                const enabled = await launcher.isEnabled();
                console.log('Autostart enabled:', enabled);
            } else {
                console.log('Usage: node task-scheduler-autostart.js [enable|disable|check]');
            }
        } catch (err) {
            console.error('Error:', err);
            process.exit(1);
        }
    })();
}

module.exports = { AutoLauncher, createAutostartTask, getAutostartTask };
