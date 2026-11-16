import { clamp } from './math';

export type WeaponId = 'rifle' | 'smg' | 'shotgun' | 'sniper' | 'pistol' | 'knife';
export type WeaponSlot = 'primary' | 'secondary' | 'melee';

/**
 * Deterministic recoil: the same spray always kicks the same way, so players
 * can learn to control it. See recoilForShot().
 */
export interface RecoilProfile {
  /** Base upward kick per shot (radians). */
  up: number;
  /** Extra upward kick reached by the 8th shot (fraction of `up`). */
  climb: number;
  /** Sideways sway amplitude (radians). */
  side: number;
  /** How quickly the sway alternates left/right per shot. */
  sideFreq: number;
  /** Random variation applied on top (fraction). */
  jitter: number;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  description: string;
  slot: WeaponSlot;
  melee: boolean;
  auto: boolean;
  damage: number;
  headMult: number;
  pellets: number;
  rpm: number;
  magSize: number;
  reloadTime: number;
  /** Seconds per shell for shell-by-shell reloads (0 = magazine reload). */
  shellReload: number;
  equipTime: number;
  /** Cone half-angles in radians. */
  spreadHip: number;
  spreadAds: number;
  spreadMove: number;
  spreadAir: number;
  bloomPerShot: number;
  bloomMax: number;
  bloomRecover: number;
  recoil: RecoilProfile;
  /** Seconds without firing before the recoil pattern restarts. */
  recoilReset: number;
  /** Visual action cycled after each shot. */
  cycle: 'none' | 'pump' | 'bolt';
  range: number;
  falloffStart: number;
  falloffEnd: number;
  minDamageMult: number;
  adsZoom: number;
  adsTime: number;
  moveMult: number;
  adsMoveMult: number;
  scoped: boolean;
}

const NO_RECOIL: RecoilProfile = { up: 0, climb: 0, side: 0, sideFreq: 0, jitter: 0 };

const base = {
  slot: 'primary' as WeaponSlot,
  melee: false,
  pellets: 1,
  headMult: 1.5,
  range: 250,
  shellReload: 0,
  adsMoveMult: 0.7,
  scoped: false,
  bloomPerShot: 0,
  bloomMax: 0,
  bloomRecover: 0.1,
  recoilReset: 0.5,
  cycle: 'none' as const,
};

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  rifle: {
    ...base,
    id: 'rifle', name: 'Arc-7 Rifle', description: 'All-rounder. Controllable full-auto at any range.',
    auto: true, damage: 24, rpm: 600, magSize: 30, reloadTime: 1.9, equipTime: 0.45,
    spreadHip: 0.022, spreadAds: 0.003, spreadMove: 0.025, spreadAir: 0.06,
    bloomPerShot: 0.004, bloomMax: 0.03, bloomRecover: 0.12,
    recoil: { up: 0.0105, climb: 0.45, side: 0.006, sideFreq: 0.55, jitter: 0.15 }, recoilReset: 0.28,
    falloffStart: 25, falloffEnd: 60, minDamageMult: 0.7,
    adsZoom: 1.35, adsTime: 0.18, moveMult: 0.95,
  },
  smg: {
    ...base,
    id: 'smg', name: 'Wasp SMG', description: 'Fastest fire rate and movement. Shreds up close.',
    auto: true, headMult: 1.4, damage: 17, rpm: 900, magSize: 32, reloadTime: 1.6, equipTime: 0.35,
    spreadHip: 0.03, spreadAds: 0.012, spreadMove: 0.01, spreadAir: 0.04,
    bloomPerShot: 0.003, bloomMax: 0.025, bloomRecover: 0.15,
    recoil: { up: 0.0065, climb: 0.3, side: 0.008, sideFreq: 0.8, jitter: 0.25 }, recoilReset: 0.22,
    falloffStart: 12, falloffEnd: 35, minDamageMult: 0.55,
    adsZoom: 1.15, adsTime: 0.12, moveMult: 1.05, adsMoveMult: 0.85,
  },
  shotgun: {
    ...base,
    id: 'shotgun', name: 'Breacher Shotgun', description: 'One-shot potential up close. Loads shell by shell.',
    auto: false, headMult: 1.25, pellets: 10, damage: 14, rpm: 75, magSize: 6, reloadTime: 2.3, shellReload: 0.42, equipTime: 0.45,
    spreadHip: 0.075, spreadAds: 0.055, spreadMove: 0.01, spreadAir: 0.02,
    recoil: { up: 0.05, climb: 0, side: 0.01, sideFreq: 1.3, jitter: 0.3 }, cycle: 'pump',
    falloffStart: 6, falloffEnd: 18, minDamageMult: 0.3,
    adsZoom: 1.15, adsTime: 0.15, moveMult: 1.0,
  },
  sniper: {
    ...base,
    id: 'sniper', name: 'Lancet Sniper', description: 'Headshots kill instantly. Bolt action, scoped.',
    auto: false, headMult: 2.0, damage: 90, rpm: 45, magSize: 5, reloadTime: 2.6, equipTime: 0.6,
    spreadHip: 0.09, spreadAds: 0, spreadMove: 0.06, spreadAir: 0.15,
    recoil: { up: 0.06, climb: 0, side: 0.006, sideFreq: 1, jitter: 0.2 }, cycle: 'bolt',
    falloffStart: 1e9, falloffEnd: 2e9, minDamageMult: 1,
    adsZoom: 3.5, adsTime: 0.28, moveMult: 0.9, adsMoveMult: 0.6, scoped: true,
  },
  pistol: {
    ...base,
    id: 'pistol', name: 'Pike Pistol', description: 'Reliable sidearm. Quick to draw.', slot: 'secondary',
    auto: false, headMult: 1.6, damage: 30, rpm: 360, magSize: 12, reloadTime: 1.3, equipTime: 0.25,
    spreadHip: 0.015, spreadAds: 0.006, spreadMove: 0.01, spreadAir: 0.03,
    bloomPerShot: 0.008, bloomMax: 0.03, bloomRecover: 0.12,
    recoil: { up: 0.02, climb: 0.2, side: 0.004, sideFreq: 1.1, jitter: 0.2 },
    falloffStart: 15, falloffEnd: 40, minDamageMult: 0.6,
    adsZoom: 1.2, adsTime: 0.12, moveMult: 1.08, adsMoveMult: 0.85,
  },
  knife: {
    ...base,
    id: 'knife', name: 'Edge Knife', description: 'Two slashes to kill. Fastest movement.', slot: 'melee', melee: true,
    auto: true, headMult: 1, damage: 55, rpm: 90, magSize: 0, reloadTime: 0, equipTime: 0.25,
    spreadHip: 0, spreadAds: 0, spreadMove: 0, spreadAir: 0,
    recoil: NO_RECOIL, range: 2.4,
    falloffStart: 1e9, falloffEnd: 2e9, minDamageMult: 1,
    adsZoom: 1, adsTime: 0.1, moveMult: 1.12, adsMoveMult: 1,
  },
};

