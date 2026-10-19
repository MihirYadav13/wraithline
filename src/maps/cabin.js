// Map: Pine Hollow Cabin — a log cabin deep in a forest (14 x 10 m). Log walls, plank ceilings,
// warm wall sconces, iron bed frames and a wood stove.
import * as THREE from 'three';
import { boxGeo, planeGeo, mesh, std, rand, pick } from '../util.js';
import * as TX from '../textures.js';
import { WALL_T } from '../level.js';

const rooms = [
  { name: 'Living Room', rect: [0, 4, 8, 10], floor: 'oldwood', wall: 'logs', sw: { x: 3.7, z: 10, n: [0, -1] }, sconce: [0, 7.2, [1, 0]] },
  { name: 'Kitchen', rect: [0, 0, 5, 4], floor: 'oldwood', wall: 'logs', sw: { x: 3.3, z: 4, n: [0, -1] }, sconce: [2.6, 0, [0, 1]] },
  { name: 'Bathroom', rect: [5, 0, 8, 4], floor: 'tile', wall: 'planks', sw: { x: 8, z: 1.7, n: [-1, 0] } },
  { name: 'Hallway', rect: [8, 0, 10, 10], floor: 'oldwood', wall: 'logs', sw: { x: 8, z: 6.7, n: [1, 0] }, lamps: [[9, 2.5], [9, 7.5]] },
  { name: 'Bedroom', rect: [10, 0, 14, 5], floor: 'oldwood', wall: 'logs', sw: { x: 10, z: 1.7, n: [1, 0] }, sconce: [14, 3.0, [-1, 0]] },
  { name: 'Bunk Room', rect: [10, 5, 14, 10], floor: 'oldwood', wall: 'logs', sw: { x: 10, z: 6.7, n: [1, 0] }, sconce: [14, 7.5, [-1, 0]] },
];

const doors = [
  { o: 'v', x: 8, z: 2, swing: [-1, 0] },
  { o: 'v', x: 8, z: 7, swing: [-1, 0] },
  { o: 'v', x: 10, z: 2, swing: [1, 0] },
  { o: 'v', x: 10, z: 7, swing: [1, 0] },
  { o: 'h', x: 4, z: 10, swing: [0, -1], front: true },
];
const openings = [
  { o: 'h', x: 1, z: 4 },
  { o: 'h', x: 2, z: 4 },
];

function checkerCloth() {
  const t = TX.tiles('#e8e8e0', '#e8e8e0', 8, 77, 0.4, '#3a5a9a');
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
}

