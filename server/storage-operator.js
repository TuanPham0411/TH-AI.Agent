import {downloadFile} from './th-storage/client.mjs';
import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {baseline,restore,operatorBroker,verifyWriteThrough} from './th-storage/operator.mjs';
export async function runStorageOperator({action=process.argv[2],makeClient=config=>new pg.Client(config),makePool=config=>new pg.Pool(config),verify=verifyWriteThrough,broker=operatorBroker,log=value=>console.log(JSON.stringify(value)),closeTimeout=10000}={}){
 if(action==='probe'){
  // Probe uses a pool; do not open an unrelated idle Client that can emit an
  // unhandled network error while verification/cleanup is in progress.
  const pool=makePool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:10000,allowExitOnIdle:true});pool.on('error',()=>{});let result;
  try{result=await verify(pool,broker('ai-agent'));}finally{let timer;try{await Promise.race([pool.end(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Probe database cleanup exceeded 10 seconds.')),closeTimeout);})]);}finally{clearTimeout(timer);}}
  log(result);return result;
 }
 const db=makeClient({connectionString:process.env.DATABASE_URL,options:'-c th_storage.authorized=1'});await db.connect();db.on('error',()=>{});
 try{if(action==='install'){await db.query(await readFile(join(dirname(process.argv[1]),'storage-capture.sql'),'utf8'));console.log('Storage capture installed');}
 else if(action==='baseline')log(await baseline(db,broker('ai-agent')));
 else if(action==='restore-empty')log(await restore(db,broker('ai-agent'),{confirmEmpty:true,restoreFile:file=>downloadFile({application:'ai-agent',socketPath:process.env.TH_STORAGE_SOCKET,token:process.env.TH_STORAGE_TOKEN},file,process.env.FILES_ROOT||'/data/files')}));
 else throw Error('Choose install, baseline, probe or restore-empty');}finally{await db.end();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))runStorageOperator().catch(()=>{console.error('Storage operator failed; production data retained. Check broker availability, identity and recovery target.');process.exitCode=1;setTimeout(()=>process.exit(1),1000);});
