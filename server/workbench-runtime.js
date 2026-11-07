import {pathAt} from '../site/data-workbench.js';
import {resolveValue} from './service-runtime.js';
const fail=message=>{throw Error(message);};
export function readQuery(query){
 if(typeof query!=='string'||query.length>12000)fail('Use a read-only SQL query under 12,000 characters.');
 const lexical=query.replace(/'(?:''|[^'])*'/g,"''").replace(/"(?:""|[^"])*"/g,'""').replace(/--[^\n]*/g,' ').replace(/\/\*[\s\S]*?\*\//g,' ').trim().replace(/;\s*$/,'');
 if(!/^(SELECT|WITH)\b/i.test(lexical)||/;|\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|MERGE|TRUNCATE|EXEC(?:UTE)?|CALL|INTO|GRANT|REVOKE|COPY|LOAD|OUTFILE|DUMPFILE|OPENROWSET|OPENDATASOURCE)\b/i.test(lexical))fail('Only one SELECT/WITH statement is supported. Use a read-only database account.');
 return query.trim().replace(/;\s*$/,'');
}
export function boundedResult(data,engine){
 const rows=Array.isArray(data)?data:data?.rows;if(!Array.isArray(rows))fail('The data source did not return a row array.');if(rows.length>200)fail('More than 200 rows were returned. Narrow the query.');
 const result={engine,rows,rowCount:rows.length,readOnly:true};if(JSON.stringify(result,(_,v)=>typeof v==='bigint'?v.toString():v).length>150000)fail('Query output exceeds 150 KB. Select fewer columns or aggregate at the source.');return JSON.parse(JSON.stringify(result,(_,v)=>typeof v==='bigint'?v.toString():v));
}
const params=text=>{const value=JSON.parse(text||'[]');if(!Array.isArray(value)||value.length>50||value.some(v=>v!==null&&!['string','number','boolean'].includes(typeof v)))fail('Use at most 50 scalar bound parameters.');return value;};
function collection(name){if(typeof name!=='string'||!/^[a-zA-Z][a-zA-Z0-9_.-]{0,119}$/.test(name)||name.startsWith('system.'))fail('Use a regular collection name.');return name;}
function mongoFilter(value){if(!value||typeof value!=='object'||Array.isArray(value))fail('MongoDB filter must be a JSON object.');const inspect=v=>{if(v&&typeof v==='object')for(const [k,x]of Object.entries(v)){if(['$where','$function','$accumulator','__proto__','constructor','prototype'].includes(k))fail('Server-side JavaScript and unsafe keys are not supported.');inspect(x);}};inspect(value);return value;}
export async function queryWorkbench(engine,config,secret,{request,signal,drivers={}}={}){
 if(signal?.aborted)fail('Run cancelled.');if(!secret)fail('Configure the private '+engine+' connection first.');
 const limit=Number(config.limit||200);if(!Number.isInteger(limit)||limit<1||limit>200)fail('Query limit must be 1–200.');
 if(engine==='firestore'){
  if(!/^[a-z][a-z0-9-]{4,62}$/.test(secret.projectId||'')||!secret.key)fail('Configure a Firebase project ID and a Google OAuth access token with Firestore access.');
  const spec=JSON.parse(config.query||'{}');if(!spec||Array.isArray(spec)||typeof spec!=='object')fail('Structured query must be an object.');
  const data=await request('https://firestore.googleapis.com/v1/projects/'+secret.projectId+'/databases/(default)/documents:runQuery',{method:'POST',headers:{Authorization:'Bearer '+secret.key,'Content-Type':'application/json'},body:JSON.stringify({structuredQuery:{...spec,from:[{collectionId:collection(config.collection)}],limit:limit+1}}),signal});
  if(!Array.isArray(data))fail('Firestore did not acknowledge the query.');return boundedResult(data.filter(r=>r.document).map(r=>r.document),engine);
 }
 if(engine==='odbc'){
  const query=readQuery(config.query);const data=await request(new URL('/query',secret.baseUrl),{method:'POST',headers:{Authorization:'Bearer '+secret.key,'Content-Type':'application/json'},body:JSON.stringify({query,parameters:params(config.parameters),limit,readOnly:true}),signal});
  if(data?.readOnly!==true)fail('ODBC gateway did not confirm a read-only result.');return boundedResult(data,engine);
 }
 let client,transaction;
 try{
  if(engine==='mongo'){
   if(!/^mongodb(?:\+srv)?:\/\//.test(secret.connectionString||''))fail('Use a MongoDB connection URI.');const mod=drivers.mongo||await import('mongodb');client=new mod.MongoClient(secret.connectionString,{serverSelectionTimeoutMS:5000,connectTimeoutMS:5000,socketTimeoutMS:6000,maxPoolSize:1});await client.connect();const filter=mongoFilter(JSON.parse(config.query||'{}'));const data=await client.db().collection(collection(config.collection)).find(filter).maxTimeMS(5000).limit(limit+1).toArray();if(data.length>limit)fail('Query exceeds configured row limit.');return boundedResult(data,engine);
  }
  const query=readQuery(config.query),values=params(config.parameters);
  if(engine==='mysql'){
   const mod=drivers.mysql||await import('mysql2/promise');const url=new URL(secret.connectionString);if(!['mysql:','mysqls:'].includes(url.protocol))fail('Use a mysql:// or mysqls:// URI.');
   client=await mod.createConnection({host:url.hostname,port:Number(url.port)||3306,user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),database:url.pathname.slice(1),connectTimeout:5000,multipleStatements:false,rowsAsArray:false,...(url.protocol==='mysqls:'?{ssl:{rejectUnauthorized:true}}:{})});
   await client.query('SET SESSION MAX_EXECUTION_TIME=5000');await client.query('SET TRANSACTION READ ONLY');await client.beginTransaction();const [data]=await client.execute({sql:'SELECT * FROM ('+query+') AS th_read LIMIT '+(limit+1),timeout:6000},values);if(data.length>limit)fail('Query exceeds configured row limit.');return boundedResult(data,engine);
  }
  if(engine==='oracle'){
   const mod=drivers.oracle||await import('oracledb'),driver=mod.default||mod;const settings=JSON.parse(secret.connectionString);client=await driver.getConnection({user:settings.user,password:settings.password,connectString:settings.connectString});client.callTimeout=5000;await client.execute('SET TRANSACTION READ ONLY');const result=await client.execute('SELECT * FROM ('+query+') WHERE ROWNUM <= '+(limit+1),values,{outFormat:driver.OUT_FORMAT_OBJECT,maxRows:limit+1});if(result.rows.length>limit)fail('Query exceeds configured row limit.');return boundedResult(result.rows,engine);
  }
  if(engine==='sqlserver'){
   const mod=drivers.sqlserver||await import('mssql'),driver=mod.default||mod,settings=JSON.parse(secret.connectionString);client=await new driver.ConnectionPool({...settings,connectionTimeout:5000,requestTimeout:5000,pool:{max:1,min:0},options:{...settings.options,encrypt:true,trustServerCertificate:false,readOnlyIntent:true}}).connect();
   const req=client.request();values.forEach((value,i)=>req.input('p'+(i+1),value));const result=await req.query('SET ROWCOUNT '+(limit+1)+'; '+query+'; SET ROWCOUNT 0;');if(result.recordset.length>limit)fail('Query exceeds configured row limit. Add TOP or OFFSET/FETCH.');return boundedResult(result.recordset,engine);
  }
  fail('Unsupported database engine.');
 }catch(error){if(/^(Use |Only |Query |Expected |Configure |MongoDB |Server-side|More than)/.test(error.message))throw error;const code=String(error.code||error.errorNum||'connection-or-query').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,60);throw Error(engine+' read failed ('+code+'). Check the saved connection, read permissions, parameters and query syntax.');}
 finally{if(client){await client.rollback?.().catch(()=>{});await client.end?.().catch(()=>{});await client.close?.().catch(()=>{});}}
}
export async function readSource(type,config,input,{request,signal}={}){
 const raw=resolveValue(config.url,input,config);let url;try{url=new URL(raw);}catch{fail('Enter a valid source URL or map an input URL.');}
 if(type==='source_http'){const data=await request(url,{signal});const selected=config.path?pathAt(data,config.path):data;return Array.isArray(selected)?boundedResult(selected,'https'): {source:url.href,retrievedAt:new Date().toISOString(),data:selected};}
 const host=url.hostname.toLowerCase();let endpoint;
 if(['youtube.com','www.youtube.com','youtu.be','m.youtube.com'].includes(host))endpoint='https://www.youtube.com/oembed?format=json&url='+encodeURIComponent(url.href);
 else if(['tiktok.com','www.tiktok.com'].includes(host))endpoint='https://www.tiktok.com/oembed?url='+encodeURIComponent(url.href);
 else fail('Use a canonical YouTube or TikTok video URL.');
 const data=await request(endpoint,{signal});const transcript=pathAt(input,config.transcriptField);return {source:url.href,title:data.title||'',author:data.author_name||'',provider:data.provider_name||'',transcript:typeof transcript==='string'?transcript.slice(0,60000):null,transcriptSource:typeof transcript==='string'?'user-supplied':'not-provided',retrievedAt:new Date().toISOString()};
}
