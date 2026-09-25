// 课堂事件的契约表。
//
// 这张表是 Socket 层的唯一事实来源：服务端用它做角色校验和 payload 校验，
// 客户端和文档从它生成类型与清单。表内容对应 2026-09-25 教师服务的实际行为
// （repos/teacher/server/src/socket.js），字段按当前处理器实际读取的键声明。
//
// status 取值：
//   current  当前协议的一部分
//   legacy   仅为兼容旧客户端保留，新代码不应新增使用
//   planned  目标架构中的命名，服务端尚未实现；这里只登记映射，不参与校验
//
// envelope 标记该事件在目标协议中需要携带的信封字段；当前服务端只保证
// revision，requestId 由支持回执的事件自行回填。

const { ROLE_HOST, ROLE_VIEWER } = require('./roles');

const anyObject = { type: 'object' };
const slideIndexField = { type: 'integer', min: 0, coerce: true, max: 100000 };
const courseIdField = { type: 'string', minLength: 1, maxLength: 512 };

const POWER_ACTIONS = ['power-on', 'shutdown', 'restart', 'force-shutdown', 'force-restart'];

const HOST_SETTINGS_FIELDS = {
    forceFullscreen: { type: 'boolean' },
    syncFollow: { type: 'boolean' },
    allowInteract: { type: 'boolean' },
    syncInteraction: { type: 'boolean' },
    podiumAtTop: { type: 'boolean' },
    renderScale: { type: 'number', min: 0, max: 4 },
    uiScale: { type: 'number', min: 0.5, max: 4 },
    alertJoin: { type: 'boolean' },
    alertLeave: { type: 'boolean' },
    alertFullscreenExit: { type: 'boolean' },
    alertTabHidden: { type: 'boolean' },
    monitorEnabled: { type: 'boolean' },
    monitorIntervalSec: { type: 'number', min: 0.5, max: 5 }
};

/**
 * 入站事件（客户端 -> 服务端）。
 * roles 是允许发送该事件的角色；服务端必须在处理前校验。
 */
