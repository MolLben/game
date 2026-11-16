import type { WeaponId } from '@kinetic/shared';

export interface Settings {
  sensitivity: number;
  adsSensMult: number;
  fov: number;
  volume: number;
  bots: number;
  primary: WeaponId;
  /** Multiplier for touch-drag look speed (mobile). */
  touchSens: number;
  /** Map for practice and newly created private rooms. */
  map: string;
  aimAssist: boolean;
  aimAssistStrength: number;
  stickyAim: boolean;
  stickyAimSpeed: number;
  stickyOnAds: boolean;
}

const KEY = 'kinetic.settings.v1';
const DEFAULTS: Settings = {
  sensitivity: 1,
  adsSensMult: 0.85,
  fov: 100,
  volume: 0.6,
  bots: 7,
  primary: 'rifle',
  touchSens: 1,
  map: 'foundry',
  aimAssist: true,
  aimAssistStrength: 0.5,
  stickyAim: true,
  stickyAimSpeed: 1.0,
  stickyOnAds: true,
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* ignore corrupt settings */
  }
  return { ...DEFAULTS };
}

export const settings: Settings = load();

export function saveSettings(): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
}
