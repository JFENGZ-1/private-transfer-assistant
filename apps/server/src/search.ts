import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from './auth.js';
import { setting } from './db.js';

const queryBoolean=z.preprocess(v=>typeof v==='string'?(v==='true'||v==='1'?true:v==='false'||v==='0'?false:v):v,z.boolean());
const columnMap={text:['content','note','tags'],fileName:['file_name'],ocr:['ocr_text']} as const;

export function safeFtsQuery(input:string,columns:string[]):string|undefined{
  const tokens=input.normalize('NFKC').match(/[\p{L}\p{N}_]+/gu)?.slice(0,20);if(!tokens?.length||!columns.length)return;
  const expression=tokens.map(token=>`"${token.replaceAll('"','""')}"`).join(' AND ');return `{${columns.join(' ')}} : (${expression})`;
}

export async function searchRoutes(app:FastifyInstance){
  app.get('/api/search',{preHandler:requireAuth(app)},async req=>{
    const q=z.object({q:z.string().min(1).max(200),images:queryBoolean.default(true),scope:z.string().max(80).optional(),type:z.enum(['all','text','file','image','document','archive','other']).default('all'),favorite:queryBoolean.optional(),pinned:queryBoolean.optional(),privateOnly:queryBoolean.default(false),deviceId:z.string().optional(),from:z.coerce.number().optional(),to:z.coerce.number().optional(),limit:z.coerce.number().int().min(1).max(100).default(50)}).parse(req.query),p=req.principal!;
    if(q.privateOnly&&p.kind!=='device')return {items:[],pendingOcr:0};
    const requested=(q.scope?.split(',').filter((value):value is keyof typeof columnMap=>value in columnMap)??['text','fileName','ocr']),ocrEnabled=setting(app.db,'ocr_enabled')!=='false',scopes=requested.filter(value=>value!=='ocr'||(q.images&&ocrEnabled)),columns=[...new Set(scopes.flatMap(value=>columnMap[value]))],query=safeFtsQuery(q.q,columns);if(!query)return {items:[],pendingOcr:0};
    const where=["m.deleted_at IS NULL",p.kind==='device'?"1=1":"m.visibility='normal'",`(NOT EXISTS(SELECT 1 FROM message_targets mt WHERE mt.message_id=m.id) ${p.deviceId?'OR m.source_device_id=@principalDevice OR EXISTS(SELECT 1 FROM message_targets mt WHERE mt.message_id=m.id AND mt.device_id=@principalDevice)':''})`];
    if(q.type==='text')where.push("m.type='text'");if(q.type==='file')where.push("m.type='file'");if(q.type==='image')where.push("m.mime LIKE 'image/%'");
    if(q.type==='document')where.push("m.type='file' AND (m.mime LIKE 'text/%' OR m.mime IN ('application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation') OR lower(m.file_name) GLOB '*.doc*' OR lower(m.file_name) GLOB '*.xls*' OR lower(m.file_name) GLOB '*.ppt*')");
    if(q.type==='archive')where.push("m.type='file' AND (m.mime IN ('application/zip','application/x-rar-compressed','application/x-7z-compressed','application/gzip','application/x-tar') OR lower(m.file_name) GLOB '*.zip' OR lower(m.file_name) GLOB '*.rar' OR lower(m.file_name) GLOB '*.7z' OR lower(m.file_name) GLOB '*.tar*' OR lower(m.file_name) GLOB '*.gz')");
    if(q.type==='other')where.push("m.type='file' AND (m.mime IS NULL OR m.mime NOT LIKE 'image/%') AND COALESCE(m.mime,'') NOT LIKE 'text/%' AND COALESCE(m.mime,'') NOT IN ('application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/zip','application/x-rar-compressed','application/x-7z-compressed','application/gzip','application/x-tar')");
    if(q.favorite!==undefined)where.push('m.favorite=@favorite');if(q.pinned!==undefined)where.push('m.pinned=@pinned');if(q.privateOnly)where.push("m.visibility='trusted_only'");if(q.deviceId)where.push('m.source_device_id=@sourceDevice');if(q.from)where.push('m.created_at>=@from');if(q.to)where.push('m.created_at<=@to');
    const params={query,principalDevice:p.deviceId,favorite:Number(q.favorite),pinned:Number(q.pinned),sourceDevice:q.deviceId,from:q.from,to:q.to,limit:q.limit},items=app.db.prepare(`SELECT m.id,m.type,m.content,m.file_name AS fileName,m.mime,m.size,m.visibility,m.favorite,m.pinned,m.created_at AS createdAt,snippet(messages_fts,-1,'<mark>','</mark>','…',18) AS snippet FROM messages_fts f JOIN messages m ON m.id=f.message_id WHERE messages_fts MATCH @query AND ${where.join(' AND ')} ORDER BY bm25(messages_fts),m.created_at DESC LIMIT @limit`).all(params);
    const pendingOcr=scopes.includes('ocr')?(app.db.prepare(`SELECT count(*) AS count FROM messages m WHERE m.deleted_at IS NULL AND m.ocr_status IN ('pending','processing') AND ${p.kind==='device'?"1=1":"m.visibility='normal'"} AND (NOT EXISTS(SELECT 1 FROM message_targets mt WHERE mt.message_id=m.id) ${p.deviceId?'OR m.source_device_id=@principalDevice OR EXISTS(SELECT 1 FROM message_targets mt WHERE mt.message_id=m.id AND mt.device_id=@principalDevice)':''})`).get({principalDevice:p.deviceId}) as {count:number}).count:0;
    return {items,pendingOcr};
  });
}
