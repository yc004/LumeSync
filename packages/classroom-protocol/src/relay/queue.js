// 中继模式的两类缓冲：提交转发队列与课件暂存缓存。
//
// 设计约束（teacher-cross-platform-relay.md §4 提交可靠性约束、§6 课程资源发布快照）：
//   - 学生提交要区分「中继已接收」与「教师电脑已保存」：只有收到教师电脑的
//     submission:delivered 回执，Hub 才释放队列副本并给出最终成功状态；
//   - 队列有容量与过期时间，达到容量时必须明确拒绝新提交，不能静默丢弃；
//   - 课件按内容 hash 暂存，发布完成后旧版本才被替换；Hub 不修改课件内容；
//   - 缓存与队列都要能按保留策略清理（教师离开前显示待同步数量）。

const { ERROR_CODES } = require('../errors');

const SUBMISSION_QUEUE_CAPACITY = 200;
const SUBMISSION_QUEUE_TTL_MS = 24 * 60 * 60 * 1000;
const COURSE_STAGE_MAX_BYTES = 512 * 1024 * 1024;
const COURSE_STAGE_MAX_VERSIONS = 20;
const COURSE_STAGE_TTL_MS = 24 * 60 * 60 * 1000;

function estimateBytes(value) {
    if (value === undefined || value === null) return 0;
    if (typeof value === 'string') return value.length;
    try {
        return JSON.stringify(value).length;
    } catch (_) {
        return 0;
    }
}

/**
 * 提交转发队列。
 * 状态：pending（Hub 已接收，等待教师电脑确认）→ delivered（教师电脑已落盘，副本可释放）。
 */
function createSubmissionQueue({ capacity = SUBMISSION_QUEUE_CAPACITY, ttlMs = SUBMISSION_QUEUE_TTL_MS, now = () => Date.now() } = {}) {
    /** submissionId -> item */
    const items = new Map();

    function purgeExpired() {
        const timestamp = now();
        const removed = [];
        for (const [id, item] of items) {
            if (timestamp - item.receivedAt >= ttlMs) {
                items.delete(id);
                removed.push({ ...item, reason: 'expired' });
            }
        }
        return removed;
    }

    /** 入队；容量已满时明确拒绝（返回 QUEUE_FULL），不静默丢弃。 */
    function enqueue(submission) {
        if (!submission || !submission.submissionId) {
            return { ok: false, code: ERROR_CODES.REQUEST_INVALID, message: '提交必须带 submissionId' };
        }
        const submissionId = String(submission.submissionId);
        if (items.has(submissionId)) {
            // 幂等：同一 submissionId 重复投递（客户端重试）不占新容量
            return { ok: true, code: null, duplicate: true, item: { ...items.get(submissionId) } };
        }
        purgeExpired();
        if (items.size >= capacity) {
            return {
                ok: false,
                code: ERROR_CODES.QUEUE_FULL,
                message: '中继待转发队列已满，请等待教师电脑收取后再提交',
                capacity,
                size: items.size
            };
        }
        const item = {
            submissionId,
            courseId: submission.courseId ? String(submission.courseId) : '',
            clientIp: submission.clientIp ? String(submission.clientIp) : '',
            fileName: submission.fileName ? String(submission.fileName) : '',
            mergeFile: !!submission.mergeFile,
            content: submission.content === undefined ? null : submission.content,
            sizeBytes: Number.isFinite(submission.sizeBytes) ? Number(submission.sizeBytes) : estimateBytes(submission.content),
            receivedAt: now(),
            status: 'pending',
            deliveredAt: null
        };
        items.set(submissionId, item);
        return { ok: true, code: null, duplicate: false, item: { ...item } };
    }

    /** 教师电脑确认已落盘：只有这一步之后，学生端才应看到最终成功。 */
    function markDelivered(submissionId, { deliveredAt = now() } = {}) {
        const item = items.get(String(submissionId || ''));
        if (!item) {
            return { ok: false, code: ERROR_CODES.QUEUE_ITEM_UNKNOWN, message: '队列中没有该提交' };
        }
        item.status = 'delivered';
        item.deliveredAt = deliveredAt;
        items.delete(item.submissionId);
        return { ok: true, code: null, item: { ...item } };
    }

    function list({ courseId, status } = {}) {
        purgeExpired();
        return Array.from(items.values())
            .filter((item) => (courseId ? item.courseId === String(courseId) : true))
            .filter((item) => (status ? item.status === status : true))
            .map((item) => ({ ...item }));
    }

    function stats() {
        purgeExpired();
        const pending = Array.from(items.values()).filter((item) => item.status === 'pending');
        return {
            size: items.size,
            capacity,
            pendingCount: pending.length,
            pendingBytes: pending.reduce((total, item) => total + (item.sizeBytes || 0), 0),
            ttlMs
        };
    }

    return { enqueue, markDelivered, list, stats, purgeExpired, get: (id) => (items.has(String(id)) ? { ...items.get(String(id)) } : null) };
}

/**
 * 课件暂存缓存。
 * 教师电脑上传校验过的 .lume 后按 courseHash 暂存；course:publish 只切换"当前版本"，
 * 旧版本在新版本就绪前继续可播放。
 */
