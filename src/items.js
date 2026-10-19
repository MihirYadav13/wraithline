// Investigation equipment. Every model is built from primitives; screens are live canvases.
import * as THREE from 'three';
import { mesh, std, canvasTex, rand, pick, circleVsBox } from './util.js';
import * as TX from './textures.js';
import { SPIRIT_BOX_LINES } from './ghostTypes.js';

const QUESTIONS = ['Where are you?', 'Can you give us a sign?', 'Are you here with us?', 'How old are you?', 'What do you want?', 'Are you close?'];

class Item {
  constructor(game, type, name) {
    this.game = game;
    this.type = type;
    this.name = name;
    this.on = false;
    this.held = false;
    this.electronic = false;
    this.vel = new THREE.Vector3();
    this.falling = false;
    this.holdPos = new THREE.Vector3(0.22, -0.24, -0.42);
    this.holdRot = new THREE.Euler(-0.35, 0.15, 0);
    // where the fist closes around the item (item-local), the handle axis and its radius
    this.grip = { pos: [0, 0.04, 0], axis: 'y', r: 0.036 };
    this.mesh = this.build();
    // invisible grab zone so thin items (UV light, incense, book) are easy to aim at
    const box = new THREE.Box3().setFromObject(this.mesh);
    const size = box.getSize(new THREE.Vector3()).max(new THREE.Vector3(0.14, 0.14, 0.14));
    const hit = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshBasicMaterial({ visible: false }));
    box.getCenter(hit.position);
    this.mesh.add(hit);
    this.mesh.traverse((o) => {
      o.userData.item = this;
      if (o.isMesh) o.castShadow = true;
    });
  }

  worldPos() {
    if (this.held) return this.game.camera.position.clone().setY(this.game.camera.position.y - 0.3);
    // carried by another investigator in multiplayer: it is wherever they are
    const av = this.holder && this.game.mp?.avatars.get(this.holder);
    if (av) return av.pos.clone().setY(1.2);
    return this.mesh.position.clone();
  }

  hint() {
    return this.electronic ? `[F] ${this.on ? 'Turn off' : 'Turn on'}` : '';
  }

  use() {
    if (!this.electronic) return;
    this.on = !this.on;
    this.game.audio.click(null, 0.25);
    this.onToggle?.();
  }

  alt() {}
  update() {}
  onDrop() {}
  onPickup() {}

  flickering() {
    const gh = this.game.ghost;
    return gh && gh.hunting && gh.huntPhase === 'chase' && gh.pos.distanceTo(this.worldPos().setY(0)) < 10;
  }
}

function screen(w, h, cw, ch) {
  const s = canvasTex(cw, ch);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: s.tex }));
  return { ...s, mesh: m };
}

class EMF extends Item {
  constructor(g) {
    super(g, 'emf', 'EMF Reader');
    this.electronic = true;
    this.level = 0;
    this.beepT = 0;
  }
  build() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.07, 0.16, 0.03), std(0x2a2b2e, 0.5), 0, 0.08, 0));
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.05, 0.002), std(0x111111, 0.3), 0, 0.06, 0.016));
    this.leds = [];
    const cols = [0x33ff55, 0x33ff55, 0xffee33, 0xff8822, 0xff2222];
    cols.forEach((c, i) => {
      const m = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: c, emissiveIntensity: 0 });
      const led = mesh(new THREE.BoxGeometry(0.009, 0.009, 0.006), m, -0.024 + i * 0.012, 0.135, 0.016);
      g.add(led);
      this.leds.push(m);
    });
    return g;
  }
  update(dt) {
    if (!this.on) {
      this.level = 0;
    } else {
      this.level = this.game.emfAt(this.worldPos());
      if (this.flickering()) this.level = Math.floor(Math.random() * 6);
    }
    this.leds.forEach((m, i) => (m.emissiveIntensity = this.on && i < Math.max(1, this.level) ? 2.5 : 0));
    if (this.on && this.level >= 2 && (this.held || this.game.player.pos.distanceTo(this.mesh.position) < 6)) {
      this.beepT -= dt;
      if (this.beepT <= 0) {
        this.beepT = [1, 1, 0.55, 0.38, 0.24, 0.12][this.level];
        this.game.audio.beep(1100 + this.level * 180, 0.05, this.held ? 0.1 : 0.05);
      }
      if (this.held) this.game.objectives.complete('emf');
    }
  }
}

