// The generated valley (SPEC 6.1). A World is rebuilt from the seed and never saved, so it may use typed
// arrays; it is not part of GameState. What changes during play (the rockslide, a felled tree) will be
// kept in GameState as differences from it.

import { BASE_STEP_TICKS, CLIMB_PER_TICK, MAP_SIZE, MAX_CLIMB_TICKS } from '../content/balance.ts';
import { FEATURES, FLAG, TERRAIN } from '../content/terrain.ts';

export interface Point {
  x: number;
  y: number;
}

export type PatchRole = 'safe' | 'lookalike' | 'berries' | 'plant' | 'herb';

/** A patch of one plant or herb. `thing` indexes PLANTS (or REMEDIES for herbs). */
export interface Patch {
  role: PatchRole;
  thing: number;
  center: Point;
  tiles: Point[];
}

export interface Territory {
  animal: 'bear' | 'elk' | 'cougar' | 'marmot';
  x: number;
  y: number;
  r: number;
}

export interface Landmark {
  kind: 'waterfall' | 'snag' | 'bones' | 'avalanche' | 'tarn' | 'arch' | 'beaver-dam' | 'carcass';
  x: number;
  y: number;
}

export interface World {
  /** The seed asked for. */
  seed: string;
  /** The seed that generated a valid valley: `seed`, or `seed~N` after N failed tries (SPEC 6.3 step 8). */
  genSeed: string;
  attempts: number;
  /** Why each earlier try failed. */
  failures: string[];
  size: number;
  /** Elevation, 0–255 across the valley. */
  elev: Uint8Array;
  band: Uint8Array;
  terrain: Uint8Array;
  feature: Uint8Array;
  /** Which plant, herb, or stone a feature is. */
  data: Uint8Array;
  water: Uint8Array;
  flags: Uint8Array;
  start: Point;
  crash: Point;
  overhang: { rock: Point; shelter: Point };
  sparkOutcrop: Point;
  decoyOutcrop: Point;
  outcrops: { stone: number; at: Point }[];
  mouth: Point;
  streams: { a: Point[]; b: Point[] };
  wreck: Point;
  slideGap: Point[];
  slidePath: Point[];
  knoll: Point;
  /** Every viewpoint; the signal knoll is first, and the one that shows the wreckage second. */
  viewpoints: Point[];
  patches: Patch[];
  territories: Territory[];
  midden: Point;
  /** Where each water source's cause would be (lake, near stream, far stream); only the foul one has it. */
  waterCauseSites: Point[];
  landmarks: Landmark[];
  /** What lies loose on each tile (content/loose.ts, SPEC 6.7). */
  loose: Uint8Array;
  /** Whose game trail each tile is (TRAIL_BY: 0 none, 1 elk, 2 bear, 3 cougar), from worldgen layTrails. */
  trails: Uint8Array;
  /** Years since the forest on each tile last burned (255: older than that; 0: no forest), from its fire history (SPEC 6.3). */
  age: Uint8Array;
}

export const SIZE = MAP_SIZE;

export function idx(x: number, y: number): number {
  return y * SIZE + x;
}

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < SIZE && y < SIZE;
}

/** Can the survivor stand on tile `i`? (The rockslide's gap opens in M5; until then it is cliff.) */
export function passableAt(w: World, i: number): boolean {
  return TERRAIN[w.terrain[i]!]!.passable && !FEATURES[w.feature[i]!]!.blocks;
}

export function passable(w: World, x: number, y: number): boolean {
  return inBounds(x, y) && passableAt(w, idx(x, y));
}

/** Ticks a step from one tile to a neighbour takes (SPEC 5.2): ground, feature, and climb. */
export function stepTicks(w: World, from: number, to: number): number {
  let ticks = TERRAIN[w.terrain[to]!]!.stepTicks + FEATURES[w.feature[to]!]!.extraTicks;
  if (w.flags[to]! & FLAG.trail) ticks = Math.min(ticks, BASE_STEP_TICKS);
  const climb = w.elev[to]! - w.elev[from]!;
  if (climb > 0) ticks += Math.min(MAX_CLIMB_TICKS, Math.floor(climb / CLIMB_PER_TICK));
  return Math.max(BASE_STEP_TICKS, ticks);
}
