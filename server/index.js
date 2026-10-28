import pg from 'pg';
import {createApp} from './app.js';
const production=process.env.NODE_ENV==='production';
const pool=process.env.DATABASE_URL?new pg.Pool({connectionString:process.env.DATABASE_URL,max:2,connectionTimeoutMillis:3000,statement_timeout:3000}):null;
const app=createApp({production,checkDatabase:pool?async()=>{await pool.query('SELECT version FROM ai_schema_migrations WHERE version = 1').then(r=>{if(!r.rowCount)throw Error('Migration missing');});}:undefined});
const server=app.listen(Number(process.env.PORT||3100),process.env.HOST||'127.0.0.1',()=>console.log('TH-AI API started'));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{const timer=setTimeout(()=>process.exit(1),10000);timer.unref();server.close(async()=>{await pool?.end();clearTimeout(timer);process.exit(0);});});
