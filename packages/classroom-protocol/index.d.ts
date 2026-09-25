// @lumesync/classroom-protocol 类型声明。
// 实现是 index.js（CommonJS）+ index.mjs（ESM 包装），这里是两端共用的类型面。

export type ClassroomRole = 'host' | 'viewer';
export type EventRoleRequirement = ClassroomRole | 'any';

export interface ValidationIssue {
    path: string;
    code: string;
    message: string;
}

export type ValidationResult<T = unknown> =
    | { ok: true; value: T; errors: ValidationIssue[] }
    | { ok: false; value?: undefined; errors: ValidationIssue[] };

// ---------------------------------------------------------------- version
export const PROTOCOL_VERSION: number;
export const LEGACY_PROTOCOL_VERSION: number;
export const SUPPORTED_PROTOCOL_VERSIONS: number[];
export const PROTOCOL_ERROR_CODES: { INVALID: string; UNSUPPORTED: string };
export function parseProtocolVersion(raw: unknown): { present: boolean; version: number; raw: unknown };
export interface ProtocolNegotiation {
    ok: boolean;
    code: string | null;
    clientVersion: number | null;
    protocolVersion: number;
    legacy?: boolean;
    message: string;
}
export function negotiateProtocol(raw: unknown): ProtocolNegotiation;
export function isServerVersionSupported(raw: unknown): boolean;

// ---------------------------------------------------------------- roles
export const ROLE_HOST: 'host';
export const ROLE_VIEWER: 'viewer';
export const ROLES: ClassroomRole[];
export const ROLE_ALIASES: Record<string, ClassroomRole>;
export function normalizeRole(raw: unknown): ClassroomRole | '';
export function roleAllows(required: EventRoleRequirement, actual: string): boolean;
export function isHostRole(role: string): boolean;

// ---------------------------------------------------------------- errors
export const ERROR_CODES: Record<string, string>;
export const ERROR_HTTP_STATUS: Record<string, number>;
export function httpStatusForError(code: string, fallback?: number): number;

// ---------------------------------------------------------------- events
export interface InboundEventSpec {
    roles: EventRoleRequirement[];
    /** classroom = 直接模式课堂事件；relay = 教室 Hub 的中继事件。 */
    scope?: 'classroom' | 'relay';
    status: 'current' | 'legacy' | 'planned';
    since: number;
    plannedName?: string;
    payload: unknown | null;
    envelope?: string[];
    note?: string;
}
export interface OutboundEventSpec {
    audience: string;
    since: number;
    plannedName?: string;
    envelope?: string[];
    note?: string;
    status?: 'current' | 'legacy' | 'planned';
}
export const HOST_SETTINGS_FIELDS: Record<string, unknown>;
export const POWER_ACTIONS: string[];
export const INBOUND_EVENTS: Record<string, InboundEventSpec>;
export const OUTBOUND_EVENTS: Record<string, OutboundEventSpec>;
export const PLANNED_EVENT_NAMES: Record<string, string>;
export function getInboundEvent(name: string): InboundEventSpec | null;
export function getOutboundEvent(name: string): OutboundEventSpec | null;
export function canSendEvent(role: string, name: string): boolean;

// ---------------------------------------------------------------- routes
export interface RouteResolution {
    id: string;
    access: 'public' | 'host' | 'bootstrap';
    declared: boolean;
    note: string;
}
export const ACCESS_PUBLIC: 'public';
export const ACCESS_HOST: 'host';
export const ACCESS_BOOTSTRAP: 'bootstrap';
export const WRITE_METHODS: string[];
export const API_ROUTES: Array<{ id: string; methods: string[]; pattern: RegExp; access: string; note?: string }>;
export const APP_ROUTES: Array<{ id: string; methods: string[]; path: string; access: string; note?: string }>;
export function normalizeRoutePath(path: string): string;
export function resolveApiRoute(method: string, path: string): RouteResolution;
export function requiresHostForApiRoute(method: string, path: string): boolean;
export function resolveAppRoute(method: string, path: string): { id: string; access: string; declared: boolean; note: string };

