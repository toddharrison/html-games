import type { MixKey } from './biomes';
import type { EnemyId } from './enemies';

/**
 * Approaches (SPEC §3.1): where a battle breaks in. Each scales its biome's feature mix and may add
 * a set piece, so the same biome plays differently by route. Numbers are provisional.
 */

export type ApproachId = 'plain' | 'forest' | 'urban' | 'river' | 'pass';

export interface ApproachDef {
  id: ApproachId;
  name: string;
  /** Multipliers on the biome's mix (missing = 1). Chances are capped at 1. */
  scale: Partial<Record<MixKey, number>>;
  /** Multiplier on town and factory sizes (default 1). */
  townSize?: number;
  /** Multiplier on forest blob radius (default 1). */
  forestSize?: number;
  /**
   * Mountain pass: cliffs (rock) along both field edges, each this many tiles deep (wandering
   * between the two), so the field narrows to a pass with choke points.
   */
  cliffs?: readonly [number, number];
  /** Rows the rock-free lane may wander from mid-field (default `TERRAIN_GEN.laneAmplitude`). */
  laneAmplitude?: number;
  /** A main avenue this many tiles wide runs through towns along the lane (no buildings on it). */
  avenue?: number;
  /**
   * Multipliers on the defenders' doctrine mix (missing = 1): who fights well on this ground
   * (SPEC §7). Only shades the odds, so the map's doctrine intel stays true.
   */
  forces?: Partial<Record<EnemyId, number>>;
}

export const APPROACHES: Record<ApproachId, ApproachDef> = {
  plain: {
    // Fast and open: little cover, long sightlines (missile launchers' ground).
    id: 'plain',
    name: 'Open plain',
    scale: { forests: 0.35, towns: 0.3, rock: 0.4, hedgerows: 0.5, farms: 1.3, factories: 0.4, tankFarms: 0.6, craterFields: 0.6, fortLines: 0.5, wrecks: 0.6 },
    forces: { infantry: 0.5, missileLauncher: 1.4, heavyTank: 1.2 },
  },
  forest: {
    // Thick woods: infantry ambushes everywhere; flamethrowers and mortars shine.
    id: 'forest',
    name: 'Forest line',
    scale: { forests: 2.2, towns: 0.5, farms: 0.4, factories: 0.5, tankFarms: 0.5, snowdrifts: 0.6, lakes: 0.6, dunes: 0.6, oilfields: 0.6 },
    forestSize: 1.3,
    forces: { infantry: 1.6, missileLauncher: 0.7 },
  },
  urban: {
    // Dense blocks: constant demolition, garrisoned infantry, ram plating pays. A main avenue runs
    // through each town along the way forward: the quick road (watched from every window) or the
    // blocks either side of it.
    id: 'urban',
    name: 'Urban district',
    scale: { towns: 2.2, factories: 1.5, forests: 0.4, farms: 0.2, hedgerows: 0.3, craterFields: 1.6, lakes: 0.3, snowdrifts: 0.5, dunes: 0.4, oilfields: 0.5, wrecks: 1.3, blastSites: 1.3 },
    townSize: 1.4,
    avenue: 3,
    forces: { infantry: 1.6, lightTank: 0.8 },
  },
  river: {
    // Rivers every other chunk or so, nearly all bridged: a bridge fight.
    id: 'river',
    name: 'River crossing',
    scale: { rivers: 2.4, bridges: 3, fortLines: 0.6 },
    // Hovercraft own the water.
    forces: { hovercraft: 2.5 },
  },
  pass: {
    // Cliffs on both flanks squeeze the field to a pass: choke points, ambush from the heights.
    id: 'pass',
    name: 'Mountain pass',
    scale: { rock: 1.3, towns: 0.5, factories: 0.5, tankFarms: 0.5, farms: 0.3, lakes: 0.5, rivers: 0.6, fortLines: 1.5, oilfields: 0.5 },
    cliffs: [1.5, 5],
    laneAmplitude: 2,
    // Little room to circle; launchers on the heights.
    forces: { lightTank: 0.7, missileLauncher: 1.4 },
  },
};

export const APPROACH_IDS = Object.keys(APPROACHES) as ApproachId[];
