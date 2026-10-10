// 局域网自发现（mDNS / DNS-SD）。
//
// 设计：teacher-cross-platform-relay.md §5.2。固定机在「中继模式开启」时发布
// `_lumesync-relay._tcp.local`，TXT 只含教室名、设备 ID、协议主版本、端口与空闲/占用；
// 关闭或错误状态不发布；验证码、凭证、学生数据绝不出现在发现报文里。
//
// 传输层是注入式的 `{publish, unpublish, browse, destroy}`：
// 测试用假传输，生产用 bonjour-service（src/discovery-bonjour.js）。
// 组播不可用时只记录明确错误并继续服务——手动输入地址是有文档的降级入口。

const {
    DNS_SD_SERVICE_TYPE,
    DISCOVERY_FORBIDDEN_FIELDS,
    DISCOVERY_TXT_FIELDS,
    PROTOCOL_VERSION,
    parseProtocolVersion
} = require('@lumesync/classroom-protocol');

/** `_lumesync-relay._tcp.local` → { type: 'lumesync-relay', protocol: 'tcp' } */
function parseServiceType(serviceType) {
    const match = /^_([^._]+)\._([^._]+)\./.exec(String(serviceType || ''));
    if (!match) {
        return { type: 'lumesync-relay', protocol: 'tcp' };
    }
    return { type: match[1], protocol: match[2] };
}

/** TXT 里不允许出现凭证类字段，也不允许出现非字符串值（Bonjour TXT 只能是字符串）。 */
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

/** 两条 TXT 是否等价（键集合与取值都相同）。 */
function sameTxt(left, right) {
    const leftKeys = Object.keys(left || {}).sort();
    const rightKeys = Object.keys(right || {}).sort();
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every((key, index) => key === rightKeys[index] && String(left[key]) === String(right[key]));
}

/**
 * @param {object} input
 * @param {'direct'|'relay'} input.mode
 * @param {object|null} input.transport 发现传输；direct 模式或关闭发现时为 null
 * @param {() => object|null} input.txtProvider 返回契约的 discoveryTxt()，null 表示不发布
 * @param {object} [input.logger]
 * @param {string} [input.serviceType]
 */
