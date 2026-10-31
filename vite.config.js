import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 7006,
    host: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
