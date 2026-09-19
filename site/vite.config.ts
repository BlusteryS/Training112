import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['online.tindapp.com'],
    proxy: {
      '/api': 'http://127.0.0.1:8080',
    },
  },
});