class Thermometer extends Item {
  constructor(g) {
    super(g, 'thermo', 'Thermometer');
    this.grip = { pos: [0, 0.035, 0], axis: 'y', r: 0.032 };
    this.electronic = true;
    this.t = 0;
    this.draw('OFF');
  }
  build() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.15, 0.035), std(0xc9a227, 0.5), 0, 0.075, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 8), std(0x999999, 0.3, { metalness: 0.8 }), 0, 0.17, 0));
    this.scr = screen(0.048, 0.032, 128, 84);
    this.scr.mesh.position.set(0, 0.11, 0.0181);
    g.add(this.scr.mesh);
    return g;
  }
  draw(text, cold = false) {
    const { ctx, tex } = this.scr;
    ctx.fillStyle = this.on ? '#9fb89a' : '#1a1f1a';
    ctx.fillRect(0, 0, 128, 84);
    if (this.on) {
      ctx.fillStyle = cold ? '#0a2a6a' : '#102010';
      ctx.font = 'bold 34px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(text, 64, 52);
      if (cold) {
        ctx.font = '16px monospace';
        ctx.fillText('* FREEZING *', 64, 76);
      }
    }
    tex.needsUpdate = true;
  }
  onToggle() {
    this.draw(this.on ? '--.-' : '');
  }
  update(dt) {
    if (!this.on) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.9;
    const p = this.worldPos();
    const room = this.game.level.roomAt(p.x, p.z);
    let temp = room >= 0 ? this.game.level.rooms[room].temp : this.game.level.inVan(p) ? 18 : 9;
    temp += rand(-0.6, 0.6);
    if (this.flickering()) temp = rand(-30, 60);
    this.draw(`${temp.toFixed(1)}°C`, temp < 0);
    if (this.held && temp < 10 && room >= 0) this.game.objectives.complete('temp');
  }
}

