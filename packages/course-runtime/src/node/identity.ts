import crypto from 'crypto';

export interface ViewerSessionTokenInput {
  clientId: string;
  ttlSec?: number;
  secret: string;
}

export interface ViewerSessionPayload {
  sub: string;
  role: 'viewer';
  iat: number;
  exp: number;
}

export type ViewerSessionTokenResult =
  | { ok: true; payload: ViewerSessionPayload }
  | { ok: false; code: string };

function toBase64Url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(input: string): Buffer {
  const padded = String(input)
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(String(input).length / 4) * 4, '=');
  return Buffer.from(padded, 'base64');
}

function signHs256(content: string, secret: string): string {
  return toBase64Url(crypto.createHmac('sha256', String(secret)).update(content).digest());
}

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function normalizeIp(rawIp: unknown): string {
  const ip = String(rawIp || '');
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  return ip;
}

export function createViewerSessionToken({ clientId, ttlSec = 4 * 60 * 60, secret }: ViewerSessionTokenInput): string {
  if (!secret) throw new Error('Missing viewer token secret');
  const nowSec = Math.floor(Date.now() / 1000);
  const payload: ViewerSessionPayload = {
    sub: String(clientId || ''),
    role: 'viewer',
    iat: nowSec,
    exp: nowSec + Math.max(30, Number(ttlSec || 0)),
  };
  const headerB64 = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadB64 = toBase64Url(JSON.stringify(payload));
  const signature = signHs256(`${headerB64}.${payloadB64}`, secret);
  return `${headerB64}.${payloadB64}.${signature}`;
}

export function verifyViewerSessionToken(token: unknown, secret: string): ViewerSessionTokenResult {
  if (!secret) return { ok: false, code: 'viewer_secret_missing' };
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return { ok: false, code: 'token_format_invalid' };
  const [headerB64, payloadB64, signatureB64] = parts;
  const expected = signHs256(`${headerB64}.${payloadB64}`, secret);

  const sigBuf = Buffer.from(String(signatureB64));
  const expectedBuf = Buffer.from(String(expected));
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { ok: false, code: 'token_signature_invalid' };
  }

  const header = safeJsonParse<{ alg?: string }>(fromBase64Url(headerB64).toString('utf8'));
  const payload = safeJsonParse<ViewerSessionPayload>(fromBase64Url(payloadB64).toString('utf8'));
  if (!header || !payload) return { ok: false, code: 'token_payload_invalid' };
  if (header.alg !== 'HS256') return { ok: false, code: 'token_alg_invalid' };
  if (payload.role !== 'viewer') return { ok: false, code: 'token_role_invalid' };

  const nowSec = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(payload.exp) || nowSec >= Number(payload.exp)) {
    return { ok: false, code: 'token_expired' };
  }
  if (!payload.sub) return { ok: false, code: 'token_subject_missing' };

  return { ok: true, payload };
}
