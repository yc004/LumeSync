// ========================================================
// Socket.io 实时通信
// ========================================================

const { config } = require('./config');
const { getStudentFromClassroomLayout } = require('./submissions');

let studentIPs = new Map(); // IP -> socket数量，同一IP只计一个学生

// 教师端当前设置（服务端缓存，用于新连接学生同步）
let currentHostSettings = {
    forceFullscreen: true,
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
        } else {
            socket.join('viewers');
            // 学生连接时发送日志给所有教师
            pushLog('join', clientIp);
        }

        // 统计在线学生
        if (role === 'viewer') {
            studentIPs.set(clientIp, (studentIPs.get(clientIp) || 0) + 1);
            io.to('hosts').emit('student-count', studentIPs.size);
        }

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
            io.emit('course-changed', { courseId, slideIndex: 0 });
        });

        // 切换幻灯片
        socket.on('slide-change', (data) => {
            if (role !== 'host') return;
            const { slideIndex } = data;
            console.log(`[slide-change] slideIndex=${slideIndex}`);
            setCurrentSlideIndex(slideIndex);
            io.emit('slide-changed', { slideIndex });
        });

        // 同步设置
        socket.on('update-settings', (data) => {
            if (role !== 'host') return;
            currentHostSettings = { ...currentHostSettings, ...data };
            // 通知所有学生更新设置
            io.to('viewers').emit('settings-updated', currentHostSettings);
        });

        // 刷新课程列表
        socket.on('refresh-courses', () => {
            if (role !== 'host') return;
            const { scanCourses } = require('./courses');
            const catalog = scanCourses();
            // 广播课程目录更新给所有教师端
            io.to('hosts').emit('course-catalog-updated', { courses: catalog });
        });

        // 同步交互
        socket.on('sync-interaction', (data) => {
            if (role !== 'host' || !currentHostSettings.syncInteraction) return;
            io.to('viewers').emit('sync-interaction', data);
        });

        // ========================================================
        // 标注同步
        // ========================================================

        // 添加标注段
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

        // 清除标注
        socket.on('annotation-clear', (data) => {
            const { courseId, slideIndex } = data;
            const key = getAnnoKey(courseId, slideIndex);
            annotationStore.delete(key);
            io.emit('annotation-clear', { courseId, slideIndex });
        });

        // 加载标注
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
                } else {
                    studentIPs.set(clientIp, count - 1);
                }
                io.to('hosts').emit('student-count', studentIPs.size);
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
