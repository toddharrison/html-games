// The headless runner (SPEC 11.4): play a seed, a protagonist, and a command log with no browser. Used
// by scenario tests, golden replays, the browser replay check, and replay files.

import { hashValue } from '../sim/hash.ts';
import { buildValley, newGame } from '../sim/newGame.ts';
import { candidate, type Protagonist } from '../sim/protagonist.ts';
import type { Rules } from '../sim/rules.ts';
import type { Command, GameState, SimEvent } from '../sim/state.ts';
import { step } from '../sim/step.ts';
import type { World } from '../sim/world.ts';

export interface Scenario {
  seed: string;
  /** A protagonist, or a candidate number for the seed. */
  protagonist: Protagonist | number;
  commands: readonly Command[];
  /** Run until this tick. */
  ticks: number;
}

/** Valleys already built, by seed: generation is the slow part, and a valley never changes. */
const valleys = new Map<string, { rules: Rules; world: World }>();

export function valley(seed: string): { rules: Rules; world: World } {
  let v = valleys.get(seed);
  if (!v) {
    v = buildValley(seed);
    valleys.set(seed, v);
  }
  return v;
}

export function startScenario(s: Scenario): { state: GameState; world: World } {
  const { rules, world } = valley(s.seed);
  const who = typeof s.protagonist === 'number' ? candidate(s.seed, s.protagonist) : s.protagonist;
  return { state: newGame(s.seed, who, world, structuredClone(rules)), world };
}

/** Run `state` forward to tick `until`, feeding each command on its tick. Commands must be in tick order. */
export function runTo(state: GameState, world: World, commands: readonly Command[], until: number, onEvents?: (e: SimEvent[]) => void): void {
  let k = 0;
  while (k < commands.length && commands[k]!.t < state.tick) k++;
  while (state.tick < until) {
    const now: Command[] = [];
    while (k < commands.length && commands[k]!.t === state.tick) now.push(commands[k++]!);
    const events = step(state, world, now);
    if (onEvents && events.length) onEvents(events);
  }
}

export function runScenario(s: Scenario): { state: GameState; world: World; events: SimEvent[] } {
  const { state, world } = startScenario(s);
  const events: SimEvent[] = [];
  runTo(state, world, s.commands, s.ticks, (e) => events.push(...e));
  return { state, world, events };
}

/** The hash a golden replay checks: the whole game state. */
export function stateHash(state: GameState): string {
  return hashValue(state);
}

/** The hash of a generated valley's map, so a change to world generation shows up in the goldens. */
export function worldHash(world: World): string {
  return hashValue({
    genSeed: world.genSeed,
    elev: world.elev,
    band: world.band,
    terrain: world.terrain,
    feature: world.feature,
    data: world.data,
    water: world.water,
    flags: world.flags,
  });
}
