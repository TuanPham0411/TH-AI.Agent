import {defineConfig} from 'vite';
export default defineConfig({root:'site',build:{outDir:'../dist/web',emptyOutDir:true},server:{proxy:{'/api':'http://127.0.0.1:3100'}}});
