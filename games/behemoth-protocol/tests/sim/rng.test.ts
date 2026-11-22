import { describe, expect, it } from 'vitest';
import { hashSeed, Rng } from '../../src/sim/rng';

describe('Rng', () => {
  it('is deterministic for a given seed', () => {
    const a = new Rng(1234);
    const b = new Rng(1234);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('produces different streams for different seeds', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const same = Array.from({ length: 20 }, () => a.next() === b.next()).filter(Boolean).length;
    expect(same).toBeLessThan(2);
  });

  it('weighted picks follow the weights and skip zero weights', () => {
    const r = new Rng(7);
    const items = [
      { id: 'a', w: 1 },
      { id: 'b', w: 3 },
      { id: 'z', w: 0 },
    ];
    const counts: Record<string, number> = { a: 0, b: 0, z: 0 };
    for (let i = 0; i < 4000; i++) counts[r.weighted(items, (it) => it.w)!.id]!++;
    expect(counts.z).toBe(0);
    expect(counts.b! / counts.a!).toBeGreaterThan(2.5);
    expect(counts.b! / counts.a!).toBeLessThan(3.5);
    expect(r.weighted(items, () => 0)).toBeNull();
  });

  it('stays in range', () => {
    const r = new Rng(99);
    for (let i = 0; i < 2000; i++) {
      const f = r.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = r.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
      expect(Number.isInteger(n)).toBe(true);
    }
  });

  it('covers every integer in an inclusive range', () => {
    const r = new Rng(5);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(r.int(0, 4));
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('can save and restore its state', () => {
    const r = new Rng(42);
    r.next();
    const saved = r.state;
    const expected = [r.next(), r.next(), r.next()];
    r.state = saved;
    expect([r.next(), r.next(), r.next()]).toEqual(expected);
  });

  it('pick throws on empty arrays', () => {
    expect(() => new Rng(1).pick([])).toThrow();
  });
});

describe('hashSeed', () => {
  it('is stable and order-sensitive', () => {
    expect(hashSeed(1, 2, 3)).toBe(hashSeed(1, 2, 3));
    expect(hashSeed(1, 2, 3)).not.toBe(hashSeed(3, 2, 1));
    expect(hashSeed(0, 0)).not.toBe(hashSeed(0, 1));
  });

  it('returns a uint32', () => {
    for (let i = -5; i < 5; i++) {
      const h = hashSeed(i, i * 7);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(2 ** 32);
    }
  });
});
