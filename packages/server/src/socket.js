// ========================================================
// Socket.io 实时通信
// ========================================================

const { config } = require('./config');
const { getStudentFromClassroomLayout } = require('./submissions');

let studentIPs = new Map(); // IP -> socket数量，同一IP只计一个学生

// 教师端当前设置（服务端缓存，用于新连接学生同步）
let currentHostSettings = {
    forceFullscreen: false,
    syncFollow: true,
    syncInteraction: false,  // 默认关闭教师交互同步
    allowInteract: true,
    podiumAtTop: true,
    renderScale: 0.96,
    uiScale: 1.0,
    alertJoin: true,
    alertLeave: true,
    alertFullscreenExit: true,
    alertTabHidden: true,
};

// 标注数据（内存缓存）
const annotationStore = new Map();
const getAnnoKey = (courseId, slideIndex) => `${String(courseId || '')}:${Number(slideIndex || 0)}`;

// 学生操作日志（内存，最多保留 500 条）
const studentLog = [];

// 投票会话（内存）
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
}

function setupSocketHandlers(io, {
    setCurrentCourseId,
    setCurrentSlideIndex,
    getCurrentCourseId,
    getCurrentSlideIndex,
    getCourseCatalog
}) {
    io.on('connection', (socket) => {
        // 统一转换为 IPv4，去掉 IPv6 映射前缀 ::ffff:
        const rawIp = socket.handshake.address;
        const clientIp = rawIp.startsWith('::ffff:') ? rawIp.slice(7) : rawIp;
        const isLocalhost = clientIp === '127.0.0.1' || clientIp === '::1';

        const role = isLocalhost ? 'host' : 'viewer';
        console.log(`[conn] IP=${clientIp} role=${role}`);

        // 发送角色信息和当前课程状态给当前客户端
        socket.emit('role-assigned', {
            role: role,
            clientIp: clientIp,
            currentCourseId: getCurrentCourseId(),
            currentSlideIndex: getCurrentSlideIndex(),
            hostSettings: currentHostSettings,
            courseCatalog: getCourseCatalog()
        });

        // 加入房间
        if (role === 'host') {
            socket.join('hosts');
            // 教师端连接时发送初始学生数量
            socket.emit('student-status', { count: studentIPs.size, action: 'init' });
        } else {
            socket.join('viewers');
            // 统计在线学生
            const prev = studentIPs.get(clientIp) || 0;
            studentIPs.set(clientIp, prev + 1);
            // 只有该 IP 的第一个连接才触发 join 通知
            if (prev === 0) {
                pushLog('join', clientIp);
                io.to('hosts').emit('student-status', { count: studentIPs.size, action: 'join', ip: clientIp });
            }
        }

        // 获取学生数量（教师端主动查询）
        socket.on('get-student-count', () => {
            if (role !== 'host') return;
            socket.emit('student-status', { count: studentIPs.size, action: 'init' });
        });

        // ========================================================
        // 教师端事件处理
        // ========================================================

        // 选择课程
        socket.on('select-course', (data) => {
            if (role !== 'host') return;
            const { courseId } = data;
            console.log(`[select-course] courseId=${courseId}`);
            setCurrentCourseId(courseId);
            setCurrentSlideIndex(0);
            io.emit('course-changed', { courseId, slideIndex: 0, hostSettings: currentHostSettings });
        });

        // 切换幻灯片
        socket.on('sync-slide', (data) => {
            if (role !== 'host') return;
            const { slideIndex } = data;
            console.log(`[sync-slide] slideIndex=${slideIndex}`);
            setCurrentSlideIndex(slideIndex);
            // 发送给所有学生端（学生端监听 sync-slide）
            io.to('viewers').emit('sync-slide', { slideIndex });
        });

        // 同步设置（前端发送的事件名是 host-settings）
        socket.on('update-settings', (data) => {
            if (role !== 'host') return;
            currentHostSettings = { ...currentHostSettings, ...data };
            // 通知所有学生更新设置
            io.to('viewers').emit('host-settings', currentHostSettings);
        });

        socket.on('host-settings', (data) => {
            if (role !== 'host') return;
            const prevSyncFollow = currentHostSettings.syncFollow;
            currentHostSettings = { ...currentHostSettings, ...data };
            // 通知所有学生更新设置，同时广播给其他教师端
            io.emit('host-settings', currentHostSettings);
            // 如果开启了学生跟随翻页，立即同步当前页面
            if (!prevSyncFollow && currentHostSettings.syncFollow) {
                const currentSlide = getCurrentSlideIndex();
                if (currentSlide !== undefined && currentSlide !== null) {
                    io.to('viewers').emit('sync-slide', { slideIndex: currentSlide });
                }
            }
        });

        // 刷新课程列表
        socket.on('refresh-courses', () => {
            if (role !== 'host') return;
            const { scanCourses } = require('./courses');
            const catalog = scanCourses();
            // 广播课程目录更新给所有教师端
            io.to('hosts').emit('course-catalog-updated', { courses: catalog });
        });

        // 结束课程（返回课程选择界面）
        socket.on('end-course', () => {
            if (role !== 'host') return;
            const courseId = getCurrentCourseId();
            setCurrentCourseId(null);
            setCurrentSlideIndex(0);
            annotationStore.clear();
            clearVotesByCourse(courseId);
            console.log(`[end-course] courseId=${courseId}`);
            io.emit('course-ended');
        });

        // 注册课件依赖映射
        socket.on('register-dependencies', (deps) => {
            if (!Array.isArray(deps)) return;
            deps.forEach(({ filename, publicSrc }) => {
                if (filename && publicSrc) {
                    console.log(`[register-dependencies] ${filename} -> ${publicSrc}`);
                    const { dependencyMap } = require('./proxy');
                    dependencyMap[filename] = publicSrc;
                }
            });
        });

        // 学生端上报异常行为
        socket.on('student-alert', (data) => {
            if (role !== 'viewer') return;
            const { type } = data;
            pushLog(type, clientIp, {});
            io.to('hosts').emit('student-alert', { ip: clientIp, type });
        });

        // 教师端推送管理员密码
        socket.on('set-admin-password', (data) => {
            if (role !== 'host' || !data?.hash) return;
            console.log('[set-admin-password] password update pushed to students');
            io.to('viewers').emit('set-admin-password', { hash: data.hash });
        });

        // 学生端请求同步状态
        socket.on('request-sync-state', (data) => {
            if (role !== 'viewer') return;
            const { courseId, slideIndex } = data;
            console.log(`[request-sync-state] courseId=${courseId} slideIndex=${slideIndex} ip=${clientIp}`);
            io.to('hosts').emit('request-sync-state', { courseId, slideIndex, requesterId: socket.id });
        });

        // 教师端发送完整同步数据
        socket.on('full-sync-state', (data) => {
            if (role !== 'host') return;
            const { targetId, courseId, slideIndex, state } = data;
            if (targetId) {
                io.to(targetId).emit('full-sync-state', { courseId, slideIndex, state });
            } else {
                io.to('viewers').emit('full-sync-state', { courseId, slideIndex, state });
            }
        });

        // 学生提交作业 - 转发给教师端处理
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

            // 转发到教师端处理存储
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

        // 教师端确认已收到提交 - 转发给学生端
        socket.on('student:submit:ack', (data) => {
            if (role !== 'host') return;

            const submissionId = data && data.submissionId ? String(data.submissionId) : '';
            const success = data && typeof data.success === 'boolean' ? data.success : true;
            const error = data && data.error ? String(data.error) : '';

            // 转发确认给学生端
            io.emit('student:submit:result', {
                submissionId,
                success,
                error
            });

            console.log(`[student:submit:ack] Forwarding to student: submissionId=${submissionId} success=${success}`);
        });

        // 同步交互（CourseGlobalContext.syncInteraction）
        socket.on('interaction:sync', (data) => {
            if (role !== 'host' || !currentHostSettings.syncInteraction) return;
            // 补充 courseId 和 slideIndex 信息
            const courseId = getCurrentCourseId();
            const slideIndex = getCurrentSlideIndex();
            io.to('viewers').emit('interaction:sync', {
                ...data,
                courseId,
                slideIndex
            });
        });

        // 同步变量（useSyncVar）
        socket.on('sync-var', (data) => {
            console.log(`[sync-var] data=${JSON.stringify(data)} syncInteraction=${currentHostSettings.syncInteraction} role=${role}`);
            if (role !== 'host' || !currentHostSettings.syncInteraction) return;
            // 转发给所有学生端
            io.to('viewers').emit('sync-var', data);
        });

        // ========================================================
        // 投票组件（VoteSlide）
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
                socket.emit('vote:submit:ack', { success: false, voteId, error: '投票已结束' });
                return;
            }

            if (!session.options.some(opt => opt.id === optionId)) {
                socket.emit('vote:submit:ack', { success: false, voteId, error: '无效选项' });
                return;
            }

            if (session.responses.has(clientIp)) {
                socket.emit('vote:submit:ack', { success: false, voteId, error: '你已提交过投票' });
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
        // 标注同步
        // ========================================================


        // 添加标注段（旧版本，兼容）
        socket.on('annotation-add', (data) => {
            const { courseId, slideIndex, segment } = data;
            const key = getAnnoKey(courseId, slideIndex);
            const segments = annotationStore.get(key) || [];

            // 限制每张幻灯片最多 N 段
            if (segments.length >= config.annotationMaxSegmentsPerSlide) {
                segments.shift();
            }
            segments.push(segment);
            annotationStore.set(key, segments);

            // 广播给所有客户端
            io.emit('annotation-add', { courseId, slideIndex, segment });
        });

        // 绘制线段（实时）
        socket.on('annotation:segment', (data) => {
            if (role !== 'host') return;
            // 转发给所有学生端
            io.to('viewers').emit('annotation:segment', data);
        });

        // 完成一笔
        socket.on('annotation:stroke', (data) => {
            if (role !== 'host') return;
            // 存储到服务器
            const { courseId, slideIndex, tool, color, width, alpha, points } = data;
            const key = getAnnoKey(courseId, slideIndex);
            const segments = annotationStore.get(key) || [];

            // 限制每张幻灯片最多 N 段
            if (segments.length >= config.annotationMaxSegmentsPerSlide) {
                segments.shift();
            }
            segments.push({ tool, color, width, alpha, points });
            annotationStore.set(key, segments);

            // 广播给所有学生端
            io.to('viewers').emit('annotation:stroke', data);
        });

        // 清除标注
        socket.on('annotation:clear', (data) => {
            if (role !== 'host') return;
            const { courseId, slideIndex } = data;
            const key = getAnnoKey(courseId, slideIndex);
            annotationStore.delete(key);
            io.to('viewers').emit('annotation:clear', { courseId, slideIndex });
        });

        // 获取标注（学生端请求）
        socket.on('annotation:get', (data) => {
            const { courseId, slideIndex } = data;
            const key = getAnnoKey(courseId, slideIndex);
            const segments = annotationStore.get(key) || [];
            socket.emit('annotation:state', { courseId, slideIndex, segments });
        });

        // 加载标注（旧版本，兼容）
        socket.on('annotation-load', (data) => {
            const { courseId, slideIndex } = data;
            const key = getAnnoKey(courseId, slideIndex);
            const segments = annotationStore.get(key) || [];
            socket.emit('annotation-loaded', { courseId, slideIndex, segments });
        });

        // ========================================================
        // 学生端事件处理
        // ========================================================

        // 学生操作日志
        socket.on('student-action', (data) => {
            if (role !== 'viewer') return;
            const { type, slide } = data;
            pushLog(type, clientIp, { slide });
        });

        // ========================================================
        // 断开连接处理
        // ========================================================

        socket.on('disconnect', () => {
            console.log(`[disconnect] IP=${clientIp} role=${role}`);

            if (role === 'viewer') {
                const count = studentIPs.get(clientIp) || 0;
                if (count <= 1) {
                    studentIPs.delete(clientIp);
                    pushLog('leave', clientIp);
                    io.to('hosts').emit('student-status', { count: studentIPs.size, action: 'leave', ip: clientIp });
                } else {
                    studentIPs.set(clientIp, count - 1);
                }
            }
        });
    });

    return io;
}

// 导出学生IP统计和日志，供API使用
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
    setupSocketHandlers,
    getStudentCount,
    getStudentLog,
    getStudentIPs,
    currentHostSettings
};
