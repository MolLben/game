import type { Vec3 } from './math';

export type MaterialId = 'floor' | 'wall' | 'concrete' | 'crate' | 'container' | 'metal' | 'accent';

/** Axis-aligned solid box. All map collision is built from these. */
export interface Box {
  min: Vec3;
  max: Vec3;
  mat: MaterialId;
}

/**
 * Flat trigger on a walkable surface: stepping on it while grounded sets the
 * player's velocity to `launch`. Part of the deterministic movement sim.
 */
export interface JumpPad {
  min: Vec3;
  max: Vec3;
  launch: Vec3;
}

export interface GridColors {
  base: string;
  minor: string;
  major: string;
}

export interface MapTheme {
  sky: string;
  fogNear: number;
  fogFar: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  sun: string;
  sunIntensity: number;
  sunPos: Vec3;
  /** Per-map overrides of the default material colors. */
  palette?: Partial<Record<MaterialId, GridColors>>;
}

export interface MapDef {
  id: string;
  name: string;
  description: string;
  /** Rough half-extent of the playable area (camera framing, shadows). */
  size: number;
  boxes: Box[];
  pads: JumpPad[];
  spawns: Vec3[];
  /** Navigation points for bots (on walkable surfaces). Links are generated automatically. */
  waypoints: Vec3[];
  /** Extra one-way links [from, to] (waypoint indices), e.g. jump pad → landing spot. */
  extraLinks?: [number, number][];
  killY: number;
  theme: MapTheme;
}

/** Box from horizontal center (cx, cz), size (w, d), bottom y0 and height h. */
export function B(cx: number, cz: number, w: number, d: number, y0: number, h: number, mat: MaterialId): Box {
  return {
    min: { x: cx - w / 2, y: y0, z: cz - d / 2 },
    max: { x: cx + w / 2, y: y0 + h, z: cz + d / 2 },
    mat,
  };
}

/** Jump pad centered at (cx, cz), size (w, d), lying on a surface at height `top`. */
export function PAD(cx: number, cz: number, w: number, d: number, top: number, launch: Vec3): JumpPad {
  return {
    min: { x: cx - w / 2, y: top, z: cz - d / 2 },
    max: { x: cx + w / 2, y: top, z: cz + d / 2 },
    launch,
  };
}

/** Point on the ground at (x, z) with surface height y. */
export const pt = (x: number, z: number, y = 0): Vec3 => ({ x, y: y + 0.05, z });
