import * as THREE from 'three';
import type { Vec3 } from '@kinetic/shared';
import { decalTexture, dotTexture } from './textures';

interface Tracer {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
}

const MAX_PARTICLES = 500;

/** Pooled tracers, bullet-hole decals and spark particles. */
export class Effects {
  private tracers: Tracer[] = [];
  private tracerIdx = 0;
  private decals: THREE.Mesh[] = [];
  private decalIdx = 0;
  private points: THREE.Points;
  private pPos = new Float32Array(MAX_PARTICLES * 3);
  private pCol = new Float32Array(MAX_PARTICLES * 3);
  private pVel = new Float32Array(MAX_PARTICLES * 3);
  private pLife = new Float32Array(MAX_PARTICLES);
  private pIdx = 0;

  constructor(scene: THREE.Scene) {
    const tracerGeo = new THREE.BoxGeometry(1, 1, 1);
    tracerGeo.translate(0, 0, 0.5);
    for (let i = 0; i < 48; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: '#ffe7a3', transparent: true, depthWrite: false });
      const mesh = new THREE.Mesh(tracerGeo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.tracers.push({ mesh, mat, life: 0 });
    }
    const decalGeo = new THREE.PlaneGeometry(0.14, 0.14);
    const decalMat = new THREE.MeshBasicMaterial({
      map: decalTexture(),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    for (let i = 0; i < 120; i++) {
      const m = new THREE.Mesh(decalGeo, decalMat);
      m.visible = false;
      scene.add(m);
      this.decals.push(m);
    }
    for (let i = 0; i < MAX_PARTICLES; i++) this.pPos[i * 3 + 1] = -1000;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.09,
        map: dotTexture(),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  tracer(from: Vec3, to: Vec3, color = '#ffe7a3', width = 0.018): void {
    const t = this.tracers[this.tracerIdx++ % this.tracers.length];
    const a = new THREE.Vector3(from.x, from.y, from.z);
    const b = new THREE.Vector3(to.x, to.y, to.z);
    const len = a.distanceTo(b);
    if (len < 0.5) return;
    t.mesh.position.copy(a);
    t.mesh.lookAt(b);
    t.mesh.scale.set(width, width, len);
    t.mat.color.set(color);
    t.mat.opacity = 0.9;
    t.life = 0.07;
    t.mesh.visible = true;
  }

  impact(p: Vec3, n: Vec3): void {
    const d = this.decals[this.decalIdx++ % this.decals.length];
    d.position.set(p.x + n.x * 0.01, p.y + n.y * 0.01, p.z + n.z * 0.01);
    d.lookAt(p.x + n.x, p.y + n.y, p.z + n.z);
    d.rotateZ(Math.random() * Math.PI);
    d.visible = true;
    this.sparks(p, n, new THREE.Color('#ffd27a'), 6, 3);
  }

  sparks(p: Vec3, n: Vec3, color: THREE.Color, count: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      const k = this.pIdx++ % MAX_PARTICLES;
      this.pPos[k * 3] = p.x + n.x * 0.03;
      this.pPos[k * 3 + 1] = p.y + n.y * 0.03;
      this.pPos[k * 3 + 2] = p.z + n.z * 0.03;
      this.pVel[k * 3] = (n.x + (Math.random() - 0.5) * 1.6) * speed * Math.random();
      this.pVel[k * 3 + 1] = (n.y + Math.random() * 0.8) * speed * Math.random();
      this.pVel[k * 3 + 2] = (n.z + (Math.random() - 0.5) * 1.6) * speed * Math.random();
      this.pCol[k * 3] = color.r;
      this.pCol[k * 3 + 1] = color.g;
      this.pCol[k * 3 + 2] = color.b;
      this.pLife[k] = 0.25 + Math.random() * 0.25;
    }
  }

  /** Hide all decals/tracers (map change). */
  clear(): void {
    for (const d of this.decals) d.visible = false;
    for (const t of this.tracers) {
      t.life = 0;
      t.mesh.visible = false;
    }
  }

  update(dt: number): void {
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.mat.opacity = Math.max(0, t.life / 0.07) * 0.9;
      if (t.life <= 0) t.mesh.visible = false;
    }
    for (let k = 0; k < MAX_PARTICLES; k++) {
      if (this.pLife[k] <= 0) continue;
      this.pLife[k] -= dt;
      if (this.pLife[k] <= 0) {
        this.pPos[k * 3 + 1] = -1000;
        continue;
      }
      this.pVel[k * 3 + 1] -= 12 * dt;
      this.pPos[k * 3] += this.pVel[k * 3] * dt;
      this.pPos[k * 3 + 1] += this.pVel[k * 3 + 1] * dt;
      this.pPos[k * 3 + 2] += this.pVel[k * 3 + 2] * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}