const INBOUND_EVENTS = {
    'session:hello': {
        roles: ['any'],
        status: 'current',
        since: 1,
        payload: {
            type: 'object',
            fields: {
                protocolVersion: { type: 'integer', min: 0, coerce: true },
                clientId: { type: 'string', maxLength: 128 },
                role: { type: 'string', maxLength: 16 }
            }
        },
        note: '显式握手；不带该事件时按 legacy 连接处理'
    },
    'request-classroom-snapshot': {
        roles: ['any'],
        status: 'current',
        since: 1,
        payload: null,
        envelope: ['revision'],
        note: '重连后拉取权威快照，不能只依赖遗漏的广播'
    },
    'get-student-count': {
        roles: [ROLE_HOST],
        status: 'current',
        since: 0,
        payload: null
    },
    'select-course': {
        roles: [ROLE_HOST],
        status: 'current',
        since: 0,
        plannedName: 'course:select',
        payload: { type: 'object', required: ['courseId'], fields: { courseId: courseIdField } },
        envelope: ['requestId', 'revision']
    },
    'sync-slide': {
        roles: [ROLE_HOST],
        status: 'current',
        since: 0,
        plannedName: 'slide:set',
        payload: { type: 'object', required: ['slideIndex'], fields: { slideIndex: slideIndexField } },
        envelope: ['requestId', 'revision']
    },
    'update-settings': {
        roles: [ROLE_HOST],
        status: 'current',
        since: 0,
        payload: { type: 'object', fields: { ...HOST_SETTINGS_FIELDS } }
    },
    'host-settings': {
        roles: [ROLE_HOST],
        status: 'current',
        since: 0,
        payload: { type: 'object', fields: { ...HOST_SETTINGS_FIELDS } }
    },
    'refresh-courses': { roles: [ROLE_HOST], status: 'current', since: 0, payload: null },
    'end-course': {
        roles: [ROLE_HOST],
        status: 'current',
        since: 0,
        plannedName: 'course:end',
        payload: null,
        envelope: ['requestId', 'revision']
    },
    'register-dependencies': {
        roles: [ROLE_HOST],
        status: 'current',
        since: 0,
        payload: {
            type: 'array',
            maxItems: 200,
            items: {
                type: 'object',
                required: ['filename', 'publicSrc'],
                fields: {
                    filename: { type: 'string', minLength: 1, maxLength: 256 },
                    publicSrc: { type: 'string', minLength: 1, maxLength: 2048 }
                }
            }
        },
        note: 'URL 目标策略仍待补齐，写入前必须再次校验来源'
    },
    'set-admin-password': {
        roles: [ROLE_HOST],
        status: 'current',
        since: 0,
        payload: { type: 'object', required: ['hash'], fields: { hash: { type: 'string', minLength: 1, maxLength: 512 } } }
    },

    // 学生状态、监看与设备
    'student-alert': {
        roles: [ROLE_VIEWER],
        status: 'current',
        since: 0,
        payload: { type: 'object', required: ['type'], fields: { type: { type: 'string', minLength: 1, maxLength: 64 } } }
    },
    'student:screenshot': {
        roles: [ROLE_VIEWER],
        status: 'current',
        since: 0,
        payload: {
            type: 'object',
            required: ['dataUrl'],
            fields: {
                dataUrl: { type: 'string', minLength: 1, maxLength: 1400000 },
                width: { type: 'integer', min: 1, max: 4096, coerce: true },
                height: { type: 'integer', min: 1, max: 4096, coerce: true },
                capturedAt: { type: 'string', maxLength: 64 }
            }
        },
        note: '仅监看开启时接收；大小与频率限制由服务端执行'
    },
    'student:device-info': {
        roles: [ROLE_VIEWER],
        status: 'current',
        since: 0,
        payload: {
            type: 'object',
            fields: {
                mac: { type: 'string', maxLength: 32 },
                deviceName: { type: 'string', maxLength: 128 },
                clientId: { type: 'string', maxLength: 128 }
            }
        }
    },
    'student:power-control': {
        roles: [ROLE_HOST],
        status: 'current',
        since: 0,
        plannedName: 'device:power:request',
        payload: {
            type: 'object',
            required: ['action'],
            fields: {
                requestId: { type: 'string', maxLength: 128 },
                action: { type: 'string', enum: POWER_ACTIONS },
                targets: {
                    type: 'array',
                    maxItems: 200,
                    items: {
                        type: 'object',
                        fields: {
                            ip: { type: 'string', maxLength: 64 },
                            mac: { type: 'string', maxLength: 32 },
                            wakeMac: { type: 'string', maxLength: 32 }
                        }
                    }
                }
            }
        },
        envelope: ['requestId']
    },
    'student:power-control:client-ack': {
        roles: [ROLE_VIEWER],
        status: 'current',
        since: 0,
        payload: {
            type: 'object',
            required: ['action'],
            fields: {
                requestId: { type: 'string', maxLength: 128 },
                action: { type: 'string', maxLength: 32 },
                accepted: { type: 'boolean', coerce: true },
                error: { type: 'string', maxLength: 256 }
            }
        }
    },
    'student-action': {
        roles: [ROLE_VIEWER],
        status: 'current',
        since: 0,
        payload: {
            type: 'object',
            required: ['type'],
            fields: { type: { type: 'string', minLength: 1, maxLength: 64 }, slide: slideIndexField }
        }
    },

    // 状态同步与提交
    'request-sync-state': {
        roles: [ROLE_VIEWER],
        status: 'current',
        since: 0,
        payload: {
            type: 'object',
            fields: { courseId: { type: 'string', maxLength: 512 }, slideIndex: slideIndexField }
        }
    },
    'full-sync-state': {
        roles: [ROLE_HOST],
        status: 'current',
        since: 0,
        payload: {
            type: 'object',
            fields: {
                targetId: { type: 'string', maxLength: 128 },
                courseId: { type: 'string', maxLength: 512 },
                slideIndex: slideIndexField,
                state: { type: 'any' }
            }
        }
    },
    'interaction:sync': {
        roles: [ROLE_HOST],
        status: 'current',
        since: 0,
        payload: anyObject
    },
    'sync-var': {
        roles: [ROLE_HOST],
        status: 'current',
        since: 0,
        payload: { type: 'object', required: ['key'], fields: { key: { type: 'string', minLength: 1, maxLength: 256 } } }
    },
    'student:submit': {
        roles: [ROLE_VIEWER],
        status: 'current',
        since: 0,
        plannedName: 'submission:create',
        payload: {
            type: 'object',
            required: ['submissionId'],
            fields: {
                submissionId: { type: 'string', minLength: 1, maxLength: 128 },
                courseId: { type: 'string', maxLength: 512 },
                content: { type: 'any' },
                fileName: { type: 'string', maxLength: 256 },
                mergeFile: { type: 'boolean' }
            }
        },
        envelope: ['requestId']
    },
    'student:submit:ack': {
        roles: [ROLE_HOST],
        status: 'current',
        since: 0,
        payload: {
            type: 'object',
            required: ['submissionId'],
            fields: {
                submissionId: { type: 'string', minLength: 1, maxLength: 128 },
                success: { type: 'boolean' },
                error: { type: 'string', maxLength: 512 }
            }
        },
        note: '目标协议要求改为定向回执，当前实现仍广播给全部连接'
    },

    // 投票
    'vote:start': {
        roles: [ROLE_HOST],
        status: 'current',
        since: 0,
        payload: {
            type: 'object',
            required: ['voteId', 'question', 'options'],
            fields: {
                voteId: { type: 'string', minLength: 1, maxLength: 128 },
                question: { type: 'string', minLength: 1, maxLength: 1024 },
                options: {
                    type: 'array',
                    // 课件里的选项列表可能含空项，教师端 canStart 用的是未过滤列表，
                    // 因此这里只做下限 1 的保护，避免把过去能开的投票拦掉。
                    minItems: 1,
                    maxItems: 20,
                    items: {
                        type: 'object',
                        required: ['id', 'label'],
                        fields: {
                            id: { type: 'string', minLength: 1, maxLength: 64 },
                            label: { type: 'string', minLength: 1, maxLength: 256 }
                        }
                    }
                },
                durationSec: { type: 'integer', min: 10, max: 300, coerce: true },
                anonymous: { type: 'boolean' }
            }
        }
    },
    'vote:submit': {
        roles: [ROLE_VIEWER],
        status: 'current',
        since: 0,
        plannedName: 'vote:respond',
        payload: {
            type: 'object',
            required: ['voteId', 'optionId'],
            fields: {
                voteId: { type: 'string', minLength: 1, maxLength: 128 },
                optionId: { type: 'string', minLength: 1, maxLength: 64 },
                courseId: { type: 'string', maxLength: 512 },
                slideIndex: slideIndexField
            }
        }
    },
    'vote:end': {
        roles: [ROLE_HOST],
        status: 'current',
        since: 0,
        payload: {
            type: 'object',
            required: ['voteId'],
            fields: {
                voteId: { type: 'string', minLength: 1, maxLength: 128 },
                courseId: { type: 'string', maxLength: 512 },
                slideIndex: slideIndexField
            }
        }
    },

    // 标注
    'annotation-add': {
        roles: [ROLE_HOST],
        status: 'legacy',
        since: 0,
        plannedName: 'annotation:add',
        payload: {
            type: 'object',
            required: ['courseId', 'slideIndex'],
            fields: { courseId: courseIdField, slideIndex: slideIndexField, segment: { type: 'any' } }
        }
    },
    'annotation:segment': {
        roles: [ROLE_HOST],
        status: 'current',
        since: 0,
        payload: { type: 'object', required: ['courseId', 'slideIndex'], fields: { courseId: courseIdField, slideIndex: slideIndexField } }
    },
    'annotation:stroke': {
        roles: [ROLE_HOST],
        status: 'current',
        since: 0,
        payload: {
            type: 'object',
            required: ['courseId', 'slideIndex'],
            fields: {
                courseId: courseIdField,
                slideIndex: slideIndexField,
                tool: { type: 'string', maxLength: 32 },
                color: { type: 'string', maxLength: 32 },
                width: { type: 'number', min: 0, max: 200 },
                alpha: { type: 'number', min: 0, max: 1 },
                points: { type: 'array', maxItems: 5000, items: { type: 'any' } }
            }
        }
    },
    'annotation:clear': {
        roles: [ROLE_HOST],
        status: 'current',
        since: 0,
        payload: { type: 'object', required: ['courseId', 'slideIndex'], fields: { courseId: courseIdField, slideIndex: slideIndexField } }
    },
    'annotation:get': {
        roles: ['any'],
        status: 'current',
        since: 0,
        payload: { type: 'object', required: ['courseId', 'slideIndex'], fields: { courseId: courseIdField, slideIndex: slideIndexField } }
    },
    'annotation-load': {
        roles: ['any'],
        status: 'legacy',
        since: 0,
        payload: { type: 'object', required: ['courseId', 'slideIndex'], fields: { courseId: courseIdField, slideIndex: slideIndexField } }
    },
    'course-runtime-error': {
        roles: ['any'],
        status: 'legacy',
        since: 0,
        payload: {
            type: 'object',
            fields: {
                courseId: { type: 'string', maxLength: 512 },
                error: { type: 'string', maxLength: 2048 },
                stack: { type: 'string', maxLength: 8192 }
            }
        },
        note: '课件运行时错误边界会发（window.socket）；服务端当前没有处理器，登记在表内只是避免被当成未声明事件'
    }
};

