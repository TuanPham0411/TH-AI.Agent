export function ownerWorkspace({draft,preferences,render,onPreferences}){
 let owner=null,current=null,revision=0,dirty=false,busy=false,message='',generation=0;
 const vi=()=>preferences.language==='vi';
 const text=(a,b)=>vi()?a:b;
 const element=(tag,value)=>{const e=document.createElement(tag);e.textContent=value;return e;};
 async function api(path,options={}){const response=await fetch('/api/'+path,{...options,headers:{'Content-Type':'application/json',...options.headers}});const value=await response.json();if(!response.ok)throw Error(response.status===409?text('Bản nháp đã thay đổi ở nơi khác. Mở lại bản đã lưu trước khi lưu tiếp.','Draft changed elsewhere. Reload it before saving.'):text('Chưa xác nhận lưu. Test connection rồi thử lại.','Save was not acknowledged. Check the connection and retry.'));return value;}
 function status(value){message=value;document.querySelector('#owner-save-status')?.replaceChildren(document.createTextNode(message));}
 async function save(){if(!owner||busy)return;busy=true;const snapshot={...draft},version=generation;current??=crypto.randomUUID();status(text('Saving securely…','Saving to Drive…'));try{const result=await api('drafts/'+current,{method:'PUT',body:JSON.stringify({revision,content:snapshot})});revision=result.revision;dirty=generation!==version;status(dirty?text('Có thay đổi mới chưa lưu.','New changes are unsaved.'):text('Đã lưu lên Drive.','Saved to Drive.'));}catch(error){status(error.message);}finally{busy=false;}}
 async function load(id){if(dirty&&!confirm(text('Bỏ thay đổi chưa lưu để mở bản nháp này?','Discard unsaved changes to open this draft?')))return;try{const row=await api('drafts/'+id);Object.assign(draft,row.content);current=row.id;revision=row.revision;dirty=false;generation++;message=text('Đã mở bản nháp.','Draft loaded.');render();}catch(error){status(error.message);}}
 function mount(host){
  const panel=element('section','');panel.className='connection-note';panel.append(element('h3',text('Bản nháp riêng của owner','Owner private drafts')));
  if(!owner){panel.append(element('p',text('Sign in to save your workspace. Content chưa lưu chỉ nằm trong trang đang mở.','Sign in as the Google owner to save to Drive. Unsaved content stays in this open page.')));const login=element('a',text('Sign in with Google','Sign in with Google'));login.href='/api/oauth/start';panel.append(login);host.append(panel);return;}
  panel.append(element('p',owner.email));const actions=element('div','');actions.className='prompt-actions';
  const saveButton=element('button',text('Save lên Drive','Save to Drive'));saveButton.type='button';saveButton.onclick=save;
  const fresh=element('button',text('Bản nháp mới','New draft'));fresh.type='button';fresh.onclick=()=>{if(busy)return;if(dirty&&!confirm(text('Bỏ thay đổi chưa lưu?','Discard unsaved changes?')))return;Object.keys(draft).forEach(k=>draft[k]='');current=null;revision=0;dirty=false;generation++;message='';render();};
  const logout=element('button',text('Sign out','Sign out'));logout.type='button';logout.onclick=async()=>{if(dirty&&!confirm(text('Vẫn còn thay đổi chưa lưu. Sign out?','Unsaved changes remain. Sign out?')))return;try{await api('auth/logout',{method:'POST',body:'{}'});owner=null;current=null;revision=0;render();}catch(error){status(error.message);}};
  actions.append(saveButton,fresh,logout);panel.append(actions);const note=element('p',message);note.id='owner-save-status';note.setAttribute('role','status');panel.append(note);
  const list=element('div','');panel.append(list);api('drafts').then(value=>{if(!list.isConnected)return;for(const item of value.drafts){const button=element('button',item.title);button.type='button';button.onclick=()=>{if(!busy)load(item.id);};list.append(button);}}).catch(error=>status(error.message));host.append(panel);
 }
 async function init(){try{const value=await api('auth/session');owner=value.authenticated?value:null;if(owner){const stored=await api('preferences');if(['vi','en'].includes(stored.language))preferences.language=stored.language;if(['dark','light','system'].includes(stored.theme))preferences.theme=stored.theme;onPreferences();}render();}catch{/* Standalone or unavailable API keeps anonymous local editing. */}}
 async function savePreferences(){if(!owner)return;try{await api('preferences',{method:'PUT',body:JSON.stringify(preferences)});}catch(error){status(error.message);}}
 window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
 return {init,mount,changed(){dirty=true;generation++;status(text('Có thay đổi chưa lưu.','Unsaved changes.'));},savePreferences};
}
