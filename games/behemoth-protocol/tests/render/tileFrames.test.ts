import { describe, expect, it } from 'vitest';
import { APPROACH_IDS } from '../../src/content/approaches';
import { BIOME_IDS } from '../../src/content/biomes';
import { TERRAIN_GEN } from '../../src/content/tuning';
import type { TileState } from '../../src/content/terrain';
import { sheetFrameNames, tileFrame, tileOverlay } from '../../src/render/tileFrames';
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
              const o = tileOverlay(seen);
              if (o) expect(clumps.has(o), `${biome}/${approach} ${tile.mat} ${state} -> ${o}`).toBe(true);
            }
          }
        }
      }
    }
  });
});
