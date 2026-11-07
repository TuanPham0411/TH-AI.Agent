export function installSocialChannels({S,api,E,B,field,dialog,toast,editable,checkpoint,dirty,canvas}){
 const platforms={facebook:'Facebook Page',youtube:'YouTube',tiktok:'TikTok',threads:'Threads'};
 const href=channel=>channel.platform==='facebook'?'https://www.facebook.com/'+encodeURIComponent(channel.accountId):channel.platform==='youtube'?'https://www.youtube.com/channel/'+encodeURIComponent(channel.accountId):channel.platform==='tiktok'?'https://www.tiktok.com/':'https://www.threads.net/';
 async function open(){dialog('Kênh marketing · Social channels',async host=>{
  host.append(E('p','Mỗi kênh có kết nối riêng. Xác minh đúng tài khoản trước khi chọn vào workflow. Đăng bài tự động qua API; mở tab mới để kiểm tra nội dung trên nền tảng.','muted'));
  if(!S.owner){host.append(E('p','Đăng nhập tài khoản chủ để quản lý kênh và quyền đăng bài. Tài khoản thành viên chưa có quyền chạy trên server.'));return;}
  host.append(B('+ Thêm kênh',()=>edit(),'primary'));
  const {channels}=await api('studio/channels');if(!channels.length)host.append(E('p','Chưa có kênh. Thêm Facebook Page, YouTube hoặc TikTok mà bạn quản lý.','empty-console'));
  for(const c of channels){const card=E('article','','channel-card'),status=E('p',c.verification.verified?'✓ Đã xác minh danh tính':'Cần kết nối / xác minh','muted');card.append(E('span',platforms[c.platform],'eyebrow'),E('h3',c.name),E('code',c.accountId),status);const actions=E('div','','button-row');
   actions.append(B('Xác minh',async()=>{status.textContent='Đang kiểm tra…';try{const result=await api('studio/channels/'+c.id+'/check',{method:'POST',body:'{}'});status.textContent=result.note;S.credentials=await api('studio/credentials');}catch(e){status.textContent=e.message;}},'secondary'),B('Sửa',()=>edit(c),'secondary'));
   if(c.platform==='youtube')actions.append(B('Đăng nhập Google cho kênh',async()=>{try{const r=await api('studio/google/start',{method:'POST',body:JSON.stringify({channelId:c.id,services:['youtube_read','youtube_upload','youtube_comments']})});location.assign(r.url);}catch(e){status.textContent=e.message;}},'primary'));
   const a=E('a','Mở trong tab mới','account-link');a.href=href(c);a.target='_blank';a.rel='noopener noreferrer';actions.append(a,B('Gỡ kết nối',async()=>{if(!confirm('Gỡ kết nối '+c.name+'? Workflow dùng kênh này cần được kiểm tra lại.'))return;try{await api('studio/channels/'+c.id,{method:'DELETE'});open();}catch(e){status.textContent=e.message;}},'secondary danger'));card.append(actions);host.append(card);
  }
 });}
 function edit(channel={}){dialog(channel.id?'Chỉnh kết nối kênh':'Thêm kênh marketing',host=>{
  const value={platform:channel.platform||'facebook',name:channel.name||'',accountId:channel.accountId||''};
  field(host,'Nền tảng',value.platform,v=>{value.platform=v;},{options:Object.entries(platforms)});field(host,'Tên kênh dễ nhớ',value.name,v=>value.name=v);field(host,'Page ID / Channel ID / Creator open_id',value.accountId,v=>value.accountId=v);
  host.append(E('p','Facebook cần Page access token có pages_manage_posts và quyền tương ứng. TikTok cần app được duyệt, video.publish và miền media được xác minh. YouTube dùng Google OAuth riêng cho từng kênh.','muted'));
  field(host,'Access token (Facebook / TikTok / Threads)', '',v=>value.key=v,{type:'password'});
  const oauth=E('details');oauth.append(E('summary','Google OAuth · dùng client hiện có hoặc nhập client riêng'));for(const [key,label]of [['clientId','Client ID'],['clientSecret','Client secret'],['refreshToken','Refresh token (nếu đã có)']])field(oauth,label,'',v=>value[key]=v,{type:key==='clientId'?'text':'password'});host.append(oauth);
  const status=E('p','','muted');host.append(B('Lưu kết nối',async()=>{try{await api('studio/channels/'+(channel.id||'new'),{method:'PUT',body:JSON.stringify(value)});S.credentials=await api('studio/credentials');open();}catch(e){status.textContent=e.message;}},'primary'),B('Quay lại',open,'secondary'),status);
 });}
 async function targets(host,node,update){
  const section=E('section','','saved-channel-picker');section.append(E('h3','Các kênh đã lưu'),B('Quản lý kênh',open,'secondary'));host.append(section);if(!S.owner){section.append(E('p','Đăng nhập chủ workspace để chọn kênh.'));return;}
  try{const {channels}=await api('studio/channels');if(!section.isConnected)return;for(const c of channels){let list;try{list=JSON.parse(node.config.targets||'[]');}catch{list=[];}let target=list.find(t=>t.connectionId===c.id);const card=E('div','','channel-target');card.append(E('strong',c.name+' · '+platforms[c.platform]));
   const change=(key,value)=>{if(!editable())return;try{list=JSON.parse(node.config.targets||'[]');}catch{list=[];}target=list.find(t=>t.connectionId===c.id);if(!target){target={platform:c.platform,accountId:c.accountId,connectionId:c.id,enabled:false,privacy:c.platform==='youtube'?'private':'SELF_ONLY'};list.push(target);}target[key]=value;update('targets',JSON.stringify(list));};
   field(card,'Sử dụng kênh này',target?.enabled===true,v=>change('enabled',v),{type:'checkbox',disabled:!c.verification.verified});
   field(card,'Link trong bài (HTTPS)',target?.link||'',v=>change('link',v));
   if(['facebook','youtube'].includes(c.platform))field(card,'Bình luận đầu tiên · có thể kèm link',target?.comment||'',v=>change('comment',v),{type:'textarea',rows:3});
   if(['youtube','tiktok'].includes(c.platform))field(card,'Quyền riêng tư',target?.privacy||(c.platform==='youtube'?'private':'SELF_ONLY'),v=>change('privacy',v),{options:c.platform==='youtube'?[['private','Private'],['unlisted','Unlisted'],['public','Public']]:[['SELF_ONLY','Self only'],['PUBLIC_TO_EVERYONE','Public'],['MUTUAL_FOLLOW_FRIENDS','Mutual friends'],['FOLLOWER_OF_CREATOR','Followers']]});
   if(c.platform==='youtube')field(card,'Nội dung dành cho trẻ em',target?.madeForKids===true,v=>change('madeForKids',v),{type:'checkbox'});
   if(c.platform==='tiktok')card.append(E('p','TikTok không cung cấp quyền tự đăng bình luận trong Content Posting API. Link trong caption có thể không bấm được.','muted'));
   if(!c.verification.verified)card.append(E('p','Hãy xác minh kết nối trong Quản lý kênh.','muted'));section.append(card);
  }}catch(e){section.append(E('p',e.message,'error'));}
 }
 return {open,targets};
}
