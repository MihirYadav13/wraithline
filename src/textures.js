// Every texture in the game is painted procedurally on a canvas at load time.
import * as THREE from 'three';

function mk(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function rng(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toTex(c, metersPerTile = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.repeat.set(1 / metersPerTile, 1 / metersPerTile);
  return t;
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map((v) =>
    Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)))
  );
  return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
}

function grime(x, w, h, r, strength = 0.25, speckle = 16) {
  for (let i = 0; i < 40; i++) {
    const px = r() * w, py = r() * h, rad = 10 + r() * 70;
    const g = x.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, `rgba(30,24,14,${strength * r()})`);
    g.addColorStop(1, 'rgba(30,24,14,0)');
    x.fillStyle = g;
    x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }
  const img = x.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * speckle;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  x.putImageData(img, 0, 0);
}

export function woodFloor(base = '#6b4a2f', seed = 1) {
  const [c, x] = mk(512);
  const r = rng(seed);
  const rows = 8, rh = 512 / rows;
  for (let i = 0; i < rows; i++) {
    const len = 220 + r() * 220;
    for (let px = -r() * len; px < 512; px += len) {
      x.fillStyle = shade(base, (r() - 0.5) * 0.4);
      x.fillRect(px, i * rh, len, rh);
      for (let g = 0; g < 12; g++) {
        x.strokeStyle = `rgba(20,10,0,${0.06 + r() * 0.12})`;
        x.lineWidth = 1 + r();
        x.beginPath();
        const y0 = i * rh + r() * rh;
        x.moveTo(px, y0);
        for (let s = 1; s <= 8; s++) x.lineTo(px + (s * len) / 8, y0 + Math.sin(s * 1.3 + g) * 2);
        x.stroke();
      }
      x.fillStyle = 'rgba(0,0,0,0.6)';
      x.fillRect(px, i * rh, 2, rh);
    }
    x.fillStyle = 'rgba(0,0,0,0.55)';
    x.fillRect(0, i * rh, 512, 2);
  }
  grime(x, 512, 512, r, 0.25);
  return toTex(c, 2);
}

export function carpet(base = '#5a2a2a', seed = 2) {
  const [c, x] = mk(256);
  const r = rng(seed);
  x.fillStyle = base;
  x.fillRect(0, 0, 256, 256);
  grime(x, 256, 256, r, 0.35, 40);
  return toTex(c, 1);
}

export function tiles(base = '#d8d4c8', grout = '#5c5850', n = 4, seed = 3, size = 1.2, checker = null) {
  const [c, x] = mk(512);
  const r = rng(seed);
  const s = 512 / n;
  x.fillStyle = grout;
  x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const col = checker && (i + j) % 2 ? checker : base;
      x.fillStyle = shade(col, (r() - 0.5) * 0.12);
      x.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
    }
  }
  grime(x, 512, 512, r, 0.3, 10);
  return toTex(c, size);
}

export function stripes(c1 = '#4a5a48', c2 = '#3e4c3c', seed = 4) {
  const [c, x] = mk(512);
  const r = rng(seed);
  for (let i = 0; i < 8; i++) {
    x.fillStyle = i % 2 ? c1 : c2;
    x.fillRect(i * 64, 0, 64, 512);
    x.fillStyle = 'rgba(200,180,120,0.18)';
    x.fillRect(i * 64 + 30, 0, 3, 512);
  }
  grime(x, 512, 512, r, 0.35);
  return toTex(c, 1);
}

export function damask(base = '#5b3b3b', ink = '#3d2424', seed = 5) {
  const [c, x] = mk(512);
  const r = rng(seed);
  x.fillStyle = base;
  x.fillRect(0, 0, 512, 512);
  x.fillStyle = ink;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const cx = col * 128 + (row % 2 ? 64 : 0);
      const cy = row * 128 + 64;
      for (const ox of [0, 512, -512]) {
        const px = cx + ox;
        x.beginPath();
        x.ellipse(px, cy, 18, 40, 0, 0, Math.PI * 2);
        x.fill();
        x.beginPath();
        x.ellipse(px - 26, cy + 10, 10, 22, 0.6, 0, Math.PI * 2);
        x.ellipse(px + 26, cy + 10, 10, 22, -0.6, 0, Math.PI * 2);
        x.fill();
        x.beginPath();
        x.arc(px, cy - 52, 8, 0, Math.PI * 2);
        x.fill();
      }
    }
  }
  grime(x, 512, 512, r, 0.4);
  return toTex(c, 1);
}

