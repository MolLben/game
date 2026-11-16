import { PLAYER } from './constants';
import type { Vec3 } from './math';

export interface Aabb {
  min: Vec3;
  max: Vec3;
}

/** Head and body hitboxes for a player standing at `pos` (feet). */
export function getHitboxes(pos: Vec3, crouched: boolean): { head: Aabb; body: Aabb } {
  const h = crouched ? PLAYER.crouchHeight : PLAYER.standHeight;
  const headSize = 0.4;
  const hr = 0.2;
  const br = PLAYER.radius;
  const headBottom = pos.y + h - headSize;
  return {
    head: {
      min: { x: pos.x - hr, y: headBottom, z: pos.z - hr },
      max: { x: pos.x + hr, y: pos.y + h + 0.02, z: pos.z + hr },
    },
    body: {
      min: { x: pos.x - br, y: pos.y, z: pos.z - br },
      max: { x: pos.x + br, y: headBottom, z: pos.z + br },
    },
  };
}

/** Point bots aim at: center of mass. */
export function chestPoint(pos: Vec3, crouched: boolean): Vec3 {
  return { x: pos.x, y: pos.y + (crouched ? 0.7 : 1.15), z: pos.z };
}
