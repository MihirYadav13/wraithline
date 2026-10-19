// The haunted house: a 22 x 14 m single-storey home on a 1 m grid, plus the yard and the van.
import * as THREE from 'three';
import { boxGeo, planeGeo, mesh, std, canvasTex, rand, pick, circleVsBox } from './util.js';
import * as TX from './textures.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const WALL_T = 0.12;

export const has = (list, o, a, b) => list.some((d) => d.o === o && d.x === a && d.z === b);

export class Level {
  constructor(scene, map, assets) {
    this.scene = scene;
    this.map = map;
    this.assets = assets;
    this.GW = map.GW;
    this.GH = map.GH;
    this.H = map.wallH || 2.7;
    this.colliders = [];
    this.occluders = [];
    this.interactables = [];
    this.doors = [];
    this.throwables = [];
    this.wallEdges = new Set();
    this.rooms = map.rooms.map((r, id) => ({
      ...r,
      id,
      lightOn: false,
      flicker: 0,
      lights: [],
      bulbs: [],
      temp: 15 + rand(-0.5, 0.5),
      center: new THREE.Vector3((r.rect[0] + r.rect[2]) / 2, 0, (r.rect[1] + r.rect[3]) / 2),
    }));
    this.grid = new Int8Array(this.GW * this.GH).fill(-1);
    this.rooms.forEach((r) => {
      const [x0, z0, x1, z1] = r.rect;
      for (let x = x0; x < x1; x++) for (let z = z0; z < z1; z++) this.grid[z * this.GW + x] = r.id;
    });
    this.makeMaterials();
    this.buildFloors();
    this.buildWalls();
    this.buildWindows();
    this.buildDoors();
    this.buildLights();
    this.map.furnish(this);
    this.buildExterior();
    this.mergeStatic();
  }

  cell(ix, iz) {
    if (ix < 0 || iz < 0 || ix >= this.GW || iz >= this.GH) return -1;
    return this.grid[iz * this.GW + ix];
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
    // photo-scanned CC0 surfaces (Poly Haven) replace the painted canvases where it matters most
    const A = this.assets;
    Object.assign(this.floorMats, {
      wood: A.material('plank_flooring_02', 2.2, { color: 0xa08a78 }),
      wood2: A.material('old_wood_floor', 2.4),
      tile: A.material('dirty_tiles', 1.2),
      oldwood: A.material('old_wood_floor', 2.4, { color: 0x8a7a6a }),
      concrete: A.material('concrete_floor_worn_001', 3),
    });
    Object.assign(this.wallMats, {
      stripe: A.material('decrepit_wallpaper', 1.6, { color: 0xa0ab98 }),
      tileWall: A.material('dirty_tiles', 1.2),
      paint: A.material('painted_plaster_wall', 2, { color: 0xc8c0a8 }),
      gray: A.material('painted_plaster_wall', 2, { color: 0x8a8f96 }),
      exterior: A.material(this.map.siding || 'weathered_plank_siding', 2.5, { color: this.map.sidingColor ?? 0x9aa6b4 }),
      logs: A.material('wood_plank_wall', 2.2, { color: 0xa09080 }),
      planks: A.material('weathered_planks', 2),
    });
    this.wallMats.padded = new THREE.MeshStandardMaterial({ map: TX.mattress(83), color: 0xc8c4b4, roughness: 1 });
    this.wallMats.asylum = new THREE.MeshStandardMaterial({ map: TX.twoTone('#2e5652', '#b5ae96', this.H), normalMap: A.material('painted_plaster_wall', 2).normalMap, roughness: 0.9 });
    this.ceilMat = A.material(this.map.ceiling || 'white_plaster_rough_01', 2.5, { color: this.map.ceilColor ?? 0xbcb8ae });
    this.trimMat = std(this.map.trimColor ?? 0xcfc8b8, 0.55);
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
    const ceilGeo = planeGeo(this.GW, this.GH);
    ceilGeo.rotateX(Math.PI);
    const ceil = mesh(ceilGeo, this.ceilMat, this.GW / 2, this.H, this.GH / 2);
    this.add(ceil);
  }

  wallMatFor(id) {
    return id < 0 ? this.wallMats.exterior : this.wallMats[this.rooms[id].wall];
  }

