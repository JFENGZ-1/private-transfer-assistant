import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { AppConfig } from './config.js';

export type AppDb = Database.Database;

const migration = `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,applied_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS devices(
 id TEXT PRIMARY KEY,name TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL,
 last_seen_at INTEGER NOT NULL,last_ip TEXT,expires_at INTEGER NOT NULL,revoked_at INTEGER
);
CREATE TABLE IF NOT EXISTS sessions(
 id TEXT PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,kind TEXT NOT NULL CHECK(kind IN ('temporary','device')),
 device_id TEXT REFERENCES devices(id),name TEXT,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,revoked_at INTEGER
);
CREATE TABLE IF NOT EXISTS blobs(
 id TEXT PRIMARY KEY,sha256 TEXT NOT NULL UNIQUE,size INTEGER NOT NULL,path TEXT NOT NULL,mime TEXT NOT NULL,
 ref_count INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS messages(
 id TEXT PRIMARY KEY,type TEXT NOT NULL CHECK(type IN ('text','file')),content TEXT,file_name TEXT,mime TEXT,
 blob_id TEXT REFERENCES blobs(id),size INTEGER,sha256 TEXT,source_device_id TEXT REFERENCES devices(id),
 source_session_id TEXT REFERENCES sessions(id),source_name TEXT,
 visibility TEXT NOT NULL DEFAULT 'normal' CHECK(visibility IN ('normal','trusted_only')),
 favorite INTEGER NOT NULL DEFAULT 0,pinned INTEGER NOT NULL DEFAULT 0,deleted_at INTEGER,created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,ocr_text TEXT NOT NULL DEFAULT '',ocr_status TEXT NOT NULL DEFAULT 'none',
 tags TEXT NOT NULL DEFAULT '[]',note TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS message_targets(message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,device_id TEXT NOT NULL REFERENCES devices(id),PRIMARY KEY(message_id,device_id));
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(message_id UNINDEXED,content,file_name,ocr_text,note,tags,tokenize='unicode61');
CREATE TABLE IF NOT EXISTS shares(
 id TEXT PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,message_id TEXT NOT NULL REFERENCES messages(id),code_hash TEXT,
 expires_at INTEGER NOT NULL,max_downloads INTEGER,downloads INTEGER NOT NULL DEFAULT 0,revoked_at INTEGER,created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS share_messages(
 share_id TEXT NOT NULL REFERENCES shares(id) ON DELETE CASCADE,message_id TEXT NOT NULL REFERENCES messages(id),
 position INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(share_id,message_id)
);
CREATE TABLE IF NOT EXISTS drops(
 id TEXT PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,token_value TEXT,name TEXT NOT NULL,expires_at INTEGER NOT NULL,max_uploads INTEGER,
 uploads INTEGER NOT NULL DEFAULT 0,max_file_size INTEGER,allowed_types TEXT NOT NULL DEFAULT '[]',revoked_at INTEGER,created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ocr_jobs(
 id TEXT PRIMARY KEY,message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,status TEXT NOT NULL DEFAULT 'pending',
 attempts INTEGER NOT NULL DEFAULT 0,error TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,UNIQUE(message_id)
);
CREATE TABLE IF NOT EXISTS download_tokens(
 token_hash TEXT PRIMARY KEY,message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS preview_tokens(
 token_hash TEXT PRIMARY KEY,message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS message_history(
 id TEXT PRIMARY KEY,message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
 previous_content TEXT NOT NULL,editor_device_id TEXT REFERENCES devices(id),created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS message_downloads(
 message_id TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,last_downloaded_at INTEGER NOT NULL,download_count INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(deleted_at,pinned DESC,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_visibility ON messages(visibility,deleted_at);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash,expires_at);
CREATE INDEX IF NOT EXISTS idx_shares_token ON shares(token_hash,expires_at);
CREATE INDEX IF NOT EXISTS idx_share_messages_message ON share_messages(message_id,share_id);
CREATE INDEX IF NOT EXISTS idx_drops_token ON drops(token_hash,expires_at);
CREATE INDEX IF NOT EXISTS idx_download_tokens_expiry ON download_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_preview_tokens_expiry ON preview_tokens(expires_at);
INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(1,unixepoch()*1000);
INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(2,unixepoch()*1000);
INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(3,unixepoch()*1000);
INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(4,unixepoch()*1000);
DROP TABLE IF EXISTS text_templates;
INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(5,unixepoch()*1000);
`;

