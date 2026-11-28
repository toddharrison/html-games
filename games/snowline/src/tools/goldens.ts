// Golden replays (SPEC 11.4): a seed, a protagonist, and a command log, run to a tick, must give these
// hashes. `npm test` checks them in Node; `npm run check:browser` and the `?check=1` page check them in
// browsers, to catch engine differences.
//
// When a deliberate change to the simulation or world generation moves a hash, the test prints the new
// one: check the change is meant, then paste it here.

import type { Command } from '../sim/state.ts';
import { runScenario, stateHash, worldHash } from './runner.ts';

export interface Golden {
  name: string;
  seed: string;
  candidate: number;
  ticks: number;
  commands: Command[];
  worldHash: string;
  stateHash: string;
}

/** A walk: hold each direction for a while, with taps and pauses between. */
function walk(legs: [dir: 0 | 1 | 2 | 3, from: number, hold: number][]): Command[] {
  const out: Command[] = [];
  for (const [dir, from, hold] of legs) {
    out.push({ t: from, c: 'move', dir });
    out.push({ t: from + hold, c: 'halt' });
  }
  return out;
}

export const GOLDENS: Golden[] = [
  {
    // Round the start of the default valley and into the dusk of day 1. (Times doubled 2026-11-27, when a game
    // minute went from 10 ticks to 20, so each command falls at the same game hour; walks keep their real length.)
    name: 'first steps',
    seed: 'first-light',
    candidate: 0,
    ticks: 24000,
    commands: walk([
      [1, 10, 120],
      [0, 280, 200],
      [3, 800, 90],
      [0, 1000, 1],
      [0, 1006, 1],
      [2, 1040, 300],
      [1, 1800, 400],
      [0, 4000, 600],
      [3, 8000, 250],
      [2, 18000, 500],
    ]).concat([
      { t: 100, c: 'debug-give', k: 'cattail-root', d: -1, n: 2 },
      { t: 120, c: 'use', action: 'eat', slot: 3 },
      { t: 140, c: 'debug-give', k: 'stick', d: -1, n: 3 },
      { t: 400, c: 'craft', recipe: 'sharp-stick' },
      { t: 6000, c: 'sleep', minutes: 120, awake: false },
      // A click: walk to a tile by the route the simulation finds (SPEC 5.2).
      { t: 21000, c: 'goto', x: 150, y: 175, onto: true, action: null, at: 'front' },
    ]).sort((a, b) => a.t - b.t),
    worldHash: '5b73f872',
    stateHash: 'abaa2b0b',
  },
  {
    // Another valley: a debug fire after dark, a walk through the night, and a teleport back to the start.
    name: 'night walk',
    seed: 'golden-2',
    candidate: 1,
    ticks: 32000,
    commands: [
      ...walk([
        [3, 20, 200],
        [2, 600, 300],
      ]),
      { t: 16000, c: 'debug-fire' },
      { t: 16100, c: 'sleep', minutes: 60, awake: true },
      ...walk([
        [1, 16200, 400],
        [0, 18000, 300],
      ]),
      { t: 22000, c: 'debug-teleport', x: 144, y: 144 },
      ...walk([[3, 24000, 800]]),
    ],
    worldHash: 'ce98368d',
    stateHash: 'fab7e0b6',
  },
];

export interface GoldenResult {
  name: string;
  worldHash: string;
  stateHash: string;
  expectedWorld: string;
  expectedState: string;
  ok: boolean;
}

export function runGolden(g: Golden): GoldenResult {
  const { state, world } = runScenario({ seed: g.seed, protagonist: g.candidate, commands: g.commands, ticks: g.ticks });
  const w = worldHash(world);
  const s = stateHash(state);
  return { name: g.name, worldHash: w, stateHash: s, expectedWorld: g.worldHash, expectedState: g.stateHash, ok: w === g.worldHash && s === g.stateHash };
}
