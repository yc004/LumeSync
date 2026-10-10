// 教师端局域网搜索（mDNS / DNS-SD 的浏览侧）。
//
// 设计：teacher-cross-platform-relay.md §5.2、§6。固定机在「中继桥模式开启」时发布
// `_lumesync-relay._tcp.local`，TXT 只含教室名、稳定设备 ID、协议主版本、端口与
// 空闲/占用状态。教师端按协议主版本过滤、合并多网卡重复结果、丢弃校验不通过的记录。
//
// 传输层是注入式的 `{browse, destroy}`（生产实现基于 bonjour-service，见 createBonjourTransport）：
// 测试传假传输，**绝不起组播**。发现结果只用于"定位设备"，不能作为身份或授权依据——
// 授权只由固定机屏幕上的验证码完成（Hub 侧 teacher:pair.verify）。
//
// 与 apps/classroom-hub/server/discovery.js 的浏览助手保持同一套判定规则（同一契约常量），
// 但教师端包不 import Hub 应用代码，避免把服务端实现拖进桌面端。

const {
    DNS_SD_SERVICE_TYPE,
    DISCOVERY_FORBIDDEN_FIELDS,
    PROTOCOL_VERSION,
    parseProtocolVersion
} = require('@lumesync/classroom-protocol');

const { SESSION_AGENT_ERROR_CODES, SessionAgentError } = require('./errors');

const DEFAULT_BROWSE_TIMEOUT_MS = 3000;

/** `_lumesync-relay._tcp.local` → { type: 'lumesync-relay', protocol: 'tcp' } */
function parseServiceType(serviceType) {
    const match = /^_([^._]+)\._([^._]+)\./.exec(String(serviceType || ''));
    if (!match) return { type: 'lumesync-relay', protocol: 'tcp' };
    return { type: match[1], protocol: match[2] };
}

/**
 * 校验一条发现记录的 TXT：必须是字符串字典、不含凭证类字段、且带 id/proto/port。
 * Bonjour 的 TXT 只能是字符串，出现对象/数组说明记录被拼装过，直接丢弃。
 */
function inspectTxt(txt) {
    if (!txt || typeof txt !== 'object' || Array.isArray(txt)) {
        return { ok: false, reason: 'discovery_txt_missing' };
    }
    for (const key of Object.keys(txt)) {
        if (DISCOVERY_FORBIDDEN_FIELDS.includes(key)) {
            return { ok: false, reason: `discovery_txt_forbidden_field:${key}` };
        }
        if (typeof txt[key] !== 'string') {
            return { ok: false, reason: `discovery_txt_not_a_string:${key}` };
        }
    }
    if (!txt.id || !txt.proto || !txt.port) {
        return { ok: false, reason: 'discovery_txt_incomplete' };
    }
    return { ok: true, reason: '' };
}

function normalizeAddress(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const withoutZone = raw.split('%')[0];
    if (withoutZone.startsWith('::ffff:')) return withoutZone.slice(7);
    return withoutZone;
}

function isIpv4(address) {
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(address);
}

/**
 * 合并同一教室在多个网络接口上的重复结果，并做三层过滤：
 *   1. TXT 校验（inspectTxt）；
 *   2. 协议主版本必须与本地一致（不兼容教室不展示成可连接）；
 *   3. 必须有可用地址与端口（发现报文只帮助定位，连不上就不该出现在列表里）。
 *
 * 纯函数，便于直接测试。
 * @param {Array<object>} records 来自发现传输的原始记录
 * @param {object} [options]
 * @param {number} [options.protocolVersion] 本地协议主版本
 * @param {Array<{reason: string, record: object}>} [options.rejected] 可选：收集被丢弃的原因
 */
