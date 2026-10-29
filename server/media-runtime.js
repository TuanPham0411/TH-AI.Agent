import {randomUUID} from 'node:crypto';
import {resolveValue} from './service-runtime.js';
export async function submitMedia({type,config,input},{getSecret,request,saveJob,allowPaid=false,signal}={}){
 if(!allowPaid)throw Error('Media generation can incur provider charges. Approve paid usage before submitting.');
 const secret=await getSecret('replicate');if(!secret?.key)throw Error('Configure a Replicate API token first.');
 if(!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(config.model||''))throw Error('Use a model identifier in owner/model format.');
 const prompt=String(resolveValue(config.prompt,input,config)||'').trim();if(!prompt||prompt.length>12000)throw Error('Provide a prompt under 12,000 characters.');
 const headers={Authorization:'Bearer '+secret.key,'Content-Type':'application/json'};
 const metadata=await request('https://api.replicate.com/v1/models/'+config.model,{headers,signal});
 const schema=metadata.latest_version?.openapi_schema?.components?.schemas?.Input,properties=schema?.properties||{};
 let payload=JSON.parse(config.extraInput||'{}');if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('Additional model input must be a JSON object.');
 const promptField=['prompt','text','prompt_text'].find(k=>Object.hasOwn(properties,k))||'prompt';payload={...payload,[promptField]:prompt};
 if(type==='image_to_video'){const image=String(resolveValue(config.image,input,config)||'');let url;try{url=new URL(image);}catch{throw Error('Provide an accessible HTTPS image URL.');}if(url.protocol!=='https:'||url.username||url.password)throw Error('Use an HTTPS image URL without embedded credentials.');const key=['first_frame_image','image','input_image','start_image','prompt_image'].find(k=>Object.hasOwn(properties,k));if(!key&&Object.keys(properties).length)throw Error('This model does not expose a supported image input. Choose an image-to-video model.');payload[key||'first_frame_image']=image;}
 if(schema){for(const key of schema.required||[])if(payload[key]===undefined&&properties[key]?.default===undefined)throw Error('The model requires input "'+key+'". Add it under Additional model input.');for(const key of Object.keys(payload))if(!Object.hasOwn(properties,key))throw Error('The model does not accept input "'+key+'". Review its schema and configuration.');}
 const id=randomUUID(),state={id,provider:'replicate',type,model:config.model,status:'submitting',createdAt:new Date().toISOString(),pricingUrl:'https://replicate.com/'+config.model,files:[]};
 await saveJob(id,state);
 let prediction;try{prediction=await request('https://api.replicate.com/v1/models/'+config.model+'/predictions',{method:'POST',headers,body:JSON.stringify({input:payload}),signal});}catch{await saveJob(id,{...state,status:'uncertain',error:'Submission was not acknowledged. Check the provider dashboard before retrying; a job may already exist.'});throw Error('Media submission outcome is uncertain. Check Media Jobs and the provider dashboard before retrying.');}
 if(!/^[a-zA-Z0-9_-]{1,120}$/.test(prediction.id||''))throw Error('The provider did not return a valid job ID. Check its dashboard.');
 const next={...state,predictionId:prediction.id,status:prediction.status||'starting',providerUrl:prediction.urls?.web||'https://replicate.com/p/'+prediction.id,output:prediction.output||null};await saveJob(id,next);
 return {jobId:id,status:next.status,asynchronous:true,message:'Generation was submitted, not completed. Check Media Jobs for progress and output.',pricingUrl:state.pricingUrl};
}
export async function inspectMedia(state,{getSecret,request,saveJob}={}){if(!state.predictionId)return state;const secret=await getSecret('replicate');if(!secret?.key)throw Error('The Replicate connection is no longer configured.');const value=await request('https://api.replicate.com/v1/predictions/'+encodeURIComponent(state.predictionId),{headers:{Authorization:'Bearer '+secret.key}});const next={...state,status:value.status,output:value.output||null,error:value.error||null,metrics:value.metrics||null,completedAt:value.completed_at||null};if(JSON.stringify(next)!==JSON.stringify(state))await saveJob(state.id,next);return next;}
