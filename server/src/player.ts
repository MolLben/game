import type { Socket } from './socket';
import {
  PLAYER,
  WEAPON_ORDER,
  WEAPONS,
  createMoveState,
  vec3,
  type BotActor,
  type BotBrain,
  type GameEvent,
  type InputCmd,
  type PlayerInfo,
  type Vec3,
  type WeaponId,
} from '@kinetic/shared';

export const HISTORY_SIZE = 64;

export interface HistoryEntry {
  tick: number;
  pos: Vec3;
  crouched: boolean;
  alive: boolean;
}

export class ServerPlayer implements BotActor {
  move = createMoveState(vec3());
  yaw = 0;
  pitch = 0;
  alive = false;
  health: number = PLAYER.maxHealth;
  kills = 0;
  deaths = 0;
  streak = 0;
  respawnAt = 0;
  spawnTime = 0;
  lastDamageTime = -99;

  // Networking
  inputs: InputCmd[] = [];
  lastSeq = 0;
  /** Number of inputs simulated — the player's own clock for fire-rate/reload checks. */
  inputTick = 0;
  joinTick = 0;
  viewTick = 0;
  events: GameEvent[] = [];

  // Server-side weapon validation state
  weapon = 0;
  ammo = WEAPON_ORDER.map((id) => WEAPONS[id].magSize);
  nextFireTick = 0;
  /** 0 = not reloading. For shell reloads this is just a "reloading" marker. */
  reloadEndTick = 0;
  reloadStartTick = 0;
  reloadAmmoStart = 0;
  equipEndTick = 0;
  /** Weapon indices this player may use (primary, pistol, knife). */
  loadout: number[] = [0, 4, 5];
  primary: WeaponId;
  /** Primary to use from the next respawn. */
  pendingPrimary: WeaponId;

  history: (HistoryEntry | undefined)[] = new Array(HISTORY_SIZE);

  constructor(
    readonly id: number,
    readonly name: string,
    readonly color: string,
    readonly socket: Socket | null,
    readonly brain: BotBrain | null,
    primary: WeaponId,
  ) {
    this.primary = primary;
    this.pendingPrimary = primary;
  }

  get isBot(): boolean {
    return this.socket === null;
  }

  info(): PlayerInfo {
    return { id: this.id, name: this.name, color: this.color, isBot: this.isBot, kills: this.kills, deaths: this.deaths };
  }

  refillAmmo(): void {
    this.ammo = WEAPON_ORDER.map((id) => WEAPONS[id].magSize);
    this.reloadEndTick = 0;
    this.nextFireTick = 0;
  }

  record(tick: number): void {
    const slot = tick % HISTORY_SIZE;
    const p = this.move.pos;
    this.history[slot] = { tick, pos: { x: p.x, y: p.y, z: p.z }, crouched: this.move.crouched, alive: this.alive };
  }
}