class SpiritBox extends Item {
  constructor(g) {
    super(g, 'spiritbox', 'Spirit Box');
    this.grip = { pos: [0, 0.03, 0], axis: 'y', r: 0.042 };
    this.electronic = true;
    this.freq = 88;
    this.askT = 0;
    this.msg = '';
    this.msgT = 0;
    this.drawT = 0;
    this.draw();
  }
  build() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.13, 0.035), std(0x1c1c1c, 0.4), 0, 0.065, 0));
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.02, 0.036), std(0x8a1a1a, 0.5), 0, 0.01, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.16, 6), std(0xaaaaaa, 0.3, { metalness: 0.8 }), 0.03, 0.21, 0));
    for (let i = 0; i < 4; i++) g.add(mesh(new THREE.BoxGeometry(0.05, 0.004, 0.002), std(0x050505, 0.8), 0, 0.035 + i * 0.008, 0.018));
    this.scr = screen(0.062, 0.034, 160, 88);
    this.scr.mesh.position.set(0, 0.1, 0.0181);
    g.add(this.scr.mesh);
    return g;
  }
  hint() {
    return `[F] ${this.on ? 'Turn off' : 'Turn on'}${this.on ? '   [R] / [LMB] Ask a question' : ''}`;
  }
  draw() {
    const { ctx, tex } = this.scr;
    ctx.fillStyle = this.on ? '#1a0606' : '#050505';
    ctx.fillRect(0, 0, 160, 88);
    if (this.on) {
      ctx.fillStyle = '#ff4030';
      ctx.font = 'bold 30px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(this.msgT > 0 ? this.msg : this.freq.toFixed(1), 80, 56);
    }
    tex.needsUpdate = true;
  }
  onToggle() {
    if (this.on && this.held) this.static = this.game.audio.staticLoop();
    else this.stopStatic();
    this.draw();
  }
  stopStatic() {
    this.static?.stop();
    this.static = null;
  }
  onDrop() {
    this.on = false;
    this.stopStatic();
    this.draw();
  }
  alt() {
    const g = this.game;
    if (!this.on) return g.ui.toast('Turn the Spirit Box on first');
    if (this.askT > 0) return;
    this.askT = 3.5;
    g.ui.subtitle(`You: "${pick(QUESTIONS)}"`);
    setTimeout(() => this.answer(), rand(1500, 2600));
  }
  answer() {
    const g = this.game;
    if (!this.on || !this.held || !g.ghost) return;
    const gh = g.ghost;
    const p = g.player.pos;
    const room = g.level.roomAt(p.x, p.z);
    const dark = room >= 0 && !g.level.rooms[room].lightOn;
    const close = gh.pos.distanceTo(p) < 6 || room === gh.favRoom;
    if (gh.hasEv('BOX') && dark && close && !gh.hunting && Math.random() < 0.7) {
      const line = pick(SPIRIT_BOX_LINES);
      g.audio.spiritVoice(line);
      this.msg = line.toUpperCase().slice(0, 9);
      this.msgT = 2.5;
      g.ui.subtitle(`Spirit Box: "${line}"`, 3500);
      g.objectives.complete('box');
      gh.logActivity(1.5);
    } else {
      this.msg = '...';
      this.msgT = 1.5;
    }
    this.draw();
  }
  update(dt) {
    if (this.askT > 0) this.askT -= dt;
    if (this.msgT > 0) this.msgT -= dt;
    if (!this.on) return;
    this.static?.update(dt);
    this.drawT -= dt;
    if (this.drawT <= 0) {
      this.drawT = 0.1;
      this.freq = 87.5 + Math.random() * 20.5;
      this.draw();
    }
  }
}

class UVLight extends Item {
  constructor(g) {
    super(g, 'uv', 'UV Flashlight');
    this.grip = { pos: [0, 0.022, 0.035], axis: 'z', r: 0.021 };
    this.electronic = true;
    this.holdRot = new THREE.Euler(0, 0.05, 0);
    this.holdPos = new THREE.Vector3(0.2, -0.22, -0.38);
  }
  build() {
    const g = new THREE.Group();
    const body = mesh(new THREE.CylinderGeometry(0.02, 0.018, 0.17, 14), std(0x222233, 0.4), 0, 0.022, 0);
    body.rotation.x = Math.PI / 2;
    g.add(body);
    this.lensMat = new THREE.MeshStandardMaterial({ color: 0x221144, emissive: 0x8040ff, emissiveIntensity: 0 });
    const lens = mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.02, 14), this.lensMat, 0, 0.022, -0.09);
    lens.rotation.x = Math.PI / 2;
    g.add(lens);
    return g;
  }
  get active() {
    return this.on && this.held;
  }
  update() {
    this.lensMat.emissiveIntensity = this.on ? 2 : 0;
  }
}

class Book extends Item {
  constructor(g) {
    super(g, 'book', 'Writing Book');
    this.grip = { pos: [0.14, 0.006, 0.02], axis: 'z', r: 0.012 };
    this.written = false;
    this.holdRot = new THREE.Euler(0.9, 0, 0);
    this.holdPos = new THREE.Vector3(0.12, -0.3, -0.4);
    TX.bookPage(this.page.ctx, 256, 170, false);
    this.page.tex.needsUpdate = true;
  }
  build() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.31, 0.012, 0.21), std(0x3a1a12, 0.8), 0, 0.006, 0));
    this.page = canvasTex(256, 170);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.29, 0.19), new THREE.MeshStandardMaterial({ map: this.page.tex, roughness: 0.9 }));
    p.rotation.x = -Math.PI / 2;
    p.position.y = 0.0135;
    g.add(p);
    return g;
  }
  hint() {
    return this.written ? 'Something has been written in it...' : '[G] Drop it near the ghost and wait';
  }
  write(silent = false) {
    if (this.written) return;
    this.written = true;
    TX.bookPage(this.page.ctx, 256, 170, true);
    this.page.tex.needsUpdate = true;
    if (!silent) this.game.audio.scribble(this.mesh.position.clone().setY(0.2));
  }
}

