import * as THREE from 'three';
import { Level } from './level.js';
import { Assets } from './assets.js';
import willow from './maps/willow.js';
import cabin from './maps/cabin.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const MAPS = { willow, cabin };
import { Player } from './player.js';
import { AudioEngine } from './audio.js';
import { Items } from './items.js';
import { Ghost } from './ghost.js';
import { UI } from './ui.js';
import { EVIDENCE } from './ghostTypes.js';
import { rand, pick, clamp, mesh, std } from './util.js';
import * as TX from './textures.js';

const DIFFS = {
  amateur: { name: 'Amateur', drain: 1, setup: 240, grace: 4, huntLen: 25, activity: 1, mult: 1, desc: 'Long setup time, slow sanity drain and a forgiving grace period when a hunt begins.' },
  intermediate: { name: 'Intermediate', drain: 1.5, setup: 120, grace: 3, huntLen: 32, activity: 1.15, mult: 2, desc: 'Shorter setup, faster sanity drain, longer hunts. Double pay.' },
  professional: { name: 'Professional', drain: 2, setup: 30, grace: 2, huntLen: 40, activity: 1.3, mult: 3, desc: 'Almost no setup time. The ghost is restless and hunts last a long time. Triple pay.' },
};

const OBJECTIVES = {
  event: 'Witness a ghost event',
  emf: 'Detect paranormal activity with an EMF Reader',
  temp: 'Find a room below 10 Celsius with a Thermometer',
  incense: 'Cleanse the area near the ghost with Incense',
  hunt: 'Survive a hunt inside the house',
  box: 'Get a response from the ghost on the Spirit Box',
};

