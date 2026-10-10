    // ========================================================
// Socket.io 瀹炴椂閫氫俊
// ========================================================

const { config } = require('./config');
const { getStudentFromClassroomLayout, updateSeatDeviceInfo } = require('./submissions');
const { loadCoreModule } = require('./core-paths');
const { normalizeIp, verifyViewerSessionToken } = loadCoreModule('identity');
const dgram = require('dgram');
const crypto = require('crypto');
const classroomState = require('./classroom-state');
const protocol = require('./protocol');

const HOST_TOKEN = String(process.env.LUMESYNC_HOST_TOKEN || '');
const VIEWER_TOKEN_SECRET = String(process.env.LUMESYNC_VIEWER_TOKEN_SECRET || '');

function getStringValue(value) {
    if (value === undefined || value === null) return '';
    if (Array.isArray(value)) return getStringValue(value[0]);
    return String(value).trim();
}

function normalizeDeclaredRole(rawRole) {
    // 角色别名统一由共享契约决定（teacher→host、student→viewer）。
    return protocol.normalizeRole(getStringValue(rawRole));
}

function resolveConnectionIdentity(socket) {
    const auth = socket?.handshake?.auth || {};
    const query = socket?.handshake?.query || {};
    const clientIp = normalizeIp(socket?.handshake?.address || '');
    const declaredRole = normalizeDeclaredRole(auth.role || query.role);
    const token = getStringValue(auth.token || query.token);
    const clientId = getStringValue(auth.clientId || query.clientId);

    if (declaredRole === 'host') {
        const supplied = Buffer.from(token, 'utf8');
        const expected = Buffer.from(HOST_TOKEN, 'utf8');
        if (expected.length > 0 && supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected)) {
            return { ok: true, role: 'host', clientIp, clientId: clientId || `host-${clientIp}` };
        }
        return { ok: false, code: 'host_auth_failed', message: 'Invalid host token' };
    }

    if (declaredRole === 'viewer' && token && clientId && VIEWER_TOKEN_SECRET) {
        const verified = verifyViewerSessionToken(token, VIEWER_TOKEN_SECRET);
        if (verified.ok && String(verified.payload.sub) === clientId) {
            return { ok: true, role: 'viewer', clientIp, clientId };
        }
    }

    return { ok: false, code: 'viewer_auth_failed', message: 'Valid viewer session required' };
}


let studentIPs = new Map(); // IP -> socket鏁伴噺锛屽悓涓€IP鍙涓€涓鐢?
const viewerRoomForIp = (ip) => 'viewer-ip:' + normalizeIp(ip || '');

// 鏁欏笀绔綋鍓嶈缃紙鏈嶅姟绔紦瀛橈紝鐢ㄤ簬鏂拌繛鎺ュ鐢熷悓姝ワ級
let currentHostSettings = {
    forceFullscreen: false,
    syncFollow: true,
    syncInteraction: false,  // 榛樿鍏抽棴鏁欏笀浜や簰鍚屾
    allowInteract: true,
    podiumAtTop: true,
    renderScale: 0.96,
    uiScale: 1.0,
    alertJoin: true,
    alertLeave: true,
    alertFullscreenExit: true,
    alertTabHidden: true,
    monitorEnabled: false,
    monitorIntervalSec: 1,
};

function normalizeMonitorIntervalSec(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 1;
    const clamped = Math.min(5, Math.max(0.5, n));
    return Math.round(clamped * 2) / 2;
}

function normalizeHostSettingsPatch(data) {
    if (!data || typeof data !== 'object') return {};
    const next = { ...data };
    if (Object.prototype.hasOwnProperty.call(next, 'monitorIntervalSec')) {
        next.monitorIntervalSec = normalizeMonitorIntervalSec(next.monitorIntervalSec);
    }
    return next;
}

const latestScreenshots = new Map();
const SCREENSHOT_DATA_URL_MAX = 1024 * 1024;
const SCREENSHOT_BROADCAST_LIMIT = 200;
const POWER_ACTIONS = new Set(['power-on', 'shutdown', 'restart', 'force-shutdown', 'force-restart']);

// 鏍囨敞鏁版嵁锛堝唴瀛樼紦瀛橈級
const annotationStore = new Map();
const getAnnoKey = (courseId, slideIndex) => `${String(courseId || '')}:${Number(slideIndex || 0)}`;

// 瀛︾敓鎿嶄綔鏃ュ織锛堝唴瀛橈紝鏈€澶氫繚鐣?500 鏉★級
const studentLog = [];

// 鎶曠エ浼氳瘽锛堝唴瀛橈級
const voteSessions = new Map();
const voteSessionTimers = new Map();
const getVoteKey = (courseId, slideIndex, voteId) => `${String(courseId || '')}:${Number(slideIndex || 0)}:${String(voteId || '')}`;

