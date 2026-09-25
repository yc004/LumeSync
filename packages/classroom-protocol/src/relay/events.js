// 中继模式的事件表（Hub 专用）。
//
// 设计文档 §6「中继模式协议建议增加」列出的消息在这里固化成 schema。
// 这些事件只在教室固定机的 Hub 上有效：直接模式的教师服务用
// createInboundGuard({ scopes: ['classroom'] }) 挂守卫，遇到中继事件会按
// event_unknown 拒绝，避免"声明了但没有处理器"的静默路径。

const { ROLE_HOST, ROLE_VIEWER } = require('../roles');

const requestIdField = { type: 'string', minLength: 1, maxLength: 128 };
const epochField = { type: 'integer', min: 1, coerce: true };
const courseHashField = { type: 'string', minLength: 8, maxLength: 128 };
const classroomCommandTypes = ['course:select', 'slide:set', 'settings:update', 'annotation:clear', 'course:end'];

/** Hub 入站：教师电脑（host）与管理员操作。 */
const RELAY_INBOUND_EVENTS = {
    'teacher:pair.request': {
        roles: [ROLE_HOST],
        scope: 'relay',
        status: 'planned',
        since: 1,
        payload: {
            type: 'object',
            required: ['requestId', 'deviceKey'],
            fields: {
                requestId: requestIdField,
                deviceKey: { type: 'string', minLength: 8, maxLength: 256 },
                deviceName: { type: 'string', maxLength: 128 }
            }
        },
        note: '固定机据此生成并显示验证码；验证码不在响应里回传'
    },
    'teacher:pair.verify': {
        roles: [ROLE_HOST],
        scope: 'relay',
        status: 'planned',
        since: 1,
        payload: {
            type: 'object',
            required: ['requestId', 'nonce', 'proof'],
            fields: {
                requestId: requestIdField,
                nonce: { type: 'string', minLength: 8, maxLength: 128 },
                proof: { type: 'string', minLength: 32, maxLength: 256 }
            }
        },
        note: '用输入验证码算出的握手证明；必须在 TLS 之上，8 位验证码不可离线暴露'
    },
    'teacher:lease.acquire': {
        roles: [ROLE_HOST],
        scope: 'relay',
        status: 'planned',
        since: 1,
        payload: { type: 'object', fields: { requestId: requestIdField } },
        note: '仅在教室空闲时授予；同一教室同一时刻只有一个授课租约'
    },
    'teacher:lease.renew': {
        roles: [ROLE_HOST],
        scope: 'relay',
        status: 'planned',
        since: 1,
        payload: {
            type: 'object',
            required: ['leaseId', 'epoch'],
            fields: { leaseId: { type: 'string', minLength: 8, maxLength: 128 }, epoch: epochField }
        }
    },
    'teacher:lease.release': {
        roles: [ROLE_HOST],
        scope: 'relay',
        status: 'planned',
        since: 1,
        payload: {
            type: 'object',
            required: ['leaseId', 'epoch'],
            fields: { leaseId: { type: 'string', minLength: 8, maxLength: 128 }, epoch: epochField }
        },
        note: '教师主动结束授课；随后 Hub 回到等待教师'
    },
    'course:stage': {
        roles: [ROLE_HOST],
        scope: 'relay',
        status: 'planned',
        since: 1,
        payload: {
            type: 'object',
            required: ['courseId', 'courseHash'],
            fields: {
                courseId: { type: 'string', minLength: 1, maxLength: 512 },
                courseHash: courseHashField,
                sizeBytes: { type: 'integer', min: 0, coerce: true },
                requestId: requestIdField
            }
        },
        note: 'HTTPS 上传完成且校验 hash 后才 stage 成功'
    },
    'course:publish': {
        roles: [ROLE_HOST],
        scope: 'relay',
        status: 'planned',
        since: 1,
        payload: {
            type: 'object',
            required: ['courseId', 'courseHash', 'requestId', 'epoch'],
            fields: {
                courseId: { type: 'string', minLength: 1, maxLength: 512 },
                courseHash: courseHashField,
                requestId: requestIdField,
                epoch: epochField
            }
        },
        note: '切换课堂课程；旧版本在新版本就绪前继续播放'
    },
    'classroom:command': {
        roles: [ROLE_HOST],
        scope: 'relay',
        status: 'planned',
        since: 1,
        payload: {
            type: 'object',
            required: ['type', 'leaseId', 'epoch', 'requestId'],
            fields: {
                type: { type: 'string', enum: classroomCommandTypes },
                leaseId: { type: 'string', minLength: 8, maxLength: 128 },
                epoch: epochField,
                requestId: requestIdField,
                payload: { type: 'object' }
            }
        },
        note: '教师侧类型化命令；Hub 校验租约后再广播给学生'
    },
    'submission:delivered': {
        roles: [ROLE_HOST],
        scope: 'relay',
        status: 'planned',
        since: 1,
        payload: {
            type: 'object',
            required: ['submissionId'],
            fields: {
                submissionId: { type: 'string', minLength: 1, maxLength: 128 },
                deliveredAt: { type: 'string', maxLength: 40 }
            }
        },
        note: '教师电脑确认提交已落盘，Hub 才释放队列副本并回最终成功'
    }
};

/** Hub 出站：给教师电脑的回执与推送。 */
const RELAY_OUTBOUND_EVENTS = {
    'teacher:pair.challenge': { audience: 'socket', since: 1, note: '返回请求编号、时限与配对握手参数，不含验证码' },
    'teacher:pair.accepted': { audience: 'socket', since: 1, note: '签发绑定设备身份的短期会话凭证' },
    'teacher:pair.rejected': { audience: 'socket', since: 1, note: '未通过、过期、次数用尽或被占用' },
    'teacher:lease.granted': { audience: 'socket', since: 1, note: '授予唯一授课租约，附 epoch 与到期时间' },
    'teacher:lease.revoked': { audience: 'socket+broadcast', since: 1, note: '教师释放或管理员撤销；旧 epoch 立即失效' },
    'course:stage:ack': { audience: 'socket', since: 1 },
    'course:published': { audience: 'socket+broadcast', since: 1, envelope: ['revision'] },
    'submission:forwarded': { audience: 'hosts', since: 1, note: 'Hub 把学生提交定向转发给当前教师' },
    'student:event': { audience: 'hosts', since: 1, note: '学生互动/监看/日志的定向转发' },
    'relay:status': { audience: 'broadcast', since: 1, note: '固定机状态变化（空闲/正在连接/授课中/错误）' }
};

const RELAY_EVENT_NAMES = new Set([
    ...Object.keys(RELAY_INBOUND_EVENTS),
    ...Object.keys(RELAY_OUTBOUND_EVENTS)
]);

/** mDNS/DNS-SD 发现载荷（TXT）的字段说明，Hub 与教师端共用。 */
const DISCOVERY_TXT_FIELDS = {
    name: '教室显示名',
    id: '稳定教室/设备 ID',
    proto: '协议主版本',
    port: '课堂网关端口',
    state: 'free | busy',
    label: '界面文案：空闲 / 正在连接 / 授课中'
};

const DISCOVERY_FORBIDDEN_FIELDS = ['code', 'token', 'sessionId', 'student', 'submission', 'leaseId'];

module.exports = {
    RELAY_INBOUND_EVENTS,
    RELAY_OUTBOUND_EVENTS,
    RELAY_EVENT_NAMES,
    CLASSROOM_COMMAND_TYPES: classroomCommandTypes,
    DISCOVERY_TXT_FIELDS,
    DISCOVERY_FORBIDDEN_FIELDS
};
