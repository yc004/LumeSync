// 极简日志器。
//
// 硬约束：验证码、设备凭证、viewer 凭证都不得进入日志。因此这里不提供
// "打印任意对象" 的快捷方式，调用方只传自己拼好的、不含秘密的字符串。
// 需要排查配对问题时用 describePairingRequestPublic/屏幕侧接口，而不是日志。

const LEVELS = { silent: -1, error: 0, warn: 1, info: 2, debug: 3 };

function createLogger({ level = 'info', sink = console, prefix = '[hub]' } = {}) {
    const threshold = Object.prototype.hasOwnProperty.call(LEVELS, level) ? LEVELS[level] : LEVELS.info;
    const emit = (name, args) => {
        if (LEVELS[name] > threshold) return;
        const target = name === 'debug' ? 'log' : name;
        if (typeof sink[target] === 'function') sink[target](prefix, ...args);
    };
    return {
        level,
        error: (...args) => emit('error', args),
        warn: (...args) => emit('warn', args),
        info: (...args) => emit('info', args),
        debug: (...args) => emit('debug', args)
    };
}

/** 测试用：丢弃全部日志。 */
function createSilentLogger() {
    return createLogger({ level: 'silent' });
}

module.exports = { LEVELS, createLogger, createSilentLogger };
