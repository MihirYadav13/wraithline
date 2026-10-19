import { defineConfig } from 'vite';
import { attachMultiplayer } from './server/relay.js';

// The multiplayer relay rides on Vite's own HTTP server, so `npm run dev` (this PC only) and
// `npm run host` (reachable from your local network) both serve the game and the relay together.
export default defineConfig({
  plugins: [
    {
      name: 'wraithline-multiplayer',
      configureServer(server) {
        if (server.httpServer) attachMultiplayer(server.httpServer);
      },
      configurePreviewServer(server) {
        if (server.httpServer) attachMultiplayer(server.httpServer);
      },
    },
  ],
});