export function kidsPaper(base = '#7d93a8', seed = 6) {
  const [c, x] = mk(512);
  const r = rng(seed);
  x.fillStyle = base;
  x.fillRect(0, 0, 512, 512);
  const cols = ['#e8d9a0', '#e0b4b4', '#b8d8c0', '#f0f0e0'];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const cx = i * 128 + 64 + (j % 2 ? 32 : -32);
      const cy = j * 128 + 64;
      x.fillStyle = cols[(i + j) % 4];
      x.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
        const rad = k % 2 ? 9 : 22;
        x.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
      }
      x.fill();
      x.beginPath();
      x.arc(cx + 50, cy + 40, 6, 0, Math.PI * 2);
      x.fill();
    }
  }
  grime(x, 512, 512, r, 0.35);
  return toTex(c, 1);
}

export function paint(base = '#8a8470', seed = 7) {
  const [c, x] = mk(256);
  const r = rng(seed);
  x.fillStyle = base;
  x.fillRect(0, 0, 256, 256);
  grime(x, 256, 256, r, 0.3, 10);
  return toTex(c, 1.5);
}

export function siding(base = '#7a7a72', seed = 8) {
  const [c, x] = mk(512);
  const r = rng(seed);
  for (let i = 0; i < 12; i++) {
    const y = (i * 512) / 12;
    const g = x.createLinearGradient(0, y, 0, y + 512 / 12);
    g.addColorStop(0, shade(base, 0.1));
    g.addColorStop(1, shade(base, -0.35));
    x.fillStyle = g;
    x.fillRect(0, y, 512, 512 / 12);
  }
  grime(x, 512, 512, r, 0.45);
  return toTex(c, 2);
}

export function grass(seed = 9) {
  const [c, x] = mk(512);
  const r = rng(seed);
  x.fillStyle = '#1d2a16';
  x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 5000; i++) {
    x.strokeStyle = `rgba(${40 + r() * 40},${60 + r() * 50},${20 + r() * 20},0.7)`;
    const px = r() * 512, py = r() * 512;
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + (r() - 0.5) * 6, py - 4 - r() * 8);
    x.stroke();
  }
  grime(x, 512, 512, r, 0.4, 20);
  return toTex(c, 4);
}

export function dirt(seed = 10) {
  const [c, x] = mk(256);
  const r = rng(seed);
  x.fillStyle = '#3b3128';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 400; i++) {
    x.fillStyle = `rgba(${90 + r() * 60},${80 + r() * 50},${60 + r() * 40},0.5)`;
    x.fillRect(r() * 256, r() * 256, 1 + r() * 3, 1 + r() * 3);
  }
  grime(x, 256, 256, r, 0.4, 25);
  return toTex(c, 2);
}

export function shingles(seed = 11) {
  const [c, x] = mk(256);
  const r = rng(seed);
  x.fillStyle = '#1a1a1c';
  x.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 8; row++) {
    for (let col = -1; col < 9; col++) {
      x.fillStyle = shade('#2c2a2a', (r() - 0.5) * 0.4);
      x.fillRect(col * 32 + (row % 2 ? 16 : 0) + 1, row * 32 + 1, 30, 30);
    }
  }
  return toTex(c, 1);
}

export function plaster(seed = 12) {
  const [c, x] = mk(256);
  const r = rng(seed);
  x.fillStyle = '#b4b0a6';
  x.fillRect(0, 0, 256, 256);
  // fine stipple only: big grime blobs read as a broken, tiled ceiling
  grime(x, 256, 256, r, 0.06, 12);
  return toTex(c, 3);
}

