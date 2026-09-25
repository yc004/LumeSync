// @lumesync/teacher-platform 类型声明。
// 实现是 index.js（CommonJS）+ index.mjs（ESM 包装），这里是两端共用的类型面。

export type PlatformRisk = 'read' | 'write' | 'system';
export type PlatformErrorCode =
    | 'platform_not_implemented'
    | 'platform_invalid_argument'
    | 'platform_user_canceled'
    | 'platform_unavailable'
    | 'platform_failed';

export interface PlatformSuccess<T = unknown> {
    ok: true;
    value: T;
    code: null;
    message: null;
}
export interface PlatformFailure {
    ok: false;
    value: null;
    code: PlatformErrorCode | string;
    message: string;
    method?: string;
}
export type PlatformResult<T = unknown> = PlatformSuccess<T> | PlatformFailure;

export interface PlatformMethodSpec {
    summary: string;
    risk: PlatformRisk;
    /** 对应的原生桥动作名（与 @lumesync/native-contract 的动作表对齐）。 */
    nativeAction?: string;
}

export interface PlatformCapability extends PlatformMethodSpec {
    supported: boolean;
    kind: 'request' | 'event';
}

export const PLATFORM_REQUESTS: Record<string, PlatformMethodSpec>;
export const PLATFORM_EVENTS: Record<string, PlatformMethodSpec>;
export const PLATFORM_METHODS: string[];
export const PLATFORM_ERROR_CODES: {
    NOT_IMPLEMENTED: 'platform_not_implemented';
    INVALID_ARGUMENT: 'platform_invalid_argument';
    USER_CANCELED: 'platform_user_canceled';
    UNAVAILABLE: 'platform_unavailable';
    FAILED: 'platform_failed';
};
export function ok<T>(value?: T): PlatformSuccess<T | null>;
export function fail(code: string, message?: string, extra?: Record<string, unknown>): PlatformFailure;
export function runPlatformCall(
    fn: (...args: unknown[]) => unknown,
    args: unknown[],
    options?: { allowEmpty?: boolean }
): Promise<PlatformResult>;

export interface TeacherConfig {
    teacherIp: string;
    port: number;
    adminPasswordHash?: string;
    clientId?: string;
    sessionToken?: string;
    sessionExpiresAt?: string;
    sessionServerTime?: string;
}
export interface TeacherWindowSettings {
    forceFullscreen: boolean;
    syncFollow: boolean;
    allowInteract: boolean;
    syncInteraction: boolean;
    podiumAtTop: boolean;
    renderScale: number;
    uiScale: number;
    alertJoin: boolean;
    alertLeave: boolean;
    alertFullscreenEdit?: boolean;
    monitorEnabled: boolean;
    monitorIntervalSec: number;
}
export interface TeacherSession {
    role: 'host';
    clientId: string;
    token: string;
    expiresAt?: string;
    serverTime?: string;
}
export interface ImportCourseResult {
    success: boolean;
    imported?: string[];
    skipped?: string[];
    canceled?: boolean;
}
export interface ExportResult {
    success: boolean;
    filePath?: string;
    filename?: string;
    canceled?: boolean;
    error?: string;
}

/** 教师端平台能力接口：业务 UI 只依赖这一层。 */
export interface TeacherPlatform {
    readonly name: string;
    // 请求
    getConfig(): Promise<PlatformResult<TeacherConfig>>;
    saveConfig(config: Partial<TeacherConfig> & { _quit?: boolean }): Promise<PlatformResult<boolean>>;
    verifyPassword(password: string): Promise<PlatformResult<{ ok: boolean }>>;
    getSettings(): Promise<PlatformResult<TeacherWindowSettings>>;
    saveSettings(settings: Partial<TeacherWindowSettings>): Promise<PlatformResult<boolean>>;
    openCourse(): Promise<PlatformResult<ImportCourseResult>>;
    saveExport(payload?: { courseFile?: string; format?: 'pdf' | 'lume'; title?: string }): Promise<PlatformResult<ExportResult>>;
    saveGeneratedPdf(payload?: { title?: string; filename?: string; dataBase64?: string }): Promise<PlatformResult<ExportResult>>;
    selectSubmissionDirectory(): Promise<PlatformResult<string>>;
    getSubmissionDirectory(): Promise<PlatformResult<string>>;
    openLogs(): Promise<PlatformResult<string>>;
    getLogDirectory(): Promise<PlatformResult<string>>;
    getSession(): Promise<PlatformResult<TeacherSession>>;
    bootstrapSession(): Promise<PlatformResult<TeacherSession>>;
    clearSession(): Promise<PlatformResult<boolean>>;
    getWindowState(): Promise<PlatformResult<{ maximized?: boolean; fullscreen?: boolean }>>;
    // 单向事件
    classStarted(options?: { forceFullscreen?: boolean }): PlatformResult<boolean>;
    classEnded(): PlatformResult<boolean>;
    setFullscreen(enable: boolean): PlatformResult<boolean>;
    minimizeWindow(): PlatformResult<boolean>;
    maximizeWindow(): PlatformResult<boolean>;
    closeWindow(): PlatformResult<boolean>;
    openWindow(url: string, options?: { mode?: string; width?: number; height?: number; title?: string }): PlatformResult<boolean>;
    beginWindowDrag(payload?: unknown): PlatformResult<boolean>;
    updateWindowDrag(payload?: unknown): PlatformResult<boolean>;
    endWindowDrag(): PlatformResult<boolean>;
    toggleDevTools(): PlatformResult<boolean>;
    capabilities(): Record<string, PlatformCapability>;
}

export interface TeacherHostBridgeLike {
    [key: string]: ((...args: any[]) => any) | unknown;
}

export const ELECTRON_CHANNEL_PREFIX: string;

/** 现有 Windows C++/WebView2 壳的过渡适配器。 */
export function createWebView2Adapter(
    bridge: TeacherHostBridgeLike,
    options?: { treatNullAsCanceled?: boolean }
): TeacherPlatform & { raw: TeacherHostBridgeLike };

/** 目标 Electron 宿主：主进程实现 `lumesync:platform:<method>` 通道。 */
export function createElectronAdapter(options: {
    invoke(channel: string, payload: unknown): Promise<unknown>;
    send(channel: string, payload: unknown): void;
    channelPrefix?: string;
}): TeacherPlatform;

/** 测试与降级：全部返回 platform_not_implemented。 */
export function createNullAdapter(name?: string): TeacherPlatform;

export function validateAdapter(adapter: unknown): {
    ok: boolean;
    missing: string[];
    unsupported: string[];
    capabilities: Record<string, PlatformCapability> | null;
};
export function withCapabilities<T extends object>(
    adapter: T,
    supports: (method: string) => boolean
): T & { capabilities(): Record<string, PlatformCapability> };
