// The world generation sample (SPEC 11.4): a fixed list of seeds, the default among them, must each
// give a valid valley. `npm run sweep` runs the same checks over 1,000 seeds.

import { describe, expect, it } from 'vitest';
import { DEFAULT_SEED } from '../src/sim/newGame.ts';
import { dealRules } from '../src/sim/rules.ts';
import { generateWorld } from '../src/sim/worldgen/index.ts';
import { worldHash } from '../src/tools/runner.ts';
import { SAMPLE_SEEDS } from './sample.ts';
import { checkWorld } from './worldChecks.ts';

describe('world generation sample', () => {
  const attempts: number[] = [];
  for (const seed of SAMPLE_SEEDS) {
    it(`${seed} gives a valid valley`, () => {
      const world = generateWorld(seed, dealRules(seed));
      attempts.push(world.attempts);
      expect(checkWorld(world, dealRules(seed))).toEqual([]);
    });
  }

  it('rarely needs a second try', () => {
    const extra = attempts.reduce((a, n) => a + n - 1, 0);
    expect(extra).toBeLessThanOrEqual(SAMPLE_SEEDS.length / 2);
  });

  it('the same seed always gives the same valley', () => {
    const a = generateWorld(DEFAULT_SEED, dealRules(DEFAULT_SEED));
    const b = generateWorld(DEFAULT_SEED, dealRules(DEFAULT_SEED));
    expect(worldHash(a)).toBe(worldHash(b));
  });

  it('the default seed is the hand-checked valley, unchanged', () => {
    // If world generation changes on purpose, look at the default valley again (`npm run inspect`)
    // before updating this: it is every player's first run.
    const w = generateWorld(DEFAULT_SEED, dealRules(DEFAULT_SEED));
    expect({ genSeed: w.genSeed, start: w.start }).toMatchInlineSnapshot(`
      {
        "genSeed": "first-light",
        "start": {
          "x": 122,
          "y": 140,
        },
      }
    `);
  });
});