function buildVoteResult(session) {
    const counts = {};
    (session.options || []).forEach(opt => { counts[opt.id] = 0; });
    session.responses.forEach(optionId => {
        if (Object.prototype.hasOwnProperty.call(counts, optionId)) counts[optionId] += 1;
    });
    const totalVotes = session.responses.size;
    const options = (session.options || []).map(opt => ({
        id: opt.id,
        label: opt.label,
        votes: counts[opt.id] || 0,
        percent: totalVotes > 0 ? Math.round(((counts[opt.id] || 0) / totalVotes) * 100) : 0
    }));
    return {
        voteId: session.voteId,
        courseId: session.courseId,
        slideIndex: session.slideIndex,
        question: session.question,
        anonymous: !!session.anonymous,
        status: session.status,
        startedAt: session.startedAt,
        endsAt: session.endsAt,
        totalVotes,
        options
    };
}

function clearVoteSession(courseId, slideIndex, voteId) {
    const key = getVoteKey(courseId, slideIndex, voteId);
    if (voteSessionTimers.has(key)) {
        clearTimeout(voteSessionTimers.get(key));
        voteSessionTimers.delete(key);
    }
    voteSessions.delete(key);
}

function clearVotesByCourse(courseId) {
    const prefix = `${String(courseId || '')}:`;
    Array.from(voteSessions.keys()).forEach(key => {
        if (key.startsWith(prefix)) {
            if (voteSessionTimers.has(key)) {
                clearTimeout(voteSessionTimers.get(key));
                voteSessionTimers.delete(key);
            }
            voteSessions.delete(key);
        }
    });
}

function findVoteSessionByCourseAndVoteId(courseId, voteId) {
    for (const [key, session] of voteSessions.entries()) {
        if (session.courseId === String(courseId || '') && session.voteId === String(voteId || '')) {
            return { key, session };
        }
    }
    return null;
}


function pushLog(type, ip, extra) {
    const entry = { time: new Date().toISOString(), type, ip, ...extra };
    studentLog.push(entry);
    if (studentLog.length > config.studentLogMax) {
        studentLog.shift();
    }
    return entry;
}

function emitStudentLogEntry(io, type, ip, extra = {}) {
    const entry = pushLog(type, ip, extra);
    io.to('hosts').emit('student-log-entry', entry);
    return entry;
}

function sanitizeScreenshotPayload(clientIp, data) {
    const dataUrl = typeof data?.dataUrl === 'string' ? data.dataUrl.trim() : '';
    if (!dataUrl.startsWith('data:image/jpeg;base64,')) return null;
    if (dataUrl.length > SCREENSHOT_DATA_URL_MAX) return null;
    const width = Math.max(1, Math.min(4096, Number(data?.width) || 0));
    const height = Math.max(1, Math.min(4096, Number(data?.height) || 0));
    return {
        ip: clientIp,
        dataUrl,
        width,
        height,
        capturedAt: data?.capturedAt ? String(data.capturedAt) : new Date().toISOString()
    };
}

function getScreenshotStatePayload() {
    return Array.from(latestScreenshots.values()).slice(-SCREENSHOT_BROADCAST_LIMIT);
}

function clearStudentScreenshot(io, clientIp) {
    if (!latestScreenshots.has(clientIp)) return;
    latestScreenshots.delete(clientIp);
    io.to('hosts').emit('student:screenshot:clear', { ip: clientIp });
}

function clearAllScreenshots(io) {
    latestScreenshots.clear();
    io.to('hosts').emit('student:screenshot:reset');
}
function normalizeMacAddress(value) {
    const text = String(value || '').trim();
    const compact = text.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
    if (!/^[0-9a-f]{12}$/.test(compact)) return '';
    return compact.match(/.{2}/g).join(':');
}

function getWakeBroadcastAddresses(ip) {
    const normalizedIp = normalizeIp(ip || '');
    const addresses = new Set(['255.255.255.255']);
    const match = normalizedIp.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!match) return Array.from(addresses);
    const octets = match.slice(1).map(Number);
    if (octets.every(part => Number.isInteger(part) && part >= 0 && part <= 255)) {
        addresses.add(`${octets[0]}.${octets[1]}.${octets[2]}.255`);
    }
    return Array.from(addresses);
}

