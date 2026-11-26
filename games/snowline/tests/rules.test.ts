// Deal tests (SPEC 11.4): the same seed always gives the same deal, every deal is fair, and the deal
// and the terrain never move each other.

import { describe, expect, it } from 'vitest';
import { PLANTS, PLANT_DECK, STONES } from '../src/content/decks.ts';
import { F } from '../src/content/terrain.ts';
import { makeRng } from '../src/sim/rng.ts';
import { dealDeck, dealProblems, dealRules, describeRules, lookalikePairs } from '../src/sim/rules.ts';
import { generateWorld } from '../src/sim/worldgen/index.ts';
import { SAMPLE_SEEDS } from './sample.ts';

describe('dealing', () => {
  it('deals the whole core and fills with spares', () => {
    const rng = makeRng('deck', 'test');
    for (let k = 0; k < 50; k++) {
      const dealt = dealDeck(rng, PLANTS.length, PLANT_DECK);
      expect(dealt).toHaveLength(PLANTS.length);
      const left = [...dealt];
      for (const c of PLANT_DECK.core) left.splice(left.indexOf(c), 1);
      const spares = [...PLANT_DECK.spares];
      for (const s of left) {
        expect(spares).toContain(s);
        spares.splice(spares.indexOf(s), 1);
      }
    }
  });

  it('refuses a deck that cannot fill the row', () => {
    expect(() => dealDeck(makeRng('x', 'y'), 2, { core: ['a', 'b', 'c'], spares: [] })).toThrow();
  });

  it('the same seed always gives the same deal', () => {
    expect(dealRules('alpha')).toEqual(dealRules('alpha'));
  });

  it('different seeds give different deals', () => {
    const deals = SAMPLE_SEEDS.map((s) => JSON.stringify(dealRules(s)));
    expect(new Set(deals).size).toBe(deals.length);
  });

  it('every deal over the sample is fair', () => {
    for (const seed of [...SAMPLE_SEEDS, ...Array.from({ length: 200 }, (_, i) => `deal-${i}`)]) {
      const r = dealRules(seed);
      expect(dealProblems(r), seed).toEqual([]);
    }
  });

  it('the lookalike pair is one nourishing and one bad berry of the same family', () => {
    const r = dealRules('lookalike');
    const good = PLANTS[r.lookalike.good]!;
    const bad = PLANTS[r.lookalike.bad]!;
    expect(good.family).toBe(bad.family);
    expect(r.plants[r.lookalike.good]).toBe('nourishing');
    expect(['sickening', 'deadly']).toContain(r.plants[r.lookalike.bad]);
    expect(lookalikePairs(r.plants)).toContainEqual(r.lookalike);
  });

  it('varies who is who: each stone is the spark-stone in some valley', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 100; i++) seen.add(dealRules(`spark-${i}`).stones.indexOf('sparks'));
    expect(seen.size).toBe(STONES.length);
  });

  it('describes every dealt thing', () => {
    const rows = describeRules(dealRules('describe'));
    expect(rows.length).toBeGreaterThan(30);
    expect(rows.every((r) => r.outcome.length > 0)).toBe(true);
  });
});

describe('the deal and the terrain are separate', () => {
  it('changing the deal never changes the terrain', () => {
    const seed = 'separate';
    const a = generateWorld(seed, dealRules(seed));
    const b = generateWorld(seed, dealRules('some other deal'));
    expect(b.genSeed).toBe(a.genSeed);
    expect(Buffer.from(b.terrain).equals(Buffer.from(a.terrain))).toBe(true);
    expect(Buffer.from(b.elev).equals(Buffer.from(a.elev))).toBe(true);
    expect(Buffer.from(b.band).equals(Buffer.from(a.band))).toBe(true);
    expect(Buffer.from(b.flags).equals(Buffer.from(a.flags))).toBe(true);
    // Features sit in the same places; only the water cause (dealt) and the labels may differ.
    const cause = (f: number) => f === F.beaverDam || f === F.carcass;
    for (let i = 0; i < a.feature.length; i++) {
      if (cause(a.feature[i]!) || cause(b.feature[i]!)) continue;
      if (a.feature[i] !== b.feature[i]) throw new Error(`feature differs at tile ${i}`);
    }
    expect(b.start).toEqual(a.start);
    expect(b.patches.map((p) => p.center)).toEqual(a.patches.map((p) => p.center));
  });

  it('changing the terrain never changes the deal', () => {
    // The deal comes from the seed alone; generating a world (and retrying it) reads no deal stream.
    const before = dealRules('apart');
    generateWorld('apart', before);
    expect(dealRules('apart')).toEqual(before);
  });

  it('labels follow the deal: the overhang outcrop is the dealt spark-stone', () => {
    const seed = 'labels';
    const rules = dealRules(seed);
    const w = generateWorld(seed, rules);
    const at = w.sparkOutcrop.y * w.size + w.sparkOutcrop.x;
    expect(w.feature[at]).toBe(F.outcrop);
    expect(rules.stones[w.data[at]!]).toBe('sparks');
  });
});
