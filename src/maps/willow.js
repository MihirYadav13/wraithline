// Map: 14 Willow Lane — a single-storey family home (22 x 14 m), with a picket fence and a front yard.
import * as THREE from 'three';
import { boxGeo, planeGeo, mesh, std, canvasTex, rand, pick } from '../util.js';
import * as TX from '../textures.js';
import { WALL_T } from '../level.js';

const rooms = [
  { name: 'Hallway', rect: [8, 0, 12, 14], floor: 'wood', wall: 'stripe', sw: { x: 9.7, z: 14, n: [0, -1] }, lamps: [[10, 3.5], [10, 10.5]] },
  { name: 'Master Bedroom', rect: [0, 0, 8, 5], floor: 'carpet', wall: 'damask', sw: { x: 8, z: 1.7, n: [-1, 0] } },
  { name: 'Bathroom', rect: [0, 5, 8, 8], floor: 'tile', wall: 'tileWall', sw: { x: 8, z: 5.7, n: [-1, 0] } },
  { name: 'Nursery', rect: [0, 8, 8, 14], floor: 'carpetBlue', wall: 'kids', sw: { x: 8, z: 9.7, n: [-1, 0] } },
  { name: 'Kitchen', rect: [12, 0, 17, 6], floor: 'checker', wall: 'paint', sw: { x: 12, z: 1.7, n: [1, 0] } },
  { name: 'Dining Room', rect: [17, 0, 22, 6], floor: 'wood2', wall: 'damask2', sw: { x: 17, z: 2.7, n: [1, 0] } },
  { name: 'Living Room', rect: [12, 6, 22, 14], floor: 'wood', wall: 'gray', sw: { x: 12, z: 9.7, n: [1, 0] } },
];

// Door gaps on grid lines. 'v' = line x=X spanning cell z; 'h' = line z=Z spanning cell x.
const doors = [
  { o: 'v', x: 8, z: 2, swing: [-1, 0] },
  { o: 'v', x: 8, z: 6, swing: [-1, 0] },
  { o: 'v', x: 8, z: 10, swing: [-1, 0] },
  { o: 'v', x: 12, z: 2, swing: [1, 0] },
  { o: 'v', x: 12, z: 10, swing: [1, 0] },
  { o: 'h', x: 10, z: 14, swing: [0, -1], front: true },
];
const openings = [
  { o: 'v', x: 17, z: 3 },
  { o: 'h', x: 19, z: 6 },
  { o: 'h', x: 20, z: 6 },
];


