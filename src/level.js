// The haunted house: a 22 x 14 m single-storey home on a 1 m grid, plus the yard and the van.
import * as THREE from 'three';
import { boxGeo, planeGeo, mesh, std, canvasTex, rand, pick, circleVsBox } from './util.js';
import * as TX from './textures.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const WALL_H = 2.7;
export const WALL_T = 0.12;
export const GW = 22;
export const GH = 14;

export const ROOMS = [
  { name: 'Hallway', rect: [8, 0, 12, 14], floor: 'wood', wall: 'stripe', sw: { x: 9.7, z: 14, n: [0, -1] }, lamps: [[10, 3.5], [10, 10.5]] },
  { name: 'Master Bedroom', rect: [0, 0, 8, 5], floor: 'carpet', wall: 'damask', sw: { x: 8, z: 1.7, n: [-1, 0] } },
  { name: 'Bathroom', rect: [0, 5, 8, 8], floor: 'tile', wall: 'tileWall', sw: { x: 8, z: 5.7, n: [-1, 0] } },
  { name: 'Nursery', rect: [0, 8, 8, 14], floor: 'carpetBlue', wall: 'kids', sw: { x: 8, z: 9.7, n: [-1, 0] } },
  { name: 'Kitchen', rect: [12, 0, 17, 6], floor: 'checker', wall: 'paint', sw: { x: 12, z: 1.7, n: [1, 0] } },
  { name: 'Dining Room', rect: [17, 0, 22, 6], floor: 'wood2', wall: 'damask2', sw: { x: 17, z: 2.7, n: [1, 0] } },
  { name: 'Living Room', rect: [12, 6, 22, 14], floor: 'wood', wall: 'gray', sw: { x: 12, z: 9.7, n: [1, 0] } },
];

// Door gaps on grid lines. 'v' = line x=X spanning cell z; 'h' = line z=Z spanning cell x.
const DOORS = [
  { o: 'v', x: 8, z: 2, swing: [-1, 0] },
  { o: 'v', x: 8, z: 6, swing: [-1, 0] },
  { o: 'v', x: 8, z: 10, swing: [-1, 0] },
  { o: 'v', x: 12, z: 2, swing: [1, 0] },
  { o: 'v', x: 12, z: 10, swing: [1, 0] },
  { o: 'h', x: 10, z: 14, swing: [0, -1], front: true },
];
const OPENINGS = [
  { o: 'v', x: 17, z: 3 },
  { o: 'h', x: 19, z: 6 },
  { o: 'h', x: 20, z: 6 },
];

const has = (list, o, a, b) => list.some((d) => d.o === o && d.x === a && d.z === b);

