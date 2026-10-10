// 生产用发现传输：bonjour-service（底层 multicast-dns）。
//
// 只在真正 publish/browse 时才创建套接字，因此模块可以被安全地 require（测试不起网络）。
// 组播栈缺失或不可用时：抛出明确错误，由 createDiscoveryPublisher 记录到
// /api/hub/status 的 discovery.lastError，HTTP/Socket 服务继续提供，用户改用手动地址。
//
// 选择 bonjour-service 而不是直接用 multicast-dns：前者已经封装了 DNS-SD 的探测/冲突
// 处理（RFC 6762 probing、实例名去重）和 TXT 编解码，Hub 只需要给出契约里的 TXT 字段；
// 后者要求自己实现 DNS-SD 状态机，属于重复造轮子。

const { createLogger } = require('./logger');

const DEFAULT_UP_TIMEOUT_MS = 2000;

function createBonjourTransport({ logger = createLogger({ level: 'warn' }) } = {}) {
    let bonjour = null;
    let published = null;

    function load() {
        if (bonjour) return bonjour;
        const { Bonjour } = require('bonjour-service');
        bonjour = new Bonjour();
        if (typeof bonjour.on === 'function') {
            bonjour.on('error', (error) => {
                logger.error(`[discovery] mDNS 栈错误：${error && error.message ? error.message : error}`);
            });
        }
        return bonjour;
    }

    function waitForUp(service) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('mDNS 发布超时（组播可能不可达）'));
            }, DEFAULT_UP_TIMEOUT_MS);
            service.once('up', () => {
                clearTimeout(timer);
                resolve();
            });
            service.once('error', (error) => {
                clearTimeout(timer);
                reject(new Error(`mDNS 发布失败：${error && error.message ? error.message : error}`));
            });
        });
    }

    return {
        async publish(descriptor) {
            await this.unpublish();
            const instance = load();
            const service = instance.publish({
                name: String(descriptor.name),
                type: String(descriptor.type),
                protocol: String(descriptor.protocol || 'tcp'),
                port: Number(descriptor.port),
                txt: { ...descriptor.txt }
            });
            await waitForUp(service);
            published = service;
        },

        async unpublish() {
            if (!published) return;
            const service = published;
            published = null;
            await new Promise((resolve) => {
                try {
                    service.stop(() => resolve());
                } catch (_) {
                    resolve();
                }
            });
        },

        async browse({ type, protocol, timeoutMs = 3000 }) {
            const instance = load();
            const browser = instance.find({ type: String(type), protocol: String(protocol || 'tcp') });
            const found = new Map();
            browser.on('up', (service) => {
                if (!service) return;
                found.set(service.fqdn || service.name, {
                    name: service.name,
                    host: service.host,
                    port: service.port,
                    addresses: Array.isArray(service.addresses) ? service.addresses : [],
                    txt: service.txt || {}
                });
            });
            await new Promise((resolve) => setTimeout(resolve, timeoutMs));
            try {
                browser.stop();
            } catch (_) {
                // 浏览器已停止时忽略
            }
            return Array.from(found.values());
        },

        async destroy() {
            await this.unpublish();
            if (bonjour) {
                try {
                    bonjour.destroy();
                } catch (_) {
                    // 已经销毁时忽略
                }
                bonjour = null;
            }
        }
    };
}

module.exports = { createBonjourTransport, DEFAULT_UP_TIMEOUT_MS };
