import {managedPool} from './th-storage/client.mjs';
import pg from 'pg';
import {studioRoutes} from './studio.js';
import {ownerRoutes} from './owner.js';
import {createApp} from './app.js';
const production=process.env.NODE_ENV==='production';
const pool=process.env.DATABASE_URL?managedPool(new pg.Pool({connectionString:process.env.DATABASE_URL,max:2,connectionTimeoutMillis:3000,statement_timeout:3000}),'ai-agent'):null;
const studio=pool&&process.env.TH_STORAGE_MODE==='drive-first'?studioRoutes({pool}):null;
const app=createApp({production,internalRouter:studio?.internal,ownerRouter:pool&&process.env.TH_STORAGE_MODE==='drive-first'?ownerRoutes({pool,studio}):undefined,checkDatabase:pool?async()=>{await pool.query('SELECT version FROM ai_schema_migrations WHERE version = $1',[process.env.TH_STORAGE_MODE==='drive-first'?3:1]).then(r=>{if(!r.rowCount)throw Error('Migration missing');});}:undefined});
const server=app.listen(Number(process.env.PORT||3100),process.env.HOST||'127.0.0.1',()=>console.log('TH-AI API started'));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{const timer=setTimeout(()=>process.exit(1),10000);timer.unref();server.close(async()=>{await pool?.end();clearTimeout(timer);process.exit(0);});});

