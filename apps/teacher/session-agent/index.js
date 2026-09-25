// @lumesync/teacher-session-agent
//
// 教师端会话代理：教师桌面应用（Windows/macOS）与教师 UI 共用的课堂客户端。
// 直接模式连本机 Hub；中继模式搜索教室、用固定机屏幕上的验证码配对、取得唯一授课租约、
// 上传课件、发课堂命令并确认提交落盘。
//
// 设计：[跨平台教师端与教室中继模式](../../../docs/architecture/teacher-cross-platform-relay.md) §3/§4/§6/§7
// 参考：[教师端会话代理](../../../docs/reference/session-agent.md)、[教室 Hub](../../../docs/reference/classroom-hub.md)
//
// 用法（中继模式）：
//   const { createSessionAgent } = require('@lumesync/teacher-session-agent');
//   const agent = createSessionAgent({ mode: 'relay', deviceKey: 'teacher-laptop-01', deviceName: '教师笔记本' });
//   const classrooms = await agent.discover({ timeoutMs: 3000 });
//   await agent.connect({ classroomId: classrooms[0].classroomId, address: classrooms[0].address, port: classrooms[0].port });
//   const request = await agent.requestPairing();     // 固定机屏幕显示验证码
//   await agent.submitPairingCode('12345678');        // 教师在自带电脑上输入
//   await agent.acquireLease();
//   await agent.publishCourse({ courseId: 'lesson-01', filePath: '/courses/lesson-01.lume' });
//   await agent.selectCourse('lesson-01');
//   await agent.endSession();

const { createSessionAgent, createEmitter, createDefaultScheduler, buildHubUrl, EVENT_NAMES } = require('./src/agent');
const {
    SESSION_AGENT_ERROR_CODES,
    LEASE_LOST_CODES,
    PAIRING_RESET_CODES,
    SessionAgentError,
    isSessionAgentError,
    toSessionAgentError
} = require('./src/errors');
const {
    DNS_SD_SERVICE_TYPE,
    DEFAULT_BROWSE_TIMEOUT_MS,
    parseServiceType,
    inspectTxt,
    mergeRelayRecords,
    browseClassroomRelays,
    createRelayBrowser,
    createBonjourTransport
} = require('./src/discovery');
const { createClassroomRegistry, REGISTRY_FILE } = require('./src/registry');
const {
    DIRECT_MODE_COMMAND_EVENTS,
    listStudentEventNames,
    isClassroomCommandType,
    normalizeCommand,
    applyCommandLocally
} = require('./src/commands');
const { DEFAULT_RECONNECT, DEFAULT_RENEW, createBackoff, computeRenewDelay } = require('./src/backoff');
const {
    SESSION_ACCEPTED_EVENT,
    SNAPSHOT_EVENT,
    DEFAULT_CONNECT_TIMEOUT_MS,
    DEFAULT_REQUEST_TIMEOUT_MS,
    buildSocketOptions,
    emitWithAck,
    openSocket,
    describeDisconnectReason
} = require('./src/transport');

module.exports = {
    // 主入口
    createSessionAgent,
    // 事件与错误
    EVENT_NAMES,
    SessionAgentError,
    SESSION_AGENT_ERROR_CODES,
    LEASE_LOST_CODES,
    PAIRING_RESET_CODES,
    isSessionAgentError,
    toSessionAgentError,
    // 发现（传输可注入；生产用 bonjour-service）
    DNS_SD_SERVICE_TYPE,
    DEFAULT_BROWSE_TIMEOUT_MS,
    parseServiceType,
    inspectTxt,
    mergeRelayRecords,
    browseClassroomRelays,
    createRelayBrowser,
    createBonjourTransport,
    // 教室登记表（classroomsDir）
    createClassroomRegistry,
    REGISTRY_FILE,
    // 命令映射与学生事件清单
    DIRECT_MODE_COMMAND_EVENTS,
    listStudentEventNames,
    isClassroomCommandType,
    normalizeCommand,
    applyCommandLocally,
    // 退避/续租（纯函数，便于固定机侧或测试复用）
    DEFAULT_RECONNECT,
    DEFAULT_RENEW,
    createBackoff,
    computeRenewDelay,
    // 传输细节（诊断与测试用）
    SESSION_ACCEPTED_EVENT,
    SNAPSHOT_EVENT,
    DEFAULT_CONNECT_TIMEOUT_MS,
    DEFAULT_REQUEST_TIMEOUT_MS,
    buildSocketOptions,
    buildHubUrl,
    openSocket,
    emitWithAck,
    describeDisconnectReason,
    createEmitter,
    createDefaultScheduler
};
