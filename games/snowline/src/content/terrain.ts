// Ground types, elevation bands, and features (SPEC 6.1, 6.2). The numeric ids are what the world's
// typed arrays store, so their order is fixed: add new entries at the end.

export interface TerrainDef {
  id: string;
  name: string;
  passable: boolean;
  /** Ticks a step onto this ground takes, before climbing and features. */
  stepTicks: number;
  /** Lake, stream, or tarn water the survivor can wade or drink from. */
  water: boolean;
}

/** Terrain ids. */
export const T = {
  headwall: 0,
  cliff: 1,
  deep: 2,
  shallows: 3,
  stream: 4,
  waterfall: 5,
  sand: 6,
  reeds: 7,
  marsh: 8,
  meadow: 9,
  forest: 10,
  highMeadow: 11,
  scrub: 12,
  boulders: 13,
  talus: 14,
  rock: 15,
  snow: 16,
  scree: 17,
  gravel: 18,
  shelter: 19,
} as const;
export type TerrainId = (typeof T)[keyof typeof T];

export const TERRAIN: readonly TerrainDef[] = [
  { id: 'headwall', name: 'headwall', passable: false, stepTicks: 0, water: false },
  { id: 'cliff', name: 'cliff', passable: false, stepTicks: 0, water: false },
  { id: 'deep', name: 'deep water', passable: false, stepTicks: 0, water: true },
  { id: 'shallows', name: 'shallows', passable: true, stepTicks: 12, water: true },
  { id: 'stream', name: 'stream', passable: true, stepTicks: 11, water: true },
  { id: 'waterfall', name: 'waterfall', passable: false, stepTicks: 0, water: true },
  { id: 'sand', name: 'sand', passable: true, stepTicks: 7, water: false },
  { id: 'reeds', name: 'reeds', passable: true, stepTicks: 8, water: false },
  { id: 'marsh', name: 'marsh', passable: true, stepTicks: 10, water: false },
  { id: 'meadow', name: 'meadow', passable: true, stepTicks: 6, water: false },
  { id: 'forest', name: 'forest floor', passable: true, stepTicks: 7, water: false },
  { id: 'highMeadow', name: 'high meadow', passable: true, stepTicks: 6, water: false },
  { id: 'scrub', name: 'scrub', passable: true, stepTicks: 7, water: false },
  { id: 'boulders', name: 'boulder field', passable: true, stepTicks: 9, water: false },
  { id: 'talus', name: 'talus', passable: true, stepTicks: 10, water: false },
  { id: 'rock', name: 'bare rock', passable: true, stepTicks: 7, water: false },
  { id: 'snow', name: 'old snow', passable: true, stepTicks: 10, water: false },
  { id: 'scree', name: 'scramble', passable: true, stepTicks: 14, water: false },
  { id: 'gravel', name: 'spawning gravel', passable: true, stepTicks: 10, water: true },
  { id: 'shelter', name: 'overhang floor', passable: true, stepTicks: 6, water: false },
];

/** Elevation bands, lowest first (SPEC 6.2). */
export const BAND = { floor: 0, montane: 1, subalpine: 2, alpine: 3 } as const;
export const BAND_NAMES = ['valley floor', 'montane forest', 'subalpine', 'alpine'] as const;

export interface FeatureDef {
  id: string;
  name: string;
  /** Blocks movement. */
  blocks: boolean;
  /** Ticks added to a step onto it, when it doesn't block. */
  extraTicks: number;
  /** Placed by a set piece: game trails and clearings leave it alone. */
  fixed: boolean;
}

/** Feature ids. A feature's data byte says which plant, herb, or stone it is. */
export const F = {
  none: 0,
  conifer: 1,
  aspen: 2,
  stunted: 3,
  boulder: 4,
  bush: 5,
  log: 6,
  plant: 7,
  herb: 8,
  outcrop: 9,
  overhang: 10,
  crash: 11,
  tail: 12,
  snag: 13,
  midden: 14,
  bones: 15,
  arch: 16,
  beaverDam: 17,
  carcass: 18,
  /** An animal's den, burrows, or lair; the data byte is which (content/loose.ts DENS). */
  den: 19,
  /** Young trees grown so close together there's no way through. */
  thicket: 20,
} as const;
export type FeatureId = (typeof F)[keyof typeof F];

export const FEATURES: readonly FeatureDef[] = [
  { id: 'none', name: '', blocks: false, extraTicks: 0, fixed: false },
  // Trees are walked among and under (slower, between the trunks); a thicket is what can't be walked through.
  { id: 'conifer', name: 'conifer', blocks: false, extraTicks: 3, fixed: false },
  { id: 'aspen', name: 'aspen', blocks: false, extraTicks: 2, fixed: false },
  { id: 'stunted', name: 'stunted tree', blocks: true, extraTicks: 0, fixed: false },
  { id: 'boulder', name: 'boulder', blocks: true, extraTicks: 0, fixed: false },
  { id: 'bush', name: 'wild rose', blocks: false, extraTicks: 4, fixed: false },
  { id: 'log', name: 'deadfall', blocks: false, extraTicks: 5, fixed: false },
  { id: 'plant', name: 'plants', blocks: false, extraTicks: 2, fixed: true },
  { id: 'herb', name: 'herbs', blocks: false, extraTicks: 1, fixed: true },
  { id: 'outcrop', name: 'outcrop', blocks: true, extraTicks: 0, fixed: true },
  { id: 'overhang', name: 'rock overhang', blocks: true, extraTicks: 0, fixed: true },
  { id: 'crash', name: 'wreckage', blocks: true, extraTicks: 0, fixed: true },
  { id: 'tail', name: 'tail wreckage', blocks: true, extraTicks: 0, fixed: true },
  { id: 'snag', name: 'split snag', blocks: true, extraTicks: 0, fixed: true },
  { id: 'midden', name: 'packed crevice', blocks: true, extraTicks: 0, fixed: true },
  { id: 'bones', name: 'bone pile', blocks: false, extraTicks: 2, fixed: true },
  { id: 'arch', name: 'rock arch', blocks: true, extraTicks: 0, fixed: true },
  { id: 'beaverDam', name: 'beaver dam', blocks: false, extraTicks: 6, fixed: true },
  { id: 'carcass', name: 'carcass', blocks: false, extraTicks: 3, fixed: true },
  { id: 'den', name: 'den', blocks: false, extraTicks: 4, fixed: true },
  { id: 'thicket', name: 'thicket', blocks: true, extraTicks: 0, fixed: false },
];

/** Whose game trail a tile is (World.trails). A tile both walk is the bear's: that's the one that matters. */
export const TRAIL_BY = { none: 0, elk: 1, bear: 2, cougar: 3 } as const;

/** Flag bits on a tile. */
export const FLAG = {
  trail: 1,
  /** Cliff that the severe storm's rockslide opens (SPEC 6.3). */
  slideGap: 2,
  /** The rockslide's path below the wreckage. */
  slidePath: 4,
  /** Inside the cliff ring round the tail wreckage. */
  pocket: 8,
  /** Cleared by an old avalanche. */
  avalanche: 16,
  /** Glacier ice (the rest of `T.snow` is snowpack). */
  glacier: 32,
} as const;

/** Water bodies, for the valley's dealt water rule (SPEC 7.3). */
export const WATER = { none: 0, lake: 1, streamA: 2, streamB: 3, tarn: 4 } as const;
