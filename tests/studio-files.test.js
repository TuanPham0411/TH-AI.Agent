import test from 'node:test';import assert from 'node:assert/strict';
import express from 'express';import {mkdtemp,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {studioFileRoutes,attachmentResolver,outputFiles,detectedType} from '../server/studio-files.js';
import {validateModelAttachments,modelContent} from '../server/model-attachments.js';
import {callModel} from '../server/studio-providers.js';
import {outputArtifacts} from '../site/chat-media.js';
test('chunked files require complete content and durable acknowledgement; retry does not duplicate and resolution trusts stored metadata',async t=>{
 const root=await mkdtemp(join(tmpdir(),'studio-files-'));t.after(()=>rm(root,{recursive:true,force:true}));const rows=new Map();let rejectCommit=true,commits=0;
 const pool={async query(sql,args){return {rows:rows.has(args[0])?[rows.get(args[0])]:[]};},async connect(){let pending;return {async query(sql,args){if(sql.startsWith('INSERT INTO files'))pending={id:args[0],path:args[1],size:args[2],type:args[3],name:args[4]};if(sql==='COMMIT'){commits++;if(rejectCommit)throw Error('Drive unavailable');if(pending)rows.set(pending.id,pending);}return {rows:[]};},release(){}};}};
 const app=express();app.use(express.json());app.use(studioFileRoutes({pool,root}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;
 const request=(path,body,method='POST')=>fetch(base+'/studio/'+path,{method,headers:{'Content-Type':typeof body==='string'?'application/json':'application/octet-stream'},body});
 const init=await(await request('uploads',JSON.stringify({size:9,name:'../hello.txt',type:'text/plain'}))).json();assert(init.id);assert.equal(init.chunkSize,256*1024);
 assert.equal((await request('uploads/'+init.id+'/complete','{}')).status,400);
 assert.equal((await request('uploads/'+init.id+'?offset=1',Buffer.from('Xin chào'),'PUT')).status,400);
 assert.equal((await request('uploads/'+init.id+'?offset=0',Buffer.from('Xin chào'),'PUT')).status,200);
 let response=await request('uploads/'+init.id+'/complete','{}');assert.equal(response.status,400);assert.equal((await response.json()).durable,undefined);assert.equal(rows.size,0);
 rejectCommit=false;response=await request('uploads/'+init.id+'/complete','{}');const file=await response.json();assert.equal(file.durable,true);assert.equal(file.name,'.._hello.txt');assert.equal(rows.size,1);assert.equal(commits,2);
 response=await request('uploads/'+init.id+'/complete','{}');assert.equal(response.status,200);assert.equal(commits,2);
 const resolved=await attachmentResolver({pool,root})([{role:'user',text:'Read this',attachments:[{id:file.id,path:'/etc/passwd',type:'image/png'}]}]);assert.equal(resolved[0].attachments[0].type,'text/plain');assert.equal(resolved[0].attachments[0].text,'Xin chào');
 await assert.rejects(attachmentResolver({pool,root})([{attachments:[{id:'../../passwd'}]}]),/Invalid/);
});
test('generated output files retain exact bytes and strip inline content to durable references',async t=>{
 const root=await mkdtemp(join(tmpdir(),'studio-output-'));t.after(()=>rm(root,{recursive:true,force:true}));const input={text:'Report',files:[{name:'report.csv',type:'text/csv',content:'name,value\nViệt Nam,42'}]};const prepared=await outputFiles(input,{root});assert.equal(prepared.files.length,1);assert.equal((await readFile(join(root,prepared.files[0].path))).toString(),input.files[0].content);assert.equal(prepared.output.files[0].content,undefined);assert.match(prepared.output.files[0].url,/\/api\/studio\/files\//);assert.equal(input.files[0].content,'name,value\nViệt Nam,42');assert.equal(outputArtifacts(prepared.output).files.length,1);
 assert.throws(()=>detectedType(Buffer.from('<script>bad</script>'),'image/png','x.png'),/do not match/);
});
test('multimodal payloads contain actual bytes and reject unsupported media before paid requests',async()=>{
 const image={id:'test',name:'photo.png',type:'image/png',size:3,data:'YWJj'},pdf={...image,name:'brief.pdf',type:'application/pdf'},video={...image,type:'video/mp4'};
 assert.equal(modelContent('gemini',{text:'Describe',attachments:[video]})[1].inlineData.mimeType,'video/mp4');
 assert.equal(modelContent('anthropic',{text:'Read',attachments:[pdf]})[1].source.data,'YWJj');
 validateModelAttachments('openai',[{attachments:[pdf]}],{transport:'responses'});
 assert.throws(()=>validateModelAttachments('openai',[{attachments:[video]}]),/cannot read/);
 let requests=0;await assert.rejects(callModel({provider:'openai',model:'gpt-4.1-mini',system:'Help',messages:[{role:'user',text:'Describe',attachments:[video]}]},{key:'test'},null,{requestJson:async()=>{requests++;}}),/cannot read/);assert.equal(requests,0);
 await callModel({provider:'gemini',model:'gemini-test',system:'Help',messages:[{role:'user',text:'Describe',attachments:[image]}]},{key:'test'},null,{requestJson:async(url,body)=>{assert.equal(body.contents[0].parts[1].inlineData.data,'YWJj');return {candidates:[{content:{parts:[{text:'Ảnh của bạn'}]}}]};}});
 await callModel({provider:'openai',transport:'responses',model:'gpt-6.1-sol',system:'Help',messages:[{role:'user',text:'Read',attachments:[pdf]}]},{key:'test'},null,{requestJson:async(url,body)=>{assert.equal(body.input[0].content[1].file_data,'data:application/pdf;base64,YWJj');return {status:'completed',output:[{type:'message',content:[{type:'output_text',text:'Read PDF'}]}]};}});
});

test('submitted async media jobs remain discoverable for output refresh/archive',()=>{assert.equal(outputArtifacts({jobId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',status:'starting',asynchronous:true}).jobs.length,1);});
