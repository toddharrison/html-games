import type { ArmorArc, CoreComponent } from './chassis';

/**
 * Component upgrades (SPEC §5.6). Two kinds:
 * - **Grades:** every core component comes in Gen 1 (what the chassis is built with), Gen 2, and
 *   Gen 3. A higher grade replaces the component outright: better, and heavier. Its stats are
 *   multipliers on the chassis' own Gen 1 numbers, so one table serves every chassis class.
 * - **Mods:** leveled tracks bought on one part (a hardpoint mount, an armor zone, a core
 *   component). Each level is one depot action. Mods on hull fixtures (mounts, armor) stay when a
 *   weapon is swapped; mods on a core component go with it when it's replaced.
 */

export type Gen = 1 | 2 | 3;
/** The grades a depot can sell (Gen 1 is what the chassis comes with). */
export type UpgradeGen = 2 | 3;

export interface GradeDef {
  /** Tons over the Gen 1 part (Gen 1 counts as part of the chassis). */
  mass: number;
  /** Integrity multiplier. */
  hp: number;
  blurb: string;
  /** Reactor: output, capacitor, and detonation (radius and damage) multipliers. */
  output?: number;
  capacitor?: number;
  blast?: number;
  /** Sensors: reveal radius and auto-weapon reach multipliers. */
  reveal?: number;
  reach?: number;
  /** Fire control: extra channels, and the auto-fire spread multiplier. */
  channels?: number;
  spread?: number;
  /** Magazine: cook-off damage multiplier. */
  cookOff?: number;
  /** Treads: mass capacity multiplier. */
  capacity?: number;
}

export const GRADES: Record<CoreComponent, Record<UpgradeGen, GradeDef>> = {
  reactor: {
    2: { mass: 15, hp: 1.15, output: 1.3, capacitor: 1.25, blast: 1.15, blurb: 'Hotter core: more power, a bigger blast.' },
    3: { mass: 30, hp: 1.3, output: 1.6, capacitor: 1.5, blast: 1.3, blurb: 'A star in a box. Feeds any energy build.' },
  },
  sensors: {
    2: { mass: 3, hp: 1.25, reveal: 1.3, reach: 1.1, blurb: 'Sees into cover sooner; autos reach farther.' },
    3: { mass: 6, hp: 1.5, reveal: 1.6, reach: 1.2, blurb: 'Nothing hides for long.' },
  },
  fireControl: {
    2: { mass: 4, hp: 1.25, channels: 1, spread: 0.8, blurb: 'One more Auto channel, tighter auto fire.' },
    3: { mass: 8, hp: 1.5, channels: 2, spread: 0.6, blurb: 'Two more Auto channels, much tighter fire.' },
  },
  magazine: {
    2: { mass: 8, hp: 1.5, cookOff: 0.7, blurb: 'Armored racks: tougher, and a softer cook-off.' },
    3: { mass: 16, hp: 2, cookOff: 0.45, blurb: 'Compartmented: most of a cook-off is contained.' },
  },
  treads: {
    2: { mass: 10, hp: 1.2, capacity: 1.15, blurb: 'Wider links: tougher, and carry more.' },
    3: { mass: 20, hp: 1.4, capacity: 1.3, blurb: 'Heavy running gear for a heavy machine.' },
  },
};

/** Mod tracks. */
export type TrackId = 'harden' | 'traverse' | 'plate' | 'capacitor';

/**
 * The kinds of part a mod can go on: the reactor, any other core component, a turret ring's main
 * slot (the ring itself), any other slot on a ring (a coax: no traverse of its own), a hull mount
 * that turns on its own, and an armor zone. Trailer pods and add-ons' own parts take none (yet).
 */
export type PartKind = 'reactor' | 'core' | 'ring' | 'coax' | 'mount' | 'armor';

export interface TrackDef {
  name: string;
  /** What it can go on. */
  on: readonly PartKind[];
  /** What one level does, for the depot. */
  blurb: string;
  /** Added to the stat's multiplier per level (+20% = 0.2). */
  per: number;
  /** Tons per level. */
  mass: number;
}

/** In the order the depot lists them. */
export const TRACKS: Record<TrackId, TrackDef> = {
  harden: { name: 'Harden', on: ['reactor', 'core', 'ring', 'coax', 'mount'], blurb: '+20% integrity', per: 0.2, mass: 2 },
  traverse: { name: 'Traverse', on: ['ring', 'mount'], blurb: '+25% traverse', per: 0.25, mass: 1 },
  plate: { name: 'Plate', on: ['armor'], blurb: '+20% armor', per: 0.2, mass: 4 },
  capacitor: { name: 'Cap bank', on: ['reactor'], blurb: '+20% capacitor', per: 0.2, mass: 3 },
};

/** Grades fitted per core component (missing = Gen 1). */
export type Grades = Partial<Record<CoreComponent, UpgradeGen>>;
/** Mod levels by part id (a core component, a hardpoint slot, or `armorPart(arc)`), then track. */
export type Mods = Record<string, Partial<Record<TrackId, number>>>;

export interface Upgrades {
  grades: Grades;
  mods: Mods;
}

export const NO_UPGRADES: Upgrades = { grades: {}, mods: {} };

/** The part id an armor zone's mods are filed under. */
export function armorPart(arc: ArmorArc): string {
  return `armor.${arc}`;
}

/** A core component's display name with its grade, e.g. "Gen 2 reactor". */
export function gradeName(gen: Gen, name: string): string {
  return `Gen ${gen} ${name.toLowerCase()}`;
}
