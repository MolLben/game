import { PLAYER } from './constants';
import type { Box, MapDef } from './map';
import type { Vec3 } from './math';
import { raycastBoxes } from './physics';

/** Directed waypoint graph bots use to get around (stairs, bridges, jump pads). */
export interface NavGraph {
  points: Vec3[];
  links: number[][];
}

const DOWN = { x: 0, y: -1, z: 0 };
const UP = { x: 0, y: 1, z: 0 };
const MAX_LINK = 22;
const SAMPLE = 0.4;
const MAX_DROP = 2.0;

/** Ground height at (x, z) for someone whose feet are at `y` (null = no ground / void). */
export function groundBelow(x: number, y: number, z: number, boxes: readonly Box[], maxDrop = MAX_DROP): number | null {
  const top = y + 0.6;
  const hit = raycastBoxes({ x, y: top, z }, DOWN, 0.6 + maxDrop, boxes);
  return hit ? top - hit.t : null;
}

/** Can a standing player walk (no jumping) from a to b? Handles stairs and small drops. */
export function walkable(a: Vec3, b: Vec3, boxes: readonly Box[]): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-3) return Math.abs(a.y - b.y) < 0.6;
  const n = Math.ceil(dist / SAMPLE);
  const dir = { x: dx / dist, y: 0, z: dz / dist };
  let y = a.y;
  let px = a.x;
  let pz = a.z;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const x = a.x + dx * t;
    const z = a.z + dz * t;
    // Knee-height obstruction between samples (thin walls, railings)
    if (raycastBoxes({ x: px, y: y + 0.7, z: pz }, dir, dist / n, boxes)) return false;
    const gy = groundBelow(x, y, z, boxes);
    if (gy === null) return false; // void or big drop
    if (gy > y + PLAYER.stepHeight + 1e-3) return false; // wall / too high
    // Standing headroom
    if (raycastBoxes({ x, y: gy + 0.05, z }, UP, PLAYER.standHeight - 0.05, boxes)) return false;
    y = gy;
    px = x;
    pz = z;
  }
  return Math.abs(y - b.y) < 0.6;
}

const cache = new Map<string, NavGraph>();

/** Builds (and caches) the waypoint graph for a map by testing walkability between nearby points. */
export function navGraph(map: MapDef): NavGraph {
  const cached = cache.get(map.id);
  if (cached) return cached;
  const points = map.waypoints;
  const links: number[][] = points.map(() => []);
  for (let i = 0; i < points.length; i++) {
    for (let j = 0; j < points.length; j++) {
      if (i === j) continue;
      const a = points[i];
      const b = points[j];
      if (Math.hypot(a.x - b.x, a.z - b.z) > MAX_LINK) continue;
      if (walkable(a, b, map.boxes)) links[i].push(j);
    }
  }
  for (const [from, to] of map.extraLinks ?? []) if (!links[from].includes(to)) links[from].push(to);
  const g = { points, links };
  cache.set(map.id, g);
  return g;
}

/** Nearest waypoint that is roughly on the same level and in view. */
export function nearestNode(g: NavGraph, pos: Vec3, boxes: readonly Box[]): number {
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < g.points.length; i++) {
    const p = g.points[i];
    const score = Math.hypot(p.x - pos.x, p.z - pos.z) + Math.abs(p.y - pos.y) * 3;
    if (score >= bestScore) continue;
    const a = { x: pos.x, y: pos.y + 1, z: pos.z };
    const d = { x: p.x - a.x, y: p.y + 1 - a.y, z: p.z - a.z };
    const len = Math.hypot(d.x, d.y, d.z);
    const blocked = len > 0.1 && raycastBoxes(a, { x: d.x / len, y: d.y / len, z: d.z / len }, len - 0.05, boxes);
    if (blocked) continue;
    best = i;
    bestScore = score;
  }
  if (best >= 0) return best;
  // Fallback: plain nearest
  for (let i = 0; i < g.points.length; i++) {
    const p = g.points[i];
    const score = Math.hypot(p.x - pos.x, p.z - pos.z) + Math.abs(p.y - pos.y) * 3;
    if (score < bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return best;
}

/** Breadth-first path of node indices (excluding `from`), or null if unreachable. */
export function findPath(g: NavGraph, from: number, to: number): number[] | null {
  if (from === to) return [to];
  const prev = new Array<number>(g.points.length).fill(-1);
  const seen = new Uint8Array(g.points.length);
  const queue = [from];
  seen[from] = 1;
  while (queue.length) {
    const n = queue.shift()!;
    for (const m of g.links[n]) {
      if (seen[m]) continue;
      seen[m] = 1;
      prev[m] = n;
      if (m === to) {
        const path = [to];
        let c = n;
        while (c !== from) {
          path.unshift(c);
          c = prev[c];
        }
        return path;
      }
      queue.push(m);
    }
  }
  return null;
}
