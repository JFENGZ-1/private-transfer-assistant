import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { newToken, passwordHash, passwordVerify, sha256 } from './security.js';
import { setting, setSetting } from './db.js';
import type { Principal } from './types.js';
import { isPlaceholderSecret } from './config.js';

const COOKIE = 'transfer_device';
const now = () => Date.now();

export async function initializePasswords(app: FastifyInstance): Promise<void> {
  const mainHash=setting(app.db,'main_password_hash'),adminHash=setting(app.db,'admin_password_hash');
  if(process.env.NODE_ENV==='production'&&(!mainHash||!adminHash)){
    const main=app.config.mainPassword,admin=app.config.adminPassword;
    if(!mainHash&&(isPlaceholderSecret(main)||!main||main.length<8))throw new Error('A non-placeholder MAIN_PASSWORD of at least 8 characters is required for first production startup');
    if(!adminHash&&(isPlaceholderSecret(admin)||!admin||admin.length<8))throw new Error('A non-placeholder ADMIN_PASSWORD of at least 8 characters is required for first production startup');
    if(main&&admin&&main===admin)throw new Error('MAIN_PASSWORD and ADMIN_PASSWORD must differ');
    if(!mainHash&&adminHash&&main&&await passwordVerify(adminHash,main))throw new Error('MAIN_PASSWORD and ADMIN_PASSWORD must differ');
    if(!adminHash&&mainHash&&admin&&await passwordVerify(mainHash,admin))throw new Error('MAIN_PASSWORD and ADMIN_PASSWORD must differ');
  }
  if (!mainHash && app.config.mainPassword) setSetting(app.db,'main_password_hash',await passwordHash(app.config.mainPassword));
  if (!adminHash && app.config.adminPassword) setSetting(app.db,'admin_password_hash',await passwordHash(app.config.adminPassword));
}

function cookieToken(req:FastifyRequest):string|undefined{
  const value=req.cookies[COOKIE];if(!value)return;
  const result=req.unsignCookie(value);return result.valid?result.value:undefined;
}

function bearerOrProtocolToken(req:FastifyRequest):string|undefined{
  const auth=req.headers.authorization;if(auth?.startsWith('Bearer '))return auth.slice(7);
  const value=req.headers['sec-websocket-protocol']?.split(',').map(x=>x.trim()).find(x=>x.startsWith('bearer.'))?.slice(7);
  if(!value)return;
  const unsigned=req.unsignCookie(value);return unsigned.valid?unsigned.value:value;
}

export function resolvePrincipal(app: FastifyInstance, req: FastifyRequest): Principal | undefined {
  const raw = bearerOrProtocolToken(req) ?? cookieToken(req);
  if (!raw) return;
  const row = app.db.prepare(`SELECT id,kind,device_id FROM sessions WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?`).get(sha256(raw),now()) as {id:string;kind:'temporary'|'device';device_id?:string}|undefined;
  if (!row) return;
  if (row.device_id) app.db.prepare('UPDATE devices SET last_seen_at=?,last_ip=? WHERE id=? AND revoked_at IS NULL').run(now(),req.ip,row.device_id);
  return { sessionId: row.id, kind: row.kind, deviceId: row.device_id };
}

export function requireAuth(app: FastifyInstance, trusted = false) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    req.principal = resolvePrincipal(app,req);
    if (!req.principal) return reply.code(401).send({error:'unauthorized'});
    if (trusted && req.principal.kind !== 'device') return reply.code(403).send({error:'trusted_device_required'});
  };
}

