/**
 * Obstacle classes (SPEC §4.2): what driving into something costs the Behemoth.
 * Nothing stops it outright: everything up to heavy is crushed or plowed through, and immovable
 * terrain (rock) deflects it into a glancing slide, unless a plow with the Breaker upgrade breaks
 * it (`rock`). Classes differ in speed dip and damage.
 */

export type ObstacleClass = 'none' | 'soft' | 'trivial' | 'light' | 'medium' | 'heavy' | 'trap' | 'immovable' | 'rock';

export interface ObstacleClassDef {
  /** Fraction of current speed lost on impact (before ram gear). */
  speedDip: number;
  /** Tread damage at cruise-speed impact (scales with impact speed). */
  treadDamage: number;
  /** Front-armor damage at cruise-speed impact (scales with impact speed). */
  armorDamage: number;
  /** Screen-shake hint for the renderer, 0..1. */
  shake: number;
}

export const OBSTACLE_CLASSES: Record<ObstacleClass, ObstacleClassDef> = {
  none: { speedDip: 0, treadDamage: 0, armorDamage: 0, shake: 0 },
  // Flattened as the treads pass (crops, rails), with no cost at all.
  soft: { speedDip: 0, treadDamage: 0, armorDamage: 0, shake: 0 },
  trivial: { speedDip: 0, treadDamage: 0.05, armorDamage: 0, shake: 0 },
  light: { speedDip: 0.04, treadDamage: 0.6, armorDamage: 0.8, shake: 0.15 },
  medium: { speedDip: 0.2, treadDamage: 3, armorDamage: 5, shake: 0.45 },
  heavy: { speedDip: 0.4, treadDamage: 8, armorDamage: 14, shake: 0.8 },
  // Tank traps (dragon's teeth): small and low, so they barely dent the plate but chew the treads.
  trap: { speedDip: 0.12, treadDamage: 4, armorDamage: 0.5, shake: 0.35 },
  // Head-on contact with rock; the slide that follows scrapes on (see DEFLECT).
  immovable: { speedDip: 0.3, treadDamage: 1.5, armorDamage: 5, shake: 0.5 },
  // A rock tile broken by a plow with the Breaker upgrade (no tile has this class itself: rock is
  // `immovable` to everything else). It slows the hull like a house, a tile at a time, and is
  // harder on the blade: between a house and a bunker.
  rock: { speedDip: 0.2, treadDamage: 3, armorDamage: 8, shake: 0.7 },
};
