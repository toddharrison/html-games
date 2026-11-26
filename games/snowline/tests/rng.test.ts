import { describe, expect, it } from 'vitest';
import { cloneRng, hash2, makeRng, makeStreams, nextFloat, nextInt, nextU32, shuffle } from '../src/sim/rng.ts';
import { canonicalJson, hashValue } from '../src/sim/hash.ts';
import { clock, daylightAt, sightRadius } from '../src/sim/time.ts';
import { DAY_SIGHT, NIGHT_SIGHT, START_MINUTE, TICKS_PER_MINUTE } from '../src/content/balance.ts';

describe('rng', () => {
  it('gives the same numbers for the same seed and stream', () => {
    const a = makeRng('seed', 'weather');
    const b = makeRng('seed', 'weather');
    for (let i = 0; i < 100; i++) expect(nextU32(a)).toBe(nextU32(b));
  });

  it('gives different numbers for different streams and seeds', () => {
    expect(nextU32(makeRng('seed', 'weather'))).not.toBe(nextU32(makeRng('seed', 'animals')));
    expect(nextU32(makeRng('seed', 'weather'))).not.toBe(nextU32(makeRng('seed2', 'weather')));
  });

  it('has a fixed sequence (a change here changes every valley)', () => {
    const r = makeRng('first-light', 'worldgen');
    expect([nextU32(r), nextU32(r), nextU32(r)]).toMatchInlineSnapshot(`
      [
        3677138068,
        1031085752,
        2801322539,
      ]
    `);
  });

  it('streams are independent: drawing from one never moves another', () => {
    const s1 = makeStreams('x');
    const s2 = makeStreams('x');
    for (let i = 0; i < 50; i++) nextU32(s1.weather);
    expect(nextU32(s1.animals)).toBe(nextU32(s2.animals));
  });

  it('counts draws, and a clone carries on identically', () => {
    const r = makeRng('x', 'y');
    nextU32(r);
    nextU32(r);
    expect(r.n).toBe(2);
    const c = cloneRng(r);
    expect(nextU32(c)).toBe(nextU32(r));
  });

  it('stays in range', () => {
    const r = makeRng('range', 'test');
    for (let i = 0; i < 2000; i++) {
      const f = nextFloat(r);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = nextInt(r, 7);
      expect(Number.isInteger(n) && n >= 0 && n < 7).toBe(true);
    }
  });

  it('shuffles into a permutation', () => {
    const r = makeRng('shuffle', 'test');
    const out = shuffle(r, [1, 2, 3, 4, 5, 6]);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('position hashes depend only on their inputs', () => {
    expect(hash2(1, 10, 20, 3)).toBe(hash2(1, 10, 20, 3));
    expect(hash2(1, 10, 20, 3)).not.toBe(hash2(1, 20, 10, 3));
  });

  it('state survives a JSON round trip', () => {
    const r = makeRng('json', 'test');
    nextU32(r);
    const back = JSON.parse(JSON.stringify(r));
    expect(nextU32(back)).toBe(nextU32(r));
  });
});

describe('hash', () => {
  it('ignores key order', () => {
    expect(canonicalJson({ b: 1, a: [1, { d: 2, c: 3 }] })).toBe(canonicalJson({ a: [1, { c: 3, d: 2 }], b: 1 }));
    expect(hashValue({ a: 1, b: 2 })).toBe(hashValue({ b: 2, a: 1 }));
    expect(hashValue({ a: 1 })).not.toBe(hashValue({ a: 2 }));
  });
});

describe('time', () => {
  it('starts on day 1 at the start time', () => {
    const c = clock(0);
    expect(c.day).toBe(1);
    expect(c.minute).toBe(START_MINUTE);
  });

  it('runs 10 ticks a minute and rolls over at midnight', () => {
    const toMidnight = (24 * 60 - START_MINUTE) * TICKS_PER_MINUTE;
    expect(clock(toMidnight - 1).day).toBe(1);
    expect(clock(toMidnight)).toEqual({ day: 2, minute: 0, hour: 0 });
  });

  it('is dark at night, light at noon, and in between at dusk', () => {
    expect(daylightAt(2 * 60)).toBe(0);
    expect(daylightAt(12 * 60)).toBe(100);
    const dusk = daylightAt(19 * 60 + 30);
    expect(dusk).toBeGreaterThan(0);
    expect(dusk).toBeLessThan(100);
  });

  it('sight runs from night to day radius', () => {
    const noon = (12 * 60 + 24 * 60 - START_MINUTE) * TICKS_PER_MINUTE;
    const midnight = (24 * 60 - START_MINUTE) * TICKS_PER_MINUTE;
    expect(sightRadius(noon)).toBe(DAY_SIGHT);
    expect(sightRadius(midnight)).toBe(NIGHT_SIGHT);
  });
});
