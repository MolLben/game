import * as THREE from 'three';
import type { Vec3, WeaponId } from '@kinetic/shared';
import { flashTexture, nameTagTexture } from './textures';

/** Third-person character model used for bots and remote players. */
export class Avatar {
  readonly group = new THREE.Group();
  private torsoMat: THREE.MeshStandardMaterial;
  private gun = new THREE.Group();
  private flash: THREE.Sprite;
  private flashTimer = 0;
  private hitFlash = 0;
  private deathTime = -1;
  private crouchScale = 1;
  private gunBody!: THREE.Mesh;
  private weapon: WeaponId | null = null;

  /** Gun silhouette per weapon: [width, height, length]. */
  private static readonly GUN_SIZE: Record<WeaponId, [number, number, number]> = {
    rifle: [0.08, 0.1, 0.65],
    smg: [0.08, 0.1, 0.42],
    shotgun: [0.09, 0.09, 0.78],
    sniper: [0.07, 0.11, 0.95],
    pistol: [0.05, 0.08, 0.25],
    knife: [0.02, 0.05, 0.28],
  };

  setWeapon(id: WeaponId): void {
    if (id === this.weapon) return;
    this.weapon = id;
    const [w, h, l] = Avatar.GUN_SIZE[id];
    this.gunBody.scale.set(w, h, l);
    this.flash.position.z = -l - 0.05;
  }

  constructor(name: string, color: string, scene: THREE.Scene) {
    const dark = new THREE.MeshStandardMaterial({ color: '#25282e', roughness: 0.8 });
    this.torsoMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive: '#000000' });
    const headMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.35),
      roughness: 0.6,
    });
    const visorMat = new THREE.MeshStandardMaterial({ color: '#0d0f12', roughness: 0.2, metalness: 0.6 });
    const add = (geo: THREE.BoxGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.group) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    add(new THREE.BoxGeometry(0.22, 0.75, 0.26), dark, -0.13, 0.375, 0);
    add(new THREE.BoxGeometry(0.22, 0.75, 0.26), dark, 0.13, 0.375, 0);
    add(new THREE.BoxGeometry(0.62, 0.66, 0.36), this.torsoMat, 0, 1.08, 0);
    add(new THREE.BoxGeometry(0.38, 0.38, 0.38), headMat, 0, 1.6, 0);
    add(new THREE.BoxGeometry(0.3, 0.1, 0.04), visorMat, 0, 1.63, -0.19);
    this.gun.position.set(0.22, 1.2, -0.1);
    // Unit-length gun body, scaled per weapon in setWeapon()
    const gunGeo = new THREE.BoxGeometry(1, 1, 1);
    gunGeo.translate(0, 0, -0.5);
    this.gunBody = add(gunGeo, visorMat, 0, 0, 0.05, this.gun);
    add(new THREE.BoxGeometry(0.12, 0.12, 0.4), this.torsoMat, -0.1, -0.05, -0.15, this.gun);
    this.group.add(this.gun);

    this.flash = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: flashTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
    );
    this.flash.scale.setScalar(0.5);
    this.flash.position.set(0, 0, -0.6);
    this.flash.visible = false;
    this.gun.add(this.flash);
    this.setWeapon('rifle');

    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTagTexture(name, color), transparent: true }));
    tag.scale.set(1.4, 0.35, 1);
    tag.position.y = 2.15;
    this.group.add(tag);

    this.group.visible = false;
    scene.add(this.group);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
  }

  onSpawn(): void {
    this.deathTime = -1;
    this.group.rotation.set(0, 0, 0);
  }

  onDeath(time: number): void {
    this.deathTime = time;
  }

  onHit(): void {
    this.hitFlash = 0.12;
  }

  muzzleFlash(): void {
    this.flashTimer = 0.05;
    this.flash.material.rotation = Math.random() * Math.PI;
  }

  muzzleWorld(pos: Vec3, yaw: number, crouched: boolean): Vec3 {
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    return {
      x: pos.x + fx * 0.7 + Math.cos(yaw) * 0.22,
      y: pos.y + (crouched ? 0.8 : 1.2),
      z: pos.z + fz * 0.7 - Math.sin(yaw) * 0.22,
    };
  }

  update(pos: Vec3, yaw: number, pitch: number, crouched: boolean, alive: boolean, dt: number, time: number): void {
    this.group.position.set(pos.x, pos.y, pos.z);
    if (alive) {
      this.group.visible = true;
      this.group.rotation.set(0, yaw, 0);
      this.crouchScale += ((crouched ? 0.64 : 1) - this.crouchScale) * Math.min(1, dt * 15);
      this.group.scale.set(1, this.crouchScale, 1);
      this.gun.rotation.x = pitch;
    } else if (this.deathTime >= 0) {
      const t = time - this.deathTime;
      this.group.rotation.x = -Math.min(1, t / 0.35) * (Math.PI / 2);
      this.group.visible = t < 1.6;
    } else {
      this.group.visible = false;
    }
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.torsoMat.emissive.setScalar(this.hitFlash > 0 ? 0.8 : 0);
    this.flashTimer -= dt;
    this.flash.visible = this.flashTimer > 0;
  }
}
