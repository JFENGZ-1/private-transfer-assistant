import type { FastifyInstance } from 'fastify';
import { setting } from './db.js';
import { purgeDeleted } from './messages.js';

const day=86_400_000;
const days=(app:FastifyInstance,key:string,fallback=-1)=>{const value=Number(setting(app.db,key)??fallback);return Number.isFinite(value)&&value>0?value:-1;};

export async function runCleanup(app:FastifyInstance){
  const now=Date.now(),imageDays=days(app,'images_days'),fileDays=days(app,'files_days'),trashDays=days(app,'trash_days'),downloadedEarlier=setting(app.db,'downloaded_earlier')==='true',clauses:string[]=[],params:number[]=[];
  if(imageDays>0){clauses.push("(m.mime LIKE 'image/%' AND m.created_at<=?)");params.push(now-imageDays*day);}if(fileDays>0){clauses.push("((m.mime IS NULL OR m.mime NOT LIKE 'image/%') AND m.created_at<=?)");params.push(now-fileDays*day);}if(downloadedEarlier){clauses.push('md.last_downloaded_at<=?');params.push(now-day);}
  const candidates=clauses.length?app.db.prepare(`SELECT m.id FROM messages m LEFT JOIN message_downloads md ON md.message_id=m.id WHERE m.deleted_at IS NULL AND m.favorite=0 AND m.pinned=0 AND m.type='file' AND (${clauses.join(' OR ')}) ORDER BY m.created_at LIMIT 200`).all(...params) as {id:string}[]:[];
  if(candidates.length){const placeholders=candidates.map(()=>'?').join(',');app.db.transaction(()=>{app.db.prepare(`UPDATE messages SET deleted_at=?,updated_at=? WHERE id IN (${placeholders})`).run(now,now,...candidates.map(x=>x.id));app.db.prepare(`UPDATE shares SET revoked_at=? WHERE message_id IN (${placeholders}) AND revoked_at IS NULL`).run(now,...candidates.map(x=>x.id));})();for(const row of candidates)app.broadcast({type:'message.deleted',id:row.id});}
  const purged=trashDays>0?await purgeDeleted(app,now-trashDays*day,200):{deletedMessages:0,deletedBlobs:0};
  app.db.prepare('DELETE FROM download_tokens WHERE expires_at<=?').run(now);app.db.prepare('DELETE FROM sessions WHERE expires_at<=? OR revoked_at IS NOT NULL').run(now);app.db.prepare('DELETE FROM shares WHERE expires_at<=? OR revoked_at IS NOT NULL').run(now);app.db.prepare('DELETE FROM drops WHERE expires_at<=? OR revoked_at IS NOT NULL').run(now);
  return {trashed:candidates.length,...purged};
}

export function startCleanup(app:FastifyInstance){
  if(!app.config.cleanupEnabled)return;
  let running=false;const execute=async()=>{if(running)return;running=true;try{await runCleanup(app);}catch(error){app.log.error(error,'automatic cleanup failed');}finally{running=false;}};
  const timer=setInterval(()=>void execute(),Math.max(60_000,app.config.cleanupIntervalMs));timer.unref();setImmediate(()=>void execute());app.addHook('onClose',async()=>clearInterval(timer));
}
