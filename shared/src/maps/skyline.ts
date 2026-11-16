import { B, PAD, pt, type Box, type MapDef } from '../map';

/**
 * SKYLINE — sunset rooftops above a lethal drop.
 * Ring of rooftops linked by stepped bridges; a central tower reachable by
 * bridges or by jump pads on the north/south roofs. Falling = death.
 */
const tower = (cx: number, cz: number, w: number, d: number, top: number): Box =>
  B(cx, cz, w, d, -30, top + 30, 'concrete');

/** Stepped plank bridge along x (axis 'x') or z, from `start` to `end`, tops descending from t0 by 0.5. */
function planks(axis: 'x' | 'z', fixed: number, start: number, end: number, tops: number[]): Box[] {
  const n = tops.length;
  const len = (end - start) / n;
  return tops.map((top, i) => {
    const c = start + len * (i + 0.5);
    const w = Math.abs(len);
    return axis === 'x' ? B(c, fixed, w, 3, top - 0.4, 0.4, 'metal') : B(fixed, c, 3, w, top - 0.4, 0.4, 'metal');
  });
}

function build(): Box[] {
  const b: Box[] = [];
  const add = (...x: Box[]) => b.push(...x);

  // Rooftops
  add(tower(0, 0, 14, 14, 6)); // central tower
  for (const s of [1, -1]) {
    add(tower(22 * s, 0, 8, 14, 4)); // side roofs (east/west)
    add(tower(0, 22 * s, 14, 8, 3)); // north/south roofs
    for (const t of [1, -1]) add(tower(20 * s, 20 * t, 12, 12, 2)); // corner roofs
  }

  for (const s of [1, -1]) {
    // Tower ↔ side roof (descending 6 → 4)
    add(...planks('x', 0, 7 * s, 18 * s, [5.5, 5, 4.5, 4]));
    for (const t of [1, -1]) {
      // Side roof ↔ corner roof (4 → 2)
      add(...planks('z', 22 * s, 7 * t, 14 * t, [3.5, 3, 2.5, 2]));
      // North/south roof ↔ corner roof (3 → 2)
      add(...planks('x', 22 * t, 7 * s, 14 * s, [2.5, 2]));
    }
  }

  // Cover: tower top
  add(B(0, 0, 3, 3, 6, 1.4, 'metal'));
  add(B(-4, 4, 1.5, 1.5, 6, 1.5, 'crate'), B(4, -4, 1.5, 1.5, 6, 1.5, 'crate'));
  for (const s of [1, -1]) for (const t of [1, -1]) add(B(5.5 * s, 6.6 * t, 3, 0.4, 6, 0.9, 'wall'));

  for (const s of [1, -1]) {
    // Side roofs
    add(B(23.5 * s, 4 * s, 2, 2.5, 4, 1.6, 'metal'), B(20 * s, -4 * s, 1.4, 1.4, 4, 1.4, 'crate'));
    // North/south roofs
    add(B(-4.5 * s, 24 * s, 1.6, 1.6, 3, 1.6, 'crate'), B(4.5 * s, 23 * s, 2, 1.2, 3, 1.1, 'metal'));
    for (const t of [1, -1]) {
      // Corner roofs: water tank, crate, outer parapets
      add(B(23 * s, 23 * t, 3, 3, 2, 3, 'metal'));
      add(B(17 * s, 17 * t, 1.6, 1.6, 2, 1.6, 'crate'));
      add(B(25.8 * s, 20 * t, 0.4, 12, 2, 0.8, 'wall'), B(20 * s, 25.8 * t, 12, 0.4, 2, 0.8, 'wall'));
    }
  }

  // Distant skyline (out of reach, just for atmosphere and cover from the sun)
  const far: [number, number, number, number][] = [
    [-55, -30, 10, 18], [-48, 20, 8, 26], [-60, 50, 12, 12], [50, -45, 10, 22], [58, 10, 9, 30],
    [45, 52, 12, 16], [-15, -60, 14, 20], [20, -58, 9, 28], [10, 62, 12, 24], [-35, 60, 8, 18],
    [62, -12, 7, 14], [-62, -2, 9, 34],
  ];
  for (const [x, z, w, top] of far) add(B(x, z, w, w, -30, top + 30, 'wall'));
  return b;
}

export const SKYLINE: MapDef = {
  id: 'skyline',
  name: 'Skyline',
  description: 'Sunset rooftops over a deadly drop. Jump pads, bridges, verticality.',
  size: 30,
  boxes: build(),
  pads: [PAD(0, 20, 2, 2, 3, { x: 0, y: 13, z: -19 }), PAD(0, -20, 2, 2, 3, { x: 0, y: 13, z: 19 })],
  spawns: [
    pt(20, 18, 2), pt(-20, -18, 2), pt(20, -18, 2), pt(-20, 18, 2),
    pt(16, 23, 2), pt(-16, -23, 2), pt(16, -23, 2), pt(-16, 23, 2),
    pt(24, -2, 4), pt(-24, 2, 4), pt(2, 25, 3), pt(-2, -25, 3),
  ],
  waypoints: [
    pt(0, 4.5, 6), pt(0, -4.5, 6), pt(5, 0, 6), pt(-5, 0, 6), // 0-3 tower
    pt(11, 0, 5), pt(-11, 0, 5), // 4-5 tower bridges
    pt(22, 0, 4), pt(-22, 0, 4), // 6-7 side roofs
    pt(22, 9.6, 3), pt(22, -9.6, 3), pt(-22, 9.6, 3), pt(-22, -9.6, 3), // 8-11 side↔corner bridges
    pt(20, 20, 2), pt(20, -20, 2), pt(-20, 20, 2), pt(-20, -20, 2), // 12-15 corners
    pt(0, 23.5, 3), pt(0, -23.5, 3), // 16-17 north/south roofs
    pt(0, 20, 3), pt(0, -20, 3), // 18-19 jump pads
    pt(9, 22, 2.5), pt(-9, 22, 2.5), pt(9, -22, 2.5), pt(-9, -22, 2.5), // 20-23 roof↔corner bridges
  ],
  // Jump pads launch onto the tower
  extraLinks: [[18, 0], [19, 1]],
  killY: -12,
  theme: {
    sky: '#f4b183',
    fogNear: 70,
    fogFar: 230,
    hemiSky: '#ffe0c2',
    hemiGround: '#3d3342',
    hemiIntensity: 1.05,
    sun: '#ffb06a',
    sunIntensity: 2.8,
    sunPos: { x: -60, y: 30, z: -40 },
    palette: {
      concrete: { base: '#8b8f9a', minor: '#969aa5', major: '#a7abb5' },
      wall: { base: '#4a3f5c', minor: '#54486a', major: '#665a80' },
      metal: { base: '#3b4250', minor: '#454d5c', major: '#5a6475' },
    },
  },
};
