import { describe, expect, it } from 'vitest';
import { MINE_RING, mineRing } from '../../src/render/mineView';

describe("a swept mine's warning ring", () => {
  it('swells from the lid to the edge of its tile, fading as it goes', () => {
    const start = mineRing(0, 0, 0);
    expect(start.r).toBeCloseTo(MINE_RING.r0);
    expect(start.alpha).toBeCloseTo(MINE_RING.alpha);
    let last = start;
    for (let i = 1; i < 20; i++) {
      const at = mineRing((i / 20) * MINE_RING.period, 0, 0);
      expect(at.r).toBeGreaterThan(last.r);
      expect(at.alpha).toBeLessThan(last.alpha);
      last = at;
    }
    expect(last.r).toBeLessThanOrEqual(MINE_RING.r1);
    // It stays inside its own tile (16 px), so a field's rings don't run together.
    expect(MINE_RING.r1).toBeLessThanOrEqual(8);
  });

  it('pulses again every period, for as long as the battle runs', () => {
    for (const t of [0.3, 7.25, 412.8]) {
      const a = mineRing(t, 4, 9);
      const b = mineRing(t + MINE_RING.period, 4, 9);
      expect(b.r).toBeCloseTo(a.r, 5);
      expect(b.alpha).toBeCloseTo(a.alpha, 5);
    }
  });

  it('ripples across a field: neighbors are out of step, and it holds before the battle clock starts', () => {
    expect(mineRing(1, 10, 5).r).not.toBeCloseTo(mineRing(1, 11, 5).r, 3);
    const early = mineRing(0, 30, 12);
    expect(early.r).toBeGreaterThanOrEqual(MINE_RING.r0);
    expect(early.r).toBeLessThanOrEqual(MINE_RING.r1);
    expect(early.alpha).toBeGreaterThanOrEqual(0);
  });
});
