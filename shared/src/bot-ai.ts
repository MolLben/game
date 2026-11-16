import { chestPoint } from './combat';
import { MATCH } from './constants';
import type { Box } from './map';
import {
  angleDiff,
  clamp,
  distance,
  horizontalSpeed,
  normalize,
  pitchTowards,
  spreadDirection,
  yawTowards,
  type Vec3,
} from './math';
import { eyeHeight, type MoveInput, type MoveState } from './movement';
import { findPath, groundBelow, nearestNode, type NavGraph } from './nav';
import { PRIMARY_WEAPONS, type WeaponDef, type WeaponId } from './weapons';

/** [too close, too far] engagement distances per weapon. */
const PREFERRED_RANGE: Record<WeaponId, [number, number]> = {
  rifle: [7, 22], smg: [4, 13], shotgun: [2, 7], sniper: [14, 40], pistol: [6, 18], knife: [0, 1.5],
};

export function randomPrimary(): WeaponId {
  return PRIMARY_WEAPONS[Math.floor(Math.random() * PRIMARY_WEAPONS.length)];
}

/** Tuning for how dangerous bots are. */
export const BOT_TUNING = {
  viewRange: 55,
  turnRate: 7,
  reactionMin: 0.3,
  reactionMax: 0.65,
  baseSpread: 0.035,
  moveSpreadPerMs: 0.004,
  damageScale: 0.55,
  speedMult: 0.92,
};

export interface BotActor {
  id: number;
  move: MoveState;
  yaw: number;
  pitch: number;
  alive: boolean;
  spawnTime: number;
}

export interface BotWorld {
  boxes: readonly Box[];
  nav: NavGraph;
  time: number;
  fighters: readonly BotActor[];
  lineOfSight(a: Vec3, b: Vec3): boolean;
}

export interface BotDecision {
  input: MoveInput;
  fireAt: BotActor | null;
}

/** Engine-agnostic bot AI. Runs on the server (online) or client (practice). */
export class BotBrain {
  private target: BotActor | null = null;
  private retarget = 0;
  private reaction = 0;
  private fireCd = 0;
  private burst = 0;
  private strafeDir = 0;
  private strafeT = 0;
  /** Remaining waypoint indices to walk through. */
  private path: number[] = [];
  private stuck = 0;

  reset(): void {
    this.target = null;
    this.path = [];
    this.burst = 0;
    this.stuck = 0;
  }

  onDamaged(self: BotActor, attacker: BotActor | null): void {
    if (attacker && attacker !== self && attacker.alive && (!this.target || Math.random() < 0.6)) {
      this.target = attacker;
      this.retarget = 0.6;
      this.reaction = Math.min(this.reaction, 0.25);
    }
  }

  private findTarget(self: BotActor, world: BotWorld): BotActor | null {
    const eye = eyeOf(self);
    let best: BotActor | null = null;
    let bestD = BOT_TUNING.viewRange;
    for (const o of world.fighters) {
      if (o === self || !o.alive || world.time - o.spawnTime < MATCH.spawnProtection) continue;
      const c = chestPoint(o.move.pos, o.move.crouched);
      let d = distance(eye, c);
      if (o === this.target) d *= 0.7;
      if (d >= bestD) continue;
      const ang = Math.abs(angleDiff(yawTowards(eye, c), self.yaw));
      if (ang > 2.0 && d > 8) continue;
      if (!world.lineOfSight(eye, c)) continue;
      best = o;
      bestD = d;
    }
    return best;
  }

  private repath(self: BotActor, world: BotWorld): void {
    const g = world.nav;
    this.stuck = 0;
    if (!g.points.length) {
      this.path = [];
      return;
    }
    const from = nearestNode(g, self.move.pos, world.boxes);
    let goal = Math.floor(Math.random() * g.points.length);
    if (goal === from) goal = (goal + 1) % g.points.length;
    this.path = [from, ...(findPath(g, from, goal) ?? [])];
  }

