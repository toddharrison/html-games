// The base palette (SPEC 12.1): one muted, natural set of 32 colours that every tile and sprite uses.

export const PALETTE = {
  ink: '#14161a',
  night: '#1d2230',
  slate: '#3b4350',
  stone: '#5f666c',
  fog: '#8f979a',
  pale: '#c4c9c4',
  snow: '#e9ece6',
  deep: '#1f3a4a',
  water: '#2e5868',
  shallow: '#4a7c84',
  foam: '#8db3ae',
  sand: '#c2b285',
  sandDark: '#9c8c62',
  reed: '#7d8748',
  marsh: '#4e5a39',
  meadow: '#6c8547',
  meadowLight: '#8c9d58',
  forest: '#34492f',
  pine: '#1f3424',
  pineLight: '#345339',
  aspen: '#a9a356',
  bark: '#5a4634',
  wood: '#7c6142',
  soil: '#665847',
  scrub: '#6b7350',
  rock: '#77746b',
  talus: '#8b877b',
  red: '#9a3a32',
  blue: '#4b5a8a',
  ember: '#c4552b',
  fire: '#e8a33d',
  cream: '#ddd6bf',
} as const;

export type PaletteKey = keyof typeof PALETTE;

/** '#rrggbb' to [r, g, b]. */
export function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The ground colour of each terrain id (content/terrain.ts order). */
export const TERRAIN_COLOR: readonly PaletteKey[] = [
  'slate', // headwall
  'stone', // cliff
  'deep',
  'shallow',
  'water', // stream
  'foam', // waterfall
  'sand',
  'reed',
  'marsh',
  'meadow',
  'forest',
  'meadowLight', // high meadow
  'scrub',
  'rock', // boulder field
  'talus',
  'rock',
  'snow',
  'fog', // scree
  'shallow', // gravel
  'soil', // shelter
];
