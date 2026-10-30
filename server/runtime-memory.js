/** Bounded live execution data. A live snapshot is telemetry, not a durable save acknowledgement. */
export class RuntimeMemory{
 constructor({maxRuns=4,maxCellBytes=4*1024*1024}={}){this.maxRuns=maxRuns;this.maxCellBytes=maxCellBytes;this.runs=new Map();this.conversations=new Map();}
 begin(id,value){this.runs.set(id,{...value,id,status:'running',trace:[],cells:new Map(),cellBytes:0,telemetryDurable:false});this.prune();return this.runs.get(id);}
 trace(id,trace){const row=this.runs.get(id);if(row){row.trace=trace;row.updated_at=new Date().toISOString();}}
 cell(id,{nodeId,input,output}){const row=this.runs.get(id);if(!row)return;const trim=value=>{const text=JSON.stringify(value??null);return text.length>190000?{preview:text.slice(0,1800),truncated:true,totalChars:text.length}:JSON.parse(text);};const value={nodeId,input:trim(input),output:trim(output)},text=JSON.stringify(value),old=row.cells.get(nodeId);if(old)row.cellBytes-=old.bytes;const bytes=Buffer.byteLength(text);if(row.cellBytes+bytes>this.maxCellBytes){value.input={truncated:true};value.output={preview:JSON.stringify(output??null).slice(0,1800),truncated:true};}const item={value,bytes:Buffer.byteLength(JSON.stringify(value))};row.cells.set(nodeId,item);row.cellBytes+=item.bytes;}
 update(id,value){const row=this.runs.get(id);if(row)Object.assign(row,value,{updated_at:new Date().toISOString()});this.prune();}
 snapshot(id){const row=this.runs.get(id);if(!row)return null;const {cells,cellBytes,...value}=row;return {...value,memory:{cells:cells.size,bytes:cellBytes,durable:row.telemetryDurable}};}
 forgetRun(id){this.runs.delete(id);this.conversations.clear();}
 clearWorkflow(workflowId){for(const [id,row]of this.runs)if(row.workflow_id===workflowId)this.runs.delete(id);for(const key of this.conversations.keys())if(key.startsWith(workflowId+'/'))this.conversations.delete(key);}
 clearConversations(){this.conversations.clear();}
 getCell(id,nodeId){return this.runs.get(id)?.cells.get(nodeId)?.value||null;}
 prune(){while(this.runs.size>this.maxRuns){const key=[...this.runs].find(([,r])=>r.telemetryDurable)?.[0];if(!key)break;this.runs.delete(key);}}
 async history(key,limit,load){let rows=this.conversations.get(key);if(!rows){rows=(await load()).slice(-10).map(h=>({input:JSON.stringify(h.input??null).slice(0,4000),output:JSON.stringify(h.output??null).slice(0,4000)}));this.conversations.set(key,rows);if(this.conversations.size>100)this.conversations.delete(this.conversations.keys().next().value);}return rows.slice(-Math.min(10,Math.max(1,limit))).flatMap(h=>[{role:'user',text:typeof h.input==='string'?h.input:JSON.stringify(h.input).slice(0,4000)},{role:'assistant',text:typeof h.output==='string'?h.output:JSON.stringify(h.output).slice(0,4000)}]);}
 remember(key,input,output){const trim=value=>JSON.stringify(value??null).slice(0,4000);const rows=this.conversations.get(key)||[];rows.push({input:trim(input),output:trim(output)});this.conversations.set(key,rows.slice(-10));if(this.conversations.size>100)this.conversations.delete(this.conversations.keys().next().value);}
}
