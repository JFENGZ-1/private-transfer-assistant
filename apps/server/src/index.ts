import { buildApp } from './app.js';

const app=await buildApp();
await app.listen({host:app.config.host,port:app.config.port});
