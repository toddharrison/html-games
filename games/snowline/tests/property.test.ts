// Property tests (SPEC 11.4): invariants that hold after any command sequence. fast-check runs with a
// fixed seed and a bounded number of cases, so a failure in CI repeats locally.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SEED } from '../src/sim/newGame.ts';
import type { Command, Dir } from '../src/sim/state.ts';
import { passable } from '../src/sim/world.ts';
import { runTo, startScenario, stateHash } from '../src/tools/runner.ts';

const FC = { seed: 20261125, numRuns: 40 };
const TICKS = 900;

/** Random input: presses, releases, and the odd teleport, in tick order. */
const commandsArb = fc
  .array(
    fc.oneof(
      { weight: 6, arbitrary: fc.record({ t: fc.nat(TICKS - 1), dir: fc.integer({ min: 0, max: 3 }) }).map(({ t, dir }): Command => ({ t, c: 'move', dir: dir as Dir })) },
      { weight: 3, arbitrary: fc.nat(TICKS - 1).map((t): Command => ({ t, c: 'halt' })) },
      { weight: 1, arbitrary: fc.record({ t: fc.nat(TICKS - 1), x: fc.nat(255), y: fc.nat(255) }).map(({ t, x, y }): Command => ({ t, c: 'debug-teleport', x, y })) },
    ),
    { maxLength: 60 },
  )
  .map((cs) => cs.sort((a, b) => a.t - b.t));

describe('invariants after any input', () => {
  it('the survivor always stands on open ground inside the map', () => {
    fc.assert(
      fc.property(commandsArb, (commands) => {
        const { state, world } = startScenario({ seed: DEFAULT_SEED, protagonist: 0, commands, ticks: TICKS });
        let k = 0;
        while (state.tick < TICKS) {
          const next = commands.slice(k).findIndex((c) => c.t > state.tick);
          const end = next < 0 ? commands.length : k + next;
          runTo(state, world, commands.slice(k, end), state.tick + 1);
          k = end;
          const p = state.player;
          if (!passable(world, p.x, p.y)) return false;
          if (p.stepLeft < 0 || p.stepLeft > p.stepTotal) return false;
          if (Math.abs(p.x - p.fromX) + Math.abs(p.y - p.fromY) > 1 && p.stepLeft > 0) return false;
        }
        return true;
      }),
      FC,
    );
  });

  it('the same input always gives the same state, and state survives JSON', () => {
    fc.assert(
      fc.property(commandsArb, (commands) => {
        const a = startScenario({ seed: DEFAULT_SEED, protagonist: 0, commands, ticks: TICKS });
        const b = startScenario({ seed: DEFAULT_SEED, protagonist: 0, commands, ticks: TICKS });
        runTo(a.state, a.world, commands, TICKS / 2);
        // Halfway, round-trip one copy through JSON (a save), then carry both on.
        const saved = JSON.parse(JSON.stringify(a.state));
        runTo(b.state, b.world, commands, TICKS / 2);
        runTo(saved, a.world, commands, TICKS);
        runTo(b.state, b.world, commands, TICKS);
        expect(stateHash(saved)).toBe(stateHash(b.state));
      }),
      { ...FC, numRuns: 15 },
    );
  });
});