export function doorWood(seed = 13) {
  const [c, x] = mk(128, 256);
  const r = rng(seed);
  x.fillStyle = '#4a3020';
  x.fillRect(0, 0, 128, 256);
  x.strokeStyle = 'rgba(0,0,0,0.5)';
  x.lineWidth = 4;
  for (const [px, py, w, h] of [[14, 14, 100, 100], [14, 132, 44, 110], [70, 132, 44, 110]]) {
    x.strokeRect(px, py, w, h);
    x.strokeStyle = 'rgba(255,220,180,0.12)';
    x.strokeRect(px + 4, py + 4, w - 8, h - 8);
    x.strokeStyle = 'rgba(0,0,0,0.5)';
  }
  grime(x, 128, 256, r, 0.3);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function portrait(seed = 14) {
  const [c, x] = mk(128, 160);
  const r = rng(seed);
  const g = x.createRadialGradient(64, 70, 10, 64, 80, 110);
  g.addColorStop(0, '#3a3226');
  g.addColorStop(1, '#0c0a08');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 160);
  x.fillStyle = '#16120e';
  x.beginPath();
  x.ellipse(64, 150, 50, 45, 0, Math.PI, 0);
  x.fill();
  x.fillStyle = '#6e6152';
  x.beginPath();
  x.ellipse(64, 70, 22, 30, 0, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#0a0806';
  x.beginPath();
  x.ellipse(55, 66, 5, 4, 0, 0, Math.PI * 2);
  x.ellipse(73, 66, 5, 4, 0, 0, Math.PI * 2);
  x.fill();
  x.fillRect(58, 84, 12, 2);
  grime(x, 128, 160, r, 0.5, 30);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function clockFace() {
  const [c, x] = mk(128);
  x.fillStyle = '#d8ccb0';
  x.beginPath();
  x.arc(64, 64, 62, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#201810';
  x.font = 'bold 14px serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  for (let i = 1; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    x.fillText(String(i), 64 + Math.cos(a) * 48, 64 + Math.sin(a) * 48);
  }
  x.strokeStyle = '#201810';
  x.lineWidth = 4;
  x.beginPath();
  x.moveTo(64, 64);
  x.lineTo(64, 34);
  x.moveTo(64, 64);
  x.lineTo(88, 74);
  x.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function handprint() {
  const [c, x] = mk(128, 160);
  const r = rng(Math.floor(Math.random() * 1e6));
  x.save();
  x.beginPath();
  x.ellipse(64, 110, 32, 38, 0, 0, Math.PI * 2);
  const fingers = [[30, 70, -0.5, 30], [46, 48, -0.15, 40], [64, 42, 0, 44], [82, 48, 0.15, 40], [98, 66, 0.4, 32]];
  for (const [fx, fy, a, len] of fingers) {
    x.moveTo(fx, fy);
    x.ellipse(fx, fy, 8, len / 2, a, 0, Math.PI * 2);
  }
  x.clip();
  for (let i = 0; i < 2600; i++) {
    x.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.6})`;
    x.fillRect(r() * 128, r() * 160, 2, 2);
  }
  x.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function bookPage(ctx, w, h, written) {
  ctx.fillStyle = '#e4dcc4';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(w / 2 - 2, 0, 4, h);
  ctx.strokeStyle = 'rgba(80,100,160,0.35)';
  ctx.lineWidth = 1;
  for (let y = 24; y < h; y += 16) {
    ctx.beginPath();
    ctx.moveTo(8, y);
    ctx.lineTo(w - 8, y);
    ctx.stroke();
  }
  if (!written) return;
  ctx.strokeStyle = 'rgba(15,10,10,0.9)';
  ctx.lineCap = 'round';
  for (let s = 0; s < 3; s++) {
    ctx.lineWidth = 2 + Math.random() * 2;
    ctx.beginPath();
    let px = w * 0.55 + Math.random() * w * 0.3, py = 20 + Math.random() * (h - 40);
    ctx.moveTo(px, py);
    for (let i = 0; i < 26; i++) {
      px += (Math.random() - 0.5) * 30;
      py += (Math.random() - 0.5) * 30;
      px = Math.max(w * 0.52, Math.min(w - 8, px));
      py = Math.max(8, Math.min(h - 8, py));
      ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.font = 'bold 28px serif';
  ctx.fillStyle = 'rgba(15,10,10,0.85)';
  ctx.save();
  ctx.translate(w * 0.27, h * 0.5);
  ctx.rotate(-0.25);
  ctx.textAlign = 'center';
  ctx.fillText(['DIE', 'GET OUT', 'MINE', 'HELP', 'LEAVE'][Math.floor(Math.random() * 5)], 0, 0);
  ctx.restore();
}

export function orbSprite() {
  const [c, x] = mk(64);
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(220,255,220,0.7)');
  g.addColorStop(1, 'rgba(200,255,200,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function smokeSprite() {
  const [c, x] = mk(64);
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(200,200,200,0.5)');
  g.addColorStop(1, 'rgba(200,200,200,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function persianRug(seed = 41) {
  const [c, x] = mk(512, 384);
  const r = rng(seed);
  x.fillStyle = '#6a1e18';
  x.fillRect(0, 0, 512, 384);
  // borders
  for (const [inset, col] of [[10, '#1e2a3a'], [26, '#b88a4a'], [34, '#6a1e18'], [44, '#1e2a3a']]) {
    x.strokeStyle = col;
    x.lineWidth = 8;
    x.strokeRect(inset, inset, 512 - inset * 2, 384 - inset * 2);
  }
  // medallion
  x.save();
  x.translate(256, 192);
  for (let k = 0; k < 4; k++) {
    x.fillStyle = ['#1e2a3a', '#b88a4a', '#8a3020', '#d8c8a0'][k];
    x.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const rad = (110 - k * 26) * (i % 2 ? 0.7 : 1);
      x.lineTo(Math.cos(a) * rad * 1.3, Math.sin(a) * rad);
    }
    x.fill();
  }
  x.restore();
  // field motifs
  x.fillStyle = 'rgba(216,200,160,0.5)';
  for (let i = 0; i < 40; i++) {
    const px = 70 + r() * 372, py = 70 + r() * 244;
    if (Math.hypot((px - 256) / 1.3, py - 192) < 120) continue;
    x.beginPath();
    x.arc(px, py, 4 + r() * 5, 0, Math.PI * 2);
    x.fill();
  }
  grime(x, 512, 384, r, 0.4, 30);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function pegboard() {
  const [c, x] = mk(256);
  x.fillStyle = '#b8a888';
  x.fillRect(0, 0, 256, 256);
  x.fillStyle = '#4a4034';
  for (let i = 8; i < 256; i += 16) for (let j = 8; j < 256; j += 16) {
    x.beginPath();
    x.arc(i, j, 2.6, 0, Math.PI * 2);
    x.fill();
  }
  grime(x, 256, 256, rng(51), 0.2, 10);
  return toTex(c, 0.5);
}

// Old quilted mattress: diamond stitching, yellowed and stained.
export function mattress(seed = 61) {
  const [c, x] = mk(256);
  const r = rng(seed);
  x.fillStyle = '#8a8478';
  x.fillRect(0, 0, 256, 256);
  for (let i = -8; i < 8; i++) {
    for (let j = -8; j < 8; j++) {
      const cx = i * 32 + (j % 2 ? 16 : 0), cy = j * 16;
      const g = x.createRadialGradient(cx, cy, 2, cx, cy, 18);
      g.addColorStop(0, 'rgba(255,250,235,0.18)');
      g.addColorStop(1, 'rgba(0,0,0,0.25)');
      x.fillStyle = g;
      x.beginPath();
      x.moveTo(cx, cy - 16);
      x.lineTo(cx + 16, cy);
      x.lineTo(cx, cy + 16);
      x.lineTo(cx - 16, cy);
      x.fill();
    }
  }
  grime(x, 256, 256, r, 0.55, 20);
  return toTex(c, 0.5);
}
