import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export interface AppConfig {
  host: string;
  port: number;
  dataDir: string;
  dbPath: string;
  filesDir: string;
  tempDir: string;
  webDistDir: string;
  cookieSecret: string;
  publicOrigin?: string;
  trustProxy: boolean | string;
  allowWebInitialize: boolean;
  mainPassword?: string;
  adminPassword?: string;
  maxFileSize: number;
  tempSessionHours: number;
  deviceDays: number;
  storageLimitBytes?: number;
  cleanupEnabled: boolean;
  cleanupIntervalMs: number;
}

function parseTrustProxy(value: string | undefined, production: boolean): boolean | string {
  if (value === undefined || value === '') return production;
  if (value === 'true' || value === '1') return true;
  if (value === 'false') return false;
  return value;
}

export function isPlaceholderSecret(value: string | undefined): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return normalized.includes('replace-with') || normalized.includes('change-this') || normalized.includes('changeme');
}

export function validateRuntimeConfig(config: AppConfig): void {
  if (process.env.NODE_ENV !== 'production') return;
  if (config.cookieSecret.length < 32 || isPlaceholderSecret(config.cookieSecret)) {
    throw new Error('COOKIE_SECRET must be at least 32 characters and must not be a placeholder in production');
  }
  if (!config.publicOrigin) throw new Error('PUBLIC_ORIGIN is required in production');
  let url: URL;
  try { url = new URL(config.publicOrigin); } catch { throw new Error('PUBLIC_ORIGIN must be a valid absolute URL'); }
  if (url.origin !== config.publicOrigin || (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1')) {
    throw new Error('PUBLIC_ORIGIN must be an HTTPS origin without a path, query, or trailing slash');
  }
  if (url.hostname === 'transfer.example.com' || url.hostname.endsWith('.example.com')) {
    throw new Error('PUBLIC_ORIGIN must not use the example.com placeholder');
  }
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const dataDir = overrides.dataDir ?? process.env.DATA_DIR ?? path.resolve('data');
  const production = process.env.NODE_ENV === 'production';
  return {
    host: overrides.host ?? process.env.HOST ?? '0.0.0.0',
    port: overrides.port ?? Number(process.env.PORT ?? 3000),
    dataDir,
    dbPath: overrides.dbPath ?? process.env.DB_PATH ?? path.join(dataDir, 'transfer.db'),
    filesDir: overrides.filesDir ?? process.env.FILES_DIR ?? process.env.UPLOAD_DIR ?? path.join(dataDir, 'files'),
    tempDir: overrides.tempDir ?? process.env.TEMP_DIR ?? path.join(dataDir, 'tmp'),
    webDistDir: overrides.webDistDir ?? process.env.WEB_DIST_DIR ?? path.resolve(moduleDir, '../../web/dist'),
    cookieSecret: overrides.cookieSecret ?? process.env.COOKIE_SECRET ?? 'change-this-cookie-secret-in-production',
    publicOrigin: overrides.publicOrigin ?? process.env.PUBLIC_ORIGIN?.replace(/\/$/, ''),
    trustProxy: overrides.trustProxy ?? parseTrustProxy(process.env.TRUST_PROXY, production),
    allowWebInitialize: overrides.allowWebInitialize ?? (!production && process.env.ALLOW_WEB_INITIALIZE !== 'false'),
    mainPassword: overrides.mainPassword ?? process.env.MAIN_PASSWORD,
    adminPassword: overrides.adminPassword ?? process.env.ADMIN_PASSWORD,
    maxFileSize: overrides.maxFileSize ?? Number(process.env.MAX_FILE_SIZE ?? 10 * 1024 ** 3),
    tempSessionHours: overrides.tempSessionHours ?? Number(process.env.TEMP_SESSION_HOURS ?? 12),
    deviceDays: overrides.deviceDays ?? Number(process.env.DEVICE_DAYS ?? 90),
    storageLimitBytes: overrides.storageLimitBytes ?? (Number(process.env.STORAGE_LIMIT_BYTES ?? 0)||undefined),
    cleanupEnabled: overrides.cleanupEnabled ?? (process.env.CLEANUP_ENABLED !== 'false' && process.env.NODE_ENV !== 'test'),
    cleanupIntervalMs: overrides.cleanupIntervalMs ?? Number(process.env.CLEANUP_INTERVAL_MS ?? 60*60*1000),
  };
}
