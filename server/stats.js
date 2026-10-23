// Relay usage counters and the feedback inbox, served next to the WebSocket:
//   GET  /mp/stats     read-only JSON, needs WRAITHLINE_STATS_TOKEN (Bearer header or ?token=)
//   POST /mp/feedback  { rating 1-5, text?, map?, difficulty?, from?, version? } from the in-game form
// Only counts are kept: no names, room codes, IPs or user agents are ever stored.
import { timingSafeEqual } from 'node:crypto';
import { appendFile, readFileSync, writeFile } from 'node:fs';

const env = process.env;
const TOKEN = env.WRAITHLINE_STATS_TOKEN || '';
const STATS_FILE = env.WRAITHLINE_STATS_FILE || ''; // optional: survive restarts
const FEEDBACK_FILE = env.WRAITHLINE_FEEDBACK_FILE || ''; // optional: append feedback as JSON lines
const FEEDBACK_WEBHOOK = env.WRAITHLINE_FEEDBACK_WEBHOOK || ''; // optional: Discord channel webhook
// the inbox only opens when there is somewhere to read the feedback
const FEEDBACK_ON = !!(TOKEN || FEEDBACK_FILE || FEEDBACK_WEBHOOK);
const KEEP_DAYS = 90;
const KEEP_FEEDBACK = 100;

const fresh = () => ({
  since: new Date().toISOString(),
  totals: { roomsCreated: 0, joins: 0, contractsStarted: 0, feedback: 0 },
  peakPlayers: { count: 0, at: null },
  days: {}, // 'YYYY-MM-DD' (UTC) -> { roomsCreated, joins, contractsStarted, peakPlayers }
  ratings: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  recentFeedback: [],
});

let data = fresh();
if (STATS_FILE) {
  try {
    data = { ...data, ...JSON.parse(readFileSync(STATS_FILE, 'utf8')) };
  } catch {}
}
const live = { rooms: 0, players: 0 };

let saveTimer = null;
function changed() {
  if (!STATS_FILE || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    writeFile(STATS_FILE, JSON.stringify(data), () => {});
  }, 10000);
  saveTimer.unref?.();
}

function today() {
  const key = new Date().toISOString().slice(0, 10);
  if (!data.days[key]) {
    data.days[key] = { roomsCreated: 0, joins: 0, contractsStarted: 0, peakPlayers: 0 };
    const keys = Object.keys(data.days).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - KEEP_DAYS))) delete data.days[k];
  }
  return data.days[key];
}

export const stats = {
  roomCreated() {
    data.totals.roomsCreated++;
    today().roomsCreated++;
    changed();
  },
  joined() {
    data.totals.joins++;
    today().joins++;
    changed();
  },
  contractStarted() {
    data.totals.contractsStarted++;
    today().contractsStarted++;
    changed();
  },
};

// called whenever room membership changes
export function countPlayers(rooms) {
  live.rooms = rooms.size;
  live.players = 0;
  for (const r of rooms.values()) live.players += r.players.size;
  const day = today();
  if (live.players > day.peakPlayers) {
    day.peakPlayers = live.players;
    changed();
  }
  if (live.players > data.peakPlayers.count) {
    data.peakPlayers = { count: live.players, at: new Date().toISOString() };
    changed();
  }
}

function authorized(req, url) {
  if (!TOKEN) return false;
  const given = Buffer.from((req.headers.authorization || '').replace(/^Bearer\s+/i, '') || url.searchParams.get('token') || '');
  const want = Buffer.from(TOKEN);
  return given.length === want.length && timingSafeEqual(given, want);
}

const json = (res, code, body, headers = {}) => {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body, null, 2));
};

// feedback may come from the itch.io page, a different origin than the relay
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Accept' };
const recent = new Map(); // address -> send times, in memory only, for rate limiting

function limited(req) {
  const addr = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';
  const now = Date.now();
  const times = (recent.get(addr) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (recent.size > 5000) recent.clear();
  if (times.length >= 5) return true;
  recent.set(addr, [...times, now]);
  return false;
}

function readBody(req, max = 4096) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > max) reject(new Error('too large')), req.destroy();
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function takeFeedback(req, res) {
  if (limited(req)) return json(res, 429, { error: 'Too much feedback from here, try again later.' }, CORS);
  let m;
  try {
    m = JSON.parse(await readBody(req));
  } catch {
    return json(res, 400, { error: 'Bad request' }, CORS);
  }
  const rating = Number(m.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return json(res, 400, { error: 'Rating must be 1-5' }, CORS);
  const word = (v) => (typeof v === 'string' && /^[\w.-]{1,24}$/.test(v) ? v : undefined);
  const entry = {
    at: new Date().toISOString(),
    rating,
    text: typeof m.text === 'string' ? m.text.trim().slice(0, 1000) : '',
    map: word(m.map),
    difficulty: word(m.difficulty),
    from: word(m.from),
    version: word(m.version),
  };
  data.totals.feedback++;
  data.ratings[rating]++;
  data.recentFeedback = [entry, ...data.recentFeedback].slice(0, KEEP_FEEDBACK);
  changed();
  if (FEEDBACK_FILE) appendFile(FEEDBACK_FILE, JSON.stringify(entry) + '\n', () => {});
  if (FEEDBACK_WEBHOOK) {
    const where = [entry.map, entry.difficulty, entry.from, entry.version && `v${entry.version}`].filter(Boolean).join(' · ');
    const content = `${'★'.repeat(rating)}${'☆'.repeat(5 - rating)} ${where}${entry.text ? `\n> ${entry.text.replace(/\n/g, '\n> ')}` : ''}`;
    fetch(FEEDBACK_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
    }).catch(() => {});
  }
  json(res, 200, { ok: true }, CORS);
}

// Connect-style middleware: Vite's server.middlewares.use(relayHttp), or call it from a plain
// http.createServer handler with a `next` that serves the game.
export function relayHttp(req, res, next) {
  const url = new URL(req.url || '/', 'http://relay');
  if (url.pathname === '/mp/stats' && req.method === 'GET') {
    if (!authorized(req, url)) return json(res, TOKEN ? 401 : 404, { error: TOKEN ? 'Unauthorized' : 'Not found' });
    const n = Object.values(data.ratings).reduce((a, b) => a + b, 0);
    const avg = n ? Object.entries(data.ratings).reduce((a, [r, c]) => a + r * c, 0) / n : null;
    return json(res, 200, { now: { ...live, at: new Date().toISOString() }, ...data, averageRating: avg && Math.round(avg * 100) / 100 });
  }
  if (url.pathname === '/mp/feedback' && FEEDBACK_ON) {
    if (req.method === 'OPTIONS') return res.writeHead(204, CORS), res.end();
    if (req.method === 'POST') return takeFeedback(req, res).catch(() => json(res, 500, { error: 'Server error' }, CORS));
  }
  next();
}
