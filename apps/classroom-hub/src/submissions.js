// 提交转发：Hub 先入队，教师电脑确认落盘后才给最终成功。
//
// 设计约束（teacher-cross-platform-relay.md §4 提交可靠性约束）：
//   - 「中继已接收」与学生看到的「最终成功」必须区分；
//   - 队列满时明确拒绝（queue_full），不静默丢弃；
//   - 只有收到教师电脑的 submission:delivered 之后，才释放副本并回最终成功。
//
// 归属信息（哪个 clientId 提交的）不放进契约队列条目里：契约只负责可靠性，
// Hub 负责把这条件对条件地投递给正确的学生连接。

const { ERROR_CODES } = require('@lumesync/classroom-protocol');

const MAX_TRACKED_OWNERS = 1000;

function createSubmissionForwarder({ queue, now = () => Date.now(), logger }) {
    /** submissionId -> {clientId, clientIp, submittedAt} */
    const owners = new Map();

    function rememberOwner(submissionId, owner) {
        owners.set(String(submissionId), { ...owner, submittedAt: now() });
        while (owners.size > MAX_TRACKED_OWNERS) {
            owners.delete(owners.keys().next().value);
        }
    }

    /**
     * @returns {{ok: boolean, code: string|null, message?: string, duplicate?: boolean, item?: object, owner?: object}}
     */
    function enqueue({ submission, clientId, clientIp }) {
        const result = queue.enqueue(submission);
        if (!result.ok) {
            return { ok: false, code: result.code, message: result.message, capacity: result.capacity, size: result.size };
        }
        const submissionId = String(result.item.submissionId);
        rememberOwner(submissionId, { clientId: String(clientId || ''), clientIp: String(clientIp || '') });
        // 重复投递（客户端重试）不再占用容量，但仍要重新转发一次：教师电脑可能当时不在线，
        // 而 Hub 的队列是权威副本；教师侧以 submissionId 去重。
        return {
            ok: true,
            code: null,
            duplicate: !!result.duplicate,
            item: result.item,
            owner: { ...owners.get(submissionId) }
        };
    }

    /** 教师电脑确认已落盘；只有这一步之后才给学生最终成功。 */
    function markDelivered(submissionId, options = {}) {
        const result = queue.markDelivered(submissionId, { deliveredAt: options.deliveredAt || now() });
        if (!result.ok) {
            return { ok: false, code: result.code, message: result.message };
        }
        const owner = owners.get(String(result.item.submissionId)) || null;
        owners.delete(String(result.item.submissionId));
        return { ok: true, code: null, item: result.item, owner };
    }

    function ownerOf(submissionId) {
        const owner = owners.get(String(submissionId || ''));
        return owner ? { ...owner } : null;
    }

    function stats() {
        return { ...queue.stats(), trackedOwners: owners.size };
    }

    function clear() {
        const removed = owners.size;
        owners.clear();
        return removed;
    }

    return { enqueue, markDelivered, ownerOf, stats, clear, UNKNOWN_ITEM: ERROR_CODES.QUEUE_ITEM_UNKNOWN };
}

module.exports = { createSubmissionForwarder, MAX_TRACKED_OWNERS };
