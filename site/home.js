import './workbench-shell.css';
export function installHome({S,api,E,B,dialog,account,aiAccount,channels,connections,newWorkflow,templates,loadWorkflow,fit,toast,discard}){
 const host=E('main','','workbench-home');host.id='workbench-home';document.body.prepend(host);
 const mobile=()=>matchMedia('(max-width: 760px)').matches||/Android|iPhone|iPod|Mobile/i.test(navigator.userAgent);
 let generation=0,refreshing=false;
 function enter(){if(mobile()){toast('Dùng máy tính hoặc laptop để thiết kế workflow.');return false;}document.body.classList.add('workflow-open');history.replaceState(null,'','#workflow');fit();return true;}
 async function show(){document.body.classList.remove('workflow-open');history.replaceState(null,'',location.pathname+location.search);await refresh();}
 const date=value=>value?new Date(value).toLocaleString('vi-VN'):'Chưa có';
 async function details(row){dialog(row.title,async panel=>{
  panel.append(E('p','Lịch tiếp theo: '+date(row.next_run_at),'muted'));if(row.schedule)panel.append(E('pre',JSON.stringify(row.schedule,null,2),'json-view'));
  if(!S.owner){panel.append(E('p','Tài khoản thành viên hiện chỉ có bản thiết kế riêng. Chưa được bật chạy trên server.'));return;}
  const {runs}=await api('workflows/'+row.id+'/runs');if(!runs.length)panel.append(E('p','Workflow chưa có lượt chạy.'));
  for(const run of runs){panel.append(B(run.status+' · '+date(run.started_at),async()=>{try{const result=await api('runs/'+run.id);dialog('Kết quả · '+row.title,body=>{body.append(E('p',result.status),E('pre',JSON.stringify(result.output??null,null,2),'json-view'));if(result.error)body.append(E('p',result.error,'error'));if(result.trace?.length)for(const step of result.trace)body.append(E('p',step.name+' · '+step.status));});}catch(e){toast(e.message,true);}},'list-card'));}
 });}
 async function refresh(){if(refreshing||document.body.classList.contains('workflow-open'))return;refreshing=true;const epoch=++generation;try{
  let list=[],status=null,failure='';if(S.owner){try{const data=await api('studio/overview');if(!Array.isArray(data.workflows)||!data.scheduler)throw Error('Không đọc được trạng thái workflow. Hãy thử làm mới.');list=data.workflows;status=data.scheduler;}catch(e){failure=e.message;}}else if(S.member){try{list=(await api('workflows')).workflows;}catch(e){failure=e.message;}}
  if(epoch!==generation)return;host.replaceChildren();
  const top=E('header','','home-top'),brand=E('a','TH / WORKFLOW STUDIO','home-brand');brand.href='/';top.append(brand,B(S.owner?'Tài khoản chủ':S.member?'Tài khoản của tôi':'Đăng nhập',account,'secondary'));host.append(top);
  const hero=E('section','','home-hero');hero.append(E('span','YOUR WORK. CONNECTED.','eyebrow'),E('h1','Từ ý tưởng đến\nquy trình vận hành.'),E('p','Xây workflow, quản lý kênh marketing và theo dõi kết quả ở một nơi. Mỗi lượt chạy có đầu vào, tiến trình và kết quả để kiểm tra.'));
  const actions=E('div','','home-actions');if(!mobile())actions.append(B('+ Tạo workflow',()=>{if(!discard())return;if(enter())newWorkflow();},'primary'),B('Chọn workflow mẫu',templates,'secondary'));else hero.append(E('p','Chế độ di động · theo dõi, xem kết quả và bật/tắt lịch. Thiết kế trên máy tính.','mobile-note'));
  hero.append(actions);host.append(hero);
  const management=E('section','','home-management');for(const [name,note,fn]of (mobile()?[]:[['AI của tôi','Models · usage · billing',aiAccount],['Kênh marketing','Facebook · YouTube · TikTok',channels],['Kết nối','API · dữ liệu · dịch vụ',connections]])){const card=B('',fn,'management-card');card.append(E('span',name),E('small',note));management.append(card);}host.append(management);
  const summary=E('section','','home-health');summary.append(E('span',S.owner?(status?.busy?'● Đang xử lý một lượt chạy':status?'● Worker đang chờ':'○ Chưa xác minh worker'):S.member?'Workspace thành viên':'Đăng nhập để quản lý workflow'),E('span','Lịch đang bật: '+list.filter(w=>w.active).length),E('span','Scheduler: '+(status?.lastTick?date(status.lastTick):'chưa có heartbeat xác nhận')));host.append(summary);
  const section=E('section','','home-workflows'),head=E('header');head.append(E('h2','Workflow của bạn'),B('Làm mới',refresh,'secondary'));section.append(head);if(failure)section.append(E('p',failure,'error'));
  if(!list.length)section.append(E('p',S.owner||S.member?'Chưa có workflow được lưu. Tạo mới hoặc chọn một mẫu để bắt đầu.':'Đăng nhập để xem các workflow đã lưu. Bạn có thể tạo bản nháp trên máy tính.','home-empty'));
  for(const row of list){const card=E('article','','workflow-card'),info=E('div');info.append(E('h3',row.title),E('p',row.active?'● Lịch đang bật · Lần tới '+date(row.next_run_at):'○ Lịch đang tắt','workflow-schedule'),E('span',row.run_status?'Lượt gần nhất: '+row.run_status+' · '+date(row.run_started_at):'Chưa có dữ liệu lượt chạy','run-status '+(row.run_status||'idle')));card.append(info);const buttons=E('div','','button-row');if(!mobile())buttons.append(B('Mở workflow',async()=>{try{await loadWorkflow(row.id);enter();}catch(e){toast(e.message,true);}},'primary'));buttons.append(B('Kết quả & thông tin',()=>details(row),'secondary'));
   if(S.owner)buttons.append(B(row.active?'Tắt lịch':'Bật lịch',async()=>{try{if(row.auto){const policy=await api('workflows/'+row.id+'/auto');if(!row.active&&!policy.checked)throw Error('Kiểm tra và lưu workflow trước khi bật lịch.');await api('workflows/'+row.id+'/auto',{method:'POST',body:JSON.stringify({enabled:!row.active})});}else await api('workflows/'+row.id+'/schedule',{method:'POST',body:JSON.stringify({enabled:!row.active})});refresh();}catch(e){toast(e.message,true);}},'secondary'));
   if(S.owner&&['queued','running'].includes(row.run_status))buttons.append(B('Dừng lượt chạy',async()=>{try{await api('runs/'+row.run_id+'/cancel',{method:'POST',body:'{}'});refresh();}catch(e){toast(e.message,true);}},'secondary danger'));
   card.append(buttons);section.append(card);
  }host.append(section);host.append(E('footer','Workflow chạy theo quyền và hạn mức bạn đã cấu hình. Lỗi kết nối và kết quả chưa xác nhận luôn được hiển thị để kiểm tra.','home-footer'));
 }finally{refreshing=false;}}
 const back=B('← Trang chủ',()=>show(),'secondary home-return');document.querySelector('#tools').prepend(back);
 window.addEventListener('hashchange',()=>{if(location.hash==='#workflow')enter();else show();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});window.addEventListener('resize',()=>{if(mobile()&&document.body.classList.contains('workflow-open'))show();});setInterval(refresh,30000);show();return {show,refresh,enter,mobile};
}
