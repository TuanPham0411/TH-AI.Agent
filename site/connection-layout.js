export const connectionSides=['left','right','top','bottom'];
const ioNames=['io_user','io_tool'];
export const hasDataSockets=node=>!['model','memory','note'].includes(node.type);
export function ioPoints(node,socket){if(!hasDataSockets(node))return [];return node.config?.connectionLayout?.io?.[socket]??[{side:socket==='io_user'?'left':'right'}];}
export function controllerSetting(node,side,key){return {side:side==='inputs'?'bottom':'top',visible:true,...node.config?.connectionLayout?.controllers?.[side+'.'+key]};}
export function connectionHeight(node){const counts=Object.fromEntries(connectionSides.map(s=>[s,0]));for(const socket of ioNames)for(const p of ioPoints(node,socket))counts[p.side]=(counts[p.side]||0)+1;return Math.max(106,Math.max(counts.left,counts.right)*30+18);}
export function physicalPoint(node,socket,index=0,controllers=[]){
 const point=ioPoints(node,socket)[index];if(!point)return null;
 const face=point.side,height=connectionHeight(node),members=ioNames.flatMap(kind=>ioPoints(node,kind).map((p,i)=>({kind,index:i,side:p.side}))).filter(p=>p.side===face),rank=members.findIndex(p=>p.kind===socket&&p.index===index),vertical=['left','right'].includes(face),span=vertical?height:220;
 const occupied=controllers.filter(p=>p.side===face).map(p=>vertical?p.y-node.y:p.x-node.x),chosen=[];
 const allowed=v=>occupied.every(x=>Math.abs(x-v)>=22),fits=(start,count)=>{for(let v=start;v<=span-12&&count;v++)if(allowed(v)){count--;v+=21;}return count===0;};
 for(let i=0;i<members.length;i++){const preferred=span*(i+1)/(members.length+1);let best=null,score=Infinity;for(let v=(chosen.at(-1)??-10)+22;v<=span-12;v++){if(!allowed(v)||!fits(v+22,members.length-i-1))continue;const distance=Math.abs(v-preferred);if(distance<score){score=distance;best=v;}}chosen.push(best??preferred);}
 const v=chosen[rank];return {x:node.x+(face==='left'?0:face==='right'?220:v),y:node.y+(face==='top'?0:face==='bottom'?height:v),side:face};
}
export function endpointPoint(edge,nodeId){return (edge.source===nodeId?edge.ioPoints?.source:edge.ioPoints?.target)??0;}
export function layoutIssues(graph,getPorts,edgeSocket){
 const issues=[];
 for(const node of graph.nodes){const layout=node.config?.connectionLayout;if(layout===undefined)continue;if(!layout||typeof layout!=='object'||Array.isArray(layout)||Object.keys(layout).some(k=>!['io','controllers'].includes(k))){issues.push(node.name+': invalid connection layout.');continue;}
  if(layout.io!==undefined){if(!layout.io||typeof layout.io!=='object'||Array.isArray(layout.io)||Object.keys(layout.io).some(k=>!ioNames.includes(k)))issues.push(node.name+': invalid I/O layout.');else for(const [kind,points]of Object.entries(layout.io))if(!Array.isArray(points)||points.length>3||points.some(p=>!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>k!=='side')||!connectionSides.includes(p.side))||!hasDataSockets(node)&&points.length)issues.push(node.name+': each I/O type supports zero to three points with a valid side.');}
  if(layout.controllers!==undefined){const offered=getPorts({...node,config:{...node.config,disabledPorts:[]}});if(!layout.controllers||typeof layout.controllers!=='object'||Array.isArray(layout.controllers))issues.push(node.name+': invalid controller layout.');else for(const [key,value]of Object.entries(layout.controllers)){const [side,channel]=key.split('.');if(!['model','memory'].includes(offered[side]?.[channel])||!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['side','visible'].includes(k))||value.side!==undefined&&!connectionSides.includes(value.side)||value.visible!==undefined&&typeof value.visible!=='boolean')issues.push(node.name+': invalid Model/Memory socket layout.');}}
 }
 for(const edge of graph.edges){if(edge.ioPoints!==undefined&&(!edge.ioPoints||typeof edge.ioPoints!=='object'||Array.isArray(edge.ioPoints)||Object.keys(edge.ioPoints).some(k=>!['source','target'].includes(k))||Object.values(edge.ioPoints).some(i=>!Number.isInteger(i)||i<0||i>2)))issues.push('I/O point addresses must be integers from zero to two.');
  const socket=edgeSocket(graph,edge,getPorts);for(const [side,id,key]of [['outputs',edge.source,edge.sourcePort],['inputs',edge.target,edge.targetPort]]){const n=graph.nodes.find(n=>n.id===id);if(!n)continue;if(socket){const points=ioPoints(n,socket),index=endpointPoint(edge,id);if(!Array.isArray(points)||!points[index])issues.push(n.name+': reconnect the route before hiding its I/O point.');}else if(controllerSetting(n,side,key).visible===false)issues.push(n.name+': disconnect the controller before hiding its socket.');}
 }
 return [...new Set(issues)];
}
