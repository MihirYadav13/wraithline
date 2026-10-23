// Multiplayer relay. Players connect to ws://<host>/mp. One player creates a room and gets a
// 4-letter code; others join with it. The relay only forwards messages — the host's browser
// runs the ghost and the world, every other browser follows it.
import { WebSocketServer } from 'ws';
import { stats, countPlayers } from './stats.js';

const MAX_PLAYERS = 4;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export function attachMultiplayer(httpServer) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
  const rooms = new Map(); // code -> { host, players: Map<id, { ws, name }> }
  let nextId = 1;

  httpServer.on('upgrade', (req, socket, head) => {
    if (!req.url || !req.url.startsWith('/mp')) return; // leave Vite's HMR socket alone
    // a dropped connection must never crash the server
    socket.on('error', () => socket.destroy());
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  const send = (ws, msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));
  const roster = (room) => [...room.players].map(([id, p]) => ({ id, name: p.name, host: id === room.host }));
  const newCode = () => {
    let c;
    do c = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    while (rooms.has(c));
    return c;
  };

  wss.on('connection', (ws) => {
    const id = String(nextId++);
    let code = null;
    ws.on('error', () => {});
    const cleanName = (n) => String(n || 'Investigator').replace(/[^\w .'-]/g, '').slice(0, 16) || 'Investigator';

    ws.on('message', (raw) => {
      let m;
      try {
        m = JSON.parse(raw);
      } catch {
        return;
      }
      if (m.t === 'create' && !code) {
        code = newCode();
        rooms.set(code, { host: id, players: new Map([[id, { ws, name: cleanName(m.name) }]]) });
        stats.roomCreated();
        countPlayers(rooms);
        send(ws, { t: 'joined', code, id, host: id, players: roster(rooms.get(code)) });
      } else if (m.t === 'join' && !code) {
        const room = rooms.get(String(m.code || '').toUpperCase());
        if (!room) return send(ws, { t: 'error', message: 'No game with that code.' });
        if (room.players.size >= MAX_PLAYERS) return send(ws, { t: 'error', message: 'That game is full (4 players).' });
        if (room.started) return send(ws, { t: 'error', message: 'That investigation has already started.' });
        code = String(m.code).toUpperCase();
        room.players.set(id, { ws, name: cleanName(m.name) });
        stats.joined();
        countPlayers(rooms);
        send(ws, { t: 'joined', code, id, host: room.host, players: roster(room) });
        for (const [pid, p] of room.players) if (pid !== id) send(p.ws, { t: 'roster', players: roster(room) });
      } else if (m.t === 'relay' && code) {
        // forward to one player, or everyone else in the room
        const room = rooms.get(code);
        if (!room) return;
        if (m.data && m.data.t === 'start' && id === room.host && !room.started) {
          room.started = true;
          stats.contractStarted();
        }
        const out = { t: 'msg', from: id, data: m.data };
        if (m.to) {
          const p = room.players.get(m.to);
          if (p) send(p.ws, out);
        } else for (const [pid, p] of room.players) if (pid !== id) send(p.ws, out);
      }
    });

    ws.on('close', () => {
      if (!code) return;
      const room = rooms.get(code);
      if (!room) return;
      room.players.delete(id);
      if (id === room.host || room.players.size === 0) {
        for (const p of room.players.values()) send(p.ws, { t: 'error', message: 'The host left the game.', fatal: true });
        rooms.delete(code);
      } else {
        for (const p of room.players.values()) send(p.ws, { t: 'left', id, players: roster(room) });
      }
      countPlayers(rooms);
    });
  });
  return wss;
}
