import { describe, expect, it } from 'vitest';
import { APPROACH_IDS } from '../../src/content/approaches';
import { BIOME_IDS } from '../../src/content/biomes';
import { TERRAIN_GEN } from '../../src/content/tuning';
import type { TileState } from '../../src/content/terrain';
import { craterPiece, frameName, sheetFrameNames, tileFrame, tileOverlay, type Around } from '../../src/render/tileFrames';
import type { Tile } from '../../src/sim/terrain';
import { Terrain } from '../../src/sim/terrain';

const FIELD = 21;
const STATES: TileState[] = ['intact', 'damaged', 'destroyed', 'flattened'];

describe('terrain frames', () => {
  it('every tile, in every state, draws with frames its biome sheets have', { timeout: 30_000 }, () => {
    for (const biome of BIOME_IDS) {
      const { tiles, clumps } = sheetFrameNames(biome);
      for (const approach of [null, ...APPROACH_IDS]) {
        const t = new Terrain(5, FIELD, { biome, approach });
        const cols = 20 * TERRAIN_GEN.chunkCols;
        t.ensure(0, cols * TERRAIN_GEN.tileSize);
        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < FIELD; r++) {
            const tile = t.tile(c, r)!;
            for (const state of STATES) {
              const seen = { ...tile, state, seen: true };
              for (const shimmer of [0, 1]) expect(tiles.has(tileFrame(seen, shimmer)), `${biome}/${approach} ${tile.mat} ${state} -> ${tileFrame(seen, shimmer)}`).toBe(true);
              // And as it's drawn among its neighbors (craters join up, bridges show their edges).
              const joined = tileFrame(seen, 0, { seed: t.seed, col: c, row: r, tile: (cc, rr) => t.tile(cc, rr) });
              expect(tiles.has(joined), `${biome}/${approach} ${tile.mat} ${state} -> ${joined}`).toBe(true);
              const o = tileOverlay(seen);
              if (o) expect(clumps.has(o), `${biome}/${approach} ${tile.mat} ${state} -> ${o}`).toBe(true);
            }
          }
        }
      }
    }
  });

  /** Cratered ground: every tile `crater` where `at` says so, open ground elsewhere. */
  const ground = (seed: number, at: (col: number, row: number) => boolean) => {
    const tile = (col: number, row: number): Tile => ({ mat: at(col, row) ? 'crater' : 'ground', state: 'intact', hp: 0, variant: (col * 7 + row) & 3 });
    return (col: number, row: number): Around => ({ seed, col, row, tile });
  };

  it('a crater alone, or with no place given, is a single shell hole', () => {
    const lone = ground(1, (c, r) => c === 10 && r === 10);
    expect(craterPiece(lone(10, 10), 2)).toEqual({ size: 1, dc: 0, dr: 0, v: 2 });
    expect(tileFrame({ mat: 'crater', state: 'intact', hp: 0, variant: 3 }, 0)).toBe(frameName.crater(1, 3, 0, 0));
    // Two side by side stay two holes: nothing bigger fits.
    const pair = ground(1, (c, r) => r === 10 && (c === 10 || c === 11));
    expect(craterPiece(pair(10, 10), 0).size).toBe(1);
  });

  it('a wide stretch of cratered ground is packed with big, middling, and small round craters, each whole', () => {
    for (const seed of [1, 2, 3]) {
      const at = ground(seed, (c, r) => c >= 0 && c < 30 && r >= 0 && r < 21);
      const count = { 1: 0, 2: 0, 3: 0 };
      // Every tile of a crater's block names the same crater: same size and variant, and its own piece of it.
      const whole = new Map<string, Set<string>>();
      for (let c = 0; c < 30; c++) {
        for (let r = 0; r < 21; r++) {
          const p = craterPiece(at(c, r), (c + r) & 3);
          count[p.size]++;
          expect(p.dc).toBeLessThan(p.size);
          expect(p.dr).toBeLessThan(p.size);
          if (p.size === 1) continue;
          const key = `${p.size}:${c - p.dc}:${r - p.dr}:${p.v}`;
          if (!whole.has(key)) whole.set(key, new Set());
          whole.get(key)!.add(`${p.dc},${p.dr}`);
        }
      }
      for (const [key, pieces] of whole) expect(pieces.size, key).toBe(Number(key[0]) ** 2);
      // A mix, not one size.
      expect(count[3]).toBeGreaterThan(60);
      expect(count[2]).toBeGreaterThan(20);
      expect(count[1]).toBeGreaterThan(20);
    }
  });

  it('a big crater needs every tile of its block cratered', () => {
    const full = ground(1, () => true);
    // Find a 3x3 crater, then knock one of its tiles back to ground: it breaks up.
    let found: [number, number] | null = null;
    for (let c = 0; c < 12 && !found; c++) for (let r = 0; r < 12 && !found; r++) if (craterPiece(full(c, r), 0).size === 3 && craterPiece(full(c, r), 0).dc === 0 && craterPiece(full(c, r), 0).dr === 0) found = [c, r];
    expect(found).not.toBeNull();
    const [c0, r0] = found!;
    const holed = ground(1, (c, r) => !(c === c0 + 1 && r === r0 + 1));
    expect(craterPiece(holed(c0, r0), 0).size).toBeLessThan(3);
  });

  it("a bridge tile shows the span's edge on the side where the deck ends", () => {
    const tile = (mat: Tile['mat'], state: Tile['state'] = 'intact'): Tile => ({ mat, state, hp: 1, variant: 0 });
    const deck = tile('bridge');
    const beside = (left: Tile['mat'], right: Tile['mat']) => tileFrame(deck, 0, { seed: 1, col: 5, row: 5, tile: (_c, r) => tile(r < 5 ? left : right) });
    expect(beside('bridge', 'bridge')).toBe(frameName.bridge(false, 0, false));
    expect(beside('water', 'bridge')).toBe(frameName.bridge(false, 1, false));
    expect(beside('bridge', 'water')).toBe(frameName.bridge(false, 2, false));
    expect(beside('water', 'shallows')).toBe(frameName.bridge(false, 3, false));
    // The road at an abutment is no edge: the deck runs on into it.
    expect(beside('road', 'water')).toBe(frameName.bridge(false, 2, false));
    // A different kind of bridge alongside is still this span's edge; a light bridge has its own frames.
    expect(beside('lightBridge', 'bridge')).toBe(frameName.bridge(false, 1, false));
    expect(tileFrame(tile('lightBridge', 'damaged'), 0, { seed: 1, col: 5, row: 5, tile: () => tile('water') })).toBe(frameName.bridge(true, 3, true));
  });
});