export default {
  id: 'willow',
  name: '14 Willow Lane',
  blurb: 'Single-storey family home. Seven rooms, a nursery, a long central hallway.',
  GW: 22,
  GH: 14,
  wallH: 2.7,
  rooms,
  doors,
  openings,
  windows: [
      [2.5, 0, [0, 1]], [0, 10.5, [1, 0]], [4.2, 14, [0, -1]], [0, 6.5, [1, 0], 0.7],
      [21.2, 0, [0, 1]], [22, 3, [-1, 0]], [14, 14, [0, -1]], [20.3, 14, [0, -1]], [22, 12.2, [-1, 0]],
  ],
  van: { x0: 4.8, z0: 17.5 },
  ground: 'grass',
  env: { weather: 'rain', crickets: 0.4 },
  furnish(L) {
    const M = L.mat;
    // ---- Master bedroom
    L.model('GothicBed_01', 1.12, 2.5, Math.PI / 2);
    L.cabinet(0.3, 1.0, Math.PI / 2, 0.45, 0.55, 0.4, M.darkWood, 2);
    L.cabinet(0.3, 4.0, Math.PI / 2, 0.45, 0.55, 0.4, M.darkWood, 2);
    L.model('GothicCabinet_01', 5, 0.58, 0);
    L.model('drawer_cabinet', 3.6, 4.66, Math.PI);
    L.bookObj(0.3, 0.55, 1.0, 0x402020);
    L.cup(0.3, 0.55, 4.0, 0x8a8a8a);
    L.throwable(mesh(new THREE.BoxGeometry(0.12, 0.12, 0.06), std(0x2a2a2a, 0.4)), 3.3, 1.88, 4.7, 0.06);
    L.model('mantel_clock_01', 3.9, 4.7, Math.PI, { y: 1.88, collide: false });
    L.rug(3.2, 2.5, 2.4, 3.2, 0x3a2030);

    // ---- Bathroom
    const tub = L.group(0.48, 6.5);
    L.b(tub, 0.78, 0.55, 1.7, M.ceramic, 0, 0, 0);
    L.b(tub, 0.6, 0.02, 1.5, std(0x3a4448, 0.1), 0, 0.5, 0);
    L.put(tub);
    const toilet = L.group(3, 5.35);
    L.b(toilet, 0.38, 0.4, 0.5, M.ceramic, 0, 0, 0.1);
    L.b(toilet, 0.44, 0.38, 0.18, M.ceramic, 0, 0.4, -0.15);
    L.b(toilet, 0.4, 0.03, 0.45, M.white, 0, 0.4, 0.12);
    L.put(toilet);
    const sink = L.group(4.7, 5.3);
    L.b(sink, 0.7, 0.82, 0.42, M.lightWood, 0, 0, 0);
    L.b(sink, 0.74, 0.06, 0.46, M.ceramic, 0, 0.82, 0);
    L.put(sink);
    const mirror = mesh(new THREE.PlaneGeometry(0.6, 0.8), M.mirror, 4.7, 1.55, 5.065);
    L.add(mirror);
    L.cup(4.5, 0.88, 5.3, 0x6a8a9a);
    L.throwable(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.18, 10), std(0x8a3030, 0.4)), 4.95, 0.88, 5.25, 0.09);
    L.rug(4.2, 6.9, 1.4, 0.8, 0x4a6a6a);

    // ---- Nursery
    const crib = L.group(1.0, 12.6);
    L.b(crib, 0.7, 0.05, 1.3, M.cream, 0, 0.4, 0);
    for (const [px, pz] of [[-0.33, -0.63], [0.33, -0.63], [-0.33, 0.63], [0.33, 0.63]]) L.b(crib, 0.05, 0.95, 0.05, M.white, px, 0, pz);
    for (let i = 0; i < 11; i++) {
      const zz = -0.6 + i * 0.12;
      L.b(crib, 0.02, 0.5, 0.02, M.white, -0.33, 0.45, zz);
      L.b(crib, 0.02, 0.5, 0.02, M.white, 0.33, 0.45, zz);
    }
    L.b(crib, 0.7, 0.03, 0.03, M.white, 0, 0.93, -0.63);
    L.b(crib, 0.7, 0.03, 0.03, M.white, 0, 0.93, 0.63);
    L.put(crib);
    L.model('Rockingchair_01', 5.6, 12.9, Math.PI);
    L.cabinet(3.5, 13.65, Math.PI, 0.9, 0.5, 0.5, std(0x7a4a3a, 0.8), 1);
    L.table(2.6, 9.6, 0.8, 0.8, 0.5, M.lightWood);
    L.throwable(mesh(new THREE.SphereGeometry(0.1, 16, 12), std(0xb03030, 0.5)), 4.2, 0, 11.2, 0.1, 0.1);
    for (let i = 0; i < 4; i++) {
      L.throwable(mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), std(pick([0x3060b0, 0xd0b030, 0x30a050, 0xc04040]), 0.6)), rand(3, 5.5), 0, rand(10, 12), 0.045);
    }
    const teddy = new THREE.Group();
    teddy.add(mesh(new THREE.SphereGeometry(0.1, 12, 10), std(0x7a5030, 1), 0, 0, 0));
    teddy.add(mesh(new THREE.SphereGeometry(0.07, 12, 10), std(0x7a5030, 1), 0, 0.14, 0));
    teddy.add(mesh(new THREE.SphereGeometry(0.025, 8, 6), std(0x7a5030, 1), -0.05, 0.2, 0));
    teddy.add(mesh(new THREE.SphereGeometry(0.025, 8, 6), std(0x7a5030, 1), 0.05, 0.2, 0));
    L.throwable(teddy, 2.5, 0.5, 9.6, 0.1);
    L.cabinet(0.32, 9.4, Math.PI / 2, 1.0, 1.6, 0.5, std(0xc8b8a0, 0.7), 4);
    L.rug(3.5, 11, 3, 2.2, 0x6a5a8a);

    // ---- Kitchen
    const counter = L.group(14.65, 0.36);
    L.b(counter, 2.9, 0.88, 0.6, M.white, 0, 0, 0);
    L.b(counter, 2.94, 0.04, 0.64, std(0x2a2a2e, 0.3), 0, 0.88, 0);
    L.b(counter, 0.6, 0.01, 0.5, M.black, 0.8, 0.92, 0);
    for (const [bx, bz] of [[-0.14, -0.12], [0.14, -0.12], [-0.14, 0.12], [0.14, 0.12]]) {
      const burner = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.01, 16), M.metal, 0.8 + bx, 0.93, bz);
      counter.add(burner);
    }
    L.b(counter, 2.9, 0.7, 0.35, M.white, 0, 1.5, -0.12);
    for (let i = 0; i < 6; i++) L.b(counter, 0.01, 0.66, 0.01, M.black, -1.45 + i * 0.58, 1.52, 0.055);
    L.put(counter);
    const fridge = L.group(16.55, 0.42);
    L.b(fridge, 0.74, 1.8, 0.7, std(0xc8c8c0, 0.3), 0, 0, 0);
    L.b(fridge, 0.03, 0.5, 0.03, M.metal, -0.3, 0.9, 0.37);
    L.b(fridge, 0.74, 0.01, 0.01, M.black, 0, 1.2, 0.355);
    L.put(fridge);
    L.model('dining_table', 14.6, 3.6, 0);
    for (const cx of [14.0, 15.2]) {
      L.model('dining_chair_02', cx, 2.55, 0, { pad: -0.05 });
      L.model('dining_chair_02', cx, 4.65, Math.PI, { pad: -0.05 });
    }
    L.cup(14.3, 0.88, 3.5);
    L.cup(14.9, 0.88, 3.8, 0x4a6a8a);
    L.throwable(mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.02, 16), std(0xe0e0d8, 0.3)), 14.6, 0.88, 3.3, 0.01, 0.12);
    L.model('ceramic_vase_01', 13.0, 0.4, 0, { collide: false });
    L.throwable(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.26, 10), std(0x2a5a2a, 0.15, { transparent: true, opacity: 0.8 })), 13.6, 0.92, 0.4, 0.13);
    L.cup(15.3, 0.92, 0.35, 0xa0a0a0);
    L.add(mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.5, 12), M.metal, 12.5, 0.25, 5.5));

    // ---- Dining room
    L.table(19.5, 2.6, 2.4, 1.0, 0.76, M.darkWood);
    const cloth = mesh(boxGeo(2.5, 0.2, 1.1), std(0xe8e6e0, 0.9), 19.5, 0.67, 2.6);
    L.add(cloth);
    const whiteWood = std(0xdedad2, 0.6);
    for (const cx of [18.7, 19.5, 20.3]) {
      L.chair(cx, 1.85, 0, whiteWood, true);
      L.chair(cx, 3.35, Math.PI, whiteWood, true);
    }
    L.model('vintage_cabinet_01', 19.5, 0.42, 0);
    for (const cx of [18.8, 19.5, 20.2]) {
      L.throwable(mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.02, 16), std(0xe0e0d8, 0.3)), cx, 0.76, 2.4, 0.01, 0.12);
    }
    const candle = (cx) => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.04, 10), M.brass, 0, -0.08, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 8), M.cream, 0, 0.02, 0));
      L.throwable(g, cx, 0.76, 2.8, 0.1);
    };
    candle(19.0);
    candle(20.0);
    L.throwable(mesh(new THREE.SphereGeometry(0.07, 16, 12), std(0x1a3fa0, 0.15)), 19.5, 0.77, 2.6, 0.07);
    L.throwable(mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.28, 12), std(0x4a6a8a, 0.2)), 18.4, 0.77, 2.4, 0.14);
    L.rug(19.5, 2.6, 3.4, 2.2, 0x3a2a1a);

    // ---- Living room: beige L-shaped sectional
    const beige = std(0xa89880, 0.95);
    const couch = L.group(16.2, 13.45, Math.PI);
    L.b(couch, 2.6, 0.4, 0.95, beige, 0, 0, 0);
    L.b(couch, 2.6, 0.45, 0.22, beige, 0, 0.4, -0.37);
    for (let i = 0; i < 3; i++) L.b(couch, 0.84, 0.1, 0.72, std(0xb4a48a, 0.95), -0.86 + i * 0.86, 0.4, 0.08);
    L.put(couch);
    const chaise = L.group(14.2, 12.4, Math.PI);
    L.b(chaise, 0.95, 0.4, 1.3, beige, 0, 0, 0);
    L.b(chaise, 0.95, 0.1, 1.2, std(0xb4a48a, 0.95), 0, 0.4, 0);
    L.put(chaise);
    // floating wall shelf with books
    const wshelf = L.group(16.2, 13.75, Math.PI);
    L.b(wshelf, 1.6, 0.04, 0.25, M.darkWood, 0, 1.75, 0);
    for (let i = 0; i < 9; i++) L.b(wshelf, 0.06, rand(0.18, 0.26), 0.18, std(pick([0x7a2020, 0x203a5a, 0xcccccc, 0x5a4a20]), 0.9), -0.6 + i * 0.08, 1.79, 0);
    L.put(wshelf, false);
    L.model('CoffeeTable_01', 16.5, 12.0, 0);
    L.bookObj(16.3, 0.52, 12.0, 0x203050);
    L.cup(16.8, 0.52, 11.9, 0xb0a080);
    const tv = L.group(15.5, 6.3);
    L.b(tv, 1.4, 0.5, 0.4, M.darkWood, 0, 0, 0);
    L.b(tv, 0.9, 0.6, 0.35, std(0x1a1a1a, 0.5), 0, 0.5, 0);
    L.put(tv);
    const tvScreen = canvasTex(64, 48);
    tvScreen.ctx.fillStyle = '#050505';
    tvScreen.ctx.fillRect(0, 0, 64, 48);
    L.tv = { canvas: tvScreen, on: false, pos: new THREE.Vector3(15.5, 0.8, 6.5), mat: new THREE.MeshBasicMaterial({ map: tvScreen.tex, color: 0x111111 }) };
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.48), L.tv.mat);
    scr.position.set(15.5, 0.8, 6.48);
    L.add(scr);
    L.model('ArmChair_01', 20.6, 11, -Math.PI / 2);
    L.model('wooden_bookshelf_worn', 21.62, 9, -Math.PI / 2);
    const lamp = L.group(13, 13.5);
    L.b(lamp, 0.3, 0.03, 0.3, M.brass, 0, 0, 0);
    L.b(lamp, 0.03, 1.5, 0.03, M.brass, 0, 0.03, 0);
    lamp.add(mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.25, 16, 1, true), std(0xcab890, 0.9, { side: THREE.DoubleSide }), 0, 1.55, 0));
    L.put(lamp);
    L.persianRug(16.5, 11, 3.6, 2.6);

    // ---- Hallway
    L.model('side_table_01', 11.7, 6.5, -Math.PI / 2);
    L.throwable(mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.26, 12), std(0x7a3a3a, 0.25)), 11.7, 0.55, 6.5, 0.13);
    const rack = L.group(8.35, 13.4);
    L.b(rack, 0.04, 1.8, 0.04, M.darkWood, 0, 0, 0);
    L.b(rack, 0.35, 0.03, 0.35, M.darkWood, 0, 0, 0);
    L.b(rack, 0.3, 0.8, 0.12, std(0x2a2420, 1), 0.08, 0.9, 0);
    L.put(rack);
    L.model('vintage_grandfather_clock_01', 8.3, 0.6, Math.PI / 2);
    L.clockPos = new THREE.Vector3(8.4, 1.6, 0.6);
    L.painting(8 + WALL_T / 2 + 0.02, 1.6, 4.2, Math.PI / 2, 14);
    L.painting(12 - WALL_T / 2 - 0.02, 1.6, 8.2, -Math.PI / 2, 15);
    L.painting(17.5, 1.6, 13.94, Math.PI, 16);
    L.rug(10, 7, 1.4, 11, 0x4a1a1a);
  },
  exterior(L) {
    const M = L.mat;
    // suburban street: asphalt road, sodium streetlights, neighbouring houses with a few lit windows
    const road = mesh(planeGeo(80, 7), new THREE.MeshStandardMaterial({ map: TX.dirt(55), color: 0x3a3c40, roughness: 0.6 }), 11, 0.004, 28.5);
    road.castShadow = false;
    L.add(road);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0x8a8060 });
    for (let x = -26; x < 50; x += 4) L.add(mesh(planeGeo(1.8, 0.12), lineMat, x, 0.006, 28.5));
    for (const lx of [0, 18, 34]) {
      L.model('street_lamp_01', lx, 25.3, Math.PI);
      const sodium = new THREE.PointLight(0xff9a40, 6, 10, 2);
      sodium.position.set(lx, 3.6, 25.8);
      L.add(sodium);
    }
    const sidingN = std(0x5a5e66, 0.9), roofN = std(0x1c1c1e, 0.9);
    for (const [hx, w, d, lit] of [[-6, 9, 8, [1]], [8, 10, 8, []], [24, 9, 8, [0, 2]], [38, 8, 7, [1]]]) {
      const hz = 37;
      L.add(mesh(boxGeo(w, 3, d), sidingN, hx, 1.5, hz));
      const r = mesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1), roofN, hx, 4.2, hz);
      r.geometry.rotateY(Math.PI / 4);
      r.scale.set(w + 0.6, 2.4, d + 0.6);
      L.add(r);
      for (let i = 0; i < 3; i++) {
        const glow = lit.includes(i);
        const win = mesh(planeGeo(1, 1.1), new THREE.MeshStandardMaterial({ color: 0x05070a, emissive: glow ? 0xffb860 : 0x0a0e16, emissiveIntensity: glow ? 1.4 : 1 }), hx - w / 3 + (i * w) / 3, 1.7, hz - d / 2 - 0.01);
        win.geometry.rotateX(-Math.PI / 2);
        L.add(win);
      }
    }
    const path = mesh(planeGeo(1.6, 2.6), new THREE.MeshStandardMaterial({ map: TX.dirt(10), roughness: 1 }), 10.5, 0.005, 16.1);
    const path2 = mesh(planeGeo(4.6, 1.4), path.material, 8.8, 0.005, 17.1);
    path2.castShadow = false;
    L.add(path2);
    path.castShadow = false;
    L.add(path);
    const drive = mesh(planeGeo(4.5, 10), new THREE.MeshStandardMaterial({ map: TX.dirt(40), roughness: 1 }), 6, 0.006, 20.5);
    drive.castShadow = false;
    L.add(drive);

    // porch step + light
    L.add(mesh(new THREE.BoxGeometry(2, 0.12, 1), std(0x55524c, 0.9), 10.5, 0.06, 14.6));
    const porch = new THREE.SpotLight(0xffc880, 6, 9, 0.9, 0.7, 1.5);
    porch.position.set(10.5, 2.5, 14.25);
    porch.target.position.set(10.5, 0, 17);
    L.add(porch);
    L.add(porch.target);
    L.add(mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshStandardMaterial({ emissive: 0xffc880, emissiveIntensity: 2, color: 0x222222 }), 10.5, 2.5, 14.12));
    L.model('street_lamp_01', 12.3, 16.9, -Math.PI / 2);

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
      for (const y of [0.3, 0.8]) L.add(mesh(new THREE.BoxGeometry(b - a, 0.06, 0.03), white, (a + b) / 2, y, fz - 0.03));
      L.colliders.push({ minX: a, maxX: b, minZ: fz - 0.08, maxZ: fz + 0.08 });
    }
    inst.count = i;
    inst.castShadow = true;
    L.add(inst);
    // little path lights along the walk from the porch to the van
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd8a0, emissiveIntensity: 3 });
    for (const [lx, lz] of [[9.5, 15.0], [11.5, 15.0], [9.5, 16.3], [11.5, 16.9], [8.2, 16.3], [8.2, 18.1], [7.6, 16.3]]) {
      L.add(mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.4, 8), L.mat.black, lx, 0.2, lz));
      L.add(mesh(new THREE.SphereGeometry(0.045, 10, 8), lampMat, lx, 0.43, lz));
    }


  },
};
