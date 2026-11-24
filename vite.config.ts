import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const DEV_HOST = '127.0.0.1';
const DEV_PORT = 5173;

/**
 * The renderer runs with contextIsolation + sandbox, so the CSP meta tag is the
 * only thing stopping injected script from calling the bridge. In dev Vite
 * injects an inline React Refresh preamble, so inline scripts are allowed there
 * only; the production build keeps `script-src 'self'`.
 */
function cspPlugin(): Plugin {
  return {
    name: 'task-sessions-csp',
    transformIndexHtml(html, context) {
      const isDev = Boolean(context.server);
      const devHttp = `http://${DEV_HOST}:${DEV_PORT}`;
      const devWs = `ws://${DEV_HOST}:${DEV_PORT}`;
      const policy = [
        "default-src 'self'",
        `script-src 'self'${isDev ? " 'unsafe-inline'" : ''}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self'",
        `connect-src 'self'${isDev ? ` ${devHttp} ${devWs}` : ''}`,
      ].join('; ');

      return html.replace('%CSP%', policy);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), cspPlugin()],
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
  },
  server: {
    host: DEV_HOST,
    port: DEV_PORT,
    strictPort: true,
  },
});
