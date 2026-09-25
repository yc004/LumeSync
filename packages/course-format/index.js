// @lumesync/course-format
//
// `.lume` 课件的共享格式库：manifest schema 与校验、ZIP 读写与安全限制、
// 内容 hash、旧脚本课件迁移。编辑器、教师服务和播放器共用这一份实现；
// Node 专用的文件读写放在子路径 `@lumesync/course-format/node`。

const manifest = require('./src/manifest');
const pkg = require('./src/package');
const migrate = require('./src/migrate');

module.exports = {
    ...manifest,
    ...pkg,
    ...migrate
};
