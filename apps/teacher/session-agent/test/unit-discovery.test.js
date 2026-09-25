// 单元测试：发现过滤/去重/校验 + 教室登记表（classroomsDir）。
//
// 全部使用假发现传输，绝不碰网络；同一套判定规则也用于 Hub 侧的发布（契约常量同源）。

const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const path = require('node:path');

const {
    createSessionAgent,
    mergeRelayRecords,
    browseClassroomRelays,
    createClassroomRegistry,
    inspectTxt,
    parseServiceType,
    DNS_SD_SERVICE_TYPE,
    SESSION_AGENT_ERROR_CODES
} = require('..');
const {
    createFakeDiscoveryTransport,
    relayRecord,
    makeTempDir,
    TEST_HOST_TOKEN
} = require('./helpers');

test('发现记录：按协议主版本过滤、合并多网卡重复结果、丢弃校验不通过的记录', () => {
    const rejected = [];
    const records = [
        // 同一教室经两个网卡各出现一次：必须合并成一条，且两个地址都保留
        relayRecord({ addresses: ['192.168.1.10'] }),
        relayRecord({ addresses: ['10.0.0.5'], host: 'classroom-101.local' }),
        // 协议主版本不兼容（本地 1，记录声明 2）
        relayRecord({ id: 'classroom-202', name: '202 教室', proto: '2' }),
        // TXT 里出现凭证类字段：整条记录作废
        relayRecord({ id: 'classroom-303', txtOverrides: { code: '12345678' } }),
        // TXT 值不是字符串（Bonjour TXT 只能是字符串）
        relayRecord({ id: 'classroom-404', txtOverrides: { label: 1 } }),
        // 缺少稳定 ID
        { name: '无 ID 教室', port: 3000, addresses: ['192.168.1.77'], txt: { name: '无 ID 教室', proto: '1', port: '3000' } },
        // ID 只有空白字符：TXT 校验通过但合并时必须丢弃
        relayRecord({ id: '   ', name: '空白 ID 教室' }),
        // 没有可用地址（发现记录只帮助定位，连不上就不展示）
        relayRecord({ id: 'classroom-505', addresses: [], host: null }),
        // 端口非法
        relayRecord({ id: 'classroom-606', port: 0 }),
        // 没有任何 TXT
        { name: '裸记录', port: 3000, addresses: ['192.168.1.88'] }
    ];

    const merged = mergeRelayRecords(records, { protocolVersion: 1, rejected });

    assert.equal(merged.length, 1, '只应留下 101 教室');
    const [entry] = merged;
    assert.equal(entry.classroomId, 'classroom-101');
    assert.equal(entry.records, 2, '两条重复记录被合并');
    assert.deepEqual(entry.addresses.sort(), ['10.0.0.5', '192.168.1.10']);
    assert.equal(entry.address, '192.168.1.10', 'IPv4 优先作为默认地址');
    assert.equal(entry.port, 3000);
    assert.equal(entry.state, 'free');
    assert.equal(entry.online, true);
    assert.deepEqual(entry.hosts, ['classroom-101.local']);

    const reasons = rejected.map((item) => item.reason);
    assert.ok(reasons.includes('discovery_proto_incompatible:2'));
    assert.ok(reasons.includes('discovery_txt_forbidden_field:code'));
    assert.ok(reasons.includes('discovery_txt_not_a_string:label'));
    assert.ok(reasons.includes('discovery_txt_incomplete'));
    assert.ok(reasons.includes('discovery_address_missing'));
    assert.ok(reasons.includes('discovery_port_missing'));
    assert.ok(reasons.includes('discovery_id_missing'));

    // 记录数量对不上时绝不能悄悄少算：上面 10 条 = 1 条有效（出现 2 次）+ 9 条被丢弃
    assert.equal(rejected.length, 8);
});

test('inspectTxt / parseServiceType：契约字段与 DNS-SD 名字解析', () => {
    assert.equal(inspectTxt({ name: 'a', id: 'b', proto: '1', port: '3000', state: 'free' }).ok, true);
    assert.equal(inspectTxt(null).ok, false);
    assert.equal(inspectTxt({ id: 'b', proto: '1', port: '3000', token: 'x' }).reason, 'discovery_txt_forbidden_field:token');
    assert.deepEqual(parseServiceType(DNS_SD_SERVICE_TYPE), { type: 'lumesync-relay', protocol: 'tcp' });
    assert.deepEqual(parseServiceType('garbage'), { type: 'lumesync-relay', protocol: 'tcp' });
});

