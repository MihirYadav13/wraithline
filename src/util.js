import * as THREE from 'three';

export const rand = (a, b) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;

// Box whose UVs are in meters, so tiling textures keep a constant scale on any size.
export function boxGeo(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]);
    }
  }
  return g;
}

// Horizontal plane (facing up) with meter-scaled UVs.
export function planeGeo(w, d) {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * d);
  return g;
}

export function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function std(color, roughness = 0.8, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, ...extra });
}

export function canvasTex(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { c, ctx: c.getContext('2d'), tex };
}

// Circle (x,z,r) vs axis-aligned box; returns push-out vector or null.
export function circleVsBox(x, z, r, b) {
  const cx = clamp(x, b.minX, b.maxX);
  const cz = clamp(z, b.minZ, b.maxZ);
  let dx = x - cx;
  let dz = z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    return [(dx / d) * (r - d), (dz / d) * (r - d)];
  }
  // centre inside the box: push out along the shallowest axis
  const pl = x - b.minX + r, pr = b.maxX - x + r, pt = z - b.minZ + r, pb = b.maxZ - z + r;
  const m = Math.min(pl, pr, pt, pb);
  if (m === pl) return [-pl, 0];
  if (m === pr) return [pr, 0];
  if (m === pt) return [0, -pt];
  return [0, pb];
}
