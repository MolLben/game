import { PLAYER } from './constants';
import type { Box } from './map';
import type { Axis, Vec3 } from './math';

const EPS = 1e-4;

export function overlapsBox(pos: Vec3, height: number, b: Box): boolean {
  const r = PLAYER.radius;
  return (
    pos.x - r < b.max.x &&
    pos.x + r > b.min.x &&
    pos.y < b.max.y &&
    pos.y + height > b.min.y &&
    pos.z - r < b.max.z &&
    pos.z + r > b.min.z
  );
}

export function overlapsAny(pos: Vec3, height: number, boxes: readonly Box[]): boolean {
  for (const b of boxes) if (overlapsBox(pos, height, b)) return true;
  return false;
}

/**
 * Moves the player AABB along one axis and resolves penetration.
 * Horizontal moves may step up onto ledges up to PLAYER.stepHeight.
 * Returns true if the move was blocked.
 */
export function moveAxis(
  pos: Vec3,
  axis: Axis,
  amount: number,
  height: number,
  boxes: readonly Box[],
  canStep: boolean,
): boolean {
  if (amount === 0) return false;
  pos[axis] += amount;
  let blocked = false;
  const r = PLAYER.radius;
  for (const b of boxes) {
    if (!overlapsBox(pos, height, b)) continue;
    if (axis !== 'y' && canStep) {
      const rise = b.max.y - pos.y;
      if (rise > 0 && rise <= PLAYER.stepHeight) {
        const oldY = pos.y;
        pos.y = b.max.y + EPS;
        if (!overlapsAny(pos, height, boxes)) continue;
        pos.y = oldY;
      }
    }
    if (axis === 'y') {
      pos.y = amount > 0 ? b.min.y - height - EPS : b.max.y + EPS;
    } else {
      pos[axis] = amount > 0 ? b.min[axis] - r - EPS : b.max[axis] + r + EPS;
    }
    blocked = true;
  }
  return blocked;
}

export interface RayHit {
  t: number;
  normal: Vec3;
}

/** Slab-method ray vs AABB. Returns entry distance and surface normal. */
export function rayAabb(o: Vec3, d: Vec3, min: Vec3, max: Vec3, maxT: number): RayHit | null {
  let tmin = 0;
  let tmax = maxT;
  let nAxis: Axis | null = null;
  let nSign = 0;
  for (const k of ['x', 'y', 'z'] as const) {
    const od = d[k];
    if (Math.abs(od) < 1e-9) {
      if (o[k] < min[k] || o[k] > max[k]) return null;
      continue;
    }
    const inv = 1 / od;
    let t1 = (min[k] - o[k]) * inv;
    let t2 = (max[k] - o[k]) * inv;
    let s = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      s = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      nAxis = k;
      nSign = s;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  const normal = { x: 0, y: 0, z: 0 };
  if (nAxis) normal[nAxis] = nSign;
  else normal.y = 1;
  return { t: tmin, normal };
}

export function raycastBoxes(
  o: Vec3,
  d: Vec3,
  maxT: number,
  boxes: readonly Box[],
): (RayHit & { box: Box }) | null {
  let best: (RayHit & { box: Box }) | null = null;
  let bestT = maxT;
  for (const b of boxes) {
    const h = rayAabb(o, d, b.min, b.max, bestT);
    if (h && h.t < bestT) {
      bestT = h.t;
      best = { ...h, box: b };
    }
  }
  return best;
}
