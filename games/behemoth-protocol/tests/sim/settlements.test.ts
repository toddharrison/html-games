import { describe, expect, it } from 'vitest';
import { APPROACH_IDS } from '../../src/content/approaches';
import { BIOME_IDS, type BiomeId } from '../../src/content/biomes';
import { SETTLEMENTS, STRUCTURES, TREES, type StructureId } from '../../src/content/structures';
import { MATERIALS } from '../../src/content/terrain';
import { TERRAIN_GEN } from '../../src/content/tuning';
import type { SimEvent } from '../../src/sim/events';
import { chunkRiver, generateChunk, LINK, Terrain, type TerrainRecipe, type Tile } from '../../src/sim/terrain';

const FIELD = 21;
const TS = TERRAIN_GEN.tileSize;
const CHUNK = TERRAIN_GEN.chunkCols;
const RECIPES: TerrainRecipe[] = BIOME_IDS.flatMap((biome) => [null, ...APPROACH_IDS].map((approach) => ({ biome, approach })));
const name = (r: TerrainRecipe) => `${r.biome}/${r.approach ?? 'mix'}`;

/** Every tile over the first `chunks` chunks of a terrain, with its column and row. */
function* tiles(t: Terrain, chunks: number): Generator<[Tile, number, number]> {
  t.ensure(0, chunks * CHUNK * TS);
  for (let c = 0; c < chunks * CHUNK; c++) for (let r = 0; r < t.rows; r++) yield [t.tile(c, r)!, c, r];
}

/** Structures placed (one count per structure, at its first tile). */
function structureCounts(recipe: TerrainRecipe, seeds = [1, 2, 3, 4], chunks = 30): Map<StructureId, number> {
  const out = new Map<StructureId, number>();
  for (const seed of seeds) {
    for (const [t] of tiles(new Terrain(seed, FIELD, recipe), chunks)) {
      const a = t.art;
      if (a?.kind === 'structure' && a.dc === 0 && a.dr === 0) out.set(a.id, (out.get(a.id) ?? 0) + 1);
    }
  }
  return out;
}

describe('settlements (SPEC §4.6)', () => {
  it('lay every structure out whole: each tile of a footprint is there, in place, across chunk edges', { timeout: 30_000 }, () => {
    for (const recipe of RECIPES) {
      for (const seed of [1, 2]) {
        const t = new Terrain(seed, FIELD, recipe);
        for (const [tile, c, r] of tiles(t, 24)) {
          const a = tile.art;
          if (a?.kind !== 'structure') continue;
          expect(tile.mat, name(recipe)).toBe('building');
          expect([a.cols, a.rows]).toEqual(a.cols === 1 && a.rows === 1 ? [1, 1] : [STRUCTURES[a.id].cols, STRUCTURES[a.id].rows]);
          for (let i = 0; i < a.cols; i++) {
            for (let j = 0; j < a.rows; j++) {
              const o = t.tile(c - a.dc + i, r - a.dr + j)?.art;
              expect(o?.kind === 'structure' && o.uid === a.uid && o.dc === i && o.dr === j, `${name(recipe)} seed ${seed} (${c},${r}) ${a.id}`).toBe(true);
            }
          }
        }
      }
    }
  });

  it('build what their biome builds: its own structures, farmsteads only on temperate farms', { timeout: 30_000 }, () => {
    for (const biome of BIOME_IDS) {
      const allowed = new Set<StructureId>();
      for (const s of Object.values(SETTLEMENTS[biome])) {
        for (const k of [...Object.keys(s.lots), ...Object.keys(s.landmarks ?? {})]) {
          if (k in STRUCTURES) allowed.add(k as StructureId).add(STRUCTURES[k as StructureId].fallback);
        }
      }
      if (biome === 'temperate') for (const id of ['farmhouse', 'barn', 'silo'] as const) allowed.add(id);
      for (const approach of [null, 'urban'] as const) {
        for (const id of structureCounts({ biome, approach }, [1, 2]).keys()) expect(allowed.has(id), `${biome}/${approach} has ${id}`).toBe(true);
      }
    }
  });

  it('make cities of the urban approach: towers, midrises, and a landmark now and then', { timeout: 30_000 }, () => {
    for (const biome of BIOME_IDS) {
      const city = structureCounts({ biome, approach: 'urban' });
      const big = (city.get('tower') ?? 0) + (city.get('midrise') ?? 0);
      expect(big, biome).toBeGreaterThan(10);
      expect(structureCounts({ biome, approach: null }).get('tower') ?? 0, `${biome} towns have no towers`).toBe(0);
    }
    expect(structureCounts({ biome: 'temperate', approach: 'urban' }).get('capitol') ?? 0).toBeGreaterThan(0);
    expect(structureCounts({ biome: 'industrial', approach: 'urban' }).get('coolingTower') ?? 0).toBeGreaterThan(0);
  });

  it('give farms a yard: a farmhouse and a barn inside the field', () => {
    const c = structureCounts({ biome: 'temperate', approach: null });
    expect(c.get('farmhouse') ?? 0).toBeGreaterThan(5);
    expect(c.get('barn') ?? 0).toBeGreaterThan(5);
  });

  it("plant each biome's own tree species", { timeout: 30_000 }, () => {
    for (const biome of BIOME_IDS) {
      const seen = new Set<string>();
      for (const seed of [1, 2, 3]) for (const [t] of tiles(new Terrain(seed, FIELD, { biome, approach: 'forest' }), 16)) if (t.art?.kind === 'tree') seen.add(t.art.species);
      expect(seen.size, biome).toBeGreaterThan(0);
      for (const s of seen) expect(s in TREES[biome], `${biome} has ${s}`).toBe(true);
    }
  });
});

