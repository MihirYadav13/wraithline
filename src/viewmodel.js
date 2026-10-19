// First-person arm, hand and flashlight. The hand is a gripping fist whose fingers wrap around
// whatever is held; the forearm runs from the wrist down to the bottom-right of the screen.
import * as THREE from 'three';
import { mesh, std } from './util.js';

const SKIN = std(0xc9957a, 0.6);
const SLEEVE = std(0x26303c, 0.95);
const CUFF = std(0x161c24, 0.9);
const UP = new THREE.Vector3(0, 1, 0);
const QX90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

// Grip used for the always-carried flashlight (handle runs along local z).
export const TORCH_GRIP = { pos: [0, 0, 0.045], axis: 'z', r: 0.022 };

// A fist closed around a cylinder of radius r whose axis is the hand's local z.
function buildFist(r) {
  const g = new THREE.Group();
  const tube = 0.0095;
  const ringR = r + tube * 0.9;
  for (let i = 0; i < 4; i++) {
    // each finger is a partial torus wrapping over the top and around the far side of the handle
    const f = mesh(new THREE.TorusGeometry(ringR, tube * (i === 3 ? 0.85 : 1), 8, 14, Math.PI * 1.25), SKIN);
    f.rotation.z = -Math.PI * 0.35;
    f.position.z = -0.028 + i * 0.019;
    g.add(f);
    const tip = mesh(new THREE.SphereGeometry(tube * 1.05, 8, 6), SKIN);
    const a = -Math.PI * 0.35 + Math.PI * 1.25;
    tip.position.set(Math.cos(a) * ringR, Math.sin(a) * ringR, f.position.z);
    g.add(tip);
  }
  // palm and back of the hand sit on the right side of the handle
  const palm = mesh(new THREE.SphereGeometry(1, 16, 12), SKIN, ringR + 0.01, -0.004, 0.0);
  palm.scale.set(0.022, 0.034, 0.05);
  g.add(palm);
  // thumb lies along the top-left of the handle
  const thumb = mesh(new THREE.CapsuleGeometry(0.0095, 0.035, 4, 8), SKIN, -ringR * 0.35, ringR + 0.004, -0.012);
  thumb.rotation.x = Math.PI / 2;
  thumb.rotation.y = 0.25;
  g.add(thumb);
  g.traverse((o) => (o.castShadow = false));
  return g;
}

export class ViewModel {
  constructor(vmGroup) {
    this.group = vmGroup;
    this.fists = new Map();
    this.fist = null;
    this.forearm = mesh(new THREE.CylinderGeometry(0.033, 0.04, 1, 14), SLEEVE);
    this.cuff = mesh(new THREE.CylinderGeometry(0.031, 0.034, 0.035, 14), CUFF);
    this.wrist = mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.05, 12), SKIN);
    vmGroup.add(this.forearm, this.cuff, this.wrist);
    // flashlight: knurled body, flared head, glowing lens
    this.torch = new THREE.Group();
    // gunmetal rather than black so it still reads against a dark night sky
    const dark = std(0x4a4d52, 0.38, { metalness: 0.55 });
    const body = mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.17, 16), dark, 0, 0, 0.02);
    body.rotation.x = Math.PI / 2;
    const head = mesh(new THREE.CylinderGeometry(0.029, 0.02, 0.055, 18), dark, 0, 0, -0.088);
    head.rotation.x = Math.PI / 2;
    this.lensMat = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xeef2ff, emissiveIntensity: 0 });
    const lens = mesh(new THREE.CircleGeometry(0.025, 18), this.lensMat, 0, 0, -0.116);
    lens.rotation.y = Math.PI;
    const tail = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.012, 14), std(0x6a1a1a, 0.6), 0, 0, 0.11);
    tail.rotation.x = Math.PI / 2;
    this.torch.add(body, head, lens, tail);
    vmGroup.add(this.torch);
    this.tmp = new THREE.Vector3();
  }

  fistFor(r) {
    const key = r.toFixed(3);
    if (!this.fists.has(key)) {
      const f = buildFist(r);
      f.visible = false;
      this.group.add(f);
      this.fists.set(key, f);
    }
    return this.fists.get(key);
  }

  // holder: the held object's root (in vmGroup space); grip: where/how it is held
  update(holder, grip, alive) {
    const fist = this.fistFor(grip.r);
    if (fist !== this.fist) {
      if (this.fist) this.fist.visible = false;
      fist.visible = true;
      this.fist = fist;
    }
    holder.updateMatrix();
    fist.position.set(...grip.pos).applyMatrix4(holder.matrix);
    fist.quaternion.copy(holder.quaternion);
    if (grip.axis === 'y') fist.quaternion.multiply(QX90);
    if (!alive) fist.position.y -= 0.6;
    // the wrist sits behind the palm; the forearm runs from it to the bottom-right corner
    const back = new THREE.Vector3(grip.r + 0.03, -0.012, 0.055).applyQuaternion(fist.quaternion);
    const wrist = fist.position.clone().add(back);
    const elbow = new THREE.Vector3(0.42, -0.72, 0.32);
    if (!alive) elbow.y -= 0.6;
    const dir = elbow.clone().sub(wrist);
    const len = dir.length();
    dir.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir);
    this.wrist.position.copy(wrist).addScaledVector(dir, 0.0);
    this.wrist.quaternion.copy(q);
    this.cuff.position.copy(wrist).addScaledVector(dir, 0.04);
    this.cuff.quaternion.copy(q);
    this.forearm.position.copy(wrist).addScaledVector(dir, 0.05 + len / 2);
    this.forearm.quaternion.copy(q);
    this.forearm.scale.y = len;
  }
}
