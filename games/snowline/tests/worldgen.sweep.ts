// The world generation sweep (SPEC 11.4), run by hand with `npm run sweep`: 1,000 seeds, every check.
// Too slow for `npm test` (a few minutes), so it is kept out of it by its file name.

import { describe, expect, it } from 'vitest';
import { dealRules } from '../src/sim/rules.ts';
import { generateWorld } from '../src/sim/worldgen/index.ts';
import { checkWorld } from './worldChecks.ts';

const COUNT = Number(process.env.SWEEP_COUNT ?? 1000);

describe('world generation sweep', () => {
  it(`${COUNT} seeds all give valid valleys`, () => {
    const failed: string[] = [];
    const tries = new Map<number, number>();
    const reasons = new Map<string, number>();
    const t0 = performance.now();
    for (let k = 0; k < COUNT; k++) {
      const seed = `sweep-${k}`;
      try {
        const rules = dealRules(seed);
        const w = generateWorld(seed, rules);
        tries.set(w.attempts, (tries.get(w.attempts) ?? 0) + 1);
        for (const f of w.failures) {
          const why = f.slice(f.indexOf(': ') + 2).replace(/\(\d+(, \d+)?\)/g, '(n)');
          reasons.set(why, (reasons.get(why) ?? 0) + 1);
        }
        const problems = checkWorld(w, rules);
        if (problems.length) failed.push(`${seed}: ${problems.join('; ')}`);
      } catch (e) {
        failed.push(`${seed}: ${(e as Error).message.split('\n')[0]}`);
      }
    }
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    console.log(`${COUNT} seeds in ${secs} s. Tries per valley: ${[...tries].sort((a, b) => a[0] - b[0]).map(([n, c]) => `${n}: ${c}`).join(', ')}`);
    for (const [why, n] of [...reasons].sort((a, b) => b[1] - a[1])) console.log(`  retried ${n}x: ${why}`);
    expect(failed).toEqual([]);
  });
});
