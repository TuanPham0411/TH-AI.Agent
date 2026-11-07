import {randomUUID} from 'node:crypto';
import {recordProof,connectionProof} from './connection-proof.js';
import {serviceAccessToken,tiktokAccessToken} from './service-runtime.js';
import {googleScopes} from '../site/connectors.js';
export const channelIdOK=id=>/^channel_[a-f0-9-]{36}$/i.test(id||'');
export const channelProvider={facebook:'meta',youtube:'google',tiktok:'tiktok',threads:'threads'};
export function channelPublic(id,secret){return {id,platform:secret.platform,accountId:secret.accountId,name:secret.name,configured:!!(secret.key||secret.refreshToken),verification:connectionProof(secret),scopes:secret.scopes||[],updatedAt:secret.updatedAt};}
export function mountSocialChannels(router,{pool,getSecret,setSecret,request,route}){
 router.get('/studio/channels',route(async(req,res)=>{const rows=(await pool.query("SELECT id,secret FROM ai_credentials WHERE id LIKE 'channel_%' ORDER BY updated_at DESC LIMIT 100")).rows;res.set('Cache-Control','no-store').json({channels:rows.filter(r=>channelIdOK(r.id)).map(r=>channelPublic(r.id,r.secret))});}));
 router.put('/studio/channels/:id',route(async(req,res)=>{
  const id=req.params.id==='new'?'channel_'+randomUUID():req.params.id;if(!channelIdOK(id))throw Error('Invalid channel ID.');
  const old=await getSecret(id)||{},b=req.body||{};if(!channelProvider[b.platform]||!/^[-\w]{1,120}$/.test(b.accountId||'')||typeof b.name!=='string'||!b.name.trim()||b.name.length>100)throw Error('Enter a channel name, platform and exact account ID.');
  const same=old.platform===b.platform&&old.accountId===b.accountId;
  const secret={...(same?old:{}),platform:b.platform,accountId:b.accountId,name:b.name.trim(),updatedAt:new Date().toISOString()};
  for(const key of ['key','clientId','clientSecret','refreshToken'])if(b[key]){if(typeof b[key]!=='string'||b[key].length>8000)throw Error('Invalid connection value.');secret[key]=b[key].trim();}
  if(b.platform==='youtube'){if(!secret.clientId||!secret.clientSecret){const shared=await getSecret('google');secret.clientId=secret.clientId||shared?.clientId;secret.clientSecret=secret.clientSecret||shared?.clientSecret;}if(!secret.clientId||!secret.clientSecret)throw Error('Save a Google OAuth client in Connections, or provide the client ID and secret.');if(secret.refreshToken)secret.scopes=[googleScopes.youtube_upload,googleScopes.youtube_read,googleScopes.youtube_comments];}else if(!secret.key)throw Error('Enter this channel’s access token.');
  delete secret._verification;delete secret.accessToken;delete secret.expires;await setSecret(id,secret);res.set('Cache-Control','no-store').json({channel:channelPublic(id,secret),durable:true});
 }));
 router.post('/studio/channels/:id/check',route(async(req,res)=>{
  if(!channelIdOK(req.params.id))throw Error('Invalid channel ID.');const secret=await getSecret(req.params.id);if(!secret)throw Error('Channel not found.');const provider=channelProvider[secret.platform];let result,account;
  const scopedSet=(_,value,opts)=>setSecret(req.params.id,value,opts);
  const token=provider==='google'?await serviceAccessToken('google',secret,{request,setSecret:scopedSet,scope:googleScopes.youtube_upload}):provider==='tiktok'?await tiktokAccessToken(secret,{request,setSecret:scopedSet}):secret.key;
  const headers={Authorization:'Bearer '+token};
  if(provider==='meta'){result=await request('https://graph.facebook.com/v24.0/me?fields=id,name',{headers});account=result.id;}
  else if(provider==='google'){result=await request('https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true',{headers});account=result.items?.find(c=>c.id===secret.accountId)?.id;}
  else if(provider==='tiktok'){result=await request('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name',{headers});account=result.data?.user?.open_id;}
  else{result=await request('https://graph.threads.net/v1.0/me?fields=id,username',{headers});account=result.id;}
  if(String(account)!==secret.accountId)throw Error('The authorized token does not belong to the configured channel.');
  const verified=recordProof(await getSecret(req.params.id),{source:'channel-identity'});await setSecret(req.params.id,verified,{refresh:true});res.set('Cache-Control','no-store').json({channel:channelPublic(req.params.id,verified),durable:true,note:'Identity verified. Publishing scopes, media, app review and privacy are checked when publishing.'});
 }));
 router.delete('/studio/channels/:id',route(async(req,res)=>{if(!channelIdOK(req.params.id))throw Error('Invalid channel ID.');await pool.query('DELETE FROM ai_credentials WHERE id=$1',[req.params.id]);res.json({removed:true,durable:true});}));
}
