// Other investigators in multiplayer: a simple jointed character with a chest flashlight,
// a name tag and whatever item they are holding. Smoothly follows network updates.
import * as THREE from 'three';
import { mesh, std, canvasTex } from './util.js';

const JACKETS = [0x7a3a24, 0x2f4a6a, 0x3f5a2e, 0x5a3a6a];
const SKINS = [0xc9957a, 0xa8775a, 0xe0b496, 0x8a5a40];

function nameTag(name) {
  const t = canvasTex(256, 64);
  t.ctx.font = '600 30px Orbitron, sans-serif';
  t.ctx.textAlign = 'center';
  t.ctx.fillStyle = 'rgba(0,0,0,0.45)';
  t.ctx.fillRect(0, 8, 256, 48);
  t.ctx.fillStyle = '#f0f0f0';
  t.ctx.fillText(name, 128, 44);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t.tex, depthWrite: false, transparent: true }));
  s.scale.set(0.9, 0.225, 1);
  return s;
}

export class Avatar {
  constructor(scene, id, name, index) {
    this.id = id;
    this.name = name;
    const g = (this.root = new THREE.Group());
    const jacket = std(JACKETS[index % 4], 0.9);
    const pants = std(0x1e2228, 0.95);
    const skin = std(SKINS[index % 4], 0.6);
    const boots = std(0x141210, 0.8);
    // torso + hips
    this.body = new THREE.Group();
    this.body.position.y = 0.95;
    g.add(this.body);
    this.body.add(mesh(new THREE.CapsuleGeometry(0.19, 0.38, 6, 12), jacket, 0, 0.32, 0));
    this.body.add(mesh(new THREE.CylinderGeometry(0.17, 0.16, 0.18, 12), pants, 0, 0.0, 0));
    // head, hair and cap
    this.head = new THREE.Group();
    this.head.position.y = 0.78;
    this.body.add(this.head);
    this.head.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 10), skin, 0, -0.06, 0));
    const skull = mesh(new THREE.SphereGeometry(0.11, 18, 14), skin, 0, 0.06, 0);
    skull.scale.set(0.9, 1.08, 1);
    this.head.add(skull);
    const cap = mesh(new THREE.SphereGeometry(0.115, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(0x1a1a1c, 0.8), 0, 0.08, 0);
    this.head.add(cap);
    const brim = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 16, 1, false, -Math.PI / 2, Math.PI), std(0x1a1a1c, 0.8), 0, 0.085, 0.07);
    this.head.add(brim);
    for (const s of [-1, 1]) this.head.add(mesh(new THREE.SphereGeometry(0.012, 6, 5), std(0x111111, 0.3), s * 0.035, 0.07, 0.098));
    // chest-mounted flashlight with its own beam
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xeef2ff, emissiveIntensity: 0 });
    this.lampMat = lampMat;
    const lamp = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 12), std(0x222222, 0.5), 0.07, 0.48, 0.2);
    lamp.rotation.x = Math.PI / 2;
    this.body.add(lamp);
    this.body.add(mesh(new THREE.CircleGeometry(0.026, 12), lampMat, 0.07, 0.48, 0.226));
    this.beam = new THREE.SpotLight(0xe4ecff, 0, 14, 0.42, 0.5, 1.4);
    this.beam.position.set(0.07, 0.48, 0.25);
    this.beam.target.position.set(0.07, 0.2, 3);
    this.body.add(this.beam, this.beam.target);
    // limbs: pivot groups at shoulders and hips
    const limb = (x, y, len, r, mat, handMat) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      const seg = mesh(new THREE.CapsuleGeometry(r, len - r * 2, 4, 8), mat, 0, -len / 2, 0);
      pivot.add(seg);
      if (handMat) pivot.add(mesh(new THREE.SphereGeometry(r * 0.95, 8, 6), handMat, 0, -len, 0));
      return pivot;
    };
    this.armL = limb(-0.25, 0.6, 0.58, 0.055, jacket, skin);
    this.armR = limb(0.25, 0.6, 0.58, 0.055, jacket, skin);
    this.body.add(this.armL, this.armR);
    this.legL = limb(-0.09, 0.0, 0.92, 0.075, pants, boots);
    this.legR = limb(0.09, 0.0, 0.92, 0.075, pants, boots);
    this.body.add(this.legL, this.legR);
    this.hand = new THREE.Group();
    this.hand.position.set(0, -0.6, 0.05);
    this.armR.add(this.hand);
    this.tag = nameTag(name);
    this.tag.position.y = 2.05;
    g.add(this.tag);
    g.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.userData.avatar = id;
      }
    });
    scene.add(g);
    this.pos = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.yaw = 0;
    this.targetYaw = 0;
    this.pitch = 0;
    this.walk = 0;
    this.speed = 0;
    this.heldType = null;
    this.stepAcc = 0;
    this.state = { alive: true, crouch: false, flash: true, room: -1, inHouse: false, sanity: 100, electronics: false };
    this.first = true;
  }

  apply(s) {
    this.target.set(s.p[0], 0, s.p[1]);
    this.targetYaw = s.y;
    this.pitch = s.pi;
    Object.assign(this.state, { alive: s.a, crouch: s.c, flash: s.f, room: s.r, inHouse: s.in, sanity: s.s, electronics: s.e });
    if (this.first) {
      this.pos.copy(this.target);
      this.yaw = this.targetYaw;
      this.first = false;
    }
  }

  setHeld(type, itemsByType) {
    if (type === this.heldType) return;
    this.heldType = type;
    this.hand.clear();
    const src = type && itemsByType(type);
    if (src) {
      const c = src.mesh.clone(true);
      c.position.set(0, 0, 0);
      c.rotation.set(-Math.PI / 2, 0, 0);
      c.visible = true;
      this.hand.add(c);
    }
  }

  // returns true when a footstep should play this frame
  update(dt) {
    const before = this.pos.clone();
    this.pos.lerp(this.target, Math.min(1, dt * 10));
    let dy = this.targetYaw - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * Math.min(1, dt * 10);
    const moved = before.distanceTo(this.pos);
    this.speed += (moved / Math.max(dt, 1e-3) - this.speed) * Math.min(1, dt * 8);
    const st = this.state;
    this.root.visible = st.alive; // dead investigators are spirits — the living can't see them
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw + Math.PI;
    const crouch = st.crouch ? 0.32 : 0;
    this.body.position.y += (0.95 - crouch - this.body.position.y) * Math.min(1, dt * 8);
    this.legL.rotation.x = this.legR.rotation.x = 0;
    if (st.crouch) {
      this.legL.rotation.x = this.legR.rotation.x = -0.9;
    }
    this.walk += this.speed * dt * 4.2;
    const swing = Math.min(1, this.speed / 1.6) * 0.6;
    this.legL.rotation.x += Math.sin(this.walk) * swing;
    this.legR.rotation.x -= Math.sin(this.walk) * swing;
    this.armL.rotation.x = -Math.sin(this.walk) * swing * 0.8;
    this.armR.rotation.x = this.heldType ? -1.1 : Math.sin(this.walk) * swing * 0.8;
    this.head.rotation.x = -this.pitch * 0.6;
    const on = st.flash && st.alive;
    this.beam.intensity = on ? 14 : 0;
    this.lampMat.emissiveIntensity = on ? 3 : 0;
    this.stepAcc += moved;
    if (this.stepAcc > (st.crouch ? 0.5 : 0.64)) {
      this.stepAcc = 0;
      return st.alive;
    }
    return false;
  }

  dispose() {
    this.root.parent?.remove(this.root);
  }
}
