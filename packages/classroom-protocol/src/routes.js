// HTTP 路由授权表。
//
// 取代散落在路由模块里的正则猜测：每条 API 路由声明自己的访问级别，
// 中间件只做一次查表。教师服务当前的挂载点是 /api 与 /api/teacher，
// 因此这里的路径相对 router 根（例如 /courses、/submissions/:courseId）。
//
// access 取值：
//   public  无需凭证（健康检查、课程目录、课件静态资源等读取接口）
//   host    需要 host bearer（教师本机会话）

const ACCESS_PUBLIC = 'public';
const ACCESS_HOST = 'host';
// 会话引导：自身有独立的授权规则（host 分支仅限本机 + 本机凭证，
// viewer 分支签发短期凭证）。apiRouter 必须放行，否则会挡住 app 级处理器。
const ACCESS_BOOTSTRAP = 'bootstrap';

// 未在表中显式声明时的兜底规则：写请求一律需要 host。
const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

const API_ROUTES = [
    { id: 'health', methods: ['GET'], pattern: /^\/health$/, access: ACCESS_PUBLIC },
    { id: 'protocol', methods: ['GET'], pattern: /^\/protocol$/, access: ACCESS_PUBLIC, note: '协议版本与事件清单' },
    {
        id: 'session.bootstrap',
        methods: ['POST'],
        pattern: /^\/session\/bootstrap$/,
        access: ACCESS_BOOTSTRAP,
        note: '由 server/index.js 处理：host 分支仅限本机 + X-LumeSync-Host-Token，viewer 分支签发短期凭证'
    },
    { id: 'storage-usage', methods: ['GET'], pattern: /^\/storage-usage$/, access: ACCESS_HOST, note: '暴露本机磁盘用量' },
    { id: 'courses.list', methods: ['GET'], pattern: /^\/courses$/, access: ACCESS_PUBLIC },
    { id: 'components-manifest', methods: ['GET'], pattern: /^\/components-manifest$/, access: ACCESS_PUBLIC },
    { id: 'course-status', methods: ['GET'], pattern: /^\/course-status$/, access: ACCESS_PUBLIC },
    { id: 'courses.refresh', methods: ['POST'], pattern: /^\/refresh-courses$/, access: ACCESS_HOST },
    { id: 'courses.delete', methods: ['DELETE'], pattern: /^\/delete-course$/, access: ACCESS_HOST },
    { id: 'courses.export', methods: ['GET'], pattern: /^\/export-course\/[^/]+$/, access: ACCESS_HOST },
    { id: 'folders.create', methods: ['POST'], pattern: /^\/course-folders$/, access: ACCESS_HOST },
    { id: 'folders.delete', methods: ['DELETE'], pattern: /^\/course-folders\/[^/]+$/, access: ACCESS_HOST },
    { id: 'folders.move', methods: ['PUT'], pattern: /^\/course-folders\/[^/]+\/move$/, access: ACCESS_HOST },
    { id: 'folders.rename', methods: ['PUT'], pattern: /^\/course-folders\/[^/]+$/, access: ACCESS_HOST },
    { id: 'folders.move-course', methods: ['PUT'], pattern: /^\/course-folders\/[^/]+\/courses\/[^/]+$/, access: ACCESS_HOST },
    { id: 'layout.get', methods: ['GET'], pattern: /^\/classroom-layout$/, access: ACCESS_HOST, note: '含学生设备与座位映射' },
    { id: 'layout.save', methods: ['POST'], pattern: /^\/save-classroom-layout$/, access: ACCESS_HOST },
    { id: 'submissions.save', methods: ['POST'], pattern: /^\/save-submission$/, access: ACCESS_HOST },
    { id: 'submissions.config.get', methods: ['GET'], pattern: /^\/submission-config$/, access: ACCESS_HOST },
    { id: 'submissions.config.set', methods: ['POST'], pattern: /^\/submission-config$/, access: ACCESS_HOST },
    { id: 'submissions.list', methods: ['GET'], pattern: /^\/submissions\/[^/]+$/, access: ACCESS_HOST },
    { id: 'submissions.file', methods: ['GET'], pattern: /^\/submissions\/[^/]+\/file\/.+$/, access: ACCESS_HOST },
    { id: 'submissions.batch', methods: ['POST'], pattern: /^\/submissions\/[^/]+\/download-batch$/, access: ACCESS_HOST },
    { id: 'course-guide', methods: ['GET'], pattern: /^\/course-guide$/, access: ACCESS_PUBLIC },
    { id: 'download-skill', methods: ['GET'], pattern: /^\/download-skill$/, access: ACCESS_PUBLIC, note: '待复核：读取服务端指定文件' }
];