class VideoCam extends Item {
  constructor(g) {
    super(g, 'camera', 'Video Camera');
    this.grip = { pos: [0.052, 0.04, 0.02], axis: 'z', r: 0.016 };
    this.electronic = true;
    this.holdRot = new THREE.Euler(0, 0, 0);
    this.holdPos = new THREE.Vector3(0.12, -0.19, -0.42);
  }
  build() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.09, 0.16), std(0x161616, 0.5), 0, 0.045, 0));
    const lens = mesh(new THREE.CylinderGeometry(0.028, 0.03, 0.04, 16), std(0x050505, 0.1), 0, 0.05, -0.1);
    lens.rotation.x = Math.PI / 2;
    g.add(lens);
    this.ledMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff0000, emissiveIntensity: 0 });
    g.add(mesh(new THREE.SphereGeometry(0.006, 8, 6), this.ledMat, 0.03, 0.085, -0.07));
    return g;
  }
  hint() {
    return `[F] ${this.on ? 'Stop recording' : 'Record (night vision)'}`;
  }
  get active() {
    return this.on && this.held;
  }
  update() {
    this.ledMat.emissiveIntensity = this.on && Math.floor(performance.now() / 500) % 2 ? 2 : 0;
  }
}

class Crucifix extends Item {
  constructor(g) {
    super(g, 'crucifix', 'Crucifix');
    this.grip = { pos: [0, 0.055, 0], axis: 'y', r: 0.016 };
    this.uses = 2;
    this.holdRot = new THREE.Euler(0, 0, 0);
  }
  build() {
    const g = new THREE.Group();
    this.mat = std(0x8a6a3a, 0.5, { metalness: 0.4, emissive: 0x000000 });
    g.add(mesh(new THREE.BoxGeometry(0.025, 0.22, 0.018), this.mat, 0, 0.11, 0));
    g.add(mesh(new THREE.BoxGeometry(0.13, 0.025, 0.018), this.mat, 0, 0.155, 0));
    return g;
  }
  hint() {
    return this.uses > 0 ? `Stops the ghost hunting within ~3 m (${this.uses} uses left)` : 'Burnt out';
  }
  burn(silent = false) {
    this.uses--;
    if (!silent) this.game.audio.sizzle(this.worldPos(), 0.8);
    this.mat.emissive.setHex(0xff3300);
    this.mat.emissiveIntensity = 1.5;
    setTimeout(() => {
      this.mat.emissiveIntensity = 0;
      if (this.uses <= 0) this.mat.color.setHex(0x1a1410);
    }, 1500);
    if (this.game.player.pos.distanceTo(this.worldPos()) < 10) this.game.ui.toast('The crucifix burns!');
  }
}

class Pills extends Item {
  constructor(g) {
    super(g, 'pills', 'Sanity Pills');
    this.grip = { pos: [0, 0.035, 0], axis: 'y', r: 0.032 };
    this.holdRot = new THREE.Euler(0, 0, 0);
  }
  build() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 14), std(0xd07020, 0.3, { transparent: true, opacity: 0.85 }), 0, 0.04, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.02, 14), std(0xeeeeee, 0.5), 0, 0.09, 0));
    return g;
  }
  hint() {
    return '[F] Take pills (+40% sanity)';
  }
  use() {
    const g = this.game;
    g.sanity = Math.min(100, g.sanity + 40);
    g.audio.rattle();
    g.ui.toast('You feel steadier.');
    g.items.consume(this);
  }
}

