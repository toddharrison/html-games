// Golden replays (SPEC 11.4): a seed, a protagonist, and a command log run to a tick must give a known
// world hash and state hash. A mismatch prints the new hashes; paste them into src/tools/goldens.ts only
// once the change that moved them is meant.

import { describe, expect, it } from 'vitest';
import { GOLDENS, runGolden } from '../src/tools/goldens.ts';

describe('golden replays', () => {
  for (const g of GOLDENS) {
    it(g.name, () => {
      const r = runGolden(g);
      expect({ worldHash: r.worldHash, stateHash: r.stateHash }, `new hashes for "${g.name}"`).toEqual({
        worldHash: g.worldHash,
        stateHash: g.stateHash,
      });
    });
  }

  it('runs the same twice', () => {
    const g = GOLDENS[0]!;
    expect(runGolden(g).stateHash).toBe(runGolden(g).stateHash);
  });
});
