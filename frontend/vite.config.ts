import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({mode})=>({plugins:[react()],publicDir:mode==='pages'?'public':false,base:mode==='pages'?'/CAR-Lab/':'/',build:{outDir:mode==='pages'?'dist-pages':'dist'},server:{host:'127.0.0.1',proxy:{'/api':'http://127.0.0.1:8765'}}}));
