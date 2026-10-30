import test from 'node:test';
import assert from 'node:assert/strict';
import {chatAnswer} from '../site/chat-answer.js';
import {newNode} from '../site/workflow-model.js';
import {executeWorkflow} from '../server/workflow-engine.js';
const legacy='You are a helpful workspace assistant. Respond clearly in English. Use only the supplied tools. Do not claim an action succeeded without a confirming result.';
test('chat unwraps text/legacy JSON envelopes and preserves Unicode without changing run data',()=>{
 const output={text:JSON.stringify({text:'## Xin chào\n\nTôi có thể **hỗ trợ** bạn.'}),agent:'Lead Agent'};
 const before=structuredClone(output);
 assert.deepEqual(chatAnswer(output),{kind:'text',text:'## Xin chào\n\nTôi có thể **hỗ trợ** bạn.'});assert.deepEqual(output,before);
 assert.deepEqual(chatAnswer({report:'# Báo cáo'}),{kind:'text',text:'# Báo cáo'});
 assert.deepEqual(chatAnswer({rows:[{name:'Việt Nam'}]}),{kind:'json',text:'{\n  "rows": [\n    {\n      "name": "Việt Nam"\n    }\n  ]\n}'});
 assert.equal(chatAnswer('```json\n{"text":"keep code"}\n```').text,'```json\n{"text":"keep code"}\n```');
 assert.equal(chatAnswer('{invalid').text,'{invalid');assert.equal(chatAnswer({text:''}).text,'');
});
test('existing default agents receive Vietnamese text directly and multilingual instructions, preserving explicit custom language prompts',async()=>{
 for(const prompt of [legacy,'Return the final answer in French.']){
  const chat=newNode('chat'),agent=newNode('agent'),model=newNode('model'),out=newNode('output');agent.config.prompt=prompt;
  const graph={nodes:[chat,agent,model,out],edges:[{id:'1',source:chat.id,sourcePort:'out',target:agent.id,targetPort:'in'},{id:'2',source:model.id,sourcePort:'model',target:agent.id,targetPort:'model'},{id:'3',source:agent.id,sourcePort:'out',target:out.id,targetPort:'in'}]};
  const result=await executeWorkflow(graph,{text:'bạn hỗ trợ gì được cho tôi?'},{allowPaid:true,credentials:{gemini:true},invoke:async(kind,data)=>{
   assert.equal(kind,'model');assert.equal(data.messages.at(-1).text,'bạn hỗ trợ gì được cho tôi?');assert.match(data.system,/including Vietnamese with full Unicode diacritics/);
   if(prompt===legacy)assert.doesNotMatch(data.system,/Respond clearly in English/);else assert.match(data.system,/Return the final answer in French/);
   return {text:'Tôi có thể giúp bạn lập kế hoạch.'};
  }});
  assert.equal(result.output.text,'Tôi có thể giúp bạn lập kế hoạch.');assert.equal(agent.config.prompt,prompt);
 }
});
