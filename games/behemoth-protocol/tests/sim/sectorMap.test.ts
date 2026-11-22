import { describe, expect, it } from 'vitest';
import { BIOMES } from '../../src/content/biomes';
import { ENCOUNTER, RUN, SECTOR_MAP } from '../../src/content/tuning';
import { generateMap, hiddenIntel, isFinalNode, onRouteFrom, reachable, type BattleIntel, type MapNode, type Sector } from '../../src/sim/sectorMap';

const SEEDS = Array.from({ length: 60 }, (_, i) => i * 7919 + 3);

/** Every route through a sector, as node lists from entry to objective. */
function routes(sector: Sector): MapNode[][] {
  const out: MapNode[][] = [];
  const walk = (n: MapNode, path: MapNode[]) => {
    const next = [...path, n];
    if (n.next.length === 0) out.push(next);
    for (const id of n.next) walk(sector.nodes[id]!, next);
  };
  walk(sector.nodes[0]!, []);
  return out;
}

describe('sector map generation', () => {
  it('is deterministic per seed and differs between seeds', () => {
    expect(generateMap(42)).toEqual(generateMap(42));
    expect(JSON.stringify(generateMap(42))).not.toBe(JSON.stringify(generateMap(43)));
  });

  it('three sectors with different biomes: temperate first, the wasteland never first', () => {
    const later = new Set<string>();
    for (const seed of SEEDS) {
      const { sectors } = generateMap(seed);
      expect(sectors).toHaveLength(SECTOR_MAP.sectors);
      expect(sectors[0]!.biome).toBe('temperate');
      expect(new Set(sectors.map((s) => s.biome)).size).toBe(sectors.length);
      sectors.slice(1).forEach((s) => later.add(s.biome));
      for (const [i, s] of sectors.entries()) expect(BIOMES[s.biome].earliestSector ?? 1).toBeLessThanOrEqual(i + 1);
    }
    // Every other biome turns up somewhere.
    expect(later.size).toBe(Object.keys(BIOMES).length - 1);
  });

  it('routes run from one entry, branch, and meet at one objective, with no crossing paths', () => {
    for (const seed of SEEDS) {
      for (const sector of generateMap(seed).sectors) {
        const { nodes, layers } = sector;
        expect(layers).toBeGreaterThanOrEqual(SECTOR_MAP.layers[0]);
        expect(layers).toBeLessThanOrEqual(SECTOR_MAP.layers[1]);
        const layer = (k: number) => nodes.filter((n) => n.layer === k);
        expect(layer(0)).toHaveLength(1);
        expect(layer(layers - 1)).toHaveLength(1);
        for (let k = 1; k < layers - 1; k++) expect(layer(k).length).toBeGreaterThanOrEqual(1);
        // Somewhere in the sector there's a real choice.
        expect(Math.max(...Array.from({ length: layers }, (_, k) => layer(k).length))).toBeGreaterThan(1);
        // Every node is on some route, and every edge climbs one layer.
        const onRoute = new Set(routes(sector).flat().map((n) => n.id));
        expect(onRoute.size).toBe(nodes.length);
        for (const n of nodes) for (const id of n.next) expect(nodes[id]!.layer).toBe(n.layer + 1);
        // No two edges between the same layers cross.
        const edges = nodes.flatMap((n) => n.next.map((id) => ({ k: n.layer, a: n.col, b: nodes[id]!.col })));
        for (const e of edges) for (const f of edges) if (e.k === f.k) expect(e.a < f.a && e.b > f.b).toBe(false);
      }
    }
  });

  it('battles and depots: entry, a depot before the objective, never two depots in a row or too many battles', () => {
    for (const seed of SEEDS) {
      generateMap(seed).sectors.forEach((sector, s) => {
        const { nodes, layers } = sector;
        expect(nodes[0]!.kind).toBe(s === 0 ? 'battle' : 'depot');
        expect(nodes.at(-1)!.kind).toBe('battle');
        expect(nodes.at(-1)!.battle!.strength).toBe('objective');
        for (const n of nodes.filter((m) => m.layer === layers - 2)) expect(n.kind).toBe('depot');
        for (const r of routes(sector)) {
          let run = 0;
          let worst = 0;
          r.forEach((n, i) => {
            if (i > 0) expect(n.kind === 'depot' && r[i - 1]!.kind === 'depot').toBe(false);
            run = n.kind === 'battle' ? run + 1 : 0;
            worst = Math.max(worst, run);
          });
          expect(worst).toBeLessThanOrEqual(SECTOR_MAP.maxBattleRun);
        }
        for (const n of nodes) {
          expect(n.battle === null).toBe(n.kind !== 'battle');
          expect(n.event === null).toBe(n.kind !== 'event');
        }
      });
    }
  });

  it('battle intel: the opening is the run seed, clear and plain; threat climbs; objectives pay more', () => {
    for (const seed of SEEDS) {
      const map = generateMap(seed);
      const opening = map.sectors[0]!.nodes[0]!.battle!;
      expect(opening).toMatchObject({ seed, approach: null, doctrine: 'combined', strength: 'normal', threat: ENCOUNTER.baseThreat, salvage: RUN.extractionBonus, cache: false, fog: [] });
      const objectives = map.sectors.map((s) => s.nodes.at(-1)!.battle!);
      for (const o of objectives) {
        expect(o.doctrine).toBe('combined');
        expect(o.fog).not.toContain('strength');
        expect(o.salvage).toBe(RUN.extractionBonus + SECTOR_MAP.objective.salvage);
      }
      expect(objectives[2]!.threat).toBeGreaterThan(objectives[1]!.threat);
      expect(objectives[1]!.threat).toBeGreaterThan(objectives[0]!.threat);
      const battles = map.sectors.flatMap((s) => s.nodes.flatMap((n) => (n.battle ? [n.battle] : [])));
      expect(new Set(battles.map((b) => b.seed)).size).toBe(battles.length);
      for (const b of battles) expect(b.deep.every((f) => b.fog.includes(f))).toBe(true);
      // Battles side by side break in different ways.
      for (const s of map.sectors) {
        for (let k = 0; k < s.layers; k++) {
          const row = s.nodes.filter((n) => n.layer === k && n.battle).map((n) => n.battle!.approach);
          expect(new Set(row).size).toBe(row.length);
        }
      }
    }
  });

  it('a run of maps fields every doctrine, strong nodes, caches, and fog', () => {
    const battles = SEEDS.flatMap((seed) => generateMap(seed).sectors.flatMap((s) => s.nodes.flatMap((n) => (n.battle ? [n.battle] : []))));
    expect(new Set(battles.map((b) => b.doctrine)).size).toBe(5);
    expect(battles.some((b) => b.strength === 'strong')).toBe(true);
    expect(battles.some((b) => b.cache)).toBe(true);
    expect(battles.some((b) => b.fog.length > 0)).toBe(true);
    expect(battles.some((b) => b.deep.length > 0)).toBe(true);
  });
});