function sendWakeOnLan(mac, options = {}) {
    const normalized = normalizeMacAddress(mac);
    if (!normalized) return Promise.resolve({ success: false, error: 'invalid_mac' });
    const broadcastAddresses = Array.isArray(options.broadcastAddresses) && options.broadcastAddresses.length > 0
        ? Array.from(new Set(options.broadcastAddresses.map(addr => String(addr || '').trim()).filter(Boolean)))
        : ['255.255.255.255'];
    const ports = Array.isArray(options.ports) && options.ports.length > 0
        ? Array.from(new Set(options.ports.map(port => Number(port)).filter(port => Number.isInteger(port) && port > 0 && port <= 65535)))
        : [9];
    const macBytes = Buffer.from(normalized.split(':').map(part => parseInt(part, 16)));
    const packet = Buffer.alloc(6 + 16 * 6, 0xff);
    for (let i = 0; i < 16; i++) {
        macBytes.copy(packet, 6 + i * 6);
    }
    return new Promise((resolve) => {
        const socket = dgram.createSocket('udp4');
        const done = (payload) => {
            try { socket.close(); } catch (_) {}
            resolve(payload);
        };
        socket.once('error', (err) => done({ success: false, error: err.message || 'wol_failed' }));
        socket.bind(() => {
            socket.setBroadcast(true);
            const sends = [];
            broadcastAddresses.forEach((address) => {
                ports.forEach((port) => {
                    sends.push(new Promise((sendResolve) => {
                        socket.send(packet, 0, packet.length, port, address, (err) => {
                            sendResolve({
                                address,
                                port,
                                success: !err,
                                error: err ? (err.message || 'wol_failed') : ''
                            });
                        });
                    }));
                });
            });
            Promise.all(sends).then((results) => {
                const success = results.some(item => item.success);
                done(success
                    ? { success: true, attempts: results }
                    : { success: false, error: results[0]?.error || 'wol_failed', attempts: results });
            });
        });
    });
}

function normalizePowerTargets(data) {
    const targets = Array.isArray(data?.targets) ? data.targets : [];
    return targets
        .map((target) => ({
            ip: normalizeIp(target?.ip || ''),
            mac: normalizeMacAddress(target?.mac || target?.wakeMac || '')
        }))
        .filter(target => target.ip || target.mac);
}

