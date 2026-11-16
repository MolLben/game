export const PLAYER_COLORS = [
  '#e05252', '#4fa3e0', '#5cc46a', '#d9a03a', '#b067d6', '#3cc7b8',
  '#e07a3c', '#d65a9c', '#8fa3b8', '#c9c43a', '#6f7de0', '#9ad04a',
];

export const BOT_NAMES = ['Rook', 'Vex', 'Nova', 'Kade', 'Juno', 'Pax', 'Sable', 'Orin', 'Tess', 'Bram', 'Ivo', 'Lark'];

export const MAX_NAME_LENGTH = 16;

/** Strip control/markup characters and clamp length. */
export function sanitizeName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '';
  const clean = s
    .replace(/[\u0000-\u001f\u007f<>&"'`]/g, '')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  return clean || 'Player';
}
