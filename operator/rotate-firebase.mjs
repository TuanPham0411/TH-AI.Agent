import {createPrivateKey,createPublicKey,createHash,sign} from 'node:crypto';
import {createRequire} from 'node:module';
const PROJECT='ai-agent-67316',OWNER='eric.scorp93@gmail.com';
const fail=code=>{throw Object.assign(Error(code),{rotationCode:code});};
const fingerprint=key=>createHash('sha256').update(createPublicKey(key).export({type:'spki',format:'der'})).digest('hex');
export function validatedAccount(sa){
 if(sa?.type!=='service_account'||sa.project_id!==PROJECT||!String(sa.client_email).endsWith('@'+PROJECT+'.iam.gserviceaccount.com'))fail('service-account-project-mismatch');
 let key;try{key=createPrivateKey(sa.private_key);}catch{fail('invalid-private-key');}
 if(key.asymmetricKeyType!=='rsa'||key.asymmetricKeyDetails.modulusLength<2048)fail('invalid-private-key');
 return {project_id:sa.project_id,client_email:sa.client_email,private_key:sa.private_key};
}
export async function probeFirestore(sa,{request=fetch}={}){
 const now=Math.floor(Date.now()/1000),encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');const header=encode({alg:'RS256',typ:'JWT'})+'.'+encode({iss:sa.client_email,scope:'https://www.googleapis.com/auth/datastore',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});const assertion=header+'.'+sign('RSA-SHA256',Buffer.from(header),sa.private_key).toString('base64url');
 const tokenResponse=await request('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(15000)});if(!tokenResponse.ok)fail('new-service-account-authentication-failed');const token=await tokenResponse.json();if(!token.access_token)fail('new-service-account-authentication-failed');
 const response=await request('https://firestore.googleapis.com/v1/projects/'+PROJECT+'/databases/(default)/documents/agentStudioUsers?pageSize=1',{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(15000)});if(!response.ok)fail('new-service-account-firestore-permission-failed');return true;
}
export async function rotateAccount({pool,serviceAccount,probe=probeFirestore,now=()=>new Date().toISOString()}){
 const account=validatedAccount(serviceAccount);await probe(account);const digest=fingerprint(account.private_key),db=await pool.connect();
 try{await db.query('BEGIN');const old=(await db.query("SELECT secret FROM ai_credentials WHERE id='_studio_control' FOR UPDATE")).rows[0]?.secret;if(old?.web?.projectId!==PROJECT)fail('saved-firebase-project-mismatch');
  if(old.serviceAccount?.client_email===account.client_email&&old.serviceAccount?.private_key&&fingerprint(old.serviceAccount.private_key)===digest){await db.query('ROLLBACK');return {alreadyCurrent:true,projectId:PROJECT,firestoreVerified:true};}
  const at=now(),next={...old,version:(old.version||0)+1,serviceAccount:account,verifiedAt:at};const audit=(await db.query("SELECT secret FROM ai_credentials WHERE id='_studio_audit'")).rows[0]?.secret?.events||[];
  await db.query('INSERT INTO ai_credentials(id,secret) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET secret=excluded.secret,updated_at=now()',['_studio_control',JSON.stringify(next)]);
  await db.query('INSERT INTO ai_credentials(id,secret) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET secret=excluded.secret,updated_at=now()',['_studio_audit',JSON.stringify({events:[{at,actor:OWNER,event:'firebase.service_account.rotated'},...audit].slice(0,200)})]);
  await db.query('COMMIT');
  const saved=(await pool.query("SELECT secret FROM ai_credentials WHERE id='_studio_control'")).rows[0]?.secret;if(saved?.serviceAccount?.project_id!==PROJECT||fingerprint(saved.serviceAccount.private_key)!==digest)fail('saved-credential-readback-failed');
  return {rotated:true,projectId:PROJECT,firestoreVerified:true,durable:true,revision:saved.version};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();}
}
export async function main(){let pool;try{let text='';for await(const chunk of process.stdin){text+=chunk;if(text.length>100000)fail('operator-input-too-large');}const packet=JSON.parse(text),require=createRequire(process.cwd()+'/package.json'),pg=require('pg');const {managedPool}=await import('data:text/javascript;base64,'+Buffer.from(packet.clientSource).toString('base64'));if(process.env.TH_STORAGE_MODE!=='drive-first')fail('drive-first-storage-required');pool=managedPool(new pg.Pool({connectionString:process.env.DATABASE_URL,max:2,connectionTimeoutMillis:5000}),'ai-agent');console.log(JSON.stringify(await rotateAccount({pool,serviceAccount:packet.serviceAccount})));}catch(error){console.error(JSON.stringify({rotationFailed:true,code:error.rotationCode||'storage-or-network-unavailable',credentialContentsRedacted:true}));process.exitCode=1;}finally{await pool?.end();}}
if(process.env.TH_FIREBASE_ROTATE_MAIN==='1')await main();
