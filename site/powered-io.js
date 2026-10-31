import {physicalPoint,endpointPoint,ioPoints} from './connection-layout.js';
// Physical bidirectional data ports. Logical routes remain persisted for compatibility
// and authorization. Callable tools share I/O Tool; Model/Memory stay dedicated.
export const ioPorts=['io_tool','io_user'];
export const ioLabel=id=>id==='io_user'?'I/O · User':'I/O · Tool';
export function controllerChannel(ports,side,key){return ['model','memory'].includes(ports[side]?.[key]);}
export function ioSocket(node,side,key,ports){
 if(controllerChannel(ports,side,key))return null;
 return key==='user'||node.type==='chat'&&side==='outputs'||node.type==='output'&&side==='inputs'?'io_user':'io_tool';
}
export const ioPosition=(node,socket,index=0,controllers=[])=>physicalPoint(node,socket,index,controllers);
export function edgeSocket(graph,edge,getPorts){const from=graph.nodes.find(n=>n.id===edge.source),to=graph.nodes.find(n=>n.id===edge.target);if(!from||!to)return null;if(controllerChannel(getPorts(from),'outputs',edge.sourcePort)||controllerChannel(getPorts(to),'inputs',edge.targetPort))return null;return edge.sourcePort==='user'||edge.targetPort==='user'||from.type==='chat'||to.type==='output'?'io_user':'io_tool';}
export function socketRoutes(graph,node,socket,getPorts,index){return graph.edges.filter(e=>(e.source===node.id||e.target===node.id)&&edgeSocket(graph,e,getPorts)===socket&&(index===undefined||endpointPoint(e,node.id)===index));}
export function ioCandidates(graph,first,second,socket,{getPorts,connectError}){
 if(!first||!second||first.id===second.id||!ioPorts.includes(socket)||!ioPoints(first,socket).length||!ioPoints(second,socket).length)return [];
 const routes=[];
 for(const [from,to]of [[first,second],[second,first]]){const a=getPorts(from),b=getPorts(to);for(const [out,type]of Object.entries(a.outputs))for(const [input,accept]of Object.entries(b.inputs)){
  if(type!==accept||controllerChannel(a,'outputs',out)||controllerChannel(b,'inputs',input))continue;
  // Classic procedures run their selected Flow branch, not organizational user channels.
  const factory=graph.nodes.some(n=>n.type==='manager')&&!graph.nodes.some(n=>{if(n.type!=='procedure')return false;try{const ids=JSON.parse(n.config.nodeIds);return ids.includes(from.id)&&ids.includes(to.id);}catch{return false;}});
  if(!factory&&['user','result','task','report','assessment'].includes(type)||factory&&type==='tool')continue;
  const edge={source:from.id,sourcePort:out,target:to.id,targetPort:input};if(edgeSocket(graph,edge,getPorts)===socket&&!connectError(graph,edge))routes.push({...edge,kind:type});
 }}return routes;
}

// Routing metadata is created by the executor, never taken from user/model payloads.
// Per-call IDs isolate simultaneous calls and replies, even on one shared socket.
export function createIORouter({requestId=crypto.randomUUID(),sessionId=null}={}){
 const issued=new WeakSet();
 return {
  request({from,to,port='io_tool',route='flow',edgeId=null,parentMessageId=null,fromPoint=0,toPoint=0}){
   if(!from||!to||!ioPorts.includes(port)||[fromPoint,toPoint].some(i=>!Number.isInteger(i)||i<0||i>2))throw Error('Invalid I/O route.');
   const message=Object.freeze({messageId:crypto.randomUUID(),requestId,sessionId,from:Object.freeze({nodeId:from,port,point:fromPoint}),to:Object.freeze({nodeId:to,port,point:toPoint}),route,edgeId,parentMessageId});issued.add(message);return message;
  },
  reply(message,status='success'){
   if(!issued.has(message))throw Error('Reply does not belong to this executor request.');
   return {messageId:crypto.randomUUID(),requestId,sessionId,replyTo:message.messageId,from:message.to,to:message.from,route:message.route,edgeId:message.edgeId,status};
  }
 };
}
