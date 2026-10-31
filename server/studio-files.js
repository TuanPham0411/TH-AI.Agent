import express from 'express';
import {mkdir,open,rename,unlink,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {confinedFile} from './th-storage/attachments.mjs';
const maximum=16*1024*1024,chunkSize=256*1024;
const fail=message=>{throw Error(message);};
export const fileRoot=()=>process.env.FILES_ROOT||'/var/lib/th-ai/files';
const safeName=value=>String(value||'file').replace(/[\\/\x00-\x1f\x7f]/g,'_').slice(0,180);
export function detectedType(bytes,requested='application/octet-stream',name='file'){
 if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if(/^GIF8[79]a/.test(bytes.subarray(0,6).toString()))return 'image/gif';
 if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')return 'image/webp';
 if(bytes.subarray(0,5).toString()==='%PDF-')return 'application/pdf';
 if(bytes.subarray(4,8).toString()==='ftyp')return 'video/mp4';
 if(bytes.subarray(0,4).equals(Buffer.from([26,69,223,163])))return 'video/webm';
 if(bytes.subarray(0,2).toString()==='PK')return /\.(docx|xlsx|pptx)$/i.test(name)?'application/vnd.openxmlformats-officedocument.'+({docx:'wordprocessingml.document',xlsx:'spreadsheetml.sheet',pptx:'presentationml.presentation'})[name.split('.').at(-1).toLowerCase()]:'application/zip';
 if((/^text\//.test(requested)||/\.(txt|md|csv|json|js|ts|jsx|tsx|py|css|html|xml|sql|yaml|yml|log|sh)$/i.test(name))&&!bytes.includes(0))return 'text/plain';
 if(/^(image|video)\//.test(requested)||requested==='application/pdf')fail('The file bytes do not match a supported image, video or PDF format.');
 return 'application/octet-stream';
}
export const fileDescriptor=row=>({id:row.id,name:row.name,type:row.type,size:Number(row.size),url:'/api/studio/files/'+row.id});
export function studioFileRoutes({pool,root=fileRoot()}={}){
 const router=express.Router(),uploads=new Map();
 const session=id=>{const row=uploads.get(id);if(!row)fail('Upload expired or the server restarted. Attach the file again.');return row;};
 const route=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(e=>{if(res.headersSent)return next(e);res.status(400).json({error:e.message});});
 async function expire(){if(uploads.size>128)for(const [id,u]of uploads){if(u.saved)uploads.delete(id);if(uploads.size<=64)break;}for(const [id,u]of uploads)if(Date.now()-u.updated>15*60000&&!u.locked){uploads.delete(id);if(!u.saved)await unlink(u.temporary).catch(()=>{});}}
 router.post('/studio/uploads',route(async(req,res)=>{await expire();if([...uploads.values()].filter(x=>!x.saved).length>=4)fail('Finish the current uploads before attaching more files.');const size=req.body?.size;if(!Number.isInteger(size)||size<1||size>maximum)fail('Files must be between 1 byte and 16 MB.');await mkdir(join(root,'attachments'),{recursive:true,mode:0o700});const id=randomUUID(),relative='attachments/'+id,temporary=join(root,relative+'.part');const file=await open(temporary,'wx',0o600);await file.close();uploads.set(id,{id,path:relative,temporary,size,name:safeName(req.body.name),requested:String(req.body.type||'').slice(0,150),offset:0,updated:Date.now()});res.json({id,chunkSize,maximum});}));
 router.put('/studio/uploads/:id',route(async(req,res)=>{const u=session(req.params.id);if(u.locked||u.saved||Number(req.query.offset)!==u.offset)fail('Upload offset changed. Retry the attachment.');u.locked=true;const start=u.offset;let file;try{file=await open(u.temporary,'r+');let count=0;for await(const chunk of req){count+=chunk.length;if(count>chunkSize||start+count>u.size)fail('Upload chunk exceeds its declared size.');await file.write(chunk,0,chunk.length,start+count-chunk.length);}if(!count)fail('Empty upload chunk.');await file.sync();u.offset=start+count;u.updated=Date.now();}catch(e){if(file)await file.truncate(start);throw e;}finally{try{await file?.close();}finally{u.locked=false;}}res.json({id:u.id,offset:u.offset});}));
 router.post('/studio/uploads/:id/complete',route(async(req,res)=>{const u=session(req.params.id);if(u.saved)return res.json({...fileDescriptor(u),durable:true});if(u.locked||u.offset!==u.size)fail('The file upload is incomplete.');u.locked=true;try{if(!u.type){const file=await open(u.temporary,'r');const head=Buffer.alloc(Math.min(8192,u.size));try{await file.read(head,0,head.length,0);}finally{await file.close();}const type=detectedType(head,u.requested,u.name);await rename(u.temporary,join(root,u.path));u.type=type;}const db=await pool.connect();try{await db.query('BEGIN');await db.query('INSERT INTO files(id,path,size,type,name) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING',[u.id,u.path,u.size,u.type,u.name]);await db.query('COMMIT');u.saved=true;u.updated=Date.now();res.json({...fileDescriptor(u),durable:true});}catch(e){await db.query('ROLLBACK').catch(()=>{});throw Error('Drive did not acknowledge this file. Retry Complete; do not upload a duplicate.');}finally{db.release();}}finally{u.locked=false;}}));
 router.delete('/studio/uploads/:id',route(async(req,res)=>{const u=uploads.get(req.params.id);if(u?.locked)fail('The upload is busy.');if(u&&!u.saved){await unlink(u.temporary).catch(()=>{});/* Unacknowledged finalized files are retained for recovery. */}uploads.delete(req.params.id);res.json({removed:true});}));
 return router;
}
export function attachmentResolver({pool,root=fileRoot()}={}){
 const cache=new Map();
 return async messages=>{let total=0;const result=[];for(const message of messages){if(!message.attachments?.length){result.push(message);continue;}if(!Array.isArray(message.attachments)||message.attachments.length>5)fail('Attach at most five files per request.');const attachments=[];for(const ref of message.attachments){if(!/^[a-f0-9-]{36}$/i.test(ref?.id||''))fail('Invalid attachment ID.');let file=cache.get(ref.id);if(!file){const row=(await pool.query('SELECT id,path,type,name,size FROM files WHERE id=$1',[ref.id])).rows[0];if(!row)fail('An attached file is missing. Attach it again.');if(Number(row.size)>6*1024*1024)fail('Model inputs are limited to 6 MB total. Use a smaller image/video/document or pass the file to a storage/service block.');const bytes=await readFile(await confinedFile(root,row.path));if(bytes.length!==Number(row.size))fail('An attached file changed.');file={...fileDescriptor(row),data:bytes.toString('base64'),...(row.type==='text/plain'?{text:bytes.toString('utf8')}:{})};cache.set(ref.id,file);}total+=file.size;if(total>6*1024*1024)fail('Model attachments exceed the 6 MB inline limit.');attachments.push(file);}result.push({...message,attachments});}return result;};
}
export async function outputFiles(value,{root=fileRoot()}={}){
 const files=[];let total=0,count=0;
 async function visit(value,depth=0){
  if(!value||typeof value!=='object'||depth>8)return value;
  if(Array.isArray(value))return Promise.all(value.map(v=>visit(v,depth+1)));
  const copy={...value};
  if(Array.isArray(value.files)){const descriptors=[];for(const entry of value.files){if(++count>5)fail('At most five output files are supported across all results.');if(!entry||typeof entry!=='object')fail('Invalid output file.');if(typeof entry.content!=='string'){descriptors.push(entry);continue;}const bytes=entry.encoding==='base64'?Buffer.from(entry.content,'base64'):Buffer.from(entry.content,'utf8');total+=bytes.length;if(!bytes.length||total>1024*1024)fail('Generated file contents exceed the 1 MB total limit.');const id=randomUUID(),name=safeName(entry.name),type=detectedType(bytes.subarray(0,8192),entry.type||'text/plain',name),path='attachments/'+id;await mkdir(join(root,'attachments'),{recursive:true,mode:0o700});const file=await open(join(root,path),'wx',0o600);try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}const row={id,name,type,size:bytes.length,path};files.push(row);descriptors.push(fileDescriptor(row));}copy.files=descriptors;}
  for(const key of ['output','outputs','result','results','value','products','data'])if(value[key])copy[key]=await visit(value[key],depth+1);
  return copy;
 }
 return {output:await visit(value),files};
}
