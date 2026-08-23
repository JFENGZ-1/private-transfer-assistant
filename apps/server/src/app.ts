import Fastify, { LogController } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import staticPlugin from '@fastify/static';
import websocket from '@fastify/websocket';
import { ZodError } from 'zod';
import { loadConfig, validateRuntimeConfig, type AppConfig } from './config.js';
import { openDatabase } from './db.js';
import { authRoutes, initializePasswords } from './auth.js';
import { messageRoutes } from './messages.js';
import { fileRoutes } from './files.js';
import { searchRoutes } from './search.js';
import { sharingRoutes } from './sharing.js';
import { adminRoutes } from './admin.js';
import { realtimeRoutes } from './realtime.js';
import { startCleanup } from './cleanup.js';
import { appearanceRoutes } from './appearance.js';
import './types.js';

export async function buildApp(overrides:Partial<AppConfig>={}){
  const config=loadConfig(overrides);validateRuntimeConfig(config);
  const app=Fastify({logger:process.env.NODE_ENV!=='test',logController:new LogController({disableRequestLogging:process.env.NODE_ENV==='production'}),bodyLimit:2*1024*1024,trustProxy:config.trustProxy});
  app.decorate('config',config);app.decorate('db',openDatabase(config));app.addHook('onClose',async()=>app.db.close());
  await app.register(cookie,{secret:config.cookieSecret});
  app.addHook('onRequest',async(req,reply)=>{
    const origin=req.headers.origin,site=req.headers['sec-fetch-site'];
    const expected=config.publicOrigin??`${req.protocol}://${req.headers.host}`;
    const originAllowed=origin ? (config.publicOrigin ? origin===expected : (()=>{try{return new URL(origin).hostname===req.hostname;}catch{return false;}})()) : !config.publicOrigin;
    if(req.url.startsWith('/ws')&&req.cookies.transfer_device&&!originAllowed)return reply.code(403).send({error:'csrf_rejected'});
    if(['GET','HEAD','OPTIONS'].includes(req.method)||req.headers.authorization?.startsWith('Bearer ')||!req.cookies.transfer_device)return;
    if(!originAllowed||(site&&site!=='same-origin'&&site!=='none'))return reply.code(403).send({error:'csrf_rejected'});
  });
  await app.register(helmet,{contentSecurityPolicy:false});
  await app.register(rateLimit,{max:240,timeWindow:'1 minute'});
  await app.register(multipart,{limits:{fileSize:config.maxFileSize,files:20,fields:20}});
  await app.register(websocket);
  try{await initializePasswords(app);}catch(error){await app.close();throw error;}
  app.get('/health',async()=>({ok:true}));
  await appearanceRoutes(app);await realtimeRoutes(app);await authRoutes(app);await messageRoutes(app);await fileRoutes(app);await searchRoutes(app);await sharingRoutes(app);await adminRoutes(app);
  if(process.env.NODE_ENV==='production'){
    await app.register(staticPlugin,{root:config.webDistDir,prefix:'/'});
    app.setNotFoundHandler((req,reply)=>{
      if(req.url==='/health'||req.url==='/api'||req.url.startsWith('/api/')||req.url==='/ws'||req.url.startsWith('/ws?'))return reply.code(404).send({error:'not_found'});
      return reply.type('text/html; charset=utf-8').sendFile('index.html');
    });
  }
  app.setErrorHandler((error,_req,reply)=>{if(error instanceof ZodError)return reply.code(400).send({error:'validation_error',issues:error.issues});const normalized=error as {statusCode?:number;message?:string};const status=normalized.statusCode??500;if(status>=500)app.log.error(error);return reply.code(status).send({error:normalized.message||'internal_error'});});
  startCleanup(app);
  return app;
}
