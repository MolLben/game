import type { MoveState, WeaponId } from '@kinetic/shared';

export interface Fighter {
  id: number;
  name: string;
  color: string;
  isBot: boolean;
  move: MoveState;
  yaw: number;
  pitch: number;
  health: number;
  alive: boolean;
  kills: number;
  deaths: number;
  streak: number;
  respawnAt: number;
  spawnTime: number;
  lastDamageTime: number;
  /** Weapon currently held (for third-person models and bot AI). */
  weapon: WeaponId;
}
