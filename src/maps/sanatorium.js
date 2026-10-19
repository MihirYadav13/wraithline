// Map: St. Agnes Sanatorium — an abandoned hospital wing (26 x 16 m). A long corridor lit by
// flickering fluorescent tubes, two-tone institutional paint, a patient ward, a nurse station,
// a padded isolation cell and a morgue. Snow outside.
import * as THREE from 'three';
import { boxGeo, planeGeo, mesh, std, canvasTex, pick } from '../util.js';
import * as TX from '../textures.js';
import { WALL_T } from '../level.js';

const rooms = [
  { name: 'Corridor', rect: [0, 7, 26, 9], floor: 'concrete', wall: 'asylum', sw: { x: 11.7, z: 9, n: [0, -1] }, lamps: [[2.5, 8], [8, 8], [13, 8], [18, 8], [23.5, 8]], split: true, tubeAxis: 'x' },
  { name: 'Patient Room A', rect: [0, 0, 5, 7], floor: 'tile', wall: 'asylum', sw: { x: 1.7, z: 7, n: [0, -1] } },
  { name: 'Patient Room B', rect: [5, 0, 10, 7], floor: 'tile', wall: 'asylum', sw: { x: 6.7, z: 7, n: [0, -1] } },
  { name: 'Nurse Station', rect: [10, 0, 15, 7], floor: 'concrete', wall: 'asylum', sw: { x: 13.3, z: 7, n: [0, -1] } },
  { name: 'Ward', rect: [15, 0, 26, 7], floor: 'tile', wall: 'asylum', sw: { x: 19.7, z: 7, n: [0, -1] }, lamps: [[17.8, 3.5], [23.2, 3.5]], split: true },
  { name: 'Treatment Room', rect: [0, 9, 5, 16], floor: 'tile', wall: 'tileWall', sw: { x: 1.7, z: 9, n: [0, 1] } },
  { name: 'Isolation Cell', rect: [5, 9, 10, 16], floor: 'concrete', wall: 'padded', sw: { x: 6.7, z: 9, n: [0, 1] } },
  { name: 'Lobby', rect: [10, 9, 16, 16], floor: 'wood2', wall: 'asylum', sw: { x: 12.7, z: 16, n: [0, -1] } },
  { name: 'Morgue', rect: [16, 9, 21, 16], floor: 'tile', wall: 'tileWall', sw: { x: 17.7, z: 9, n: [0, 1] } },
  { name: 'Office', rect: [21, 9, 26, 16], floor: 'wood', wall: 'paint', sw: { x: 22.7, z: 9, n: [0, 1] } },
];

const doors = [
  { o: 'h', x: 2, z: 7, swing: [0, -1] },
  { o: 'h', x: 7, z: 7, swing: [0, -1] },
  { o: 'h', x: 20, z: 7, swing: [0, -1] },
  { o: 'h', x: 2, z: 9, swing: [0, 1] },
  { o: 'h', x: 7, z: 9, swing: [0, 1] },
  { o: 'h', x: 18, z: 9, swing: [0, 1] },
  { o: 'h', x: 23, z: 9, swing: [0, 1] },
  { o: 'h', x: 13, z: 16, swing: [0, -1], front: true },
];
const openings = [
  { o: 'h', x: 11, z: 7 },
  { o: 'h', x: 12, z: 7 },
  { o: 'h', x: 12, z: 9 },
  { o: 'h', x: 13, z: 9 },
];

