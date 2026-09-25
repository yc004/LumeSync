// 本机教室登记表（classroomsDir）。
//
// 设计：teacher-cross-platform-relay.md §5.1「自动搜索失败时可手动输入固定机地址」
// 与 §7「教师设备记忆教室身份」。校园网常隔离组播，教师电脑需要记住上次连过的教室，
// 才能在搜索不到时按名称/地址直接输入。登记表只保存**公开发现信息**
// （教室 ID、名称、地址、端口、协议版本、状态、最近可见时间），不保存验证码、
// 设备凭证或租约——凭证只存在于内存（见 docs/reference/session-agent.md）。

const fsp = require('node:fs/promises');
const path = require('node:path');

const REGISTRY_FILE = 'classrooms.json';
const REGISTRY_VERSION = 1;
const MAX_ENTRIES = 100;

function normalizeEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const classroomId = String(entry.classroomId || '').trim();
    const addresses = (Array.isArray(entry.addresses) ? entry.addresses : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean);
    // 发现层的合并结果带 address；原始记录只有 addresses，这里两种形状都接受
    const address = String(entry.address || addresses[0] || '').trim();
    const port = Number(entry.port);
    if (!classroomId || !address || !Number.isInteger(port) || port <= 0) return null;
    return {
        classroomId,
        name: String(entry.name || classroomId),
        label: String(entry.label || ''),
        state: entry.state === 'busy' ? 'busy' : 'free',
        address,
        addresses: addresses.length > 0 ? Array.from(new Set([address, ...addresses])) : [address],
        port,
        protocolVersion: Number.isInteger(entry.protocolVersion) ? entry.protocolVersion : null,
        lastSeenAt: entry.lastSeenAt ? String(entry.lastSeenAt) : null
    };
}

/**
 * @param {object} input
 * @param {string} input.dir 保存目录；未提供时不创建登记表（纯内存模式）
 * @param {object} [input.logger]
 * @param {() => number} [input.now]
 */
function createClassroomRegistry({ dir = null, logger = null, now = () => Date.now() } = {}) {
    const filePath = dir ? path.join(path.resolve(dir), REGISTRY_FILE) : null;
    /** classroomId -> entry（最近一次合并结果） */
    let entries = new Map();
    let loaded = false;

    async function load() {
        if (loaded || !filePath) return entries;
        loaded = true;
        try {
            const text = await fsp.readFile(filePath, 'utf8');
            const parsed = JSON.parse(text);
            const list = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.classrooms) ? parsed.classrooms : []);
            entries = new Map();
            for (const raw of list) {
                const entry = normalizeEntry(raw);
                if (entry) entries.set(entry.classroomId, entry);
            }
        } catch (error) {
            if (error && error.code !== 'ENOENT' && logger) {
                // 登记表损坏不能影响搜索：只记一条明确错误，按空表继续。
                logger.warn(`[session-agent] 教室登记表读取失败（${error.code || error.message}）：${filePath}`);
            }
            entries = new Map();
        }
        return entries;
    }

    async function save() {
        if (!filePath) return { ok: false, reason: 'registry_disabled' };
        const classrooms = Array.from(entries.values()).slice(0, MAX_ENTRIES);
        const payload = JSON.stringify({ version: REGISTRY_VERSION, updatedAt: new Date(now()).toISOString(), classrooms }, null, 2);
        const tempPath = `${filePath}.tmp-${process.pid}-${now()}`;
        try {
            await fsp.mkdir(path.dirname(filePath), { recursive: true });
            await fsp.writeFile(tempPath, payload, 'utf8');
            await fsp.rename(tempPath, filePath);
            return { ok: true, filePath, count: classrooms.length };
        } catch (error) {
            await fsp.rm(tempPath, { force: true }).catch(() => {});
            if (logger) logger.warn(`[session-agent] 教室登记表写入失败：${error && error.message ? error.message : error}`);
            return { ok: false, reason: 'registry_write_failed' };
        }
    }

    /**
     * 合并实时搜索结果与登记表：
     *   - 实时记录 online=true 并刷新 lastSeenAt；
     *   - 登记表里有、这次没搜到的记录以 online=false 保留（供手动连接）；
     *   - 返回 online 在前、名称排序的列表。
     */
    async function merge(liveRecords) {
        await load();
        const live = Array.isArray(liveRecords) ? liveRecords : [];
        const merged = new Map();
        const onlineIds = new Set();
        const timestamp = new Date(now()).toISOString();
        for (const record of live) {
            // 既接受发现层的合并结果（带 classroomId/address），也接受原始 TXT 记录
            const candidate = record && record.classroomId
                ? record
                : {
                    classroomId: record && record.txt ? String(record.txt.id || '').trim() : '',
                    name: record && record.txt ? record.txt.name : (record ? record.name : ''),
                    label: record && record.txt ? record.txt.label : '',
                    state: record && record.txt && record.txt.state === 'busy' ? 'busy' : 'free',
                    port: record && record.txt ? Number(record.txt.port || record.port) : (record ? Number(record.port) : NaN),
                    addresses: record && Array.isArray(record.addresses) ? record.addresses : []
                };
            const entry = normalizeEntry({ ...candidate, lastSeenAt: timestamp });
            if (!entry) continue;
            merged.set(entry.classroomId, entry);
            onlineIds.add(entry.classroomId);
        }
        for (const [classroomId, entry] of entries) {
            if (merged.has(classroomId)) continue;
            merged.set(classroomId, { ...entry });
        }
        entries = merged;
        await save();
        return Array.from(merged.values())
            .map((entry) => ({ ...entry, online: onlineIds.has(entry.classroomId) }))
            .sort((a, b) => {
                if (a.online !== b.online) return a.online ? -1 : 1;
                return a.name.localeCompare(b.name, 'zh-CN');
            });
    }

    /** 只读：登记表内容（不触发合并/写入）。 */
    async function list() {
        await load();
        return Array.from(entries.values()).map((entry) => ({ ...entry, online: false }));
    }

    async function clear() {
        entries = new Map();
        if (filePath) await fsp.rm(filePath, { force: true }).catch(() => {});
        return { ok: true };
    }

    return { filePath, load, save, merge, list, clear, size: () => entries.size };
}

module.exports = { createClassroomRegistry, REGISTRY_FILE, REGISTRY_VERSION, MAX_ENTRIES, normalizeEntry };