export default {
  id: 'cabin',
  name: 'Pine Hollow Cabin',
  blurb: 'Log cabin in the woods. Six cramped rooms, wall sconces, dense fog and rain.',
  GW: 14,
  GH: 10,
  wallH: 2.5,
  rooms,
  doors,
  openings,
  windows: [
    [1.6, 10, [0, -1]], [6.4, 10, [0, -1]], [0, 5.2, [1, 0]], [0, 2, [1, 0]], [6.5, 0, [0, 1], 0.6],
    [12, 0, [0, 1]], [12, 10, [0, -1]], [9, 0, [0, 1], 0.6],
  ],
  van: { x0: 3.3, z0: 13.6 },
  ground: 'forest',
  roof: 'gable',
  ceiling: 'weathered_planks',
  ceilColor: 0x7a6a5a,
  siding: 'wood_plank_wall',
  sidingColor: 0x8a7a6a,
  trimColor: 0x3a2a1e,
  porch: 1.9,
  env: { weather: 'none', sky: 0x04080a, fog: 0x07100e, fogDensity: 0.07, ambient: 0x18241e, moon: 0xa8b8d8, moonI: 0.85, crickets: 1.8, wind: 0.8, owls: true, stars: true },
  furnish(L) {
    const M = L.mat;
    const iron = std(0x1a1a1a, 0.6, { metalness: 0.5 });
    const mattress = new THREE.MeshStandardMaterial({ map: TX.mattress(), roughness: 1 });

    // ---- Living room: wood stove, sofa, armchair, rocking chair, bookshelf, axe on the wall
    const stove = L.group(0.55, 4.6);
    L.b(stove, 0.6, 0.65, 0.5, iron, 0, 0.12, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) L.b(stove, 0.05, 0.12, 0.05, iron, sx * 0.25, 0, sz * 0.2);
    stove.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, L.H - 0.77, 12), iron, 0, 0.77 + (L.H - 0.77) / 2, -0.05));
    L.stoveGlow = new THREE.MeshStandardMaterial({ color: 0x220800, emissive: 0xff5a10, emissiveIntensity: 1.6 });
    stove.add(mesh(new THREE.PlaneGeometry(0.3, 0.18), L.stoveGlow, 0, 0.42, 0.252));
    L.put(stove);
    L.stoveLight = new THREE.PointLight(0xff7a30, 2.2, 4.5, 2);
    L.stoveLight.position.set(0.55, 0.5, 5.1);
    L.add(L.stoveLight);
    L.model('wooden_crate_01', 1.6, 4.35, 0);
    L.model('Sofa_01', 3.6, 9.1, Math.PI);
    L.model('ArmChair_01', 6.0, 8.6, Math.PI + 0.5);
    L.model('Rockingchair_01', 1.5, 6.2, Math.PI / 2 + 0.4);
    L.model('CoffeeTable_01', 3.6, 7.6, 0);
    L.model('Lantern_01', 3.3, 7.6, 0, { y: 0.52, collide: false });
    L.bookObj(3.9, 0.52, 7.5, 0x5a2a1a);
    L.cup(4.1, 0.52, 7.8, 0x6a5a4a);
    L.model('wooden_bookshelf_worn', 7.62, 5.1, -Math.PI / 2);
    L.persianRug(3.6, 7.6, 3.4, 2.4);
    // axe hung on the west wall
    const axe = L.group(WALL_T / 2 + 0.05, 8.6, Math.PI / 2);
    const handle = mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.8, 8), M.lightWood, 0, 1.5, 0);
    handle.rotation.z = Math.PI / 2;
    axe.add(handle);
    axe.add(mesh(new THREE.BoxGeometry(0.06, 0.16, 0.02), std(0x707070, 0.35, { metalness: 0.9 }), 0.38, 1.47, 0));
    L.put(axe, false);

    // ---- Kitchen: counter with sink, table under a checkered cloth
    const counter = L.group(2.0, 0.36);
    L.b(counter, 3.0, 0.88, 0.6, M.darkWood, 0, 0, 0);
    L.b(counter, 3.04, 0.05, 0.64, std(0x4a3a2a, 0.5), 0, 0.88, 0);
    L.b(counter, 0.5, 0.02, 0.4, std(0x8a8a8a, 0.3, { metalness: 0.8 }), -0.6, 0.92, 0);
    for (let i = 0; i < 5; i++) L.b(counter, 0.01, 0.8, 0.01, M.black, -1.2 + i * 0.6, 0.04, 0.305);
    L.put(counter);
    L.table(2.5, 2.4, 1.2, 0.8, 0.76, M.darkWood);
    L.add(mesh(boxGeo(1.32, 0.18, 0.92), checkerCloth(), 2.5, 0.68, 2.4));
    L.model('dining_chair_02', 1.9, 2.4, Math.PI / 2, { pad: -0.05 });
    L.model('dining_chair_02', 3.1, 2.4, -Math.PI / 2, { pad: -0.05 });
    L.cup(2.3, 0.77, 2.3, 0xc8c0b0);
    L.throwable(mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.02, 16), std(0xe0e0d8, 0.3)), 2.7, 0.77, 2.5, 0.01, 0.12);
    L.throwable(mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.24, 10), std(0x3a5a2a, 0.15, { transparent: true, opacity: 0.85 })), 1.2, 0.93, 0.35, 0.12);
    L.model('drawer_cabinet', 4.72, 2.6, -Math.PI / 2);

    // ---- Bathroom
    const tub = L.group(5.47, 1.05);
    L.b(tub, 0.78, 0.55, 1.7, M.ceramic, 0, 0, 0);
    L.b(tub, 0.6, 0.02, 1.5, std(0x3a3226, 0.1), 0, 0.5, 0);
    L.put(tub);
    const toilet = L.group(7.0, 0.35);
    L.b(toilet, 0.38, 0.4, 0.5, M.ceramic, 0, 0, 0.1);
    L.b(toilet, 0.44, 0.38, 0.18, M.ceramic, 0, 0.4, -0.15);
    L.put(toilet);
    const sink = L.group(6.4, 3.75, Math.PI);
    L.b(sink, 0.6, 0.8, 0.4, M.darkWood, 0, 0, 0);
    L.b(sink, 0.64, 0.06, 0.44, M.ceramic, 0, 0.8, 0);
    L.put(sink);
    L.add(mesh(new THREE.PlaneGeometry(0.5, 0.7), M.mirror, 6.4, 1.5, 4 - WALL_T / 2 - 0.006)).rotation.y = Math.PI;

    // ---- Hallway: grandfather clock, side table with an oil lamp, a picture, an empty wheelchair
    L.model('vintage_grandfather_clock_01', 8.3, 4.6, Math.PI / 2);
    L.clockPos = new THREE.Vector3(8.4, 1.6, 4.6);
    L.model('side_table_01', 9.72, 4.6, -Math.PI / 2);
    L.model('vintage_oil_lamp', 9.72, 4.6, 0, { y: 0.55, collide: false });
    L.model('hanging_picture_frame_01', 10 - WALL_T / 2 - 0.02, 5.6, -Math.PI / 2, { y: 1.6, collide: false });
    L.model('wheelchair_01', 9.05, 9.2, Math.PI);

    // ---- Bedroom: iron bed with a chest at its foot, bedside table, small desk
    L.model('old_bed_frame', 13.45, 1.08, 0);
    L.add(mesh(boxGeo(0.86, 0.14, 1.9), mattress, 13.45, 0.47, 1.1));
    L.model('treasure_chest', 13.45, 2.5, 0);
    L.model('side_table_01', 12.55, 0.35, 0);
    L.model('Lantern_01', 12.55, 0.35, 0, { y: 0.55, collide: false });
    L.table(11.6, 4.62, 1.2, 0.55, 0.76, M.darkWood);
    L.model('dining_chair_02', 11.6, 4.0, Math.PI, { pad: -0.05 });
    L.bookObj(11.3, 0.76, 4.6, 0x2a1a10);
    L.throwable(mesh(new THREE.BoxGeometry(0.12, 0.08, 0.06), std(0x1a1a1a, 0.4)), 11.9, 0.76, 4.65, 0.04);

    // ---- Bunk room: two iron beds, crates, a barrel, a teddy bear
    for (const bx of [11.0, 13.2]) {
      L.model('old_bed_frame', bx, 8.95, Math.PI);
      L.add(mesh(boxGeo(0.86, 0.14, 1.9), mattress, bx, 0.47, 8.95));
    }
    L.model('wooden_crate_01', 12.1, 5.3, 0);
    L.model('barrel_stove', 13.55, 5.45, 0);
    const teddy = new THREE.Group();
    teddy.add(mesh(new THREE.SphereGeometry(0.1, 12, 10), std(0x7a5030, 1), 0, 0, 0));
    teddy.add(mesh(new THREE.SphereGeometry(0.07, 12, 10), std(0x7a5030, 1), 0, 0.14, 0));
    L.throwable(teddy, 11.0, 0.55, 9.6, 0.1);
    L.cup(12.1, 0.35, 5.3, 0x8a7a6a);
  },

  exterior(L) {
    const plank = L.wallMats.planks;
    // front porch deck, posts and steps
    L.add(mesh(boxGeo(5.2, 0.2, 1.6), plank, 3.5, 0.1, 10.85));
    L.colliders.push({ minX: 0.9, maxX: 1.05, minZ: 11.55, maxZ: 11.7 }, { minX: 5.95, maxX: 6.1, minZ: 11.55, maxZ: 11.7 });
    for (const px of [0.98, 6.02]) L.add(mesh(boxGeo(0.12, L.H, 0.12), plank, px, L.H / 2, 11.62));
    L.add(mesh(boxGeo(5.4, 0.12, 1.8), plank, 3.5, L.H + 0.06, 10.9));
    L.add(mesh(boxGeo(1.4, 0.1, 0.5), plank, 4.5, 0.05, 11.9));
    // porch lantern
    const lamp = L.model('Lantern_01', 4.5, 10.35, 0, { y: 1.95, collide: false });
    lamp.scale.setScalar(1.4);
    L.add(mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshStandardMaterial({ emissive: 0xffb050, emissiveIntensity: 3, color: 0x222222 }), 4.5, 2.1, 10.35));
    const porch = new THREE.SpotLight(0xffb060, 7, 9, 1.0, 0.8, 1.5);
    porch.position.set(4.5, 2.3, 10.4);
    porch.target.position.set(4.5, 0, 13);
    L.add(porch);
    L.add(porch.target);
    // dirt track up to the van
    const dirt = new THREE.MeshStandardMaterial({ map: TX.dirt(40), roughness: 1 });
    const track = mesh(planeGeo(3, 9), dirt, 4.5, 0.008, 16.5);
    track.castShadow = false;
    L.add(track);
    // woodpile beside the cabin
    const logMat = std(0x4a3626, 1);
    for (let i = 0; i < 14; i++) {
      const lg = mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 8), logMat, 14.7, 0.1 + Math.floor(i / 5) * 0.17, 1 + (i % 5) * 0.19 + (Math.floor(i / 5) % 2) * 0.09);
      lg.rotation.z = Math.PI / 2;
      L.add(lg);
    }
    L.colliders.push({ minX: 14.1, maxX: 15.3, minZ: 0.85, maxZ: 2.05 });
    // smouldering fire pit with log seats
    const pit = new THREE.Group();
    pit.position.set(9.8, 0, 13.5);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      pit.add(mesh(new THREE.DodecahedronGeometry(0.16, 0), std(0x55524c, 1), Math.cos(a) * 0.55, 0.08, Math.sin(a) * 0.55));
    }
    L.emberMat = new THREE.MeshStandardMaterial({ color: 0x220800, emissive: 0xff4a10, emissiveIntensity: 1.2 });
    pit.add(mesh(new THREE.CylinderGeometry(0.4, 0.45, 0.06, 14), L.emberMat, 0, 0.03, 0));
    L.add(pit);
    L.colliders.push({ minX: 9.15, maxX: 10.45, minZ: 12.85, maxZ: 14.15 });
    for (const [sx, sz, r] of [[8.4, 13.2, 0.3], [10.6, 14.9, -0.8]]) {
      const seat = mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.2, 10), logMat, sx, 0.2, sz);
      seat.rotation.set(0, r, Math.PI / 2);
      L.add(seat);
    }
    L.fireLight = new THREE.PointLight(0xff6a20, 3, 7, 2);
    L.fireLight.position.set(9.8, 0.5, 13.5);
    L.add(L.fireLight);
  },
};