function createCourseStage({
    maxBytes = COURSE_STAGE_MAX_BYTES,
    maxVersions = COURSE_STAGE_MAX_VERSIONS,
    ttlMs = COURSE_STAGE_TTL_MS,
    now = () => Date.now()
} = {}) {
    /** courseHash -> {courseId, sizeBytes, storedAt, manifest} */
    const versions = new Map();
    /** courseId -> courseHash */
    const current = new Map();

    function totalBytes() {
        let total = 0;
        for (const version of versions.values()) total += version.sizeBytes || 0;
        return total;
    }

    function purgeExpired() {
        const timestamp = now();
        const removed = [];
        for (const [hash, version] of versions) {
            if (timestamp - version.storedAt < ttlMs) continue;
            // 正在播放的版本不因过期被清掉：必须先发布新版本
            if (current.get(version.courseId) === hash) continue;
            versions.delete(hash);
            removed.push({ ...version, courseHash: hash, reason: 'expired' });
        }
        return removed;
    }

    /** 暂存一个已校验的课件版本。 */
    function stage({ courseId, courseHash, sizeBytes = 0, manifest = null }) {
        if (!courseId || !courseHash) {
            return { ok: false, code: ERROR_CODES.REQUEST_INVALID, message: 'stage 需要 courseId 与 courseHash' };
        }
        const hash = String(courseHash);
        if (versions.has(hash)) {
            return { ok: true, code: null, duplicate: true, version: { ...versions.get(hash) } };
        }
        purgeExpired();
        if (versions.size >= maxVersions) {
            return { ok: false, code: ERROR_CODES.STAGE_CAPACITY_EXCEEDED, message: '暂存版本数已达上限，请先清理', maxVersions };
        }
        if (totalBytes() + Number(sizeBytes || 0) > maxBytes) {
            return { ok: false, code: ERROR_CODES.STAGE_CAPACITY_EXCEEDED, message: '暂存空间不足', maxBytes };
        }
        const version = {
            courseId: String(courseId),
            courseHash: hash,
            sizeBytes: Number(sizeBytes) || 0,
            manifest: manifest || null,
            storedAt: now()
        };
        versions.set(hash, version);
        return { ok: true, code: null, duplicate: false, version: { ...version } };
    }

    function has(courseHash) {
        return versions.has(String(courseHash || ''));
    }

    /** 发布：只切换当前版本，不删除旧版本（旧版本继续播放到学生切走）。 */
    function publish({ courseId, courseHash }) {
        const hash = String(courseHash || '');
        const version = versions.get(hash);
        if (!version) {
            return { ok: false, code: ERROR_CODES.COURSE_HASH_UNKNOWN, message: '该 courseHash 尚未 stage，拒绝发布' };
        }
        if (version.courseId !== String(courseId || '')) {
            return { ok: false, code: ERROR_CODES.COURSE_HASH_MISMATCH, message: 'courseHash 与 courseId 不匹配' };
        }
        const previous = current.get(version.courseId) || null;
        current.set(version.courseId, hash);
        return { ok: true, code: null, courseId: version.courseId, courseHash: hash, previousCourseHash: previous };
    }

    function currentVersion(courseId) {
        const hash = current.get(String(courseId || ''));
        if (!hash) return null;
        const version = versions.get(hash);
        return version ? { ...version } : null;
    }

    /** 只释放未被发布使用的版本（例如上传完成但发布失败/被替换）。 */
    function release(courseHash) {
        const hash = String(courseHash || '');
        const version = versions.get(hash);
        if (!version) return { ok: false, code: ERROR_CODES.COURSE_HASH_UNKNOWN, message: '没有该暂存版本' };
        if (current.get(version.courseId) === hash) {
            return { ok: false, code: ERROR_CODES.COURSE_HASH_MISMATCH, message: '该版本正在课堂使用，需先发布新版本' };
        }
        versions.delete(hash);
        return { ok: true, code: null, version: { ...version } };
    }

    /** 教师离开前清理：保留当前版本，返回释放的版本列表。 */
    function clear({ keepCurrent = true } = {}) {
        const released = [];
        for (const [hash, version] of Array.from(versions.entries())) {
            if (keepCurrent && current.get(version.courseId) === hash) continue;
            versions.delete(hash);
            released.push({ ...version, courseHash: hash });
        }
        return released;
    }

    function stats() {
        purgeExpired();
        return {
            versions: versions.size,
            maxVersions,
            bytes: totalBytes(),
            maxBytes,
            published: current.size,
            ttlMs
        };
    }

    return { stage, publish, has, currentVersion, release, clear, purgeExpired, stats, list: () => Array.from(versions.values()).map((v) => ({ ...v })) };
}

module.exports = {
    SUBMISSION_QUEUE_CAPACITY,
    SUBMISSION_QUEUE_TTL_MS,
    COURSE_STAGE_MAX_BYTES,
    COURSE_STAGE_MAX_VERSIONS,
    COURSE_STAGE_TTL_MS,
    createSubmissionQueue,
    createCourseStage,
    estimateBytes
};
