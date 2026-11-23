import type { EnemyId } from './enemies';
import type { MaterialId } from './terrain';

/**
 * Biomes (SPEC §4.6): each sets the tile palette (render side, keyed by id) and the mix of
 * features its battlefields are built from, including its own special terrain on top of the common
 * kinds. A battle's terrain is a biome × an approach (content/approaches.ts).
 */

export type BiomeId = 'temperate' | 'arctic' | 'industrial' | 'desert' | 'wasteland';

/**
 * How much of each feature a chunk (16 columns, ~7 s at cruise) gets. Ranges are counts drawn per
 * chunk; single numbers are expected counts (a fraction is a chance of one more), or for `rivers`,
 * `bridges`, and `rails` a chance.
 */
export interface FeatureMix {
  /** Forest blobs. */
  forests: readonly [number, number];
  /** Towns (blocks of buildings and streets). */
  towns: number;
  /** Rock outcrops and ridges. */
  rock: readonly [number, number];
  /** Chance a chunk has a river (never two chunks running). */
  rivers: number;
  /** Chance a river gets a bridge. */
  bridges: number;
  craterFields: number;
  minefields: number;
  /** A wall across the field with gates, bunkers behind it, tank traps in front. */
  fortLines: number;
  /** A belt of dragon's teeth across part of the field. */
  trapLines: number;
  /** Lone hedgerows (farm fields bring their own). */
  hedgerows: number;
  /** Crop fields, often boxed in by hedgerows. */
  farms: number;
  /** Frozen lakes: an ice sheet with a thin-ice heart. */
  lakes: number;
  snowdrifts: number;
  /** Factory halls, some inside a walled compound. */
  factories: number;
  /** Clusters of fuel tanks. */
  tankFarms: number;
  /** Chance a stretch of `TERRAIN_GEN.railStretch` chunks has a rail line. */
  rails: number;
  /** Dune seas: long sand ridges across the field. */
  dunes: number;
  /** Oilfields: derricks spread over a patch beside the way forward. */
  oilfields: number;
  /** Patches of burnt-out wrecks. */
  wrecks: number;
  /** Old blast sites: glassed ground ringed by craters. */
  blastSites: number;
  /**
   * Chance a stretch of `TERRAIN_GEN.road.stretch` chunks has a country road winding along it
   * (cosmetic going, SPEC §4.6 "Settlements"; surfaced per `ROADS` in content/structures.ts).
   */
  roads: number;
  /** Roads across the field. */
  crossRoads: number;
  /** Footbridges over a river (only rivers of open water get them). */
  footbridges: number;
}

export type MixKey = keyof FeatureMix;

export interface BiomeDef {
  id: BiomeId;
  name: string;
  mix: FeatureMix;
  /**
   * What rivers are made of: frozen in the arctic (solid ice banks over a thin-ice channel), dry in
   * the desert (wadis).
   */
  river: { shallows: MaterialId; channel: MaterialId };
  /**
   * An old battlefield: this share of the structures (buildings, factory halls, walls, bunkers)
   * already stand damaged, and this share lie in rubble, when the battle starts.
   */
  ruins?: { damaged: number; destroyed: number };
  /** The first sector (1-based) the sector map may put this biome in (default 1). */
  earliestSector?: number;
  /** Multipliers on the defenders' doctrine mix (missing = 1), like `ApproachDef.forces`. */
  forces?: Partial<Record<EnemyId, number>>;
}