/** Wire order — indices are sent over the network. Append only. */
export const WEAPON_ORDER: WeaponId[] = ['rifle', 'smg', 'shotgun', 'sniper', 'pistol', 'knife'];
export const PRIMARY_WEAPONS: WeaponId[] = ['rifle', 'smg', 'shotgun', 'sniper'];

export function weaponIndex(id: WeaponId): number {
  return WEAPON_ORDER.indexOf(id);
}

export function weaponByIndex(i: number): WeaponDef {
  return WEAPONS[WEAPON_ORDER[i] ?? 'rifle'] ?? WEAPONS.rifle;
}

export function isPrimary(id: unknown): id is WeaponId {
  return typeof id === 'string' && (PRIMARY_WEAPONS as string[]).includes(id);
}

/** Slot order: 1 = primary, 2 = pistol, 3 = knife. */
export function loadoutFor(primary: WeaponId): WeaponId[] {
  return [isPrimary(primary) ? primary : 'rifle', 'pistol', 'knife'];
}

export function damageAt(def: WeaponDef, dist: number, head: boolean): number {
  let mult = 1;
  if (dist > def.falloffStart) {
    const k = clamp((dist - def.falloffStart) / (def.falloffEnd - def.falloffStart), 0, 1);
    mult = 1 + (def.minDamageMult - 1) * k;
  }
  return def.damage * mult * (head ? def.headMult : 1);
}

/** Recoil kick for the i-th shot of a spray (before jitter). */
export function recoilForShot(def: WeaponDef, i: number): { pitch: number; yaw: number } {
  const r = def.recoil;
  const k = Math.min(i, 8) / 8;
  const pitch = r.up * (1 + r.climb * k) * (i >= 12 ? 0.55 : 1);
  const yaw = r.side * Math.sin(i * r.sideFreq + 0.6) * Math.min(1, i / 3);
  return { pitch, yaw };
}

/** Ticks per shell for shell-by-shell reloads (server passes slack < 1). */
export function shellTicks(def: WeaponDef, tickRate: number, slack = 1): number {
  return Math.max(1, Math.floor(def.shellReload * tickRate * slack));
}

/**
 * Movement speed multiplier for a weapon + ADS amount (0..255 byte).
 * Client prediction and server simulation must both use this exact function
 * with the same quantized inputs so they stay in lockstep.
 */
export function moveSpeedMult(weaponIndex: number, adsByte: number): number {
  const def = weaponByIndex(weaponIndex);
  const ads = clamp(adsByte, 0, 255) / 255;
  return def.moveMult * (1 + (def.adsMoveMult - 1) * ads);
}

/** Widest spread cone a legit client could produce (used for server validation). */
export function maxSpread(def: WeaponDef): number {
  return Math.max(def.spreadHip, def.spreadAds) + def.bloomMax + def.spreadMove * 1.5 + def.spreadAir;
}
