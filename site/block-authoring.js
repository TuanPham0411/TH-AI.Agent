import {agentTypes} from './organization.js';
import {codingAgents} from './coding-agents.js';
import {serviceBlocks} from './connectors.js';
import {workbenchBlocks} from './workbench-blocks.js';
/** Content and behavioral intent live below; connectivity and execution settings live on the right. */
export function behaviorFields(node){
 const f=(key,label,type='textarea',rows=5)=>({key,label,type,rows});
 if(agentTypes.includes(node.type))return [f('prompt','Mission & instructions', 'textarea',7),f('style','Working style & voice'),f('process','Method & decision rules'),f('reporting','Report structure & evidence'),f('delegation','Delegation & escalation rules')];
 if(node.type==='function')return [f('code','JavaScript · input → return JSON','code',12)];
 if(codingAgents[node.type])return [f('task','Coding assignment'),f('context','Project context / source code','code',8)];
 if(['timer','auto_input'].includes(node.type))return [f('payload','Input for each scheduled run (JSON)','code',7)];
 if(['text_to_image','text_to_video','image_to_video'].includes(node.type))return [f('prompt','Creative brief / input mapping','textarea',7)];
 if(node.type==='database'||node.type.startsWith('db_'))return [f('query','Read-only query','code',8)];
 if(node.type==='trend_search')return [f('query','Research question / input mapping')];
 if(node.type==='note')return [f('text','Working notes')];
 if(node.type==='set'||node.type==='action'&&node.config.operation==='merge')return [f('json','Data instructions / mapped JSON','code',8)];
 const block=serviceBlocks[node.type];if(block)return block.fields.filter(x=>['message','text','caption','content','subject','title','note'].includes(x.key)).map(x=>({...f(x.key,x.label),fallback:x.default}));
 const data=workbenchBlocks[node.type];if(data)return data.fields.filter(x=>['mapping','schema'].includes(x.key)).map(x=>f(x.key,x.label,'code',7));
 return [];
}
export function agentInstructions(node){return [node.config.prompt||'',...[['style','WORKING STYLE'],['process','METHOD AND DECISIONS'],['reporting','REPORTING REQUIREMENTS'],['delegation','DELEGATION RULES']].filter(([key])=>node.config[key]?.trim()).map(([key,label])=>label+':\n'+node.config[key])].join('\n\n');}
export function installBlockAuthoring({S,E,B,field,editable,checkpoint,dirty,canvas,testFunction,J,runWorkflow,cancel,chatMedia}){
 function render(host){
  const n=S.preview||S.graph.nodes.find(n=>n.id===S.selected);host.classList.add('block-authoring');
  if(!n){host.append(E('h3','Select a block to define its work'),E('p','Choose User Input to enter a request, Manager to define instructions, or Terminal to write code. Configuration and connections stay in the right panel.','muted'));return;}
  const head=E('header','','behavior-heading');head.append(E('span','BLOCK WORKSPACE','eyebrow'),E('h3',n.name),E('p',S.preview?'Toolbox preview · create this block before saving.':'Changes are part of this workflow. Check and save before server execution.','muted'));host.append(head);
  const change=(key,value)=>{if(!editable()||n.config[key]===value)return;if(!S.preview)checkpoint();n.config[key]=value;if(!S.preview){dirty();canvas();}};
  if(n.type==='chat'){
   field(host,'Request / input for this run',S.chat,value=>S.chat=value,{type:'textarea',rows:7,disabled:S.running||S.checking});
   host.append(E('p','This is run input, not permanent system instructions. JSON is supported. It is delivered through this User Input block.','muted'));
   field(host,'Allow external writes',S.allowWrites,v=>S.allowWrites=v,{type:'checkbox',disabled:S.running});field(host,'Approve provider charges',S.allowPaid,v=>S.allowPaid=v,{type:'checkbox',disabled:S.running});host.append(B(S.running?'Stop run':'Run with this input',()=>S.running?cancel():runWorkflow(),'primary'));chatMedia.composer(host);return;
  }
  const fields=behaviorFields(n);for(const spec of fields)field(host,spec.label,n.config[spec.key]??spec.fallback??'',value=>change(spec.key,value),{type:spec.type,rows:spec.rows,disabled:S.running||S.checking});
  if(!fields.length)host.append(E('p','This block uses the incoming data and its operational settings. Configure model, destination, limits and connections in the right panel; inspect real input/output in the other tabs.','muted'));
  if(n.type==='function'){
   host.append(E('p','Terminal executes JavaScript against JSON input in an isolated sandbox. It is not a server shell. Network and credentials are unavailable to this code.','muted'));
   S.blockTestInput??={};const value=S.blockTestInput[n.id]||'{"text":"Hello"}';field(host,'Local test input (JSON)',value,v=>S.blockTestInput[n.id]=v,{type:'code',rows:4,disabled:S.running});
   const result=E('pre',S.blockTestResult?.[n.id]||'No local test has run.','json-view function-result');host.append(B('Test code locally',async()=>{try{result.textContent=J(await testFunction(n.config.code,JSON.parse(S.blockTestInput[n.id]||value)));}catch(e){result.textContent=e.message;}S.blockTestResult??={};S.blockTestResult[n.id]=result.textContent;},'secondary'),result);
  }
 }
 return {render};
}
