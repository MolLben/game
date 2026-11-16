import * as THREE from 'three';
import type { WeaponDef, WeaponId } from '@kinetic/shared';
import { flashTexture } from './textures';

type MatKey = 'body' | 'dark' | 'accent';
type PartName = 'mag' | 'pump' | 'bolt' | 'slide';
/** [w, h, d, x, y, z, material, rotX?, name?] */
type Part = [number, number, number, number, number, number, MatKey, number?, PartName?];

interface ModelDef {
  parts: Part[];
  accent: string;
  muzzle: [number, number, number];
  eject: [number, number, number];
  sightY: number;
  hip: [number, number, number];
  rightHand: [number, number, number];
  leftHand: [number, number, number];
}

const MODELS: Record<WeaponId, ModelDef> = {
  rifle: {
    accent: '#3fa7d6',
    parts: [
      [0.07, 0.1, 0.44, 0, 0, 0, 'body'],
      [0.03, 0.03, 0.28, 0, 0.02, -0.35, 'dark'],
      [0.075, 0.075, 0.24, 0, 0.005, -0.27, 'accent'],
      [0.05, 0.17, 0.08, 0, -0.12, -0.06, 'dark', 0.18, 'mag'],
      [0.045, 0.12, 0.055, 0, -0.1, 0.12, 'dark', -0.35],
      [0.06, 0.09, 0.2, 0, -0.01, 0.3, 'body'],
      [0.025, 0.035, 0.08, 0, 0.068, 0.02, 'dark'],
      [0.012, 0.03, 0.02, 0, 0.055, -0.3, 'dark'],
    ],
    muzzle: [0, 0.02, -0.5],
    eject: [0.04, 0.03, 0.02],
    sightY: 0.083,
    hip: [0.17, -0.165, -0.62],
    rightHand: [0, -0.11, 0.12],
    leftHand: [0, -0.03, -0.27],
  },
  smg: {
    accent: '#e0a526',
    parts: [
      [0.065, 0.095, 0.3, 0, 0, 0, 'body'],
      [0.028, 0.028, 0.12, 0, 0.015, -0.21, 'dark'],
      [0.04, 0.2, 0.05, 0, -0.14, -0.07, 'accent', 0, 'mag'],
      [0.045, 0.11, 0.05, 0, -0.09, 0.09, 'dark', -0.3],
      [0.03, 0.05, 0.16, 0, 0, 0.22, 'dark'],
      [0.02, 0.03, 0.05, 0, 0.062, 0, 'dark'],
    ],
    muzzle: [0, 0.015, -0.28],
    eject: [0.035, 0.03, 0],
    sightY: 0.075,
    hip: [0.16, -0.155, -0.54],
    rightHand: [0, -0.1, 0.09],
    leftHand: [0, -0.18, -0.07],
  },
  shotgun: {
    accent: '#c0503a',
    parts: [
      [0.075, 0.1, 0.32, 0, 0, 0, 'body'],
      [0.045, 0.045, 0.52, 0, 0.025, -0.4, 'dark'],
      [0.07, 0.065, 0.17, 0, -0.035, -0.33, 'accent', 0, 'pump'],
      [0.045, 0.12, 0.055, 0, -0.1, 0.1, 'dark', -0.35],
      [0.065, 0.1, 0.24, 0, -0.015, 0.27, 'body'],
      [0.015, 0.02, 0.02, 0, 0.058, -0.62, 'accent'],
    ],
    muzzle: [0, 0.025, -0.66],
    eject: [0.045, 0.02, -0.02],
    sightY: 0.065,
    hip: [0.17, -0.165, -0.6],
    rightHand: [0, -0.11, 0.1],
    leftHand: [0, -0.07, -0.33],
  },
  sniper: {
    accent: '#5cc46a',
    parts: [
      [0.07, 0.09, 0.46, 0, 0, 0, 'body'],
      [0.03, 0.03, 0.56, 0, 0.015, -0.5, 'dark'],
      [0.055, 0.055, 0.26, 0, 0.09, -0.02, 'dark'],
      [0.065, 0.065, 0.03, 0, 0.09, -0.15, 'accent'],
      [0.065, 0.065, 0.03, 0, 0.09, 0.11, 'accent'],
      [0.02, 0.06, 0.02, 0, 0.05, -0.02, 'dark'],
      [0.07, 0.12, 0.28, 0, -0.02, 0.35, 'accent'],
      [0.045, 0.12, 0.055, 0, -0.1, 0.14, 'dark', -0.35],
      [0.04, 0.02, 0.04, 0.05, 0.02, 0.08, 'dark', 0, 'bolt'],
    ],
    muzzle: [0, 0.015, -0.79],
    eject: [0.045, 0.03, 0.05],
    sightY: 0.09,
    hip: [0.17, -0.175, -0.68],
    rightHand: [0, -0.11, 0.14],
    leftHand: [0, -0.05, -0.25],
  },
  pistol: {
    accent: '#8fa3b8',
    parts: [
      [0.045, 0.055, 0.22, 0, 0.03, -0.04, 'body', 0, 'slide'],
      [0.042, 0.04, 0.17, 0, -0.01, -0.03, 'accent'],
      [0.042, 0.13, 0.06, 0, -0.08, 0.05, 'dark', -0.25, 'mag'],
      [0.01, 0.015, 0.01, 0, 0.064, -0.14, 'dark'],
    ],
    muzzle: [0, 0.03, -0.16],
    eject: [0.03, 0.04, -0.02],
    sightY: 0.07,
    hip: [0.15, -0.14, -0.48],
    rightHand: [0, -0.09, 0.05],
    leftHand: [-0.03, -0.1, 0.06],
  },
  knife: {
    accent: '#cfd8e3',
    parts: [
      [0.032, 0.038, 0.12, 0, -0.02, 0.05, 'dark'],
      [0.07, 0.014, 0.02, 0, -0.005, -0.015, 'body'],
      [0.012, 0.04, 0.22, 0, 0.002, -0.13, 'accent'],
      [0.006, 0.02, 0.06, 0, 0.022, -0.21, 'accent', -0.3],
    ],
    muzzle: [0, 0, -0.25],
    eject: [0, 0, 0],
    sightY: 0,
    hip: [0.16, -0.17, -0.42],
    rightHand: [0, -0.03, 0.05],
    leftHand: [-0.5, -0.5, 0.2],
  },
};

