// The ghost: an original procedurally-modelled apparition plus its AI (wandering, interactions,
// apparitions and hunts).
import * as THREE from 'three';
import { rand, pick, mesh } from './util.js';
import { GHOST_TYPES, FIRST_NAMES, LAST_NAMES } from './ghostTypes.js';
import * as TX from './textures.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Merge a group's direct mesh children by material (keeps animated sub-groups intact).
function mergeChildren(group) {
  const byMat = new Map();
  for (const c of [...group.children]) {
    if (!c.isMesh) continue;
    c.updateMatrix();
    const geo = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
    for (const k of Object.keys(geo.attributes)) if (!["position", "normal", "uv"].includes(k)) geo.deleteAttribute(k);
    geo.applyMatrix4(c.matrix);
    if (!byMat.has(c.material)) byMat.set(c.material, []);
    byMat.get(c.material).push(geo);
    group.remove(c);
  }
  for (const [mat, geos] of byMat) {
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.castShadow = true;
    group.add(m);
  }
}

function clothTexture(base) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = base;
  x.fillRect(0, 0, 256, 256);
  // vertical folds
  for (let i = 0; i < 40; i++) {
    const px = Math.random() * 256;
    const g = x.createLinearGradient(px - 8, 0, px + 8, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, `rgba(0,0,0,${0.08 + Math.random() * 0.15})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(px - 8, 0, 16, 256);
  }
  // stains, darker toward the hem (top of the canvas maps to the hem)
  for (let i = 0; i < 60; i++) {
    const px = Math.random() * 256, py = Math.pow(Math.random(), 2) * 256, r = 4 + Math.random() * 24;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, `rgba(40,30,20,${0.15 + Math.random() * 0.25})`);
    g.addColorStop(1, 'rgba(40,30,20,0)');
    x.fillStyle = g;
    x.fillRect(px - r, py - r, r * 2, r * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function buildGhostModel(variant = Math.floor(Math.random() * 3)) {
  const g = new THREE.Group();
  const skinTone = [0x8e938f, 0x878d92, 0x969089][variant];
  const skin = new THREE.MeshStandardMaterial({ color: skinTone, roughness: 0.75, emissive: 0x0e1218, emissiveIntensity: 1 });
  const cloth = new THREE.MeshStandardMaterial({ map: clothTexture(['#b9b4a6', '#8e8a80', '#a7a294'][variant]), roughness: 1, emissive: 0x08090b, side: THREE.DoubleSide });
  const dark = new THREE.MeshBasicMaterial({ color: 0x050303 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xcfd6d2, roughness: 0.2, emissive: 0x30383a });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.9, side: THREE.DoubleSide });

  // ---- dress: lathe with a fitted torso and a ragged, flaring hem
  const prof = [[0.27, 0], [0.24, 0.25], [0.2, 0.55], [0.17, 0.85], [0.135, 1.0], [0.15, 1.15], [0.17, 1.27], [0.18, 1.35], [0.12, 1.42], [0.055, 1.46]];
  const robeGeo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 40);
  const pos = robeGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const a = Math.atan2(z, x);
    let s = 1 + Math.sin(a * 9 + y * 3) * 0.03 * (1 - y / 1.5); // folds
    // flatten front/back a little so the body reads as a person, not a cone
    pos.setX(i, x * s);
    pos.setZ(i, z * s * (y > 0.9 ? 0.72 : 0.9));
    if (y < 0.01) pos.setY(i, Math.random() * 0.22 * (0.5 + Math.abs(Math.sin(a * 5))));
  }
  robeGeo.computeVertexNormals();
  g.add(mesh(robeGeo, cloth));

  // ---- neck and head (sphere sculpted into a gaunt face)
  g.add(mesh(new THREE.CylinderGeometry(0.042, 0.052, 0.16, 12), skin, 0, 1.49, 0));
  const head = new THREE.Group();
  head.position.set(0, 1.64, 0.015);
  g.add(head);
  const hg = new THREE.SphereGeometry(0.1, 40, 30);
  const hp = hg.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    let x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i);
    y *= 1.28;
    if (y < 0) {
      const t = -y / 0.128;
      x *= 1 - 0.32 * t; // narrow jaw
      z *= 1 - 0.12 * t;
    }
    if (z > 0.04 && Math.abs(x) > 0.035 && y < 0.0 && y > -0.07) z -= 0.012; // hollow cheeks
    if (z > 0) z *= 0.92;
    hp.setXYZ(i, x, y, z);
  }
  hg.computeVertexNormals();
  head.add(mesh(hg, skin));
  for (const s of [-1, 1]) {
    const socket = mesh(new THREE.SphereGeometry(0.024, 16, 12), dark, s * 0.036, 0.022, 0.07);
    socket.scale.set(1.15, 0.85, 0.6);
    head.add(socket);
    const eye = mesh(new THREE.SphereGeometry(0.011, 12, 10), eyeMat, s * 0.036, 0.02, 0.079);
    head.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0035, 8, 6), dark);
    pupil.position.set(s * 0.036, 0.02, 0.0895);
    head.add(pupil);
    const brow = mesh(new THREE.BoxGeometry(0.035, 0.008, 0.012), skin, s * 0.036, 0.045, 0.078);
    brow.rotation.z = s * -0.25;
    head.add(brow);
  }
  const nose = mesh(new THREE.ConeGeometry(0.012, 0.04, 8), skin, 0, -0.002, 0.09);
  nose.rotation.x = Math.PI / 2 + 0.3;
  head.add(nose);
  const mouth = mesh(new THREE.SphereGeometry(0.02, 14, 10), dark, 0, -0.06, 0.07);
  mouth.scale.set(1.1, 0.9, 0.45);
  head.add(mouth);
  head.userData.mouth = mouth;

  // ---- long wet hair: a cap plus strands framing the face and falling down the back
  const cap = mesh(new THREE.SphereGeometry(0.108, 28, 18, 0, Math.PI * 2, 0, 1.9), hairMat);
  cap.scale.set(1.0, 1.3, 1.02);
  cap.rotation.x = -0.45;
  cap.position.set(0, 0.008, -0.006);
  head.add(cap);
  const hairLen = variant === 1 ? 0.35 : 0.7;
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2;
    const front = Math.cos(a) > 0.55; // strands that would cover the face centre are parted
    if (front && Math.abs(Math.sin(a)) < 0.45) continue;
    const len = hairLen * rand(0.75, 1.15) * (Math.cos(a) > 0 ? 0.85 : 1);
    const w = rand(0.025, 0.05);
    const sg = new THREE.PlaneGeometry(w, len, 1, 6);
    const sp = sg.attributes.position;
    for (let k = 0; k < sp.count; k++) {
      const t = (len / 2 - sp.getY(k)) / len; // 0 at root, 1 at tip
      sp.setZ(k, sp.getZ(k) + Math.sin(t * 3 + i) * 0.012 + t * t * 0.03);
    }
    sg.translate(0, -len / 2, 0);
    const strand = mesh(sg, hairMat);
    const rx = Math.sin(a) * 0.103, rz = Math.cos(a) * 0.098;
    strand.position.set(rx, 0.06, rz);
    strand.rotation.y = a;
    strand.rotation.x = Math.cos(a) > 0 ? -0.08 : 0.12;
    head.add(strand);
  }

  // ---- arms with elbows and long fingers
  const arms = [];
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.19, 1.36, 0);
    g.add(shoulder);
    shoulder.add(mesh(new THREE.SphereGeometry(0.05, 12, 10), cloth, 0, 0, 0));
    shoulder.add(mesh(new THREE.CylinderGeometry(0.042, 0.034, 0.32, 12), cloth, 0, -0.16, 0));
    const elbow = new THREE.Group();
    elbow.position.y = -0.32;
    shoulder.add(elbow);
    elbow.add(mesh(new THREE.CylinderGeometry(0.03, 0.022, 0.3, 10), skin, 0, -0.15, 0));
    const hand = mesh(new THREE.BoxGeometry(0.05, 0.075, 0.02), skin, 0, -0.34, 0);
    elbow.add(hand);
    for (let f = 0; f < 4; f++) {
      const finger = mesh(new THREE.CylinderGeometry(0.0055, 0.0035, 0.1, 6), skin, -0.018 + f * 0.012, -0.42, 0.004);
      finger.rotation.x = 0.15;
      elbow.add(finger);
    }
    const thumb = mesh(new THREE.CylinderGeometry(0.006, 0.004, 0.06, 6), skin, s * -0.03, -0.36, 0.01);
    thumb.rotation.z = s * 0.5;
    elbow.add(thumb);
    shoulder.rotation.z = s * 0.08;
    elbow.rotation.x = -0.15;
    shoulder.userData.elbow = elbow;
    arms.push(shoulder);
  }
  mergeChildren(head);
  for (const a of arms) {
    mergeChildren(a);
    mergeChildren(a.userData.elbow);
  }
  mergeChildren(g);
  const scale = [1.02, 0.84, 1.1][variant];
  g.scale.setScalar(scale);
  g.userData = { arms, head, scale };
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return g;
}

export class Ghost {
  constructor(game) {
    this.game = game;
    const L = game.level;
    this.type = pick(GHOST_TYPES);
    this.name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    this.age = Math.floor(rand(8, 90));
    this.respondsTo = Math.random() < 0.5 ? 'everyone' : 'people who are alone';
    // haunt any room except a hallway
    this.favRoom = pick(L.rooms.filter((r) => !/hallway/i.test(r.name))).id;
    this.pos = L.randomPointInRoom(this.favRoom);
    this.model = buildGhostModel();
    this.model.visible = false;
    game.scene.add(this.model);
    this.path = [];
    this.wanderT = 0;
    this.actT = rand(8, 14);
    this.huntCheckT = 5;
    this.huntCooldown = 0;
    this.incenseBlock = 0;
    this.blind = 0;
    this.hunting = false;
    this.huntPhase = null;
    this.eventT = 0;
    this.activityLog = [];
    this.activityLevel = 0;
    this.hasEv = (e) => this.type.ev.includes(e);
    this.facing = 0;
    // ghost orbs only exist (and only show on the video camera) if it has that evidence
    this.orbs = [];
    if (this.hasEv('ORBS')) {
      const mat = new THREE.SpriteMaterial({ map: TX.orbSprite(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      for (let i = 0; i < 3; i++) {
        const s = new THREE.Sprite(mat);
        s.scale.setScalar(0.08);
        s.layers.set(1);
        const p = L.randomPointInRoom(this.favRoom, 0.8);
        s.userData = { base: p.setY(rand(0.6, 2.0)), ph: rand(0, 10) };
        s.position.copy(p);
        game.scene.add(s);
        this.orbs.push(s);
      }
    }
  }

  get room() {
    return this.game.level.roomAt(this.pos.x, this.pos.z);
  }

  headPos(out = new THREE.Vector3()) {
    return out.set(this.pos.x, 1.55 * this.model.userData.scale, this.pos.z);
  }

  logActivity(amount = 1) {
    this.activityLevel = Math.min(10, this.activityLevel + amount * 2);
  }

  canSeePlayer() {
    const p = this.game.player;
    if (!p.alive) return false;
    const from = this.headPos();
    const to = p.camera.position.clone();
    const dist = from.distanceTo(to);
    if (dist > 22) return false;
    const ray = new THREE.Raycaster(from, to.clone().sub(from).normalize(), 0, dist);
    return ray.intersectObjects(this.game.level.getOccluders(), false).length === 0;
  }

  moveAlong(dt, speed) {
    if (!this.path.length) return true;
    const t = this.path[0];
    const dx = t.x - this.pos.x, dz = t.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    const step = speed * dt;
    if (d <= step) {
      this.pos.x = t.x;
      this.pos.z = t.z;
      this.path.shift();
    } else {
      this.pos.x += (dx / d) * step;
      this.pos.z += (dz / d) * step;
      this.facing = Math.atan2(dx, dz);
    }
    return !this.path.length;
  }

  goTo(p) {
    this.path = this.game.level.findPath(this.pos.x, this.pos.z, p.x, p.z);
  }

  update(dt) {
    const g = this.game;
    this.activityLevel = Math.max(0, this.activityLevel - dt * 0.15);
    if (this.huntCooldown > 0) this.huntCooldown -= dt;
    if (this.incenseBlock > 0) this.incenseBlock -= dt;
    if (this.blind > 0) this.blind -= dt;

    for (const o of this.orbs) {
      const u = o.userData;
      u.ph += dt * 0.3;
      o.position.set(u.base.x + Math.sin(u.ph) * 0.6, u.base.y + Math.sin(u.ph * 1.7) * 0.25, u.base.z + Math.cos(u.ph * 0.8) * 0.6);
    }

    if (this.hunting) {
      this.updateHunt(dt);
    } else {
      this.updateIdle(dt);
    }
    this.model.position.set(this.pos.x, 0, this.pos.z);
    let rot = this.facing;
    if (this.eventT > 0 || this.huntPhase === 'chase') {
      // face the player and twitch
      const pp = g.player.pos;
      rot = Math.atan2(pp.x - this.pos.x, pp.z - this.pos.z);
      const head = this.model.userData.head;
      if (Math.random() < 0.08) head.rotation.set(rand(-0.3, 0.3), rand(-0.4, 0.4), rand(-0.5, 0.5));
    }
    this.model.rotation.y = rot;
    const armUp = this.huntPhase === 'chase' ? -1.25 : 0;
    for (const a of this.model.userData.arms) a.rotation.x += (armUp - a.rotation.x) * Math.min(1, dt * 5);
  }

  updateIdle(dt) {
    const g = this.game;
    const L = g.level;
    // apparition timer
    if (this.eventT > 0) {
      this.eventT -= dt;
      this.model.visible = Math.random() < 0.92;
      if (this.eventT <= 0) this.model.visible = false;
      return;
    }
    // wander
    this.wanderT -= dt;
    if (this.moveAlong(dt, 0.8) && this.wanderT <= 0) {
      this.wanderT = rand(3, 9);
      const room = Math.random() < 0.8 ? this.favRoom : Math.floor(Math.random() * L.rooms.length);
      this.goTo(L.randomPointInRoom(room));
    }
    // interactions
    const fear = 1 - g.sanity / 100;
    this.actT -= dt * this.type.activity * (0.7 + fear * 0.9) * g.diff.activity;
    if (this.actT <= 0) {
      this.actT = rand(5, 12);
      this.interact();
    }
    // hunts
    this.huntCheckT -= dt;
    if (this.huntCheckT <= 0) {
      this.huntCheckT = 5;
      if (g.setupLeft <= 0 && this.huntCooldown <= 0 && this.incenseBlock <= 0 && g.sanity < this.type.huntThreshold && g.player.inHouse) {
        if (Math.random() < 0.18 + fear * 0.25) this.startHunt();
      }
    }
  }

  interact() {
    const g = this.game;
    const L = g.level;
    const near = (p, r) => this.pos.distanceTo(new THREE.Vector3(p.x, 0, p.z)) < r;
    const options = [];
    const throwables = L.throwables.filter((t) => !t.active && near(t.mesh.position, 4));
    if (throwables.length) options.push(['throw', 3 * this.type.throwMult]);
    const doors = L.doors.filter((d) => !d.locked && near(d.center, 4));
    if (doors.length) options.push(['door', this.type.name === 'Yurei' ? 4 : 2.5]);
    const room = L.rooms[this.room];
    if (room) options.push(['light', this.type.name === 'Mare' ? 4 : 1.5]);
    options.push(['sound', 2.5]);
    const pdist = this.pos.distanceTo(g.player.pos);
    if (pdist < 9 && g.player.inHouse) options.push(['event', this.type.name === 'Oni' ? 3 : 1.2]);
    const book = g.items.list.find((i) => i.type === 'book' && !i.held && !i.written && near(i.mesh.position, 3.5));
    if (book && this.hasEv('WRITING')) options.push(['write', 5]);
    if (L.tv && !L.tv.on && L.roomAt(L.tv.pos.x, L.tv.pos.z) === this.room) options.push(['tv', 0.8]);
    if (this.type.name === 'Banshee') options.push(['wail', 0.8]);

    let total = options.reduce((s, o) => s + o[1], 0);
    let r = Math.random() * total;
    let action = options[0][0];
    for (const [a, w] of options) {
      if ((r -= w) <= 0) {
        action = a;
        break;
      }
    }
    this.logActivity();
    const emfLevel = () => (this.hasEv('EMF') && Math.random() < 0.35 ? 5 : pick([2, 2, 3, 3, 4]));
    switch (action) {
      case 'throw': {
        const t = pick(throwables);
        const a = rand(0, Math.PI * 2);
        const f = rand(2, 4.5) * Math.min(2, this.type.throwMult);
        t.vel.set(Math.cos(a) * f, rand(1.5, 3), Math.sin(a) * f);
        t.spin.set(rand(-8, 8), 0, rand(-8, 8));
        t.active = true;
        g.addEmf(t.mesh.position, emfLevel());
        break;
      }
      case 'door': {
        const d = pick(doors);
        const wasOpen = d.open > 0.5;
        d.target = wasOpen ? (Math.random() < 0.3 ? 0 : rand(0, 0.2)) : rand(0.4, 1);
        if (wasOpen && d.target === 0 && Math.random() < 0.5) d.slam = true;
        g.audio.creak(d.center, { vol: 0.8 });
        g.addEmf(d.center, emfLevel());
        if (this.hasEv('PRINTS')) g.addPrintOnDoor(d, this.pos);
        break;
      }
      case 'light': {
        const rm = L.rooms[this.room];
        if (rm.lightOn) {
          L.setLight(rm, false);
          g.audio.click(rm.switchMesh.position, 0.5);
          if (this.hasEv('PRINTS')) g.addPrintOnSwitch(rm);
        } else if (Math.random() < 0.2) {
          L.setLight(rm, true);
          g.audio.click(rm.switchMesh.position, 0.5);
        } else {
          rm.flicker = 1.5;
          g.audio.buzz(rm.center.clone().setY(2.3), 1.2);
        }
        g.addEmf(rm.switchMesh.position, emfLevel());
        break;
      }
      case 'sound': {
        const p = this.pos.clone().setY(1.2);
        const kind = Math.random();
        if (kind < 0.35) g.audio.knock(p);
        else if (kind < 0.7) g.audio.whisper(p);
        else if (kind < 0.85) g.audio.moan(p, { vol: 0.35 });
        else g.audio.creak(p);
        break;
      }
      case 'event':
        this.startEvent();
        g.addEmf(this.pos, emfLevel());
        break;
      case 'write':
        book.write();
        g.addEmf(book.mesh.position, emfLevel());
        break;
      case 'tv':
        g.tvOn(5);
        g.addEmf(L.tv.pos, emfLevel());
        break;
      case 'wail':
        g.audio.scream(this.pos.clone().setY(1.5), 0.35, 2.2);
        break;
    }
  }

  startEvent() {
    const g = this.game;
    const p = g.player.pos;
    // appear somewhere between 2 and 4 m from the player, inside the house
    let spot = null;
    for (let i = 0; i < 12 && !spot; i++) {
      const a = rand(0, Math.PI * 2), d = rand(2, 4);
      const c = new THREE.Vector3(p.x + Math.cos(a) * d, 0, p.z + Math.sin(a) * d);
      if (g.level.roomAt(c.x, c.z) >= 0 && g.level.roomAt(c.x, c.z) === g.level.roomAt(p.x, p.z)) spot = c;
    }
    if (!spot) spot = this.pos.clone();
    this.pos.copy(spot);
    this.path = [];
    this.eventT = rand(1.8, 3.2);
    this.model.visible = true;
    const hp = this.headPos();
    if (Math.random() < 0.5) g.audio.moan(hp, { vol: 0.7 });
    else g.audio.whisper(hp, 0.8);
    const rm = g.level.rooms[g.level.roomAt(p.x, p.z)];
    if (rm) rm.flicker = this.eventT;
    if (this.canSeePlayer()) g.drainSanity(this.type.eventDrain);
    g.objectives.complete('event');
    this.logActivity(2);
  }

  startHunt() {
    const g = this.game;
    const cross = g.items.list.find(
      (i) => i.type === 'crucifix' && i.uses > 0 && i.worldPos().distanceTo(this.pos.clone().setY(i.worldPos().y)) < this.type.crucifixRange
    );
    if (cross) {
      cross.burn();
      this.huntCooldown = 20;
      return;
    }
    this.hunting = true;
    this.huntPhase = 'grace';
    this.huntT = g.diff.grace;
    this.huntLen = g.diff.huntLen;
    this.lastKnown = null;
    this.repathT = 0;
    this.stepT = 0;
    this.blinkT = 0;
    this.chaseBoost = 0;
    this.eventT = 0;
    g.onHuntStart();
  }

  endHunt() {
    const g = this.game;
    this.hunting = false;
    this.huntPhase = null;
    this.model.visible = false;
    this.voice?.stop();
    this.voice = null;
    this.huntCooldown = this.type.huntCooldown;
    this.path = [];
    g.onHuntEnd();
  }

  updateHunt(dt) {
    const g = this.game;
    const L = g.level;
    if (this.huntPhase === 'grace') {
      this.huntT -= dt;
      if (this.huntT <= 0) {
        this.huntPhase = 'chase';
        this.huntT = this.huntLen;
        this.voice = g.audio.huntVoice(this.headPos());
      }
      return;
    }
    this.huntT -= dt;
    if (this.huntT <= 0 || !g.player.alive) {
      this.endHunt();
      return;
    }
    // blink in and out of visibility
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      const on = Math.random() < this.type.blinkOn;
      this.model.visible = on;
      this.blinkT = on ? rand(0.1, 0.35) : rand(0.08, 0.45);
    }
    const player = g.player;
    const hp = this.headPos();
    this.voice?.update(dt, hp, g.audio.occlusion(hp));
    // footsteps
    this.stepT -= dt;
    if (this.stepT <= 0) {
      this.stepT = 0.48;
      g.audio.footstep(this.pos.clone().setY(0.1), 'wood', this.type.quietSteps ? 0.12 : 1.1);
    }
    // track the player: sight, or active electronics nearby
    this.repathT -= dt;
    const pdist = this.pos.distanceTo(player.pos);
    let sees = false;
    if (this.blind <= 0 && player.inHouse) {
      sees = this.canSeePlayer() || (g.items.electronicsActive() && pdist < 7.5);
    }
    if (sees) {
      this.lastKnown = player.pos.clone();
      this.chaseBoost = Math.min(1, this.chaseBoost + dt * 0.12);
    } else {
      this.chaseBoost = Math.max(0, this.chaseBoost - dt * 0.1);
    }
    if (this.repathT <= 0) {
      this.repathT = 0.35;
      if (this.lastKnown) this.goTo(this.lastKnown);
      else if (!this.path.length) this.goTo(L.randomPointInRoom(Math.floor(Math.random() * L.rooms.length)));
    }
    let speed = this.type.speed;
    if (this.type.name === 'Revenant') speed = sees ? 3.0 : 1.0;
    else if (this.type.name === 'Jinn' && sees && pdist > 5) speed = 2.5;
    else speed *= 1 + this.chaseBoost * 0.65;
    if (this.blind > 0) speed *= 0.6;
    if (this.moveAlong(dt, speed) && this.lastKnown && this.pos.distanceTo(this.lastKnown) < 0.3) this.lastKnown = null;
    if (pdist < 0.85 && player.alive && player.inHouse && this.blind <= 0) {
      g.killPlayer(this);
    }
  }
}
