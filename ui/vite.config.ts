import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const target = 'http://127.0.0.1:20130';

export default defineConfig({
  base: '/',
  plugins: [react()],
  build: { outDir: '../dist/ui', emptyOutDir: true },
  server: { proxy: { '/api': target, '/v1': target, '/files': target } },
});