/**
 * 出站事件（服务端 -> 客户端）。audience 说明当前实现的广播范围，
 * 供教师/学生页面生成类型，也标明需要收敛的范围。
 */
const OUTBOUND_EVENTS = {
    'session:accepted': { audience: 'socket', since: 1, note: '握手成功，附 protocolVersion/sessionId/revision/role' },
    'role-assigned': { audience: 'socket', since: 0, note: 'legacy 握手快照，新客户端应改用 session:accepted + classroom:snapshot' },
    'identity-rejected': { audience: 'socket', since: 0 },
    'protocol-rejected': { audience: 'socket', since: 1 },
    'classroom:snapshot': { audience: 'socket+broadcast', since: 1, envelope: ['revision', 'sessionId'] },
    'student-status': { audience: 'hosts', since: 0 },
    'student-log-entry': { audience: 'hosts', since: 0 },
    'student-alert': { audience: 'hosts', since: 0 },
    'student:screenshot': { audience: 'hosts', since: 0 },
    'student:screenshot:state': { audience: 'hosts', since: 0 },
    'student:screenshot:clear': { audience: 'hosts', since: 0 },
    'student:screenshot:reset': { audience: 'hosts', since: 0 },
    'student:device-info': { audience: 'hosts', since: 0 },
    'classroom-layout-updated': { audience: 'hosts', since: 0 },
    'course-changed': { audience: 'broadcast', since: 0, plannedName: 'course:selected', envelope: ['revision'] },
    'course-ended': { audience: 'broadcast', since: 0, plannedName: 'course:ended', envelope: ['revision'] },
    'course-catalog-updated': { audience: 'hosts', since: 0 },
    'course-dependency-cache-error': { audience: 'socket', since: 0 },
    'host-settings': { audience: 'broadcast', since: 0 },
    'sync-slide': { audience: 'viewers', since: 0, plannedName: 'slide:changed', envelope: ['revision'] },
    'sync-var': { audience: 'viewers', since: 0 },
    'interaction:sync': { audience: 'viewers', since: 0 },
    'full-sync-state': { audience: 'viewers|socket', since: 0 },
    'request-sync-state': { audience: 'hosts', since: 0 },
    'student:power-control': { audience: 'viewer-ip', since: 0, plannedName: 'device:power:result' },
    'student:power-control:ack': { audience: 'socket', since: 0 },
    'student:power-control:client-ack': { audience: 'hosts', since: 0 },
    'student:submit': { audience: 'hosts', since: 0 },
    'student:submit:result': { audience: 'broadcast', since: 0, note: '目标协议要求定向回执' },
    'vote:start': { audience: 'broadcast', since: 0 },
    'vote:end': { audience: 'broadcast', since: 0 },
    'vote:result': { audience: 'hosts|viewers', since: 0 },
    'vote:submit:ack': { audience: 'socket', since: 0 },
    'annotation-add': { audience: 'broadcast', since: 0, status: 'legacy' },
    'annotation:segment': { audience: 'viewers', since: 0 },
    'annotation:stroke': { audience: 'viewers', since: 0 },
    'annotation:clear': { audience: 'viewers', since: 0 },
    'annotation:state': { audience: 'socket', since: 0 },
    'annotation-loaded': { audience: 'socket', since: 0, status: 'legacy' },
    'set-admin-password': { audience: 'viewers', since: 0 }
};

