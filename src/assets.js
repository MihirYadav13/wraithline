// Loads the CC0 Poly Haven textures and models in public/assets (see public/assets/CREDITS.md).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptSimplifier } from 'meshoptimizer';

// Scanned props are very dense (the chest alone is 100k triangles). Integrated GPUs choke on that,
// so meshes are simplified at load time to roughly this many triangles each.
const MAX_TRIS = 6000;
// small props never need to cast the flashlight's shadow
const NO_SHADOW = new Set(['Lantern_01', 'vintage_oil_lamp', 'mantel_clock_01', 'ceramic_vase_01', 'hanging_picture_frame_01']);

function simplify(geo) {
  if (!geo.index) return;
  const triCount = geo.index.count / 3;
  if (triCount <= MAX_TRIS) return;
  const pos = geo.attributes.position;
  const p = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) for (let k = 0; k < 3; k++) p[i * 3 + k] = pos.getComponent(i, k);
  const idx = new Uint32Array(geo.index.array);
  const [out] = MeshoptSimplifier.simplify(idx, p, 3, MAX_TRIS * 3, 0.02, ['LockBorder']);
  geo.setIndex(new THREE.BufferAttribute(out, 1));
}

export const TEXTURES = ['wood_plank_wall', 'weathered_planks', 'old_wood_floor', 'plank_flooring_02', 'painted_plaster_wall', 'white_plaster_rough_01', 'decrepit_wallpaper', 'dirty_tiles', 'brown_mud_leaves_01', 'weathered_plank_siding', 'concrete_floor_worn_001'];

export const MODELS = ['old_bed_frame', 'treasure_chest', 'barrel_stove', 'vintage_oil_lamp', 'Lantern_01', 'vintage_grandfather_clock_01', 'wheelchair_01', 'GothicBed_01', 'GothicCabinet_01', 'Sofa_01', 'ArmChair_01', 'Rockingchair_01', 'WoodenChair_01', 'WoodenTable_01', 'CoffeeTable_01', 'wooden_bookshelf_worn', 'vintage_cabinet_01', 'drawer_cabinet', 'dining_table', 'dining_chair_02', 'side_table_01', 'hanging_picture_frame_01', 'mantel_clock_01', 'wooden_crate_01', 'industrial_wall_lamp', 'street_lamp_01', 'ceramic_vase_01', 'vintage_wooden_drawer_01'];

export class Assets {
  constructor(renderer) {
    this.maxAniso = renderer.capabilities.getMaxAnisotropy();
    this.texLoader = new THREE.TextureLoader();
    this.gltf = new GLTFLoader();
    this.models = {};
    this.texCache = {};
  }

  async load(onProgress = () => {}) {
    if (this.loaded) return;
    await MeshoptSimplifier.ready;
    const jobs = [];
    let done = 0;
    const total = TEXTURES.length * 3 + MODELS.length;
    const tick = () => onProgress(++done / total);
    for (const id of TEXTURES) {
      for (const k of ['diff', 'nor', 'rough']) {
        jobs.push(
          this.texLoader.loadAsync(`/assets/textures/${id}/${k}.jpg`).then((t) => {
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.anisotropy = Math.min(8, this.maxAniso);
            if (k === 'diff') t.colorSpace = THREE.SRGBColorSpace;
            (this.texCache[id] ||= {})[k] = t;
            tick();
          })
        );
      }
    }
    for (const id of MODELS) {
      jobs.push(
        this.gltf.loadAsync(`/assets/models/${id}/${id}.gltf`).then((g) => {
          g.scene.traverse((o) => {
            if (o.isMesh) {
              simplify(o.geometry);
              o.castShadow = !NO_SHADOW.has(id);
              o.receiveShadow = true;
            }
          });
          this.models[id] = g.scene;
          tick();
        })
      );
    }
    await Promise.all(jobs);
    this.loaded = true;
  }

  // A tiling PBR material. UVs in the game are in meters, so `meters` is the size of one tile.
  material(id, meters = 2, { color = 0xffffff, roughness = 1, normalScale = 1 } = {}) {
    const src = this.texCache[id];
    const rep = (t) => {
      const c = t.clone();
      c.repeat.set(1 / meters, 1 / meters);
      c.needsUpdate = true;
      return c;
    };
    return new THREE.MeshStandardMaterial({
      map: rep(src.diff),
      normalMap: rep(src.nor),
      roughnessMap: rep(src.rough),
      normalScale: new THREE.Vector2(normalScale, normalScale),
      roughness,
      color,
    });
  }

  // A fresh copy of a model. Geometry and materials are shared between copies.
  model(id) {
    return this.models[id].clone(true);
  }
}
