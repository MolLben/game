import { WEAPONS, loadoutFor, weaponIndex, type WeaponDef, type WeaponId } from '@kinetic/shared';

export interface WeaponFrameResult {
  fired: boolean;
  /** Index of this shot within the current spray (drives the recoil pattern). */
  shotIndex: number;
  dry: boolean;
  reloadStarted: boolean;
  shellLoaded: boolean;
}

/** Local player's weapon state: loadout slots, ammo, fire rate, reloads, swap, ADS, bloom. */
export class WeaponController {
  slots: WeaponDef[] = [];
  ammo: number[] = [];
  current = 0;
  previous = 1;
  cooldown = 0;
  reloading = false;
  /** Mag reload: time until done. Shell reload: time until the next shell. */
  reloadTimer = 0;
  switchTimer = 0;
  bloom = 0;
  ads = 0;
  private shotIndex = 0;
  private lastShotTime = -99;
  private time = 0;

  constructor(primary: WeaponId) {
    this.setLoadout(primary);
  }

  setLoadout(primary: WeaponId): void {
    this.slots = loadoutFor(primary).map((id) => WEAPONS[id]);
    this.ammo = this.slots.map((d) => d.magSize);
    this.current = 0;
    this.previous = 1;
    this.refill();
  }

  get primary(): WeaponId {
    return this.slots[0].id;
  }

  get def(): WeaponDef {
    return this.slots[this.current];
  }

  /** Index in WEAPON_ORDER — what goes over the wire. */
  get globalIndex(): number {
    return weaponIndex(this.def.id);
  }

  get mag(): number {
    return this.ammo[this.current];
  }

  get isShellReload(): boolean {
    return this.def.shellReload > 0;
  }

  /** 0..1 progress of a magazine reload, or of the current shell; -1 when not reloading. */
  get reloadProgress(): number {
    if (!this.reloading) return -1;
    const total = this.isShellReload ? this.def.shellReload : this.def.reloadTime;
    return 1 - this.reloadTimer / total;
  }

  get switchProgress(): number {
    return this.switchTimer > 0 ? 1 - this.switchTimer / this.def.equipTime : 1;
  }

  refill(): void {
    this.ammo = this.slots.map((d) => d.magSize);
    this.reloading = false;
    this.reloadTimer = 0;
    this.cooldown = 0;
    this.bloom = 0;
    this.ads = 0;
    this.shotIndex = 0;
    this.switchTimer = this.def.equipTime;
  }

  switchTo(i: number): boolean {
    if (i === this.current || i < 0 || i >= this.slots.length) return false;
    this.previous = this.current;
    this.current = i;
    this.reloading = false;
    this.reloadTimer = 0;
    this.bloom = 0;
    this.shotIndex = 0;
    this.switchTimer = this.def.equipTime;
    this.cooldown = Math.max(this.cooldown, 0);
    return true;
  }

  startReload(): boolean {
    const d = this.def;
    if (d.melee || this.reloading || this.switchTimer > 0 || this.mag >= d.magSize) return false;
    this.reloading = true;
    this.reloadTimer = d.shellReload > 0 ? d.shellReload : d.reloadTime;
    return true;
  }

  update(dt: number, fireDown: boolean, firePressed: boolean, adsDown: boolean): WeaponFrameResult {
    const res: WeaponFrameResult = { fired: false, shotIndex: 0, dry: false, reloadStarted: false, shellLoaded: false };
    const def = this.def;
    this.time += dt;
    this.cooldown -= dt;
    if (this.switchTimer > 0) this.switchTimer = Math.max(0, this.switchTimer - dt);

    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        if (def.shellReload > 0) {
          this.ammo[this.current]++;
          res.shellLoaded = true;
          if (this.mag >= def.magSize) this.reloading = false;
          else this.reloadTimer += def.shellReload;
        } else {
          this.ammo[this.current] = def.magSize;
          this.reloading = false;
        }
      }
    }

    const canAds = adsDown && !def.melee && !this.reloading && this.switchTimer <= 0;
    const step = dt / def.adsTime;
    this.ads = canAds ? Math.min(1, this.ads + step) : Math.max(0, this.ads - step);
    this.bloom = Math.max(0, this.bloom - def.bloomRecover * dt);

    const wantShot = def.auto ? fireDown : firePressed;
    if (wantShot && this.cooldown <= 0 && this.switchTimer <= 0) {
      // Firing interrupts a shell-by-shell reload as soon as one shell is in.
      if (this.reloading && def.shellReload > 0 && this.mag > 0) this.reloading = false;
      if (!this.reloading) {
        if (def.melee || this.mag > 0) {
          if (!def.melee) this.ammo[this.current]--;
          if (this.time - this.lastShotTime > def.recoilReset) this.shotIndex = 0;
          res.shotIndex = this.shotIndex++;
          this.lastShotTime = this.time;
          this.cooldown += 60 / def.rpm;
          this.bloom = Math.min(def.bloomMax, this.bloom + def.bloomPerShot);
          res.fired = true;
        } else {
          res.dry = firePressed;
          if (this.startReload()) res.reloadStarted = true;
        }
      }
    }
    if (!res.fired && this.cooldown < 0) this.cooldown = 0;

    // Auto-reload once the last round's cooldown has elapsed
    if (!def.melee && this.mag === 0 && !this.reloading && this.switchTimer <= 0 && this.cooldown <= 0 && !res.reloadStarted) {
      if (this.startReload()) res.reloadStarted = true;
    }
    return res;
  }
}
