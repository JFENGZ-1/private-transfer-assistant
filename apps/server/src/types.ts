import type { AppDb } from './db.js';
import type { AppConfig } from './config.js';

export interface Principal { sessionId: string; kind: 'temporary'|'device'; deviceId?: string; }
declare module 'fastify' {
  interface FastifyInstance { db: AppDb; config: AppConfig; broadcast: (event: unknown, trustedOnly?: boolean, deviceIds?: string[], temporaryOnly?: boolean) => void; }
  interface FastifyRequest { principal?: Principal; }
}
