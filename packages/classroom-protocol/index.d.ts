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
export function authorizeEvent(role: string, name: string, payload: unknown): AuthorizationResult;
export function createInboundGuard(options: {
    role: string;
    onViolation?: (info: { event: string; role: string; code: string; message: string }) => void;
    ignore?: string[];
    allowUndeclared?: boolean;
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
