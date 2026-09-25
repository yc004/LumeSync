// @lumesync/native-contract 类型声明。
// 教师端与学生端的 shared/protocol/*.ts 从这里再导出类型，避免两端各自维护。

export const BRIDGE_PROTOCOL_VERSION: number;
export const RPC_TIMEOUT_MS: number;
export const MAX_BRIDGE_PAYLOAD_BYTES: number;
export const MAX_ACTION_LENGTH: number;

export const MESSAGE_KINDS: {
    RPC: 'rpc';
    EVENT: 'event';
    RPC_RESULT: 'rpc-result';
    WINDOW_MAXIMIZED: 'window-maximized';
    WINDOW_UNMAXIMIZED: 'window-unmaximized';
};
export type BridgeMessageKind = 'rpc' | 'event' | 'rpc-result' | 'window-maximized' | 'window-unmaximized';

export interface BridgeRpcMessage {
    kind: 'rpc';
    id: string;
    action: string;
    version?: number;
    payload: unknown;
}
export interface BridgeEventMessage {
    kind: 'event';
    action: string;
    version?: number;
    payload: unknown;
}
export interface BridgeRpcResult {
    kind: 'rpc-result';
    id: string;
    version?: number;
    ok: boolean;
    payload: unknown;
    error?: string;
}
export type BridgeMessage = BridgeRpcMessage | BridgeEventMessage | BridgeRpcResult;

export interface BridgeIssue {
    path: string;
    code: string;
    message: string;
}
export type BridgeValidation<T> =
    | { ok: true; code: null; value: T; errors: BridgeIssue[] }
    | { ok: false; code: string; errors: BridgeIssue[] };

export const REQUEST_SCHEMA: unknown;
export const RESULT_SCHEMA: unknown;

export function createRpcRequest(input: { action: string; payload?: unknown; id?: string; version?: number }): BridgeRpcMessage;
export function createEventMessage(input: { action: string; payload?: unknown; version?: number }): BridgeEventMessage;
export function createRpcResult(input: { id: string; ok?: boolean; payload?: unknown; error?: string; version?: number }): BridgeRpcResult;
export function validateBridgeRequest(
    message: unknown,
    options?: { maxPayloadBytes?: number }
): BridgeValidation<BridgeRpcMessage | BridgeEventMessage>;
export function validateRpcResult(message: unknown): BridgeValidation<BridgeRpcResult>;
export function isRpcResult(message: unknown): boolean;
export function isWindowStateMessage(message: unknown): boolean;
export function payloadByteLength(payload: unknown): number;
export function formatErrors(errors: BridgeIssue[]): string;

// ------------------------------------------------------------ 能力清单
export type NativeActionRisk = 'read' | 'write' | 'system';
export type NativeActionTransport = 'native' | 'local' | 'local-stub';
export interface NativeActionSpec {
    kind: 'rpc' | 'event';
    transport: NativeActionTransport;
    implemented: boolean;
    risk: NativeActionRisk;
    summary: string;
    /** 该动作是否由 C++ 壳分派（用于与 native/shell/src/main.cpp 对照）。 */
    nativeDispatch: boolean;
}
export const RISK: { READ: 'read'; WRITE: 'write'; SYSTEM: 'system' };
export const HOST_ACTIONS: Record<string, NativeActionSpec>;
export const VIEWER_ACTIONS: Record<string, NativeActionSpec>;
export const ACTIONS_BY_ROLE: { host: Record<string, NativeActionSpec>; viewer: Record<string, NativeActionSpec> };
export const NATIVE_TO_PAGE_KINDS: string[];
export function getActionSpec(role: 'host' | 'viewer', action: string): NativeActionSpec | null;
export function authorizeAction(
    role: 'host' | 'viewer',
    action: string,
    kind?: 'rpc' | 'event'
): { ok: true; code: null; spec: NativeActionSpec } | { ok: false; code: string; message: string };
export function listActions(role: 'host' | 'viewer', options?: { includeUnimplemented?: boolean; kind?: 'rpc' | 'event' }): string[];

// ------------------------------------------------------------ 教师端桥
export interface TeacherConfig {
    teacherIp: string;
    port: number;
    adminPasswordHash?: string;
    clientId?: string;
    sessionToken?: string;
    sessionExpiresAt?: string;
    sessionServerTime?: string;
}

