import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { requireAuth } from './auth.js';

const templateBody=z.object({name:z.string().trim().min(1).max(80),content:z.string().min(1).max(1_000_000),tags:z.array(z.string().max(40)).max(20).default([])});
const present=(row:Record<string,unknown>)=>({...row,tags:JSON.parse(String(row.tags??'[]')) as string[]});
export async function templateRoutes(app:FastifyInstance){
  app.get('/api/templates',{preHandler:requireAuth(app)},async()=>({items:(app.db.prepare('SELECT id,name,content,tags,created_at AS createdAt,updated_at AS updatedAt FROM text_templates ORDER BY updated_at DESC').all() as Record<string,unknown>[]).map(present)}));
  app.post('/api/templates',{preHandler:requireAuth(app)},async(req,reply)=>{const body=templateBody.parse(req.body),id=nanoid(),ts=Date.now();app.db.prepare('INSERT INTO text_templates(id,name,content,tags,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,body.name,body.content,JSON.stringify(body.tags),ts,ts);return reply.code(201).send({id,...body,createdAt:ts,updatedAt:ts});});
  app.patch('/api/templates/:id',{preHandler:requireAuth(app)},async(req,reply)=>{const {id}=z.object({id:z.string()}).parse(req.params),body=templateBody.partial().parse(req.body);const current=app.db.prepare('SELECT id FROM text_templates WHERE id=?').get(id);if(!current)return reply.code(404).send({error:'not_found'});const sets=['updated_at=@updated'],values:Record<string,unknown>={id,updated:Date.now()};for(const key of ['name','content','tags'] as const)if(body[key]!==undefined){sets.push(`${key}=@${key}`);values[key]=key==='tags'?JSON.stringify(body[key]):body[key];}app.db.prepare(`UPDATE text_templates SET ${sets.join(',')} WHERE id=@id`).run(values);return present(app.db.prepare('SELECT id,name,content,tags,created_at AS createdAt,updated_at AS updatedAt FROM text_templates WHERE id=?').get(id) as Record<string,unknown>);});
  app.delete('/api/templates/:id',{preHandler:requireAuth(app)},async(req)=>{const {id}=z.object({id:z.string()}).parse(req.params);return {ok:true,deleted:app.db.prepare('DELETE FROM text_templates WHERE id=?').run(id).changes};});
}
