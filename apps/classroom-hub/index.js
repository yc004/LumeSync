// @lumesync/classroom-hub
//
// LumeSync 教室 Hub：直接模式（教师电脑）与教室中继模式（固定机）共用的
// 课堂状态单一写入者 + HTTP/Socket.IO 网关。
//
// 设计：[跨平台教师端与教室中继模式](../../docs/architecture/teacher-cross-platform-relay.md)
// 参考：[教室 Hub 服务](../../docs/reference/classroom-hub.md)
//
// 用法：
//   const { createHub } = require('@lumesync/classroom-hub');
//   const hub = await createHub({ port: 0 });           // 端口 0 = 系统分配
//   await hub.start();
//   ...
//   await hub.stop();

const { createHub, startHub, HUB_MODES } = require('./server/hub');
const { loadConfig } = require('./server/config');
const { createLogger, createSilentLogger } = require('./server/logger');
const protocol = require('./server/protocol');
const {
    createDiscoveryPublisher,
    mergeRelayRecords,
    browseClassroomRelays,
    createRelayBrowser,
    parseServiceType,
    inspectTxt,
    DNS_SD_SERVICE_TYPE
} = require('./server/discovery');
const { createBonjourTransport } = require('./server/discovery-bonjour');
const { VIEWER_FORWARD_EVENTS, HANDLED_VIEWER_EVENTS, DIRECT_COMMAND_EVENTS } = require('./server/socket');

if (require.main === module) {
    startHub()
        .then((hub) => {
            const shutdown = () => {
                hub.stop().then(() => process.exit(0));
            };
            process.on('SIGINT', shutdown);
            process.on('SIGTERM', shutdown);
        })
        .catch((error) => {
            console.error('[hub] 启动失败：', error.message);
            process.exit(1);
        });
}

module.exports = {
    createHub,
    startHub,
    loadConfig,
    createLogger,
    createSilentLogger,
    describeProtocol: protocol.describeProtocol,
    protocol,
    // 发现（可注入传输；生产实现基于 bonjour-service）
    createDiscoveryPublisher,
    createBonjourTransport,
    mergeRelayRecords,
    browseClassroomRelays,
    createRelayBrowser,
    parseServiceType,
    inspectTxt,
    DNS_SD_SERVICE_TYPE,
    // 事件归属（文档与测试共用同一份清单）
    VIEWER_FORWARD_EVENTS,
    HANDLED_VIEWER_EVENTS,
    DIRECT_COMMAND_EVENTS,
    HUB_MODES
};