export interface VerifyPasswordResult {
    ok: boolean;
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
    alertFullscreenExit: boolean;
    alertTabHidden: boolean;
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

export interface TeacherHostApi {
    classStarted(options?: { forceFullscreen?: boolean }): void;
    classEnded(): void;
    setFullscreen(enable: boolean): void;
    getConfig(): Promise<TeacherConfig>;
    saveConfig(config: Partial<TeacherConfig> & { _quit?: boolean }): Promise<boolean>;
    verifyPassword(password: string): Promise<VerifyPasswordResult>;
    getRole(): Promise<'host'>;
    getSession(): Promise<TeacherSession | null>;
    bootstrapSession(): Promise<TeacherSession | null>;
    getSettings(): Promise<TeacherWindowSettings | null>;
    saveSettings(settings: Partial<TeacherWindowSettings>): Promise<boolean>;
    importCourse(): Promise<{ success: boolean; imported?: string[]; skipped?: string[]; canceled?: boolean } | null>;
    exportCourse(payload?: { courseFile?: string; format?: 'pdf' | 'lume'; title?: string }): Promise<{ success: boolean; filePath?: string; filename?: string; canceled?: boolean; error?: string } | null>;
    saveGeneratedPdf(payload?: { title?: string; filename?: string; dataBase64?: string }): Promise<{ success: boolean; filePath?: string; filename?: string; canceled?: boolean; error?: string } | null>;
    openLogDir(): Promise<string | null>;
    getLogDir(): Promise<string | null>;
    selectSubmissionDir(): Promise<string | null>;
    toggleDevTools(): void;
    minimizeWindow(): void;
    maximizeWindow(): void;
    closeWindow(): void;
    openWindow?(url: string, options?: { mode?: string; width?: number; height?: number; title?: string }): void;
    beginWindowDrag?(payload?: unknown): void;
    updateWindowDrag?(payload?: unknown): void;
    endWindowDrag?(): void;
    onWindowMaximized?(callback: () => void): void;
    onWindowUnmaximized?(callback: () => void): void;
    removeWindowMaximizedListener?(callback: () => void): void;
    removeWindowUnmaximizedListener?(callback: () => void): void;
}

// ------------------------------------------------------------ 学生端桥
export interface StudentConfig {
    teacherIp: string;
    port: number;
    adminPasswordHash?: string;
    forceFullscreen: boolean;
    autoStart: boolean;
    guardEnabled: boolean;
    clientId?: string;
    sessionToken?: string;
    sessionExpiresAt?: string;
    sessionServerTime?: string;
}

export interface SaveAutostartResult {
    success: boolean;
    error?: string;
}

export interface PowerControlResult {
    success: boolean;
    error?: string;
}

export interface StudentDeviceInfo {
    mac?: string;
    deviceName?: string;
    clientId?: string;
}

export interface ClassStartOptions {
    forceFullscreen?: boolean;
}

export interface StudentSession {
    role: 'viewer';
    clientId: string;
    token: string;
    expiresAt?: string;
    serverTime?: string;
}

export interface StudentHostApi {
    classStarted(options?: ClassStartOptions): void;
    classEnded(): void;
    setFullscreen(enable: boolean): void;
    getConfig(): Promise<StudentConfig>;
    saveConfig(config: Partial<StudentConfig> & { _quit?: boolean }): Promise<boolean>;
    verifyPassword(password: string): Promise<VerifyPasswordResult>;
    getAutostart(): Promise<boolean>;
    setAutostart(enable: boolean): Promise<SaveAutostartResult>;
    manualRetry(): void;
    setAdminPassword(hash: string): void;
    powerControl(payload: { action: 'shutdown' | 'restart' | 'force-shutdown' | 'force-restart'; requestId?: string }): Promise<PowerControlResult>;
    takeScreenshot?(options?: { maxWidth?: number; quality?: number }): Promise<{ dataUrl: string; width: number; height: number } | null>;
    getDeviceInfo(): Promise<StudentDeviceInfo>;
    getRole(): Promise<'viewer'>;
    getSession(): Promise<StudentSession | null>;
    bootstrapSession(): Promise<StudentSession | null>;
    toggleDevTools(): void;
    minimizeWindow?(): void;
    maximizeWindow?(): void;
    closeWindow?(): void;
}

export type ElectronCompatApi = TeacherHostApi & Partial<StudentHostApi>;
