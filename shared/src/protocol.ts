import type { Vec3 } from './math';
import type { MoveState } from './movement';
import type { WeaponId } from './weapons';

export const PROTOCOL_VERSION = 3;
export const DEFAULT_PORT = 2567;
/** Server sends a snapshot every N ticks (60 Hz / 2 = 30 Hz). */
export const SNAPSHOT_EVERY_TICKS = 2;
/** Remote players are rendered this many ticks in the past. */
export const INTERP_DELAY_TICKS = 6;
/** Max lag-compensation rewind (ticks). */
export const MAX_REWIND_TICKS = 30;
export const MAX_PELLETS = 16;
export const MAX_SHOTS_PER_INPUT = 4;

// Binary message ids (first byte)
export const BIN = { INPUT: 1, SNAPSHOT: 2 } as const;

// ───────────────────────── JSON messages ─────────────────────────

export type JoinMode = 'quick' | 'create' | 'join';

export interface HelloMsg {
  type: 'hello';
  version: number;
  name: string;
  mode: JoinMode;
  code?: string;
  /** Preferred primary weapon id (validated by the server). */
  primary?: string;
  /** Map for a newly created private room. */
  map?: string;
}

/** Change primary weapon; applies on next respawn. */
export interface LoadoutMsg {
  type: 'loadout';
  primary: string;
}

export interface PingMsg {
  type: 'ping';
  t: number;
}

export type ClientJson = HelloMsg | PingMsg | LoadoutMsg;

export interface PlayerInfo {
  id: number;
  name: string;
  color: string;
  isBot: boolean;
  kills: number;
  deaths: number;
}

export interface MatchInfo {
  phase: 'running' | 'ended';
  /** Map id being played (or about to be, during 'ended'). */
  map: string;
  /** Seconds remaining in the current phase. */
  timeLeft: number;
}

export interface WelcomeMsg {
  type: 'welcome';
  id: number;
  code: string;
  isPrivate: boolean;
  tick: number;
  map: string;
  players: PlayerInfo[];
  match: MatchInfo;
}

export interface RankEntry {
  id: number;
  kills: number;
  deaths: number;
}

export type GameEvent =
  | { t: 'join'; p: PlayerInfo }
  | { t: 'leave'; id: number }
  /** w = primary weapon index the player spawned with. */
  | { t: 'spawn'; id: number; w: number }
  /** Another player's shot, for tracers/sound. e = [x,y,z,nx,ny,nz,hitPlayer] per pellet (sampled). */
  | { t: 'shot'; id: number; w: WeaponId; e: number[][] }
  /** Sent to the shooter when the server confirms a hit. */
  | { t: 'hit'; target: number; head: boolean; kill: boolean; dmg: number }
  /** Sent to the victim. */
  | { t: 'damage'; by: number; amount: number; x: number; z: number }
  | { t: 'kill'; killer: number; victim: number; w: string; head: boolean }
  | { t: 'match'; match: MatchInfo; ranking?: RankEntry[] };

export interface EventsMsg {
  type: 'events';
  events: GameEvent[];
}

export interface PongMsg {
  type: 'pong';
  t: number;
}

export interface ErrorMsg {
  type: 'error';
  message: string;
}

export type ServerJson = WelcomeMsg | EventsMsg | PongMsg | ErrorMsg;

// ───────────────────────── Binary: input ─────────────────────────

export interface InputCmd {
  seq: number;
  forward: number;
  right: number;
  jump: boolean;
  crouch: boolean;
  /** Client started a reload during this tick. */
  reload: boolean;
  weapon: number;
  /** ADS amount quantized to 0..255. */
  ads: number;
  yaw: number;
  pitch: number;
  /** Server tick the client was rendering other players at (for lag compensation). */
  viewTick: number;
  /** Each shot is a list of pellet directions. */
  shots: Vec3[][];
}

export function encodeInput(c: InputCmd): ArrayBuffer {
  const shots = c.shots.slice(0, MAX_SHOTS_PER_INPUT);
  let size = 23;
  for (const s of shots) size += 1 + Math.min(s.length, MAX_PELLETS) * 12;
  const buf = new ArrayBuffer(size);
  const v = new DataView(buf);
  let o = 0;
  v.setUint8(o, BIN.INPUT); o += 1;
  v.setUint32(o, c.seq, true); o += 4;
  v.setInt8(o, c.forward); o += 1;
  v.setInt8(o, c.right); o += 1;
  v.setUint8(o, (c.jump ? 1 : 0) | (c.crouch ? 2 : 0) | (c.reload ? 4 : 0)); o += 1;
  v.setUint8(o, c.weapon); o += 1;
  v.setUint8(o, c.ads); o += 1;
  v.setFloat32(o, c.yaw, true); o += 4;
  v.setFloat32(o, c.pitch, true); o += 4;
  v.setUint32(o, Math.max(0, Math.round(c.viewTick)), true); o += 4;
  v.setUint8(o, shots.length); o += 1;
  for (const s of shots) {
    const pellets = s.slice(0, MAX_PELLETS);
    v.setUint8(o, pellets.length); o += 1;
    for (const d of pellets) {
      v.setFloat32(o, d.x, true);
      v.setFloat32(o + 4, d.y, true);
      v.setFloat32(o + 8, d.z, true);
      o += 12;
    }
  }
  return buf;
}

