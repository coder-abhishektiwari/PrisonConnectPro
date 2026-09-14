import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'https://prisonconnect-mockbackend.onrender.com',
        changeOrigin: true,
        secure: false,
      },
    },
    port: 3001,
    host: true,
    // Allow cloudflared quick-tunnel hostnames (random subdomain each run).
    allowedHosts: ['.trycloudflare.com'],
  },
});