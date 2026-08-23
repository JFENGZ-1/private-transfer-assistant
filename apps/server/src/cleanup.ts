import type { FastifyInstance } from 'fastify';
import { setting } from './db.js';
import { purgeDeleted } from './messages.js';

const day=86_400_000;
const days=(app:FastifyInstance,key:string,fallback:number)=>Math.max(1,Number(setting(app.db,key)??fallback));

export async function runCleanup(app:FastifyInstance){
  const now=Date.now(),imageCutoff=now-days(app,'images_days',30)*day,fileCutoff=now-days(app,'files_days',7)*day,downloadedEarlier=setting(app.db,'downloaded_earlier')==='true';
  const candidates=app.db.prepare(`SELECT m.id FROM messages m LEFT JOIN message_downloads md ON md.message_id=m.id WHERE m.deleted_at IS NULL AND m.favorite=0 AND m.pinned=0 AND m.type='file' AND (((m.mime LIKE 'image/%' AND m.created_at<=?) OR ((m.mime IS NULL OR m.mime NOT LIKE 'image/%') AND m.created_at<=?)) OR (?=1 AND md.last_downloaded_at<=?)) ORDER BY m.created_at LIMIT 200`).all(imageCutoff,fileCutoff,Number(downloadedEarlier),now-day) as {id:string}[];
  if(candidates.length){const placeholders=candidates.map(()=>'?').join(',');app.db.transaction(()=>{app.db.prepare(`UPDATE messages SET deleted_at=?,updated_at=? WHERE id IN (${placeholders})`).run(now,now,...candidates.map(x=>x.id));app.db.prepare(`UPDATE shares SET revoked_at=? WHERE message_id IN (${placeholders}) AND revoked_at IS NULL`).run(now,...candidates.map(x=>x.id));})();for(const row of candidates)app.broadcast({type:'message.deleted',id:row.id});}
  const purged=await purgeDeleted(app,now-days(app,'trash_days',7)*day,200);
  app.db.prepare('DELETE FROM download_tokens WHERE expires_at<=?').run(now);app.db.prepare('DELETE FROM sessions WHERE expires_at<=? OR revoked_at IS NOT NULL').run(now);app.db.prepare('DELETE FROM shares WHERE expires_at<=? OR revoked_at IS NOT NULL').run(now);app.db.prepare('DELETE FROM drops WHERE expires_at<=? OR revoked_at IS NOT NULL').run(now);
  return {trashed:candidates.length,...purged};
}

export function startCleanup(app:FastifyInstance){
  if(!app.config.cleanupEnabled)return;
  let running=false;const execute=async()=>{if(running)return;running=true;try{await runCleanup(app);}catch(error){app.log.error(error,'automatic cleanup failed');}finally{running=false;}};
  const timer=setInterval(()=>void execute(),Math.max(60_000,app.config.cleanupIntervalMs));timer.unref();setImmediate(()=>void execute());app.addHook('onClose',async()=>clearInterval(timer));
}
