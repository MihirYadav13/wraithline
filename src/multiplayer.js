// Multiplayer sync. Every browser builds the same world from a shared random seed. The host
// simulates the ghost and the house; everyone else applies the host's snapshots and sends their
// own player state and actions. World sounds are relayed so everybody hears them in 3D.
import * as THREE from 'three';
import { Avatar } from './avatar.js';

const SEND_HZ = 15;
const SNAP_HZ = 10;
// audio calls that make a sound in the world (relayed to the other players)
const RELAYED_SOUNDS = ['footstep', 'creak', 'doorClose', 'thud', 'knock', 'whisper', 'moan', 'scream', 'click', 'sizzle', 'scribble', 'buzz', 'tvStatic', 'spiritVoice'];

const r2 = (v) => Math.round(v * 100) / 100;
const vec = (a) => (a && a.__v ? new THREE.Vector3(a.x, a.y, a.z) : a);

// Deterministic Math.random while the world is built, so every player gets the same house,
// ghost, furniture and objectives.
export function withSeed(seed, fn) {
  const orig = Math.random;
  let s = seed >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

export class Multiplayer {
  constructor(game, net) {
    this.game = game;
    this.net = net;
    this.id = net.id;
    this.isHost = net.isHost;
    this.avatars = new Map();
    this.sendT = 0;
    this.snapT = 0;
    this.snap = null;
    this.ghostTarget = new THREE.Vector3();
    this.prevUses = new Map();
    net.players.forEach((p, i) => {
      if (p.id !== this.id) this.avatars.set(p.id, new Avatar(game.scene, p.id, p.name, i));
    });
    net.on('msg', (d, from) => this.onMsg(d, from));
    net.on('left', (id) => this.dropPlayer(id));
    net.on('error', (m, fatal) => fatal && this.game.ui.toast(m, 6000));
    this.wrapAudio();
    this.wrapObjectives();
  }

  send(data, to) {
    this.net.send(data, to);
  }

  get playerCount() {
    return this.avatars.size + 1;
  }

  // ---------------------------------------------------------------- what the ghost can sense
  remoteTargets() {
    const out = [];
    for (const [id, av] of this.avatars) {
      const s = av.state;
      out.push({
        id,
        local: false,
        pos: av.pos,
        eye: av.pos.clone().setY(s.crouch ? 1.05 : 1.6),
        alive: s.alive,
        inHouse: s.inHouse,
        room: s.room,
        crouch: s.crouch,
        electronics: s.electronics,
      });
    }
    return out;
  }

  teamSanities() {
    const list = [];
    if (this.game.player.alive) list.push(this.game.sanity);
    for (const av of this.avatars.values()) if (av.state.alive) list.push(av.state.sanity);
    return list;
  }

  killRemote(id) {
    const av = this.avatars.get(id);
    if (!av || !av.state.alive) return;
    av.state.alive = false;
    this.send({ t: 'kill' }, id);
  }

  dropPlayer(id) {
    const av = this.avatars.get(id);
    if (!av) return;
    this.game.ui.toast(`${av.name} left the investigation.`);
    av.dispose();
    this.avatars.delete(id);
    // anything they were carrying falls where they stood
    if (this.isHost) for (const it of this.game.items.all) if (it.holder === id) this.hostDrop(it, av.pos.clone().setY(0), 0);
  }

  // ---------------------------------------------------------------- relaying sounds and objectives
  wrapAudio() {
    const A = this.game.audio;
    this.playingRemote = false;
    for (const name of RELAYED_SOUNDS) {
      const orig = A[name].bind(A);
      A[name] = (...args) => {
        const out = orig(...args);
        if (!this.playingRemote) {
          const a = args.map((x) => (x && x.isVector3 ? { __v: 1, x: r2(x.x), y: r2(x.y), z: r2(x.z) } : x));
          this.send({ t: 'snd', f: name, a });
        }
        return out;
      };
      A[name].orig = orig;
    }
  }

  wrapObjectives() {
    const O = this.game.objectives;
    const orig = O.complete.bind(O);
    O.complete = (id, fromNet = false) => {
      if (O.done.has(id) || !O.list.includes(id)) return;
      if (this.isHost) {
        orig(id);
        this.send({ t: 'objd', id });
      } else if (fromNet) orig(id);
      else this.send({ t: 'obj', id }, this.net.hostId);
    };
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const g = this.game, p = g.player;
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 1 / SEND_HZ;
      const h = g.items.held;
      this.send({ t: 'p', p: [r2(p.pos.x), r2(p.pos.z)], y: r2(p.yaw), pi: r2(p.pitch), a: p.alive, c: p.crouch, f: g.flashOn, r: p.room, in: p.inHouse, s: Math.round(g.sanity), e: g.items.electronicsActive(), h: h ? h.type : null });
    }
    for (const av of this.avatars.values()) av.update(dt);
    if (this.isHost) {
      this.snapT -= dt;
      if (this.snapT <= 0) {
        this.snapT = 1 / SNAP_HZ;
        this.send(this.snapshot());
      }
      // everyone dead: the contract ends for the team
      if (!p.alive && ![...this.avatars.values()].some((a) => a.state.alive) && !this.ending) {
        this.ending = true;
        setTimeout(() => this.endContract(null, 'The whole team was lost.'), 4000);
      }
    } else this.applyGhost(dt);
  }

  // ---------------------------------------------------------------- host -> everyone
  snapshot() {
    const g = this.game, gh = g.ghost, L = g.level;
    return {
      t: 'w',
      g: [r2(gh.pos.x), r2(gh.pos.z), r2(gh.model.rotation.y), gh.model.visible ? 1 : 0, gh.huntPhase === 'chase' ? 2 : gh.huntPhase === 'grace' ? 1 : 0, gh.eventT > 0 ? 1 : 0],
      tg: gh.target ? gh.target.id : null,
      d: L.doors.map((d) => [r2(d.target), d.locked ? 1 : 0, d.slam ? 1 : 0]),
      l: L.rooms.map((r) => (r.lightOn ? 1 : 0) | (r.flicker > 0 ? 2 : 0)),
      tm: L.rooms.map((r) => r2(r.temp)),
      th: L.throwables.map((t) => { const m = t.mesh; return [r2(m.position.x), r2(m.position.y), r2(m.position.z), r2(m.rotation.x), r2(m.rotation.z)]; }),
      it: g.items.all.map((it) => [it.gone ? -1 : it.holder || 0, r2(it.mesh.position.x), r2(it.mesh.position.y), r2(it.mesh.position.z), r2(it.mesh.rotation.y), it.written ? 1 : 0, it.uses ?? 0, it.lit ? 1 : 0, it.used ? 1 : 0]),
      emf: g.emfSources.map((s) => [r2(s.pos.x), r2(s.pos.y), r2(s.pos.z), s.level, r2(s.t)]),
      su: Math.round(g.setupLeft),
      ac: r2(gh.activityLevel),
      tv: L.tv && L.tv.on ? 1 : 0,
    };
  }

  // ---------------------------------------------------------------- clients apply the host's world
  applySnapshot(s) {
    const g = this.game, L = g.level, gh = g.ghost;
    this.snap = s;
    this.ghostTarget.set(s.g[0], 0, s.g[1]);
    gh.model.visible = !!s.g[3];
    gh.model.rotation.y = s.g[2];
    gh.eventT = s.g[5] ? 1 : 0;
    const phase = [null, 'grace', 'chase'][s.g[4]];
    if (phase !== gh.huntPhase) {
      if (phase === 'chase') gh.voice = g.audio.huntVoice(gh.headPos());
      else if (gh.voice) {
        gh.voice.stop();
        gh.voice = null;
      }
    }
    gh.huntPhase = phase;
    gh.hunting = !!phase;
    gh.target = s.tg === this.id ? g.localTarget() : null;
    s.d.forEach(([target, locked, slam], i) => {
      const d = L.doors[i];
      d.target = target;
      d.locked = !!locked;
      if (slam) d.slam = true;
    });
    s.l.forEach((v, i) => {
      const r = L.rooms[i];
      if (r.lightOn !== !!(v & 1)) L.setLight(r, !!(v & 1));
      if (v & 2 && r.flicker <= 0) r.flicker = 0.3;
    });
    s.tm.forEach((t, i) => (L.rooms[i].temp = t));
    s.th.forEach(([x, y, z, rx, rz], i) => {
      const m = L.throwables[i].mesh;
      m.position.set(x, y, z);
      m.rotation.x = rx;
      m.rotation.z = rz;
    });
    s.it.forEach((row, i) => this.applyItem(g.items.all[i], row));
    g.emfSources = s.emf.map(([x, y, z, level, t]) => ({ pos: new THREE.Vector3(x, y, z), level, t }));
    g.setupLeft = s.su;
    gh.activityLevel = s.ac;
    if (s.tv && L.tv && !L.tv.on) g.tvOn(5, true);
  }

  applyItem(it, [holder, x, y, z, ry, written, uses, lit, used]) {
    const g = this.game;
    if (holder === -1) {
      if (!it.gone) g.items.consume(it);
      return;
    }
    if (it.held) return; // my own hands are authoritative for what I hold
    const elsewhere = holder && holder !== this.id;
    it.holder = holder || null;
    if (elsewhere) {
      it.mesh.visible = false;
    } else {
      it.mesh.visible = true;
      if (!it.falling) {
        it.mesh.position.set(x, y, z);
        it.mesh.rotation.y = ry;
      }
    }
    if (written && !it.written) it.write(true);
    if (it.type === 'crucifix' && uses < it.uses) it.burn(true);
    if (it.type === 'incense') {
      it.lit = !!lit;
      it.used = !!used;
    }
  }

  applyGhost(dt) {
    const gh = this.game.ghost;
    if (!this.snap) return;
    gh.pos.lerp(this.ghostTarget, Math.min(1, dt * 8));
    gh.model.position.set(gh.pos.x, 0, gh.pos.z);
    const armUp = gh.huntPhase === 'chase' ? -1.25 : 0;
    for (const a of gh.model.userData.arms) a.rotation.x += (armUp - a.rotation.x) * Math.min(1, dt * 5);
    if (gh.voice) gh.voice.update(dt, gh.headPos(), this.game.audio.occlusion(gh.headPos()));
    for (const o of gh.orbs) {
      const u = o.userData;
      u.ph += dt * 0.3;
      o.position.set(u.base.x + Math.sin(u.ph) * 0.6, u.base.y + Math.sin(u.ph * 1.7) * 0.25, u.base.z + Math.cos(u.ph * 0.8) * 0.6);
    }
  }

  // ---------------------------------------------------------------- actions (client -> host)
  requestPickup(it) {
    this.send({ t: 'pick', i: it.uid }, this.net.hostId);
  }

  hostPickup(it, who) {
    if (it.gone || (it.holder && it.holder !== who) || (it.held && who !== this.id)) return false;
    it.holder = who;
    if (who !== this.id) {
      it.mesh.visible = false;
      it.falling = false;
    }
    return true;
  }

  hostDrop(it, pos, ry) {
    it.holder = null;
    it.mesh.visible = true;
    it.mesh.position.copy(pos);
    it.mesh.rotation.set(0, ry, 0);
    if (!it.mesh.parent) this.game.scene.add(it.mesh);
  }

  onMsg(d, from) {
    const g = this.game;
    switch (d.t) {
      case 'p': {
        const av = this.avatars.get(from);
        if (!av) return;
        av.apply(d);
        av.setHeld(d.h, (type) => g.items.all.find((i) => i.type === type));
        break;
      }
      case 'w':
        if (!this.isHost) this.applySnapshot(d);
        break;
      case 'snd': {
        const f = g.audio[d.f];
        if (!f) return;
        this.playingRemote = true;
        try {
          (f.orig || f)(...d.a.map(vec));
        } finally {
          this.playingRemote = false;
        }
        break;
      }
      case 'drain':
        g.drainSanity(d.n);
        break;
      case 'kill':
        if (g.player.alive) g.killPlayer(g.ghost);
        break;
      case 'obj':
        if (this.isHost) g.objectives.complete(d.id);
        break;
      case 'objd':
        g.objectives.complete(d.id, true);
        break;
      case 'print':
        g.placePrint(d.desc);
        break;
      // ---- host handles requests from clients
      case 'pick': {
        if (!this.isHost) return;
        const it = g.items.all[d.i];
        if (this.hostPickup(it, from)) this.send({ t: 'grant', i: d.i }, from);
        else this.send({ t: 'deny', i: d.i }, from);
        break;
      }
      case 'grant':
        g.items.pickup(g.items.all[d.i], true);
        break;
      case 'deny':
        g.ui.toast('Someone else picked that up.');
        break;
      case 'drop':
        if (this.isHost) this.hostDrop(g.items.all[d.i], new THREE.Vector3(...d.p), d.ry);
        break;
      case 'door':
        if (this.isHost) {
          const door = g.level.doors[d.i];
          if (!door.locked) door.target = d.v;
        }
        break;
      case 'light':
        if (this.isHost) g.level.setLight(g.level.rooms[d.i], d.v);
        break;
      case 'itemState':
        // a client toggled / used something the host simulates (incense effect, consumed pills)
        if (this.isHost) this.hostItemState(g.items.all[d.i], d, from);
        break;
      case 'end':
        g.finish(false, false, d);
        break;
      case 'endreq':
        if (this.isHost) this.endContract(d.guess, `${this.net.nameOf(from)} ended the investigation.`);
        break;
    }
  }

  hostItemState(it, d, from) {
    const g = this.game, gh = g.ghost;
    if (d.gone) {
      it.holder = null;
      g.items.consume(it);
      return;
    }
    if (d.incense) {
      it.lit = true;
      it.burnT = 7;
      const av = this.avatars.get(from);
      const at = av ? av.pos : it.mesh.position;
      if (gh.pos.distanceTo(new THREE.Vector3(at.x, 0, at.z)) < 5) {
        if (gh.hunting) {
          gh.blind = 6;
          gh.lastKnown = null;
          gh.path = [];
        } else {
          gh.incenseBlock = gh.type.incenseBlock;
          g.objectives.complete('incense');
        }
      }
    }
  }

  // host: end the contract for everyone, using the ending player's journal answer
  endContract(guess, reason) {
    const g = this.game;
    const data = { t: 'end', guess: guess ?? g.ui.guessType?.name ?? null, reason };
    this.send(data);
    g.finish(!g.player.alive, false, data);
  }
}
