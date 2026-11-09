import {constants} from 'node:fs';
import {realpath,stat,readdir,open} from 'node:fs/promises';
import path from 'node:path';
import {resolveValue} from './service-runtime.js';
export async function readWorkspace(type,config,input,{root=process.env.WORKSPACE_FILES_ROOT}={}){
 if(!root)throw Error('Operator chưa mount thư mục và cấu hình WORKSPACE_FILES_ROOT.');
 const relative=String(resolveValue(config.path||'.',input,config));if(relative.length>500||path.isAbsolute(relative)||relative.split(/[\\/]/).includes('..')||relative.includes('\0'))throw Error('Chỉ đọc đường dẫn tương đối bên trong workspace được cấp quyền.');
 const base=await realpath(root),target=await realpath(path.resolve(base,relative));if(target!==base&&!target.startsWith(base+path.sep))throw Error('Đường dẫn vượt khỏi workspace được cấp quyền.');const info=await stat(target);
 if(type==='file_list'){if(!info.isDirectory())throw Error('Đường dẫn cần là thư mục.');const files=await readdir(target,{withFileTypes:true});return {workspace:relative,entries:files.slice(0,100).map(e=>({name:e.name,type:e.isDirectory()?'directory':e.isFile()?'file':'link-or-special'})),limited:files.length>100,readOnly:true};}
 if(!info.isFile()||info.size>120000)throw Error('Chỉ đọc file văn bản thường tối đa 120 KB.');const handle=await open(target,constants.O_RDONLY|constants.O_NOFOLLOW);try{const current=await handle.stat();if(!current.isFile()||current.size>120000)throw Error('File vượt giới hạn đọc.');const buffer=Buffer.alloc(120001),{bytesRead}=await handle.read(buffer,0,buffer.length,0);if(bytesRead>120000||buffer.subarray(0,bytesRead).includes(0))throw Error('File nhị phân hoặc quá lớn.');return {workspace:relative,text:buffer.subarray(0,bytesRead).toString('utf8'),bytes:bytesRead,readOnly:true};}finally{await handle.close();}
}
