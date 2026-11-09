export function installSocialChannels({S,api,E,B,field,dialog,toast,editable,checkpoint,dirty,canvas}){
 const platforms={facebook:'Facebook Page',youtube:'YouTube',tiktok:'TikTok',threads:'Threads'};
 const href=channel=>channel.platform==='facebook'?'https://www.facebook.com/'+encodeURIComponent(channel.accountId):channel.platform==='youtube'?'https://www.youtube.com/channel/'+encodeURIComponent(channel.accountId):channel.platform==='tiktok'?'https://www.tiktok.com/':'https://www.threads.net/';
 async function open(){dialog('Marketing channels',async host=>{
  host.append(E('p','Each channel has its own connection. Verify the account before using it in a workflow. Publish through official APIs; open a new tab to review content on the platform.','muted'));
  if(!S.owner){host.append(E('p','Sign in as the workspace owner to manage channels and publishing permissions. Server execution is not enabled for member accounts.'));return;}
  host.append(B('+ Add channel',()=>edit(),'primary'));
  const {channels}=await api('studio/channels');if(!channels.length)host.append(E('p','No channels yet. Add a Facebook Page, YouTube channel or TikTok account you manage.','empty-console'));
  for(const c of channels){const card=E('article','','channel-card'),status=E('p',c.verification.verified?'✓ Identity verified':'Connection / verification required','muted');card.append(E('span',platforms[c.platform],'eyebrow'),E('h3',c.name),E('code',c.accountId),status);const actions=E('div','','button-row');
   actions.append(B('Verify',async()=>{status.textContent='Checking…';try{const result=await api('studio/channels/'+c.id+'/check',{method:'POST',body:'{}'});status.textContent=result.note;S.credentials=await api('studio/credentials');}catch(e){status.textContent=e.message;}},'secondary'),B('Edit',()=>edit(c),'secondary'));
   if(c.platform==='youtube')actions.append(B('Connect channel with Google',async()=>{try{const r=await api('studio/google/start',{method:'POST',body:JSON.stringify({channelId:c.id,services:['youtube_read','youtube_upload','youtube_comments']})});location.assign(r.url);}catch(e){status.textContent=e.message;}},'primary'));
   const a=E('a','Open in new tab','account-link');a.href=href(c);a.target='_blank';a.rel='noopener noreferrer';actions.append(a,B('Disconnect',async()=>{if(!confirm('Disconnect '+c.name+'? Workflows using this channel must be reviewed.'))return;try{await api('studio/channels/'+c.id,{method:'DELETE'});open();}catch(e){status.textContent=e.message;}},'secondary danger'));card.append(actions);host.append(card);
  }
 });}
 function edit(channel={}){dialog(channel.id?'Edit channel connection':'Add marketing channel',host=>{
  const value={platform:channel.platform||'facebook',name:channel.name||'',accountId:channel.accountId||''};
  field(host,'Platform',value.platform,v=>{value.platform=v;},{options:Object.entries(platforms)});field(host,'Channel display name',value.name,v=>value.name=v);field(host,'Page ID / Channel ID / Creator open_id',value.accountId,v=>value.accountId=v);
  host.append(E('p','Facebook requires a Page access token with pages_manage_posts and the relevant permissions. TikTok requires an approved app, video.publish and a verified media domain. YouTube uses separate Google OAuth for each channel.','muted'));
  field(host,'Access token (Facebook / TikTok / Threads)', '',v=>value.key=v,{type:'password'});
  const oauth=E('details');oauth.append(E('summary','Google OAuth · use the existing client or enter your own'));for(const [key,label]of [['clientId','Client ID'],['clientSecret','Client secret'],['refreshToken','Refresh token (if available)']])field(oauth,label,'',v=>value[key]=v,{type:key==='clientId'?'text':'password'});host.append(oauth);
  const status=E('p','','muted');host.append(B('Save connection',async()=>{try{await api('studio/channels/'+(channel.id||'new'),{method:'PUT',body:JSON.stringify(value)});S.credentials=await api('studio/credentials');open();}catch(e){status.textContent=e.message;}},'primary'),B('Back',open,'secondary'),status);
 });}
 async function targets(host,node,update){
  const section=E('section','','saved-channel-picker');section.append(E('h3','Saved channels'),B('Manage channels',open,'secondary'));host.append(section);if(!S.owner){section.append(E('p','Sign in as the workspace owner to select a channel.'));return;}
  try{const {channels}=await api('studio/channels');if(!section.isConnected)return;for(const c of channels){let list;try{list=JSON.parse(node.config.targets||'[]');}catch{list=[];}let target=list.find(t=>t.connectionId===c.id);const card=E('div','','channel-target');card.append(E('strong',c.name+' · '+platforms[c.platform]));
   const change=(key,value)=>{if(!editable())return;try{list=JSON.parse(node.config.targets||'[]');}catch{list=[];}target=list.find(t=>t.connectionId===c.id);if(!target){target={platform:c.platform,accountId:c.accountId,connectionId:c.id,enabled:false,privacy:c.platform==='youtube'?'private':'SELF_ONLY'};list.push(target);}target[key]=value;update('targets',JSON.stringify(list));};
   field(card,'Use this channel',target?.enabled===true,v=>change('enabled',v),{type:'checkbox',disabled:!c.verification.verified});
   field(card,'Post link (HTTPS)',target?.link||'',v=>change('link',v));
   if(['facebook','youtube'].includes(c.platform))field(card,'First comment · links allowed',target?.comment||'',v=>change('comment',v),{type:'textarea',rows:3});
   if(['youtube','tiktok'].includes(c.platform))field(card,'Privacy',target?.privacy||(c.platform==='youtube'?'private':'SELF_ONLY'),v=>change('privacy',v),{options:c.platform==='youtube'?[['private','Private'],['unlisted','Unlisted'],['public','Public']]:[['SELF_ONLY','Self only'],['PUBLIC_TO_EVERYONE','Public'],['MUTUAL_FOLLOW_FRIENDS','Mutual friends'],['FOLLOWER_OF_CREATOR','Followers']]});
   if(c.platform==='youtube')field(card,'Made for kids',target?.madeForKids===true,v=>change('madeForKids',v),{type:'checkbox'});
   if(c.platform==='tiktok')card.append(E('p','The TikTok Content Posting API does not support automatic comments. Caption links may not be clickable.','muted'));
   if(!c.verification.verified)card.append(E('p','Verify the connection in Manage channels.','muted'));section.append(card);
  }}catch(e){section.append(E('p',e.message,'error'));}
 }
 return {open,targets};
}
