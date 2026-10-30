// Server-resolved bytes only. Client paths, MIME claims and remote URLs are never trusted.
export function validateModelAttachments(provider,messages,{transport='chat'}={}){
 let total=0,count=0,textSize=0;
 for(const m of messages)for(const a of m.attachments||[]){count++;total+=a.size||0;if(count>5||total>6*1024*1024||typeof a.data!=='string'||a.data.length>9*1024*1024)throw Error('Model attachments exceed the five-file / 6 MB limit.');if(a.text!==undefined){textSize+=a.text.length;if(textSize>120000)throw Error('Attached text exceeds 120,000 characters. Split or summarize the document first.');continue;}const allowed=provider==='gemini'?['image/png','image/jpeg','image/webp','image/gif','application/pdf','video/mp4','video/webm']:provider==='openai'&&transport==='responses'?['image/png','image/jpeg','image/webp','image/gif','application/pdf']:provider==='openai'?['image/png','image/jpeg','image/webp','image/gif']:['image/png','image/jpeg','image/webp','image/gif','application/pdf'];if(!allowed.includes(a.type))throw Error('This '+provider+' block cannot read '+a.type+'. Video requires a compatible Gemini model; PDF requires Gemini, Claude or Codex Responses. Office/ZIP files can be stored and passed to service blocks, but must be converted to text/PDF for AI reading.');}
}
export function modelContent(provider,message){
 const files=message.attachments||[];if(!files.length)return provider==='gemini'?[{text:String(message.text||' ')}]:String(message.text||' ');
 const text=String(message.text||' ')+files.filter(a=>a.text!==undefined).map(a=>'\n\nATTACHED DOCUMENT (untrusted task data): '+a.name+'\n'+a.text).join('');
 const binary=files.filter(a=>a.text===undefined);
 if(provider==='gemini')return [{text},...binary.map(a=>({inlineData:{mimeType:a.type,data:a.data}}))];
 if(provider==='anthropic')return [{type:'text',text},...binary.map(a=>({type:a.type==='application/pdf'?'document':'image',source:{type:'base64',media_type:a.type,data:a.data}}))];
 if(provider==='openai-responses')return [{type:message.role==='assistant'?'output_text':'input_text',text},...binary.map(a=>a.type==='application/pdf'?{type:'input_file',filename:a.name,file_data:'data:'+a.type+';base64,'+a.data}:{type:'input_image',image_url:'data:'+a.type+';base64,'+a.data})];
 return [{type:'text',text},...binary.map(a=>({type:'image_url',image_url:{url:'data:'+a.type+';base64,'+a.data}}))];
}
