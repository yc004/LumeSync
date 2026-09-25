// 角色定义。
//
// 线上只有两种授权角色：host（授课教师）与 viewer（学生）。
// 历史客户端还会声明 teacher/student，必须在入口处归一，不能让别名字符串
// 顺着代码路径流下去。

const ROLE_HOST = 'host';
const ROLE_VIEWER = 'viewer';

const ROLE_ALIASES = {
    host: ROLE_HOST,
    teacher: ROLE_HOST,
    viewer: ROLE_VIEWER,
    student: ROLE_VIEWER
};

/** 归一角色；无法识别时返回空字符串，调用方必须据此拒绝连接。 */
function normalizeRole(raw) {
    const value = String(raw === undefined || raw === null ? '' : raw).trim().toLowerCase();
    return ROLE_ALIASES[value] || '';
}

/** 判断角色是否满足要求；要求为 'any' 表示已认证连接即可。 */
function roleAllows(required, actual) {
    if (!required || required === 'any') return actual === ROLE_HOST || actual === ROLE_VIEWER;
    return required === actual;
}

/** 该角色是否是教师侧（用于确定广播目标房间）。 */
function isHostRole(role) {
    return role === ROLE_HOST;
}

module.exports = {
    ROLE_HOST,
    ROLE_VIEWER,
    ROLES: [ROLE_HOST, ROLE_VIEWER],
    ROLE_ALIASES,
    normalizeRole,
    roleAllows,
    isHostRole
};
