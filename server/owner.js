import express from 'express';
import {administrationRoutes} from './administration.js';
import {studioRoutes} from './studio.js';
import {randomBytes,createHash} from 'node:crypto';
import {brokerRequest} from './th-storage/client.mjs';
const origin='https://ai.th.io.vn';
const hash=value=>createHash('sha256').update(value).digest('hex');
const cookie=(req,name)=>{const value=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='));return value?value.slice(name.length+1):'';};
export function ownerRoutes({pool,request=bodyRequest,studio=studioRoutes({pool})}={}){
 const router=express.Router();router.use(express.json({limit:'512kb'}));
 const run=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 const session=req=>request('/v1/auth/session',{session:cookie(req,'__Host-th-ai')});
 router.use(administrationRoutes({pool,session}));
 router.get('/auth/session',run(async(req,res)=>res.json(await session(req))));
 router.get('/oauth/start',run(async(req,res)=>{const nonce=randomBytes(32).toString('hex');const value=await request('/v1/auth/start',{binding:hash(nonce)});res.cookie('__Host-th-ai-state',nonce,{secure:true,httpOnly:true,sameSite:'lax',path:'/',maxAge:600000});res.redirect(value.url);}));
 router.get('/oauth/callback',(req,res,next)=>{if(!String(req.query.state||'').startsWith('thsheet_'))return next();session(req).then(owner=>{if(!owner.authenticated)return res.status(401).send('Sign in before connecting Google Sheets.');req.owner=owner;return studio.oauthCallback(req,res);}).catch(next);});
 router.get('/oauth/callback',run(async(req,res)=>{const nonce=cookie(req,'__Host-th-ai-state');if(!/^[a-f0-9]{64}$/.test(nonce))return res.status(400).json({error:'Sign-in state expired; start again'});const value=await request('/v1/auth/callback',{state:req.query.state,code:req.query.code,binding:hash(nonce)});res.clearCookie('__Host-th-ai-state',{secure:true,httpOnly:true,sameSite:'lax',path:'/'});res.cookie('__Host-th-ai',value.session,{secure:true,httpOnly:true,sameSite:'lax',path:'/',maxAge:Math.max(0,value.expires-Date.now())});res.redirect('/');}));
 router.use((req,res,next)=>{if(['POST','PUT','PATCH','DELETE'].includes(req.method)&&req.headers.origin!==origin)return res.status(403).json({error:'Same-origin request required'});next();});
 router.post('/auth/logout',run(async(req,res)=>{await request('/v1/auth/logout',{session:cookie(req,'__Host-th-ai')});res.clearCookie('__Host-th-ai',{secure:true,httpOnly:true,sameSite:'lax',path:'/'});res.json({authenticated:false});}));
 router.use((req,res,next)=>{session(req).then(owner=>{if(!owner.authenticated)return res.status(401).json({error:'Owner sign-in required'});req.owner=owner;next();}).catch(next);});
 router.use(studio.router);
 router.get('/drafts',run(async(req,res)=>{const {rows}=await pool.query('SELECT id,title,revision,updated_at FROM ai_drafts ORDER BY updated_at DESC LIMIT 200');res.json({drafts:rows});}));
 router.get('/drafts/:id',run(async(req,res)=>{if(!uuid(req.params.id))return res.status(400).json({error:'Invalid draft'});const {rows}=await pool.query('SELECT * FROM ai_drafts WHERE id=$1',[req.params.id]);if(!rows.length)return res.status(404).json({error:'Draft not found'});res.json(rows[0]);}));
 router.put('/drafts/:id',run(async(req,res)=>{
  if(!req.body||!uuid(req.params.id)||!Number.isSafeInteger(req.body.revision)||req.body.revision<0||!req.body.content||Object.keys(req.body.content).some(k=>!['goal','context','constraints','format'].includes(k))||!['goal','context','constraints','format'].every(k=>typeof req.body.content[k]==='string'&&req.body.content[k].length<=12000))return res.status(400).json({error:'Invalid draft fields'});
  const db=await pool.connect();try{await db.query('BEGIN');const title=Array.from(req.body.content.goal.trim()).slice(0,120).join('')||'Untitled';let result;
   if(req.body.revision===0)result=await db.query('INSERT INTO ai_drafts(id,title,content,revision) VALUES($1,$2,$3,1) ON CONFLICT DO NOTHING RETURNING id,revision,updated_at',[req.params.id,title,JSON.stringify(req.body.content)]);
   else result=await db.query('UPDATE ai_drafts SET title=$2,content=$3,revision=revision+1,updated_at=now() WHERE id=$1 AND revision=$4 RETURNING id,revision,updated_at',[req.params.id,title,JSON.stringify(req.body.content),req.body.revision]);
   if(!result.rowCount){await db.query('ROLLBACK');return res.status(409).json({error:'Draft changed elsewhere; reload before saving'});}await db.query('COMMIT');res.json({...result.rows[0],durable:true});
  }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();}
 }));
 router.get('/preferences',run(async(req,res)=>{const {rows}=await pool.query('SELECT value FROM ai_preferences WHERE id=true');res.json(rows[0]?.value||{});}));
 router.put('/preferences',run(async(req,res)=>{const {language,theme}=req.body||{};if(!['vi','en'].includes(language)||!['dark','light','system'].includes(theme))return res.status(400).json({error:'Invalid preferences'});await pool.query('INSERT INTO ai_preferences(id,value) VALUES(true,$1) ON CONFLICT(id) DO UPDATE SET value=excluded.value',[JSON.stringify({language,theme})]);res.json({durable:true});}));
 router.use((error,req,res,next)=>{if(res.headersSent)return next(error);res.status(error.status===400?400:503).json({error:'Save or sign-in was not acknowledged. Retry after checking the connection.'});});
 return router;
}
function uuid(value){return typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);}
function bodyRequest(path,body){return brokerRequest({socketPath:process.env.TH_STORAGE_SOCKET,token:process.env.TH_STORAGE_TOKEN,application:'ai-agent'},path,body);}
