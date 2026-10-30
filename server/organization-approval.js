import {agentTypes,isOrganization,managementLinks,portsFor} from '../site/organization.js';
import {catalog,blockCapabilities} from '../site/workflow-model.js';
import {executionFingerprint} from './workflow-check.js';
const uuid=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
export async function approveOrganizationalTask({pool,graph,runId,workflowId,allowWrites=false,allowPaid=false,allowDestructive=false},data,context={}){
 if(!isOrganization(graph)||!uuid(runId)||!uuid(data.taskId)||data.blockId!==context.nodeId||data.controllerId!==context.controllerId||!/^[a-f0-9]{64}$/.test(data.inputHash))throw Error('Invalid organizational approval.');
 const block=graph.nodes.find(n=>n.id===data.blockId&&n.enabled!==false),controller=graph.nodes.find(n=>n.id===data.controllerId&&n.enabled!==false);if(!block)throw Error('Approval block is not enabled.');
 if(data.controllerId==='user'){if(!portsFor(block,catalog).inputs.user)throw Error('This block does not accept direct user authority.');}
 else if(!controller||!agentTypes.includes(controller.type)||!managementLinks(graph).some(l=>l.parent===controller.id&&l.child===block.id))throw Error('Only the direct manager can approve this task.');
 const capabilities=blockCapabilities(block);if(capabilities.some(c=>['write','publish','delete'].includes(c))&&!allowWrites)throw Error('The user has not approved external writes for this run.');if(capabilities.includes('generate-media')&&!allowPaid)throw Error('The user has not approved media provider charges for this run.');if(capabilities.includes('delete')&&!allowDestructive)throw Error('The user has not approved destructive operations for this run.');
 const receipt={taskId:data.taskId,blockId:block.id,approvedBy:data.controllerId,inputHash:data.inputHash,runId,workflowId,executionFingerprint:executionFingerprint(graph),approved:true,createdAt:new Date().toISOString()};
 // managedPool only resolves this mutation after its Drive commit is acknowledged.
 await pool.query('INSERT INTO ai_credentials(id,secret) VALUES($1,jsonb_build_object($2::text,$3::jsonb)) ON CONFLICT(id) DO UPDATE SET secret=ai_credentials.secret || excluded.secret,updated_at=now()',['_studio_approvals_'+runId,data.taskId,JSON.stringify(receipt)]);
 return {taskId:data.taskId,approved:true,durable:true};
}