interface NamedPart {
  mesh: THREE.Mesh;
  base: THREE.Vector3;
}

interface Model {
  group: THREE.Group;
  muzzle: THREE.Object3D;
  eject: THREE.Object3D;
  parts: Partial<Record<PartName, NamedPart>>;
  def: ModelDef;
}

interface Casing {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
}

export interface ViewModelState {
  ads: number;
  speed: number;
  onGround: boolean;
  sliding: boolean;
  mouseDX: number;
  mouseDY: number;
  /** -1 when not reloading; 0..1 for the reload (or current shell). */
  reloadProgress: number;
  shellReload: boolean;
  switchProgress: number;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** First-person weapon rendered in its own scene so it never clips into walls. */
export class ViewModel {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.01, 10);
  private root = new THREE.Group();
  private models = new Map<WeaponId, Model>();
  private current: Model;
  private weapon: WeaponDef | null = null;
  private flash: THREE.Mesh;
  private flashLight = new THREE.PointLight('#ffcc77', 0, 2);
  private flashTimer = 0;
  private bobPhase = 0;
  private sway = new THREE.Vector2();
  private kickZ = 0;
  private kickRot = 0;
  private slideTilt = 0;
  private slideKick = 0;
  private shellPose = 0;
  private swingT = 1;
  private cycleT = 1;
  private cycleDelay = 0;
  private cycleDur = 0.4;
  private cycleEjected = true;
  private casings: Casing[] = [];
  private casingIdx = 0;
  private pos = new THREE.Vector3();

  /** Fired when the pump/bolt cycle ejects a shell (for sound). */
  onCycle: (kind: 'pump' | 'bolt') => void = () => { };