  buildWalls() {
    const isWall = (o, a, b, A, B) => A !== B && !has(this.map.doors, o, a, b) && !has(this.map.openings, o, a, b);
    // vertical lines x = X
    for (let X = 0; X <= this.GW; X++) {
      let run = null;
      for (let zi = 0; zi <= this.GH; zi++) {
        let key = null, A = -2, B = -2;
        if (zi < this.GH) {
          A = this.cell(X - 1, zi);
          B = this.cell(X, zi);
          if (isWall('v', X, zi, A, B)) {
            key = `${A}|${B}`;
            this.wallEdges.add(`v${X},${zi}`);
          } else if (A !== B) {
            this.addLintel('v', X, zi, A, B, has(this.map.doors, 'v', X, zi) ? 2.12 : 2.3);
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
    for (let Z = 0; Z <= this.GH; Z++) {
      let run = null;
      for (let xi = 0; xi <= this.GW; xi++) {
        let key = null, A = -2, B = -2;
        if (xi < this.GW) {
          A = this.cell(xi, Z - 1);
          B = this.cell(xi, Z);
          if (isWall('h', xi, Z, A, B)) {
            key = `${A}|${B}`;
            this.wallEdges.add(`h${xi},${Z}`);
          } else if (A !== B) {
            this.addLintel('h', xi, Z, A, B, has(this.map.doors, 'h', xi, Z) ? 2.12 : 2.3);
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
      const geo = boxGeo(T, this.H, z1 - z0);
      const mats = [this.wallMatFor(B), this.wallMatFor(A), this.capMat, this.capMat, this.capMat, this.capMat];
      const m = mesh(geo, mats, line, this.H / 2, (z0 + z1) / 2);
      this.add(m);
      this.occluders.push(m);
      this.colliders.push({ minX: line - T / 2, maxX: line + T / 2, minZ: z0, maxZ: z1 });
      this.addTrim(boxGeo(T + 0.03, 0.12, e - s), line, (s + e) / 2);
      this.addTrim(boxGeo(T + 0.06, 0.07, e - s), line, (s + e) / 2, this.H - 0.035);
    } else {
      const geo = boxGeo(e - s, this.H, T);
      const mats = [this.capMat, this.capMat, this.capMat, this.capMat, this.wallMatFor(B), this.wallMatFor(A)];
      const m = mesh(geo, mats, (s + e) / 2, this.H / 2, line);
      this.add(m);
      this.occluders.push(m);
      this.colliders.push({ minX: s, maxX: e, minZ: line - T / 2, maxZ: line + T / 2 });
      this.addTrim(boxGeo(e - s, 0.12, T + 0.03), (s + e) / 2, line);
      this.addTrim(boxGeo(e - s, 0.07, T + 0.06), (s + e) / 2, line, this.H - 0.035);
    }
  }

  // baseboards (y = 0.06) and crown molding along the top of each wall run
  addTrim(geo, x, z, y = 0.06) {
    const m = mesh(geo, this.trimMat, x, y, z);
    m.castShadow = false;
    this.add(m);
  }

  addLintel(o, a, b, A, B, bottom) {
    const h = this.H - bottom;
    const shiftV = (g) => {
      const uv = g.attributes.uv;
      for (const f of [0, 1, 4, 5]) for (let k = 0; k < 4; k++) uv.setY(f * 4 + k, uv.getY(f * 4 + k) + bottom);
      return g;
    };
    if (o === 'v') {
      const mats = [this.wallMatFor(B), this.wallMatFor(A), this.capMat, this.capMat, this.capMat, this.capMat];
      this.add(mesh(shiftV(boxGeo(WALL_T, h, 1)), mats, a, bottom + h / 2, b + 0.5));
    } else {
      const mats = [this.capMat, this.capMat, this.capMat, this.capMat, this.wallMatFor(B), this.wallMatFor(A)];
      this.add(mesh(shiftV(boxGeo(1, h, WALL_T)), mats, a + 0.5, bottom + h / 2, b));
    }
  }

  buildDoors() {
    const doorTex = TX.doorWood();
    const doorMat = new THREE.MeshStandardMaterial({ map: doorTex, roughness: 0.7 });
    const ang = ([dx, dz]) => Math.atan2(-dz, dx);
    for (const d of this.map.doors) {
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
      const lightColor = this.map.lightColor ?? 0xffd29a;
      const light = new THREE.PointLight(lightColor, 0, Math.max(w, d) * 0.8 + 2.5, 2);
      light.position.set((x0 + x1) / 2, this.H - 0.45, (z0 + z1) / 2);
      light.userData.base = 5 + w * d * (lamps.length > 1 ? 0.3 : 0.22);
      if (r.split) {
        // long corridors: one light per fixture so the far ends aren't black
        light.userData.base /= lamps.length * 0.7;
        light.distance = 7;
        light.position.set(lamps[0][0], this.H - 0.45, lamps[0][1]);
        for (const [lx, lz] of lamps.slice(1)) {
          const extra = light.clone();
          extra.position.set(lx, this.H - 0.45, lz);
          this.add(extra);
          r.lights.push(extra);
        }
      }
      this.add(light);
      r.lights.push(light);
      r.unstable = this.map.fixture === 'tube';
      if (r.sconce) {
        // wall sconce: brass arm and backplate, warm fabric shade (cabin style)
        const [sx, sz, n] = r.sconce;
        const g = new THREE.Group();
        g.position.set(sx + n[0] * (WALL_T / 2), 1.75, sz + n[1] * (WALL_T / 2));
        g.rotation.y = Math.atan2(n[0], n[1]);
        const plate = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.015, 16), this.mat.brass, 0, 0, 0.008);
        plate.rotation.x = Math.PI / 2;
        g.add(plate);
        const arm = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 8), this.mat.brass, 0, 0.03, 0.08);
        arm.rotation.x = 1.1;
        g.add(arm);
        const shadeMat = new THREE.MeshStandardMaterial({ color: 0xc8a060, roughness: 0.9, side: THREE.DoubleSide, emissive: 0xffa040, emissiveIntensity: 0 });
        g.add(mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.16, 16, 1, true), shadeMat, 0, 0.12, 0.15));
        this.add(g);
        r.bulbs.push(shadeMat);
        light.position.set(sx + n[0] * 0.45, 1.95, sz + n[1] * 0.45);
      }
      for (const [lx, lz] of r.sconce ? [] : lamps) {
        if (this.map.fixture === 'tube') {
          // fluorescent tube fixture: metal housing with a cold glowing diffuser
          const along = r.tubeAxis ?? (w >= d ? 'x' : 'z');
          const g = new THREE.Group();
          g.position.set(lx, this.H - 0.04, lz);
          if (along === 'z') g.rotation.y = Math.PI / 2;
          g.add(mesh(new THREE.BoxGeometry(1.25, 0.06, 0.2), this.mat.metal, 0, 0, 0));
          const tubeMat = new THREE.MeshStandardMaterial({ color: 0xd8e0e8, emissive: 0xe6f0ff, emissiveIntensity: 0 });
          g.add(mesh(new THREE.BoxGeometry(1.15, 0.03, 0.14), tubeMat, 0, -0.035, 0));
          g.traverse((o) => (o.castShadow = false));
          this.add(g);
          r.bulbs.push(tubeMat);
          continue;
        }
        // flush-mount ceiling fixture: brass rim + frosted glass dome that glows when on
        const rim = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.025, 24), this.mat.brass, lx, this.H - 0.0125, lz);
        rim.castShadow = false;
        this.add(rim);
        const bulbMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.4, emissive: 0xffd8a0, emissiveIntensity: 0 });
        const bulb = mesh(new THREE.SphereGeometry(0.17, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), bulbMat, lx, this.H - 0.02, lz);
        bulb.scale.y = 0.55;
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