/** Returns null for malformed input (never trust the client). */
export function decodeInput(buf: ArrayBuffer): InputCmd | null {
  try {
    const v = new DataView(buf);
    if (v.byteLength < 23 || v.getUint8(0) !== BIN.INPUT) return null;
    let o = 1;
    const seq = v.getUint32(o, true); o += 4;
    const forward = Math.max(-1, Math.min(1, v.getInt8(o))); o += 1;
    const right = Math.max(-1, Math.min(1, v.getInt8(o))); o += 1;
    const b = v.getUint8(o); o += 1;
    const weapon = v.getUint8(o); o += 1;
    const ads = v.getUint8(o); o += 1;
    const yaw = v.getFloat32(o, true); o += 4;
    const pitch = v.getFloat32(o, true); o += 4;
    const viewTick = v.getUint32(o, true); o += 4;
    const nShots = Math.min(v.getUint8(o), MAX_SHOTS_PER_INPUT); o += 1;
    if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) return null;
    const shots: Vec3[][] = [];
    for (let i = 0; i < nShots; i++) {
      const n = Math.min(v.getUint8(o), MAX_PELLETS); o += 1;
      const pellets: Vec3[] = [];
      for (let j = 0; j < n; j++) {
        const d = { x: v.getFloat32(o, true), y: v.getFloat32(o + 4, true), z: v.getFloat32(o + 8, true) };
        o += 12;
        const len = Math.hypot(d.x, d.y, d.z);
        if (!Number.isFinite(len) || len < 0.5 || len > 1.5) continue;
        pellets.push({ x: d.x / len, y: d.y / len, z: d.z / len });
      }
      shots.push(pellets);
    }
    return {
      seq, forward, right,
      jump: (b & 1) !== 0, crouch: (b & 2) !== 0, reload: (b & 4) !== 0,
      weapon, ads, yaw, pitch: Math.max(-1.6, Math.min(1.6, pitch)), viewTick, shots,
    };
  } catch {
    return null; // RangeError from truncated buffers
  }
}

// ───────────────────────── Binary: snapshot ─────────────────────────

export interface SelfState {
  alive: boolean;
  health: number;
  move: MoveState;
}

export interface EntityState {
  id: number;
  alive: boolean;
  onGround: boolean;
  crouched: boolean;
  sliding: boolean;
  pos: Vec3;
  yaw: number;
  pitch: number;
  /** Held weapon index (WEAPON_ORDER). */
  weapon: number;
}

export interface Snapshot {
  tick: number;
  ack: number;
  self: SelfState;
  entities: EntityState[];
}

const SELF_BYTES = 1 + 6 * 4 + 2 * 4 + 1;
const ENTITY_BYTES = 1 + 1 + 1 + 3 * 4 + 2 * 4;

export function encodeSnapshot(s: Snapshot): ArrayBuffer {
  const buf = new ArrayBuffer(1 + 4 + 4 + SELF_BYTES + 1 + s.entities.length * ENTITY_BYTES);
  const v = new DataView(buf);
  let o = 0;
  v.setUint8(o, BIN.SNAPSHOT); o += 1;
  v.setUint32(o, s.tick, true); o += 4;
  v.setUint32(o, s.ack, true); o += 4;
  const m = s.self.move;
  v.setUint8(
    o,
    (s.self.alive ? 1 : 0) | (m.onGround ? 2 : 0) | (m.crouched ? 4 : 0) | (m.sliding ? 8 : 0) |
      (m.slideRequest ? 16 : 0) | (m.prevCrouch ? 32 : 0),
  );
  o += 1;
  for (const n of [m.pos.x, m.pos.y, m.pos.z, m.vel.x, m.vel.y, m.vel.z, m.slideTime, m.slideCooldown]) {
    v.setFloat32(o, n, true);
    o += 4;
  }
  v.setUint8(o, Math.max(0, Math.min(255, Math.ceil(s.self.health)))); o += 1;
  v.setUint8(o, s.entities.length); o += 1;
  for (const e of s.entities) {
    v.setUint8(o, e.id); o += 1;
    v.setUint8(o, (e.alive ? 1 : 0) | (e.onGround ? 2 : 0) | (e.crouched ? 4 : 0) | (e.sliding ? 8 : 0)); o += 1;
    v.setUint8(o, e.weapon); o += 1;
    for (const n of [e.pos.x, e.pos.y, e.pos.z, e.yaw, e.pitch]) {
      v.setFloat32(o, n, true);
      o += 4;
    }
  }
  return buf;
}

export function decodeSnapshot(buf: ArrayBuffer): Snapshot {
  const v = new DataView(buf);
  let o = 1;
  const tick = v.getUint32(o, true); o += 4;
  const ack = v.getUint32(o, true); o += 4;
  const f = v.getUint8(o); o += 1;
  const r = () => {
    const n = v.getFloat32(o, true);
    o += 4;
    return n;
  };
  const pos = { x: r(), y: r(), z: r() };
  const vel = { x: r(), y: r(), z: r() };
  const slideTime = r();
  const slideCooldown = r();
  const health = v.getUint8(o); o += 1;
  const move: MoveState = {
    pos, vel, slideTime, slideCooldown,
    onGround: (f & 2) !== 0, crouched: (f & 4) !== 0, sliding: (f & 8) !== 0,
    slideRequest: (f & 16) !== 0, prevCrouch: (f & 32) !== 0,
  };
  const count = v.getUint8(o); o += 1;
  const entities: EntityState[] = [];
  for (let i = 0; i < count; i++) {
    const id = v.getUint8(o); o += 1;
    const ef = v.getUint8(o); o += 1;
    const weapon = v.getUint8(o); o += 1;
    const p = { x: r(), y: r(), z: r() };
    const yaw = r();
    const pitch = r();
    entities.push({
      id, pos: p, yaw, pitch, weapon,
      alive: (ef & 1) !== 0, onGround: (ef & 2) !== 0, crouched: (ef & 4) !== 0, sliding: (ef & 8) !== 0,
    });
  }
  return { tick, ack, self: { alive: (f & 1) !== 0, health, move }, entities };
}