describe('getting around the map', () => {
  it('starts at sector 1’s entry, follows the routes, crosses into the next sector, and ends at the last objective', () => {
    const map = generateMap(9);
    expect(reachable(map, null)).toEqual([{ sector: 0, node: 0 }]);
    expect(reachable(map, { sector: 0, node: 0 })).toEqual(map.sectors[0]!.nodes[0]!.next.map((node) => ({ sector: 0, node })));
    const objective = (s: number) => ({ sector: s, node: map.sectors[s]!.nodes.length - 1 });
    expect(reachable(map, objective(0))).toEqual([{ sector: 1, node: 0 }]);
    expect(reachable(map, objective(2))).toEqual([]);
    expect(isFinalNode(map, objective(2))).toBe(true);
    expect(isFinalNode(map, objective(1))).toBe(false);
  });

  it('knows which nodes are still ahead on the routes from here', () => {
    const map = generateMap(9);
    const s0 = map.sectors[0]!;
    const objective = { sector: 0, node: s0.nodes.length - 1 };
    expect(onRouteFrom(map, null, objective)).toBe(true);
    for (const n of s0.nodes.filter((m) => m.layer === 1)) {
      expect(onRouteFrom(map, { sector: 0, node: n.id }, objective)).toBe(true);
      // Its siblings are off its route.
      for (const m of s0.nodes.filter((x) => x.layer === 1 && x.id !== n.id)) expect(onRouteFrom(map, { sector: 0, node: n.id }, { sector: 0, node: m.id })).toBe(false);
    }
    expect(onRouteFrom(map, objective, { sector: 1, node: 0 })).toBe(true);
  });

  it('fog: far fields hidden, deep fog one step away, Gen 2 sensors clear deep fog, Gen 3 all of it', () => {
    const intel = { fog: ['doctrine', 'reward'], deep: ['reward'] } as unknown as BattleIntel;
    expect(hiddenIntel(intel, false, 1)).toEqual(['doctrine', 'reward']);
    expect(hiddenIntel(intel, true, 1)).toEqual(['reward']);
    expect(hiddenIntel(intel, true, 2)).toEqual([]);
    expect(hiddenIntel(intel, false, 2)).toEqual(['doctrine', 'reward']);
    expect(hiddenIntel(intel, false, 3)).toEqual([]);
  });
});
