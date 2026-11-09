import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, Vite serves the SPA on :5173 and proxies API calls to the api on :8080.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
      '/healthz': 'http://localhost:8080',
      '/readyz': 'http://localhost:8080',
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