export class Level {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.occluders = [];
    this.interactables = [];
    this.doors = [];
    this.throwables = [];
    this.wallEdges = new Set();
    this.rooms = ROOMS.map((r, id) => ({
      ...r,
      id,
      lightOn: false,
      flicker: 0,
      lights: [],
      bulbs: [],
      temp: 15 + rand(-0.5, 0.5),
      center: new THREE.Vector3((r.rect[0] + r.rect[2]) / 2, 0, (r.rect[1] + r.rect[3]) / 2),
    }));
    this.grid = new Int8Array(GW * GH).fill(-1);
    this.rooms.forEach((r) => {
      const [x0, z0, x1, z1] = r.rect;
      for (let x = x0; x < x1; x++) for (let z = z0; z < z1; z++) this.grid[z * GW + x] = r.id;
    });
    this.makeMaterials();
    this.buildFloors();
    this.buildWalls();
    this.buildWindows();
    this.buildDoors();
    this.buildLights();
    this.buildFurniture();
    this.buildExterior();
    this.mergeStatic();
  }

  cell(ix, iz) {
    if (ix < 0 || iz < 0 || ix >= GW || iz >= GH) return -1;
    return this.grid[iz * GW + ix];
  }

  roomAt(x, z) {
    return this.cell(Math.floor(x), Math.floor(z));
  }

  makeMaterials() {
    const M = (map, rough = 0.85) => new THREE.MeshStandardMaterial({ map, roughness: rough });
    this.floorMats = {
      wood: M(TX.woodFloor('#5e3f27', 1), 0.7),
      wood2: M(TX.woodFloor('#7a5a3a', 21), 0.7),
      carpet: M(TX.carpet('#4e2626', 2), 1),
      carpetBlue: M(TX.carpet('#2e3b52', 22), 1),
      tile: M(TX.tiles('#cfcabb', '#4f4a40', 5, 3, 1), 0.35),
      checker: M(TX.tiles('#d4d0c4', '#333', 4, 23, 1.2, '#2a2a2a'), 0.4),
    };
    this.wallMats = {
      stripe: M(TX.stripes('#4a5a48', '#3e4c3c', 4)),
      stripe2: M(TX.stripes('#6a5a3e', '#5a4c34', 24)),
      damask: M(TX.damask('#5b3b3b', '#3d2424', 5)),
      damask2: M(TX.damask('#3b4a5b', '#25303d', 25)),
      kids: M(TX.kidsPaper('#7d93a8', 6)),
      tileWall: M(TX.tiles('#b8c4c4', '#556', 6, 26, 0.9), 0.4),
      paint: M(TX.paint('#8a8470', 7)),
      gray: M(TX.paint('#62666c', 27)),
      exterior: M(TX.siding('#7c8894', 8)),
    };
    this.capMat = std(0x2a2520, 0.9);
    this.mat = {
      darkWood: M(TX.woodFloor('#3a2516', 31), 0.6),
      lightWood: M(TX.woodFloor('#8a6a48', 32), 0.6),
      white: std(0xd8d4cc, 0.4),
      ceramic: std(0xe8e8e4, 0.15),
      metal: std(0x888a8c, 0.35, { metalness: 0.8 }),
      black: std(0x111111, 0.6),
      red: std(0x6e1e1e, 0.95),
      blue: std(0x2a3a5a, 0.95),
      green: std(0x2e4a32, 0.95),
      cream: std(0xcfc3a5, 0.95),
      brass: std(0xb08a40, 0.3, { metalness: 0.9 }),
      mirror: std(0x9aa4aa, 0.05, { metalness: 1 }),
      glass: std(0x101418, 0.1, { metalness: 0.6 }),
    };
  }

  add(obj) {
    this.scene.add(obj);
    return obj;
  }

  addColliderFrom(obj, pad = 0) {
    const b = new THREE.Box3().setFromObject(obj);
    this.colliders.push({ minX: b.min.x - pad, maxX: b.max.x + pad, minZ: b.min.z - pad, maxZ: b.max.z + pad });
  }

  buildFloors() {
    for (const r of this.rooms) {
      const [x0, z0, x1, z1] = r.rect;
      const m = mesh(planeGeo(x1 - x0, z1 - z0), this.floorMats[r.floor], (x0 + x1) / 2, 0.01, (z0 + z1) / 2);
      m.castShadow = false;
      this.add(m);
    }
    const ceilGeo = planeGeo(GW, GH);
    ceilGeo.rotateX(Math.PI);
    const ceil = mesh(ceilGeo, new THREE.MeshStandardMaterial({ map: TX.plaster(12), roughness: 1 }), GW / 2, WALL_H, GH / 2);
    this.add(ceil);
  }

  wallMatFor(id) {
    return id < 0 ? this.wallMats.exterior : this.wallMats[this.rooms[id].wall];
  }

  buildWalls() {
    const isWall = (o, a, b, A, B) => A !== B && !has(DOORS, o, a, b) && !has(OPENINGS, o, a, b);
    // vertical lines x = X
    for (let X = 0; X <= GW; X++) {
      let run = null;
      for (let zi = 0; zi <= GH; zi++) {
        let key = null, A = -2, B = -2;
        if (zi < GH) {
          A = this.cell(X - 1, zi);
          B = this.cell(X, zi);
          if (isWall('v', X, zi, A, B)) {
            key = `${A}|${B}`;
            this.wallEdges.add(`v${X},${zi}`);
          } else if (A !== B) {
            this.addLintel('v', X, zi, A, B, has(DOORS, 'v', X, zi) ? 2.12 : 2.3);
          }
        }
        if (run && key !== run.key) {
          this.addWall('v', X, run.s, zi, run.A, run.B);
          run = null;
        }
        if (key && !run) run = { key, s: zi, A, B };
      }
    }
    // horizontal lines z = Z
    for (let Z = 0; Z <= GH; Z++) {
      let run = null;
      for (let xi = 0; xi <= GW; xi++) {
        let key = null, A = -2, B = -2;
        if (xi < GW) {
          A = this.cell(xi, Z - 1);
          B = this.cell(xi, Z);
          if (isWall('h', xi, Z, A, B)) {
            key = `${A}|${B}`;
            this.wallEdges.add(`h${xi},${Z}`);
          } else if (A !== B) {
            this.addLintel('h', xi, Z, A, B, has(DOORS, 'h', xi, Z) ? 2.12 : 2.3);
          }
        }
        if (run && key !== run.key) {
          this.addWall('h', Z, run.s, xi, run.A, run.B);
          run = null;
        }
        if (key && !run) run = { key, s: xi, A, B };
      }
    }
  }

  addWall(o, line, s, e, A, B) {
    const T = WALL_T;
    if (o === 'v') {
      // extend vertical walls half a thickness at each end so corners close
      const z0 = s - T / 2, z1 = e + T / 2;
      const geo = boxGeo(T, WALL_H, z1 - z0);
      const mats = [this.wallMatFor(B), this.wallMatFor(A), this.capMat, this.capMat, this.capMat, this.capMat];
      const m = mesh(geo, mats, line, WALL_H / 2, (z0 + z1) / 2);
      this.add(m);
      this.occluders.push(m);
      this.colliders.push({ minX: line - T / 2, maxX: line + T / 2, minZ: z0, maxZ: z1 });
    } else {
      const geo = boxGeo(e - s, WALL_H, T);
      const mats = [this.capMat, this.capMat, this.capMat, this.capMat, this.wallMatFor(B), this.wallMatFor(A)];
      const m = mesh(geo, mats, (s + e) / 2, WALL_H / 2, line);
      this.add(m);
      this.occluders.push(m);
      this.colliders.push({ minX: s, maxX: e, minZ: line - T / 2, maxZ: line + T / 2 });
    }
  }

  addLintel(o, a, b, A, B, bottom) {
    const h = WALL_H - bottom;
    if (o === 'v') {
      const mats = [this.wallMatFor(B), this.wallMatFor(A), this.capMat, this.capMat, this.capMat, this.capMat];
      this.add(mesh(boxGeo(WALL_T, h, 1), mats, a, bottom + h / 2, b + 0.5));
    } else {
      const mats = [this.capMat, this.capMat, this.capMat, this.capMat, this.wallMatFor(B), this.wallMatFor(A)];
      this.add(mesh(boxGeo(1, h, WALL_T), mats, a + 0.5, bottom + h / 2, b));
    }
  }

  buildDoors() {
    const doorTex = TX.doorWood();
    const doorMat = new THREE.MeshStandardMaterial({ map: doorTex, roughness: 0.7 });
    const ang = ([dx, dz]) => Math.atan2(-dz, dx);
    for (const d of DOORS) {
      const pivot = new THREE.Group();
      pivot.position.set(d.x, 0, d.z);
      const closed = d.o === 'v' ? [0, 1] : [1, 0];
      const t0 = ang(closed);
      let t1 = ang(d.swing);
      let diff = t1 - t0;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      t1 = t0 + diff;
      const geo = new THREE.BoxGeometry(0.86, 2.08, 0.045);
      geo.translate(0.5, 1.04, 0);
      const leaf = mesh(geo, doorMat);
      pivot.add(leaf);
      for (const side of [-1, 1]) {
        const knob = mesh(new THREE.SphereGeometry(0.03, 10, 8), this.mat.brass, 0.85, 1.0, side * 0.045);
        leaf.add(knob);
      }
      pivot.rotation.y = t0;
      this.add(pivot);
      const A = d.o === 'v' ? this.cell(d.x - 1, d.z) : this.cell(d.x, d.z - 1);
      const B = d.o === 'v' ? this.cell(d.x, d.z) : this.cell(d.x, d.z);
      const door = {
        ...d,
        pivot,
        leaf,
        t0,
        t1,
        open: 0,
        target: 0,
        locked: false,
        rooms: [A, B],
        handle: new THREE.Vector3(),
        collider:
          d.o === 'v'
            ? { minX: d.x - 0.05, maxX: d.x + 0.05, minZ: d.z, maxZ: d.z + 1 }
            : { minX: d.x, maxX: d.x + 1, minZ: d.z - 0.05, maxZ: d.z + 0.05 },
        center: d.o === 'v' ? new THREE.Vector3(d.x, 1, d.z + 0.5) : new THREE.Vector3(d.x + 0.5, 1, d.z),
      };
      leaf.userData.door = door;
      this.interactables.push(leaf);
      this.doors.push(door);
    }
    this.frontDoor = this.doors.find((d) => d.front);
  }

  buildLights() {
    const plateMat = std(0xd8d0c0, 0.5);
    for (const r of this.rooms) {
      const [x0, z0, x1, z1] = r.rect;
      const w = x1 - x0, d = z1 - z0;
      const lamps = r.lamps || [[(x0 + x1) / 2, (z0 + z1) / 2]];
      // one light per room (fixtures are just meshes) keeps the per-pixel light count low
      const light = new THREE.PointLight(0xffd29a, 0, Math.max(w, d) * 0.8 + 2.5, 2);
      light.position.set((x0 + x1) / 2, WALL_H - 0.45, (z0 + z1) / 2);
      light.userData.base = 5 + w * d * (lamps.length > 1 ? 0.3 : 0.22);
      this.add(light);
      r.lights.push(light);
      for (const [lx, lz] of lamps) {
        const shade = mesh(new THREE.ConeGeometry(0.22, 0.18, 16, 1, true), std(0x3a3020, 0.7, { side: THREE.DoubleSide }), lx, WALL_H - 0.32, lz);
        this.add(shade);
        const cord = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.25), this.mat.black, lx, WALL_H - 0.12, lz);
        this.add(cord);
        const bulbMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd8a0, emissiveIntensity: 0 });
        const bulb = mesh(new THREE.SphereGeometry(0.06, 12, 10), bulbMat, lx, WALL_H - 0.42, lz);
        bulb.castShadow = false;
        this.add(bulb);
        r.bulbs.push(bulbMat);
      }
      // switch plate on the wall beside the door
      const { x, z, n } = r.sw;
      const plate = mesh(new THREE.BoxGeometry(0.08, 0.12, 0.016), plateMat);
      plate.position.set(x + n[0] * (WALL_T / 2 + 0.008), 1.3, z + n[1] * (WALL_T / 2 + 0.008));
      plate.rotation.y = Math.atan2(n[0], n[1]);
      const toggle = mesh(new THREE.BoxGeometry(0.02, 0.04, 0.02), std(0xeeeeee, 0.4), 0, 0.012, 0.012);
      plate.add(toggle);
      plate.userData.lightSwitch = r;
      r.switchMesh = plate;
      r.switchToggle = toggle;
      this.add(plate);
      this.interactables.push(plate);
    }
  }

  setLight(room, on) {
    room.lightOn = on;
    room.switchToggle.position.y = on ? 0.012 : -0.012;
  }

  updateLights(dt, ghostPos, hunting) {
    for (const r of this.rooms) {
      if (r.flicker > 0) r.flicker -= dt;
      let k = r.lightOn ? 1 : 0;
      if (k && hunting && ghostPos && ghostPos.distanceTo(r.center) < 7) k = Math.random() < 0.5 ? 0.05 : 1;
      if (k && r.flicker > 0) k = Math.random() < 0.45 ? 0.05 : 1;
      r.lights.forEach((l) => (l.intensity = l.userData.base * k));
      r.bulbs.forEach((b) => (b.emissiveIntensity = 3 * k));
    }
    for (const w of this.windows) {
      const on = w.room.lightOn && w.room.lights[0].intensity > 0.1;
      w.mat.emissive.setHex(on ? 0x6a5030 : 0x0a0e16);
    }
  }

  // ---------- furniture ----------
  group(x, z, ry = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    return g;
  }

  put(g, collide = true, pad = 0) {
    this.add(g);
    g.updateMatrixWorld(true);
    if (collide) this.addColliderFrom(g, pad);
    return g;
  }

  b(g, w, h, d, mat, x, y, z) {
    const m = mesh(boxGeo(w, h, d), mat, x, y + h / 2, z);
    g.add(m);
    return m;
  }

  table(x, z, w, d, h = 0.76, mat = this.mat.darkWood, ry = 0) {
    const g = this.group(x, z, ry);
    this.b(g, w, 0.05, d, mat, 0, h - 0.05, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.b(g, 0.06, h - 0.05, 0.06, mat, sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06));
    return this.put(g);
  }

  chair(x, z, ry, mat = this.mat.darkWood, xBack = false) {
    const g = this.group(x, z, ry);
    this.b(g, 0.44, 0.04, 0.42, mat, 0, 0.44, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.b(g, 0.04, 0.44, 0.04, mat, sx * 0.19, 0, sz * 0.18);
    if (xBack) {
      // X-back: two posts, a top rail and crossed slats
      for (const sx of [-1, 1]) this.b(g, 0.04, 0.5, 0.04, mat, sx * 0.19, 0.48, -0.19);
      this.b(g, 0.42, 0.05, 0.04, mat, 0, 0.93, -0.19);
      for (const s of [-1, 1]) {
        const slat = this.b(g, 0.035, 0.52, 0.025, mat, 0, 0.45, -0.19);
        slat.position.y = 0.71;
        slat.rotation.z = s * 0.62;
      }
    } else this.b(g, 0.44, 0.5, 0.04, mat, 0, 0.48, -0.19);
    return this.put(g, true, -0.05);
  }

  bed(x, z, ry, blanket) {
    const g = this.group(x, z, ry);
    this.b(g, 1.6, 0.3, 2.1, this.mat.darkWood, 0, 0, 0);
    this.b(g, 1.54, 0.22, 2.0, this.mat.cream, 0, 0.3, 0.02);
    this.b(g, 1.6, 0.06, 1.3, blanket, 0, 0.5, 0.38);
    this.b(g, 0.6, 0.12, 0.35, this.mat.white, -0.4, 0.52, -0.75);
    this.b(g, 0.6, 0.12, 0.35, this.mat.white, 0.4, 0.52, -0.75);
    this.b(g, 1.7, 1.1, 0.08, this.mat.darkWood, 0, 0, -1.07);
    return this.put(g);
  }

  cabinet(x, z, ry, w, h, d, mat = this.mat.darkWood, drawers = 3) {
    const g = this.group(x, z, ry);
    this.b(g, w, h, d, mat, 0, 0, 0);
    for (let i = 0; i < drawers; i++) {
      const y = ((i + 0.5) / drawers) * h;
      this.b(g, w * 0.9, 0.01, 0.01, this.mat.black, 0, ((i + 1) / drawers) * h - 0.01, d / 2 + 0.003);
      this.b(g, 0.1, 0.02, 0.02, this.mat.brass, 0, y, d / 2 + 0.01);
    }
    return this.put(g);
  }

  throwable(m, x, y, z, hh, r = 0.08) {
    m.position.set(x, y + hh, z);
    m.castShadow = true;
    this.add(m);
    const t = { mesh: m, hh, r, vel: new THREE.Vector3(), spin: new THREE.Vector3(), active: false, lastHit: 0 };
    this.throwables.push(t);
    return t;
  }

  cup(x, y, z, color = 0xd8d0c0) {
    return this.throwable(mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.1, 12), std(color, 0.3)), x, y, z, 0.05);
  }

  bookObj(x, y, z, color) {
    const m = mesh(new THREE.BoxGeometry(0.16, 0.04, 0.22), std(color, 0.8));
    m.rotation.y = rand(0, Math.PI);
    return this.throwable(m, x, y, z, 0.02);
  }

  buildFurniture() {
    const M = this.mat;
    // ---- Master bedroom
    this.bed(1.12, 2.5, Math.PI / 2, M.red);
    this.cabinet(0.3, 1.0, Math.PI / 2, 0.45, 0.55, 0.4, M.darkWood, 2);
    this.cabinet(0.3, 4.0, Math.PI / 2, 0.45, 0.55, 0.4, M.darkWood, 2);
    const wardrobe = this.cabinet(5, 0.4, 0, 1.4, 2.0, 0.6, M.darkWood, 1);
    this.b(wardrobe, 0.01, 1.9, 0.01, M.black, 0, 0.05, 0.305);
    this.cabinet(3.6, 4.68, Math.PI, 1.2, 0.85, 0.5, M.lightWood, 3);
    this.bookObj(0.3, 0.55, 1.0, 0x402020);
    this.cup(0.3, 0.55, 4.0, 0x8a8a8a);
    this.throwable(mesh(new THREE.BoxGeometry(0.12, 0.12, 0.06), std(0x2a2a2a, 0.4)), 3.3, 0.85, 4.65, 0.06);
    this.rug(3.2, 2.5, 2.4, 3.2, 0x3a2030);

    // ---- Bathroom
    const tub = this.group(0.48, 6.5);
    this.b(tub, 0.78, 0.55, 1.7, M.ceramic, 0, 0, 0);
    this.b(tub, 0.6, 0.02, 1.5, std(0x3a4448, 0.1), 0, 0.5, 0);
    this.put(tub);
    const toilet = this.group(3, 5.35);
    this.b(toilet, 0.38, 0.4, 0.5, M.ceramic, 0, 0, 0.1);
    this.b(toilet, 0.44, 0.38, 0.18, M.ceramic, 0, 0.4, -0.15);
    this.b(toilet, 0.4, 0.03, 0.45, M.white, 0, 0.4, 0.12);
    this.put(toilet);
    const sink = this.group(4.7, 5.3);
    this.b(sink, 0.7, 0.82, 0.42, M.lightWood, 0, 0, 0);
    this.b(sink, 0.74, 0.06, 0.46, M.ceramic, 0, 0.82, 0);
    this.put(sink);
    const mirror = mesh(new THREE.PlaneGeometry(0.6, 0.8), M.mirror, 4.7, 1.55, 5.065);
    this.add(mirror);
    this.cup(4.5, 0.88, 5.3, 0x6a8a9a);
    this.throwable(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.18, 10), std(0x8a3030, 0.4)), 4.95, 0.88, 5.25, 0.09);
    this.rug(4.2, 6.9, 1.4, 0.8, 0x4a6a6a);

    // ---- Nursery
    const crib = this.group(1.0, 12.6);
    this.b(crib, 0.7, 0.05, 1.3, M.cream, 0, 0.4, 0);
    for (const [px, pz] of [[-0.33, -0.63], [0.33, -0.63], [-0.33, 0.63], [0.33, 0.63]]) this.b(crib, 0.05, 0.95, 0.05, M.white, px, 0, pz);
    for (let i = 0; i < 11; i++) {
      const zz = -0.6 + i * 0.12;
      this.b(crib, 0.02, 0.5, 0.02, M.white, -0.33, 0.45, zz);
      this.b(crib, 0.02, 0.5, 0.02, M.white, 0.33, 0.45, zz);
    }
    this.b(crib, 0.7, 0.03, 0.03, M.white, 0, 0.93, -0.63);
    this.b(crib, 0.7, 0.03, 0.03, M.white, 0, 0.93, 0.63);
    this.put(crib);
    const rocker = this.group(5.6, 12.9, Math.PI);
    this.b(rocker, 0.5, 0.05, 0.5, M.lightWood, 0, 0.42, 0);
    this.b(rocker, 0.5, 0.7, 0.05, M.lightWood, 0, 0.45, -0.23);
    this.b(rocker, 0.04, 0.05, 0.8, M.lightWood, -0.22, 0, 0);
    this.b(rocker, 0.04, 0.05, 0.8, M.lightWood, 0.22, 0, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.b(rocker, 0.04, 0.4, 0.04, M.lightWood, sx * 0.22, 0.03, sz * 0.2);
    this.put(rocker);
    this.cabinet(3.5, 13.65, Math.PI, 0.9, 0.5, 0.5, std(0x7a4a3a, 0.8), 1);
    this.table(2.6, 9.6, 0.8, 0.8, 0.5, M.lightWood);
    this.throwable(mesh(new THREE.SphereGeometry(0.1, 16, 12), std(0xb03030, 0.5)), 4.2, 0, 11.2, 0.1, 0.1);
    for (let i = 0; i < 4; i++) {
      this.throwable(mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), std(pick([0x3060b0, 0xd0b030, 0x30a050, 0xc04040]), 0.6)), rand(3, 5.5), 0, rand(10, 12), 0.045);
    }
    const teddy = new THREE.Group();
    teddy.add(mesh(new THREE.SphereGeometry(0.1, 12, 10), std(0x7a5030, 1), 0, 0, 0));
    teddy.add(mesh(new THREE.SphereGeometry(0.07, 12, 10), std(0x7a5030, 1), 0, 0.14, 0));
    teddy.add(mesh(new THREE.SphereGeometry(0.025, 8, 6), std(0x7a5030, 1), -0.05, 0.2, 0));
    teddy.add(mesh(new THREE.SphereGeometry(0.025, 8, 6), std(0x7a5030, 1), 0.05, 0.2, 0));
    this.throwable(teddy, 2.5, 0.5, 9.6, 0.1);
    this.cabinet(0.32, 9.4, Math.PI / 2, 1.0, 1.6, 0.5, std(0xc8b8a0, 0.7), 4);
    this.rug(3.5, 11, 3, 2.2, 0x6a5a8a);

    // ---- Kitchen
    const counter = this.group(14.65, 0.36);
    this.b(counter, 2.9, 0.88, 0.6, M.white, 0, 0, 0);
    this.b(counter, 2.94, 0.04, 0.64, std(0x2a2a2e, 0.3), 0, 0.88, 0);
    this.b(counter, 0.6, 0.01, 0.5, M.black, 0.8, 0.92, 0);
    for (const [bx, bz] of [[-0.14, -0.12], [0.14, -0.12], [-0.14, 0.12], [0.14, 0.12]]) {
      const burner = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.01, 16), M.metal, 0.8 + bx, 0.93, bz);
      counter.add(burner);
    }
    this.b(counter, 2.9, 0.7, 0.35, M.white, 0, 1.5, -0.12);
    for (let i = 0; i < 6; i++) this.b(counter, 0.01, 0.66, 0.01, M.black, -1.45 + i * 0.58, 1.52, 0.055);
    this.put(counter);
    const fridge = this.group(16.55, 0.42);
    this.b(fridge, 0.74, 1.8, 0.7, std(0xc8c8c0, 0.3), 0, 0, 0);
    this.b(fridge, 0.03, 0.5, 0.03, M.metal, -0.3, 0.9, 0.37);
    this.b(fridge, 0.74, 0.01, 0.01, M.black, 0, 1.2, 0.355);
    this.put(fridge);
    this.table(14.6, 3.6, 1.4, 0.9, 0.76, M.lightWood);
    this.chair(14.25, 2.85, 0);
    this.chair(14.95, 2.85, 0);
    this.chair(14.25, 4.35, Math.PI);
    this.chair(14.95, 4.35, Math.PI);
    this.cup(14.3, 0.76, 3.5);
    this.cup(14.9, 0.76, 3.8, 0x4a6a8a);
    this.throwable(mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.02, 16), std(0xe0e0d8, 0.3)), 14.6, 0.76, 3.3, 0.01, 0.12);
    this.throwable(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.26, 10), std(0x2a5a2a, 0.15, { transparent: true, opacity: 0.8 })), 13.6, 0.92, 0.4, 0.13);
    this.cup(15.3, 0.92, 0.35, 0xa0a0a0);
    this.add(mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.5, 12), M.metal, 12.5, 0.25, 5.5));

    // ---- Dining room
    this.table(19.5, 2.6, 2.4, 1.0, 0.76, M.darkWood);
    const cloth = mesh(boxGeo(2.5, 0.2, 1.1), std(0xe8e6e0, 0.9), 19.5, 0.67, 2.6);
    this.add(cloth);
    const whiteWood = std(0xdedad2, 0.6);
    for (const cx of [18.7, 19.5, 20.3]) {
      this.chair(cx, 1.85, 0, whiteWood, true);
      this.chair(cx, 3.35, Math.PI, whiteWood, true);
    }
    this.cabinet(19.5, 0.3, 0, 1.6, 1.0, 0.45, M.darkWood, 2);
    for (const cx of [18.8, 19.5, 20.2]) {
      this.throwable(mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.02, 16), std(0xe0e0d8, 0.3)), cx, 0.76, 2.4, 0.01, 0.12);
    }
    const candle = (cx) => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.04, 10), M.brass, 0, -0.08, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 8), M.cream, 0, 0.02, 0));
      this.throwable(g, cx, 0.76, 2.8, 0.1);
    };
    candle(19.0);
    candle(20.0);
    this.throwable(mesh(new THREE.SphereGeometry(0.07, 16, 12), std(0x1a3fa0, 0.15)), 19.5, 0.77, 2.6, 0.07);
    this.throwable(mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.28, 12), std(0x4a6a8a, 0.2)), 19.5, 1.0, 0.3, 0.14);
    this.rug(19.5, 2.6, 3.4, 2.2, 0x3a2a1a);

    // ---- Living room: beige L-shaped sectional
    const beige = std(0xa89880, 0.95);
    const couch = this.group(16.2, 13.45, Math.PI);
    this.b(couch, 2.6, 0.4, 0.95, beige, 0, 0, 0);
    this.b(couch, 2.6, 0.45, 0.22, beige, 0, 0.4, -0.37);
    for (let i = 0; i < 3; i++) this.b(couch, 0.84, 0.1, 0.72, std(0xb4a48a, 0.95), -0.86 + i * 0.86, 0.4, 0.08);
    this.put(couch);
    const chaise = this.group(14.2, 12.4, Math.PI);
    this.b(chaise, 0.95, 0.4, 1.3, beige, 0, 0, 0);
    this.b(chaise, 0.95, 0.1, 1.2, std(0xb4a48a, 0.95), 0, 0.4, 0);
    this.put(chaise);
    // floating wall shelf with books
    const wshelf = this.group(16.2, 13.75, Math.PI);
    this.b(wshelf, 1.6, 0.04, 0.25, M.darkWood, 0, 1.75, 0);
    for (let i = 0; i < 9; i++) this.b(wshelf, 0.06, rand(0.18, 0.26), 0.18, std(pick([0x7a2020, 0x203a5a, 0xcccccc, 0x5a4a20]), 0.9), -0.6 + i * 0.08, 1.79, 0);
    this.put(wshelf, false);
    this.table(16.5, 12.0, 1.1, 0.6, 0.42, M.darkWood);
    this.bookObj(16.3, 0.42, 12.0, 0x203050);
    this.cup(16.8, 0.42, 11.9, 0xb0a080);
    const tv = this.group(15.5, 6.3);
    this.b(tv, 1.4, 0.5, 0.4, M.darkWood, 0, 0, 0);
    this.b(tv, 0.9, 0.6, 0.35, std(0x1a1a1a, 0.5), 0, 0.5, 0);
    this.put(tv);
    const tvScreen = canvasTex(64, 48);
    tvScreen.ctx.fillStyle = '#050505';
    tvScreen.ctx.fillRect(0, 0, 64, 48);
    this.tv = { canvas: tvScreen, on: false, pos: new THREE.Vector3(15.5, 0.8, 6.5), mat: new THREE.MeshBasicMaterial({ map: tvScreen.tex, color: 0x111111 }) };
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.48), this.tv.mat);
    scr.position.set(15.5, 0.8, 6.48);
    this.add(scr);
    const arm = this.group(20.6, 11, -Math.PI / 2);
    this.b(arm, 0.9, 0.42, 0.85, M.red, 0, 0, 0);
    this.b(arm, 0.9, 0.5, 0.18, M.red, 0, 0.42, -0.33);
    this.b(arm, 0.16, 0.25, 0.85, M.red, -0.37, 0.42, 0);
    this.b(arm, 0.16, 0.25, 0.85, M.red, 0.37, 0.42, 0);
    this.put(arm);
    const shelf = this.group(21.75, 9, -Math.PI / 2);
    this.b(shelf, 1.6, 2.0, 0.36, M.darkWood, 0, 0, 0);
    for (let s = 0; s < 4; s++) {
      let bx = -0.7;
      while (bx < 0.65) {
        const bw = rand(0.04, 0.08);
        this.b(shelf, bw, rand(0.22, 0.32), 0.25, std(pick([0x5a2020, 0x203a5a, 0x2a4a2a, 0x5a4a20, 0x302030]), 0.9), bx + bw / 2, 0.1 + s * 0.48, 0.08);
        bx += bw + 0.005;
      }
    }
    this.put(shelf);
    const lamp = this.group(13, 13.5);
    this.b(lamp, 0.3, 0.03, 0.3, M.brass, 0, 0, 0);
    this.b(lamp, 0.03, 1.5, 0.03, M.brass, 0, 0.03, 0);
    lamp.add(mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.25, 16, 1, true), std(0xcab890, 0.9, { side: THREE.DoubleSide }), 0, 1.55, 0));
    this.put(lamp);
    this.persianRug(16.5, 11, 3.6, 2.6);

    // ---- Hallway
    const side = this.table(11.72, 6.5, 0.9, 0.4, 0.8, M.darkWood, Math.PI / 2);
    void side;
    this.throwable(mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.26, 12), std(0x7a3a3a, 0.25)), 11.72, 0.8, 6.5, 0.13);
    const rack = this.group(8.35, 13.4);
    this.b(rack, 0.04, 1.8, 0.04, M.darkWood, 0, 0, 0);
    this.b(rack, 0.35, 0.03, 0.35, M.darkWood, 0, 0, 0);
    this.b(rack, 0.3, 0.8, 0.12, std(0x2a2420, 1), 0.08, 0.9, 0);
    this.put(rack);
    const clock = this.group(8.3, 0.6, Math.PI / 2);
    this.b(clock, 0.5, 2.0, 0.35, M.darkWood, 0, 0, 0);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.17, 24), new THREE.MeshStandardMaterial({ map: TX.clockFace(), roughness: 0.6 }));
    face.position.set(0, 1.65, 0.18);
    clock.add(face);
    this.put(clock);
    this.clockPos = new THREE.Vector3(8.4, 1.6, 0.6);
    this.painting(8 + WALL_T / 2 + 0.02, 1.6, 4.2, Math.PI / 2, 14);
    this.painting(12 - WALL_T / 2 - 0.02, 1.6, 8.2, -Math.PI / 2, 15);
    this.painting(17.5, 1.6, 13.94, Math.PI, 16);
    this.rug(10, 7, 1.4, 11, 0x4a1a1a);
  }

  rug(x, z, w, d, color) {
    const m = mesh(planeGeo(w, d), new THREE.MeshStandardMaterial({ map: TX.carpet('#' + color.toString(16).padStart(6, '0'), color & 255), roughness: 1 }), x, 0.015, z);
    m.castShadow = false;
    this.add(m);
  }

  painting(x, y, z, ry, seed) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = ry;
    g.add(mesh(new THREE.BoxGeometry(0.62, 0.78, 0.03), this.mat.brass));
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.66), new THREE.MeshStandardMaterial({ map: TX.portrait(seed), roughness: 0.8 }));
    pic.position.z = 0.017;
    g.add(pic);
    this.add(g);
  }

  persianRug(x, z, w, d) {
    const m = mesh(planeGeo(w, d), new THREE.MeshStandardMaterial({ map: TX.persianRug(), roughness: 1 }), x, 0.015, z);
    m.geometry.attributes.uv.array.forEach((v, i, a) => (a[i] = i % 2 ? v / d : v / w));
    m.castShadow = false;
    this.add(m);
  }

  // Windows with mullions and sheer curtains. Inside they glow faintly with moonlight; from
  // outside they glow warm when that room's light is on.
  buildWindows() {
    const spots = [
      [2.5, 0, [0, 1]], [0, 10.5, [1, 0]], [4.2, 14, [0, -1]], [0, 6.5, [1, 0], 0.7],
      [21.2, 0, [0, 1]], [22, 3, [-1, 0]], [14, 14, [0, -1]], [20.3, 14, [0, -1]], [22, 12.2, [-1, 0]],
    ];
    const frameMat = std(0xd8d6ce, 0.6);
    const curtainMat = new THREE.MeshStandardMaterial({ color: 0xe8e6de, roughness: 1, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
    this.windows = [];
    for (const [wx, wz, n, sc = 1] of spots) {
      const room = this.rooms[this.roomAt(wx + n[0] * 0.5, wz + n[1] * 0.5)];
      const ww = 1.1 * sc, wh = 1.25 * sc, cy = 1.6;
      for (const side of [1, -1]) {
        const g = new THREE.Group();
        const off = WALL_T / 2 + 0.012;
        g.position.set(wx + n[0] * off * side, cy, wz + n[1] * off * side);
        g.rotation.y = Math.atan2(n[0] * side, n[1] * side);
        const glassMat = new THREE.MeshStandardMaterial({ color: 0x05080e, roughness: 0.08, metalness: 0.3, emissive: side > 0 ? 0x101a30 : 0x0a0e16, emissiveIntensity: 1 });
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), glassMat);
        g.add(glass);
        const bar = (w, h, x, y) => g.add(mesh(new THREE.BoxGeometry(w, h, 0.04), frameMat, x, y, 0.02));
        bar(ww + 0.1, 0.06, 0, wh / 2);
        bar(ww + 0.1, 0.06, 0, -wh / 2);
        bar(0.06, wh, -ww / 2, 0);
        bar(0.06, wh, ww / 2, 0);
        bar(0.035, wh, 0, 0);
        bar(ww, 0.035, 0, wh * 0.1);
        g.add(mesh(new THREE.BoxGeometry(ww + 0.2, 0.04, 0.12), frameMat, 0, -wh / 2 - 0.04, 0.05));
        if (side > 0) {
          for (const cs of [-1, 1]) {
            const cg = new THREE.PlaneGeometry(ww * 0.38, wh + 0.5, 12, 1);
            const p = cg.attributes.position;
            for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 40) * 0.025);
            cg.computeVertexNormals();
            const cur = new THREE.Mesh(cg, curtainMat);
            cur.position.set(cs * (ww / 2 - ww * 0.12), 0.15, 0.09);
            g.add(cur);
          }
          const rod = mesh(new THREE.CylinderGeometry(0.012, 0.012, ww + 0.4), this.mat.black, 0, wh / 2 + 0.4, 0.1);
          rod.rotation.z = Math.PI / 2;
          g.add(rod);
        } else if (room) {
          this.windows.push({ room, mat: glassMat });
        }
        this.add(g);
      }
    }
  }

  buildFence() {
    const white = std(0xdcdad2, 0.7);
    const runs = [[-4, 4.4], [12.6, 26]];
    const fz = 16;
    let count = 0;
    for (const [a, b] of runs) count += Math.floor((b - a) / 0.16);
    const picket = new THREE.BoxGeometry(0.08, 1.0, 0.025);
    picket.translate(0, 0.5, 0);
    const inst = new THREE.InstancedMesh(picket, white, count);
    const m4 = new THREE.Matrix4();
    let i = 0;
    for (const [a, b] of runs) {
      for (let x = a; x < b - 0.08 && i < count; x += 0.16) {
        m4.makeTranslation(x, 0, fz);
        inst.setMatrixAt(i++, m4);
      }
      for (const y of [0.3, 0.8]) this.add(mesh(new THREE.BoxGeometry(b - a, 0.06, 0.03), white, (a + b) / 2, y, fz - 0.03));
      this.colliders.push({ minX: a, maxX: b, minZ: fz - 0.08, maxZ: fz + 0.08 });
    }
    inst.count = i;
    inst.castShadow = true;
    this.add(inst);
    // little path lights along the walk from the porch to the van
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd8a0, emissiveIntensity: 3 });
    for (const [lx, lz] of [[9.5, 15.0], [11.5, 15.0], [9.5, 16.3], [11.5, 16.9], [8.2, 16.3], [8.2, 18.1], [7.6, 16.3]]) {
      this.add(mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.4, 8), this.mat.black, lx, 0.2, lz));
      this.add(mesh(new THREE.SphereGeometry(0.045, 10, 8), lampMat, lx, 0.43, lz));
    }
  }

  // ---------- outside ----------
  buildExterior() {
    const M = this.mat;
    const ground = mesh(planeGeo(140, 140), new THREE.MeshStandardMaterial({ map: TX.grass(9), roughness: 1 }), 11, 0, 10);
    ground.castShadow = false;
    this.add(ground);
    const path = mesh(planeGeo(1.6, 2.6), new THREE.MeshStandardMaterial({ map: TX.dirt(10), roughness: 1 }), 10.5, 0.005, 16.1);
    const path2 = mesh(planeGeo(4.6, 1.4), path.material, 8.8, 0.005, 17.1);
    path2.castShadow = false;
    this.add(path2);
    path.castShadow = false;
    this.add(path);
    const drive = mesh(planeGeo(4.5, 10), new THREE.MeshStandardMaterial({ map: TX.dirt(40), roughness: 1 }), 6, 0.006, 20.5);
    drive.castShadow = false;
    this.add(drive);

    // roof
    const slab = mesh(new THREE.BoxGeometry(GW + 0.8, 0.25, GH + 0.8), M.black, GW / 2, WALL_H + 0.125, GH / 2);
    this.add(slab);
    const roofGeo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
    roofGeo.rotateY(Math.PI / 4);
    const roofTex = TX.shingles(11);
    roofTex.repeat.set(12, 12);
    const roof = mesh(roofGeo, new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.9 }), GW / 2, WALL_H + 0.25 + 1.6, GH / 2);
    roof.scale.set(GW + 1.2, 3.2, GH + 1.2);
    this.add(roof);
    // porch step + light
    this.add(mesh(new THREE.BoxGeometry(2, 0.12, 1), std(0x55524c, 0.9), 10.5, 0.06, 14.6));
    const porch = new THREE.SpotLight(0xffc880, 6, 9, 0.9, 0.7, 1.5);
    porch.position.set(10.5, 2.5, 14.25);
    porch.target.position.set(10.5, 0, 17);
    this.add(porch);
    this.add(porch.target);
    this.add(mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshStandardMaterial({ emissive: 0xffc880, emissiveIntensity: 2, color: 0x222222 }), 10.5, 2.5, 14.12));

    this.buildFence();

    // ---- walk-in investigation van: rear doors face the house ----
    this.buildVan();

    // street lamp lighting the driveway
    const post = this.group(8.6, 16.2);
    this.b(post, 0.12, 4.4, 0.12, M.black, 0, 0, 0);
    this.b(post, 1.0, 0.08, 0.08, M.black, -0.45, 4.3, 0);
    post.add(mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshStandardMaterial({ emissive: 0xffb060, emissiveIntensity: 3, color: 0x222222 }), -0.9, 4.25, 0));
    this.put(post);

    // trees and boundary
    const trunkMat = std(0x2a1f18, 1);
    const leafMat = std(0x0f1a10, 1);
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2;
      const rx = 11 + Math.cos(a) * rand(22, 30);
      const rz = 10 + Math.sin(a) * rand(18, 26);
      const h = rand(5, 9);
      this.add(mesh(new THREE.CylinderGeometry(0.15, 0.25, h * 0.4), trunkMat, rx, h * 0.2, rz));
      this.add(mesh(new THREE.ConeGeometry(rand(1.4, 2.2), h * 0.75, 7), leafMat, rx, h * 0.4 + h * 0.37, rz));
    }
    this.colliders.push({ minX: -9, maxX: -8, minZ: -8, maxZ: 28 });
    this.colliders.push({ minX: 30, maxX: 31, minZ: -8, maxZ: 28 });
    this.colliders.push({ minX: -9, maxX: 31, minZ: -8, maxZ: -7 });
    this.colliders.push({ minX: -9, maxX: 31, minZ: 26, maxZ: 27 });
  }

  buildVan() {
    const M = this.mat;
    const x0 = 4.8, x1 = 7.2, z0 = 17.5, z1 = 22.5, H = 2.4, T = 0.08;
    this.vanBounds = { minX: x0, maxX: x1, minZ: z0, maxZ: z1 };
    const shell = std(0xd8d8d0, 0.45);
    const inner = std(0x8d939b, 0.8);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const wall = (w, h, d, x, y, z, collide = true) => {
      const m = mesh(boxGeo(w, h, d), [shell, inner, inner, inner, inner, inner], x, y + h / 2, z);
      this.add(m);
      if (collide) this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
      return m;
    };
    // side walls (shell faces outward: +x face for the right wall, so swap materials)
    const left = wall(T, H, z1 - z0, x0, 0.25, cz);
    left.material = [inner, shell, inner, inner, inner, inner];
    wall(T, H, z1 - z0, x1, 0.25, cz);
    const front = wall(x1 - x0 + T, H, T, cx, 0.25, z1);
    front.material = [inner, inner, inner, inner, shell, inner];
    // rear frame stubs + header around a 1.6 m opening
    for (const sx of [x0 + 0.2, x1 - 0.2]) {
      const s = wall(0.4, H, T, sx, 0.25, z0);
      s.material = [inner, inner, inner, inner, inner, shell];
    }
    wall(x1 - x0, 0.35, T, cx, H - 0.1, z0, false);
    // roof, floor platform, chassis skirt
    this.add(mesh(boxGeo(x1 - x0 + 0.1, 0.08, z1 - z0 + 0.1), shell, cx, H + 0.25 + 0.04, cz));
    const floor = mesh(planeGeo(x1 - x0, z1 - z0), std(0x2a2c30, 0.9), cx, 0.25, cz);
    floor.castShadow = false;
    this.add(floor);
    this.add(mesh(boxGeo(x1 - x0, 0.25, z1 - z0 + 1.6), std(0x1a1a1a, 0.8), cx, 0.125, cz + 0.8));
    const step = mesh(boxGeo(1.6, 0.12, 0.5), M.metal, cx, 0.06, z0 - 0.25);
    this.add(step);
    this.vanFloor = 0.25;
    // yellow floor safety stripes (like a real equipment van)
    const yellow = new THREE.MeshStandardMaterial({ color: 0xd8b818, roughness: 0.6, emissive: 0x2a2400 });
    for (const sx of [x0 + 0.62, x1 - 0.5]) {
      const s = new THREE.Mesh(planeGeo(0.06, z1 - z0 - 0.2), yellow);
      s.position.set(sx, 0.255, cz);
      this.add(s);
    }
    // cab
    this.add(mesh(boxGeo(x1 - x0, 1.6, 1.5), shell, cx, 0.25 + 0.8, z1 + 0.8));
    this.colliders.push({ minX: x0, maxX: x1, minZ: z1, maxZ: z1 + 1.55 });
    this.add(mesh(boxGeo(x1 - x0 - 0.2, 0.55, 0.02), M.glass, cx, 1.35, z1 + 1.56));
    for (const [wx, wz] of [[x0 - 0.02, z0 + 0.9], [x1 + 0.02, z0 + 0.9], [x0 - 0.02, z1 + 0.6], [x1 + 0.02, z1 + 0.6]]) {
      const wheel = mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.25, 18), M.black, wx, 0.38, wz);
      wheel.rotation.z = Math.PI / 2;
      this.add(wheel);
    }
    // open rear doors
    for (const s of [-1, 1]) {
      const p = new THREE.Group();
      p.position.set(s < 0 ? x0 : x1, 0.25, z0);
      p.rotation.y = s < 0 ? -2.0 : 2.0 + Math.PI;
      const leaf = mesh(boxGeo(1.2, H - 0.1, 0.05), shell, 0.6, (H - 0.1) / 2, 0);
      p.add(leaf);
      this.add(p);
    }
    // side logo
    const logo = canvasTex(512, 128);
    logo.ctx.fillStyle = '#d8d8d0';
    logo.ctx.fillRect(0, 0, 512, 128);
    logo.ctx.fillStyle = '#3a1010';
    logo.ctx.font = 'bold 54px Georgia, serif';
    logo.ctx.textAlign = 'center';
    logo.ctx.fillText('WRAITHLINE', 256, 64);
    logo.ctx.font = '26px Georgia, serif';
    logo.ctx.fillText('paranormal investigations', 256, 104);
    for (const s of [-1, 1]) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshStandardMaterial({ map: logo.tex, roughness: 0.5 }));
      sign.position.set(s < 0 ? x0 - 0.045 : x1 + 0.045, 1.6, cz);
      sign.rotation.y = s < 0 ? -Math.PI / 2 : Math.PI / 2;
      this.add(sign);
    }
    // interior: fluorescent strip
    this.add(mesh(boxGeo(0.12, 0.04, 2.6), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe8f0ff, emissiveIntensity: 2 }), cx, H + 0.2, cz));
    const vl = new THREE.PointLight(0xdfe8ff, 14, 7, 2);
    vl.position.set(cx, H, cz);
    this.add(vl);

    const peg = new THREE.Mesh(boxGeo(0.02, 1.0, 4.2), new THREE.MeshStandardMaterial({ map: TX.pegboard(), roughness: 0.9 }));
    peg.position.set(x1 - 0.05, 0.25 + 1.75, cz);
    this.add(peg);

    // desk with monitors along the left wall
    const desk = this.group(x0 + 0.33, cz + 0.4);
    desk.position.y = 0.25;
    this.b(desk, 0.55, 0.05, 3.2, std(0x1e1f22, 0.6), 0, 0.73, 0);
    this.b(desk, 0.5, 0.73, 0.05, std(0x1e1f22, 0.6), 0, 0, -1.55);
    this.b(desk, 0.5, 0.73, 0.05, std(0x1e1f22, 0.6), 0, 0, 1.55);
    this.put(desk);
    const screen = (w, h, z, y, cw, ch) => {
      const c = canvasTex(cw, ch);
      const frame = mesh(boxGeo(0.04, h + 0.06, w + 0.06), M.black, x0 + 0.07, y, z);
      this.add(frame);
      const s = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: c.tex }));
      s.position.set(x0 + 0.095, y, z);
      s.rotation.y = Math.PI / 2;
      this.add(s);
      return c;
    };
    this.activityMon = screen(1.0, 0.6, 19.0, 1.75, 512, 300);
    this.monitor = screen(1.0, 0.6, 20.15, 1.75, 512, 300);
    this.mapMon = screen(0.8, 0.5, 21.3, 1.7, 448, 280);
    // laptop on the desk = end-investigation terminal
    const laptop = new THREE.Group();
    laptop.position.set(x0 + 0.35, 0.25 + 0.78, 21.6);
    laptop.rotation.y = Math.PI / 2;
    laptop.add(mesh(new THREE.BoxGeometry(0.4, 0.02, 0.28), std(0x2a2a2e, 0.4), 0, 0.01, 0));
    const lid = mesh(new THREE.BoxGeometry(0.4, 0.26, 0.015), std(0x2a2a2e, 0.4), 0, 0.14, -0.14);
    lid.rotation.x = -0.25;
    laptop.add(lid);
    this.terminalScreen = canvasTex(256, 160);
    const ls = new THREE.Mesh(new THREE.PlaneGeometry(0.37, 0.23), new THREE.MeshBasicMaterial({ map: this.terminalScreen.tex }));
    ls.position.z = 0.009;
    lid.add(ls);
    laptop.traverse((o) => (o.userData.terminal = true));
    this.add(laptop);
    this.interactables.push(laptop);
    this.terminalPos = laptop.position;

    // whiteboard on the front wall
    this.whiteboard = canvasTex(512, 300);
    const wb = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.88), new THREE.MeshStandardMaterial({ map: this.whiteboard.tex, roughness: 0.4 }));
    wb.position.set(cx + 0.15, 1.55, z1 - 0.05);
    wb.rotation.y = Math.PI;
    this.add(wb);
    this.add(mesh(boxGeo(1.56, 0.94, 0.02), M.metal, cx + 0.15, 1.55, z1 - 0.035));

    // equipment rack along the right wall
    const rack = this.group(x1 - 0.25, cz);
    rack.position.y = 0.25;
    const rackMat = std(0x9a9ea4, 0.45, { metalness: 0.6 });
    for (const y of [0.15, 0.85]) this.b(rack, 0.38, 0.03, 4.4, rackMat, 0, y, 0);
    for (const z of [-2.15, 0, 2.15]) this.b(rack, 0.38, 1.4, 0.03, rackMat, 0, 0, z);
    this.put(rack);
    this.gearSpots = [];
    for (let i = 0; i < 9; i++) this.gearSpots.push(new THREE.Vector3(x1 - 0.25, 0.25 + 0.88, z0 + 0.45 + i * 0.47));
  }

  inVan(p) {
    const b = this.vanBounds;
    return p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ;
  }

  floorAt(x, z) {
    return this.vanBounds && this.inVan({ x, z }) ? this.vanFloor : 0;
  }

  // Bake every static mesh into one merged mesh per material so the house renders in a few
  // dozen draw calls instead of over a thousand. Doors, switches, throwables and the laptop stay live.
  mergeStatic() {
    const dynamic = new Set();
    const mark = (o) => o.traverse((c) => dynamic.add(c));
    this.doors.forEach((d) => mark(d.pivot));
    this.throwables.forEach((t) => mark(t.mesh));
    this.interactables.forEach(mark);
    const occ = new Set(this.occluders);
    const buckets = new Map();
    const remove = [];
    const cache = new Map();
    this.scene.updateMatrixWorld(true);
    this.scene.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || dynamic.has(o)) return;
      const multi = Array.isArray(o.material);
      let ni = cache.get(o.geometry);
      if (!ni) {
        ni = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
        cache.set(o.geometry, ni);
      }
      const total = ni.attributes.position.count;
      const groups = multi ? o.geometry.groups : [{ start: 0, count: total, materialIndex: 0 }];
      for (const gr of groups) {
        const mat = multi ? o.material[gr.materialIndex] : o.material;
        const part = new THREE.BufferGeometry();
        for (const name of ["position", "normal", "uv"]) {
          const a = ni.attributes[name];
          part.setAttribute(name, new THREE.BufferAttribute(a.array.slice(gr.start * a.itemSize, (gr.start + gr.count) * a.itemSize), a.itemSize));
        }
        part.applyMatrix4(o.matrixWorld);
        const key = mat.uuid + (occ.has(o) ? "|occ" : "") + (o.castShadow ? "|cs" : "");
        if (!buckets.has(key)) buckets.set(key, { mat, parts: [], occ: occ.has(o), cast: o.castShadow });
        buckets.get(key).parts.push(part);
      }
      remove.push(o);
    });
    remove.forEach((o) => o.parent.remove(o));
    this.occluders = [];
    for (const b of buckets.values()) {
      const m = new THREE.Mesh(mergeGeometries(b.parts), b.mat);
      m.castShadow = b.cast;
      m.receiveShadow = true;
      this.scene.add(m);
      if (b.occ) this.occluders.push(m);
    }
  }

  // ---------- runtime ----------
  getColliders() {
    const list = this.colliders.slice();
    for (const d of this.doors) if (d.open < 0.12) list.push(d.collider);
    return list;
  }

  getOccluders() {
    const list = this.occluders.slice();
    for (const d of this.doors) if (d.open < 0.25) list.push(d.leaf);
    return list;
  }

  isInside(x, z) {
    return x > 0 && z > 0 && x < GW && z < GH;
  }

  update(dt, audio) {
    for (const d of this.doors) {
      const prev = d.open;
      const speed = d.slam ? 6 : 2.2;
      if (d.open < d.target) d.open = Math.min(d.target, d.open + dt * speed);
      else if (d.open > d.target) d.open = Math.max(d.target, d.open - dt * speed);
      if (prev > 0 && d.open === 0 && d.target === 0) {
        audio.doorClose(d.center, d.slam ? 1 : 0.5);
        d.slam = false;
      }
      let t = d.t0 + (d.t1 - d.t0) * d.open;
      d.pivot.rotation.y = t;
    }
    const cols = this.getColliders();
    for (const t of this.throwables) {
      if (!t.active) continue;
      const p = t.mesh.position;
      t.vel.y -= 9.8 * dt;
      p.addScaledVector(t.vel, dt);
      t.mesh.rotation.x += t.spin.x * dt;
      t.mesh.rotation.z += t.spin.z * dt;
      for (const c of cols) {
        const push = circleVsBox(p.x, p.z, t.r, c);
        if (push) {
          p.x += push[0];
          p.z += push[1];
          if (push[0]) t.vel.x *= -0.4;
          if (push[1]) t.vel.z *= -0.4;
        }
      }
      if (p.y - t.hh <= 0.01) {
        p.y = t.hh + 0.01;
        const impact = -t.vel.y;
        if (impact > 1.2 && performance.now() - t.lastHit > 150) {
          audio.thud(p, Math.min(1, impact / 5));
          t.lastHit = performance.now();
        }
        t.vel.y = impact * 0.3;
        t.vel.x *= 0.6;
        t.vel.z *= 0.6;
        t.spin.multiplyScalar(0.5);
        if (t.vel.length() < 0.35) {
          t.active = false;
          t.vel.set(0, 0, 0);
          t.mesh.rotation.x = Math.round(t.mesh.rotation.x / (Math.PI / 2)) * (Math.PI / 2);
          t.mesh.rotation.z = Math.round(t.mesh.rotation.z / (Math.PI / 2)) * (Math.PI / 2);
        }
      }
    }
  }

  // ---------- pathfinding (4-connected grid, ghosts ignore furniture and doors) ----------
  passable(ix, iz, dx, dz) {
    const nx = ix + dx, nz = iz + dz;
    if (this.cell(nx, nz) < 0) return false;
    if (dx === 1) return !this.wallEdges.has(`v${ix + 1},${iz}`);
    if (dx === -1) return !this.wallEdges.has(`v${ix},${iz}`);
    if (dz === 1) return !this.wallEdges.has(`h${ix},${iz + 1}`);
    return !this.wallEdges.has(`h${ix},${iz}`);
  }

  findPath(fx, fz, tx, tz) {
    const sx = Math.floor(fx), sz = Math.floor(fz);
    let ex = Math.floor(tx), ez = Math.floor(tz);
    if (this.cell(sx, sz) < 0) return [];
    const clamped = this.cell(ex, ez) < 0;
    if (clamped) {
      // target outside: clamp to the nearest inside cell
      ex = Math.max(0, Math.min(GW - 1, ex));
      ez = Math.max(0, Math.min(GH - 1, ez));
      if (this.cell(ex, ez) < 0) return [];
    }
    const key = (x, z) => z * GW + x;
    const start = key(sx, sz), goal = key(ex, ez);
    const came = new Map([[start, -1]]);
    const g = new Map([[start, 0]]);
    const open = [[Math.abs(ex - sx) + Math.abs(ez - sz), start]];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (open.length) {
      open.sort((a, b) => a[0] - b[0]);
      const [, cur] = open.shift();
      if (cur === goal) break;
      const cx = cur % GW, cz = Math.floor(cur / GW);
      for (const [dx, dz] of dirs) {
        if (!this.passable(cx, cz, dx, dz)) continue;
        const n = key(cx + dx, cz + dz);
        const ng = g.get(cur) + 1;
        if (!g.has(n) || ng < g.get(n)) {
          g.set(n, ng);
          came.set(n, cur);
          open.push([ng + Math.abs(ex - cx - dx) + Math.abs(ez - cz - dz), n]);
        }
      }
    }
    if (!came.has(goal)) return [];
    const path = [];
    for (let c = goal; c !== start && c !== -1; c = came.get(c)) {
      path.unshift(new THREE.Vector3((c % GW) + 0.5, 0, Math.floor(c / GW) + 0.5));
    }
    if (path.length && !clamped) path[path.length - 1].set(tx, 0, tz);
    return path;
  }

  randomPointInRoom(id, margin = 0.6) {
    const [x0, z0, x1, z1] = this.rooms[id].rect;
    return new THREE.Vector3(rand(x0 + margin, x1 - margin), 0, rand(z0 + margin, z1 - margin));
  }
}