// ---------------------------------------------------------------- envelope
export interface ClassroomEnvelope<T = unknown> {
    protocolVersion: number;
    classroomId?: string;
    sessionId?: string;
    requestId?: string;
    revision?: number;
    epoch?: number;
    sentAt?: string;
    payload: T;
}
export const ENVELOPE_FIELDS: Record<string, unknown>;
export const ENVELOPE_SCHEMA: unknown;
export const SNAPSHOT_SCHEMA: unknown;
export function createEnvelope<T>(input?: Partial<ClassroomEnvelope<T>> & Record<string, unknown>): ClassroomEnvelope<T>;
export function wrapPayload<T>(payload: T, meta?: Record<string, unknown>): ClassroomEnvelope<T>;
export function validateEnvelope(
    value: unknown,
    options?: { requireRevision?: boolean; requireRequestId?: boolean; protocolVersion?: number }
): ValidationResult<ClassroomEnvelope>;
export function createCommandAck(input: {
    requestId?: string;
    revision?: number;
    ok?: boolean;
    code?: string | null;
    message?: string | null;
    extra?: Record<string, unknown>;
}): ClassroomEnvelope<{ ok: boolean; code: string | null; message: string | null }>;

export interface ClassroomSnapshot {
    protocolVersion: number;
    sessionId: string;
    revision: number;
    currentCourseId: string | null;
    currentSlideIndex: number;
    hostSettings: Record<string, unknown>;
}
export function createClassroomSnapshot(input: {
    sessionId: string;
    revision: number;
    courseId?: string | null;
    slideIndex?: number;
    hostSettings?: Record<string, unknown>;
}): ClassroomSnapshot;
export function validateClassroomSnapshot(value: unknown): ValidationResult<ClassroomSnapshot>;

// ---------------------------------------------------------------- guard
export interface AuthorizationFailure {
    ok: false;
    code: string;
    message: string;
    entry: InboundEventSpec | null;
    errors?: ValidationIssue[];
}
export type AuthorizationResult =
    | { ok: true; value: unknown; entry: InboundEventSpec }
    | AuthorizationFailure;
export function authorizeEvent(role: string, name: string, payload: unknown, options?: { scopes?: string[] }): AuthorizationResult;
export function createInboundGuard(options: {
    role: string;
    onViolation?: (info: { event: string; role: string; code: string; message: string }) => void;
    ignore?: string[];
    allowUndeclared?: boolean;
    /** 允许的事件范围：直接模式用 ['classroom']，教室 Hub 用 ['classroom','relay']。 */
    scopes?: string[];
}): (packet: unknown, next: (err?: Error) => void) => void;
export function authorizeHello(
    role: string,
    hello?: { protocolVersion?: unknown; clientId?: string; role?: string }
): { ok: boolean; code?: string; message?: string; protocolVersion?: number; clientVersion?: number; legacy?: boolean; role?: string };

// ---------------------------------------------------------------- validation primitives
export const MAX_STRING_LENGTH: number;
export function validate<T = unknown>(value: unknown, schema: unknown, path?: string): ValidationResult<T>;
export function check(value: unknown, schema: unknown, path?: string): boolean;
export function formatErrors(errors: ValidationIssue[]): string;

// ---------------------------------------------------------------- 教室中继（relay）
export const PAIRING_CODE_DIGITS: number;
export const PAIRING_TTL_MS: number;
export const PAIRING_MAX_ATTEMPTS: number;
export function generatePairingCode(): string;
export function isWellFormedCode(value: unknown): boolean;
export function randomIntBelow(maxExclusive: number): number;