  constructor() {
    this.scene.add(new THREE.HemisphereLight('#dfe9ff', '#403830', 1.6));
    const key = new THREE.DirectionalLight('#ffffff', 1.6);
    key.position.set(1, 2, 1);
    this.scene.add(key);
    this.scene.add(this.camera);
    this.camera.add(this.root);

    const body = new THREE.MeshStandardMaterial({ color: '#2b2f36', roughness: 0.45, metalness: 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: '#16181c', roughness: 0.6, metalness: 0.3 });
    const glove = new THREE.MeshStandardMaterial({ color: '#23272d', roughness: 0.9 });
    const sleeve = new THREE.MeshStandardMaterial({ color: '#34465c', roughness: 0.9 });

    for (const id of Object.keys(MODELS) as WeaponId[]) {
      const def = MODELS[id];
      const accent = new THREE.MeshStandardMaterial({
        color: def.accent,
        roughness: id === 'knife' ? 0.25 : 0.5,
        metalness: id === 'knife' ? 0.85 : 0.2,
      });
      const mats: Record<MatKey, THREE.Material> = { body, dark, accent };
      const group = new THREE.Group();
      const parts: Model['parts'] = {};
      for (const [w, h, d, x, y, z, m, rx, name] of def.parts) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[m]);
        mesh.position.set(x, y, z);
        if (rx) mesh.rotation.x = rx;
        group.add(mesh);
        if (name) parts[name] = { mesh, base: mesh.position.clone() };
      }
      const hand = (p: [number, number, number], left: boolean) => {
        const g = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.09, 0.11), glove);
        g.position.set(...p);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.085, 0.42), sleeve);
        arm.position.set(p[0] + (left ? -0.07 : 0.03), p[1] - 0.07, p[2] + 0.25);
        arm.rotation.set(0.28, left ? 0.3 : -0.05, 0);
        group.add(g, arm);
      };
      hand(def.rightHand, false);
      hand(def.leftHand, true);
      const muzzle = new THREE.Object3D();
      muzzle.position.set(...def.muzzle);
      const eject = new THREE.Object3D();
      eject.position.set(...def.eject);
      group.add(muzzle, eject);
      group.visible = false;
      this.root.add(group);
      this.models.set(id, { group, muzzle, eject, parts, def });
    }

    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.22, 0.22),
      new THREE.MeshBasicMaterial({ map: flashTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.flash.visible = false;
    this.scene.add(this.flashLight);

    const brass = new THREE.MeshStandardMaterial({ color: '#c9a246', metalness: 0.9, roughness: 0.3 });
    const casingGeo = new THREE.BoxGeometry(0.011, 0.011, 0.032);
    for (let i = 0; i < 16; i++) {
      const mesh = new THREE.Mesh(casingGeo, brass);
      mesh.visible = false;
      this.scene.add(mesh);
      this.casings.push({ mesh, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0 });
    }

    this.current = this.models.get('rifle')!;
  }

  setWeapon(def: WeaponDef): void {
    this.current.group.visible = false;
    this.current = this.models.get(def.id)!;
    this.current.group.visible = true;
    this.current.muzzle.add(this.flash);
    this.weapon = def;
    this.swingT = 1;
    this.cycleT = 1;
    this.cycleEjected = true;
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Call on every shot / swing. */
  kick(strength: number): void {
    const w = this.weapon;
    if (w?.melee) {
      this.swingT = 0;
      return;
    }
    this.kickZ += 0.05 * strength;
    this.kickRot += 0.08 * strength;
    this.slideKick = 1;
    this.flashTimer = 0.045;
    this.flash.rotation.z = Math.random() * Math.PI;
    this.flash.scale.setScalar(0.8 + Math.random() * 0.5);
    if (w && w.cycle !== 'none') {
      this.cycleDelay = 0.12;
      this.cycleDur = w.cycle === 'pump' ? 0.36 : 0.55;
      this.cycleT = 0;
      this.cycleEjected = false;
    } else {
      this.ejectCasing();
    }
  }

  private ejectCasing(): void {
    if (this.weapon?.melee) return;
    this.root.updateMatrixWorld(true);
    const c = this.casings[this.casingIdx++ % this.casings.length];
    this.current.eject.getWorldPosition(c.mesh.position);
    c.vel.set(1.1 + Math.random() * 0.5, 1.0 + Math.random() * 0.5, 0.2 + Math.random() * 0.3);
    c.spin.set(Math.random() * 20, Math.random() * 20, Math.random() * 20);
    c.mesh.rotation.set(0, Math.random() * 3, 0);
    c.life = 0.6;
    c.mesh.visible = true;
  }

  /** Muzzle position in viewmodel-camera space (used to start tracers). */
  muzzleOffset(): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    const p = new THREE.Vector3();
    this.current.muzzle.getWorldPosition(p);
    return this.camera.worldToLocal(p);
  }

  update(dt: number, s: ViewModelState): void {
    const d = this.current.def;
    const ads = s.ads;

    // Bob
    const moving = s.onGround && !s.sliding && s.speed > 0.5;
    if (moving) this.bobPhase += dt * (4 + s.speed * 0.9);
    const bobAmt = moving ? Math.min(1, s.speed / 7) * (1 - ads * 0.9) : 0;
    const bobX = Math.sin(this.bobPhase) * 0.012 * bobAmt;
    const bobY = -Math.abs(Math.cos(this.bobPhase)) * 0.014 * bobAmt;

    // Sway lags behind mouse movement
    const swayTarget = new THREE.Vector2(-s.mouseDX * 0.0006, s.mouseDY * 0.0006).clampScalar(-0.04, 0.04);
    swayTarget.multiplyScalar(1 - ads * 0.8);
    this.sway.lerp(swayTarget, Math.min(1, dt * 10));

    this.kickZ *= Math.exp(-dt * 14);
    this.kickRot *= Math.exp(-dt * 12);
    this.slideKick *= Math.exp(-dt * 25);
    this.slideTilt += ((s.sliding ? 1 : 0) - this.slideTilt) * Math.min(1, dt * 8);

    // Hip ↔ ADS
    const adsPos = new THREE.Vector3(0, -d.sightY, d.hip[2] + 0.1);
    this.pos.set(...d.hip).lerp(adsPos, ads);

    // Reload poses
    const reloading = s.reloadProgress >= 0;
    const magReload = reloading && !s.shellReload ? Math.sin(s.reloadProgress * Math.PI) : 0;
    this.shellPose += ((reloading && s.shellReload ? 1 : 0) - this.shellPose) * Math.min(1, dt * 10);
    const shellPush = reloading && s.shellReload ? Math.sin(s.reloadProgress * Math.PI) : 0;
    const sw = 1 - s.switchProgress;

    // Melee swing
    this.swingT = Math.min(1, this.swingT + dt / 0.32);
    const sb = this.swingT < 1 ? Math.sin(this.swingT * Math.PI) : 0;

    // Pump / bolt cycle
    let cyc = 0;
    if (this.cycleT < 1) {
      if (this.cycleDelay > 0) this.cycleDelay -= dt;
      else this.cycleT = Math.min(1, this.cycleT + dt / this.cycleDur);
      cyc = Math.sin(this.cycleT * Math.PI);
      if (!this.cycleEjected && this.cycleT >= 0.45) {
        this.cycleEjected = true;
        this.ejectCasing();
        if (this.weapon && this.weapon.cycle !== 'none') this.onCycle(this.weapon.cycle);
      }
    }
    const boltCycle = this.weapon?.cycle === 'bolt' ? cyc : 0;

    this.root.position.set(
      this.pos.x + bobX + this.sway.x - sb * 0.22 * (this.swingT - 0.3),
      this.pos.y + bobY + this.sway.y - magReload * 0.08 - sw * 0.25 - this.slideTilt * 0.02 - this.shellPose * 0.03 - boltCycle * 0.02,
      this.pos.z + this.kickZ - sb * 0.12,
    );
    this.root.rotation.set(
      this.kickRot - magReload * 0.6 - sw * 0.6 - this.shellPose * 0.25 + shellPush * 0.06,
      this.sway.x * 2 + 0.1 * (1 - ads) + sb * (0.9 - 1.8 * this.swingT),
      magReload * 0.4 + this.slideTilt * 0.25 * (1 - ads) + this.shellPose * 0.45 - sb * 0.5 + boltCycle * 0.15,
    );

    // Animated parts
    const parts = this.current.parts;
    if (parts.mag) {
      const p = s.reloadProgress;
      const drop = reloading && !s.shellReload ? (p < 0.45 ? smooth(0.05, 0.35, p) : 1 - smooth(0.55, 0.85, p)) : 0;
      parts.mag.mesh.position.set(parts.mag.base.x, parts.mag.base.y - drop * 0.3, parts.mag.base.z + drop * 0.05);
    }
    if (parts.pump) parts.pump.mesh.position.z = parts.pump.base.z + 0.1 * cyc;
    if (parts.bolt) parts.bolt.mesh.position.z = parts.bolt.base.z + 0.08 * cyc;
    if (parts.slide) parts.slide.mesh.position.z = parts.slide.base.z + 0.035 * this.slideKick;

    this.flashTimer -= dt;
    this.flash.visible = this.flashTimer > 0;
    this.flashLight.intensity = this.flashTimer > 0 ? 3 : 0;
    if (this.flash.visible) this.flash.getWorldPosition(this.flashLight.position);

    for (const c of this.casings) {
      if (c.life <= 0) continue;
      c.life -= dt;
      c.vel.y -= 6 * dt;
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.spin.x * dt;
      c.mesh.rotation.y += c.spin.y * dt;
      c.mesh.rotation.z += c.spin.z * dt;
      if (c.life <= 0) c.mesh.visible = false;
    }
  }
}
