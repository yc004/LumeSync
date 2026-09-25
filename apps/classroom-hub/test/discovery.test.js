// 局域网自发现：发布内容、状态迁移、失败降级与教师端搜索助手。
//
// 全部使用注入的假传输，绝不接触真实组播。
// 硬约束：发布记录里不能出现验证码、凭证或学生数据；不可发现状态必须取消发布。

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    DNS_SD_SERVICE_TYPE,
    DISCOVERY_FORBIDDEN_FIELDS,
    PROTOCOL_VERSION,
    RELAY_STATES,
    ERROR_CODES
} = require('@lumesync/classroom-protocol');
const {
    browseClassroomRelays,
    createBonjourTransport,
    createDiscoveryPublisher,
    createRelayBrowser,
    inspectTxt,
    mergeRelayRecords,
    parseServiceType
} = require('..');
const {
    bootstrapViewer,
    connect,
    connectHost,
    createFakeDiscoveryTransport,
    fetchJson,
    pairTeacher,
    startTestHub,
    viewerAuth
} = require('./helpers');

test('中继模式按契约的 discoveryTxt 发布 DNS-SD 记录', async (t) => {
    const hub = await startTestHub({ mode: 'relay', classroomId: 'room-301', classroomName: '三年级一班' });
    t.after(() => hub.stop());

    const records = hub.testTransport.publishedRecords();
    assert.equal(records.length, 1, '状态未变化时只发布一次');
    const record = records[0];
    assert.equal(record.serviceType, DNS_SD_SERVICE_TYPE);
    assert.deepEqual(parseServiceType(record.serviceType), { type: 'lumesync-relay', protocol: 'tcp' });
    assert.equal(record.name, '三年级一班');
    assert.equal(record.port, hub.port, '发现报文里的端口是实际监听端口');
    assert.deepEqual(record.txt, {
        name: '三年级一班',
        id: 'room-301',
        proto: String(PROTOCOL_VERSION),
        port: String(hub.port),
        state: 'free',
        label: '空闲'
    });

    const status = await fetchJson(hub, '/api/hub/status');
    assert.equal(status.body.discovery.published, true);
    assert.equal(status.body.discovery.serviceType, DNS_SD_SERVICE_TYPE);
    assert.equal(status.body.discovery.lastError, '');
});

test('状态迁移会重新发布：等待连接 → 正在连接 → 授课中 → 空闲', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    const initialPublishes = hub.testTransport.publishedRecords().length;

    const paired = await pairTeacher(hub, { deviceKey: 'device-discovery-1' });
    assert.equal(hub.testTransport.lastRecord().txt.label, '正在连接');
    assert.equal(hub.testTransport.lastRecord().txt.state, 'free');

    const { client } = await connectHost(hub, paired.verified.deviceToken, 'device-discovery-1');
    t.after(() => client.close());
    const lease = await client.emitWithAck('teacher:lease.acquire', {});
    assert.equal(lease.ok, true);
    assert.equal(hub.testTransport.lastRecord().txt.label, '授课中');
    assert.equal(hub.testTransport.lastRecord().txt.state, 'busy');
    assert.equal(hub.relay.getState(), RELAY_STATES.TEACHING);

    await client.emitWithAck('teacher:lease.release', { leaseId: lease.leaseId, epoch: lease.epoch });
    assert.equal(hub.testTransport.lastRecord().txt.label, '空闲');
    assert.equal(hub.testTransport.lastRecord().txt.state, 'free');
    assert.ok(hub.testTransport.publishedRecords().length > initialPublishes);
});

