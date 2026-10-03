import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins:[react()],
  build:{
    outDir:'dist',
    emptyOutDir:true,
    rollupOptions:{
      input:{
        public:resolve(__dirname,'index.html'),
        admin:resolve(__dirname,'fc-console-7mQ4x9R2pK8vN6sT/index.html')
      }
    }
  }
});
