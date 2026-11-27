// Shared test fixtures: the world generation sample and a hand-built flat world.

import { MAP_SIZE } from '../src/content/balance.ts';
import { T } from '../src/content/terrain.ts';
import { DEFAULT_SEED } from '../src/sim/newGame.ts';
import type { GameState } from '../src/sim/state.ts';
import type { World } from '../src/sim/world.ts';

/** The world generation sample in `npm test` (SPEC 11.4): about 25 seeds, the default among them. */
export const SAMPLE_SEEDS = [DEFAULT_SEED, ...Array.from({ length: 9 }, (_, i) => `sample-${i + 1}`)];

/** A valley that is all meadow at one height, with the survivor's start in the middle. */
export function flatWorld(): World {
  const n = MAP_SIZE * MAP_SIZE;
  const p = { x: 128, y: 128 };
  return {
    seed: 'flat',
    genSeed: 'flat',
    attempts: 1,
    failures: [],
    size: MAP_SIZE,
    elev: new Uint8Array(n),
    band: new Uint8Array(n),
    terrain: new Uint8Array(n).fill(T.meadow),
    feature: new Uint8Array(n),
    data: new Uint8Array(n),
    water: new Uint8Array(n),
    flags: new Uint8Array(n),
    start: p,
    crash: { x: 129, y: 128 },
    overhang: { rock: p, shelter: p },
    sparkOutcrop: p,
    decoyOutcrop: p,
    outcrops: [],
    mouth: p,
    streams: { a: [], b: [] },
    wreck: p,
    slideGap: [],
    slidePath: [],
    knoll: p,
    viewpoints: [{ x: 128, y: 100 }],
    patches: [],
    territories: [],
    midden: p,
    waterCauseSites: [],
    landmarks: [],
    loose: new Uint8Array(n),
    age: new Uint8Array(n),
    trails: new Uint8Array(n),
  };
}

/** Pin a run's weather to overcast and clear the valley of animals, so a test measures one thing. */
export function calm(s: GameState): void {
  s.weather.f = s.weather.f.map(() => 1);
  s.animals = [];
}
