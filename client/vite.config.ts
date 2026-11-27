import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Vite resolves the linked workspace outside node_modules.
  optimizeDeps: {
    include: ['@gatorgainz/types/exercise-catalog'],
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/, /\/shared\/exercise-catalog\.js$/],
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // Preserve the browser's host so the API can verify same-origin authentication writes.
      '/api': { target: 'http://127.0.0.1:3001', changeOrigin: false },
    },
  },
});
