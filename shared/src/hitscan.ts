import { getHitboxes } from './combat';
import type { Box } from './map';
import { forwardFromAngles, type Vec3 } from './math';
import { rayAabb, raycastBoxes } from './physics';

export interface HitTarget {
  id: number;
  pos: Vec3;
  crouched: boolean;
}

export interface TraceResult {
  t: number;
  point: Vec3;
  normal: Vec3 | null;
  /** -1 when no player was hit. */
  targetId: number;
  head: boolean;
}

/** Hitscan ray against map geometry and player hitboxes. */
export function traceShot(
  origin: Vec3,
  dir: Vec3,
  range: number,
  boxes: readonly Box[],
  targets: Iterable<HitTarget>,
  ignoreId: number,
): TraceResult {
  const w = raycastBoxes(origin, dir, range, boxes);
  let best = w ? w.t : range;
  let normal: Vec3 | null = w ? w.normal : null;
  let targetId = -1;
  let head = false;
  for (const tg of targets) {
    if (tg.id === ignoreId) continue;
    const hb = getHitboxes(tg.pos, tg.crouched);
    const h = rayAabb(origin, dir, hb.head.min, hb.head.max, best);
    if (h && h.t < best) {
      best = h.t;
      targetId = tg.id;
      head = true;
      normal = h.normal;
    }
    const b = rayAabb(origin, dir, hb.body.min, hb.body.max, best);
    if (b && b.t < best) {
      best = b.t;
      targetId = tg.id;
      head = false;
      normal = b.normal;
    }
  }
  return {
    t: best,
    point: { x: origin.x + dir.x * best, y: origin.y + dir.y * best, z: origin.z + dir.z * best },
    normal,
    targetId,
    head,
  };
}

/** Fan of [yawOffset, pitchOffset] rays used for melee so swings feel forgiving. */
const MELEE_FAN: [number, number][] = [
  [0, 0], [0.22, 0], [-0.22, 0], [0, 0.15], [0, -0.15], [0.4, 0], [-0.4, 0],
];

/** Short-range melee check: nearest player hit by any ray in the fan. */
export function meleeTrace(
  origin: Vec3,
  yaw: number,
  pitch: number,
  range: number,
  boxes: readonly Box[],
  targets: readonly HitTarget[],
  ignoreId: number,
): TraceResult {
  let first: TraceResult | null = null;
  let best: TraceResult | null = null;
  for (const [dy, dp] of MELEE_FAN) {
    const r = traceShot(origin, forwardFromAngles(yaw + dy, pitch + dp), range, boxes, targets, ignoreId);
    first ??= r;
    if (r.targetId >= 0 && (!best || r.t < best.t)) best = r;
  }
  return best ?? first!;
}
