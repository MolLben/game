export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type Axis = 'x' | 'y' | 'z';
export const AXES: readonly Axis[] = ['x', 'y', 'z'];

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function copyVec(out: Vec3, a: Vec3): Vec3 {
  out.x = a.x;
  out.y = a.y;
  out.z = a.z;
  return out;
}

export function horizontalSpeed(v: Vec3): number {
  return Math.hypot(v.x, v.z);
}

export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z);
  if (l > 1e-9) {
    v.x /= l;
    v.y /= l;
    v.z /= l;
  }
  return v;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Shortest signed angle from b to a, wrapped to [-PI, PI]. */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * View direction for a yaw/pitch pair. Matches a Three.js camera with
 * rotation order 'YXZ' looking down -Z at yaw = 0.
 */
export function forwardFromAngles(yaw: number, pitch: number, out: Vec3 = vec3()): Vec3 {
  const cp = Math.cos(pitch);
  out.x = -Math.sin(yaw) * cp;
  out.y = Math.sin(pitch);
  out.z = -Math.cos(yaw) * cp;
  return out;
}

export function rightFromYaw(yaw: number, out: Vec3 = vec3()): Vec3 {
  out.x = Math.cos(yaw);
  out.y = 0;
  out.z = -Math.sin(yaw);
  return out;
}

export function upFromAngles(yaw: number, pitch: number, out: Vec3 = vec3()): Vec3 {
  const sp = Math.sin(pitch);
  out.x = Math.sin(yaw) * sp;
  out.y = Math.cos(pitch);
  out.z = Math.cos(yaw) * sp;
  return out;
}

/** Yaw that faces from `from` towards `to` (horizontal only). */
export function yawTowards(from: Vec3, to: Vec3): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

export function pitchTowards(from: Vec3, to: Vec3): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  return Math.atan2(to.y - from.y, Math.hypot(dx, dz));
}

/** Random direction inside a cone of half-angle `spread` around the view direction. */
export function spreadDirection(yaw: number, pitch: number, spread: number, rand: () => number = Math.random): Vec3 {
  const f = forwardFromAngles(yaw, pitch);
  if (spread <= 0) return f;
  const r = rightFromYaw(yaw);
  const u = upFromAngles(yaw, pitch);
  const a = rand() * Math.PI * 2;
  const m = spread * Math.sqrt(rand());
  const cx = Math.cos(a) * m;
  const cy = Math.sin(a) * m;
  return normalize({ x: f.x + r.x * cx + u.x * cy, y: f.y + r.y * cx + u.y * cy, z: f.z + r.z * cx + u.z * cy });
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
