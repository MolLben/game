import { B, pt, type Box, type MapDef } from '../map';

/**
 * BUNKER — tight close-quarters complex: a 3×3 grid of rooms joined by
 * doorways, a pillared central hall and two raised platforms.
 * Shotgun and SMG territory.
 */
const CELL = 12;
const LINES = [-6, 6];
const MIDS = [-12, 0, 12];

function build(): Box[] {
  const b: Box[] = [];
  const add = (...x: Box[]) => b.push(...x);

  add(B(0, 0, 40, 40, -1, 1, 'floor'));
  add(B(0, -19, 40, 2, 0, 5, 'concrete'), B(0, 19, 40, 2, 0, 5, 'concrete'));
  add(B(-19, 0, 2, 40, 0, 5, 'concrete'), B(19, 0, 2, 40, 0, 5, 'concrete'));

  // Interior walls with doorways (wider doors into the central hall)
  for (const line of LINES) {
    for (const mid of MIDS) {
      const gap = mid === 0 ? 5 : 2.6;
      const start = mid - CELL / 2;
      const end = mid + CELL / 2;
      const lenA = mid - gap / 2 - start;
      const lenB = end - (mid + gap / 2);
      // Wall running along z at x = line
      add(B(line, start + lenA / 2, 0.6, lenA, 0, 4, 'wall'), B(line, end - lenB / 2, 0.6, lenB, 0, 4, 'wall'));
      // Wall running along x at z = line
      add(B(start + lenA / 2, line, lenA, 0.6, 0, 4, 'wall'), B(end - lenB / 2, line, lenB, 0.6, 0, 4, 'wall'));
    }
  }

  // Central hall pillars
  for (const s of [1, -1]) for (const t of [1, -1]) add(B(3 * s, 3 * t, 1.2, 1.2, 0, 4, 'concrete'));

  for (const s of [1, -1]) {
    // Edge rooms: containers
    add(B(0, 14 * s, 6, 2.4, 0, 2.4, 'container'), B(14 * s, 0, 2.4, 6, 0, 2.4, 'container'));
    // Raised platform in (+,+) and (-,-) corner rooms, with steps toward the center
    add(B(14 * s, 14 * s, 6, 6, 0, 1.5, 'metal'));
    add(B(10.6 * s, 14 * s, 0.8, 3, 0, 1.0, 'metal'), B(9.8 * s, 14 * s, 0.8, 3, 0, 0.5, 'metal'));
    // (+,-) and (-,+) corner rooms: desk wall and crates
    add(B(12 * s, -10 * s, 4, 0.6, 0, 1.1, 'wall'));
    add(B(15.5 * s, -15.5 * s, 1.6, 1.6, 0, 1.6, 'crate'), B(15.5 * s, -13.7 * s, 1.4, 1.4, 0, 1.4, 'crate'));
  }
  // Accent trims above doorways into the hall
  add(B(6, 0, 0.7, 5, 3.6, 0.4, 'accent'), B(-6, 0, 0.7, 5, 3.6, 0.4, 'accent'));
  add(B(0, 6, 5, 0.7, 3.6, 0.4, 'accent'), B(0, -6, 5, 0.7, 3.6, 0.4, 'accent'));
  return b;
}

export const BUNKER: MapDef = {
  id: 'bunker',
  name: 'Bunker',
  description: 'Close-quarters rooms and doorways around a pillared hall.',
  size: 20,
  boxes: build(),
  pads: [],
  spawns: [
    pt(14, 14, 1.5), pt(-14, -14, 1.5), pt(16, -8), pt(-16, 8), pt(8, -16), pt(-8, 16),
    pt(0, 16.8), pt(0, -16.8), pt(16.8, 0), pt(-16.8, 0), pt(8, 8), pt(-8, -8),
  ],
  waypoints: [
    pt(0, 0), pt(6, 0), pt(-6, 0), pt(0, 6), pt(0, -6), // 0-4 hall + hall doors
    pt(6, 12), pt(6, -12), pt(-6, 12), pt(-6, -12), // 5-8 doors on x lines
    pt(12, 6), pt(-12, 6), pt(12, -6), pt(-12, -6), // 9-12 doors on z lines
    pt(10, 0), pt(-10, 0), pt(0, 10), pt(0, -10), // 13-16 edge rooms
    pt(8.5, 8.5), pt(-8.5, -8.5), pt(14, 14, 1.5), pt(-14, -14, 1.5), // 17-20 platform rooms
    pt(12, -14), pt(-12, 14), pt(9, -9), pt(-9, 9), // 21-24 crate rooms
  ],
  killY: -20,
  theme: {
    sky: '#262c3a',
    fogNear: 25,
    fogFar: 80,
    hemiSky: '#a9bbdf',
    hemiGround: '#202228',
    hemiIntensity: 1.0,
    sun: '#cfdcff',
    sunIntensity: 1.5,
    sunPos: { x: 20, y: 50, z: 10 },
    palette: {
      floor: { base: '#3a3d43', minor: '#42464d', major: '#54595f' },
      wall: { base: '#555b66', minor: '#5e6571', major: '#717986' },
      concrete: { base: '#6a6e75', minor: '#74787f', major: '#868a91' },
      accent: { base: '#d94848', minor: '#c23d3d', major: '#a33333' },
    },
  },
};
