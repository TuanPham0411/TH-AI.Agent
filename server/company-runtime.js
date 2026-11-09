import {randomUUID} from 'node:crypto';
import {departments,companyGraph} from '../site/company-model.js';
import {newNode,uid,validateGraph} from '../site/workflow-model.js';
import {executionFingerprint,connectionsFingerprint,graphConnectionIds} from './workflow-check.js';
import {connectionProof} from './connection-proof.js';
const idOK=id=>/^[a-f0-9-]{36}$/i.test(id||'');
const taskKey=id=>'_studio_company_task_'+id;
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
export function normalizeCompanyTask(body){
 if(!body||typeof body.title!=='string'||!body.title.trim()||body.title.length>120||typeof body.brief!=='string'||!body.brief.trim()||body.brief.length>16000)fail('Nhập tiêu đề và yêu cầu rõ ràng, tối đa 16.000 ký tự.');
 if(!Array.isArray(body.departmentIds))fail('Chọn danh sách phòng ban hợp lệ.');const departmentIds=[...new Set(body.departmentIds)];if(!departmentIds.length||departmentIds.length>3||departmentIds.some(id=>!departments.some(d=>d.id===id)))fail('Chọn từ một đến ba phòng ban.');
 const data=body.data??{};if(!data||typeof data!=='object'||Array.isArray(data)||JSON.stringify(data).length>30000)fail('Dữ liệu bổ sung phải là JSON object dưới 30 KB.');
 if(Object.keys(data).some(k=>k.startsWith('_studio')))fail('Không dùng khóa nội bộ _studio trong dữ liệu giao việc.');
 const attachments=body.attachments||[];if(!Array.isArray(attachments)||attachments.length>5||attachments.some(f=>!idOK(f?.id)))fail('Chọn tối đa năm file đã được tải lên.');
 const links=body.links||[];if(!Array.isArray(links)||links.length>10||links.some(v=>{try{const u=new URL(v.url);return u.protocol!=='https:'||u.username||u.password||u.href.length>2000;}catch{return true;}}))fail('Đường dẫn phải dùng HTTPS và không chứa mật khẩu.');
 const provider=body.provider||'gemini',model=String(body.model||'').trim();if(!['gemini','openai','anthropic'].includes(provider)||!model||model.length>100)fail('Chọn nhà cung cấp AI và model.');
 const priority=['normal','high','urgent'].includes(body.priority)?body.priority:'normal';
 return {title:body.title.trim(),brief:body.brief.trim(),departmentIds,provider,model,priority,data:JSON.parse(JSON.stringify(data)),attachments:attachments.map(({id})=>({id})),links:links.map(l=>({url:new URL(l.url).href,label:String(l.label||l.url).slice(0,150)})),review:true};
}
export function mountCompany(router,{pool,route,start,workflow,credentialStatus,getLiveRun=()=>null}){
 let launching=false;
 const load=async id=>{if(!idOK(id))fail('Mã công việc không hợp lệ.');const task=(await pool.query('SELECT secret FROM ai_credentials WHERE id=$1',[taskKey(id)])).rows[0]?.secret;if(!task)fail('Không tìm thấy công việc.',404);return task;};
 const hydrate=async task=>{const ids=[...new Set([...task.attachments,...(task.feedback||[]).flatMap(f=>f.attachments||[])].map(f=>f.id))];if(!ids.length)return task;const rows=(await pool.query('SELECT id,name,type,size FROM files WHERE id=ANY($1::uuid[])',[ids])).rows,files=new Map(rows.map(f=>[f.id,f]));const mapped=list=>(list||[]).map(f=>files.get(f.id)||{id:f.id,name:'File không còn trong bộ nhớ cục bộ'});return {...task,attachments:mapped(task.attachments),feedback:(task.feedback||[]).map(f=>({...f,attachments:mapped(f.attachments)}))};};
 const latest=async workflowId=>{const r=(await pool.query("SELECT id,workflow_id,status,error,started_at,updated_at,output->>'status' AS decision_status FROM ai_runs WHERE workflow_id=$1 ORDER BY started_at DESC LIMIT 1",[workflowId])).rows[0];if(!r)return null;const live=getLiveRun(r.id);return {...r,...(live?{status:live.status,error:live.error,updated_at:live.updated_at,decision_status:live.output?.status||r.decision_status}:{}),durationMs:r.updated_at?Math.max(0,Date.parse(r.updated_at)-Date.parse(r.started_at)):null};};
 router.get('/studio/company',route(async(req,res)=>{
  const records=(await pool.query("SELECT secret - ARRAY['brief','data','attachments','links','feedback'] AS secret FROM ai_credentials WHERE id LIKE '_studio_company_task_%' ORDER BY updated_at DESC LIMIT 100")).rows;
  const ids=records.map(r=>r.secret.workflowId),runs=ids.length?(await pool.query("SELECT DISTINCT ON(workflow_id) id,workflow_id,status,error,started_at,updated_at,output->>'status' AS decision_status FROM ai_runs WHERE workflow_id=ANY($1::uuid[]) ORDER BY workflow_id,started_at DESC",[ids])).rows:[];const recent=new Map(runs.map(r=>[r.workflow_id,{...r,status:getLiveRun(r.id)?.status||r.status,decision_status:getLiveRun(r.id)?.output?.status||r.decision_status,durationMs:r.started_at?Math.max(0,(getLiveRun(r.id)?.status==='running'?Date.now():Date.parse(r.updated_at))-Date.parse(r.started_at)):null}]));const tasks=records.map(({secret:task})=>({id:task.id,title:task.title,workflowId:task.workflowId,departmentIds:task.departmentIds,priority:task.priority,createdAt:task.createdAt,lastRun:recent.get(task.workflowId)||null}));
  res.set('Cache-Control','no-store').json({tasks,departments:departments.map(d=>({id:d.id,name:d.name})),executionScope:'owner',checkedAt:new Date().toISOString()});
 }));
 router.post('/studio/company/tasks',route(async(req,res)=>{
  const value=normalizeCompanyTask(req.body),id=randomUUID(),workflowId=randomUUID(),graph=companyGraph(value,{newNode,uid});
  const issues=validateGraph(graph);if(issues.length)fail(issues.join('\n'));
  for(const attachment of value.attachments){if(!(await pool.query('SELECT id FROM files WHERE id=$1',[attachment.id])).rowCount)fail('Một file đính kèm không còn tồn tại.');}
  const task={id,workflowId,...value,createdAt:new Date().toISOString()};const db=await pool.connect();try{await db.query('BEGIN');await db.query('INSERT INTO ai_workflows(id,title,graph,active) VALUES($1,$2,$3,false)',[workflowId,'Công ty · '+value.title,JSON.stringify(graph)]);await db.query('INSERT INTO ai_credentials(id,secret) VALUES($1,$2)',[taskKey(id),JSON.stringify(task)]);await db.query('COMMIT');}catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();}res.status(201).json({task,durable:true});
 }));
 router.get('/studio/company/tasks/:id',route(async(req,res)=>{const task=await load(req.params.id),row=await workflow(task.workflowId),credentials=await credentialStatus();const issues=validateGraph(row.graph,{execution:true,credentials});const secrets=new Map((await pool.query("SELECT id,secret FROM ai_credentials WHERE substr(id,1,8)<>'_studio_'")).rows.map(r=>[r.id,r.secret]));const unverified=graphConnectionIds(row.graph).filter(id=>!connectionProof(secrets.get(id)).verified);res.set('Cache-Control','no-store').json({task:await hydrate(task),readiness:{ready:!issues.length&&!unverified.length,issues,unverified},lastRun:await latest(task.workflowId)});}));
 router.post('/studio/company/tasks/:id/run',route(async(req,res)=>{
  if(launching)fail('Một yêu cầu khởi chạy đang được xử lý. Thử lại sau.',409);launching=true;
  try{const task=await load(req.params.id),row=await workflow(task.workflowId),previous=await latest(task.workflowId);
   if(previous&&req.body?.retry!==true)return res.status(200).json({id:previous.id,status:previous.status,reused:true});
   if(previous&&['queued','running','saving','storage-error'].includes(previous.status))fail('Công việc vẫn đang chạy hoặc đang chờ lưu.',409);
   if(previous&&(req.body?.acknowledgePrevious!==true||req.body.previousRunId!==previous.id))fail('Kiểm tra kết quả và thao tác bên ngoài của lượt trước trước khi chạy lại.');
   if(req.body?.allowPaid!==true)fail('Bạn cần duyệt chi phí model AI trước khi thực thi.');
   const credentials=await credentialStatus(),issues=validateGraph(row.graph,{execution:true,credentials});if(issues.length)fail(issues.join('\n'));
   const secrets=new Map((await pool.query("SELECT id,secret FROM ai_credentials WHERE substr(id,1,8)<>'_studio_'")).rows.map(r=>[r.id,r.secret]));
   for(const key of graphConnectionIds(row.graph))if(!connectionProof(secrets.get(key)).verified)fail(key+': xác minh kết nối trước khi giao việc.');
   // Save the exact reviewed snapshot through the same durable check record as the editor.
   const db=await pool.connect();try{await db.query('BEGIN');const current=(await db.query('SELECT revision FROM ai_workflows WHERE id=$1 FOR UPDATE',[row.id])).rows[0];if(current?.revision!==row.revision)fail('Workflow vừa thay đổi. Hãy xem lại trước khi chạy.',409);const checks=(await db.query('SELECT secret FROM ai_credentials WHERE id=$1 FOR UPDATE',['_studio_workflow_checks'])).rows[0]?.secret||{};checks[row.id]={ready:true,checkedAt:new Date().toISOString(),executionFingerprint:executionFingerprint(row.graph),connectionsFingerprint:connectionsFingerprint(row.graph,secrets)};await db.query('INSERT INTO ai_credentials(id,secret) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET secret=excluded.secret,updated_at=now()',['_studio_workflow_checks',JSON.stringify(checks)]);await db.query('COMMIT');}catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
   const prior=previous?(await pool.query('SELECT output FROM ai_runs WHERE id=$1',[previous.id])).rows[0]?.output:null;const previousResult=prior?JSON.stringify(prior):'';const input={previousRun:previous?{id:previous.id,status:previous.status,result:previousResult.slice(0,16000),truncated:previousResult.length>16000}:null,...task.data,text:task.brief,companyTask:{id:task.id,title:task.title,priority:task.priority,departmentIds:task.departmentIds},attachments:[...task.attachments,...(task.feedback||[]).slice(-3).flatMap(f=>f.attachments||[])].filter((f,i,a)=>a.findIndex(x=>x.id===f.id)===i),links:task.links,feedback:(task.feedback||[]).slice(-3)};if(input.attachments.length>5||JSON.stringify(input).length>80000)fail('Đầu vào vượt năm file hoặc 80 KB. Tạo yêu cầu tiếp theo với phần dữ liệu cần thiết.');
   const result=await start(row,input,{sessionId:'company-'+task.id,allowPaid:true,allowWrites:req.body?.allowWrites===true,allowDestructive:false});res.status(202).json(result);
  }finally{launching=false;}
 }));
 router.post('/studio/company/tasks/:id/feedback',route(async(req,res)=>{
  const task=await load(req.params.id);if(typeof req.body?.text!=='string'||!req.body.text.trim()||req.body.text.length>8000)fail('Phản hồi cần nội dung dưới 8.000 ký tự.');
  const attachments=req.body.attachments||[];if(!Array.isArray(attachments)||attachments.length>5||attachments.some(f=>!idOK(f?.id)))fail('File phản hồi không hợp lệ.');
  for(const f of attachments)if(!(await pool.query('SELECT id FROM files WHERE id=$1',[f.id])).rowCount)fail('File phản hồi không còn tồn tại.');const data=req.body.data??{};if(!data||typeof data!=='object'||JSON.stringify(data).length>8000)fail('JSON phản hồi vượt giới hạn 8 KB.');
  const feedback={data,id:randomUUID(),text:req.body.text.trim(),attachments:attachments.map(f=>({id:f.id})),createdAt:new Date().toISOString(),by:'ceo'};
  const db=await pool.connect();try{await db.query('BEGIN');const current=(await db.query('SELECT secret FROM ai_credentials WHERE id=$1 FOR UPDATE',[taskKey(task.id)])).rows[0]?.secret;if(!current)fail('Công việc không còn tồn tại.',404);const entries=[...(current.feedback||[]),feedback];if(entries.length>30)fail('Một công việc có tối đa 30 phản hồi.');await db.query('UPDATE ai_credentials SET secret=$2,updated_at=now() WHERE id=$1',[taskKey(task.id),JSON.stringify({...current,feedback:entries})]);await db.query('COMMIT');res.json({feedback,durable:true});}catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
 }));
}
