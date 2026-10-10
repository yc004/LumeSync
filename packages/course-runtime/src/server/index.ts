import { createCoreServer } from './create-core-server.js';

const runtime = createCoreServer();

if (typeof require !== 'undefined' && require.main === module) {
  runtime.startServer();
}

export const app = runtime.app;
export const server = runtime.server;
export const io = runtime.io;
export const startServer = runtime.startServer;
export { createCoreServer };
export * from './script-cache.js';
