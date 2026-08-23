import type { FastifyInstance } from 'fastify';
import { resolvePrincipal } from './auth.js';

interface SocketLike { readyState:number; send(data:string):void; close(code?:number,reason?:string):void; on(event:string,listener:(data:any)=>void):void; }

export async function realtimeRoutes(app:FastifyInstance){
  const clients=new Map<SocketLike,{trusted:boolean;deviceId?:string}>();
  app.decorate('broadcast',(event:unknown,trustedOnly=false,deviceIds?:string[],temporaryOnly=false)=>{const data=JSON.stringify(event);for(const [socket,meta] of clients)if(socket.readyState===1&&(!trustedOnly||meta.trusted)&&(!temporaryOnly||!meta.trusted)&&(!deviceIds?.length||(meta.deviceId&&deviceIds.includes(meta.deviceId))))socket.send(data);});
  app.get('/ws',{websocket:true},(socket,req)=>{const p=resolvePrincipal(app,req);if(!p){socket.close(1008,'unauthorized');return;}clients.set(socket,{trusted:p.kind==='device',deviceId:p.deviceId});socket.send(JSON.stringify({type:'connected',trusted:p.kind==='device'}));socket.on('close',()=>clients.delete(socket));socket.on('message',(raw:unknown)=>{if(String(raw)==='ping')socket.send(JSON.stringify({type:'pong'}));});});
}
