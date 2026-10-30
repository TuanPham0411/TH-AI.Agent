import test from 'node:test';import assert from 'node:assert/strict';
import {codingAgents,codingOutput} from '../site/coding-agents.js';
import {newNode,validateGraph,blockCapabilities} from '../site/workflow-model.js';
import {nodeConnectionId,blockConnectionState} from '../site/connection-state.js';
import {executeWorkflow} from '../server/workflow-engine.js';
import {callModel} from '../server/studio-providers.js';
import {autoNodeOptions,autoInvocationGuard,normalizeAutoPolicy} from '../server/auto-policy.js';
for(const [type,spec]of Object.entries(codingAgents))test(type+' executes a paid API coding request, preserves patch and participates in Check/Auto/proof',async()=>{
 const a=newNode('chat'),b=newNode(type),o=newNode('output'),graph={nodes:[a,b,o],edges:[{id:'1',source:a.id,sourcePort:'out',target:b.id,targetPort:'in'},{id:'2',source:b.id,sourcePort:'out',target:o.id,targetPort:'in'}]};b.config.format='patch';const credentials={[spec.provider]:true,verifications:{[spec.provider]:{verified:true}}};assert.deepEqual(validateGraph(graph,{execution:true,credentials}),[]);assert.equal(nodeConnectionId(b),spec.provider);assert.equal(blockConnectionState(b,credentials).state,'verified');assert(blockCapabilities(b).includes('delegate'));assert(autoNodeOptions(graph).some(x=>x.id===b.id&&x.paid));
 let count=0;const execute=allowPaid=>executeWorkflow(graph,{text:'Fix the supplied add() function',code:'const add=(a,b)=>a-b;'}, {allowPaid,credentials,invoke:async(kind,data,signal,context)=>{count++;assert.equal(kind,'model');assert.equal(context.nodeId,b.id);assert.equal(data.provider,spec.provider);assert.equal(data.transport,spec.transport);assert.equal(data.tools.length,0);assert.match(data.system,/Never claim/);assert.match(data.messages.at(-1).text,/a-b/);return {text:'```diff\n--- a/math.js\n+++ b/math.js\n@@ -1 +1 @@\n-const add=(a,b)=>a-b;\n+const add=(a,b)=>a+b;\n```'};}});
 await assert.rejects(execute(false),/Approve/);assert.equal(count,0);const result=await execute(true);assert.match(result.output.patch,/a\+b/);assert.equal(result.output.applied,false);assert.equal(result.output.testsRun,false);assert.equal(result.output.mode,'api');
 const guard=autoInvocationGuard(normalizeAutoPolicy(),{paid:0,writes:0},graph);assert.throws(()=>guard.check('model',{provider:spec.provider},{nodeId:b.id}),/allowance/);
 b.config.maxOutputTokens=100000;assert(validateGraph(graph,{execution:true,credentials}).some(x=>/token limit/.test(x)));
});
test('OpenAI coding uses stateless Responses API and refuses incomplete patches',async()=>{
 const result=await callModel({provider:'openai',transport:'responses',model:'gpt-6.1-sol',system:'Coding task',messages:[{role:'user',text:'Fix code'}],maxOutputTokens:4096},{key:'private-test'},null,{requestJson:async(url,body,headers,signal,timeout)=>{assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(body.store,false);assert.equal(body.max_output_tokens,4096);assert.equal(headers.Authorization,'Bearer private-test');assert.equal(timeout,120000);return {status:'incomplete',output:[{type:'message',content:[{type:'output_text',text:'```diff\n--- partial\n```'}]}]};}});
 assert.equal(result.truncated,true);const output=codingOutput(result,{name:'Codex',provider:'openai',model:'test',format:'patch'});assert.equal(output.patch,null);assert.match(output.warning,/incomplete/);
 await assert.rejects(callModel({provider:'openai',transport:'responses',model:'gpt-6.1-sol',system:'x',messages:[{role:'user',text:'x'}],tools:[{}]},{key:'test'}),/cannot execute tools/);
});
test('Claude coding output budget maps to Messages and marks truncation',async()=>{
 const result=await callModel({provider:'anthropic',model:'claude-sonnet-5-5',system:'Coding task',messages:[{role:'user',text:'Code'}],maxOutputTokens:8192},{key:'private-test'},null,{requestJson:async(url,body)=>{assert.equal(url,'https://api.anthropic.com/v1/messages');assert.equal(body.max_tokens,8192);return {stop_reason:'max_tokens',content:[{type:'text',text:'partial'}]};}});assert.equal(result.truncated,true);
});