export default {
  id: 'sanatorium',
  name: 'St. Agnes Sanatorium',
  blurb: 'Abandoned hospital wing in the snow. Long flickering corridor, ward, morgue and a padded cell.',
  GW: 26,
  GH: 16,
  wallH: 3.0,
  rooms,
  doors,
  openings,
  windows: [
    [2.5, 0, [0, 1]], [7.5, 0, [0, 1]], [12.5, 0, [0, 1]], [17.5, 0, [0, 1]], [21, 0, [0, 1]], [24.5, 0, [0, 1]],
    [2.5, 16, [0, -1]], [7.5, 16, [0, -1], 0.5], [11, 16, [0, -1]], [15.2, 16, [0, -1]], [23.5, 16, [0, -1]],
    [0, 8, [1, 0], 0.7], [26, 8, [-1, 0], 0.7],
  ],
  van: { x0: 12.3, z0: 19.6 },
  ground: 'snow',
  roof: 'flat',
  fixture: 'tube',
  lightColor: 0xdfe8ff,
  windowBars: true,
  ceilColor: 0x9a9a92,
  siding: 'painted_plaster_wall',
  sidingColor: 0x8a8a86,
  trimColor: 0x3a3a38,
  env: { weather: 'snow', sky: 0x0b0e14, fog: 0x10141a, fogDensity: 0.055, ambient: 0x232c3a, moon: 0x9aa6c4, moonI: 0.6, crickets: 0, wind: 1.8 },

  furnish(L) {
    const M = L.mat;
    const steel = std(0x9aa0a6, 0.35, { metalness: 0.85 });
    const sheet = std(0xd8d6ce, 0.95);
    const mattress = new THREE.MeshStandardMaterial({ map: TX.mattress(), roughness: 1 });
    const hospitalBed = (x, z, ry = 0) => {
      L.model('old_bed_frame', x, z, ry);
      L.add(mesh(boxGeo(0.86, 0.14, 1.9), mattress, x, 0.47, z));
    };

    // ---- Ward: two rows of iron beds, a wheelchair, bedside tables
    for (const bx of [16.0, 17.6, 22.4, 24.0, 25.4]) hospitalBed(bx, 1.1);
    for (const bx of [16.8, 23.2]) L.model('side_table_01', bx, 0.3, 0);
    L.model('wheelchair_01', 19.0, 3.8, 0.7);
    L.cup(16.8, 0.55, 0.3, 0xb0b0a8);
    L.bookObj(23.2, 0.55, 0.3, 0x3a2a2a);

    // ---- Patient rooms
    hospitalBed(1.0, 1.1);
    L.model('side_table_01', 2.0, 0.3, 0);
    L.model('vintage_oil_lamp', 2.0, 0.3, 0, { y: 0.55, collide: false });
    L.model('dining_chair_02', 3.6, 1.6, -0.6, { pad: -0.05 });
    L.model('wheelchair_01', 3.6, 4.6, -2.3);
    hospitalBed(6.0, 1.1);
    const tipped = L.model('dining_chair_02', 8.3, 3.5, 0.4, { pad: -0.05 });
    tipped.rotation.z = Math.PI / 2;
    tipped.position.y = 0.22;
    L.model('wooden_crate_01', 8.8, 0.35, 0);
    L.throwable(mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.2, 10), std(0x6a4a2a, 0.15, { transparent: true, opacity: 0.8 })), 2.2, 0.55, 0.45, 0.1);

    // ---- Nurse station: long desk facing the corridor, medicine cabinet, filing
    const desk = L.group(12.5, 5.2);
    L.b(desk, 3.2, 1.05, 0.55, M.darkWood, 0, 0, 0);
    L.b(desk, 3.3, 0.04, 0.65, std(0x4a4842, 0.6), 0, 1.05, 0);
    L.put(desk);
    L.model('dining_chair_02', 11.8, 4.3, Math.PI, { pad: -0.05 });
    L.model('dining_chair_02', 13.2, 4.3, Math.PI, { pad: -0.05 });
    L.model('vintage_cabinet_01', 12.5, 0.42, 0);
    L.model('drawer_cabinet', 14.72, 2.0, -Math.PI / 2);
    L.model('mantel_clock_01', 13.4, 5.2, Math.PI, { y: 1.09, collide: false });
    L.bookObj(11.6, 1.09, 5.2, 0x2a3a5a);
    L.cup(12.2, 1.09, 5.3, 0xd0d0c8);

    // ---- Treatment room: steel operating table, instrument cabinet, wheelchair
    const op = L.group(2.5, 12.6);
    L.b(op, 0.75, 0.06, 2.0, steel, 0, 0.82, 0);
    for (const sz of [-0.8, 0.8]) L.b(op, 0.08, 0.82, 0.08, steel, 0, 0, sz);
    L.b(op, 0.6, 0.04, 0.04, steel, 0, 0.1, 0);
    L.put(op);
    L.add(mesh(boxGeo(0.7, 0.04, 1.6), sheet, 2.5, 0.9, 12.6));
    L.model('vintage_cabinet_01', 0.4, 12.6, Math.PI / 2);
    L.model('wheelchair_01', 4.2, 15.2, Math.PI + 0.4);
    const tray = L.group(3.6, 11.4);
    L.b(tray, 0.5, 0.03, 0.35, steel, 0, 0.9, 0);
    L.b(tray, 0.03, 0.9, 0.03, steel, 0, 0, 0);
    L.put(tray);
    for (let i = 0; i < 3; i++) L.throwable(mesh(new THREE.BoxGeometry(0.14, 0.01, 0.02), steel), 3.45 + i * 0.12, 0.93, 11.4, 0.005, 0.07);

    // ---- Isolation cell: padded walls, a stained mattress on the floor, restraint bed
    L.add(mesh(boxGeo(0.9, 0.14, 1.9), mattress, 6.0, 0.07, 14.6));
    hospitalBed(8.8, 14.9, Math.PI);
    for (const sz of [14.3, 15.3]) L.add(mesh(boxGeo(0.95, 0.02, 0.06), std(0x3a2a1a, 0.8), 8.8, 0.56, sz));

    // ---- Morgue: wall of cold-storage doors and a sheeted body on a steel table
    for (let cx = 0; cx < 3; cx++) {
      for (let cy = 0; cy < 3; cy++) {
        const door = mesh(boxGeo(0.06, 0.6, 0.7), steel, 21 - WALL_T / 2 - 0.03, 0.4 + cy * 0.75, 10.6 + cx * 0.85);
        L.add(door);
        L.add(mesh(boxGeo(0.04, 0.05, 0.18), M.black, 21 - WALL_T / 2 - 0.08, 0.6 + cy * 0.75, 10.6 + cx * 0.85));
      }
    }
    L.colliders.push({ minX: 20.8, maxX: 21, minZ: 10.2, maxZ: 12.8 });
    const slab = L.group(18.4, 12.8);
    L.b(slab, 0.75, 0.05, 2.0, steel, 0, 0.85, 0);
    for (const sz of [-0.85, 0.85]) for (const sx of [-0.3, 0.3]) L.b(slab, 0.05, 0.85, 0.05, steel, sx, 0, sz);
    L.put(slab);
    // the body under the sheet: torso, head and feet shapes with a sheet draped over them
    const shroud = std(0xa8a69e, 1);
    const torso = mesh(new THREE.CapsuleGeometry(0.2, 1.1, 6, 14), shroud, 18.4, 0.98, 12.85);
    torso.rotation.x = Math.PI / 2;
    torso.scale.set(1.1, 1, 0.55);
    L.add(torso);
    const head = mesh(new THREE.SphereGeometry(0.12, 14, 10), shroud, 18.4, 1.0, 12.0);
    head.scale.y = 0.8;
    L.add(head);
    for (const fx of [-0.09, 0.09]) L.add(mesh(new THREE.ConeGeometry(0.06, 0.14, 10), shroud, 18.4 + fx, 1.0, 13.72));
    L.add(mesh(boxGeo(0.8, 0.012, 2.05), shroud, 18.4, 0.885, 12.8));

    // ---- Office: desk, bookshelf, filing, lamp
    L.table(23.6, 14.4, 1.4, 0.7, 0.76, M.darkWood);
    L.model('dining_chair_02', 23.6, 13.6, Math.PI, { pad: -0.05 });
    L.model('vintage_oil_lamp', 23.1, 14.4, 0, { y: 0.76, collide: false });
    L.bookObj(24.0, 0.76, 14.3, 0x5a2a20);
    L.model('wooden_bookshelf_worn', 25.62, 11.6, -Math.PI / 2);
    L.model('drawer_cabinet', 21.4, 12.4, Math.PI / 2);
    L.model('hanging_picture_frame_01', 22.0, 15.94 - WALL_T / 2, Math.PI, { y: 1.7, collide: false });

    // ---- Lobby: reception counter, benches, grandfather clock
    const counter = L.group(11.6, 12.4, Math.PI / 2);
    L.b(counter, 2.2, 1.05, 0.6, M.darkWood, 0, 0, 0);
    L.b(counter, 2.3, 0.04, 0.7, std(0x3a3632, 0.5), 0, 1.05, 0);
    L.put(counter);
    for (const bz of [10.4, 14.6]) {
      const bench = L.group(15.5, bz, -Math.PI / 2);
      L.b(bench, 1.6, 0.06, 0.45, M.lightWood, 0, 0.44, 0);
      for (const sx of [-0.7, 0.7]) L.b(bench, 0.06, 0.44, 0.4, M.black, sx, 0, 0);
      L.b(bench, 1.6, 0.4, 0.05, M.lightWood, 0, 0.5, -0.2);
      L.put(bench);
    }
    L.model('vintage_grandfather_clock_01', 10.35, 15.0, Math.PI / 2);
    L.clockPos = new THREE.Vector3(10.4, 1.6, 15.0);
    L.model('ceramic_vase_01', 11.4, 11.6, 0, { y: 1.09, collide: false });
    L.cup(11.7, 1.09, 13.0, 0xd8d0c0);

    // ---- Corridor: an abandoned wheelchair and a gurney
    L.model('wheelchair_01', 24.6, 8.0, Math.PI / 2);
    const gurney = L.group(5.0, 7.5, Math.PI / 2);
    L.b(gurney, 0.6, 0.05, 1.9, steel, 0, 0.75, 0);
    for (const sx of [-0.25, 0.25]) for (const sz of [-0.85, 0.85]) L.b(gurney, 0.04, 0.75, 0.04, steel, sx, 0, sz);
    L.b(gurney, 0.55, 0.06, 1.8, sheet, 0, 0.8, 0);
    L.put(gurney);
  },

  exterior(L) {
    // asphalt forecourt to the van
    const asphalt = new THREE.MeshStandardMaterial({ map: TX.dirt(91), color: 0x5a5c60, roughness: 0.95 });
    const yard = mesh(planeGeo(6, 7), asphalt, 13.5, 0.006, 19.5);
    yard.castShadow = false;
    L.add(yard);
    // entrance steps and a canopy over the front door
    L.add(mesh(boxGeo(3, 0.15, 1.2), std(0x6a6a66, 0.9), 13.5, 0.075, 16.6));
    L.add(mesh(boxGeo(3.2, 0.12, 1.6), std(0x4a4a48, 0.9), 13.5, L.H - 0.1, 16.8));
    // sign
    const sign = canvasTex(512, 96);
    sign.ctx.fillStyle = '#1c1e20';
    sign.ctx.fillRect(0, 0, 512, 96);
    sign.ctx.fillStyle = '#c8c4b0';
    sign.ctx.font = 'bold 44px Georgia, serif';
    sign.ctx.textAlign = 'center';
    sign.ctx.fillText('ST. AGNES SANATORIUM', 256, 62);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.64), new THREE.MeshStandardMaterial({ map: sign.tex, roughness: 0.8 }));
    s.position.set(13.5, L.H + 0.45, 16.42);
    L.add(s);
    const canopyLight = new THREE.SpotLight(0xdfe8ff, 6, 9, 1.0, 0.8, 1.5);
    canopyLight.position.set(13.5, L.H - 0.25, 16.8);
    canopyLight.target.position.set(13.5, 0, 18.5);
    L.add(canopyLight);
    L.add(canopyLight.target);
    L.add(mesh(boxGeo(0.5, 0.04, 0.12), new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xe6f0ff, emissiveIntensity: 2 }), 13.5, L.H - 0.18, 16.9));
    for (const lx of [9.8, 17.2]) L.model('street_lamp_01', lx, 18.2, lx < 13 ? Math.PI / 2 : -Math.PI / 2);
  },
};
