import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { attachMultiplayer } from './server/relay.js';
import { relayHttp } from './server/stats.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// The multiplayer relay rides on Vite's own HTTP server, so `npm run dev` (this PC only) and
// `npm run host` (reachable from your local network) both serve the game and the relay together.
// /mp/stats and /mp/feedback (server/stats.js) are plain HTTP routes on the same server.
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    {
      name: 'wraithline-multiplayer',
      configureServer(server) {
        if (server.httpServer) attachMultiplayer(server.httpServer);
        server.middlewares.use(relayHttp);
      },
      configurePreviewServer(server) {
        if (server.httpServer) attachMultiplayer(server.httpServer);
        server.middlewares.use(relayHttp);
      },
    },
  ],
});