export const BIOMES: Record<BiomeId, BiomeDef> = {
  temperate: {
    // The baseline: balanced, green, villages and farms boxed in by hedgerows.
    id: 'temperate',
    name: 'Temperate',
    mix: {
      forests: [1, 3],
      towns: 0.4,
      rock: [0, 2],
      rivers: 0.35,
      bridges: 0.3,
      craterFields: 0.1,
      minefields: 0.05,
      fortLines: 0.05,
      trapLines: 0.08,
      hedgerows: 0.5,
      farms: 0.6,
      lakes: 0,
      snowdrifts: 0,
      factories: 0,
      tankFarms: 0,
      rails: 0.1,
      dunes: 0,
      oilfields: 0,
      wrecks: 0,
      blastSites: 0,
      roads: 0.7,
      crossRoads: 0.3,
      footbridges: 0.8,
    },
    river: { shallows: 'shallows', channel: 'water' },
  },
  arctic: {
    // Weight and momentum matter even more: ice sheets slide, thin ice breaks under a heavy hull,
    // drifts hold it to cruise. Rivers are frozen over, so enemy armor crosses anywhere.
    id: 'arctic',
    name: 'Arctic',
    mix: {
      forests: [1, 2],
      towns: 0.25,
      rock: [1, 2],
      rivers: 0.35,
      bridges: 0.3,
      craterFields: 0.08,
      minefields: 0.06,
      fortLines: 0.05,
      trapLines: 0.08,
      hedgerows: 0,
      farms: 0,
      lakes: 0.45,
      snowdrifts: 1.6,
      factories: 0,
      tankFarms: 0.05,
      rails: 0.15,
      dunes: 0,
      oilfields: 0,
      wrecks: 0,
      blastSites: 0,
      roads: 0.5,
      crossRoads: 0.15,
      footbridges: 0,
    },
    river: { shallows: 'ice', channel: 'thinIce' },
    // Open snowfields: fewer places for troops to hide, more armor.
    forces: { infantry: 0.7, heavyTank: 1.2 },
  },
  industrial: {
    // Explosive terrain used as a weapon by either side: tank farms that chain, factory halls,
    // walled compounds, rail yards (armored trains in M4). Little cover but buildings.
    id: 'industrial',
    name: 'Industrial',
    mix: {
      forests: [0, 1],
      towns: 0.25,
      rock: [0, 1],
      rivers: 0.25,
      bridges: 0.6,
      craterFields: 0.25,
      minefields: 0.05,
      fortLines: 0.07,
      trapLines: 0.1,
      hedgerows: 0,
      farms: 0,
      lakes: 0,
      snowdrifts: 0,
      factories: 0.45,
      tankFarms: 0.35,
      rails: 0.5,
      dunes: 0,
      oilfields: 0,
      wrecks: 0.05,
      blastSites: 0,
      roads: 0.6,
      crossRoads: 0.35,
      footbridges: 0.8,
    },
    river: { shallows: 'shallows', channel: 'water' },
    // Troops garrison the halls.
    forces: { infantry: 1.3 },
  },
  desert: {
    // Long sightlines (missile launchers' ground; artillery's, once it exists): little cover but
    // sandstone mesas and adobe towns. Dune seas hold the Behemoth to cruise, dry wadis hide
    // infantry, and oilfields go up like tank farms. Rivers here are wadis (no water, no bridges).
    id: 'desert',
    name: 'Desert',
    mix: {
      forests: [0, 1],
      towns: 0.25,
      rock: [1, 2],
      rivers: 0.35,
      bridges: 0,
      craterFields: 0.1,
      minefields: 0.06,
      fortLines: 0.06,
      trapLines: 0.08,
      hedgerows: 0,
      farms: 0,
      lakes: 0,
      snowdrifts: 0,
      factories: 0,
      tankFarms: 0.1,
      rails: 0.15,
      dunes: 1.2,
      oilfields: 0.3,
      wrecks: 0.08,
      blastSites: 0,
      roads: 0.5,
      crossRoads: 0.12,
      footbridges: 0,
    },
    river: { shallows: 'wadi', channel: 'wadi' },
    // Fast, open ground: skirmishers range wide; few troops.
    forces: { lightTank: 1.3, infantry: 0.6 },
  },
  wasteland: {
    // An old battlefield, fought over until nothing stood: craters everywhere, towns and works in
    // ruins, the hulks of the last war (cover for infantry, scrap for the taking), glassed blast
    // sites, and the old minefields and trap belts still in the ground.
    id: 'wasteland',
    name: 'Blasted wasteland',
    // The harshest going: never the opening sector.
    earliestSector: 2,
    mix: {
      forests: [0, 1],
      towns: 0.35,
      rock: [0, 2],
      rivers: 0.2,
      bridges: 0.4,
      craterFields: 0.8,
      minefields: 0.08,
      fortLines: 0.08,
      trapLines: 0.1,
      hedgerows: 0,
      farms: 0,
      lakes: 0,
      snowdrifts: 0,
      factories: 0.15,
      tankFarms: 0,
      rails: 0.1,
      dunes: 0,
      oilfields: 0,
      wrecks: 0.45,
      blastSites: 0.3,
      roads: 0.6,
      crossRoads: 0.2,
      footbridges: 0.6,
    },
    river: { shallows: 'shallows', channel: 'water' },
    ruins: { damaged: 0.35, destroyed: 0.4 },
  },
};

export const BIOME_IDS = Object.keys(BIOMES) as BiomeId[];