// 直接挂在 app 上、不经过 apiRouter 的路径（用于文档与测试的一致性检查）。
const APP_ROUTES = [
    { id: 'students', methods: ['GET'], path: '/api/students', access: ACCESS_HOST },
    { id: 'student-log', methods: ['GET'], path: '/api/student-log', access: ACCESS_HOST },
    { id: 'session.bootstrap', methods: ['POST'], path: '/api/session/bootstrap', access: 'bootstrap', note: 'host 分支仅限本机 + X-LumeSync-Host-Token；viewer 分支公开发放短期凭证' }
];

/**
 * 归一请求路径用于查表。
 *
 * Express 默认大小写不敏感、且非严格尾斜杠（`/submissions/x/` 与
 * `/submissions/x` 命中同一处理器）。路由表必须同样宽松，否则
 * `/api/SUBMISSIONS/x` 会落到"读请求 = public"的兜底，绕过 host bearer。
 */
function normalizeRoutePath(path) {
    const raw = String(path || '');
    const withoutTrailingSlash = raw.length > 1 ? raw.replace(/\/+$/, '') : raw;
    return withoutTrailingSlash.toLowerCase();
}

/** Express 把 HEAD 交给对应的 GET 处理器，因此查表时按 GET 处理。 */
function normalizeRouteMethod(route, method) {
    const upper = String(method || 'GET').toUpperCase();
    if (upper === 'HEAD' && !route.methods.includes('HEAD')) return 'GET';
    return upper;
}

function matches(route, method, path) {
    const upperMethod = normalizeRouteMethod(route, method);
    if (!route.methods.includes(upperMethod)) return false;
    return route.pattern.test(normalizeRoutePath(path));
}

/**
 * 解析 API 路由（相对 router 根）的访问级别。
 * 未声明的方法只有读请求（GET/HEAD）按 public 处理，其余一律按 host 兜底。
 */
function resolveApiRoute(method, path) {
    for (const route of API_ROUTES) {
        if (matches(route, method, path)) {
            return { id: route.id, access: route.access, declared: true, note: route.note || '' };
        }
    }
    const upperMethod = String(method || 'GET').toUpperCase();
    const isRead = upperMethod === 'GET' || upperMethod === 'HEAD';
    const access = isRead ? ACCESS_PUBLIC : ACCESS_HOST;
    return {
        id: 'undeclared',
        access,
        declared: false,
        note: isRead ? '未声明的读请求按 public 兜底' : '未声明的非读请求按 host 兜底'
    };
}

function requiresHostForApiRoute(method, path) {
    return resolveApiRoute(method, path).access === ACCESS_HOST;
}

function resolveAppRoute(method, path) {
    const upperMethod = String(method || 'GET').toUpperCase();
    for (const route of APP_ROUTES) {
        if (route.methods.includes(upperMethod) && normalizeRoutePath(route.path) === normalizeRoutePath(path)) {
            return { id: route.id, access: route.access, declared: true, note: route.note || '' };
        }
    }
    return { id: 'undeclared', access: 'public', declared: false, note: '' };
}

module.exports = {
    ACCESS_PUBLIC,
    ACCESS_HOST,
    ACCESS_BOOTSTRAP,
    WRITE_METHODS,
    API_ROUTES,
    APP_ROUTES,
    normalizeRoutePath,
    resolveApiRoute,
    requiresHostForApiRoute,
    resolveAppRoute
};