class Incense extends Item {
  constructor(g) {
    super(g, 'incense', 'Incense');
    this.grip = { pos: [0, 0.06, 0], axis: 'y', r: 0.016 };
    this.lit = false;
    this.used = false;
    this.burnT = 0;
    this.smokeT = 0;
    this.smoke = [];
    this.smokeMat = new THREE.SpriteMaterial({ map: TX.smokeSprite(), transparent: true, depthWrite: false, opacity: 0.6 });
  }
  build() {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const s = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.18, 6), std(0x5a6a3a, 1), Math.cos(i) * 0.008, 0.09, Math.sin(i) * 0.008);
      g.add(s);
    }
    g.add(mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.015, 8), std(0xaa2222, 1), 0, 0.06, 0));
    this.tipMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff5500, emissiveIntensity: 0 });
    g.add(mesh(new THREE.SphereGeometry(0.014, 8, 6), this.tipMat, 0, 0.18, 0));
    return g;
  }
  hint() {
    return this.used ? 'Burnt out' : this.lit ? 'Burning...' : '[F] Light incense near the ghost';
  }
  use() {
    const g = this.game;
    if (this.used || this.lit) return;
    this.lit = true;
    this.burnT = 7;
    g.audio.lighter();
    // in multiplayer only the host's ghost can be calmed; tell the host
    if (g.mp && !g.mp.isHost) return g.mp.send({ t: 'itemState', i: this.uid, incense: true }, g.mp.net.hostId);
    const gh = g.ghost;
    const close = gh.pos.distanceTo(this.worldPos().setY(0)) < 5;
    if (close) {
      if (gh.hunting) {
        gh.blind = 6;
        gh.lastKnown = null;
        gh.path = [];
      } else {
        gh.incenseBlock = gh.type.incenseBlock;
        g.objectives.complete('incense');
      }
      g.audio.moan(gh.headPos(), { vol: 0.6, pitch: 260 });
    }
  }
  update(dt) {
    this.tipMat.emissiveIntensity = this.lit ? 2 + Math.sin(performance.now() / 90) * 0.6 : 0;
    if (this.lit) {
      this.burnT -= dt;
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.12;
        const s = new THREE.Sprite(this.smokeMat.clone());
        const tip = new THREE.Vector3(0, 0.19, 0);
        this.mesh.localToWorld(tip);
        s.position.copy(tip);
        s.scale.setScalar(0.06);
        s.userData.life = 2.2;
        this.game.scene.add(s);
        this.smoke.push(s);
      }
      if (this.burnT <= 0) {
        this.lit = false;
        this.used = true;
      }
    }
    for (const s of this.smoke) {
      s.userData.life -= dt;
      s.position.y += dt * 0.35;
      s.position.x += Math.sin(s.userData.life * 3) * dt * 0.05;
      s.scale.multiplyScalar(1 + dt * 0.9);
      s.material.opacity = Math.max(0, s.userData.life / 2.2) * 0.5;
      if (s.userData.life <= 0) this.game.scene.remove(s);
    }
    this.smoke = this.smoke.filter((s) => s.userData.life > 0);
  }
}

const CLASSES = [EMF, Thermometer, SpiritBox, UVLight, Book, VideoCam, Crucifix, Pills, Incense];

