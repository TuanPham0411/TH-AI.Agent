export async function uploadCompanyFiles(api,files,onProgress=()=>{}){
 const list=Array.from(files);if(list.length>5)throw Error('Mỗi yêu cầu có tối đa năm file.');const results=[];
 for(const file of list){if(file.size<1||file.size>16*1024*1024)throw Error('Mỗi file cần từ 1 byte đến 16 MB.');onProgress(file.name,0);const init=await api('studio/uploads',{method:'POST',body:JSON.stringify({name:file.name,size:file.size,type:file.type})});let completing=false;
  try{for(let offset=0;offset<file.size;){const value=await api('studio/uploads/'+init.id+'?offset='+offset,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:file.slice(offset,offset+init.chunkSize)});if(!Number.isInteger(value.offset)||value.offset<=offset)throw Error('Không xác nhận được phần file vừa tải.');offset=value.offset;onProgress(file.name,Math.round(offset/file.size*100));}completing=true;results.push(await api('studio/uploads/'+init.id+'/complete',{method:'POST',body:'{}'}));}
  catch(e){e.completedFiles=[...results];if(completing)e.pendingCompletion={id:init.id,name:file.name};if(!completing)await api('studio/uploads/'+init.id,{method:'DELETE',body:'{}'}).catch(()=>{});else e.message='File đã tải nhưng chưa được Drive xác nhận. Giữ mã '+init.id+' để thử Complete lại; không tải bản trùng. '+e.message;throw e;}
 }return results;
}