export interface PairingRequest {
    classroomId: string;
    requestId: string;
    deviceKey: string;
    deviceName: string;
    code: string;
    createdAt: number;
    expiresAt: number;
    attemptsLeft: number;
    verified: boolean;
    status: 'pending' | 'verified' | 'expired' | 'locked';
    verifiedAt?: number;
}
/** 对外描述：不含验证码，可安全写日志、回执与发现报文。 */
export type PublicPairingRequest = Omit<PairingRequest, 'code' | 'deviceKey' | 'classroomId' | 'verified'>;
export function createPairingRequest(input: {
    classroomId: string;
    requestId: string;
    deviceKey: string;
    deviceName?: string;
    now?: number;
}): PairingRequest;
export function isExpired(request: PairingRequest | null, now?: number): boolean;
/** 记一次失败尝试（验证码错误或握手证明失败），次数用尽后 status 变为 locked。 */
export function recordFailedAttempt(request: PairingRequest | null): PairingRequest | null;
/** 校验握手证明通过后标记请求已验证（中继模式无需再提交验证码）。 */
export function markPairingVerified(request: PairingRequest | null, options?: { now?: number }): PairingRequest | null;
export function verifyPairingCode(
    request: PairingRequest | null,
    submittedCode: unknown,
    now?: number
): { ok: boolean; code: string | null; message: string; request?: PairingRequest };
export function createPairingProof(input: {
    code: string;
    classroomId: string;
    requestId: string;
    deviceKey: string;
    nonce: string;
}): Promise<string>;
export function verifyPairingProof(input: {
    request: PairingRequest | null;
    proof: string;
    nonce: string;
}): Promise<{ ok: boolean; code: string | null; message: string }>;
export function describePairingRequestForScreen(request: PairingRequest | null): Record<string, unknown> | null;
export function describePairingRequestPublic(request: PairingRequest | null): Record<string, unknown> | null;

export const LEASE_TTL_MS: number;
export const LEASE_RENEW_WINDOW_MS: number;
export interface TeachingLease {
    classroomId: string;
    leaseId: string;
    sessionId: string;
    deviceKey: string;
    deviceName: string;
    epoch: number;
    grantedAt: number;
    expiresAt: number;
    renewals: number;
}
export interface LeaseRegistry {
    acquire(input: { classroomId: string; sessionId: string; deviceKey: string; deviceName?: string }):
        { ok: boolean; code: string | null; lease?: TeachingLease; message?: string };
    renew(input: { classroomId: string; leaseId: string; epoch: number }):
        { ok: boolean; code: string | null; lease?: TeachingLease; message?: string };
    release(input: { classroomId: string; leaseId: string; epoch: number }):
        { ok: boolean; code: string | null; released?: boolean; epoch?: number; message?: string };
    revoke(input: { classroomId: string; reason?: string }):
        { ok: boolean; code: string | null; revoked?: boolean; epoch?: number; reason?: string };
    authorizeCommand(input: { classroomId: string; leaseId: string; epoch: number }):
        { ok: boolean; code: string | null; lease?: TeachingLease; message?: string };
    describe(classroomId: string): { state: 'idle' | 'teaching' | 'awaiting-teacher'; lease: TeachingLease | null; remainingMs?: number; renewSoon?: boolean };
    snapshot(classroomId: string): TeachingLease | null;
    reap(classroomId: string): (TeachingLease & { expired: true }) | null;
    size(): number;
}
export function createLeaseRegistry(options?: { leaseTtlMs?: number; now?: () => number }): LeaseRegistry;

export const RELAY_STATES: {
    DISABLED: 'disabled';
    IDLE: 'idle';
    PAIRING: 'pairing';
    PAIRED: 'paired';
    TEACHING: 'teaching';
    ERROR: 'error';
};
export type RelayStateName = 'disabled' | 'idle' | 'pairing' | 'paired' | 'teaching' | 'error';
export const DISCOVERY_LABELS: Record<RelayStateName, string | null>;
export const DNS_SD_SERVICE_TYPE: string;
export interface RelayStateMachine {
    enable(): { ok: boolean; code: string | null; state?: RelayStateName; message?: string };
    disable(): { ok: boolean; code: string | null; state: RelayStateName };
    fail(reason: string): { ok: boolean; code: string | null; state: RelayStateName; errorReason: string };
    clearError(): { ok: boolean; code: string | null; state?: RelayStateName };
    requestPairing(input: { requestId: string; deviceKey: string; deviceName?: string }):
        { ok: boolean; code: string | null; message?: string; screen?: Record<string, unknown> | null; request?: Record<string, unknown> | null };
    submitCode(input: { requestId: string; code: string }):
        { ok: boolean; code: string | null; message: string; request?: Record<string, unknown> };
    /** 中继模式：握手证明通过后标记已验证（不经过验证码提交）。 */
    markVerified(input: { requestId: string }):
        { ok: boolean; code: string | null; message?: string; request?: Record<string, unknown> };
    /** 中继模式：握手证明失败时记一次失败，用尽后请求作废并回到空闲。 */
    recordFailure(input: { requestId: string }):
        { ok: false; code: string; message: string; attemptsLeft?: number };
    completePairing(input: { leaseGranted: boolean }):
        { ok: boolean; code: string | null; state?: RelayStateName; message?: string; request?: Record<string, unknown> | null };
    cancelPairing(): { ok: boolean; code: string | null; state: RelayStateName };
    releaseTeaching(): { ok: boolean; code: string | null; state: RelayStateName };
    isFree(): boolean;
    snapshot(): Record<string, unknown>;
    discoveryTxt(input: { protocolVersion: number }): Record<string, string> | null;
    screenPayload(): Record<string, unknown>;
    getState(): RelayStateName;
}
export function createRelayState(input: {
    classroomId: string;
    name: string;
    port: number;
    canDisplayCode?: boolean;
    now?: () => number;
}): RelayStateMachine;

