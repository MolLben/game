import { B, pt, type Box, type MapDef } from '../map';
import type { Vec3 } from '../math';

/**
 * CANAL — long-range map split by a sunken drainage channel.
 * Two bridges (slide under them!), stair access into the channel, and a
 * sniper tower on each bank. Point-symmetric.
 */
function build(): Box[] {
  const b: Box[] = [];
  const add = (...x: Box[]) => b.push(...x);

  // Banks (top y=0) and the channel floor (top y=-1.5)
  add(B(0, -17.5, 86, 25, -3, 3, 'floor'), B(0, 17.5, 86, 25, -3, 3, 'floor'));
  add(B(0, 0, 86, 10, -3, 1.5, 'concrete'));
  // Outer walls
  add(B(0, -31, 86, 2, -3, 10, 'wall'), B(0, 31, 86, 2, -3, 10, 'wall'));
  add(B(-43, 0, 2, 64, -3, 10, 'wall'), B(43, 0, 2, 64, -3, 10, 'wall'));

  // Stairs into the channel on both banks
  for (const x of [-28, 0, 28]) {
    for (const s of [1, -1]) {
      add(B(x, -4.6 * s, 3, 0.8, -3, 2.5, 'metal'), B(x, -3.8 * s, 3, 0.8, -3, 2, 'metal'));
    }
  }

  // Bridges (top 0.4) — 1.5m clearance underneath: crouch/slide through
  for (const x of [-15, 15]) {
    add(B(x, 0, 4, 10.4, 0, 0.4, 'metal'));
    add(B(x - 1.95, 0, 0.1, 10.4, 0.4, 0.9, 'accent'), B(x + 1.95, 0, 0.1, 10.4, 0.4, 0.9, 'accent'));
  }

  // Cover in the channel
  add(B(-6, 1.5, 1.6, 1.6, -1.5, 1.6, 'crate'), B(6, -1.5, 1.6, 1.6, -1.5, 1.6, 'crate'));
  add(B(-34, -2, 2.6, 1.2, -1.5, 1.2, 'metal'), B(34, 2, 2.6, 1.2, -1.5, 1.2, 'metal'));

  // Each bank (s = -1 north, +1 south via point symmetry)
  for (const s of [1, -1]) {
    // Sniper tower with stairs and parapets
    add(B(-32 * s, -20 * s, 6, 6, 0, 4, 'concrete'));
    for (let i = 0; i < 7; i++) add(B((-29 + 0.4 + 0.8 * i) * s, -20 * s, 0.8, 3, 0, 3.5 - i * 0.5, 'metal'));
    add(B(-32 * s, (-20 + 2.85) * s, 6, 0.3, 4, 1.1, 'wall'));
    add(B(-34.85 * s, -20 * s, 0.3, 6, 4, 1.1, 'wall'));

    // Warehouse block, containers, crates, low walls
    add(B(-12 * s, -21 * s, 10, 6, 0, 4.5, 'wall'));
    add(B(10 * s, -18 * s, 7, 2.6, 0, 2.6, 'container'));
    add(B(22 * s, -24 * s, 2.6, 7, 0, 2.6, 'container'));
    add(B(0, -12 * s, 1.8, 1.8, 0, 1.8, 'crate'), B(1.9 * s, -12.4 * s, 1.4, 1.4, 0, 1.4, 'crate'));
    add(B(-24 * s, -8 * s, 6, 0.6, 0, 1.1, 'wall'), B(30 * s, -9 * s, 5, 0.6, 0, 1.1, 'wall'));
    add(B(-4 * s, -24 * s, 1.6, 1.6, 0, 1.6, 'crate'), B(34 * s, -24 * s, 1.8, 1.8, 0, 1.8, 'crate'));
  }
  return b;
}

/** A point on the north bank plus its point-symmetric twin on the south bank. */
const both = (x: number, z: number, y = 0): Vec3[] => [pt(x, z, y), pt(-x, -z, y)];

export const CANAL: MapDef = {
  id: 'canal',
  name: 'Canal',
  description: 'Long sightlines across a sunken channel. Sniper towers on each bank.',
  size: 42,
  boxes: build(),
  pads: [],
  spawns: [
    ...both(-38, -26), ...both(0, -27), ...both(17, -27), ...both(38, -14), ...both(-38, -12), ...both(-32, -20, 4),
  ],
  waypoints: [
    ...both(-36, -12), ...both(-24, -14), ...both(-12, -12), ...both(0, -9), ...both(12, -12),
    ...both(24, -14), ...both(36, -14), ...both(-20, -27), ...both(8, -26), ...both(36, -27),
    ...both(-15, -8), ...both(15, -8), // bridge ends
    pt(-15, 0, 0.4), pt(15, 0, 0.4), // bridges
    ...both(-28, -7), ...both(0, -7), ...both(28, -7), // stair tops
    pt(-28, 0, -1.5), pt(0, 0, -1.5), pt(28, 0, -1.5), pt(-22, 0, -1.5), pt(22, 0, -1.5), // channel
    ...both(-32, -20, 4), ...both(-23, -20), // towers + stair feet
  ],
  killY: -20,
  theme: {
    sky: '#b7cdd6',
    fogNear: 60,
    fogFar: 170,
    hemiSky: '#e3eef3',
    hemiGround: '#3f453d',
    hemiIntensity: 1.3,
    sun: '#fff7e8',
    sunIntensity: 1.8,
    sunPos: { x: 40, y: 60, z: -30 },
    palette: {
      floor: { base: '#5d635c', minor: '#676d65', major: '#788076' },
      concrete: { base: '#7f7b70', minor: '#89857a', major: '#9a968a' },
      wall: { base: '#4d5a4a', minor: '#566553', major: '#6a7b66' },
    },
  },
};