test('发布记录里不会出现验证码、凭证或学生数据', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());

    const paired = await pairTeacher(hub, { deviceKey: 'device-discovery-2' });
    const { client } = await connectHost(hub, paired.verified.deviceToken, 'device-discovery-2');
    t.after(() => client.close());
    await client.emitWithAck('teacher:lease.acquire', {});

    // 学生连接并产生互动事件（这些数据绝不能出现在发现报文里）
    const student = connect(hub.port, viewerAuth(await bootstrapViewer(hub, 'student-discovery')));
    t.after(() => student.close());
    await student.waitForAccepted();
    await student.emitWithAck('student:alert', { type: 'fullscreen-exit' });
    await student.emitWithAck('student:device-info', { mac: 'aa:bb:cc:dd:ee:ff', deviceName: '教室机-07' });

    const records = hub.testTransport.publishedRecords();
    assert.ok(records.length >= 2);

    const serialized = JSON.stringify(records);
    assert.ok(!serialized.includes(paired.code), '验证码不能出现在发现记录里');
    assert.ok(!serialized.includes(paired.verified.deviceToken), '设备凭证不能出现在发现记录里');
    assert.ok(!serialized.includes('aa:bb:cc:dd:ee:ff'), '学生设备信息不能出现在发现记录里');
    assert.ok(!serialized.includes('教室机-07'));

    for (const record of records) {
        for (const key of Object.keys(record.txt)) {
            assert.ok(!DISCOVERY_FORBIDDEN_FIELDS.includes(key), `TXT 不允许有 ${key}`);
            assert.equal(typeof record.txt[key], 'string');
        }
        assert.deepEqual(
            Object.keys(record.txt).sort(),
            ['id', 'label', 'name', 'port', 'proto', 'state'],
            'TXT 只包含契约声明的六个字段'
        );
    }

    // 防御性检查函数本身也要挡住禁用字段
    assert.equal(inspectTxt({ id: 'a', proto: '1', port: '1', code: '12345678' }).ok, false);
    assert.equal(inspectTxt({ id: 'a', proto: '1', port: '1', token: 'x' }).ok, false);
    assert.equal(inspectTxt({ id: 'a', proto: '1', port: '1', state: 'free', label: '空闲', name: 'x' }).ok, true);
});

test('关闭中继、进入错误状态与直接模式都不发布', async (t) => {
    const hub = await startTestHub({ mode: 'relay' });
    t.after(() => hub.stop());
    assert.equal(hub.testTransport.publishedRecords().length, 1);

    hub.relay.disable();
    hub.sweep();
    await hub.discovery.refresh();
    assert.equal((await fetchJson(hub, '/api/hub/status')).body.discovery.published, false);
    assert.ok(hub.testTransport.unpublishCount() >= 1, '关闭后必须取消发布');

    const failed = hub.relay.fail(ERROR_CODES.RELAY_NO_SCREEN);
    assert.equal(failed.ok, true);
    await hub.discovery.refresh();
    const status = await fetchJson(hub, '/api/hub/status');
    assert.equal(status.body.relay.state, RELAY_STATES.ERROR);
    assert.equal(status.body.discovery.published, false);

    const direct = await startTestHub({ mode: 'direct' });
    t.after(() => direct.stop());
    assert.equal(direct.testTransport.publishedRecords().length, 0, '直接模式不发布发现服务');

    const noScreen = await startTestHub({ mode: 'relay', canDisplayCode: false });
    t.after(() => noScreen.stop());
    assert.equal(noScreen.testTransport.publishedRecords().length, 0, '没有屏幕时不发布（不静默降级）');
    const noScreenStatus = await fetchJson(noScreen, '/api/hub/status');
    assert.equal(noScreenStatus.body.discovery.published, false);
    assert.equal(noScreenStatus.body.relay.errorReason, ERROR_CODES.RELAY_NO_SCREEN);
});

test('组播栈不可用时记录明确错误但服务继续提供', async (t) => {
    const failing = createFakeDiscoveryTransport({ failPublish: true });
    const hub = await startTestHub({ mode: 'relay', discoveryTransport: failing });
    t.after(() => hub.stop());

    const status = await fetchJson(hub, '/api/hub/status');
    assert.equal(status.status, 200);
    assert.equal(status.body.discovery.published, false);
    assert.match(status.body.discovery.lastError, /publish_failed/);

    // 手动地址入口（状态/健康检查/配对流程）不受影响
    const health = await fetchJson(hub, '/api/health');
    assert.equal(health.body.ok, true);
    const paired = await pairTeacher(hub, { deviceKey: 'device-discovery-3' });
    assert.equal(paired.verified.ok, true);
});

