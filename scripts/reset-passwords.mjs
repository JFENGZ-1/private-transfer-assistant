#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import Database from 'better-sqlite3';
import { hash, Algorithm } from '@node-rs/argon2';

function secret(name) {
  const file = process.env[`${name}_FILE`];
  const value = file ? fs.readFileSync(file, 'utf8').replace(/[\r\n]+$/, '') : process.env[name];
  delete process.env[name];
  return value;
}

const mainPassword = secret('RESET_MAIN_PASSWORD');
const adminPassword = secret('RESET_ADMIN_PASSWORD');
const dbPath = path.resolve(process.env.DB_PATH ?? path.join(process.env.DATA_DIR ?? 'data', 'transfer.db'));
const revokeDevices = !['0', 'false', 'no', 'off'].includes((process.env.RESET_REVOKE_DEVICES ?? 'true').toLowerCase());

if (!mainPassword && !adminPassword) {
  console.error('Set RESET_MAIN_PASSWORD or RESET_ADMIN_PASSWORD (or the matching *_FILE variable).');
  process.exit(2);
}
for (const [label, value] of [['main', mainPassword], ['admin', adminPassword]]) {
  if (value && value.length < 8) {
    console.error(`${label} password must contain at least 8 characters.`);
    process.exit(2);
  }
}
if (mainPassword && adminPassword && mainPassword === adminPassword) {
  console.error('Main and admin passwords must differ.');
  process.exit(2);
}
if (!fs.existsSync(dbPath)) {
  console.error(`Database not found: ${dbPath}`);
  process.exit(1);
}

const options = { algorithm: Algorithm.Argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 };
const mainHash = mainPassword ? await hash(mainPassword, options) : undefined;
const adminHash = adminPassword ? await hash(adminPassword, options) : undefined;
const db = new Database(dbPath);
db.pragma('busy_timeout = 10000');
const now = Date.now();
const setSetting = db.prepare(`
  INSERT INTO settings(key,value,updated_at) VALUES(?,?,?)
  ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
`);

db.transaction(() => {
  if (mainHash) setSetting.run('main_password_hash', mainHash, now);
  if (adminHash) setSetting.run('admin_password_hash', adminHash, now);
  db.prepare("UPDATE sessions SET revoked_at=? WHERE revoked_at IS NULL AND (kind='temporary' OR ?=1)").run(now, revokeDevices ? 1 : 0);
  if (revokeDevices) db.prepare('UPDATE devices SET revoked_at=? WHERE revoked_at IS NULL').run(now);
})();
db.close();

console.log(`Password reset complete. Temporary sessions revoked; long-term devices ${revokeDevices ? 'revoked' : 'preserved'}.`);

