import type { AddonId } from './addons';
import type { CoreComponent } from './chassis';
import type { ModuleId } from './trailer';
import type { Gen, TrackId, UpgradeGen } from './upgrades';
import type { WeaponId } from './weapons';

/**
 * How far into a run goods turn up (user's call, Nov 2026: "generations of things offered should
 * increase gradually as you move to later sectors"). Everything a depot sells has a generation:
 * a core component's grade is its own, and weapons, add-ons, and modules are Gen 1 unless they say
 * otherwise. A depot multiplies each item's `weight` by its sector's odds for that generation
 * (`DEPOT.genOdds`), so the better kit is rare or absent early and common late.
 */
export interface DepotWeapon {
  price: number;
  /** Relative odds of turning up in a depot's stock. */
  weight: number;
  /** Its generation, for the sector's odds; missing = 1. */
  gen?: Gen;
  /** Munitions: salvage per round when rearming. */
  roundPrice?: number;
}

/** What depots sell. Installed weapons come with a full load of ammo. */
export const DEPOT_WEAPONS: Partial<Record<WeaponId, DepotWeapon>> = {
  heavyCannon: { price: 160, weight: 2 },
  titanCannon: { price: 250, weight: 2, gen: 2 },
  siegeHowitzer: { price: 200, weight: 2, roundPrice: 4 },
  autocannon: { price: 100, weight: 3 },
  rotaryGun: { price: 110, weight: 3 },
  flakCannon: { price: 120, weight: 3 },
  missileRack: { price: 150, weight: 2, roundPrice: 3 },
  bunkerBuster: { price: 150, weight: 2, roundPrice: 6 },
  mortar: { price: 130, weight: 3, roundPrice: 2 },
  apGuns: { price: 60, weight: 3 },
  pdLaser: { price: 100, weight: 2 },
  pdGuns: { price: 70, weight: 3 },
  pulseLaser: { price: 90, weight: 2 },
  beamLaser: { price: 130, weight: 2 },
  heavyLaser: { price: 190, weight: 1.5, gen: 2 },
  plasmaThrower: { price: 150, weight: 2 },
  swarmPod: { price: 150, weight: 2, roundPrice: 4 },
  empEmitter: { price: 140, weight: 1.5 },
  // Fuel is counted per lick of flame (250 a tank): a full tank is 50 on top of the rearm's base.
  flamethrower: { price: 110, weight: 2, roundPrice: 0.2 },
  railgun: { price: 210, weight: 1.5, gen: 2 },
  ballisticMissile: { price: 210, weight: 1.5, gen: 2, roundPrice: 12 },
  arcProjector: { price: 190, weight: 1.5, gen: 2 },
  coilgun: { price: 140, weight: 2 },
  teslaCoil: { price: 90, weight: 2 },
  rocketArtillery: { price: 150, weight: 2, roundPrice: 5 },
  thermobaric: { price: 140, weight: 2, roundPrice: 4 },
};

export interface DepotAddon {
  price: number;
  /** Relative odds of turning up in a depot's stock. */
  weight: number;
  /** Its generation, for the sector's odds; missing = 1. */
  gen?: Gen;
}

/** Add-ons depots sell (SPEC §5.5). Each arrives in working order; a mount (sponson, dorsal ring) arrives empty. */
export const DEPOT_ADDONS: Partial<Record<AddonId, DepotAddon>> = {
  ramPlow: { price: 120, weight: 2 },
  outerTreads: { price: 200, weight: 2 },
  sponsonL: { price: 120, weight: 1.5 },
  sponsonR: { price: 120, weight: 1.5 },
  dorsalRing: { price: 180, weight: 1.5 },
  coax: { price: 60, weight: 1.5 },
  twinTurret: { price: 220, weight: 1.5, gen: 2 },
  blowoutPanels: { price: 100, weight: 1.5 },
  // A bigger trailer bought over a smaller one takes its modules and credits the old frame's resale.
  trailer: { price: 140, weight: 2 },
  heavyTrailer: { price: 220, weight: 2, gen: 2 },
  superTrailer: { price: 300, weight: 2, gen: 3 },
};

export interface DepotModule {
  price: number;
  /** Relative odds of turning up in a depot's stock. */
  weight: number;
  /** Its generation, for the sector's odds; missing = 1. */
  gen?: Gen;
  /** Rearm price: per round (pods), or per load (bunkers) or drone (drone bays), on top of `DEPOT.rearmBase`. */
  roundPrice?: number;
  loadPrice?: number;
}

/** Trailer modules depots sell. Each arrives in working order, full. */
export const DEPOT_MODULES: Record<ModuleId, DepotModule> = {
  missilePod: { price: 130, weight: 2, roundPrice: 3 },
  missileErector: { price: 170, weight: 1.5, gen: 2, roundPrice: 15 },
  ammoBunker: { price: 110, weight: 2, loadPrice: 30 },
  auxGenerator: { price: 90, weight: 1.5 },
  droneBay: { price: 150, weight: 1.5, loadPrice: 25 },
};

export interface DepotGrade {
  price: number;
  /** Relative odds of turning up in a depot's stock (times the sector's odds for its generation). */
  weight: number;
}

/**
 * Higher-grade core components depots sell (SPEC §5.6). Each arrives whole and replaces the one
 * fitted. How early each generation shows is the sector's odds (`DEPOT.genOdds`): no Gen 3 in
 * sector 1.
 */
export const DEPOT_GRADES: Record<CoreComponent, Record<UpgradeGen, DepotGrade>> = {
  reactor: { 2: { price: 170, weight: 2 }, 3: { price: 290, weight: 2 } },
  sensors: { 2: { price: 90, weight: 2 }, 3: { price: 160, weight: 2 } },
  fireControl: { 2: { price: 120, weight: 2 }, 3: { price: 210, weight: 2 } },
  magazine: { 2: { price: 80, weight: 1.5 }, 3: { price: 140, weight: 1.5 } },
  treads: { 2: { price: 150, weight: 2 }, 3: { price: 250, weight: 2 } },
};

/** Salvage for each level of a mod track (level 1 first). Always on offer, an action a level. */
export const DEPOT_TRACKS: Record<TrackId, readonly number[]> = {
  harden: [40, 60, 90],
  traverse: [35, 55, 80],
  plate: [30, 45, 70],
  capacitor: [45, 70, 100],
  load: [40, 60, 90],
  // One level, and dear: most of a battle's pay for a third weapon on Auto.
  channel: [240],
  // One level. Nearly the plow's own price (120) again: rock stops being a wall. The Auto link stays
  // the dearest upgrade by more than double.
  breaker: [110],
};