test('discover()：注入传输被调用一次（带 serviceType/协议/超时），返回合并后的教室并落盘登记表', async () => {
    const dir = await makeTempDir();
    const transport = createFakeDiscoveryTransport({
        browseResults: [relayRecord({ state: 'busy', label: '授课中' })]
    });
    const agent = createSessionAgent({
        mode: 'relay',
        deviceKey: 'device-key-discovery-1',
        discoveryTransport: transport,
        classroomsDir: dir,
        logger: { info() {}, warn() {}, error() {}, debug() {} }
    });

    const classrooms = await agent.discover({ timeoutMs: 123 });
    assert.equal(transport.calls.length, 1);
    assert.equal(transport.calls[0].options.timeoutMs, 123);
    assert.equal(transport.calls[0].options.serviceType, DNS_SD_SERVICE_TYPE);
    assert.equal(transport.calls[0].options.type, 'lumesync-relay');
    assert.equal(transport.calls[0].options.protocol, 'tcp');
    assert.equal(classrooms.length, 1);
    assert.equal(classrooms[0].state, 'busy');
    assert.equal(classrooms[0].label, '授课中');
    assert.ok(classrooms[0].lastSeenAt);

    // 登记表写盘保留了搜到过的教室（供校园网隔离组播时手动连接）
    const raw = JSON.parse(await fsp.readFile(path.join(dir, 'classrooms.json'), 'utf8'));
    assert.equal(raw.version, 1);
    assert.equal(raw.classrooms.length, 1);
    assert.equal(raw.classrooms[0].classroomId, 'classroom-101');
    assert.equal(raw.classrooms[0].address, '192.168.1.10');

    // 注入的传输绝不能被替换成真实 bonjour：模块本身不应被加载
    assert.equal(
        Object.keys(require.cache).some((key) => key.includes('bonjour-service')),
        false,
        '注入 discoveryTransport 时不应加载 bonjour-service'
    );
});

test('discover()：mDNS 失败降级为手动地址（返回已知教室 + error 事件），throwOnFailure 时抛出类型化错误', async () => {
    const dir = await makeTempDir();
    const okTransport = createFakeDiscoveryTransport({ browseResults: [relayRecord()] });
    const first = createSessionAgent({ mode: 'relay', deviceKey: 'device-key-discovery-2', discoveryTransport: okTransport, classroomsDir: dir });
    assert.equal((await first.discover()).length, 1);

    const failing = createSessionAgent({
        mode: 'relay',
        deviceKey: 'device-key-discovery-3',
        discoveryTransport: createFakeDiscoveryTransport({ failBrowse: true }),
        classroomsDir: dir
    });
    const errors = [];
    failing.on('error', (error) => errors.push(error));
    const classrooms = await failing.discover({ timeoutMs: 5 });
    assert.equal(classrooms.length, 1, '实时搜索失败仍返回登记表里的教室');
    assert.equal(classrooms[0].online, false);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, SESSION_AGENT_ERROR_CODES.DISCOVERY_FAILED);
    assert.equal(errors[0] instanceof Error, true);
    assert.match(errors[0].message, /手动输入固定机地址/);

    await assert.rejects(
        () => failing.discover({ throwOnFailure: true }),
        (error) => error.code === SESSION_AGENT_ERROR_CODES.DISCOVERY_FAILED
    );

    const known = await failing.listKnownClassrooms();
    assert.equal(known.length, 1);
    assert.equal(known[0].classroomId, 'classroom-101');
});

test('discover()：传输不可用时给出明确错误，而不是静默返回空列表', async () => {
    const error = await browseClassroomRelays({ transport: null }).then(() => null, (err) => err);
    assert.ok(error);
    assert.equal(error.code, SESSION_AGENT_ERROR_CODES.DISCOVERY_FAILED);
    assert.match(error.message, /手动输入固定机地址/);

    // 注入一个没有 browse 的传输：discover 记一条 error 事件并返回空列表（不抛给 UI）
    const agent = createSessionAgent({
        mode: 'relay',
        deviceKey: 'device-key-discovery-broken',
        discoveryTransport: {}
    });
    const errors = [];
    agent.on('error', (e) => errors.push(e));
    assert.deepEqual(await agent.discover({}), []);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, SESSION_AGENT_ERROR_CODES.DISCOVERY_FAILED);
});

test('discover() 在 direct 模式被明确拒绝', async () => {
    const agent = createSessionAgent({ mode: 'direct', deviceKey: 'teacher-local', hostToken: TEST_HOST_TOKEN });
    await assert.rejects(
        () => agent.discover(),
        (error) => error.code === SESSION_AGENT_ERROR_CODES.MODE_UNSUPPORTED
    );
});

test('教室登记表：损坏的文件按空表继续，写入是原子替换', async () => {
    const dir = await makeTempDir();
    await fsp.writeFile(path.join(dir, 'classrooms.json'), '{ 这不是 JSON', 'utf8');
    const warnings = [];
    const registry = createClassroomRegistry({ dir, logger: { warn: (line) => warnings.push(line) } });
    assert.deepEqual(await registry.list(), []);
    assert.equal(warnings.length, 1);

    const merged = await registry.merge([relayRecord()]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].online, true);
    const reread = createClassroomRegistry({ dir });
    assert.equal((await reread.list())[0].classroomId, 'classroom-101');
});