export class Items {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.inventory = [null, null, null];
    this.active = 0;
    this.all = [];
    CLASSES.forEach((C, i) => {
      const item = new C(game);
      item.uid = i;
      this.all.push(item);
      const spot = game.level.gearSpots[i];
      item.mesh.position.copy(spot);
      game.scene.add(item.mesh);
      this.list.push(item);
    });
  }

  get held() {
    return this.inventory[this.active];
  }

  meshes() {
    return this.list.filter((i) => !i.held).map((i) => i.mesh);
  }

  pickup(item, granted = false) {
    let slot = this.inventory[this.active] ? this.inventory.indexOf(null) : this.active;
    if (slot < 0) {
      this.game.ui.toast('Your hands are full — drop something [G]');
      return false;
    }
    const mp = this.game.mp;
    if (mp && !granted) {
      // the host decides who gets an item, so two players can't grab the same one
      if (!mp.isHost) return mp.requestPickup(item), false;
      if (!mp.hostPickup(item, mp.id)) return this.game.ui.toast('Someone else has that.'), false;
    }
    this.game.scene.remove(item.mesh);
    this.game.vmGroup.add(item.mesh);
    item.mesh.position.copy(item.holdPos);
    item.mesh.rotation.copy(item.holdRot);
    item.held = true;
    item.falling = false;
    this.inventory[slot] = item;
    this.select(slot);
    item.onPickup();
    this.game.audio.click(null, 0.2);
    return true;
  }

  select(i) {
    if (i < 0 || i > 2) return;
    const prev = this.held;
    this.active = i;
    this.inventory.forEach((it) => it && (it.mesh.visible = it === this.held));
    if (prev && prev !== this.held && prev.type === 'spiritbox') prev.onDrop();
    this.game.ui.setSlots(this.inventory, this.active);
  }

  cycle(dir = 1) {
    this.select((this.active + dir + 3) % 3);
  }

  drop() {
    const item = this.held;
    if (!item) return;
    const cam = this.game.camera;
    this.game.vmGroup.remove(item.mesh);
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    item.mesh.position.copy(cam.position).addScaledVector(fwd, 0.45);
    item.mesh.position.y -= 0.35;
    item.mesh.rotation.set(0, Math.atan2(fwd.x, fwd.z) + Math.PI, 0);
    item.mesh.visible = true;
    this.game.scene.add(item.mesh);
    item.held = false;
    item.falling = true;
    item.vel.copy(fwd).multiplyScalar(1.2);
    this.inventory[this.active] = null;
    item.onDrop();
    const mp = this.game.mp;
    if (mp) {
      const p = item.mesh.position;
      const rest = [p.x + fwd.x * 0.25, this.game.level.floorAt(p.x, p.z) + 0.005, p.z + fwd.z * 0.25];
      if (mp.isHost) item.holder = null;
      else mp.send({ t: 'drop', i: item.uid, p: rest, ry: item.mesh.rotation.y }, mp.net.hostId);
    }
    this.game.ui.setSlots(this.inventory, this.active);
  }

  consume(item) {
    item.gone = true;
    item.mesh.parent?.remove(item.mesh);
    const mp = this.game.mp;
    if (mp && !mp.isHost && item.held) mp.send({ t: 'itemState', i: item.uid, gone: true }, mp.net.hostId);
    item.held = false;
    const idx = this.inventory.indexOf(item);
    if (idx >= 0) this.inventory[idx] = null;
    this.game.vmGroup.remove(item.mesh);
    this.list = this.list.filter((i) => i !== item);
    this.game.ui.setSlots(this.inventory, this.active);
  }

  electronicsActive() {
    const h = this.held;
    return !!(h && h.electronic && h.on);
  }

  uvActive() {
    const h = this.held;
    return !!(h && h.type === 'uv' && h.on);
  }

  cameraActive() {
    const h = this.held;
    return !!(h && h.type === 'camera' && h.on);
  }

  update(dt) {
    const L = this.game.level;
    for (const it of this.list) {
      it.update(dt);
      if (!it.falling) continue;
      const p = it.mesh.position;
      it.vel.y -= 9.8 * dt;
      p.addScaledVector(it.vel, dt);
      for (const c of L.getColliders()) {
        const push = circleVsBox(p.x, p.z, 0.06, c);
        if (push) {
          p.x += push[0];
          p.z += push[1];
          it.vel.x = it.vel.z = 0;
        }
      }
      const floor = L.floorAt(p.x, p.z) + 0.005;
      if (p.y <= floor) {
        p.y = floor;
        if (it.vel.y < -1.5) this.game.audio.thud(p, 0.3);
        it.falling = false;
        it.vel.set(0, 0, 0);
      }
    }
  }
}
