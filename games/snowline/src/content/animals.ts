// Animals (SPEC 9): what each kind is like. Their nature is fixed; for the bear, the elk, and the cougar,
// how bold they are, how they warn, and what turns them is dealt per valley (GameState.rules.tempers).

export type AnimalKind = 'grouse' | 'hare' | 'marmot' | 'jay' | 'packrat' | 'porcupine' | 'bear' | 'elk' | 'cougar' | 'goat';

export interface AnimalDef {
  name: string;
  /** How many live in the valley, and where they start (SPEC 9: populations fixed at generation). */
  count: number;
  /** Ticks per step, walking and running. */
  walk: number;
  run: number;
  /** Hours awake and moving: [from, to), wrapping past midnight. */
  active: [number, number][];
  /** How close the survivor can come before it runs (prey) or reacts (danger). */
  sense: number;
  /** Prey can be hunted for this game item data (an index into GAME). */
  game?: number;
  /** Index into DANGER_ANIMALS when its temper is dealt. */
  danger?: number;
  /** Home range radius in tiles. */
  range: number;
  /** Can fly over anything but the rim (jays), or climb cliffs (goats). */
  flies?: boolean;
  climbs?: boolean;
}

export const ANIMALS: Record<AnimalKind, AnimalDef> = {
  grouse: { name: 'grouse', count: 10, walk: 12, run: 3, active: [[5, 20]], sense: 2, game: 1, range: 10 },
  hare: { name: 'hare', count: 12, walk: 6, run: 3, active: [[4, 9], [18, 23]], sense: 4, game: 0, range: 10 },
  marmot: { name: 'marmot', count: 8, walk: 9, run: 4, active: [[7, 19]], sense: 6, game: 2, range: 6 },
  jay: { name: 'jay', count: 6, walk: 4, run: 2, active: [[5, 20]], sense: 3, range: 18, flies: true },
  packrat: { name: 'pack rat', count: 3, walk: 6, run: 4, active: [[21, 24], [0, 5]], sense: 2, range: 26 },
  porcupine: { name: 'porcupine', count: 2, walk: 15, run: 12, active: [[20, 24], [0, 6]], sense: 1, range: 12 },
  bear: { name: 'black bear', count: 1, walk: 8, run: 4, active: [[6, 21]], sense: 9, danger: 0, range: 22 },
  elk: { name: 'elk', count: 6, walk: 8, run: 4, active: [[5, 22]], sense: 6, danger: 1, range: 14 },
  cougar: { name: 'cougar', count: 1, walk: 7, run: 3, active: [[17, 24], [0, 7]], sense: 12, danger: 2, range: 26 },
  goat: { name: 'mountain goat', count: 4, walk: 10, run: 6, active: [[6, 20]], sense: 6, range: 10, climbs: true },
};

export const KINDS = Object.keys(ANIMALS) as AnimalKind[];

/** Small game, carried as a `game` item with this data; what dressing it gives. */
export const GAME: readonly { name: string; meat: number; hide: number; feathers: number; verb: string }[] = [
  { name: 'hare', meat: 2, hide: 1, feathers: 0, verb: 'skinned and gutted' },
  { name: 'grouse', meat: 1, hide: 0, feathers: 4, verb: 'plucked and gutted' },
  { name: 'marmot', meat: 2, hide: 1, feathers: 0, verb: 'skinned and gutted' },
];

/** How close a dangerous animal lets the survivor come before warning, by its dealt boldness. */
export const CROWD: Record<string, number> = { shy: 2, wary: 3, bold: 5 };
/** Wound severity when a dangerous animal attacks. */
export const ATTACK: Record<string, number> = { bear: 55, elk: 40, cougar: 60 };
/** Days of the elk rut: bulls turn aggressive (SPEC 9). */
export const RUT = [20, 45] as const;
/** Days of the trout run up the near stream (SPEC 7.4). */
export const TROUT_RUN = [25, 40] as const;
