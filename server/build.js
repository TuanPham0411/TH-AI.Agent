import {build} from 'esbuild';import {cp,mkdir} from 'node:fs/promises';await mkdir('dist/server',{recursive:true});for(const entry of ['index','migrate','storage-operator'])await build({entryPoints:[`server/${entry}.js`],bundle:true,platform:'node',target:'node22',format:'esm',packages:'external',outfile:`dist/server/${entry}.js`});await cp('server/migrations','dist/server/migrations',{recursive:true});


await cp('server/th-storage/capture.sql','dist/server/storage-capture.sql');