/** 目标架构的命名映射（当前名 -> 计划名），用于未来双发过渡。 */
const PLANNED_EVENT_NAMES = Object.fromEntries(
    Object.entries(INBOUND_EVENTS)
        .filter(([, value]) => value.status !== 'planned' && value.plannedName)
        .map(([name, value]) => [name, value.plannedName])
);

function getInboundEvent(name) {
    return Object.prototype.hasOwnProperty.call(INBOUND_EVENTS, name) ? INBOUND_EVENTS[name] : null;
}

function getOutboundEvent(name) {
    return Object.prototype.hasOwnProperty.call(OUTBOUND_EVENTS, name) ? OUTBOUND_EVENTS[name] : null;
}

/** 判断角色是否可以发送某个入站事件。 */
function canSendEvent(role, name) {
    const entry = getInboundEvent(name);
    if (!entry) return false;
    return entry.roles.includes('any') ? (role === ROLE_HOST || role === ROLE_VIEWER) : entry.roles.includes(role);
}

module.exports = {
    HOST_SETTINGS_FIELDS,
    POWER_ACTIONS,
    INBOUND_EVENTS,
    OUTBOUND_EVENTS,
    PLANNED_EVENT_NAMES,
    getInboundEvent,
    getOutboundEvent,
    canSendEvent
};