export const SUBMISSION_QUEUE_CAPACITY: number;
export const SUBMISSION_QUEUE_TTL_MS: number;
export const COURSE_STAGE_MAX_BYTES: number;
export const COURSE_STAGE_MAX_VERSIONS: number;
export const COURSE_STAGE_TTL_MS: number;
export interface QueuedSubmission {
    submissionId: string;
    courseId: string;
    clientIp: string;
    fileName: string;
    mergeFile: boolean;
    content: unknown;
    sizeBytes: number;
    receivedAt: number;
    status: 'pending' | 'delivered';
    deliveredAt: number | null;
}
export interface SubmissionQueue {
    enqueue(submission: Partial<QueuedSubmission> & { submissionId: string }):
        { ok: boolean; code: string | null; duplicate?: boolean; item?: QueuedSubmission; message?: string; capacity?: number; size?: number };
    markDelivered(submissionId: string, options?: { deliveredAt?: number }):
        { ok: boolean; code: string | null; item?: QueuedSubmission; message?: string };
    list(filter?: { courseId?: string; status?: string }): QueuedSubmission[];
    stats(): { size: number; capacity: number; pendingCount: number; pendingBytes: number; ttlMs: number };
    purgeExpired(): Array<QueuedSubmission & { reason: string }>;
    get(submissionId: string): QueuedSubmission | null;
}
export function createSubmissionQueue(options?: { capacity?: number; ttlMs?: number; now?: () => number }): SubmissionQueue;

export interface StagedCourseVersion {
    courseId: string;
    courseHash: string;
    sizeBytes: number;
    manifest: unknown;
    storedAt: number;
}
export interface CourseStage {
    stage(input: { courseId: string; courseHash: string; sizeBytes?: number; manifest?: unknown }):
        { ok: boolean; code: string | null; duplicate?: boolean; version?: StagedCourseVersion; message?: string };
    publish(input: { courseId: string; courseHash: string }):
        { ok: boolean; code: string | null; courseId?: string; courseHash?: string; previousCourseHash?: string | null; message?: string };
    has(courseHash: string): boolean;
    currentVersion(courseId: string): StagedCourseVersion | null;
    release(courseHash: string): { ok: boolean; code: string | null; version?: StagedCourseVersion; message?: string };
    clear(options?: { keepCurrent?: boolean }): Array<StagedCourseVersion & { courseHash: string }>;
    purgeExpired(): Array<StagedCourseVersion & { courseHash: string; reason: string }>;
    stats(): { versions: number; maxVersions: number; bytes: number; maxBytes: number; published: number; ttlMs: number };
    list(): StagedCourseVersion[];
}
export function createCourseStage(options?: {
    maxBytes?: number;
    maxVersions?: number;
    ttlMs?: number;
    now?: () => number;
}): CourseStage;
export function estimateBytes(value: unknown): number;

export interface RelayEventSpec {
    roles: EventRoleRequirement[];
    scope: 'relay';
    status: 'planned' | 'current';
    since: number;
    payload: unknown | null;
    note?: string;
}
export const RELAY_INBOUND_EVENTS: Record<string, RelayEventSpec>;
export const RELAY_OUTBOUND_EVENTS: Record<string, { audience: string; since: number; note?: string; envelope?: string[] }>;
export const RELAY_EVENT_NAMES: Set<string>;
export const CLASSROOM_COMMAND_TYPES: string[];
export const DISCOVERY_TXT_FIELDS: Record<string, string>;
export const DISCOVERY_FORBIDDEN_FIELDS: string[];
export const DEFAULT_SCOPES: string[];
