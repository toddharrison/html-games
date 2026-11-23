import type { BiomeId } from './biomes';

/**
 * What the buildings, trees, and roads on the battlefield look like (SPEC §4.6 "Settlements"). This
 * is cosmetic: a tile's material decides how it plays, and its `TileArt` (set when the terrain is
 * generated, from the same seeded noise) decides what it's drawn as. A structure can cover several
 * tiles (a 4×4 tower); each tile still takes damage and comes down on its own.
 */

export type StructureId =
  // Houses and blocks (most biomes)
  | 'house'
  | 'flat'
  | 'terrace'
  | 'block'
  | 'midrise'
  | 'tower'
  | 'capitol'
  | 'church'
  // Farmsteads (temperate)
  | 'farmhouse'
  | 'barn'
  | 'silo'
  // Works (industrial)
  | 'warehouse'
  | 'smokestack'
  | 'coolingTower'
  // Arctic
  | 'cabin'
  | 'quonset'
  | 'radome'
  // Desert
  | 'adobe'
  | 'courtyard'
  | 'domed'
  | 'waterTower';

export interface StructureDef {
  id: StructureId;
  /** Footprint in tiles: columns along the direction of travel, rows across it. */
  cols: number;
  rows: number;
  /** How many looks it comes in (render/tileArt.ts draws each). */
  styles: number;
  /** The single-tile structure its pieces turn into when something cuts the footprint (a river). */
  fallback: StructureId;
}

const def = (id: StructureId, cols: number, rows: number, styles: number, fallback: StructureId): StructureDef => ({ id, cols, rows, styles, fallback });

export const STRUCTURES: Record<StructureId, StructureDef> = {
  house: def('house', 1, 1, 4, 'house'),
  flat: def('flat', 1, 1, 3, 'flat'),
  terrace: def('terrace', 1, 2, 2, 'house'),
  block: def('block', 2, 2, 3, 'flat'),
  midrise: def('midrise', 3, 3, 2, 'flat'),
  tower: def('tower', 4, 4, 3, 'flat'),
  capitol: def('capitol', 4, 4, 1, 'flat'),
  church: def('church', 2, 1, 1, 'house'),
  farmhouse: def('farmhouse', 1, 1, 2, 'farmhouse'),
  barn: def('barn', 1, 2, 2, 'farmhouse'),
  silo: def('silo', 1, 1, 1, 'silo'),
  warehouse: def('warehouse', 2, 3, 2, 'flat'),
  smokestack: def('smokestack', 1, 1, 1, 'smokestack'),
  coolingTower: def('coolingTower', 3, 3, 1, 'flat'),
  cabin: def('cabin', 1, 1, 2, 'cabin'),
  quonset: def('quonset', 2, 1, 2, 'cabin'),
  radome: def('radome', 2, 2, 1, 'flat'),
  adobe: def('adobe', 1, 1, 3, 'adobe'),
  courtyard: def('courtyard', 2, 2, 2, 'adobe'),
  domed: def('domed', 2, 2, 1, 'adobe'),
  waterTower: def('waterTower', 1, 1, 1, 'waterTower'),
};

export const STRUCTURE_IDS = Object.keys(STRUCTURES) as StructureId[];

/** Tree species (each a raised overlay with its own shape, in the biome's colors). */
export type TreeId = 'broadleaf' | 'conifer' | 'birch' | 'palm' | 'scrub' | 'dead';
export const TREE_IDS: readonly TreeId[] = ['broadleaf', 'conifer', 'birch', 'palm', 'scrub', 'dead'];
/** Species thin enough that the ground shows between them (no dark forest floor under them). */
export const SPARSE_TREES: ReadonlySet<TreeId> = new Set(['palm', 'scrub', 'dead']);

/**
 * How a road tile is drawn: `street` (town paving with curbs), `avenue` (a city's main road, lane
 * markings), `plaza` (a paved square), `lot` (a car park), and the country roads, `track` (a dirt
 * lane) and `paved` (an asphalt road), which run between fields.
 */
export type RoadStyle = 'street' | 'avenue' | 'plaza' | 'lot' | 'track' | 'paved';
export const ROAD_STYLES: readonly RoadStyle[] = ['street', 'avenue', 'plaza', 'lot', 'track', 'paved'];

/** A tile's look (cosmetic). Structures and halls know where in their footprint the tile sits. */
export type TileArt =
  | {
      kind: 'structure';
      id: StructureId;
      style: number;
      /** Footprint (columns along travel, rows across) and this tile's place in it. */
      cols: number;
      rows: number;
      dc: number;
      dr: number;
      /** Which placed structure it belongs to (the generator checks each footprint is whole). */
      uid: number;
    }
  | { kind: 'hall'; style: number; cols: number; rows: number; dc: number; dr: number }
  | { kind: 'tree'; species: TreeId }
  | { kind: 'road'; style: RoadStyle };

/** Factory hall roofs (the industrial biome's `factory` feature): sawtooth, barrel vault, flat. */
export const HALL_STYLES = 3;

/** What an empty lot in a settlement becomes: open ground, a garden (crops), a square, a park, a car park. */
export type OpenLot = 'yard' | 'garden' | 'plaza' | 'park' | 'lot';
export type Lots = Partial<Record<StructureId | OpenLot, number>>;

/** Settlement sizes: a small town is a village, the urban approach's are cities. */
export type Setting = 'village' | 'town' | 'city';

