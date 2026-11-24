import { describe, expect, it } from 'vitest';
import { APPROACH_IDS } from '../../src/content/approaches';
import { BIOME_IDS } from '../../src/content/biomes';
import { TERRAIN_GEN } from '../../src/content/tuning';
import type { TileState } from '../../src/content/terrain';
import { CRATER_MASKS, craterMask, frameName, sheetFrameNames, tileFrame, tileOverlay } from '../../src/render/tileFrames';
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
              const joined = tileFrame(seen, 0, (dc, dr) => t.tile(c + dc, r + dr));
              expect(tiles.has(joined), `${biome}/${approach} ${tile.mat} ${state} -> ${joined}`).toBe(true);
              const o = tileOverlay(seen);
              if (o) expect(clumps.has(o), `${biome}/${approach} ${tile.mat} ${state} -> ${o}`).toBe(true);
            }
          }
        }
      }
    }
  });

  it('a crater joins the craters round it: sides first, a corner only between two joined sides', () => {
    const among = (...at: [number, number][]) => craterMask((dc, dr) => at.some(([c, r]) => c === dc && r === dr));
    expect(among()).toBe(0);
    // Ahead (up the screen) 1, right 2, behind 4, left 8.
    expect(among([1, 0])).toBe(1);
    expect(among([0, 1])).toBe(2);
    expect(among([-1, 0])).toBe(4);
    expect(among([0, -1])).toBe(8);
    // A crater at the corner alone doesn't join; with both sides beside it, it does.
    expect(among([1, 1])).toBe(0);
    expect(among([1, 0], [1, 1])).toBe(1);
    expect(among([1, 0], [0, 1], [1, 1])).toBe(1 | 2 | 16);
    const all: [number, number][] = [];
    for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) if (dc || dr) all.push([dc, dr]);
    expect(among(...all)).toBe(255);
    expect(CRATER_MASKS).toHaveLength(47);
    expect(CRATER_MASKS).toContain(0);
    expect(CRATER_MASKS).toContain(255);
  });

  it('a crater tile is drawn by its neighbors; alone, or without them, as a single shell hole', () => {
    const tile = (mat: Tile['mat']): Tile => ({ mat, state: 'intact', hp: 0, variant: 3 });
    const crater = tile('crater');
    expect(tileFrame(crater, 0)).toBe(frameName.crater(0, 3));
    expect(tileFrame(crater, 0, () => tile('ground'))).toBe(frameName.crater(0, 3));
    expect(tileFrame(crater, 0, () => tile('crater'))).toBe(frameName.crater(255, 3));
    // The edge of the field counts as ground.
    expect(tileFrame(crater, 0, (_dc, dr) => (dr < 0 ? undefined : tile('crater')))).toBe(frameName.crater(1 | 2 | 4 | 16 | 32, 3));
  });

  it("a bridge tile shows the span's edge on the side where the deck ends", () => {
    const tile = (mat: Tile['mat'], state: Tile['state'] = 'intact'): Tile => ({ mat, state, hp: 1, variant: 0 });
    const deck = tile('bridge');
    const beside = (left: Tile['mat'], right: Tile['mat']) => tileFrame(deck, 0, (_dc, dr) => tile(dr < 0 ? left : right));
    expect(beside('bridge', 'bridge')).toBe(frameName.bridge(false, 0, false));
    expect(beside('water', 'bridge')).toBe(frameName.bridge(false, 1, false));
    expect(beside('bridge', 'water')).toBe(frameName.bridge(false, 2, false));
    expect(beside('water', 'shallows')).toBe(frameName.bridge(false, 3, false));
    // The road at an abutment is no edge: the deck runs on into it.
    expect(beside('road', 'water')).toBe(frameName.bridge(false, 2, false));
    // A different kind of bridge alongside is still this span's edge; a light bridge has its own frames.
    expect(beside('lightBridge', 'bridge')).toBe(frameName.bridge(false, 1, false));
    expect(tileFrame(tile('lightBridge', 'damaged'), 0, () => tile('water'))).toBe(frameName.bridge(true, 3, true));
  });
});
