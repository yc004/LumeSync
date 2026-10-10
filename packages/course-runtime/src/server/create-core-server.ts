import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import {
  buildCoreRuntimeSnapshot,
  listCompatibilityLog,
  listCompatibilityStudents,
  setupSocketHandlers,
  type RuntimeControlOptions,
} from '../node/runtime-control.js';
import { createViewerSessionToken, normalizeIp } from '../node/identity.js';
import { resolveEngineSrcDir } from '../node/render-engine.js';

export interface CoreServerOptions extends RuntimeControlOptions {
  port?: number;
  viewerTokenTtlSec?: number;
  viewerTokenSecret?: string;
}

export interface CoreServerRuntime {
  app: express.Express;
  server: http.Server;
  io: Server;
  startServer: (port?: number) => http.Server;
}

function ensureClientId(input: unknown): string {
  const value = String(input || '').trim();
  return value || `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createCoreServer(options: CoreServerOptions = {}): CoreServerRuntime {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    pingInterval: 5000,
    pingTimeout: 8000,
  });

  const viewerTokenTtlSec = Number(options.viewerTokenTtlSec || process.env.LUMESYNC_VIEWER_TOKEN_TTL_SEC || 14400);
  const viewerTokenSecret = String(options.viewerTokenSecret || process.env.LUMESYNC_VIEWER_TOKEN_SECRET || '');

  app.use(express.json({ limit: '1mb' }));

  const engineDir = resolveEngineSrcDir();
  app.use('/engine', express.static(engineDir));
  app.use('/engine/src', express.static(engineDir));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, app: 'LumeSync-Core', port: Number(process.env.PORT || options.port || 3000) });
  });

  app.get('/api/courses', (_req, res) => {
    res.json({ courses: [], folders: [], mode: 'core-runtime' });
  });

  app.get('/api/course-status', (_req, res) => {
    res.json({ mode: 'core-runtime' });
  });

  app.post('/api/refresh-courses', (_req, res) => {
    res.json({ success: true, courses: [], folders: [], mode: 'core-runtime' });
  });

  app.get('/api/components-manifest', (_req, res) => {
    res.json({ success: true, files: [], mode: 'core-runtime' });
  });

  app.get('/api/runtime-status', (_req, res) => {
    res.json(buildCoreRuntimeSnapshot(io));
  });

  app.get('/api/students', (_req, res) => {
    res.json({ students: listCompatibilityStudents(io), mode: 'core-runtime' });
  });

  app.get('/api/student-log', (_req, res) => {
    res.json({ log: listCompatibilityLog(io), mode: 'core-runtime' });
  });

  app.post('/api/session/bootstrap', (req, res) => {
    const role = String(req.body?.role || 'viewer').trim().toLowerCase();
    const clientId = ensureClientId(req.body?.clientId);
    const clientIp = normalizeIp(req.ip || req.socket?.remoteAddress || '');

    if (role !== 'viewer') {
      res.status(400).json({ success: false, error: 'Only viewer bootstrap is supported' });
      return;
    }
    if (!viewerTokenSecret) {
      res.status(500).json({ success: false, error: 'Viewer token secret is not configured on server' });
      return;
    }

    const token = createViewerSessionToken({
      clientId,
      ttlSec: viewerTokenTtlSec,
      secret: viewerTokenSecret,
    });
    const expiresAt = new Date(Date.now() + viewerTokenTtlSec * 1000).toISOString();

    res.json({
      success: true,
      role: 'viewer',
      clientId,
      token,
      expiresAt,
      clientIp,
      serverTime: new Date().toISOString(),
    });
  });

  app.get('*', (_req, res) => {
    res.status(404).send('LumeSync Core runtime is running. This service does not host course files.');
  });

  setupSocketHandlers(io, {
    ...options,
    viewerTokenSecret,
  });

  function startServer(port?: number): http.Server {
    const resolvedPort = Number(port || options.port || process.env.PORT || 3000);
    server.listen(resolvedPort, () => {
      console.log(`[core] LumeSync core runtime running on port ${resolvedPort}`);
    });

    process.on('SIGTERM', () => {
      server.close(() => process.exit(0));
    });

    process.on('SIGINT', () => {
      server.close(() => process.exit(0));
    });

    return server;
  }

  return { app, server, io, startServer };
}