export interface SettlementDef {
  /** Weights for each lot (a structure only goes where its footprint fits the block). */
  lots: Lots;
  /** Landmarks: the chance a settlement has one, placed first in the biggest block it fits. */
  landmarks?: Partial<Record<StructureId, number>>;
}

/**
 * What each biome builds. Lot weights are shares of the built-up area (a 2×2 block at weight 1
 * covers as much ground as four houses at weight 1). Hedgerows and crops are temperate terrain, so
 * gardens are too.
 */
export const SETTLEMENTS: Record<BiomeId, Record<Setting, SettlementDef>> = {
  temperate: {
    village: { lots: { house: 6, farmhouse: 1, terrace: 1, barn: 0.6, yard: 3, garden: 2, park: 0.8 }, landmarks: { church: 0.3 } },
    town: { lots: { house: 6, flat: 1, terrace: 2, block: 1.5, yard: 1, plaza: 0.5, garden: 0.5, park: 0.6 }, landmarks: { church: 0.5 } },
    city: { lots: { tower: 4, midrise: 3, block: 3, flat: 0.4, terrace: 1, plaza: 0.8, park: 0.6, lot: 0.8 }, landmarks: { capitol: 0.2 } },
  },
  arctic: {
    village: { lots: { cabin: 6, quonset: 2, house: 1, yard: 3, park: 0.6 } },
    town: { lots: { cabin: 3, quonset: 3, flat: 2, block: 1, yard: 1.5, lot: 0.5 }, landmarks: { radome: 0.4 } },
    city: { lots: { block: 3, midrise: 2, flat: 0.5, quonset: 1, tower: 2, plaza: 0.6, lot: 0.8 }, landmarks: { radome: 0.5, capitol: 0.15 } },
  },
  industrial: {
    village: { lots: { house: 3, terrace: 3, flat: 2, warehouse: 1, yard: 1.5, park: 0.4 } },
    town: { lots: { terrace: 3, flat: 3, block: 2, warehouse: 2, smokestack: 0.4, lot: 1, yard: 0.5 }, landmarks: { coolingTower: 0.3 } },
    city: { lots: { tower: 3, midrise: 3, block: 3, warehouse: 2, smokestack: 0.3, plaza: 0.5, lot: 1 }, landmarks: { coolingTower: 0.4, capitol: 0.15 } },
  },
  desert: {
    village: { lots: { adobe: 6, courtyard: 2, waterTower: 0.6, yard: 3, park: 0.6 }, landmarks: { domed: 0.25 } },
    town: { lots: { adobe: 4, courtyard: 3, flat: 2, waterTower: 0.6, plaza: 1, yard: 1 }, landmarks: { domed: 0.5 } },
    city: { lots: { courtyard: 2, midrise: 2, tower: 2, block: 2, flat: 0.4, plaza: 1, park: 0.5, lot: 0.6 }, landmarks: { domed: 0.4, capitol: 0.15 } },
  },
  wasteland: {
    village: { lots: { house: 4, flat: 3, terrace: 2, yard: 3, park: 0.4 } },
    town: { lots: { flat: 3, terrace: 3, block: 3, house: 2, yard: 1.5, plaza: 0.5, lot: 0.5 }, landmarks: { church: 0.25 } },
    city: { lots: { tower: 4, midrise: 3, block: 3, flat: 0.5, plaza: 0.6, lot: 0.8, park: 0.3 }, landmarks: { capitol: 0.15 } },
  },
};

/** Tree species weights per biome (a wood is mostly one species, with others mixed in). */
export const TREES: Record<BiomeId, Partial<Record<TreeId, number>>> = {
  temperate: { broadleaf: 6, conifer: 3, birch: 2 },
  arctic: { conifer: 8, birch: 2, dead: 1 },
  industrial: { broadleaf: 3, birch: 2, dead: 3, scrub: 2 },
  desert: { palm: 4, scrub: 6 },
  wasteland: { dead: 7, scrub: 3 },
};

/**
 * Country roads per biome: how they're surfaced, how wide (rows), and the share of their tiles with
 * a car left on them (the wasteland's roads are lined with the abandoned).
 */
export const ROADS: Record<BiomeId, { style: RoadStyle; width: 1 | 2; cars: number }> = {
  temperate: { style: 'track', width: 1, cars: 0.01 },
  arctic: { style: 'track', width: 1, cars: 0.01 },
  industrial: { style: 'paved', width: 2, cars: 0.03 },
  desert: { style: 'track', width: 1, cars: 0.02 },
  wasteland: { style: 'paved', width: 2, cars: 0.12 },
};

/** The structures (and their styles) a biome can build, for drawing only what it needs. */
export function structuresOf(biome: BiomeId): StructureId[] {
  const out = new Set<StructureId>(['farmhouse', 'barn', 'silo']);
  for (const s of Object.values(SETTLEMENTS[biome])) {
    for (const k of [...Object.keys(s.lots), ...Object.keys(s.landmarks ?? {})]) {
      if (k in STRUCTURES) {
        out.add(k as StructureId);
        out.add(STRUCTURES[k as StructureId].fallback);
      }
    }
  }
  return [...out];
}

/** Picks a key from weights with a uniform [0,1) value. */
export function weighted<K extends string>(weights: Partial<Record<K, number>>, u: number): K {
  const entries = Object.entries(weights) as [K, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let x = u * total;
  for (const [k, w] of entries) {
    x -= w;
    if (x < 0) return k;
  }
  return entries[entries.length - 1]![0];
}