export function openDatabase(config: AppConfig): AppDb {
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  fs.mkdirSync(config.filesDir, { recursive: true });
  fs.mkdirSync(config.tempDir, { recursive: true });
  const db = new Database(config.dbPath);
  db.pragma('busy_timeout = 5000');
  db.exec(migration);
  const hasColumn=(table:string,column:string)=>(db.prepare(`PRAGMA table_info(${table})`).all() as {name:string}[]).some(item=>item.name===column);
  if(!hasColumn('sessions','name'))db.exec('ALTER TABLE sessions ADD COLUMN name TEXT');
  if(!hasColumn('messages','source_session_id'))db.exec('ALTER TABLE messages ADD COLUMN source_session_id TEXT REFERENCES sessions(id)');
  if(!hasColumn('messages','source_name'))db.exec('ALTER TABLE messages ADD COLUMN source_name TEXT');
  if(!hasColumn('drops','token_value'))db.exec('ALTER TABLE drops ADD COLUMN token_value TEXT');
  db.exec(`UPDATE sessions SET name=CASE WHEN kind='device' THEN COALESCE((SELECT name FROM devices WHERE devices.id=sessions.device_id),'长期设备') ELSE '临时设备' END WHERE name IS NULL OR trim(name)='';
    UPDATE messages SET source_name=COALESCE((SELECT name FROM devices WHERE devices.id=messages.source_device_id),CASE WHEN source_device_id IS NULL THEN '临时设备' ELSE '长期设备' END) WHERE source_name IS NULL OR trim(source_name)='';
    INSERT OR IGNORE INTO share_messages(share_id,message_id,position) SELECT id,message_id,0 FROM shares;
    INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(5,unixepoch()*1000);`);
  const searchIndexRepaired=db.prepare('SELECT 1 FROM schema_migrations WHERE version=6').get();
  if(!searchIndexRepaired)db.transaction(()=>{
    db.prepare('DELETE FROM messages_fts').run();
    db.prepare(`INSERT INTO messages_fts(message_id,content,file_name,ocr_text,note,tags)
      SELECT id,COALESCE(content,''),COALESCE(file_name,''),COALESCE(ocr_text,''),COALESCE(note,''),COALESCE(tags,'') FROM messages`).run();
    db.prepare('INSERT INTO schema_migrations(version,applied_at) VALUES(6,?)').run(Date.now());
  })();
  db.prepare('INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(7,?)').run(Date.now());
  db.prepare('INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(8,?)').run(Date.now());
  return db;
}

export function setting(db: AppDb, key: string): string | undefined {
  return (db.prepare('SELECT value FROM settings WHERE key=?').get(key) as {value:string}|undefined)?.value;
}

export function setSetting(db: AppDb, key: string, value: string): void {
  db.prepare(`INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`).run(key,value,Date.now());
}

export function indexMessage(db: AppDb, id: string): void {
  const row = db.prepare('SELECT id,content,file_name,ocr_text,note,tags FROM messages WHERE id=?').get(id) as Record<string,unknown>|undefined;
  db.prepare('DELETE FROM messages_fts WHERE message_id=?').run(id);
  if (row) db.prepare('INSERT INTO messages_fts(message_id,content,file_name,ocr_text,note,tags) VALUES(?,?,?,?,?,?)').run(row.id,row.content ?? '',row.file_name ?? '',row.ocr_text ?? '',row.note ?? '',row.tags ?? '');
}
