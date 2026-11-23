import type { WeaponId } from './weapons';

/**
 * Trailer modules (SPEC §5.5): what goes in the trailer's bays (the frame is the `trailer` add-on,
 * content/addons.ts). Each works through a system that already exists:
 * - a **pod** is a hardpoint on the trailer with its weapon built in (its integrity is the
 *   hardpoint's); the missile pod fires with the rack on Space, and so does the missile erector's
 *   pair of ballistic missiles;
 * - a **bunker** holds spare loads of ammo and refills any munitions weapon that runs dry;
 * - a **generator** adds power output and capacitor;
 * - a **drone bay** launches repair drones that patch the treads from a per-battle pool, and once
 *   a battle can revive an Immobilized Behemoth.
 * Everything a module carries feeds the trailer's cook-off when it blows.
 */

export type ModuleId = 'missilePod' | 'missileErector' | 'ammoBunker' | 'auxGenerator' | 'droneBay';

interface ModuleBase {
  id: ModuleId;
  name: string;
  /** Short name for tight spots (HUD readout). */
  short: string;
  /** One line on what it's for (depot). */
  blurb: string;
  /** Tons (towed, so the treads feel `MASS.towed` of it). */
  mass: number;
  hp: number;
  /** What it adds to the trailer's cook-off when full; scaled by what's left in it. */
  blast: { radius: number; damage: number };
}

export interface PodModule extends ModuleBase {
  kind: 'pod';
  /** The weapon built into it (not sold on its own). */
  weapon: WeaponId;
}

export interface BunkerModule extends ModuleBase {
  kind: 'bunker';
  /** Full loads it holds: each refills one empty munitions weapon completely. */
  loads: number;
  /** Seconds to pass a load forward to a weapon that ran dry. */
  reload: number;
}

export interface GeneratorModule extends ModuleBase {
  kind: 'generator';
  /** Power per second at full integrity (falls off with damage like the reactor's), and capacitor. */
  output: number;
  capacitor: number;
}

/**
 * Repair drones (SPEC §5.1 tread recovery): they fly from the bay to the most-damaged tread set and
 * patch it from a repair pool that refills between battles. Each drone out of the bay drains power
 * all the time; with the capacitor dry they hover without working. They can be shot down by rounds
 * that reach them and caught in blasts; lost drones stay lost until a depot replaces them. Once a
 * battle, if the Behemoth is Immobilized, every drone swarms the treads and revives it.
 */
export interface DroneBayModule extends ModuleBase {
  kind: 'drones';
  /** Drones it holds when full. */
  drones: number;
  /** Tread HP the bay can patch per battle. */
  pool: number;
  /** Tread HP per second each working drone patches. */
  repairRate: number;
  /** Drones launch once the most-damaged tread set is below this share of its integrity. */
  launchBelow: number;
  /** Power per second each drone out of the bay drains (SPEC §5.4). */
  power: number;
  /** Each drone's integrity, its flying speed (units/s), and its body (units) for hits. */
  droneHp: number;
  speed: number;
  radius: number;
  /** Revive: drone-seconds of work at the treads, then the chassis' own set comes back at `fraction`. */
  revive: { work: number; fraction: number };
}

export type ModuleDef = PodModule | BunkerModule | GeneratorModule | DroneBayModule;

/** What a module stocks and a depot refills: a bunker's loads, a drone bay's drones; null for others. */
export function moduleLoads(def: ModuleDef): number | null {
  return def.kind === 'bunker' ? def.loads : def.kind === 'drones' ? def.drones : null;
}

export const TRAILER_MODULES: Record<ModuleId, ModuleDef> = {
  missilePod: {
    id: 'missilePod',
    kind: 'pod',
    name: 'Missile pod',
    short: 'Msl pod',
    blurb: 'A second launcher: salvos of three with the rack.',
    mass: 25,
    hp: 35,
    weapon: 'podMissiles',
    blast: { radius: 24, damage: 50 },
  },
  // A towed launcher for the ballistic missile (SPEC §6): no main gun given up, but it goes if the trailer does.
  missileErector: {
    id: 'missileErector',
    kind: 'pod',
    name: 'Missile erector',
    short: 'Erector',
    blurb: 'Two heavy ballistic missiles, fired on Space.',
    mass: 45,
    hp: 40,
    weapon: 'erectorMissile',
    // Two big warheads: a trailer that blows with them aboard goes up hard.
    blast: { radius: 50, damage: 160 },
  },
  ammoBunker: {
    id: 'ammoBunker',
    kind: 'bunker',
    name: 'Ammo bunker',
    short: 'Bunker',
    blurb: 'Two spare loads: refills a weapon that runs dry.',
    mass: 30,
    hp: 40,
    loads: 2,
    reload: 4,
    blast: { radius: 40, damage: 100 },
  },
  auxGenerator: {
    id: 'auxGenerator',
    kind: 'generator',
    name: 'Auxiliary generator',
    short: 'Aux gen',
    blurb: 'More power for energy weapons and point defense.',
    mass: 25,
    hp: 35,
    output: 5,
    capacitor: 30,
    blast: { radius: 12, damage: 30 },
  },
  droneBay: {
    id: 'droneBay',
    kind: 'drones',
    name: 'Repair drone bay',
    short: 'Drones',
    blurb: 'Drones patch the treads, and revive you once a battle.',
    mass: 25,
    hp: 35,
    drones: 2,
    pool: 45,
    repairRate: 1.5,
    launchBelow: 0.9,
    power: 1,
    droneHp: 10,
    speed: 110,
    radius: 5,
    revive: { work: 12, fraction: 0.3 },
    blast: { radius: 14, damage: 30 },
  },
};
