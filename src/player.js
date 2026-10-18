// First-person investigator: movement, collision, head-bob and footsteps.
import * as THREE from 'three';
import { clamp, circleVsBox } from './util.js';

const SURFACE = { wood: 'wood', wood2: 'wood', carpet: 'carpet', carpetBlue: 'carpet', tile: 'tile', checker: 'tile' };

export class Player {
  constructor(camera, level) {
    this.camera = camera;
    this.level = level;
    this.pos = new THREE.Vector3(6, 0, 21.4);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.radius = 0.28;
    this.eye = 1.65;
    this.crouch = false;
    this.stamina = 1;
    this.bob = 0;
    this.stepDist = 0;
    this.keys = {};
    this.alive = true;
    this.sensitivity = 1;
    this.footY = 0;
    this.moving = 0;
    camera.rotation.order = 'YXZ';
  }

  get room() {
    return this.level.roomAt(this.pos.x, this.pos.z);
  }

  get inHouse() {
    return this.level.isInside(this.pos.x, this.pos.z);
  }

  look(dx, dy) {
    if (!this.alive) return;
    const s = 0.0022 * this.sensitivity;
    this.yaw -= dx * s;
    this.pitch = clamp(this.pitch - dy * s, -1.45, 1.45);
  }

  update(dt, audio) {
    const k = this.keys;
    let fx = 0, fz = 0;
    if (this.alive) {
      if (k.KeyW) fz -= 1;
      if (k.KeyS) fz += 1;
      if (k.KeyA) fx -= 1;
      if (k.KeyD) fx += 1;
    }
    const len = Math.hypot(fx, fz);
    if (len) {
      fx /= len;
      fz /= len;
    }
    const sprint = (k.ShiftLeft || k.ShiftRight) && fz < 0 && this.stamina > 0.02 && !this.crouch && len > 0;
    if (sprint) this.stamina = Math.max(0, this.stamina - dt / 3.2);
    else this.stamina = Math.min(1, this.stamina + dt / 5);
    const speed = this.crouch ? 0.95 : sprint ? 3.1 : 1.65;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const tx = (fx * c + fz * s) * speed;
    const tz = (-fx * s + fz * c) * speed;
    const a = Math.min(1, dt * 12);
    this.vel.x += (tx - this.vel.x) * a;
    this.vel.z += (tz - this.vel.z) * a;

    const cols = this.level.getColliders();
    this.pos.x += this.vel.x * dt;
    this.resolve(cols);
    this.pos.z += this.vel.z * dt;
    this.resolve(cols);

    // floor height (the van floor is raised)
    const fy = this.level.floorAt(this.pos.x, this.pos.z);
    this.footY += (fy - this.footY) * Math.min(1, dt * 14);

    const targetEye = this.alive ? (this.crouch ? 1.05 : 1.65) : 0.5;
    this.eye += (targetEye - this.eye) * Math.min(1, dt * 8);
    const moving = Math.hypot(this.vel.x, this.vel.z);
    this.moving = moving;
    this.bob += moving * dt * 3.6;
    const bobY = Math.sin(this.bob * 2) * 0.028 * Math.min(1, moving / 1.5);
    const bobX = Math.cos(this.bob) * 0.018 * Math.min(1, moving / 1.5);

    this.stepDist += moving * dt;
    const stride = sprint ? 0.78 : this.crouch ? 0.5 : 0.64;
    if (this.stepDist > stride) {
      this.stepDist = 0;
      const room = this.room;
      let surf = room >= 0 ? SURFACE[this.level.rooms[room].floor] : this.level.inVan(this.pos) ? 'tile' : 'grass';
      audio.footstep(new THREE.Vector3(this.pos.x, this.footY + 0.05, this.pos.z), surf, this.crouch ? 0.15 : sprint ? 0.5 : 0.3);
    }

    const cam = this.camera;
    cam.position.set(this.pos.x + bobX * Math.cos(this.yaw), this.footY + this.eye + bobY, this.pos.z - bobX * Math.sin(this.yaw));
    cam.rotation.set(this.pitch, this.yaw, 0);
  }

  resolve(cols) {
    for (let i = 0; i < 2; i++) {
      for (const b of cols) {
        const p = circleVsBox(this.pos.x, this.pos.z, this.radius, b);
        if (p) {
          this.pos.x += p[0];
          this.pos.z += p[1];
        }
      }
    }
  }
}