export async function authRoutes(app: FastifyInstance) {
  app.get('/api/auth/status', async req => ({initialized:Boolean(setting(app.db,'main_password_hash') && setting(app.db,'admin_password_hash')), principal: resolvePrincipal(app,req) ?? null}));
  app.post('/api/auth/initialize', async (req,reply) => {
    if(!app.config.allowWebInitialize)return reply.code(404).send({error:'not_found'});
    if (setting(app.db,'main_password_hash') || setting(app.db,'admin_password_hash')) return reply.code(409).send({error:'already_initialized'});
    const body = z.object({mainPassword:z.string().min(8),adminPassword:z.string().min(8)}).parse(req.body);
    if (body.mainPassword === body.adminPassword) return reply.code(400).send({error:'passwords_must_differ'});
    setSetting(app.db,'main_password_hash',await passwordHash(body.mainPassword)); setSetting(app.db,'admin_password_hash',await passwordHash(body.adminPassword));
    return {ok:true};
  });
  app.post('/api/auth/login',{config:{rateLimit:{max:5,timeWindow:'1 minute'}}}, async (req,reply) => {
    const {password}=z.object({password:z.string()}).parse(req.body);
    if (!await passwordVerify(setting(app.db,'main_password_hash'),password)) return reply.code(401).send({error:'invalid_password'});
    const token=newToken(), id=nanoid();
    app.db.prepare('INSERT INTO sessions(id,token_hash,kind,created_at,expires_at) VALUES(?,?,?,?,?)').run(id,sha256(token),'temporary',now(),now()+app.config.tempSessionHours*3600000);
    return {token,expiresAt:now()+app.config.tempSessionHours*3600000};
  });
  app.post('/api/auth/promote',{preHandler:requireAuth(app),config:{rateLimit:{max:5,timeWindow:'1 minute'}}},async(req,reply)=>{
    const body=z.object({adminPassword:z.string(),name:z.string().trim().min(1).max(80).default('长期设备')}).parse(req.body);
    if(!await passwordVerify(setting(app.db,'admin_password_hash'),body.adminPassword)) return reply.code(401).send({error:'invalid_admin_password'});
    const deviceId=nanoid(),token=newToken(),sessionId=nanoid(),expires=now()+app.config.deviceDays*86400000;
    const tx=app.db.transaction(()=>{app.db.prepare('INSERT INTO devices VALUES(?,?,?,?,?,?,?,NULL)').run(deviceId,body.name,sha256(token),now(),now(),req.ip,expires);app.db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,NULL)').run(sessionId,sha256(token),'device',deviceId,now(),expires);});tx();
    reply.setCookie(COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',expires:new Date(expires),signed:true});
    return {device:{id:deviceId,name:body.name,expiresAt:expires}};
  });
  app.post('/api/auth/logout',{preHandler:requireAuth(app)},async(req,reply)=>{app.db.prepare('UPDATE sessions SET revoked_at=? WHERE id=?').run(now(),req.principal!.sessionId);if(req.principal!.deviceId)app.db.prepare('UPDATE devices SET revoked_at=? WHERE id=?').run(now(),req.principal!.deviceId);reply.clearCookie(COOKIE,{path:'/'});return {ok:true};});
  app.post('/api/auth/logout-all',{preHandler:requireAuth(app,true),config:{rateLimit:{max:5,timeWindow:'1 minute'}}},async(req,reply)=>{const {adminPassword}=z.object({adminPassword:z.string()}).parse(req.body);if(!await passwordVerify(setting(app.db,'admin_password_hash'),adminPassword))return reply.code(401).send({error:'invalid_admin_password'});app.db.prepare('UPDATE sessions SET revoked_at=? WHERE revoked_at IS NULL').run(now());app.db.prepare('UPDATE devices SET revoked_at=? WHERE revoked_at IS NULL').run(now());reply.clearCookie(COOKIE,{path:'/'});return {ok:true};});
  app.put('/api/settings/passwords',{preHandler:requireAuth(app,true),config:{rateLimit:{max:5,timeWindow:'1 minute'}}},async(req,reply)=>{const b=z.object({adminPassword:z.string(),newMainPassword:z.string().min(8).optional(),newAdminPassword:z.string().min(8).optional(),revokeDevices:z.boolean().default(false)}).parse(req.body);if(!await passwordVerify(setting(app.db,'admin_password_hash'),b.adminPassword))return reply.code(401).send({error:'invalid_admin_password'});if((b.newMainPassword&&await passwordVerify(setting(app.db,'admin_password_hash'),b.newMainPassword))||(b.newAdminPassword&&await passwordVerify(setting(app.db,'main_password_hash'),b.newAdminPassword))||(b.newMainPassword&&b.newAdminPassword&&b.newMainPassword===b.newAdminPassword))return reply.code(400).send({error:'passwords_must_differ'});if(b.newMainPassword)setSetting(app.db,'main_password_hash',await passwordHash(b.newMainPassword));if(b.newAdminPassword)setSetting(app.db,'admin_password_hash',await passwordHash(b.newAdminPassword));app.db.prepare("UPDATE sessions SET revoked_at=? WHERE kind='temporary' AND revoked_at IS NULL").run(now());if(b.newAdminPassword||b.revokeDevices){app.db.prepare("UPDATE sessions SET revoked_at=? WHERE kind='device' AND revoked_at IS NULL").run(now());app.db.prepare('UPDATE devices SET revoked_at=? WHERE revoked_at IS NULL').run(now());}return {ok:true};});
}
