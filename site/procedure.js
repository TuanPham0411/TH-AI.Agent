// A procedure is a checked, deterministic Flow owned by an execution controller.
export function procedureScope(graph,node,{catalog,isTaskBlock,managementLinks}){
 let ids;try{ids=JSON.parse(node.config.nodeIds||'[]');}catch{throw Error('Procedure scope must be a JSON array of block IDs.');}
 if(!Array.isArray(ids)||!ids.length||ids.length>95||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)throw Error('Select a non-empty, unique procedure scope of at most 95 blocks.');
 const byId=new Map(graph.nodes.map(n=>[n.id,n])),members=ids.map(id=>byId.get(id));if(members.some(n=>!n||!catalog[n.type]||['manager','leader','supervisor','reviewer','procedure'].includes(n.type)))throw Error('A procedure may contain operational Flow blocks and their infrastructure, not organizational managers or nested procedures.');
 if(members.filter(n=>['chat','timer','auto_input'].includes(n.type)&&n.enabled!==false).length!==1||!members.some(n=>n.type==='output'&&n.enabled!==false))throw Error('A procedure needs exactly one enabled input trigger and at least one Output.');
 const links=managementLinks(graph,{includeDisabled:true});for(const member of members.filter(isTaskBlock)){const parent=links.find(l=>l.child===member.id)?.parent;if(parent!==node.id&&!ids.includes(parent))throw Error(member.name+': restore its procedure ownership before executing this plan.');}
 return {schemaVersion:1,nodes:members,edges:graph.edges.filter(e=>ids.includes(e.source)&&ids.includes(e.target)),settings:{procedureSource:node.id}};
}

export function duplicateProcedure(graph,node,{uid,catalog,isTaskBlock,managementLinks}){
 const scope=procedureScope(graph,node,{catalog,isTaskBlock,managementLinks}),ids=new Map(scope.nodes.map(n=>[n.id,uid()])),copy=structuredClone(node);copy.id=uid();copy.name+=' · copy';copy.x+=40;copy.y+=140;copy.config.nodeIds=JSON.stringify(scope.nodes.map(n=>ids.get(n.id)));
 const nodes=scope.nodes.map(n=>({...structuredClone(n),id:ids.get(n.id),x:n.x+40,y:n.y+140})),edges=scope.edges.map(e=>({...e,id:uid(),source:ids.get(e.source),target:ids.get(e.target)}));
 for(const link of managementLinks(graph,{includeDisabled:true}).filter(l=>l.parent===node.id&&ids.has(l.child)))edges.push({id:uid(),source:copy.id,sourcePort:'tasks',target:ids.get(link.child),targetPort:'manager'});
 return {node:copy,nodes:[...nodes,copy],edges};
}
