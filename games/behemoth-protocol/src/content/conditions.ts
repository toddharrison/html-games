import type { BiomeId } from './biomes';

/**
 * Conditions (SPEC §4.6): a per-battle modifier, drawn per battle node and shown in its intel.
 * M3 has two. Both work through **sight**: past the sight radius (scaled by the sensors) a unit
 * can't be seen, auto-targeted, or locked on to, unless it gives itself away (firing, lining up a
 * shot, being hit), much as concealment hides infantry in the trees.
 * - **Night:** short sight all battle, for both sides. Muzzle flashes give shooters away, the
 *   Behemoth's too: once it fires, every enemy in range can see what to shoot at for a moment; while
 *   it holds its fire, only the units close enough to see it can open up.
 * - **Storm** (a sandstorm, blizzard, ash storm, or rainstorm, by biome): squalls blow through every
 *   so often and close the sight right in for both sides, so a squall is a short-range brawl; fire
 *   drifts in the wind, and hovercraft slow.
 * - **Thunderstorm** (a heavy rainstorm, or a dirty thunderstorm in ash): a storm with lightning in
 *   its squalls (`sim/lightning.ts`). Never drawn on its own: a storm in a biome that has them turns
 *   into one by chance (`CONDITION.lightning.chance`).
 * Numbers are in `CONDITION` (tuning.ts).
 */

export type ConditionId = 'night' | 'storm' | 'thunderstorm';
/** The conditions a battle node draws between (by `weight`); a thunderstorm comes out of a storm. */
export const CONDITION_IDS: readonly ConditionId[] = ['night', 'storm'];

export interface ConditionDef {
  id: ConditionId;
  /** The map intel's and HUD's name. A storm takes its biome's name for it (`conditionName`). */
  name: string;
  /** One line for the map intel. */
  intel: string;
  /** The battle's opening banner (two short lines). */
  banner: string;
  /** Relative odds of this condition in each biome, when a battle has one. */
  weight: Record<BiomeId, number>;
}

export const CONDITIONS: Record<ConditionId, ConditionDef> = {
  night: {
    id: 'night',
    name: 'Night',
    intel: 'Short sight both ways; firing gives you away',
    banner: 'Night\nHold fire to stay dark',
    weight: { temperate: 1, arctic: 1, industrial: 1.2, desert: 1, wasteland: 1 },
  },
  storm: {
    id: 'storm',
    name: 'Storm',
    intel: 'Squalls blind both sides at range',
    banner: 'Squalls closing in',
    weight: { temperate: 0.7, arctic: 1.4, industrial: 0.7, desert: 1.5, wasteland: 1 },
  },
  thunderstorm: {
    id: 'thunderstorm',
    name: 'Thunderstorm',
    intel: 'Squalls blind both sides; lightning strikes in them',
    banner: 'Lightning in the squalls',
    // Never drawn directly (not in `CONDITION_IDS`): a storm turns into one.
    weight: { temperate: 0, arctic: 0, industrial: 0, desert: 0, wasteland: 0 },
  },
};

/** Whether a condition blows squalls through (a storm, with or without lightning). */
export function stormy(id: ConditionId): boolean {
  return id === 'storm' || id === 'thunderstorm';
}

/** What a storm is called in each biome. */
export const STORM_NAMES: Record<BiomeId, string> = {
  temperate: 'Rainstorm',
  arctic: 'Blizzard',
  industrial: 'Rainstorm',
  desert: 'Sandstorm',
  wasteland: 'Ash storm',
};

/**
 * What a thunderstorm is called in each biome. Only temperate, industrial, and the wasteland draw
 * them; the others name one forced by `?condition=thunderstorm` or the dev console.
 */
export const THUNDER_NAMES: Record<BiomeId, string> = {
  temperate: 'Thunderstorm',
  arctic: 'Thundersnow',
  industrial: 'Thunderstorm',
  desert: 'Dry thunderstorm',
  wasteland: 'Dirty thunderstorm',
};

/** A condition's name as the map and HUD show it: a storm by its biome's kind of storm. */
export function conditionName(id: ConditionId, biome: BiomeId): string {
  return id === 'storm' ? STORM_NAMES[biome] : id === 'thunderstorm' ? THUNDER_NAMES[biome] : CONDITIONS[id].name;
}