class Objectives {
  constructor(game) {
    this.game = game;
    const pool = ['event', 'emf', 'temp', 'incense', 'hunt'];
    if (game.ghost.hasEv('BOX')) pool.push('box');
    this.list = pool.sort(() => Math.random() - 0.5).slice(0, 3);
    this.done = new Set();
  }
  complete(id) {
    if (!this.list.includes(id) || this.done.has(id)) return;
    this.done.add(id);
    this.game.ui.toast(`Objective complete: ${OBJECTIVES[id]}`, 3500);
    this.game.audio.beep(880, 0.08, 0.06, 'sine');
    setTimeout(() => this.game.audio.beep(1320, 0.12, 0.06, 'sine'), 90);
  }
}

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.autoClear = false;
    this.audio = new AudioEngine();
    this.state = 'menu';
    this.diffKey = 'amateur';
    this.mapKey = 'willow';
    this.assets = new Assets(this.renderer);
    this.locked = false;
    this.last = performance.now();
    this.bindMenu();
    window.addEventListener('resize', () => this.resize());
    requestAnimationFrame((t) => this.loop(t));
  }

  // ---------------------------------------------------------------- setup
  bindMenu() {
    document.getElementById('contract').textContent = Math.floor(rand(1000, 9999));
    const desc = document.getElementById('diffdesc');
    desc.textContent = DIFFS.amateur.desc;
    document.querySelectorAll('#difficulty button').forEach((b) =>
      b.addEventListener('click', () => {
        document.querySelectorAll('#difficulty button').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
        this.diffKey = b.dataset.d;
        desc.textContent = DIFFS[this.diffKey].desc;
      })
    );
    const mapDesc = document.getElementById('mapdesc');
    mapDesc.textContent = MAPS.willow.blurb;
    document.querySelectorAll('#maps button').forEach((b) =>
      b.addEventListener('click', () => {
        document.querySelectorAll('#maps button').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
        this.mapKey = b.dataset.m;
        mapDesc.textContent = MAPS[this.mapKey].blurb;
      })
    );
    document.getElementById('vol').addEventListener('input', (e) => this.audio.setVolume(+e.target.value));
    document.getElementById('sens').addEventListener('input', (e) => this.player && (this.player.sensitivity = +e.target.value));
    document.getElementById('start').addEventListener('click', () => this.start());
    document.getElementById('resume').addEventListener('click', () => this.resume());
    document.getElementById('quit').addEventListener('click', () => this.finish(false, true));
    document.getElementById('again').addEventListener('click', () => location.reload());
  }

  async start() {
    if (this.starting) return;
    this.starting = true;
    const btn = document.getElementById('start');
    btn.disabled = true;
    // the click is the user gesture that unlocks audio; resume it before the async load
    this.audio.init();
    this.audio.resume();
    await this.assets.load((p) => (btn.textContent = `Loading... ${Math.round(p * 100)}%`));
    this.map = MAPS[this.mapKey];
    this.audio.resume();
    this.audio.setVolume(+document.getElementById('vol').value);
    this.diff = DIFFS[this.diffKey];
    this.quality = document.getElementById('quality').value;
    this.buildWorld();
    this.player.sensitivity = +document.getElementById('sens').value;
    this.ui.show('#menu', false);
    this.ui.show('#hud', true);
    this.state = 'playing';
    this.audio.startAmbient();
    this.lock();
    this.ui.toast('Grab your equipment from the rack, then head inside.', 4500);
  }

  buildWorld() {
    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(0x03050c);
    scene.fog = new THREE.FogExp2(0x03050c, this.map.fog ?? 0.05);
    const cam = (this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.03, 140));
    scene.add(cam);

    this.ambient = new THREE.AmbientLight(0x1c2440, 0.55);
    scene.add(this.ambient);
    const moon = new THREE.DirectionalLight(0x5a6aa8, 0.55);
    moon.position.set(-20, 30, 35);
    moon.target.position.set(this.map.GW / 2, 0, this.map.GH / 2);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    Object.assign(moon.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 100 });
    moon.shadow.bias = -0.0005;
    moon.shadow.normalBias = 0.04;
    scene.add(moon, moon.target);
    this.moon = moon;
    const Q = { low: { pr: 0.75, moon: 0, flash: 512 }, medium: { pr: 1, moon: 1024, flash: 1024 }, high: { pr: Math.min(window.devicePixelRatio, 1.5), moon: 2048, flash: 1024 } }[this.quality];
    this.renderer.setPixelRatio(Q.pr);
    moon.castShadow = Q.moon > 0;
    // the moon never moves and the house interior is always in its shadow: render that map once
    moon.shadow.autoUpdate = false;
    moon.shadow.needsUpdate = true;
    if (Q.moon) moon.shadow.mapSize.set(Q.moon, Q.moon);
    if (this.quality === 'low') this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.flashShadow = Q.flash;
    // bloom makes bulbs, embers, screens and the flashlight hotspot glow (skipped on Low)
    this.composer = null;
    if (this.quality !== 'low') {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(scene, cam));
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.38, 0.4, 0.9));
      this.composer.addPass(new OutputPass());
    }

    this.level = new Level(scene, this.map, this.assets);
    this.player = new Player(cam, this.level);
    const vb = this.level.vanBounds;
    this.player.pos.set((vb.minX + vb.maxX) / 2, 0, vb.maxZ - 1.1);
    this.player.update(0, this.audio);

    // hand-held lights live on the camera
    this.flashlight = new THREE.SpotLight(0xe4ecff, 0, 20, 0.36, 0.42, 1.3);
    this.flashlight.position.set(0.15, -0.15, 0);
    this.flashlight.castShadow = true;
    this.flashlight.shadow.mapSize.set(this.flashShadow, this.flashShadow);
    // normalBias removes the striped shadow acne on walls/ceiling seen at grazing angles
    this.flashlight.shadow.bias = -0.0002;
    this.flashlight.shadow.normalBias = 0.035;
    this.flashlight.shadow.camera.near = 0.1;
    cam.add(this.flashlight);
    this.flashlight.target.position.set(0.1, -0.2, -5);
    cam.add(this.flashlight.target);
    this.flashOn = true;
    this.uvLight = new THREE.SpotLight(0x7a3cff, 0, 8, 0.3, 0.35, 1.4);
    this.uvLight.position.set(0.2, -0.2, 0);
    cam.add(this.uvLight);
    this.uvLight.target.position.set(0.15, -0.2, -5);
    cam.add(this.uvLight.target);

    // first-person viewmodel (rendered in a separate pass so it never clips into walls)
    this.vmScene = new THREE.Scene();
    this.vmGroup = new THREE.Group();
    this.vmScene.add(this.vmGroup);
    this.vmAmbient = new THREE.HemisphereLight(0xdfe6ff, 0x202020, 0.5);
    this.vmScene.add(this.vmAmbient);
    const vmKey = new THREE.DirectionalLight(0xffffff, 0.6);
    vmKey.position.set(0.5, 1, 0.5);
    this.vmGroup.add(vmKey);
    this.buildArm();

    this.audio.occlusion = (pos) => {
      const pr = this.level.roomAt(this.player.pos.x, this.player.pos.z);
      const sr = this.level.roomAt(pos.x, pos.z);
      if (pr === sr) return 0;
      if (pr < 0 || sr < 0) return 0.85;
      return 0.5;
    };

    this.ui = new UI(this);
    this.ghost = new Ghost(this);
    this.items = new Items(this);
    this.objectives = new Objectives(this);
    this.ui.setSlots(this.items.inventory, 0);
    this.ui.renderJournal();

    this.time = 0;
    this.sanity = 100;
    this.setupLeft = this.diff.setup;
    this.emfSources = [];
    this.prints = [];
    this.monT = 0;
    this.activity = new Array(40).fill(0);
    this.actSampleT = 0;
    this.clockT = 1;
    this.creakT = rand(10, 25);
    this.thunderT = rand(15, 35);
    this.flash = 0;
    this.owlT = rand(20, 50);
    this.crackleT = 0;
    this.whisperT = rand(20, 40);
    this.heartT = 0;
    this.tvT = 0;
    this.endPending = 0;
    this.rayc = new THREE.Raycaster();
    this.rayc.far = 2.3;
    this.buildRain();
    this.bindInput();
    document.fonts?.ready.then(() => (this.monT = 0));
  }

  buildArm() {
    const skin = std(0xd4a48a, 0.65);
    const sleeve = std(0x2d3a4a, 0.9);
    this.arm = new THREE.Group();
    this.hand = new THREE.Group();
    const palm = mesh(new THREE.SphereGeometry(0.042, 16, 12), skin, 0.005, -0.012, 0.012);
    palm.scale.set(1.0, 0.6, 1.2);
    this.hand.add(palm);
    // fingers curl up and around whatever is held
    for (let i = 0; i < 4; i++) {
      const f = mesh(new THREE.CapsuleGeometry(0.0095, 0.03, 4, 8), skin, -0.024 + i * 0.016, 0.006, -0.03);
      f.rotation.x = 1.25;
      f.scale.setScalar(i === 3 ? 0.85 : 1);
      this.hand.add(f);
    }
    const thumb = mesh(new THREE.CapsuleGeometry(0.01, 0.03, 4, 8), skin, -0.04, 0.012, -0.004);
    thumb.rotation.set(0.6, 0, 0.9);
    this.hand.add(thumb);
    const wrist = mesh(new THREE.CylinderGeometry(0.034, 0.03, 0.05, 12), skin, 0.004, -0.012, 0.06);
    wrist.rotation.x = Math.PI / 2;
    this.hand.add(wrist);
    this.sleeve = mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.5, 12), sleeve);
    this.cuff = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 12), std(0x1a222c, 0.9));
    this.arm.add(this.hand, this.sleeve, this.cuff);
    this.vmGroup.add(this.arm);
    // the always-carried flashlight, shown when the hand is free
    this.torch = new THREE.Group();
    const body = mesh(new THREE.CylinderGeometry(0.019, 0.016, 0.2, 14), std(0x151515, 0.5), 0, 0, 0);
    body.rotation.x = Math.PI / 2;
    this.torch.add(body);
    this.torchLens = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xeef2ff, emissiveIntensity: 0 });
    const lens = mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.02, 14), this.torchLens, 0, 0, -0.105);
    lens.rotation.x = Math.PI / 2;
    this.torch.add(lens);
    this.torch.position.set(0.2, -0.22, -0.4);
    this.vmGroup.add(this.torch);
  }

  buildRain() {
    const N = 1800;
    const pos = new Float32Array(N * 6);
    this.rainData = [];
    for (let i = 0; i < N; i++) this.rainData.push({ x: 0, y: 0, z: 0, v: rand(9, 13) });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x8090b0, transparent: true, opacity: 0.35 }));
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
    this.rainData.forEach((d) => this.respawnDrop(d, true));
  }

  respawnDrop(d, anyY = false) {
    const c = this.camera.position;
    for (let k = 0; k < 6; k++) {
      d.x = c.x + rand(-14, 14);
      d.z = c.z + rand(-14, 14);
      const L = this.level, vb = L.vanBounds;
      const inHouse = d.x > -0.6 && d.x < L.GW + 0.6 && d.z > -0.6 && d.z < L.GH + (L.map.id === 'cabin' ? 1.9 : 0.6);
      const inVan = d.x > vb.minX - 0.1 && d.x < vb.maxX + 0.1 && d.z > vb.minZ - 0.1 && d.z < vb.maxZ + 1.6;
      if (!inHouse && !inVan) break;
      d.x = -999;
    }
    d.y = anyY ? rand(0, 9) : rand(7, 9);
  }

  updateRain(dt) {
    const arr = this.rain.geometry.attributes.position.array;
    this.rainData.forEach((d, i) => {
      d.y -= d.v * dt;
      if (d.y < 0 || Math.abs(d.x - this.camera.position.x) > 15 || Math.abs(d.z - this.camera.position.z) > 15) this.respawnDrop(d);
      const o = i * 6;
      arr[o] = d.x;
      arr[o + 1] = d.y;
      arr[o + 2] = d.z;
      arr[o + 3] = d.x + 0.02;
      arr[o + 4] = d.y + 0.35;
      arr[o + 5] = d.z;
    });
    this.rain.geometry.attributes.position.needsUpdate = true;
  }

  // ---------------------------------------------------------------- input
  bindInput() {
    const p = this.player;
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked && this.state === 'playing') this.pause();
    });
    document.addEventListener('mousemove', (e) => {
      if (this.locked && this.state === 'playing') p.look(e.movementX, e.movementY);
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.locked || this.state !== 'playing' || !p.alive) return;
      if (e.button === 0) this.items.held?.alt();
      if (e.button === 2) this.useHeld();
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('click', () => {
      if (this.state === 'playing' && !this.locked) this.lock();
    });
    window.addEventListener('wheel', (e) => {
      if (this.state === 'playing' && this.locked) this.items.cycle(e.deltaY > 0 ? 1 : -1);
    });
    window.addEventListener('keyup', (e) => (p.keys[e.code] = false));
    window.addEventListener('keydown', (e) => {
      p.keys[e.code] = true;
      if (e.code === 'KeyJ' || (e.code === 'Escape' && this.state === 'journal')) {
        if (this.state === 'playing' && p.alive) this.openJournal();
        else if (this.state === 'journal') this.closeJournal();
        return;
      }
      if (this.state !== 'playing' || !p.alive) return;
      switch (e.code) {
        case 'KeyE':
          this.interact();
          break;
        case 'KeyF':
          this.useHeld();
          break;
        case 'KeyR':
          this.items.held?.alt();
          break;
        case 'KeyG':
          this.items.drop();
          break;
        case 'KeyT':
          this.flashOn = !this.flashOn;
          this.audio.click(null, 0.3);
          break;
        case 'KeyQ':
          this.items.cycle(1);
          break;
        case 'Digit1':
        case 'Digit2':
        case 'Digit3':
          this.items.select(+e.code.slice(5) - 1);
          break;
        case 'KeyC':
          p.crouch = !p.crouch;
          break;
      }
    });
  }

  useHeld() {
    const h = this.items.held;
    if (h) h.use();
  }

  lock() {
    try {
      const r = this.canvas.requestPointerLock();
      if (r && r.catch) r.catch(() => this.state === 'playing' && this.pause());
    } catch {
      this.pause();
    }
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    Object.keys(this.player.keys).forEach((k) => (this.player.keys[k] = false));
    this.ui.show('#pause', true);
    this.audio.ctx?.suspend();
  }

  resume() {
    this.ui.show('#pause', false);
    this.state = 'playing';
    this.audio.resume();
    this.lock();
  }

  openJournal() {
    this.state = 'journal';
    Object.keys(this.player.keys).forEach((k) => (this.player.keys[k] = false));
    this.ui.renderJournal();
    this.ui.show('#journal', true);
    document.exitPointerLock();
    this.audio.thud(null, 0.15);
  }

  closeJournal() {
    this.ui.show('#journal', false);
    this.state = 'playing';
    this.lock();
  }

  interact() {
    const target = this.lookTarget;
    if (!target) return;
    const { kind, obj } = target;
    const L = this.level;
    if (kind === 'door') {
      if (obj.locked) {
        this.audio.thud(obj.center, 0.6);
        this.audio.thud(obj.center, 0.4);
        this.ui.toast("It won't open!");
        return;
      }
      obj.target = obj.open > 0.5 ? 0 : 1;
      if (obj.target === 1) this.audio.creak(obj.center, { vol: 0.35, dur: 0.6 });
    } else if (kind === 'switch') {
      L.setLight(obj, !obj.lightOn);
      this.audio.click(obj.switchMesh.position, 0.5);
    } else if (kind === 'item') {
      this.items.pickup(obj);
    } else if (kind === 'terminal') {
      if (this.endPending > 0) this.finish(false);
      else {
        this.endPending = 4;
        this.ui.toast(this.ui.guessType ? 'Press [E] again to leave and end the contract' : 'You have not chosen a ghost type in your journal [J]. Press [E] again to leave anyway', 4000);
      }
    }
  }

  // ---------------------------------------------------------------- world events
  addEmf(pos, level) {
    this.emfSources.push({ pos: pos.clone(), level, t: 20 });
    this.ghost.logActivity(level >= 5 ? 2 : 1);
  }

  emfAt(p) {
    let lvl = 1;
    for (const s of this.emfSources) if (s.pos.distanceTo(p) < 2.2) lvl = Math.max(lvl, s.level);
    if (this.ghost.model.visible && this.ghost.pos.distanceTo(new THREE.Vector3(p.x, 0, p.z)) < 2.5) lvl = Math.max(lvl, 3);
    return lvl;
  }

  printMat() {
    return new THREE.MeshBasicMaterial({ map: TX.handprint(), color: 0xd8ffe4, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 });
  }

  addPrint(m, parent) {
    parent.add(m);
    this.prints.push(m);
    if (this.prints.length > 14) {
      const old = this.prints.shift();
      old.parent?.remove(old);
    }
  }

  addPrintOnDoor(door, from) {
    const local = door.leaf.worldToLocal(from.clone().setY(1));
    const side = local.z >= 0 ? 1 : -1;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.19), this.printMat());
    m.position.set(rand(0.6, 0.8), rand(0.95, 1.35), side * 0.026);
    if (side < 0) m.rotation.y = Math.PI;
    m.rotation.z = rand(-0.4, 0.4);
    this.addPrint(m, door.leaf);
  }

  addPrintOnSwitch(room) {
    const sw = room.switchMesh;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.19), this.printMat());
    m.position.set(rand(-0.08, 0.08), rand(0.05, 0.14), 0.012);
    m.rotation.z = rand(-0.4, 0.4);
    this.addPrint(m, sw);
  }

  drainSanity(n) {
    this.sanity = Math.max(0, this.sanity - n);
  }

  tvOn(sec) {
    if (!this.level.tv) return;
    this.tvT = sec;
    this.level.tv.on = true;
    this.level.tv.mat.color.setHex(0xffffff);
    this.audio.tvStatic(this.level.tv.pos, sec);
  }

  onHuntStart() {
    const fd = this.level.frontDoor;
    fd.target = 0;
    fd.slam = fd.open > 0.05;
    fd.locked = true;
    if (!fd.slam) this.audio.doorClose(fd.center, 0.8);
    this.huntSeen = this.player.inHouse;
  }

  onHuntEnd() {
    this.level.frontDoor.locked = false;
    if (this.player.alive && this.player.inHouse) this.objectives.complete('hunt');
  }

  killPlayer(ghost) {
    const p = this.player;
    p.alive = false;
    ghost.model.visible = true;
    const hp = ghost.headPos();
    const d = hp.clone().sub(this.camera.position);
    p.yaw = Math.atan2(-d.x, -d.z);
    p.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    this.audio.scream(hp, 1.2, 2.2);
    this.flashOn = true;
    setTimeout(() => this.ui.show('#death', true), 1400);
    setTimeout(() => this.finish(true), 5000);
  }

  finish(dead, abandoned = false) {
    if (this.state === 'ended') return;
    this.state = 'ended';
    document.exitPointerLock();
    this.ghost.voice?.stop();
    this.items.list.forEach((i) => i.stopStatic?.());
    this.ui.show('#hud', false);
    this.ui.show('#pause', false);
    this.ui.show('#journal', false);
    this.ui.show('#death', false);
    const gt = this.ghost.type;
    const guess = this.ui.guessType;
    const correct = guess && guess.name === gt.name;
    const m = this.diff.mult;
    const idPay = correct ? 50 * m : 0;
    const objPay = this.objectives.done.size * 15 * m;
    const total = abandoned ? 0 : dead ? Math.round((idPay + objPay) * 0.5) : idPay + objPay + 10 * m;
    const objHtml = this.objectives.list
      .map((o) => `<div class="${this.objectives.done.has(o) ? 'good' : 'bad'}">${this.objectives.done.has(o) ? '✔' : '✘'} ${OBJECTIVES[o]}</div>`)
      .join('');
    document.getElementById('report').innerHTML = `
      <div>${abandoned ? '<span class="bad">Contract abandoned.</span>' : dead ? '<span class="bad">You did not make it out.</span>' : '<span class="good">You made it out alive.</span>'}</div>
      <div>Difficulty: ${this.diff.name} &nbsp;·&nbsp; Time in the field: ${Math.floor(this.time / 60)}m ${Math.floor(this.time % 60)}s</div>
      <hr>
      <div>The ghost was <b>${this.ghost.name}</b>, a <b>${gt.name}</b>.</div>
      <div>Its evidence: ${gt.ev.map((e) => EVIDENCE[e]).join(', ')}.</div>
      <div>Your answer: ${guess ? `<b class="${correct ? 'good' : 'bad'}">${guess.name}</b> ${correct ? '✔' : '✘'}` : '<span class="bad">none</span>'}</div>
      <div>Its room was the <b>${this.level.rooms[this.ghost.favRoom].name}</b>.</div>
      <hr>
      <div><b>Optional objectives</b></div>${objHtml}
      <hr>
      <div>Ghost identification: $${idPay} &nbsp;·&nbsp; Objectives: $${objPay}${dead ? ' &nbsp;·&nbsp; <span class="bad">(death: 50% insurance payout)</span>' : ''}</div>
      <div style="font-size:28px">Total pay: <b>$${total}</b></div>`;
    this.ui.show('#results', true);
    if (this.audio.master) this.audio.master.gain.setTargetAtTime(0, this.audio.t, 1.5);
  }

  // ---------------------------------------------------------------- update
  loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.scene) {
      if (this.state === 'playing' || this.state === 'journal') this.update(dt);
      else if (this.state === 'ended') this.player.update(dt, this.audio);
      this.render();
    }
    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    const p = this.player, L = this.level, gh = this.ghost, A = this.audio;
    this.time += dt;
    if (this.setupLeft > 0) this.setupLeft -= dt;
    if (this.endPending > 0) this.endPending -= dt;
    p.update(dt, A);
    L.update(dt, A);
    L.updateLights(dt, gh.pos, gh.hunting && gh.huntPhase === 'chase');
    this.items.update(dt);
    gh.update(dt);

    // temperatures drift toward their targets; the ghost room gets cold
    for (const r of L.rooms) {
      const target = r.id === gh.favRoom ? (gh.hasEv('FREEZE') ? -6 : 5) : 15;
      r.temp += (target - r.temp) * dt * 0.015;
    }
    // sanity drains in the dark inside the house
    const room = p.room;
    if (p.alive && p.inHouse && room >= 0 && !L.rooms[room].lightOn) this.drainSanity(0.1 * this.diff.drain * dt);
    this.emfSources = this.emfSources.filter((s) => (s.t -= dt) > 0);

    // flashlight + UV
    const nearHunt = gh.hunting && gh.huntPhase === 'chase' && gh.pos.distanceTo(p.pos) < 10;
    const flick = nearHunt && Math.random() < 0.5;
    this.flashlight.intensity = this.flashOn && !flick ? 20 : 0;
    this.torchLens.emissiveIntensity = this.flashlight.intensity > 0 ? 3 : 0;
    const uv = this.items.uvActive();
    this.uvLight.intensity = uv && !flick ? 14 : 0;
    this.updatePrints(uv, dt);

    // night vision camera
    const nv = this.items.cameraActive() && !flick;
    if (nv !== this.nv) {
      this.nv = nv;
      this.canvas.style.filter = nv ? 'grayscale(1) sepia(1) hue-rotate(55deg) saturate(2.6) brightness(1.5) contrast(1.15)' : '';
      this.ambient.intensity = nv ? 2.2 : 0.55;
      this.ambient.color.setHex(nv ? 0xffffff : 0x1c2440);
      nv ? this.camera.layers.enable(1) : this.camera.layers.disable(1);
      this.ui.setNightVision(nv);
    }

    this.updateLook();
    this.updateViewmodel(dt);
    this.updateRain(dt);
    A.updateListener(this.camera);
    const fear = clamp(1 - this.sanity / 100, 0, 1);
    A.setEnvironment(!p.inHouse, fear);
    this.ui.setFear(gh.hunting ? Math.max(fear, 0.6) : fear * 0.6);
    this.ui.setStamina(p.stamina);

    // ambience
    this.clockT -= dt;
    if (this.clockT <= 0) {
      this.clockT = 1;
      if (L.clockPos.distanceTo(p.pos) < 10) A.clockTick(L.clockPos);
    }
    this.creakT -= dt;
    if (this.creakT <= 0) {
      this.creakT = rand(14, 35);
      const r = Math.floor(Math.random() * L.rooms.length);
      A.creak(L.randomPointInRoom(r).setY(2.4), { vol: 0.25 });
    }
    // lightning: the sky and every window flash, thunder follows after a short delay
    this.thunderT -= dt;
    if (this.thunderT <= 0) {
      this.thunderT = rand(25, 70);
      this.flash = 0.45;
      const delay = rand(0.6, 2.5);
      setTimeout(() => A.thunder(!p.inHouse, delay < 1.2 ? 1 : 0.6), delay * 1000);
    }
    if (this.flash > 0) {
      this.flash -= dt;
      const on = this.flash > 0.3 || (this.flash > 0.1 && this.flash < 0.18);
      this.moon.intensity = on ? 3.5 : 0.55;
      this.ambient.intensity = this.nv ? 2.2 : on ? 1.4 : 0.55;
      L.innerGlass.forEach((m) => (m.emissiveIntensity = on ? 9 : 1));
    }
    // campfire / stove flicker and crackle
    const fl = 0.75 + Math.random() * 0.5;
    if (L.fireLight) {
      L.fireLight.intensity = 3 * fl;
      L.emberMat.emissiveIntensity = 1.2 * fl;
    }
    if (L.stoveLight) {
      L.stoveLight.intensity = 2.2 * fl;
      L.stoveGlow.emissiveIntensity = 1.6 * fl;
    }
    this.crackleT -= dt;
    if (this.crackleT <= 0) {
      this.crackleT = rand(0.08, 0.5);
      for (const fire of [L.fireLight, L.stoveLight]) if (fire && fire.position.distanceTo(p.pos) < 9) A.crackle(fire.position);
    }
    if (L.map.ground === 'forest') {
      this.owlT -= dt;
      if (this.owlT <= 0) {
        this.owlT = rand(30, 70);
        const a = rand(0, Math.PI * 2);
        A.owl(new THREE.Vector3(p.pos.x + Math.cos(a) * 25, 8, p.pos.z + Math.sin(a) * 25));
      }
    }
    A.setVanHum(L.inVan(p.pos));
    if (this.sanity < 35 && p.inHouse) {
      this.whisperT -= dt;
      if (this.whisperT <= 0) {
        this.whisperT = rand(18, 40);
        const a = rand(0, Math.PI * 2);
        A.whisper(new THREE.Vector3(p.pos.x + Math.cos(a) * 1.2, 1.6, p.pos.z + Math.sin(a) * 1.2), 0.35);
        if (this.sanity < 20) setTimeout(() => A.breath(0.2), 1500);
      }
    }
    if (gh.hunting && gh.huntPhase === 'chase' && p.alive) {
      this.heartT -= dt;
      if (this.heartT <= 0) {
        const d = gh.pos.distanceTo(p.pos);
        this.heartT = 0.35 + clamp(d / 18, 0, 1) * 0.55;
        A.heartbeat(0.3 + (1 - clamp(d / 18, 0, 1)) * 0.6);
      }
    }
    if (this.tvT > 0 && L.tv) {
      this.tvT -= dt;
      const { ctx, tex } = L.tv.canvas;
      const img = ctx.createImageData(64, 48);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      tex.needsUpdate = true;
      if (this.tvT <= 0) {
        L.tv.on = false;
        L.tv.mat.color.setHex(0x111111);
      }
    }

    // van monitors + whiteboard
    this.actSampleT -= dt;
    if (this.actSampleT <= 0) {
      this.actSampleT = 2;
      this.activity.push(gh.activityLevel);
      this.activity.shift();
    }
    this.monT -= dt;
    if (this.monT <= 0) {
      this.monT = 0.5;
      this.drawMonitors();
    }
    if (this.state === 'journal') this.ui.renderCase();
  }

  updatePrints(uv, dt) {
    const cam = this.camera;
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const wp = new THREE.Vector3();
    for (const m of this.prints) {
      m.getWorldPosition(wp);
      let target = 0;
      if (uv) {
        const to = wp.clone().sub(cam.position);
        const d = to.length();
        if (d < 4.5 && fwd.angleTo(to) < 0.32) {
          target = 0.95;
          if (d < 3.5) this.sawPrints = true;
        }
      }
      m.material.opacity += (target - m.material.opacity) * Math.min(1, dt * 6);
    }
  }

  updateLook() {
    const cam = this.camera;
    this.rayc.setFromCamera({ x: 0, y: 0 }, cam);
    const targets = [...this.level.occluders, ...this.level.interactables, ...this.items.meshes()];
    const hit = this.rayc.intersectObjects(targets, true)[0];
    let found = null;
    if (hit) {
      let o = hit.object;
      while (o) {
        const u = o.userData;
        if (u.door) { found = { kind: 'door', obj: u.door }; break; }
        if (u.lightSwitch) { found = { kind: 'switch', obj: u.lightSwitch }; break; }
        if (u.item) { found = { kind: 'item', obj: u.item }; break; }
        if (u.terminal) { found = { kind: 'terminal', obj: null }; break; }
        o = o.parent;
      }
    }
    this.lookTarget = found;
    let text = '';
    if (found) {
      const o = found.obj;
      if (found.kind === 'door') text = o.locked ? 'Locked' : `[E] ${o.open > 0.5 ? 'Close' : 'Open'} door`;
      if (found.kind === 'switch') text = `[E] Turn ${o.lightOn ? 'off' : 'on'} the light`;
      if (found.kind === 'item') text = `[E] Pick up ${o.name}`;
      if (found.kind === 'terminal') text = '[E] End investigation and leave';
    }
    this.ui.prompt(text);
    const h = this.items.held;
    this.ui.hint(h ? `${h.name} — ${h.hint()}   [G] Drop` : this.flashOn ? '[T] Flashlight off' : '[T] Flashlight on');
  }

  updateViewmodel(dt) {
    const cam = this.camera, p = this.player;
    this.vmGroup.position.copy(cam.position);
    this.vmGroup.quaternion.copy(cam.quaternion);
    const h = this.items.held;
    const bob = Math.sin(p.bob * 2) * 0.008 * Math.min(1, p.moving);
    const sway = Math.cos(p.bob) * 0.01 * Math.min(1, p.moving);
    this.torch.visible = !h;
    const anchor = new THREE.Vector3();
    if (h) {
      h.mesh.position.set(h.holdPos.x + sway, h.holdPos.y + bob, h.holdPos.z);
      h.mesh.rotation.copy(h.holdRot);
      anchor.set(h.holdPos.x + sway + 0.01, h.holdPos.y + bob - 0.02, h.holdPos.z + 0.07);
    } else {
      this.torch.position.set(0.2 + sway, -0.22 + bob, -0.4);
      anchor.set(0.21 + sway, -0.235 + bob, -0.34);
    }
    if (!p.alive) anchor.y -= 0.6;
    this.hand.position.copy(anchor);
    const shoulder = new THREE.Vector3(0.36, -0.62, 0.05);
    const mid = anchor.clone().lerp(shoulder, 0.5);
    this.sleeve.position.copy(mid).lerp(anchor, 0.08);
    this.sleeve.lookAt(this.vmGroup.localToWorld(shoulder.clone()));
    this.sleeve.rotateX(Math.PI / 2);
    this.cuff.position.copy(anchor).lerp(shoulder, 0.1);
    this.cuff.quaternion.copy(this.sleeve.quaternion);
    // viewmodel brightness follows the local lighting
    const room = this.level.rooms[p.room];
    const lit = (room && room.lightOn) || this.level.inVan(p.pos);
    this.vmAmbient.intensity = (lit ? 1.1 : 0.12) + (this.flashlight.intensity > 0 ? 0.35 : 0) + (this.nv ? 1.5 : 0);
  }

  // ---------------------------------------------------------------- van screens
  drawMonitors() {
    const L = this.level;
    const font = (w, s) => `${w} ${s}px Orbitron, 'Segoe UI', sans-serif`;
    const frame = (ctx, w, h, title) => {
      ctx.fillStyle = '#050608';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#d8dde6';
      ctx.lineWidth = 2;
      ctx.fillStyle = '#eef2f8';
      ctx.font = font(700, 26);
      ctx.textAlign = 'center';
      ctx.fillText(title, w / 2, 38);
      ctx.beginPath();
      ctx.moveTo(w / 2 - 150, 48);
      ctx.lineTo(w / 2 + 150, 48);
      ctx.stroke();
    };
    // total activity: red step graph
    {
      const { ctx, tex } = L.activityMon;
      frame(ctx, 512, 300, 'Total Activity');
      const x0 = 70, y0 = 250, w = 410, h = 170;
      ctx.strokeStyle = '#ddd';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x0, y0 - h);
      ctx.lineTo(x0, y0);
      ctx.lineTo(x0 + w, y0);
      ctx.stroke();
      ctx.font = font(500, 11);
      ctx.fillStyle = '#ccc';
      ctx.textAlign = 'right';
      for (let i = 0; i <= 10; i += 2) ctx.fillText(String(i), x0 - 6, y0 - (i / 10) * h + 4);
      ctx.save();
      ctx.translate(26, y0 - h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillText('Strength', 0, 0);
      ctx.restore();
      ctx.textAlign = 'center';
      ctx.fillText('Time in seconds', x0 + w / 2, y0 + 30);
      ctx.strokeStyle = '#ff3a2a';
      ctx.shadowColor = '#ff2a1a';
      ctx.shadowBlur = 8;
      ctx.lineWidth = 3;
      ctx.beginPath();
      this.activity.forEach((v, i) => {
        const x = x0 + (i / (this.activity.length - 1)) * w;
        const y = y0 - (v / 10) * h;
        if (i === 0) ctx.moveTo(x, y);
        else {
          ctx.lineTo(x, y0 - (this.activity[i - 1] / 10) * h);
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
      ctx.shadowBlur = 0;
      tex.needsUpdate = true;
    }
    // sanity
    {
      const { ctx, tex } = L.monitor;
      frame(ctx, 512, 300, 'Team Sanity');
      const s = Math.round(this.sanity);
      ctx.fillStyle = '#eee';
      ctx.font = font(500, 22);
      ctx.textAlign = 'right';
      ctx.fillText('You', 250, 140);
      ctx.strokeStyle = '#ff3a2a';
      ctx.shadowColor = '#ff2a1a';
      ctx.shadowBlur = 10;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(320, 132, 46, 30, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(320, 104);
      ctx.bezierCurveTo(305, 120, 335, 140, 320, 160);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ff5040';
      ctx.font = font(700, 22);
      ctx.textAlign = 'center';
      ctx.fillText(`${s}%`, 320, 140);
      ctx.font = font(500, 15);
      ctx.fillStyle = this.setupLeft > 0 ? '#9fd8ff' : '#ff8070';
      if (this.setupLeft > 0) {
        const t = Math.ceil(this.setupLeft);
        ctx.fillText(`Setup phase  ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}  — the ghost will not hunt`, 256, 230);
      } else ctx.fillText('Setup over — hunts are possible', 256, 230);
      ctx.fillStyle = '#888';
      ctx.fillText(`${this.diff.name} contract`, 256, 262);
      tex.needsUpdate = true;
    }
    // floor plan
    {
      const { ctx, tex } = L.mapMon;
      ctx.fillStyle = '#050608';
      ctx.fillRect(0, 0, 448, 280);
      const GW = L.GW, GH = L.GH;
      const sc = Math.min(396 / GW, 256 / GH), ox = (448 - GW * sc) / 2, oy = (280 - GH * sc) / 2;
      for (const r of L.rooms) {
        const [x0, z0, x1, z1] = r.rect;
        ctx.fillStyle = '#c8ccd2';
        ctx.fillRect(ox + x0 * sc, oy + z0 * sc, (x1 - x0) * sc, (z1 - z0) * sc);
        ctx.strokeStyle = '#4a4e56';
        ctx.lineWidth = 3;
        ctx.strokeRect(ox + x0 * sc, oy + z0 * sc, (x1 - x0) * sc, (z1 - z0) * sc);
        ctx.fillStyle = '#4a4e56';
        ctx.font = font(500, 10);
        ctx.textAlign = 'center';
        ctx.fillText(r.name, ox + ((x0 + x1) / 2) * sc, oy + ((z0 + z1) / 2) * sc + 4);
      }
      const p = this.player.pos;
      if (p.x > -1 && p.x < GW + 1 && p.z > -1 && p.z < GH + 1) {
        ctx.fillStyle = '#20e060';
        ctx.fillRect(ox + p.x * sc - 5, oy + p.z * sc - 5, 10, 10);
      }
      tex.needsUpdate = true;
    }
    // whiteboard
    {
      const { ctx, tex } = L.whiteboard;
      ctx.fillStyle = '#eceee8';
      ctx.fillRect(0, 0, 512, 300);
      ctx.fillStyle = '#2a2a2a';
      ctx.textAlign = 'center';
      ctx.font = "30px 'Architects Daughter', cursive";
      ctx.fillText('Optional Objectives', 256, 36);
      ctx.textAlign = 'left';
      ctx.font = "15px 'Architects Daughter', cursive";
      const lines = ['Identify the type of ghost haunting this house', ...this.objectives.list.map((o) => OBJECTIVES[o])];
      lines.forEach((t, i) => {
        const y = 70 + i * 24;
        ctx.fillStyle = '#2a2a2a';
        ctx.fillText(`Task ${i + 1}: ${t}`, 22, y);
        if (i > 0 && this.objectives.done.has(this.objectives.list[i - 1])) {
          ctx.strokeStyle = '#1d6a2a';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(18, y - 5);
          ctx.lineTo(22 + ctx.measureText(`Task ${i + 1}: ${t}`).width, y - 5);
          ctx.stroke();
        }
      });
      ctx.fillStyle = '#1d3f8a';
      const para = `Our records say the spirit here was ${this.ghost.name}. It seems to respond to ${this.ghost.respondsTo}. Log every piece of evidence in your journal [J] before you leave.`;
      wrap(ctx, para, 22, 188, 470, 20);
      ctx.fillStyle = '#c02a2a';
      ctx.textAlign = 'center';
      ctx.font = "14px 'Architects Daughter', cursive";
      ctx.fillText('PAY IS CALCULATED WHEN YOU LEAVE', 256, 286);
      tex.needsUpdate = true;
    }
    // laptop
    {
      const { ctx, tex } = L.terminalScreen;
      ctx.fillStyle = '#0a1420';
      ctx.fillRect(0, 0, 256, 160);
      ctx.fillStyle = '#7fd0ff';
      ctx.font = font(700, 18);
      ctx.textAlign = 'center';
      ctx.fillText('WRAITHLINE', 128, 50);
      ctx.font = font(500, 12);
      ctx.fillText('End investigation', 128, 90);
      ctx.fillStyle = '#ff7060';
      ctx.fillText('[E] leave the site', 128, 118);
      tex.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- render
  render() {
    const r = this.renderer;
    r.clear();
    if (this.composer) this.composer.render();
    else r.render(this.scene, this.camera);
    if (this.state !== 'ended') {
      r.clearDepth();
      r.render(this.vmScene, this.camera);
    }
  }

  resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer?.setSize(window.innerWidth, window.innerHeight);
    if (this.camera) {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    }
  }
}

function wrap(ctx, text, x, y, maxW, lh) {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW) {
      ctx.fillText(line, x, y);
      y += lh;
      line = w;
    } else line = t;
  }
  ctx.fillText(line, x, y);
}

window.game = new Game();
