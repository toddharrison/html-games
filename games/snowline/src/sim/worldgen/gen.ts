// The working state of one generation try, shared by the pipeline's stages.

import { FEATURES, T, WATER } from '../../content/terrain.ts';
import { hashString, makeRng, type RngState } from '../rng.ts';
import type { Rules } from '../rules.ts';
import { SIZE, type Landmark, type Patch, type Point, type Territory } from '../world.ts';
import { N } from './grid.ts';

/** Terrain not yet assigned. */
export const UNSET = 255;

export interface Gen {
  genSeed: string;
  rules: Rules;
  /** The `worldgen` stream, for choices made one after another (set pieces). */
  rng: RngState;
  /** The seed word for position-hashed choices (noise, scatter). */
  word: number;
  /** Height, 0–1. */
  h: Float64Array;
  elev: Uint8Array;
  band: Uint8Array;
  terrain: Uint8Array;
  feature: Uint8Array;
  data: Uint8Array;
  water: Uint8Array;
  flags: Uint8Array;
  /** Tiles a set piece has claimed (with its margin), so set pieces never overlap. */
  reserved: Uint8Array;
  /** Rain that drains through each tile (tiles' worth, more up high): streams, wet ground (geology.ts). */
  flow: Float64Array;
  /** Hollows filled level that hold water only in spring: bog and marsh for the ground cover. */
  bog: Uint8Array;
  /** Ice left from the glaciers: 2 a small glacier in a cirque, 1 snowpack on high north-facing ground. */
  snow: Uint8Array;
  /** Whose game trail each tile is (TRAIL_BY in content/terrain.ts). */
  trailBy: Uint8Array;
  /** Years since each tile's forest last burned (cover.ts's fire history): 255 old growth, 0 no forest. */
  age: Uint8Array;
  /** The lake's outlet, from the spill point down to the rim. */
  outlet: number[];
  /** Which way the high side of the valley faces (a unit vector). */
  high: Point;
  lakeSize: number;
  streamA: number[];
  streamB: number[];
  mouth: number;
  start: number;
  crash: number;
  wreck: number;
  slideGap: number[];
  slidePath: number[];
  overhang: { rock: number; shelter: number };
  sparkOutcrop: number;
  decoyOutcrop: number;
  outcrops: { stone: number; at: number }[];
  knoll: number;
  viewpoints: number[];
  patches: Patch[];
  territories: Territory[];
  midden: number;
  waterCauseSites: number[];
  landmarks: Landmark[];
}

export function newGen(genSeed: string, rules: Rules): Gen {
  return {
    genSeed,
    rules,
    rng: makeRng(genSeed, 'worldgen'),
    word: hashString(`${genSeed}/terrain`)[0],
    h: new Float64Array(N),
    elev: new Uint8Array(N),
    band: new Uint8Array(N),
    terrain: new Uint8Array(N).fill(UNSET),
    feature: new Uint8Array(N),
    data: new Uint8Array(N),
    water: new Uint8Array(N),
    flags: new Uint8Array(N),
    reserved: new Uint8Array(N),
    flow: new Float64Array(N),
    bog: new Uint8Array(N),
    outlet: [],
    snow: new Uint8Array(N),
    age: new Uint8Array(N),
    trailBy: new Uint8Array(N),
    high: { x: 0, y: -1 },
    lakeSize: 0,
    streamA: [],
    streamB: [],
    mouth: -1,
    start: -1,
    crash: -1,
    wreck: -1,
    slideGap: [],
    slidePath: [],
    overhang: { rock: -1, shelter: -1 },
    sparkOutcrop: -1,
    decoyOutcrop: -1,
    outcrops: [],
    knoll: -1,
    viewpoints: [],
    patches: [],
    territories: [],
    midden: -1,
    waterCauseSites: [],
    landmarks: [],
  };
}

export const xOf = (i: number): number => i % SIZE;
export const yOf = (i: number): number => (i - (i % SIZE)) / SIZE;
export const pt = (i: number): Point => ({ x: xOf(i), y: yOf(i) });

/** Squared distance between two tiles. */
export function dist2(a: number, b: number): number {
  const dx = xOf(a) - xOf(b);
  const dy = yOf(a) - yOf(b);
  return dx * dx + dy * dy;
}

export function isWaterTerrain(t: number): boolean {
  return t === T.deep || t === T.shallows || t === T.stream || t === T.waterfall || t === T.gravel;
}

/** Dry, walkable ground with no set piece on it: where a new set piece may go. */
export function isOpenLand(g: Gen, i: number): boolean {
  const t = g.terrain[i]!;
  if (g.reserved[i] || g.water[i] !== WATER.none || isWaterTerrain(t)) return false;
  if (t === T.headwall || t === T.cliff || t === T.scree || t === T.shelter || t === UNSET) return false;
  return !FEATURES[g.feature[i]!]!.fixed;
}

/** Claim every tile within Chebyshev distance `r` of tile `i`. */
export function reserve(g: Gen, i: number, r: number): void {
  forBox(i, r, (n) => {
    g.reserved[n] = 1;
  });
}

/** Remove trees, rocks, and bushes (not set pieces) within Chebyshev distance `r` of tile `i`. */
export function clearAround(g: Gen, i: number, r: number): void {
  forBox(i, r, (n) => {
    if (!FEATURES[g.feature[n]!]!.fixed) g.feature[n] = 0;
  });
}

/** Calls `f` for each in-bounds tile within Chebyshev distance `r` of tile `i`, row by row. */
export function forBox(i: number, r: number, f: (n: number, dx: number, dy: number) => void): void {
  const x = xOf(i);
  const y = yOf(i);
  for (let dy = -r; dy <= r; dy++) {
    const ny = y + dy;
    if (ny < 0 || ny >= SIZE) continue;
    for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx;
      if (nx < 0 || nx >= SIZE) continue;
      f(ny * SIZE + nx, dx, dy);
    }
  }
}

/** Every tile where `test` holds, in index order. */
export function tilesWhere(test: (i: number) => boolean): number[] {
  const out: number[] = [];
  for (let i = 0; i < N; i++) if (test(i)) out.push(i);
  return out;
}

/** True if any tile within Chebyshev distance `r` of `i` passes `test`. */
export function anyNear(i: number, r: number, test: (n: number) => boolean): boolean {
  let found = false;
  forBox(i, r, (n) => {
    if (!found && test(n)) found = true;
  });
  return found;
}