function createDiscoveryPublisher({
    mode,
    transport = null,
    txtProvider,
    logger,
    serviceType = DNS_SD_SERVICE_TYPE
}) {
    const { type, protocol } = parseServiceType(serviceType);
    const status = {
        enabled: mode === 'relay' && !!transport,
        published: false,
        serviceType,
        type,
        protocol,
        lastError: '',
        lastPublishedAt: null,
        lastUnpublishedAt: null,
        publishCount: 0,
        unpublishCount: 0,
        txt: null,
        fields: { ...DISCOVERY_TXT_FIELDS }
    };
    let destroyed = false;

    function recordError(reason, error) {
        status.lastError = String(reason || (error && error.message) || 'discovery_error');
        status.published = false;
        if (logger) {
            // 只记录原因，不记录 TXT 内容之外的东西；TXT 本身按契约允许公开。
            logger.error(`[discovery] mDNS 发布失败（${status.lastError}）：请改用手动地址连接`);
        }
    }

    async function unpublish(reason = '') {
        if (!transport || !status.published) {
            status.published = false;
            return { ok: true, published: false };
        }
        try {
            await transport.unpublish();
            status.published = false;
            status.unpublishCount += 1;
            status.lastUnpublishedAt = new Date().toISOString();
            if (logger) logger.info(`[discovery] 已停止发布 ${serviceType}${reason ? ` (${reason})` : ''}`);
            return { ok: true, published: false };
        } catch (error) {
            recordError(`unpublish_failed:${error.message}`, error);
            return { ok: false, code: 'discovery_unpublish_failed' };
        }
    }

    /** 按契约状态刷新发布：不可发现状态（disabled/error）必须取消发布。 */
    async function doRefresh() {
        if (destroyed) return { ok: false, code: 'discovery_destroyed' };
        if (mode !== 'relay' || !transport || !status.enabled) {
            return { ok: true, published: false, reason: 'discovery_disabled' };
        }

        let txt = null;
        try {
            txt = txtProvider ? txtProvider() : null;
        } catch (error) {
            recordError(`txt_failed:${error.message}`, error);
            await unpublish('txt-failed');
            return { ok: false, code: 'discovery_txt_failed' };
        }

        if (!txt) {
            await unpublish('state-not-discoverable');
            return { ok: true, published: false, reason: 'state_not_discoverable' };
        }

        const inspected = inspectTxt(txt);
        if (!inspected.ok) {
            // 防御性检查：契约的 discoveryTxt 目前不会带这些字段，一旦回归必须拒绝发布。
            recordError(inspected.reason);
            await unpublish('unsafe-txt');
            return { ok: false, code: 'discovery_txt_unsafe' };
        }

        // 内容未变时不重复发布（状态机每次迁移都会调用 refresh）。
        if (status.published && status.txt && sameTxt(status.txt, txt)) {
            return { ok: true, published: true, unchanged: true };
        }

        const descriptor = {
            serviceType,
            type,
            protocol,
            name: String(txt.name),
            port: Number(txt.port),
            txt: { ...txt }
        };

        try {
            await transport.publish(descriptor);
            status.published = true;
            status.publishCount += 1;
            status.lastPublishedAt = new Date().toISOString();
            status.lastError = '';
            status.txt = { ...txt };
            if (logger) {
                logger.info(`[discovery] 发布 ${serviceType} 教室=${txt.name} id=${txt.id} 状态=${txt.label}`);
            }
            return { ok: true, published: true, record: descriptor };
        } catch (error) {
            recordError(`publish_failed:${error.message}`, error);
            return { ok: false, code: 'discovery_publish_failed' };
        }
    }

    async function destroy() {
        if (destroyed) return;
        destroyed = true;
        await unpublish('destroy');
        status.enabled = false;
        if (transport && typeof transport.destroy === 'function') {
            try {
                await transport.destroy();
            } catch (error) {
                if (logger) logger.warn(`[discovery] 关闭发现传输失败：${error.message}`);
            }
        }
    }

    function getStatus() {
        return {
            enabled: status.enabled && !destroyed,
            published: status.published,
            serviceType: status.serviceType,
            type: status.type,
            protocol: status.protocol,
            lastError: status.lastError,
            lastPublishedAt: status.lastPublishedAt,
            lastUnpublishedAt: status.lastUnpublishedAt,
            publishCount: status.publishCount,
            unpublishCount: status.unpublishCount,
            txt: status.txt,
            txtFields: { ...DISCOVERY_TXT_FIELDS }
        };
    }

    // 串行化刷新：状态迁移与启动刷新可能并发触发，串起来才能让"内容未变不重复发布"生效。
    let pendingRefresh = Promise.resolve();
    function refresh() {
        pendingRefresh = pendingRefresh.then(doRefresh, doRefresh);
        return pendingRefresh;
    }

    return { refresh, unpublish, destroy, status: getStatus, serviceType, parseServiceType };
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
 * 合并同一教室在多个网络接口上的重复结果。
 * 纯函数，便于直接测试；输入来自发现传输，输出只作设备列表，
 * **不能作为身份或授权依据**（授权只由固定机屏幕上的验证码完成）。
 */
function mergeRelayRecords(records, { protocolVersion = PROTOCOL_VERSION } = {}) {
    const merged = new Map();
    for (const record of Array.isArray(records) ? records : []) {
        if (!record) continue;
        const txt = record.txt && typeof record.txt === 'object' ? record.txt : {};
        const parsed = parseProtocolVersion(txt.proto);
        if (!parsed.present || Number.isNaN(parsed.version)) continue;
        // 只保留与本地协议主版本一致的设备，避免把不兼容教室展示成可连接。
        if (parsed.version !== Number(protocolVersion)) continue;

        const classroomId = String(txt.id || record.name || '').trim();
        if (!classroomId) continue;

        const addresses = []
            .concat(Array.isArray(record.addresses) ? record.addresses : [])
            .map(normalizeAddress)
            .filter(Boolean);

        const entry = merged.get(classroomId) || {
            classroomId,
            name: String(txt.name || record.name || classroomId),
            label: String(txt.label || ''),
            state: txt.state === 'busy' ? 'busy' : 'free',
            protocolVersion: parsed.version,
            port: Number(txt.port || record.port || 0),
            addresses: [],
            hosts: [],
            records: 0
        };
        if (!entry.port && record.port) entry.port = Number(record.port);
        if (txt.name) entry.name = String(txt.name);
        if (txt.label) entry.label = String(txt.label);
        entry.records += 1;
        for (const address of addresses) {
            if (!entry.addresses.includes(address)) entry.addresses.push(address);
        }
        if (record.host && !entry.hosts.includes(String(record.host))) entry.hosts.push(String(record.host));
        merged.set(classroomId, entry);
    }

    return Array.from(merged.values())
        .map((entry) => {
            const addresses = entry.addresses.slice().sort((a, b) => (isIpv4(b) ? 1 : 0) - (isIpv4(a) ? 1 : 0));
            return { ...entry, addresses, address: addresses[0] || entry.hosts[0] || '' };
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

/**
 * 教师端（未来的 session-agent）用的搜索助手：按协议主版本过滤并合并重复接口结果。
 * @returns {Promise<Array<object>>}
 */
async function browseClassroomRelays({ transport, protocolVersion = PROTOCOL_VERSION, timeoutMs = 3000, logger } = {}) {
    if (!transport || typeof transport.browse !== 'function') {
        return [];
    }
    const { type, protocol } = parseServiceType(DNS_SD_SERVICE_TYPE);
    let records = [];
    try {
        records = await transport.browse({ serviceType: DNS_SD_SERVICE_TYPE, type, protocol, timeoutMs });
    } catch (error) {
        if (logger) logger.error(`[discovery] mDNS 搜索失败（${error.message}）：请手动输入固定机地址`);
        return [];
    }
    return mergeRelayRecords(records, { protocolVersion });
}

/** 绑定好传输与协议版本的搜索器，供 session-agent 复用。 */
function createRelayBrowser({ transport, protocolVersion = PROTOCOL_VERSION, logger, defaultTimeoutMs = 3000 } = {}) {
    return {
        browse: (options = {}) => browseClassroomRelays({
            transport,
            protocolVersion,
            logger,
            timeoutMs: options.timeoutMs === undefined ? defaultTimeoutMs : options.timeoutMs
        }),
        protocolVersion
    };
}

module.exports = {
    DNS_SD_SERVICE_TYPE,
    parseServiceType,
    inspectTxt,
    createDiscoveryPublisher,
    mergeRelayRecords,
    browseClassroomRelays,
    createRelayBrowser
};
