// The protagonist sweep (SPEC 11.4): every background, trait, and tool combination starts a valid run.

import { describe, expect, it } from 'vitest';
import { BACKGROUNDS, NAMES, TOOLS, TRAITS } from '../src/content/protagonists.ts';
import { DEFAULT_SEED, newGame } from '../src/sim/newGame.ts';
import { candidate, PAGE, protagonistProblems, pronouns, type Protagonist } from '../src/sim/protagonist.ts';
import { step } from '../src/sim/step.ts';
import { passable } from '../src/sim/world.ts';
import { valley } from '../src/tools/runner.ts';

describe('protagonists', () => {
  it('a candidate is always the same person', () => {
    expect(candidate('x', 2)).toEqual(candidate('x', 2));
    expect(candidate('x', 2)).not.toEqual(candidate('x', 3));
  });

  it('candidates are valid, and the roster has boys and girls', () => {
    const genders = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const p = candidate('roster', i);
      expect(protagonistProblems(p)).toEqual([]);
      genders.add(p.gender);
    }
    expect([...genders].sort()).toEqual(['boy', 'girl']);
    expect(NAMES.boy.length).toBe(NAMES.girl.length);
  });

  it('the three cards on a page never share a name, background, trait, or tool', () => {
    for (const seed of [DEFAULT_SEED, 'roster', 'x'])
      for (let page = 0; page < 20; page++) {
        const cards = [0, 1, 2].map((i) => candidate(seed, page * PAGE + i));
        for (const k of ['name', 'background', 'trait', 'tool'] as const) expect(new Set(cards.map((c) => c[k])).size).toBe(PAGE);
      }
  });

  it('pronouns follow the protagonist', () => {
    expect(pronouns({ ...candidate('x', 0), gender: 'girl' }).they).toBe('she');
    expect(pronouns({ ...candidate('x', 0), gender: 'boy' }).their).toBe('his');
  });

  it('flags a bad hand-built protagonist', () => {
    const p: Protagonist = { ...candidate('x', 0), age: 30, tool: 'chainsaw' };
    expect(protagonistProblems(p)).toHaveLength(2);
  });

  it('every background, trait, and tool starts a valid run', () => {
    const { world, rules } = valley(DEFAULT_SEED);
    const base = candidate(DEFAULT_SEED, 0);
    let runs = 0;
    for (const b of BACKGROUNDS)
      for (const t of TRAITS)
        for (const tool of TOOLS) {
          const p: Protagonist = { ...base, background: b.id, trait: t.id, tool: tool.id };
          expect(protagonistProblems(p)).toEqual([]);
          const state = newGame(DEFAULT_SEED, p, world, structuredClone(rules));
          for (let k = 0; k < 20; k++) step(state, world, k === 0 ? [{ t: 0, c: 'move', dir: 1 }] : []);
          expect(passable(world, state.player.x, state.player.y)).toBe(true);
          runs++;
        }
    expect(runs).toBe(BACKGROUNDS.length * TRAITS.length * TOOLS.length);
  });
});
