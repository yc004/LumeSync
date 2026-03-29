const fs = require('fs');
const path = require('path');
const os = require('os');

// 日志级别
const LOG_LEVELS = {
    ERROR: 'ERROR',
    WARN: 'WARN',
    INFO: 'INFO',
    DEBUG: 'DEBUG'
};

class Logger {
    constructor(appName) {
        this.appName = appName;
        this.logDir = path.join(os.homedir(), `.${appName}`, 'logs');
        this.currentLogFile = null;
        this.maxLogFileSize = 10 * 1024 * 1024; // 10MB
        this.maxLogFiles = 5;
        this.level = process.env.LOG_LEVEL || 'INFO';
        this.stdoutEnabled = true;
        this.fileEnabled = true;
        this._consoleInitialized = false;

        this.init();
    }

    init() {
        try {
            // 创建日志目录
            if (!fs.existsSync(this.logDir)) {
                fs.mkdirSync(this.logDir, { recursive: true });
            }

            // 设置当前日志文件（按日期）
            const date = new Date().toISOString().split('T')[0];
            this.currentLogFile = path.join(this.logDir, `${this.appName}-${date}.log`);

            // 清理旧日志文件
            this.cleanOldLogs();

            // 使用原始console输出启动信息
            const originalConsole = this._getOriginalConsole();
            originalConsole.log('[Logger] Log directory:', this.logDir);

            // 写入启动日志
            this.info('Logger initialized', {
                appName: this.appName,
                logDir: this.logDir,
                logFile: this.currentLogFile,
                level: this.level,
                platform: os.platform(),
                arch: os.arch(),
                nodeVersion: process.version
            });
        } catch (err) {
            const originalConsole = this._getOriginalConsole();
            originalConsole.error('[Logger] Failed to initialize:', err);
        }
    }

    // 获取原始console对象，防止递归
    _getOriginalConsole() {
        if (!this._originalConsole) {
            this._originalConsole = {
                log: console.log.bind(console),
                warn: console.warn.bind(console),
                error: console.error.bind(console),
                info: console.info.bind(console)
            };
        }
        return this._originalConsole;
    }

    cleanOldLogs() {
        try {
            const files = fs.readdirSync(this.logDir)
                .filter(f => f.startsWith(this.appName) && f.endsWith('.log'))
                .map(f => ({
                    name: f,
                    path: path.join(this.logDir, f),
                    time: fs.statSync(path.join(this.logDir, f)).mtime.getTime()
                }))
                .sort((a, b) => b.time - a.time);

            // 删除超出数量限制的旧文件
            if (files.length > this.maxLogFiles) {
                const toDelete = files.slice(this.maxLogFiles);
                toDelete.forEach(file => {
                    fs.unlinkSync(file.path);
                    console.log(`[Logger] Deleted old log file: ${file.name}`);
                });
            }
        } catch (err) {
            console.error('[Logger] Failed to clean old logs:', err);
        }
    }

    rotateLogFile() {
        try {
            if (!fs.existsSync(this.currentLogFile)) return;

            const stats = fs.statSync(this.currentLogFile);
            if (stats.size > this.maxLogFileSize) {
                // 重命名旧文件
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const newPath = this.currentLogFile.replace('.log', `-${timestamp}.log`);
                fs.renameSync(this.currentLogFile, newPath);

                // 清理旧日志
                this.cleanOldLogs();

                this.info('Log rotated', { oldFile: newPath });
            }
        } catch (err) {
            console.error('[Logger] Failed to rotate log:', err);
        }
    }

    formatMessage(level, category, message, data = null) {
        const timestamp = new Date().toISOString();
        const pid = process.pid;

        let msg = `[${timestamp}] [${level}] [${category}] [PID:${pid}] ${message}`;

        if (data) {
            if (typeof data === 'string') {
                msg += `\n${data}`;
            } else if (data instanceof Error) {
                msg += `\nError: ${data.message}\nStack: ${data.stack}`;
            } else {
                msg += `\n${JSON.stringify(data, null, 2)}`;
            }
        }

        return msg;
    }

    writeToFile(message) {
        if (!this.fileEnabled) return;

        try {
            // 检查是否需要轮转
            this.rotateLogFile();

            // 追加写入
            fs.appendFileSync(this.currentLogFile, message + '\n', 'utf-8');
        } catch (err) {
            // 使用原始console避免递归
            const originalConsole = this._getOriginalConsole();
            originalConsole.error('[Logger] Failed to write to file:', err);
        }
    }

    writeToConsole(message, level) {
        if (!this.stdoutEnabled) return;

        const originalConsole = this._getOriginalConsole();

        switch (level) {
            case LOG_LEVELS.ERROR:
                originalConsole.error(message);
                break;
            case LOG_LEVELS.WARN:
                originalConsole.warn(message);
                break;
            case LOG_LEVELS.DEBUG:
                if (this.level === 'DEBUG') originalConsole.log(message);
                break;
            default:
                originalConsole.log(message);
        }
    }

    log(level, category, message, data = null) {
        // 检查日志级别
        const levels = [LOG_LEVELS.DEBUG, LOG_LEVELS.INFO, LOG_LEVELS.WARN, LOG_LEVELS.ERROR];
        if (levels.indexOf(this.level) > levels.indexOf(level)) return;

        const formatted = this.formatMessage(level, category, message, data);

        // 输出到控制台
        this.writeToConsole(formatted, level);

        // 写入文件
        this.writeToFile(formatted);
    }

    error(category, message, data = null) {
        this.log(LOG_LEVELS.ERROR, category, message, data);
    }

    warn(category, message, data = null) {
        this.log(LOG_LEVELS.WARN, category, message, data);
    }

    info(category, message, data = null) {
        this.log(LOG_LEVELS.INFO, category, message, data);
    }

    debug(category, message, data = null) {
        this.log(LOG_LEVELS.DEBUG, category, message, data);
    }

    // 获取日志目录路径（用于 UI 显示）
    getLogDir() {
        return this.logDir;
    }

    // 打开日志目录
    openLogDir() {
        const { exec } = require('child_process');
        const dir = this.getLogDir();

        switch (os.platform()) {
            case 'win32':
                exec(`explorer "${dir}"`);
                break;
            case 'darwin':
                exec(`open "${dir}"`);
                break;
            case 'linux':
                exec(`xdg-open "${dir}"`);
                break;
        }
    }
}

// 导出单例实例
module.exports = {
    Logger,
    LOG_LEVELS
};