  updateLights(dt, ghostPos, hunting, audio) {
    for (const r of this.rooms) {
      if (r.flicker > 0) r.flicker -= dt;
      else if (r.unstable && r.lightOn && Math.random() < dt * 0.02) {
        r.flicker = 0.4 + Math.random() * 1.2;
        audio?.buzz(r.center.clone().setY(this.H - 0.2), r.flicker, 0.18);
      }
      let k = r.lightOn ? 1 : 0;
      if (k && hunting && ghostPos && ghostPos.distanceTo(r.center) < 7) k = Math.random() < 0.5 ? 0.05 : 1;
      if (k && r.flicker > 0) k = Math.random() < 0.45 ? 0.05 : 1;
      r.lights.forEach((l) => (l.intensity = l.userData.base * k));
      r.bulbs.forEach((b) => (b.emissiveIntensity = (r.unstable ? 0.7 : 1.3) * k));
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

  // Place a CC0 model (real-world scale, origin on the floor, front facing +z).
  model(id, x, z, ry = 0, { y = 0, collide = true, pad = 0, scale = 1 } = {}) {
    const m = this.assets.model(id);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.scale.setScalar(scale);
    this.add(m);
    m.updateMatrixWorld(true);
    if (collide) this.addColliderFrom(m, pad);
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
    const spots = this.map.windows;
    const frameMat = std(0xd8d6ce, 0.6);
    const curtainMat = new THREE.MeshStandardMaterial({ color: 0xe8e6de, roughness: 1, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
    this.windows = [];
    this.innerGlass = [];
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
          this.innerGlass.push(glassMat);
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
        if (side < 0 && this.map.windowBars) {
          for (let k = -2; k <= 2; k++) g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, wh + 0.1, 6), this.mat.black, (k * ww) / 5, 0, 0.09));
        }
        this.add(g);
      }
    }
  }

  // ---------- outside ----------
  buildExterior() {
    const M = this.mat, A = this.assets, W = this.GW, D = this.GH;
    const forest = this.map.ground === 'forest';
    const groundMat = forest
      ? A.material('brown_mud_leaves_01', 3, { color: 0x9a9a90 })
      : this.map.ground === 'snow'
        ? new THREE.MeshStandardMaterial({ map: TX.carpet('#c4cad2', 81), roughness: 0.9 })
        : new THREE.MeshStandardMaterial({ map: TX.grass(9), roughness: 1 });
    const ground = mesh(planeGeo(160, 160), groundMat, W / 2, 0, D / 2 + 6);
    ground.castShadow = false;
    this.add(ground);
    // roof
    this.add(mesh(new THREE.BoxGeometry(W + 0.8, 0.25, D + 0.8), M.black, W / 2, this.H + 0.125, D / 2));
    if (this.map.roof === 'flat') {
      const par = std(0x4a4a48, 0.9);
      for (const [w, d, x, z] of [[W + 0.8, 0.25, W / 2, -0.4], [W + 0.8, 0.25, W / 2, D + 0.4], [0.25, D + 0.8, -0.4, D / 2], [0.25, D + 0.8, W + 0.4, D / 2]]) this.add(mesh(new THREE.BoxGeometry(w, 0.6, d), par, x, this.H + 0.55, z));
    } else if (this.map.roof === 'gable') {
      // gable roof with the ridge running along x
      const rise = 2.2, half = D / 2 + 0.6, slope = Math.hypot(half, rise);
      const roofMat = A.material('weathered_planks', 2, { color: 0x6a6258 });
      for (const sd of [-1, 1]) {
        const r = mesh(boxGeo(W + 1.2, 0.14, slope), roofMat, W / 2, this.H + 0.25 + rise / 2, D / 2 + (sd * half) / 2);
        r.rotation.x = sd * Math.atan2(rise, half);
        this.add(r);
      }
      // triangular gable ends
      const tri = new THREE.Shape([new THREE.Vector2(-D / 2 - 0.4, 0), new THREE.Vector2(D / 2 + 0.4, 0), new THREE.Vector2(0, rise)]);
      for (const x of [-0.05, W + 0.05]) {
        const g = mesh(new THREE.ShapeGeometry(tri), this.wallMats.exterior, x, this.H + 0.25, D / 2);
        g.rotation.y = x < 1 ? -Math.PI / 2 : Math.PI / 2;
        g.material.side = THREE.DoubleSide;
        this.add(g);
      }
    } else {
      const roofGeo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
      roofGeo.rotateY(Math.PI / 4);
      const roofTex = TX.shingles(11);
      roofTex.repeat.set(12, 12);
      const roof = mesh(roofGeo, new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.9 }), W / 2, this.H + 0.25 + 1.6, D / 2);
      roof.scale.set(W + 1.2, 3.2, D + 1.2);
      this.add(roof);
    }
    this.map.exterior(this);
    // ---- walk-in investigation van: rear doors face the house ----
    this.buildVan();

    // trees all around (denser for forest maps), kept clear of the house, yard and van
    const trunkMat = std(0x2a1f18, 1);
    const leafMat = std(0x0f1a10, 1);
    const n = forest ? 120 : 46;
    const v = this.vanBounds;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + rand(-0.05, 0.05);
      const rx = W / 2 + Math.cos(ang) * (W / 2 + rand(forest ? 4 : 9, forest ? 16 : 18));
      const rz = D / 2 + 3 + Math.sin(ang) * (D / 2 + rand(forest ? 5 : 9, forest ? 16 : 16));
      if (rx > v.minX - 4 && rx < v.maxX + 4 && rz > v.minZ - 6 && rz < v.maxZ + 4) continue;
      const h = rand(6, 11);
      this.add(mesh(new THREE.CylinderGeometry(0.15, 0.28, h * 0.45), trunkMat, rx, h * 0.22, rz));
      this.add(mesh(new THREE.ConeGeometry(rand(1.3, 2.3), h * 0.75, 7), leafMat, rx, h * 0.42 + h * 0.37, rz));
    }
    const bx0 = -10, bx1 = W + 10, bz0 = -10, bz1 = Math.max(D, v.maxZ) + 6;
    this.bounds = { minX: bx0, maxX: bx1, minZ: bz0, maxZ: bz1 };
    this.colliders.push({ minX: bx0 - 1, maxX: bx0, minZ: bz0, maxZ: bz1 });
    this.colliders.push({ minX: bx1, maxX: bx1 + 1, minZ: bz0, maxZ: bz1 });
    this.colliders.push({ minX: bx0, maxX: bx1, minZ: bz0 - 1, maxZ: bz0 });
    this.colliders.push({ minX: bx0, maxX: bx1, minZ: bz1, maxZ: bz1 + 1 });
  }

  buildVan() {
    const M = this.mat;
    const x0 = this.map.van.x0, z0 = this.map.van.z0, x1 = x0 + 2.4, z1 = z0 + 5, H = 2.4, T = 0.08;
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
    this.activityMon = screen(1.0, 0.6, z0 + 1.5, 1.75, 512, 300);
    this.monitor = screen(1.0, 0.6, z0 + 2.65, 1.75, 512, 300);
    this.mapMon = screen(0.8, 0.5, z0 + 3.8, 1.7, 448, 280);
    // laptop on the desk = end-investigation terminal
    const laptop = new THREE.Group();
    laptop.position.set(x0 + 0.35, 0.25 + 0.78, z0 + 4.1);
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
    const wb = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.88), new THREE.MeshStandardMaterial({ map: this.whiteboard.tex, roughness: 0.95, color: 0xd6d6d0 }));
    wb.position.set(cx + 0.15, 1.55, z1 - 0.05);
    wb.rotation.y = Math.PI;
    this.add(wb);
    this.add(mesh(boxGeo(1.56, 0.94, 0.02), M.metal, cx + 0.15, 1.55, z1 - 0.035));

    // equipment rack along the right wall
    const rack = this.group(x1 - 0.25, cz);
    rack.position.y = 0.25;
    const rackMat = std(0x9a9ea4, 0.45, { metalness: 0.6 });
    for (const y of [0.15, 0.85]) this.b(rack, 0.38, 0.03, 4.4, rackMat, 0, y, 0);
    for (const z of [-2.15, 0, 2.15]) for (const x of [-0.17, 0.17]) this.b(rack, 0.03, 1.0, 0.03, rackMat, x, 0, z);
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
      if (!['position', 'normal', 'uv'].every((k) => o.geometry.attributes[k])) return;
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
          // copy component-wise so interleaved / quantized glTF attributes come out as plain floats
          const a = ni.attributes[name];
          const arr = new Float32Array(gr.count * a.itemSize);
          for (let i = 0; i < gr.count; i++) for (let k = 0; k < a.itemSize; k++) arr[i * a.itemSize + k] = a.getComponent(gr.start + i, k);
          part.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
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

  // true when every way into the room is a closed door (rooms with open archways can't be sealed)
  isSealed(id) {
    if (this.openRooms === undefined) {
      this.openRooms = new Set();
      for (const o of this.map.openings) {
        this.openRooms.add(o.o === 'v' ? this.cell(o.x - 1, o.z) : this.cell(o.x, o.z - 1));
        this.openRooms.add(this.cell(o.x, o.z));
      }
    }
    if (this.openRooms.has(id)) return false;
    const doors = this.doors.filter((d) => d.rooms.includes(id));
    return doors.length > 0 && doors.every((d) => d.open < 0.25);
  }

  isInside(x, z) {
    return x > 0 && z > 0 && x < this.GW && z < this.GH;
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
      ex = Math.max(0, Math.min(this.GW - 1, ex));
      ez = Math.max(0, Math.min(this.GH - 1, ez));
      if (this.cell(ex, ez) < 0) return [];
    }
    const key = (x, z) => z * this.GW + x;
    const start = key(sx, sz), goal = key(ex, ez);
    const came = new Map([[start, -1]]);
    const g = new Map([[start, 0]]);
    const open = [[Math.abs(ex - sx) + Math.abs(ez - sz), start]];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (open.length) {
      open.sort((a, b) => a[0] - b[0]);
      const [, cur] = open.shift();
      if (cur === goal) break;
      const cx = cur % this.GW, cz = Math.floor(cur / this.GW);
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
      path.unshift(new THREE.Vector3((c % this.GW) + 0.5, 0, Math.floor(c / this.GW) + 0.5));
    }
    if (path.length && !clamped) path[path.length - 1].set(tx, 0, tz);
    return path;
  }

  randomPointInRoom(id, margin = 0.6) {
    const [x0, z0, x1, z1] = this.rooms[id].rect;
    return new THREE.Vector3(rand(x0 + margin, x1 - margin), 0, rand(z0 + margin, z1 - margin));
  }
}
