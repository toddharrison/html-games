// Starting a run (SPEC 4.3, 5.4): a run is the world seed plus the protagonist.

import { MAP_SIZE } from '../content/balance.ts';
import { makeStreams } from './rng.ts';
import { dealRules, type Rules } from './rules.ts';
import type { Protagonist } from './protagonist.ts';
import type { GameState } from './state.ts';
import { reveal } from './step.ts';
import type { World } from './world.ts';
import { generateWorld } from './worldgen/index.ts';

/** The hand-checked valley for a player's first run (SPEC 6.3). */
export const DEFAULT_SEED = 'first-light';

/** Deal the rules and generate the valley for a seed. Slow (a few hundred ms): do it once per seed. */
export function buildValley(seed: string): { rules: Rules; world: World } {
  const rules = dealRules(seed);
  return { rules, world: generateWorld(seed, rules) };
}

/** A fresh run on a generated valley, at the start of day 1. */
export function newGame(seed: string, protagonist: Protagonist, world: World, rules: Rules): GameState {
  const { x, y } = world.start;
  const state: GameState = {
    schema: 1,
    seed,
    protagonist,
    tick: 0,
    rng: makeStreams(seed),
    player: { x, y, facing: 2, fromX: x, fromY: y, stepLeft: 0, stepTotal: 0, intent: -1, queued: -1, bumped: false },
    explored: new Array<number>((MAP_SIZE * MAP_SIZE) >> 5).fill(0),
    viewpoints: world.viewpoints.map(() => false),
    lights: [],
    rules,
    known: { facts: [] },
  };
  reveal(state);
  return state;
}
