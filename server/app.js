import express from 'express';
export function createApp({production=false,allowedHosts=['ai.th.io.vn','localhost','127.0.0.1'],checkDatabase,ownerRouter,internalRouter}={}){
 const app=express();app.disable('x-powered-by');
 app.use((req,res,next)=>{res.set({'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});if(!allowedHosts.includes(req.hostname))return res.status(421).json({error:'Unrecognized hostname'});if(production&&!ownerRouter&&req.method!=='GET'&&req.method!=='HEAD')return res.status(405).json({error:'Read-only foundation'});next();});
 app.get('/api/health',(_req,res)=>res.json({status:'ok',service:'th-ai',version:'0.1.0',authentication:ownerRouter?'google-owner':'not-configured'}));
 app.get('/api/ready',async(_req,res)=>{if(!checkDatabase)return res.status(503).json({status:'not-ready',database:'not-configured'});try{await checkDatabase();res.json({status:'ready',service:'th-ai'});}catch{res.status(503).json({status:'not-ready',database:'unavailable'});}});
 if(internalRouter)app.use(internalRouter);
 if(ownerRouter)app.use('/api',ownerRouter);
 app.use((_req,res)=>res.status(404).json({error:'Not found'}));return app;
}

