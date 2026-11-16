import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Box, MapDef, MaterialId } from '@kinetic/shared';
import { gridTexture, type GridStyle } from './textures';

const MATERIALS: Record<MaterialId, { style: GridStyle; tile: number; roughness: number; metalness: number }> = {
  floor: { style: { base: '#3b4049', minor: '#464c57', major: '#5d6574', divisions: 4 }, tile: 4, roughness: 0.9, metalness: 0 },
  wall: { style: { base: '#2c3850', minor: '#35435f', major: '#4b5f85', divisions: 2 }, tile: 4, roughness: 0.85, metalness: 0 },
  concrete: { style: { base: '#73777f', minor: '#7e838c', major: '#8f959f', divisions: 2 }, tile: 2, roughness: 0.95, metalness: 0 },
  crate: { style: { base: '#b07431', minor: '#93601f', major: '#6b4310', divisions: 4, noise: 0.08 }, tile: 2, roughness: 0.8, metalness: 0 },
  container: { style: { base: '#8a3030', minor: '#762525', major: '#561818', divisions: 8 }, tile: 2.6, roughness: 0.6, metalness: 0.3 },
  metal: { style: { base: '#4d545e', minor: '#58606b', major: '#6d7785', divisions: 4 }, tile: 1, roughness: 0.55, metalness: 0.4 },
  accent: { style: { base: '#e0a526', minor: '#c98f17', major: '#a6750f', divisions: 2 }, tile: 1, roughness: 0.6, metalness: 0.1 },
};

/** Box geometry with world-space UVs so textures keep a consistent scale. */
function boxGeometry(b: Box, tile: number): THREE.BufferGeometry {
  const w = b.max.x - b.min.x;
  const h = b.max.y - b.min.y;
  const d = b.max.z - b.min.z;
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    let u: number;
    let v: number;
    if (nx > 0.5) {
      u = pos.getZ(i);
      v = pos.getY(i);
    } else if (ny > 0.5) {
      u = pos.getX(i);
      v = pos.getZ(i);
    } else {
      u = pos.getX(i);
      v = pos.getY(i);
    }
    uv.setXY(i, u / tile, v / tile);
  }
  return g;
}

/** Everything rendered for one map; replaced wholesale when the map changes. */
export class WorldView {
  readonly group = new THREE.Group();
  private padMats: THREE.MeshBasicMaterial[] = [];
  private time = 0;

  constructor(
    private scene: THREE.Scene,
    readonly map: MapDef,
  ) {
    const theme = map.theme;
    const groups = new Map<MaterialId, THREE.BufferGeometry[]>();
    for (const b of map.boxes) {
      if (!groups.has(b.mat)) groups.set(b.mat, []);
      groups.get(b.mat)!.push(boxGeometry(b, MATERIALS[b.mat].tile));
    }
    for (const [id, geos] of groups) {
      const m = MATERIALS[id];
      const merged = mergeGeometries(geos);
      geos.forEach((g) => g.dispose());
      const colors = theme.palette?.[id];
      const style = colors ? { ...m.style, ...colors } : m.style;
      const mat = new THREE.MeshStandardMaterial({ map: gridTexture(style), roughness: m.roughness, metalness: m.metalness });
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = id !== 'floor';
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }

    // Jump pads: glowing plates with a chevron pointing where they launch you
    for (const p of map.pads) {
      const w = p.max.x - p.min.x;
      const d = p.max.z - p.min.z;
      const mat = new THREE.MeshBasicMaterial({ color: '#3fe0ff', transparent: true, opacity: 0.85 });
      this.padMats.push(mat);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), mat);
      plate.position.set((p.min.x + p.max.x) / 2, p.max.y + 0.03, (p.min.z + p.max.z) / 2);
      const chevron = new THREE.Mesh(
        new THREE.ConeGeometry(Math.min(w, d) * 0.35, Math.min(w, d) * 0.5, 3),
        new THREE.MeshBasicMaterial({ color: '#e8fdff' }),
      );
      chevron.rotation.x = -Math.PI / 2;
      chevron.rotation.z = Math.atan2(p.launch.x, -p.launch.z);
      chevron.position.set(plate.position.x, plate.position.y + 0.06, plate.position.z);
      const light = new THREE.PointLight('#3fe0ff', 4, 6);
      light.position.set(plate.position.x, plate.position.y + 0.6, plate.position.z);
      this.group.add(plate, chevron, light);
    }

    // Lighting
    const sky = new THREE.Color(theme.sky);
    scene.background = sky;
    scene.fog = new THREE.Fog(sky, theme.fogNear, theme.fogFar);
    this.group.add(new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, theme.hemiIntensity));
    const sun = new THREE.DirectionalLight(theme.sun, theme.sunIntensity);
    sun.position.set(theme.sunPos.x, theme.sunPos.y, theme.sunPos.z);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const ext = map.size + 10;
    const s = sun.shadow.camera;
    s.left = -ext;
    s.right = ext;
    s.top = ext;
    s.bottom = -ext;
    s.near = 1;
    s.far = 260;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    this.group.add(sun);

    // Distant backdrop so the arena isn't floating in the void
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(160, 160, 60, 32, 1, true),
      new THREE.MeshBasicMaterial({ color: sky.clone().multiplyScalar(0.75), side: THREE.BackSide, fog: true }),
    );
    this.group.add(ring);
    scene.add(this.group);
  }

  update(dt: number): void {
    this.time += dt;
    const pulse = 0.65 + Math.sin(this.time * 5) * 0.25;
    for (const m of this.padMats) m.opacity = pulse;
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          (m as THREE.MeshStandardMaterial).map?.dispose();
          m.dispose();
        }
      }
    });
  }
}
