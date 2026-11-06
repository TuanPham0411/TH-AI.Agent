import test from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import {publicOrigin} from '../server/public-origin.js';
import {createApp} from '../server/app.js';
test('public origin rejects unsafe callback and CSRF configurations',()=>{
 for(const value of ['http://thienha.io.vn','https://user:pass@thienha.io.vn','https://thienha.io.vn/other','https://thienha.io.vn?x=1','https://thienha.io.vn/#x','invalid'])assert.throws(()=>publicOrigin(value));
 assert.equal(publicOrigin('https://thienha.io.vn/'),'https://thienha.io.vn');
});
test('configured domain is accepted and previous domain is rejected',async()=>{
 const previous=process.env.PUBLIC_ORIGIN;process.env.PUBLIC_ORIGIN='https://thienha.io.vn';
 let server;try{
  server=createApp().listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const url=`http://127.0.0.1:${server.address().port}/api/health`;
  const status=host=>new Promise((resolve,reject)=>http.get(url,{headers:{Host:host}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject));
  assert.equal(await status('thienha.io.vn'),200);
  assert.equal(await status('ai.th.io.vn'),421);
 }finally{await new Promise(resolve=>server?.close(resolve));if(previous===undefined)delete process.env.PUBLIC_ORIGIN;else process.env.PUBLIC_ORIGIN=previous;}
});
