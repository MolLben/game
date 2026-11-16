import type { MapDef } from '../map';
import { BUNKER } from './bunker';
import { CANAL } from './canal';
import { FOUNDRY } from './foundry';
import { SKYLINE } from './skyline';

export { BUNKER, CANAL, FOUNDRY, SKYLINE };

export const MAPS: Record<string, MapDef> = {
  foundry: FOUNDRY,
  skyline: SKYLINE,
  canal: CANAL,
  bunker: BUNKER,
};

/** Online rotation order. */
export const MAP_ORDER: string[] = ['foundry', 'skyline', 'canal', 'bunker'];

export function isMapId(id: unknown): id is string {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(MAPS, id);
}

export function getMap(id: unknown): MapDef {
  return isMapId(id) ? MAPS[id] : FOUNDRY;
}

export function nextMapId(current: string): string {
  const i = MAP_ORDER.indexOf(current);
  return MAP_ORDER[(i + 1) % MAP_ORDER.length];
}
