import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Production-only CSP: blocks injected inline/event-handler XSS and rogue
// script loads while allowing the Razorpay checkout and the API backend.
// Injected only for builds (ctx.server) so Vite/React inline dev scripts and
// HMR keep working locally.
const CSP =
  "default-src 'self'; script-src 'self' https://checkout.razorpay.com; " +
  "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; " +
  "media-src 'self' blob: https:; font-src 'self' data:; " +
  "connect-src 'self' https: wss: ws:; frame-src https://checkout.razorpay.com; " +
  "worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'";

function securityMetas(): Plugin {
  return {
    name: 'security-metas',
    transformIndexHtml(html, ctx) {
      if (ctx.server) return html;
      return [
        { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
        { tag: 'meta', attrs: { name: 'referrer', content: 'no-referrer' }, injectTo: 'head' },
      ];
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), securityMetas()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    // Allow cloudflared quick-tunnel hostnames (random subdomain each run).
    allowedHosts: ['.trycloudflare.com'],
  },
});
