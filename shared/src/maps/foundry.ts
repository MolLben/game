import { B, type Box, type MapDef } from '../map';
import type { Vec3 } from '../math';

/**
 * FOUNDRY — original 64x64m blockout arena.
 * Point-symmetric layout: a raised center platform linked by bridges to two
 * side towers, four corner decks, window walls and crate clusters for cover.
 */
function build(): Box[] {
  const boxes: Box[] = [];
  const add = (...b: Box[]) => boxes.push(...b);

  // Floor and outer walls
  add(B(0, 0, 72, 72, -1, 1, 'floor'));
  add(B(0, -33, 68, 2, 0, 9, 'wall'), B(0, 33, 68, 2, 0, 9, 'wall'));
  add(B(-33, 0, 2, 68, 0, 9, 'wall'), B(33, 0, 2, 68, 0, 9, 'wall'));

  // Center platform (top at y=3) with stairs north and south
  add(B(0, 0, 10, 10, 0, 3, 'concrete'));
  for (let i = 0; i < 5; i++) {
    const h = 2.5 - i * 0.5;
    add(B(0, 5.4 + i * 0.8, 3, 0.8, 0, h, 'metal'));
    add(B(0, -5.4 - i * 0.8, 3, 0.8, 0, h, 'metal'));
  }
  add(B(-3.6, 0, 1, 2.4, 3, 1.1, 'crate'), B(3.6, 0, 1, 2.4, 3, 1.1, 'crate'));

  // Bridges to side towers (deck top y=3), with rails
  for (const s of [1, -1]) {
    add(B(10 * s, 0, 10, 2.4, 2.6, 0.4, 'metal'));
    add(B(10 * s, 1.15, 10, 0.1, 3, 0.9, 'accent'), B(10 * s, -1.15, 10, 0.1, 3, 0.9, 'accent'));
    // Tower
    add(B(17 * s, 0, 4, 8, 0, 3, 'concrete'));
    add(B(17 * s + 1.7 * s, 0, 0.6, 8, 3, 1.1, 'wall'));
    // Tower stairs: east tower descends to +z, west tower to -z
    for (let i = 0; i < 5; i++) {
      add(B(17 * s, (4.4 + i * 0.8) * s, 3, 0.8, 0, 2.5 - i * 0.5, 'metal'));
    }
  }

  // Corner decks (top y=2.5) with stairs toward the middle and a parapet
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      add(B(22 * sx, 22 * sz, 9, 9, 0, 2.5, 'concrete'));
      for (let i = 0; i < 4; i++) {
        add(B(22 * sx, 22 * sz - sz * (4.9 + i * 0.8), 3, 0.8, 0, 2 - i * 0.5, 'metal'));
      }
      add(B(22 * sx - sx * 4.25, 22 * sz + sz * 1.5, 0.5, 6, 2.5, 1.1, 'wall'));
    }
  }

  // Window walls (sill 1.0m, window to 2.0m, top to 3.4m)
  const windowWall = (cx: number, cz: number) => {
    add(B(cx, cz, 10, 0.8, 0, 1.0, 'wall'));
    add(B(cx, cz, 10, 0.8, 2.0, 1.4, 'wall'));
    add(B(cx - 4.6, cz, 0.8, 0.8, 1.0, 1.0, 'wall'), B(cx + 4.6, cz, 0.8, 0.8, 1.0, 1.0, 'wall'));
    add(B(cx, cz, 0.6, 0.8, 1.0, 1.0, 'wall'));
  };
  windowWall(-12, -14);
  windowWall(12, 14);

  // Shipping containers
  add(B(0, -24, 7, 2.6, 0, 2.6, 'container'), B(0, 24, 7, 2.6, 0, 2.6, 'container'));
  add(B(26, 0, 2.6, 7, 0, 2.6, 'container'), B(-26, 0, 2.6, 7, 0, 2.6, 'container'));
  add(B(1.5, -24, 3, 2.6, 2.6, 2.4, 'container'), B(-1.5, 24, 3, 2.6, 2.6, 2.4, 'container'));

  // Crate clusters
  add(B(8, 9, 1.6, 1.6, 0, 1.6, 'crate'), B(9.7, 9, 1.6, 1.6, 0, 1.6, 'crate'), B(8.8, 9, 1.2, 1.2, 1.6, 1.2, 'crate'));
  add(B(-8, -9, 1.6, 1.6, 0, 1.6, 'crate'), B(-9.7, -9, 1.6, 1.6, 0, 1.6, 'crate'), B(-8.8, -9, 1.2, 1.2, 1.6, 1.2, 'crate'));
  add(B(-9, 8, 2, 2, 0, 2, 'crate'), B(9, -8, 2, 2, 0, 2, 'crate'));
  add(B(12, -14, 2, 2, 0, 2, 'crate'), B(14.2, -12.8, 1.4, 1.4, 0, 1.4, 'crate'));
  add(B(-12, 14, 2, 2, 0, 2, 'crate'), B(-14.2, 12.8, 1.4, 1.4, 0, 1.4, 'crate'));
  add(B(24, -10, 1.8, 1.8, 0, 1.8, 'crate'), B(-24, 10, 1.8, 1.8, 0, 1.8, 'crate'));
  add(B(0, 29, 5, 0.6, 0, 1.2, 'wall'), B(0, -29, 5, 0.6, 0, 1.2, 'wall'));

  return boxes;
}

const g = (x: number, z: number, y = 0.05): Vec3 => ({ x, y, z });

export const FOUNDRY: MapDef = {
  id: 'foundry',
  name: 'Foundry',
  description: 'Industrial yard. Raised center, side towers, mixed ranges.',
  size: 34,
  boxes: build(),
  pads: [],
  spawns: [
    g(29, 29), g(-29, -29), g(29, -29), g(-29, 29),
    g(0, 30.5), g(0, -30.5), g(29, 10), g(-29, -10),
    g(12, 28), g(-12, -28), g(-29, 18), g(29, -18),
    g(22, 22, 2.55), g(-22, -22, 2.55),
  ],
  waypoints: [
    g(0, 12), g(0, -12), g(12, 0), g(-12, 0), g(20, 10), g(-20, -10),
    g(10, -20), g(-10, 20), g(28, 28), g(-28, -28), g(28, -28), g(-28, 28),
    g(6, 18), g(-6, -18), g(18, -6), g(-18, 6), g(0, 28), g(0, -28),
    g(28, 8), g(-28, -8), g(14, 22), g(-14, -22), g(-22, 12.5), g(22, -12.5),
    // Elevated routes: center platform, bridges, towers, corner decks
    g(0, 0, 3.05), g(10, 0, 3.05), g(-10, 0, 3.05), g(16, 0, 3.05), g(-16, 0, 3.05),
    g(17, 9.5), g(-17, -9.5),
    g(22, 22, 2.55), g(-22, -22, 2.55), g(22, -22, 2.55), g(-22, 22, 2.55),
    // Perimeter
    g(28, -12), g(-28, 12), g(12, -28), g(-12, 28),
  ],
  killY: -20,
  theme: {
    sky: '#8fb3d9',
    fogNear: 70,
    fogFar: 160,
    hemiSky: '#cfe0ff',
    hemiGround: '#3a3530',
    hemiIntensity: 1.1,
    sun: '#fff1d6',
    sunIntensity: 2.4,
    sunPos: { x: 30, y: 55, z: 18 },
  },
};