test('教师端搜索助手：按协议主版本过滤并合并重复接口结果', async () => {
    const records = [
        {
            name: 'room-101',
            host: 'room-101.local',
            port: 3000,
            addresses: ['fe80::1%en0', '192.168.1.21'],
            txt: { name: '三年级一班', id: 'room-101', proto: String(PROTOCOL_VERSION), port: '3000', state: 'free', label: '空闲' }
        },
        {
            // 同一教室在另一个接口上重复出现（组播多网卡）
            name: 'room-101',
            host: 'room-101.local',
            port: 3000,
            addresses: ['10.0.0.21'],
            txt: { name: '三年级一班', id: 'room-101', proto: String(PROTOCOL_VERSION), port: '3000', state: 'free', label: '空闲' }
        },
        {
            name: 'room-102',
            host: 'room-102.local',
            port: 3100,
            addresses: ['192.168.1.22'],
            txt: { name: '三年级二班', id: 'room-102', proto: String(PROTOCOL_VERSION), port: '3100', state: 'busy', label: '授课中' }
        },
        {
            // 协议主版本不一致：必须过滤掉
            name: 'room-103',
            host: 'room-103.local',
            port: 3200,
            addresses: ['192.168.1.23'],
            txt: { name: '三年级三班', id: 'room-103', proto: String(PROTOCOL_VERSION + 1), port: '3200', state: 'free', label: '空闲' }
        },
        {
            // 缺少协议版本：必须过滤掉
            name: 'room-104',
            host: 'room-104.local',
            port: 3300,
            addresses: ['192.168.1.24'],
            txt: { name: '四年级一班', id: 'room-104', port: '3300', state: 'free', label: '空闲' }
        }
    ];

    const merged = mergeRelayRecords(records);
    assert.deepEqual(merged.map((entry) => entry.classroomId).sort(), ['room-101', 'room-102']);
    const byId = new Map(merged.map((entry) => [entry.classroomId, entry]));
    const first = byId.get('room-101');
    assert.equal(first.records, 2);
    assert.equal(first.address, '192.168.1.21', '优先给出 IPv4 地址，并剥掉 IPv6 的接口域');
    assert.deepEqual(first.addresses, ['192.168.1.21', '10.0.0.21', 'fe80::1']);
    assert.deepEqual(first.hosts, ['room-101.local']);
    assert.equal(first.port, 3000);
    assert.equal(first.label, '空闲');
    const second = byId.get('room-102');
    assert.equal(second.state, 'busy');
    assert.equal(second.label, '授课中');

    const transport = createFakeDiscoveryTransport({ browseResults: records });
    const found = await browseClassroomRelays({ transport, timeoutMs: 5 });
    assert.equal(found.length, 2);
    assert.equal(transport.calls.filter((call) => call.type === 'browse').length, 1);

    const browser = createRelayBrowser({ transport, defaultTimeoutMs: 5 });
    assert.equal((await browser.browse()).length, 2);

    const failing = createFakeDiscoveryTransport({ failBrowse: true });
    assert.deepEqual(await browseClassroomRelays({ transport: failing, timeoutMs: 5 }), []);
    assert.deepEqual(await browseClassroomRelays({ transport: null }), []);
});

test('发布者拒绝含禁用字段的 TXT（防御性检查）', async () => {
    const transport = createFakeDiscoveryTransport();
    const discovery = createDiscoveryPublisher({
        mode: 'relay',
        transport,
        txtProvider: () => ({ name: 'x', id: 'room-x', proto: '1', port: '3000', state: 'free', label: '空闲', code: '12345678' })
    });
    const result = await discovery.refresh();
    assert.equal(result.ok, false);
    assert.equal(result.code, 'discovery_txt_unsafe');
    assert.equal(transport.publishedRecords().length, 0);
    assert.match(discovery.status().lastError, /forbidden_field/);

    // 状态不可发现（null）时取消发布
    let txt = null;
    const publisherWithNull = createDiscoveryPublisher({ mode: 'relay', transport, txtProvider: () => txt });
    assert.equal((await publisherWithNull.refresh()).published, false);
    txt = { name: 'x', id: 'room-x', proto: '1', port: '3000', state: 'free', label: '空闲' };
    assert.equal((await publisherWithNull.refresh()).published, true);
    txt = null;
    assert.equal((await publisherWithNull.refresh()).published, false);
    assert.ok(transport.unpublishCount() >= 1);
});

test('生产传输（bonjour-service）延迟创建套接字，可被安全 require', () => {
    const transport = createBonjourTransport();
    for (const method of ['publish', 'unpublish', 'browse', 'destroy']) {
        assert.equal(typeof transport[method], 'function');
    }
    // 依赖确实装上了（缺失时 publish 会抛明确错误，而不是静默不发布）
    assert.doesNotThrow(() => require.resolve('bonjour-service'));
});

test('契约常量与实现一致（服务类型与 TXT 字段）', () => {
    assert.equal(DNS_SD_SERVICE_TYPE, '_lumesync-relay._tcp.local');
    assert.equal(typeof createDiscoveryPublisher, 'function');
    assert.deepEqual(
        Object.keys(inspectTxt({ name: 'x', id: 'room-x', proto: '1', port: '3000', state: 'free', label: '空闲' })),
        ['ok', 'reason']
    );
    assert.equal(typeof createBonjourTransport, 'function');
    assert.equal(typeof browseClassroomRelays, 'function');
});
