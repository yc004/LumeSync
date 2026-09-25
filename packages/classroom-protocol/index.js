// @lumesync/classroom-protocol
//
// LumeSync 课堂协议的共享契约：协议版本、消息信封、角色矩阵、事件表、
// HTTP 路由授权表与入站守卫。教师服务（含未来的教室 Hub）、教师页面和
// 学生页面共用这一份定义，避免各端各自维护事件名与授权规则。
//
// 本包不依赖第三方库，服务端用 require、打包器用 import 均可。

const version = require('./src/version');
const roles = require('./src/roles');
const errors = require('./src/errors');
const events = require('./src/events');
const routes = require('./src/routes');
const envelope = require('./src/envelope');
const guard = require('./src/guard');
const validate = require('./src/validate');
const relay = require('./src/relay');

module.exports = {
    ...version,
    ...roles,
    ...errors,
    ...events,
    ...routes,
    ...envelope,
    ...guard,
    ...validate,
    ...relay
};
