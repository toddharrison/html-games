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
    // Round the start of the default valley and into the dusk of day 1.
    name: 'first steps',
    seed: 'first-light',
    candidate: 0,
    ticks: 12000,
    commands: walk([
      [1, 5, 120],
      [0, 140, 200],
      [3, 400, 90],
      [0, 500, 1],
      [0, 503, 1],
      [2, 520, 300],
      [1, 900, 400],
      [0, 2000, 600],
      [3, 4000, 250],
      [2, 9000, 500],
    ]).concat([
      { t: 50, c: 'debug-give', k: 'cattail-root', d: -1, n: 2 },
      { t: 60, c: 'use', action: 'eat', slot: 3 },
      { t: 70, c: 'debug-give', k: 'stick', d: -1, n: 3 },
      { t: 200, c: 'craft', recipe: 'sharp-stick' },
      { t: 3000, c: 'sleep', minutes: 120, awake: false },
      // A click: walk to a tile by the route the simulation finds (SPEC 5.2).
      { t: 10500, c: 'goto', x: 150, y: 175, onto: true, action: null, at: 'front' },
    ]).sort((a, b) => a.t - b.t),
    worldHash: 'ba0804cf',
    stateHash: 'f3a7e866',
  },
  {
    // Another valley: a debug fire after dark, a walk through the night, and a teleport back to the start.
    name: 'night walk',
    seed: 'golden-2',
    candidate: 1,
    ticks: 16000,
    commands: [
      ...walk([
        [3, 10, 200],
        [2, 300, 300],
      ]),
      { t: 8000, c: 'debug-fire' },
      { t: 8050, c: 'sleep', minutes: 60, awake: true },
      ...walk([
        [1, 8100, 400],
        [0, 9000, 300],
      ]),
      { t: 11000, c: 'debug-teleport', x: 144, y: 144 },
      ...walk([[3, 12000, 800]]),
    ],
    worldHash: 'e23c937b',
    stateHash: 'da5b671b',
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