function mergeRelayRecords(records, { protocolVersion = PROTOCOL_VERSION, rejected = null } = {}) {
    const merged = new Map();
    const drop = (reason, record) => {
        if (Array.isArray(rejected)) rejected.push({ reason, record });
    };

    for (const record of Array.isArray(records) ? records : []) {
        if (!record || typeof record !== 'object') {
            drop('record_invalid', record);
            continue;
        }
        const inspected = inspectTxt(record.txt);
        if (!inspected.ok) {
            drop(inspected.reason, record);
            continue;
        }
        const parsed = parseProtocolVersion(record.txt.proto);
        if (!parsed.present || Number.isNaN(parsed.version)) {
            drop('discovery_proto_invalid', record);
            continue;
        }
        if (parsed.version !== Number(protocolVersion)) {
            drop(`discovery_proto_incompatible:${parsed.version}`, record);
            continue;
        }
        const classroomId = String(record.txt.id || record.name || '').trim();
        if (!classroomId) {
            drop('discovery_id_missing', record);
            continue;
        }

        const addresses = []
            .concat(Array.isArray(record.addresses) ? record.addresses : [])
            .map(normalizeAddress)
            .filter(Boolean);

        const entry = merged.get(classroomId) || {
            classroomId,
            name: String(record.txt.name || record.name || classroomId),
            label: String(record.txt.label || ''),
            state: record.txt.state === 'busy' ? 'busy' : 'free',
            protocolVersion: parsed.version,
            port: Number(record.txt.port || record.port || 0),
            addresses: [],
            hosts: [],
            records: 0,
            online: true
        };
        const port = Number(record.txt.port || record.port || 0);
        if (!entry.port && Number.isInteger(port) && port > 0) entry.port = port;
        if (record.txt.name) entry.name = String(record.txt.name);
        if (record.txt.label) entry.label = String(record.txt.label);
        entry.records += 1;
        for (const address of addresses) {
            if (!entry.addresses.includes(address)) entry.addresses.push(address);
        }
        if (record.host && !entry.hosts.includes(String(record.host))) entry.hosts.push(String(record.host));
        merged.set(classroomId, entry);
    }

    const results = [];
    for (const entry of merged.values()) {
        const addresses = entry.addresses.slice().sort((a, b) => (isIpv4(b) ? 1 : 0) - (isIpv4(a) ? 1 : 0));
        const address = addresses[0] || entry.hosts[0] || '';
        if (!address || !Number.isInteger(entry.port) || entry.port <= 0) {
            drop(!address ? 'discovery_address_missing' : 'discovery_port_missing', entry);
            continue;
        }
        results.push({ ...entry, addresses, address });
    }

    return results.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

/**
 * 用注入的传输搜索教室。传输异常会抛出类型化错误（调用方决定是否降级为手动地址）。
 * @param {object} input
 * @param {{browse: Function}} input.transport
 * @param {number} [input.protocolVersion]
 * @param {number} [input.timeoutMs]
 * @param {string} [input.serviceType]
 */
async function browseClassroomRelays({
    transport,
    protocolVersion = PROTOCOL_VERSION,
    timeoutMs = DEFAULT_BROWSE_TIMEOUT_MS,
    serviceType = DNS_SD_SERVICE_TYPE,
    rejected = null
} = {}) {
    if (!transport || typeof transport.browse !== 'function') {
        throw new SessionAgentError(
            SESSION_AGENT_ERROR_CODES.DISCOVERY_FAILED,
            '发现传输不可用：请注入 discoveryTransport 或改用手动输入固定机地址'
        );
    }
    const { type, protocol } = parseServiceType(serviceType);
    let records;
    try {
        records = await transport.browse({ serviceType, type, protocol, timeoutMs });
    } catch (error) {
        throw new SessionAgentError(
            SESSION_AGENT_ERROR_CODES.DISCOVERY_FAILED,
            `mDNS 搜索失败：${error && error.message ? error.message : error}（可手动输入固定机地址）`
        );
    }
    return mergeRelayRecords(records, { protocolVersion, rejected });
}

/** 绑定好传输与协议版本的搜索器：discover({timeoutMs}) 的默认实现。 */
function createRelayBrowser({
    transport,
    protocolVersion = PROTOCOL_VERSION,
    serviceType = DNS_SD_SERVICE_TYPE,
    defaultTimeoutMs = DEFAULT_BROWSE_TIMEOUT_MS
} = {}) {
    return {
        protocolVersion,
        serviceType,
        browse: (options = {}) => browseClassroomRelays({
            transport,
            protocolVersion,
            serviceType,
            timeoutMs: options.timeoutMs === undefined ? defaultTimeoutMs : options.timeoutMs,
            rejected: options.rejected
        })
    };
}

/**
 * 生产用发现传输：bonjour-service（底层 multicast-dns）。
 *
 * 只在真正 browse 时才创建实例，因此模块可以被安全地 require（测试不起网络）。
 * 组播栈不可用时抛出明确错误，由 session-agent 记成一条 error 事件并提示手动输入地址。
 */
function createBonjourTransport({ logger = null, loadTimeoutMs = DEFAULT_BROWSE_TIMEOUT_MS } = {}) {
    let bonjour = null;

    function load() {
        if (bonjour) return bonjour;
        const { Bonjour } = require('bonjour-service');
        bonjour = new Bonjour();
        if (typeof bonjour.on === 'function') {
            bonjour.on('error', (error) => {
                if (logger) logger.error(`[discovery] mDNS 栈错误：${error && error.message ? error.message : error}`);
            });
        }
        return bonjour;
    }

    return {
        async browse({ type, protocol, timeoutMs = loadTimeoutMs }) {
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
            await new Promise((resolve) => {
                const timer = setTimeout(resolve, Math.max(0, Number(timeoutMs) || 0));
                if (timer && typeof timer.unref === 'function') timer.unref();
            });
            try {
                browser.stop();
            } catch (_) {
                // 浏览器已停止时忽略
            }
            return Array.from(found.values());
        },

        async destroy() {
            if (!bonjour) return;
            try {
                bonjour.destroy();
            } catch (_) {
                // 已经销毁时忽略
            }
            bonjour = null;
        }
    };
}

module.exports = {
    DNS_SD_SERVICE_TYPE,
    DEFAULT_BROWSE_TIMEOUT_MS,
    parseServiceType,
    inspectTxt,
    normalizeAddress,
    isIpv4,
    mergeRelayRecords,
    browseClassroomRelays,
    createRelayBrowser,
    createBonjourTransport
};
