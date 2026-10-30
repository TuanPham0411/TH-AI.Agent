import {procedureScope} from '../site/procedure.js';
import {isTaskBlock,managementLinks} from '../site/organization.js';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {executionShape} from '../site/execution-shape.js';
import {canonical,credentialFingerprint} from './connection-proof.js';
import {validateGraph,catalog} from '../site/workflow-model.js';
import {nodeConnectionIds} from '../site/connection-state.js';
export function executionFingerprint(graph){return createHash('sha256').update(executionShape(graph)).digest('hex');}
export function graphConnectionIds(graph){return [...new Set(graph.nodes.filter(n=>n.enabled!==false).flatMap(nodeConnectionIds).filter(Boolean))].sort();}
export function connectionsFingerprint(graph,secrets){return createHash('sha256').update(JSON.stringify(graphConnectionIds(graph).map(id=>[id,credentialFingerprint(secrets.get(id),{stable:true}),secrets.get(id)?._connectionEpoch||credentialFingerprint(secrets.get(id))]))).digest('hex');}
export function workflowIssues(graph,credentials){const issues=validateGraph(graph,{execution:true,credentials});if(issues.length)return issues;for(const node of graph.nodes)if(node.type==='procedure'&&node.enabled!==false){try{issues.push(...validateGraph(procedureScope(graph,node,{catalog,isTaskBlock,managementLinks}),{execution:true,credentials}).map(issue=>node.name+': '+issue));}catch(error){issues.push(node.name+': '+error.message);}}for(const node of graph.nodes)if(node.type==='function'&&node.enabled!==false){try{new vm.Script('(async function(input){"use strict";'+node.config.code+'\n})');}catch{issues.push(node.name+': invalid JavaScript syntax.');}}return issues;}
export function validWorkflowCheck(record,graph,secrets){return !!record?.ready&&record.executionFingerprint===executionFingerprint(graph)&&record.connectionsFingerprint===connectionsFingerprint(graph,secrets);}
