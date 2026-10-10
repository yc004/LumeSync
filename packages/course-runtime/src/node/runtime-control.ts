import type { Server, Socket } from 'socket.io';
import { normalizeIp, verifyViewerSessionToken } from './identity.js';

const RESERVED_CLIENT_EVENTS = new Set([
  'connect',
  'connect_error',
  'disconnect',
  'disconnecting',
  'newListener',
  'removeListener',
]);

const SERVER_ONLY_EVENTS = new Set([
  'role-assigned',
  'identity-rejected',
  'participant-joined',
  'participant-left',
]);

export interface RuntimeControlOptions {
  hostToken?: string;
  viewerTokenSecret?: string;
  identityLegacyCompat?: boolean;
  studentLogMax?: number;
}

export interface ParticipantPayload {
  role: 'host' | 'viewer';
  clientIp: string;
  clientId: string;
  clientKey: string;
  legacyMode: boolean;
  socketId: string;
}

type IdentityResult =
  | ({ ok: true; token: string; isLegacy: boolean } & Omit<ParticipantPayload, 'legacyMode' | 'socketId'>)
  | { ok: false; code: string; message: string };

interface TransportState {
  compatibilityLog: Array<Record<string, unknown>>;
}

function getStringValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return getStringValue(value[0]);
  return String(value).trim();
}

function normalizeDeclaredRole(rawRole: unknown): 'host' | 'viewer' | '' {
  const role = getStringValue(rawRole).toLowerCase();
  if (role === 'host' || role === 'teacher') return 'host';
  if (role === 'viewer' || role === 'student') return 'viewer';
  return '';
}

function rejectIdentity(socket: Socket, code: string, message: string): void {
  socket.emit('identity-rejected', { code, message });
  socket.disconnect(true);
}

function resolveConnectionIdentity(socket: Socket, options: Required<RuntimeControlOptions>): IdentityResult {
  const auth = socket.handshake.auth || {};
  const query = socket.handshake.query || {};

  const clientIp = normalizeIp(socket.handshake.address || '');
  const declaredRole = normalizeDeclaredRole(auth.role || query.role);
  const token = getStringValue(auth.token || query.token);
  const clientId = getStringValue(auth.clientId || query.clientId);

  if (!declaredRole) {
    if (!options.identityLegacyCompat) {
      return { ok: false, code: 'identity_missing', message: 'Missing role declaration' };
    }
    const isLocalhost = clientIp === '127.0.0.1' || clientIp === '::1';
    const legacyRole = isLocalhost ? 'host' : 'viewer';
    return {
      ok: true,
      role: legacyRole,
      token: '',
      clientId: clientId || clientIp,
      clientIp,
      clientKey: clientId || clientIp,
      isLegacy: true,
    };
  }

  const normalizedClientId = clientId || (declaredRole === 'host' ? `host-${clientIp || 'unknown'}` : '');
  if (!normalizedClientId) {
    return { ok: false, code: 'client_id_missing', message: 'Missing clientId' };
  }

  const identity = {
    ok: true as const,
    role: declaredRole,
    token,
    clientId: normalizedClientId,
    clientIp,
    clientKey: normalizedClientId || clientIp,
    isLegacy: false,
  };

  if (declaredRole === 'host') {
    if (!options.hostToken) {
      return { ok: false, code: 'host_token_not_configured', message: 'Host token not configured on server' };
    }
    if (!token || token !== options.hostToken) {
      return { ok: false, code: 'host_auth_failed', message: 'Invalid host token' };
    }
    return identity;
  }

  if (!options.viewerTokenSecret) {
    return { ok: false, code: 'viewer_token_not_configured', message: 'Viewer token secret not configured on server' };
  }
  if (!token) {
    return { ok: false, code: 'viewer_token_missing', message: 'Missing viewer token' };
  }

  const verifyResult = verifyViewerSessionToken(token, options.viewerTokenSecret);
  if (!verifyResult.ok) {
    return { ok: false, code: verifyResult.code, message: 'Viewer token verification failed' };
  }
  if (String(verifyResult.payload.sub) !== normalizedClientId) {
    return { ok: false, code: 'viewer_client_mismatch', message: 'Token subject and clientId mismatch' };
  }

  return identity;
}

function buildParticipantPayload(identity: Extract<IdentityResult, { ok: true }>, socket: Socket): ParticipantPayload {
  return {
    role: identity.role,
    clientIp: identity.clientIp,
    clientId: identity.clientId,
    clientKey: identity.clientKey,
    legacyMode: !!identity.isLegacy,
    socketId: socket.id,
  };
}

function stripTargetId(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.prototype.hasOwnProperty.call(value, 'targetId')) {
    return value;
  }
  const { targetId: _targetId, ...rest } = value as Record<string, unknown>;
  return rest;
}

function isForwardableEvent(eventName: string): boolean {
  return !RESERVED_CLIENT_EVENTS.has(eventName) && !SERVER_ONLY_EVENTS.has(eventName);
}

function sanitizeArgs(args: unknown[]): unknown[] {
  return args.map((arg) => stripTargetId(arg));
}

function normalizeTargetId(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  return getStringValue((value as Record<string, unknown>).targetId);
}

function getTargetId(args: unknown[]): string {
  for (const arg of args) {
    const targetId = normalizeTargetId(arg);
    if (targetId) return targetId;
  }
  return '';
}