describe('roads and walls', () => {
  it('link both ways: a tile joined to a neighbor is joined back', { timeout: 30_000 }, () => {
    const opposite: [number, number, number, number][] = [
      [LINK.fwd, LINK.back, 1, 0],
      [LINK.right, LINK.left, 0, 1],
    ];
    for (const recipe of RECIPES) {
      const t = new Terrain(3, FIELD, recipe);
      for (const [tile, c, r] of tiles(t, 20)) {
        if (tile.links === undefined) continue;
        for (const [bit, back, dc, dr] of opposite) {
          if (!(tile.links & bit) || r + dr >= FIELD) continue;
          const n = t.tile(c + dc, r + dr)!;
          // Roads also join bridges, which carry no links of their own.
          if (n.links === undefined) continue;
          expect(!!(n.links & back), `${name(recipe)} (${c},${r})`).toBe(true);
        }
      }
    }
  });

  it('wind country roads across the field, and roads cross it now and then', () => {
    let country = 0;
    for (const biome of BIOME_IDS) {
      for (const seed of [1, 2, 3]) {
        for (const [t] of tiles(new Terrain(seed, FIELD, { biome, approach: null }), 24)) {
          if (t.art?.kind === 'road' && (t.art.style === 'track' || t.art.style === 'paved')) country++;
        }
      }
    }
    expect(country).toBeGreaterThan(500);
  });

  it('leave rock free to cover a country road (so rock never has a road-shaped notch)', () => {
    for (const [t] of tiles(new Terrain(3, FIELD, { biome: 'temperate', approach: 'pass' }), 24)) {
      if (t.mat === 'rock') expect(t.art).toBeUndefined();
    }
  });
});

describe('footbridges', () => {
  const findFootbridge = (seed: number): { t: Terrain; c: number; r: number } => {
    const t = new Terrain(seed, FIELD, { biome: 'temperate', approach: 'river' });
    for (const [tile, c, r] of tiles(t, 30)) if (tile.mat === 'footbridge') return { t, c, r };
    throw new Error('no footbridge');
  };

  it('span open water only, troops cross them, and vehicles never get on', () => {
    const { t, c, r } = findFootbridge(3);
    const tile = t.tile(c, r)!;
    expect(['water', 'shallows']).toContain(tile.under);
    expect(t.speedAt((c + 0.5) * TS, (r + 0.5) * TS, 'foot')).toBe(1);
    expect(t.speedAt((c + 0.5) * TS, (r + 0.5) * TS, 'tracked')).toBe(0);
    // Frozen and dry rivers have none.
    for (const biome of ['arctic', 'desert'] as BiomeId[]) {
      for (let ci = 0; ci < 30; ci++) expect(chunkRiver(3, ci, FIELD, { biome, approach: 'river' })?.footbridges ?? []).toEqual([]);
    }
  });

  it("come down under the Behemoth's weight all at once, without jolting it", () => {
    const { t, c, r } = findFootbridge(4);
    const events: SimEvent[] = [];
    const spans = t.bear({ x0: c * TS + 2, x1: (c + 1) * TS - 2, y0: r * TS + 2, y1: (r + 1) * TS - 2 }, 245, 1 / 60, events);
    expect(spans).toBe(0);
    expect(t.tile(c, r)!.mat).not.toBe('footbridge');
    const down = events.find((e) => e.type === 'bridgeCollapse');
    expect(down?.type === 'bridgeCollapse' && down.mat === 'footbridge' && down.tiles > 1).toBe(true);
    for (let dc = -8; dc <= 8; dc++) expect(t.tile(c + dc, r)?.mat).not.toBe('footbridge');
  });
});

describe('parked cars', () => {
  it('stand on streets and roads, and the treads crush them flat like rubble', () => {
    const t = new Terrain(2, FIELD, { biome: 'wasteland', approach: 'urban' });
    let car: [number, number] | null = null;
    for (const [tile, c, r] of tiles(t, 20)) {
      if (tile.mat !== 'car') continue;
      expect(tile.art?.kind).toBe('road');
      if (tile.state === 'intact') car ??= [c, r];
    }
    expect(car).not.toBeNull();
    const [c, r] = car!;
    expect(t.crush(c, r, [])).toBe('light');
    expect(t.tile(c, r)!.state).toBe('flattened');
    expect(MATERIALS.car.obstacle.flattened).toBe('none');
  });

  it('are the same from every generation order (art and links included)', () => {
    const recipe: TerrainRecipe = { biome: 'temperate', approach: 'urban' };
    expect(generateChunk(9, 5, FIELD, recipe)).toEqual(generateChunk(9, 5, FIELD, recipe));
    const a = new Terrain(9, FIELD, recipe);
    a.ensure(0, 3000);
    const b = new Terrain(9, FIELD, recipe);
    b.ensure(1600, 3000);
    b.ensure(0, 1599);
    for (let c = 0; c < 3000 / TS; c++) for (let r = 0; r < FIELD; r++) expect(b.tile(c, r)).toEqual(a.tile(c, r));
  });
});