  think(self: BotActor, world: BotWorld, dt: number, weapon: WeaponDef): BotDecision {
    const out: BotDecision = { input: { forward: 0, right: 0, jump: false, crouch: false, yaw: self.yaw }, fireAt: null };
    this.retarget -= dt;
    if (this.retarget <= 0) {
      this.retarget = 0.2 + Math.random() * 0.1;
      const prev = this.target;
      this.target = this.findTarget(self, world);
      if (this.target && this.target !== prev) {
        this.reaction = BOT_TUNING.reactionMin + Math.random() * (BOT_TUNING.reactionMax - BOT_TUNING.reactionMin);
        if (weapon.scoped) this.reaction += 0.35; // snipers take time to line up
      }
    }
    if (this.target && !this.target.alive) this.target = null;

    const eye = eyeOf(self);
    const turn = BOT_TUNING.turnRate * dt;
    const input = out.input;

    if (this.target) {
      const t = this.target;
      const c = chestPoint(t.move.pos, t.move.crouched);
      const dy = angleDiff(yawTowards(eye, c), self.yaw);
      self.yaw += clamp(dy, -turn, turn);
      self.pitch += clamp(pitchTowards(eye, c) - self.pitch, -turn, turn);

      this.strafeT -= dt;
      if (this.strafeT <= 0) {
        this.strafeT = 0.4 + Math.random() * 1.0;
        this.strafeDir = [-1, 0, 1][Math.floor(Math.random() * 3)];
      }
      const d = distance(eye, c);
      const [near, far] = PREFERRED_RANGE[weapon.id];
      input.forward = d > far ? 1 : d < near ? -1 : 0;
      input.right = this.strafeDir;
      input.yaw = self.yaw;
      if (Math.random() < 0.004) input.jump = true;
      this.path = []; // re-plan a route once the fight is over
      if (!safeToMove(self, input, world.boxes)) {
        input.forward = 0;
        input.right = 0;
        input.jump = false;
        this.strafeDir = -this.strafeDir;
      } else if (input.jump && !safeToMove(self, input, world.boxes, true)) {
        input.jump = false;
      }

      this.reaction -= dt;
      this.fireCd -= dt;
      if (this.reaction <= 0 && Math.abs(dy) < 0.15 && this.fireCd <= 0 && d <= weapon.range) {
        out.fireAt = t;
        if (weapon.auto) {
          if (this.burst <= 0) this.burst = 3 + Math.floor(Math.random() * 4);
          this.burst--;
          this.fireCd = this.burst > 0 ? (60 / weapon.rpm) * 1.25 : 0.45 + Math.random() * 0.5;
        } else {
          this.fireCd = 60 / weapon.rpm + 0.12 + Math.random() * 0.35;
        }
      }
    } else {
      // Follow the navigation graph between waypoints
      const g = world.nav;
      const pos = self.move.pos;
      if (this.path.length === 0 || this.stuck > 1.5) this.repath(self, world);
      let node = this.path.length ? g.points[this.path[0]] : null;
      if (node && Math.hypot(node.x - pos.x, node.z - pos.z) < 1.2 && Math.abs(node.y - pos.y) < 1.2) {
        this.path.shift();
        node = this.path.length ? g.points[this.path[0]] : null;
      }
      if (node) {
        const dy = angleDiff(yawTowards(pos, node), self.yaw);
        self.yaw += clamp(dy, -turn * 0.8, turn * 0.8);
        input.forward = Math.abs(dy) < 0.8 ? 1 : 0.15;
      }
      self.pitch *= 0.9;
      input.yaw = self.yaw;
      if (!safeToMove(self, input, world.boxes)) {
        input.forward = 0;
        this.path = [];
      }
      if (self.move.onGround && horizontalSpeed(self.move.vel) < 1) {
        this.stuck += dt;
        if (this.stuck > 0.6 && safeToMove(self, { ...input, forward: 1 }, world.boxes, true)) input.jump = true;
      } else {
        this.stuck = Math.max(0, this.stuck - dt);
      }
    }
    return out;
  }
}

const WALK_PROBES = [0.7, 1.4];
/** A running jump covers ~4.5m, so check the whole flight path. */
const JUMP_PROBES = [0.7, 1.4, 2.4, 3.4, 4.4, 5.4];

function groundAlong(p: Vec3, dx: number, dz: number, dists: number[], boxes: readonly Box[]): boolean {
  for (const d of dists) {
    if (groundBelow(p.x + dx * d, p.y, p.z + dz * d, boxes, 2.0) === null) return false;
  }
  return true;
}

/**
 * False if this input (or the bot's current momentum) would carry it off a
 * ledge into a deadly drop. With `jumping`, the whole jump arc is checked.
 */
function safeToMove(self: BotActor, input: MoveInput, boxes: readonly Box[], jumping = false): boolean {
  if (!self.move.onGround) return true;
  const p = self.move.pos;
  const probes = jumping ? JUMP_PROBES : WALK_PROBES;
  const v = self.move.vel;
  const hs = Math.hypot(v.x, v.z);
  if (hs > 3 && !groundAlong(p, v.x / hs, v.z / hs, probes, boxes)) return false;
  const mag = Math.hypot(input.forward, input.right);
  if (mag < 0.01) return true;
  const sy = Math.sin(input.yaw);
  const cy = Math.cos(input.yaw);
  const wx = (-sy * input.forward + cy * input.right) / mag;
  const wz = (-cy * input.forward - sy * input.right) / mag;
  return groundAlong(p, wx, wz, probes, boxes);
}

export function eyeOf(a: { move: MoveState }): Vec3 {
  return { x: a.move.pos.x, y: a.move.pos.y + eyeHeight(a.move), z: a.move.pos.z };
}

/** Inaccurate shot direction(s) from a bot at `origin` toward `target`'s chest (one per pellet). */
export function botShotDirections(
  origin: Vec3,
  targetPos: Vec3,
  target: BotActor,
  shooterAirborne: boolean,
  weapon: WeaponDef,
): Vec3[] {
  const aim = chestPoint(targetPos, target.move.crouched);
  const dir = normalize({ x: aim.x - origin.x, y: aim.y - origin.y, z: aim.z - origin.z });
  const yaw = Math.atan2(-dir.x, -dir.z);
  const pitch = Math.asin(clamp(dir.y, -1, 1));
  const spread =
    BOT_TUNING.baseSpread + horizontalSpeed(target.move.vel) * BOT_TUNING.moveSpreadPerMs + (shooterAirborne ? 0.03 : 0);
  const center = spreadDirection(yaw, pitch, spread);
  if (weapon.pellets <= 1) return [center];
  const cy = Math.atan2(-center.x, -center.z);
  const cp = Math.asin(clamp(center.y, -1, 1));
  return Array.from({ length: weapon.pellets }, () => spreadDirection(cy, cp, weapon.spreadHip));
}