function routeEvent(io: Server, socket: Socket, role: 'host' | 'viewer', eventName: string, args: unknown[]): void {
  if (!isForwardableEvent(eventName)) return;

  const targetId = getTargetId(args);
  const routedArgs = sanitizeArgs(args);
  const targetText = targetId ? ` target=${targetId}` : '';
  console.log(`[forward] role=${role} event=${eventName}${targetText}`);

  if (targetId) {
    io.to(targetId).emit(eventName, ...routedArgs);
    return;
  }

  if (role === 'host') {
    socket.broadcast.emit(eventName, ...routedArgs);
    return;
  }

  io.to('hosts').emit(eventName, ...routedArgs);
}

function getParticipantPayloads(io: Server, room: string): ParticipantPayload[] {
  return Array.from(io.sockets.adapter.rooms.get(room) || [])
    .map((socketId) => io.sockets.sockets.get(socketId)?.data.identity as ParticipantPayload | undefined)
    .filter(Boolean) as ParticipantPayload[];
}

export function buildCoreRuntimeSnapshot(io: Server): { mode: 'core-runtime'; hosts: ParticipantPayload[]; viewers: ParticipantPayload[] } {
  return {
    mode: 'core-runtime',
    hosts: getParticipantPayloads(io, 'hosts'),
    viewers: getParticipantPayloads(io, 'viewers'),
  };
}

export function listCompatibilityStudents(io: Server): string[] {
  return getParticipantPayloads(io, 'viewers').map((participant) => participant.clientIp);
}

function buildLogEntry(type: string, participant: ParticipantPayload): Record<string, unknown> {
  return {
    time: new Date().toISOString(),
    type,
    ip: participant.clientIp,
    clientId: participant.clientId,
    clientKey: participant.clientKey,
    role: participant.role,
    socketId: participant.socketId,
  };
}

function getTransportState(io: Server): TransportState {
  const keyed = io as Server & { __lumesyncTransportState?: TransportState };
  if (!keyed.__lumesyncTransportState) {
    keyed.__lumesyncTransportState = { compatibilityLog: [] };
  }
  return keyed.__lumesyncTransportState;
}

function pushCompatibilityLog(io: Server, maxEntries: number, type: string, participant: ParticipantPayload): void {
  const state = getTransportState(io);
  state.compatibilityLog.push(buildLogEntry(type, participant));
  if (state.compatibilityLog.length > maxEntries) {
    state.compatibilityLog.shift();
  }
}

export function listCompatibilityLog(io: Server): Array<Record<string, unknown>> {
  return getTransportState(io).compatibilityLog.slice();
}

function emitParticipantJoined(io: Server, socket: Socket, participant: ParticipantPayload): void {
  if (participant.role === 'host') {
    socket.to('hosts').emit('participant-joined', participant);
    socket.to('viewers').emit('participant-joined', participant);
    return;
  }
  io.to('hosts').emit('participant-joined', participant);
}

function emitParticipantLeft(io: Server, socket: Socket, participant: ParticipantPayload): void {
  if (participant.role === 'host') {
    socket.to('hosts').emit('participant-left', participant);
    socket.to('viewers').emit('participant-left', participant);
    return;
  }
  io.to('hosts').emit('participant-left', participant);
}

function resolveOptions(options: RuntimeControlOptions = {}): Required<RuntimeControlOptions> {
  return {
    hostToken: options.hostToken ?? String(process.env.LUMESYNC_HOST_TOKEN || ''),
    viewerTokenSecret: options.viewerTokenSecret ?? String(process.env.LUMESYNC_VIEWER_TOKEN_SECRET || ''),
    identityLegacyCompat: options.identityLegacyCompat ?? String(process.env.LUMESYNC_IDENTITY_LEGACY_COMPAT || 'true').toLowerCase() !== 'false',
    studentLogMax: options.studentLogMax ?? Number(process.env.LUMESYNC_STUDENT_LOG_MAX || 500),
  };
}

export function setupSocketHandlers(io: Server, options: RuntimeControlOptions = {}): Server {
  const resolvedOptions = resolveOptions(options);
  getTransportState(io);

  io.on('connection', (socket) => {
    const identity = resolveConnectionIdentity(socket, resolvedOptions);
    if (!identity.ok) {
      rejectIdentity(socket, identity.code, identity.message);
      return;
    }

    const participant = buildParticipantPayload(identity, socket);
    const room = identity.role === 'host' ? 'hosts' : 'viewers';

    socket.join(room);
    socket.data.identity = participant;

    console.log(`[conn] IP=${identity.clientIp} role=${identity.role} clientId=${identity.clientId} legacy=${identity.isLegacy}`);
    pushCompatibilityLog(io, resolvedOptions.studentLogMax, 'join', participant);
    socket.emit('role-assigned', participant);
    emitParticipantJoined(io, socket, participant);

    socket.onAny((eventName, ...args) => {
      routeEvent(io, socket, identity.role, eventName, args);
    });

    socket.on('disconnect', () => {
      console.log(`[disconnect] IP=${identity.clientIp} role=${identity.role} clientId=${identity.clientId}`);
      pushCompatibilityLog(io, resolvedOptions.studentLogMax, 'leave', participant);
      emitParticipantLeft(io, socket, participant);
    });
  });

  return io;
}
