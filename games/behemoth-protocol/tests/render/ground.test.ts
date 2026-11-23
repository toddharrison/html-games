import { describe, expect, it } from 'vitest';
import type { MaterialId } from '../../src/content/terrain';
import { BIOME_IDS } from '../../src/content/biomes';
import type { Tile } from '../../src/sim/terrain';
import { paintGround, type GroundSource } from '../../src/render/ground';
import { LOOKS, lookFor, lookPalette, type Look } from '../../src/render/looks';

const T = 16;
const C = 16;
const ROWS = 21;

/** A field of open ground, with `mats` placing other materials at "col,row". */
function field(seed: number, mats: Record<string, MaterialId> = {}): GroundSource {
  return {
    seed,
    rows: ROWS,
    tile(col: number, row: number): Tile | undefined {
      if (row < 0 || row >= ROWS) return undefined;
      return { mat: mats[`${col},${row}`] ?? 'ground', state: 'intact', hp: 1, variant: 0 };
    },
  };
}

const summer = LOOKS.temperate.find((l) => l.id === 'summer')!;
const pal = lookPalette('temperate', summer);
const paint = (src: GroundSource, look: Look = summer, ci = 0) => paintGround(src, look, look === summer ? pal : lookPalette('temperate', look), ci, C, T);

/** The pixel's color at tile-local (xi, yi) of sim tile (col, row) in chunk 0, screen-oriented. */
function px(out: Uint8ClampedArray, col: number, row: number, xi: number, yi: number): string {
  const x = row * T + xi;
  const y = (C - 1 - col) * T + yi;
  const k = (y * ROWS * T + x) * 4;
  return `#${[out[k]!, out[k + 1]!, out[k + 2]!].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

describe('ground painter', () => {
  it('is opaque and deterministic for a seed and look', () => {
    const a = paint(field(7));
    const b = paint(field(7));
    expect(a).toEqual(b);
    for (let k = 3; k < a.length; k += 4) expect(a[k]).toBe(255);
    expect(paint(field(8))).not.toEqual(a);
  });

  it('paints a mine exactly like the ground it hides in', () => {
    const open = paint(field(3));
    const mined = paint(field(3, { '5,10': 'mine', '6,10': 'mine', '5,11': 'crater', '9,4': 'tankTrap' }));
    expect(mined).toEqual(open);
  });

  it('lines water with the look\'s bank colors', () => {
    const mats: Record<string, MaterialId> = {};
    for (let r = 0; r < ROWS; r++) mats[`8,${r}`] = 'water';
    const out = paint(field(11, mats));
    const bank = new Set(summer.bank);
    // The pixels of the tiles either side touching the water are bank, at least for the most part.
    let banked = 0;
    for (let r = 2; r < ROWS - 2; r++) {
      for (let xi = 0; xi < T; xi++) {
        if (bank.has(px(out, 7, r, xi, 0))) banked++;
        if (bank.has(px(out, 9, r, xi, T - 1))) banked++;
      }
    }
    expect(banked / (2 * (ROWS - 4) * T)).toBeGreaterThan(0.9);
    // Well back from the river there's no bank.
    for (let xi = 0; xi < T; xi++) expect(bank.has(px(out, 2, 10, xi, 8))).toBe(false);
  });

  it('uses all three ground tones in sizable shares over a long stretch', () => {
    const counts = [0, 0, 0];
    const bases = summer.tones.map((t) => new Set(t));
    for (let ci = 0; ci < 12; ci++) {
      const out = paint(field(21), summer, ci);
      for (let k = 0; k < out.length; k += 4 * 7) {
        const hex = `#${[out[k]!, out[k + 1]!, out[k + 2]!].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
        bases.forEach((s, i) => s.has(hex) && counts[i]!++);
      }
    }
    const total = counts.reduce((a, b) => a + b, 0);
    for (const c of counts) expect(c / total).toBeGreaterThan(0.12);
  });

  it('covers about the look\'s share of the ground with bare patches', () => {
    for (const look of [summer, LOOKS.arctic.find((l) => l.id === 'thaw')!]) {
      const bare = new Set(look.bare);
      let n = 0;
      let all = 0;
      for (let ci = 0; ci < 12; ci++) {
        const out = paintGround(field(5), look, lookPalette('temperate', look), ci, C, T);
        for (let k = 0; k < out.length; k += 4 * 5) {
          const hex = `#${[out[k]!, out[k + 1]!, out[k + 2]!].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
          if (bare.has(hex)) n++;
          all++;
        }
      }
      // Decals and ruts take a few pixels; the noise is lumpy over 12 chunks.
      expect(n / all).toBeGreaterThan(look.bareCover * 0.4);
      expect(n / all).toBeLessThan(look.bareCover * 1.8);
    }
  });

  it('matches across a chunk boundary', () => {
    // The tone field is continuous in world space: the rows either side of the seam mostly agree.
    const below = paint(field(9), summer, 0);
    const above = paint(field(9), summer, 1);
    const W = ROWS * T;
    const H = C * T;
    const tone = (hex: string) => summer.tones.findIndex((t) => (t as readonly string[]).includes(hex));
    const at = (out: Uint8ClampedArray, x: number, y: number) => {
      const k = (y * W + x) * 4;
      return tone(`#${[out[k]!, out[k + 1]!, out[k + 2]!].map((v) => v.toString(16).padStart(2, '0')).join('')}`);
    };
    let same = 0;
    for (let x = 0; x < W; x++) if (at(below, x, 0) === at(above, x, H - 1)) same++;
    expect(same / W).toBeGreaterThan(0.85);
  });
});

describe('looks', () => {
  it('every biome has looks, picked deterministically from the seed', () => {
    for (const biome of BIOME_IDS) {
      expect(LOOKS[biome].length).toBeGreaterThan(1);
      expect(lookFor(biome, 42)).toBe(lookFor(biome, 42));
      const seen = new Set<string>();
      for (let s = 0; s < 60; s++) seen.add(lookFor(biome, s).id);
      expect(seen.size).toBe(LOOKS[biome].length);
    }
  });
});