function setupSocketHandlers(io, {
    setCurrentCourseId,
    setCurrentSlideIndex,
    getCurrentCourseId,
    getCurrentSlideIndex,
    getCourseCatalog,
    ensureCourseDependenciesCached
}) {
    io.on('connection', (socket) => {
        const identity = resolveConnectionIdentity(socket);
        if (!identity.ok) {
            socket.emit('identity-rejected', { code: identity.code, message: identity.message });
            socket.disconnect(true);
            return;
        }

        // 协议版本协商：不支持的新版本必须明确拒绝，而不是按旧语义继续服务。
        const negotiation = protocol.negotiateConnection(socket);
        if (!negotiation.ok) {
            socket.emit(protocol.PROTOCOL_REJECTED_EVENT, protocol.buildProtocolRejected({
                code: negotiation.code,
                message: negotiation.message
            }));
            console.warn(`[protocol] rejected version=${String(negotiation.declared)} code=${negotiation.code}`);
            socket.disconnect(true);
            return;
        }

        const clientIp = identity.clientIp;
        const role = identity.role;
        console.log(`[conn] IP=${clientIp} role=${role} clientId=${identity.clientId || ''} protocol=${negotiation.protocolVersion}${negotiation.legacy ? ' (legacy)' : ''}`);

        // 共享契约的事件守卫：角色与 payload schema 在业务处理器之前统一校验。
        protocol.attachInboundGuard(socket, role);

        const sendSessionAccepted = () => {
            socket.emit(protocol.SESSION_ACCEPTED_EVENT, protocol.buildSessionAccepted({
                role,
                clientId: identity.clientId,
                clientIp,
                sessionId: classroomState.snapshot(currentHostSettings).sessionId,
                revision: classroomState.getRevision(),
                negotiation
            }));
        };

        // 显式握手：客户端可随时查询权威协议版本与 revision。
        socket.on(protocol.SESSION_HELLO_EVENT, () => {
            sendSessionAccepted();
        });

        socket.emit('role-assigned', {
            role,
            clientIp,
            clientId: identity.clientId,
            currentCourseId: getCurrentCourseId(),
            currentSlideIndex: getCurrentSlideIndex(),
            hostSettings: currentHostSettings,
            courseCatalog: getCourseCatalog(),
            protocolVersion: negotiation.protocolVersion,
            sessionId: classroomState.snapshot(currentHostSettings).sessionId,
            revision: classroomState.getRevision()
        });
        sendSessionAccepted();
        socket.emit('classroom:snapshot', classroomState.snapshot(currentHostSettings));

        socket.on('request-classroom-snapshot', () => {
            socket.emit('classroom:snapshot', classroomState.snapshot(currentHostSettings));
        });

        // 鍔犲叆鎴块棿
        if (role === 'host') {
            socket.join('hosts');
            // 鏁欏笀绔繛鎺ユ椂鍙戦€佸垵濮嬪鐢熸暟閲?
            socket.emit('student-status', { count: studentIPs.size, action: 'init' });
            socket.emit('student:screenshot:state', { screenshots: getScreenshotStatePayload() });
        } else {
            socket.join('viewers');
            socket.join(viewerRoomForIp(clientIp));
            // 缁熻鍦ㄧ嚎瀛︾敓
            const prev = studentIPs.get(clientIp) || 0;
            studentIPs.set(clientIp, prev + 1);
            // 鍙湁璇?IP 鐨勭涓€涓繛鎺ユ墠瑙﹀彂 join 閫氱煡
            if (prev === 0) {
                emitStudentLogEntry(io, 'join', clientIp);
                io.to('hosts').emit('student-status', { count: studentIPs.size, action: 'join', ip: clientIp });
            }
        }

        // 鑾峰彇瀛︾敓鏁伴噺锛堟暀甯堢涓诲姩鏌ヨ锛?
        socket.on('get-student-count', () => {
            if (role !== 'host') return;
            socket.emit('student-status', { count: studentIPs.size, action: 'init' });
        });

        // ========================================================
        // 鏁欏笀绔簨浠跺鐞?
        // ========================================================

        // 閫夋嫨璇剧▼
        socket.on('select-course', async (data) => {
            if (role !== 'host') return;
            const courseId = typeof data?.courseId === 'string' ? data.courseId.trim() : '';
            if (!courseId) return;
            console.log(`[select-course] courseId=${courseId}`);
            if (typeof ensureCourseDependenciesCached === 'function') {
                try {
                    const result = await ensureCourseDependenciesCached(courseId);
                    if (result?.dependencies?.length) {
                        const downloaded = (result.cached || []).filter(item => !item.alreadyCached).length;
                        console.log(`[select-course] cached dependencies for ${courseId}: ${result.cached.length}/${result.dependencies.length} (${downloaded} downloaded)`);
                    }
                } catch (err) {
                    console.warn(`[select-course] dependency cache failed for ${courseId}: ${err.message}`);
                    socket.emit('course-dependency-cache-error', {
                        courseId,
                        error: err.message || 'Dependency cache failed'
                    });
                    return;
                }
            }
            setCurrentCourseId(courseId);
            setCurrentSlideIndex(0);
            io.emit('course-changed', { courseId, slideIndex: 0, hostSettings: currentHostSettings, revision: classroomState.getRevision() });
            io.emit('classroom:snapshot', classroomState.snapshot(currentHostSettings));
        });

        // 鍒囨崲骞荤伅鐗?
        socket.on('sync-slide', (data) => {
            if (role !== 'host') return;
            const slideIndex = Number(data?.slideIndex);
            if (!Number.isInteger(slideIndex) || slideIndex < 0) return;
            console.log(`[sync-slide] slideIndex=${slideIndex}`);
            setCurrentSlideIndex(slideIndex);
            // 鍙戦€佺粰鎵€鏈夊鐢熺锛堝鐢熺鐩戝惉 sync-slide锛?
            io.to('viewers').emit('sync-slide', { slideIndex, revision: classroomState.getRevision() });
            io.emit('classroom:snapshot', classroomState.snapshot(currentHostSettings));
        });

        // 鍚屾璁剧疆锛堝墠绔彂閫佺殑浜嬩欢鍚嶆槸 host-settings锛?
        socket.on('update-settings', (data) => {
            if (role !== 'host') return;
            const prevMonitorEnabled = !!currentHostSettings.monitorEnabled;
            currentHostSettings = { ...currentHostSettings, ...normalizeHostSettingsPatch(data) };
            classroomState.touch();
            if (prevMonitorEnabled && !currentHostSettings.monitorEnabled) {
                clearAllScreenshots(io);
            }
            // 閫氱煡鎵€鏈夊鐢熸洿鏂拌缃?
            io.to('viewers').emit('host-settings', currentHostSettings);
            io.emit('classroom:snapshot', classroomState.snapshot(currentHostSettings));
        });

        socket.on('host-settings', (data) => {
            if (role !== 'host') return;
            const prevSyncFollow = currentHostSettings.syncFollow;
            const prevMonitorEnabled = !!currentHostSettings.monitorEnabled;
            currentHostSettings = { ...currentHostSettings, ...normalizeHostSettingsPatch(data) };
            classroomState.touch();
            if (prevMonitorEnabled && !currentHostSettings.monitorEnabled) {
                clearAllScreenshots(io);
            }
            // 閫氱煡鎵€鏈夊鐢熸洿鏂拌缃紝鍚屾椂骞挎挱缁欏叾浠栨暀甯堢
            io.emit('host-settings', currentHostSettings);
            io.emit('classroom:snapshot', classroomState.snapshot(currentHostSettings));
            // 濡傛灉寮€鍚簡瀛︾敓璺熼殢缈婚〉锛岀珛鍗冲悓姝ュ綋鍓嶉〉闈?
            if (!prevSyncFollow && currentHostSettings.syncFollow) {
                const currentSlide = getCurrentSlideIndex();
                if (currentSlide !== undefined && currentSlide !== null) {
                    io.to('viewers').emit('sync-slide', { slideIndex: currentSlide });
                }
            }
        });


        // 鍒锋柊璇剧▼鍒楄〃
        socket.on('refresh-courses', () => {
            if (role !== 'host') return;
            const { scanCourses } = require('./courses');
            const catalog = scanCourses();
            // 骞挎挱璇剧▼鐩綍鏇存柊缁欐墍鏈夋暀甯堢
            io.to('hosts').emit('course-catalog-updated', { courses: catalog });
        });

        // 缁撴潫璇剧▼锛堣繑鍥炶绋嬮€夋嫨鐣岄潰锛?
        socket.on('end-course', () => {
            if (role !== 'host') return;
            const courseId = getCurrentCourseId();
            setCurrentCourseId(null);
            setCurrentSlideIndex(0);
            annotationStore.clear();
            clearVotesByCourse(courseId);
            currentHostSettings = { ...currentHostSettings, monitorEnabled: false };
            classroomState.touch();
            const revision = classroomState.getRevision();
            clearAllScreenshots(io);
            console.log(`[end-course] courseId=${courseId}`);
            io.emit('course-ended', { revision });
            io.emit('host-settings', currentHostSettings);
            io.emit('classroom:snapshot', classroomState.snapshot(currentHostSettings));
        });

        // 娉ㄥ唽璇句欢渚濊禆鏄犲皠
        socket.on('register-dependencies', (deps) => {
            if (role !== 'host') return;
            if (!Array.isArray(deps)) return;
            deps.forEach(({ filename, publicSrc }) => {
                if (filename && publicSrc) {
                    console.log(`[register-dependencies] ${filename} -> ${publicSrc}`);
                    const { dependencyMap } = require('./proxy');
                    dependencyMap[filename] = publicSrc;
                }
            });
        });

        // 瀛︾敓绔笂鎶ュ紓甯歌涓?
        socket.on('student-alert', (data) => {
            if (role !== 'viewer') return;
            const { type } = data;
            emitStudentLogEntry(io, type, clientIp);
            io.to('hosts').emit('student-alert', { ip: clientIp, type });
        });

        // 瀛︾敓绔笂鎶ユ埅鍥?
        socket.on('student:screenshot', (data) => {
            if (role !== 'viewer' || !currentHostSettings.monitorEnabled) return;
            const payload = sanitizeScreenshotPayload(clientIp, data);
            if (!payload) return;
            latestScreenshots.set(clientIp, payload);
            io.to('hosts').emit('student:screenshot', payload);
        });

        socket.on('student:device-info', (data) => {
            if (role !== 'viewer') return;
            const mac = normalizeMacAddress(data?.mac || '');
            const deviceName = String(data?.deviceName || '').trim();
            const clientId = String(data?.clientId || identity.clientId || '').trim();
            if (!mac && !deviceName && !clientId) return;
            const result = updateSeatDeviceInfo(clientIp, { mac, deviceName, clientId });
            io.to('hosts').emit('student:device-info', {
                ip: clientIp,
                mac,
                deviceName,
                clientId,
                updated: !!result.updated,
                seat: result.seat || null
            });
            if (result.updated && result.layout) {
                io.to('hosts').emit('classroom-layout-updated', { layout: result.layout, reason: 'student-device-info' });
            }
        });

        socket.on('set-admin-password', (data) => {
            if (role !== 'host' || !data?.hash) return;
            console.log('[set-admin-password] password update pushed to students');
            io.to('viewers').emit('set-admin-password', { hash: data.hash });
        });

        // 瀛︾敓绔姹傚悓姝ョ姸鎬?
        socket.on('student:power-control', async (data) => {
            if (role !== 'host') return;
            const action = String(data?.action || '').trim();
            if (!POWER_ACTIONS.has(action)) {
                socket.emit('student:power-control:ack', { success: false, action, error: 'invalid_action' });
                return;
            }
            const targets = normalizePowerTargets(data);
            if (targets.length === 0) {
                socket.emit('student:power-control:ack', { success: false, action, error: 'empty_targets' });
                return;
            }
            const requestId = data?.requestId ? String(data.requestId) : 'power-' + Date.now();
            if (action === 'power-on') {
                const results = await Promise.all(targets.map(async (target) => {
                    if (!target.mac) return { ip: target.ip, mac: target.mac, success: false, error: 'missing_mac' };
                    const result = await sendWakeOnLan(target.mac, {
                        broadcastAddresses: getWakeBroadcastAddresses(target.ip),
                        ports: [9, 7]
                    });
                    return { ip: target.ip, mac: target.mac, ...result };
                }));
                const successCount = results.filter(item => item.success).length;
                socket.emit('student:power-control:ack', { success: successCount > 0, requestId, action, results, successCount, targetCount: targets.length });
                targets.forEach(target => {
                    if (target.ip) pushLog('power-on', target.ip, { requestedBy: 'host', mac: target.mac || '' });
                });
                io.to('hosts').emit('student-log-entry', {
                    time: new Date().toISOString(),
                    type: 'power-on',
                    ip: targets.map(t => t.ip || t.mac).filter(Boolean).join(','),
                    action,
                    successCount,
                    targetCount: targets.length
                });
                return;
            }
            targets.forEach(target => {
                if (!target.ip) return;
                io.to(viewerRoomForIp(target.ip)).emit('student:power-control', { requestId, action, ip: target.ip, issuedAt: Date.now() });
                pushLog(action, target.ip, { requestedBy: 'host' });
            });
            socket.emit('student:power-control:ack', { success: true, requestId, action, targetCount: targets.length });
            io.to('hosts').emit('student-log-entry', {
                time: new Date().toISOString(),
                type: action,
                ip: targets.map(t => t.ip).filter(Boolean).join(','),
                action,
                targetCount: targets.length
            });
        });
        socket.on('request-sync-state', (data) => {
            if (role !== 'viewer') return;
            const { courseId, slideIndex } = data;
            console.log(`[request-sync-state] courseId=${courseId} slideIndex=${slideIndex} ip=${clientIp}`);
            io.to('hosts').emit('request-sync-state', { courseId, slideIndex, requesterId: socket.id });
        });

        // 鏁欏笀绔彂閫佸畬鏁村悓姝ユ暟鎹?
        socket.on('full-sync-state', (data) => {
            if (role !== 'host') return;
            const { targetId, courseId, slideIndex, state } = data;
            if (targetId) {
                io.to(targetId).emit('full-sync-state', { courseId, slideIndex, state });
            } else {
                io.to('viewers').emit('full-sync-state', { courseId, slideIndex, state });
            }
        });

        // 瀛︾敓鎻愪氦浣滀笟 - 杞彂缁欐暀甯堢澶勭悊
        socket.on('student:submit', (data) => {
            if (role !== 'viewer') return;

            const submissionId = data && data.submissionId ? String(data.submissionId) : '';
            const courseId = data && data.courseId ? String(data.courseId) : currentCourseId || '';
            const content = data && data.content !== undefined ? data.content : null;
            const fileName = data && data.fileName ? String(data.fileName) : '';
            const mergeFile = data && typeof data.mergeFile === 'boolean' ? data.mergeFile : false;

            if (!submissionId || !courseId) {
                socket.emit('student:submit:result', {
                    submissionId,
                    success: false,
                    error: 'Invalid parameters'
                });
                return;
            }

            // 杞彂鍒版暀甯堢澶勭悊瀛樺偍
            io.to('hosts').emit('student:submit', {
                submissionId,
                courseId,
                clientIp,
                content,
                fileName,
                mergeFile,
                timestamp: Date.now()
            });

            console.log(`[student:submit] Forwarding to host: IP=${clientIp} courseId=${courseId} submissionId=${submissionId}`);
        });

        // 鏁欏笀绔‘璁ゅ凡鏀跺埌鎻愪氦 - 杞彂缁欏鐢熺
        socket.on('student:submit:ack', (data) => {
            if (role !== 'host') return;

            const submissionId = data && data.submissionId ? String(data.submissionId) : '';
            const success = data && typeof data.success === 'boolean' ? data.success : true;
            const error = data && data.error ? String(data.error) : '';

            // 杞彂纭缁欏鐢熺
            io.emit('student:submit:result', {
                submissionId,
                success,
                error
            });

            console.log(`[student:submit:ack] Forwarding to student: submissionId=${submissionId} success=${success}`);
        });

        // 鍚屾浜や簰锛圕ourseGlobalContext.syncInteraction锛?
        socket.on('interaction:sync', (data) => {
            if (role !== 'host' || !currentHostSettings.syncInteraction) return;
            // 琛ュ厖 courseId 鍜?slideIndex 淇℃伅
            const courseId = getCurrentCourseId();
            const slideIndex = getCurrentSlideIndex();
            io.to('viewers').emit('interaction:sync', {
                ...data,
                courseId,
                slideIndex
            });
        });

        // 鍚屾鍙橀噺锛坲seSyncVar锛?
        socket.on('sync-var', (data) => {
            console.log(`[sync-var] data=${JSON.stringify(data)} syncInteraction=${currentHostSettings.syncInteraction} role=${role}`);
            if (role !== 'host' || !currentHostSettings.syncInteraction) return;
            // 杞彂缁欐墍鏈夊鐢熺
            io.to('viewers').emit('sync-var', data);
        });

        // ========================================================
        // 鎶曠エ缁勪欢锛圴oteSlide锛?
        // ========================================================

        socket.on('vote:start', (data) => {
            if (role !== 'host') return;
            const voteId = String(data?.voteId || '').trim();
            const question = String(data?.question || '').trim();
            const options = Array.isArray(data?.options) ? data.options : [];
            const durationSec = Math.max(10, Math.min(300, Number(data?.durationSec || 60)));
            const anonymous = !!data?.anonymous;
            const courseId = getCurrentCourseId();
            const slideIndex = getCurrentSlideIndex();

            if (!courseId || !voteId || !question || options.length < 2) return;

            const normalizedOptions = options
                .filter(opt => opt && String(opt.id || '').trim() && String(opt.label || '').trim())
                .map(opt => ({ id: String(opt.id).trim(), label: String(opt.label).trim() }));

            if (normalizedOptions.length < 2) return;

            const key = getVoteKey(courseId, slideIndex, voteId);
            clearVoteSession(courseId, slideIndex, voteId);

            const now = Date.now();
            const session = {
                voteId,
                question,
                options: normalizedOptions,
                anonymous,
                courseId,
                slideIndex,
                startedAt: now,
                endsAt: now + durationSec * 1000,
                status: 'running',
                responses: new Map()
            };

            voteSessions.set(key, session);

            const timer = setTimeout(() => {
                const active = voteSessions.get(key);
                if (!active || active.status !== 'running') return;
                active.status = 'ended';
                const result = buildVoteResult(active);
                io.emit('vote:end', result);
                clearVoteSession(active.courseId, active.slideIndex, active.voteId);
            }, durationSec * 1000);

            voteSessionTimers.set(key, timer);

            io.emit('vote:start', {
                voteId,
                question,
                options: normalizedOptions,
                anonymous,
                courseId,
                slideIndex,
                durationSec,
                startedAt: session.startedAt,
                endsAt: session.endsAt
            });

            io.to('hosts').emit('vote:result', buildVoteResult(session));
        });

        socket.on('vote:submit', (data) => {
            if (role !== 'viewer') return;

            const voteId = String(data?.voteId || '').trim();
            const courseId = String(data?.courseId || '').trim();
            const slideIndex = Number(data?.slideIndex || 0);
            const optionId = String(data?.optionId || '').trim();
            const key = getVoteKey(courseId, slideIndex, voteId);
            const session = voteSessions.get(key);

            if (!session || session.status !== 'running' || Date.now() > session.endsAt) {
                socket.emit('vote:submit:ack', { success: false, voteId, error: 'vote session expired' });
                return;
            }

            if (!session.options.some(opt => opt.id === optionId)) {
                socket.emit('vote:submit:ack', { success: false, voteId, error: 'invalid option' });
                return;
            }

            if (session.responses.has(clientIp)) {
                socket.emit('vote:submit:ack', { success: false, voteId, error: 'already voted' });
                return;
            }

            session.responses.set(clientIp, optionId);
            const result = buildVoteResult(session);

            socket.emit('vote:submit:ack', { success: true, voteId });
            io.to('hosts').emit('vote:result', result);
            if (!session.anonymous) {
                io.to('viewers').emit('vote:result', result);
            }
        });

        socket.on('vote:end', (data) => {
            if (role !== 'host') return;

            const voteId = String(data?.voteId || '').trim();
            if (!voteId) return;

            const requestedCourseId = String(data?.courseId || getCurrentCourseId() || '').trim();
            const requestedSlideIndex = Number.isFinite(Number(data?.slideIndex))
                ? Number(data.slideIndex)
                : Number(getCurrentSlideIndex() || 0);

            let key = getVoteKey(requestedCourseId, requestedSlideIndex, voteId);
            let session = voteSessions.get(key);

            if (!session) {
                const found = findVoteSessionByCourseAndVoteId(requestedCourseId, voteId);
                if (found) {
                    key = found.key;
                    session = found.session;
                }
            }

            if (!session) return;

            session.status = 'ended';
            const result = buildVoteResult(session);
            io.emit('vote:end', result);
            clearVoteSession(session.courseId, session.slideIndex, session.voteId);
        });

        // ========================================================
        // 鏍囨敞鍚屾
        // ========================================================


        // 娣诲姞鏍囨敞娈碉紙鏃х増鏈紝鍏煎锛?
        socket.on('annotation-add', (data) => {
            if (role !== 'host' || !data || typeof data !== 'object') return;
            const { courseId, slideIndex, segment } = data;
            const key = getAnnoKey(courseId, slideIndex);
            const segments = annotationStore.get(key) || [];

            // 闄愬埗姣忓紶骞荤伅鐗囨渶澶?N 娈?
            if (segments.length >= config.annotationMaxSegmentsPerSlide) {
                segments.shift();
            }
            segments.push(segment);
            annotationStore.set(key, segments);

            // 骞挎挱缁欐墍鏈夊鎴风
            io.emit('annotation-add', { courseId, slideIndex, segment });
        });

        // 缁樺埗绾挎锛堝疄鏃讹級
        socket.on('annotation:segment', (data) => {
            if (role !== 'host') return;
            // 杞彂缁欐墍鏈夊鐢熺
            io.to('viewers').emit('annotation:segment', data);
        });

        // 瀹屾垚涓€绗?
        socket.on('annotation:stroke', (data) => {
            if (role !== 'host') return;
            // 瀛樺偍鍒版湇鍔″櫒
            const { courseId, slideIndex, tool, color, width, alpha, points } = data;
            const key = getAnnoKey(courseId, slideIndex);
            const segments = annotationStore.get(key) || [];

            // 闄愬埗姣忓紶骞荤伅鐗囨渶澶?N 娈?
            if (segments.length >= config.annotationMaxSegmentsPerSlide) {
                segments.shift();
            }
            segments.push({ tool, color, width, alpha, points });
            annotationStore.set(key, segments);

            // 骞挎挱缁欐墍鏈夊鐢熺
            io.to('viewers').emit('annotation:stroke', data);
        });

        // 娓呴櫎鏍囨敞
        socket.on('annotation:clear', (data) => {
            if (role !== 'host') return;
            const { courseId, slideIndex } = data;
            const key = getAnnoKey(courseId, slideIndex);
            annotationStore.delete(key);
            io.to('viewers').emit('annotation:clear', { courseId, slideIndex });
        });

        // 鑾峰彇鏍囨敞锛堝鐢熺璇锋眰锛?
        socket.on('annotation:get', (data) => {
            const { courseId, slideIndex } = data;
            const key = getAnnoKey(courseId, slideIndex);
            const segments = annotationStore.get(key) || [];
            socket.emit('annotation:state', { courseId, slideIndex, segments });
        });

        // 鍔犺浇鏍囨敞锛堟棫鐗堟湰锛屽吋瀹癸級
        socket.on('annotation-load', (data) => {
            const { courseId, slideIndex } = data;
            const key = getAnnoKey(courseId, slideIndex);
            const segments = annotationStore.get(key) || [];
            socket.emit('annotation-loaded', { courseId, slideIndex, segments });
        });

        // ========================================================
        // 瀛︾敓绔簨浠跺鐞?
        // ========================================================

        // 瀛︾敓鎿嶄綔鏃ュ織
        socket.on('student:power-control:client-ack', (data) => {
            if (role !== 'viewer') return;
            io.to('hosts').emit('student:power-control:client-ack', {
                ip: clientIp,
                requestId: data?.requestId || '',
                action: data?.action || '',
                accepted: !!data?.accepted,
                error: data?.error ? String(data.error) : ''
            });
        });
        socket.on('student-action', (data) => {
            if (role !== 'viewer') return;
            const { type, slide } = data;
            pushLog(type, clientIp, { slide });
        });

        // ========================================================
        // 鏂紑杩炴帴澶勭悊
        // ========================================================

        socket.on('disconnect', () => {
            console.log(`[disconnect] IP=${clientIp} role=${role}`);

            if (role === 'viewer') {
                const count = studentIPs.get(clientIp) || 0;
                if (count <= 1) {
                    studentIPs.delete(clientIp);
                    emitStudentLogEntry(io, 'leave', clientIp);
                    clearStudentScreenshot(io, clientIp);
                    io.to('hosts').emit('student-status', { count: studentIPs.size, action: 'leave', ip: clientIp });
                } else {
                    studentIPs.set(clientIp, count - 1);
                }
            }
        });
    });

    return io;
}

// 瀵煎嚭瀛︾敓IP缁熻鍜屾棩蹇楋紝渚汚PI浣跨敤
function getStudentCount() {
    return studentIPs.size;
}

function getStudentLog() {
    return studentLog;
}

function getStudentIPs() {
    return studentIPs;
}

module.exports = {
    resolveConnectionIdentity,
    setupSocketHandlers,
    getStudentCount,
    getStudentLog,
    getStudentIPs,
    currentHostSettings
};



