import type { AddonId } from './addons';
import type { CoreComponent } from './chassis';
import type { ModuleId } from './trailer';
import type { TrackId, UpgradeGen } from './upgrades';
import type { WeaponId } from './weapons';

export interface DepotWeapon {
  price: number;
  /** Relative odds of turning up in a depot's stock. */
  weight: number;
  /** Munitions: salvage per round when rearming. */
  roundPrice?: number;
}

/** What depots sell. Installed weapons come with a full load of ammo. */
export const DEPOT_WEAPONS: Partial<Record<WeaponId, DepotWeapon>> = {
  heavyCannon: { price: 160, weight: 2 },
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
  heavyLaser: { price: 190, weight: 1.5 },
  plasmaThrower: { price: 150, weight: 2 },
};

export interface DepotAddon {
  price: number;
  /** Relative odds of turning up in a depot's stock. */
  weight: number;
}

/** Add-ons depots sell (SPEC §5.5). Each arrives in working order; a mount (sponson, dorsal ring) arrives empty. */
export const DEPOT_ADDONS: Partial<Record<AddonId, DepotAddon>> = {
  ramPlow: { price: 120, weight: 2 },
  outerTreads: { price: 200, weight: 2 },
  sponsonL: { price: 120, weight: 1.5 },
  sponsonR: { price: 120, weight: 1.5 },
  dorsalRing: { price: 180, weight: 1.5 },
  coax: { price: 60, weight: 1.5 },
  blowoutPanels: { price: 100, weight: 1.5 },
  trailer: { price: 140, weight: 2 },
};

export interface DepotModule {
  price: number;
  /** Relative odds of turning up in a depot's stock. */
  weight: number;
  /** Rearm price: per round (pods), or per load (bunkers) or drone (drone bays), on top of `DEPOT.rearmBase`. */
  roundPrice?: number;
  loadPrice?: number;
}

/** Trailer modules depots sell. Each arrives in working order, full. */
export const DEPOT_MODULES: Record<ModuleId, DepotModule> = {
  missilePod: { price: 130, weight: 2, roundPrice: 3 },
  ammoBunker: { price: 110, weight: 2, loadPrice: 30 },
  auxGenerator: { price: 90, weight: 1.5 },
  droneBay: { price: 150, weight: 1.5, loadPrice: 25 },
};

export interface DepotGrade {
  price: number;
  /** Relative odds of turning up in a depot's stock. */
  weight: number;
  /** Not offered before this many battles have been won. */
  minBattle: number;
}

/** Higher-grade core components depots sell (SPEC §5.6). Each arrives whole and replaces the one fitted. */
export const DEPOT_GRADES: Record<CoreComponent, Record<UpgradeGen, DepotGrade>> = {
  reactor: { 2: { price: 170, weight: 2, minBattle: 1 }, 3: { price: 290, weight: 1, minBattle: 2 } },
  sensors: { 2: { price: 90, weight: 2, minBattle: 1 }, 3: { price: 160, weight: 1, minBattle: 2 } },
  fireControl: { 2: { price: 120, weight: 2, minBattle: 1 }, 3: { price: 210, weight: 1, minBattle: 2 } },
  magazine: { 2: { price: 80, weight: 1.5, minBattle: 1 }, 3: { price: 140, weight: 1, minBattle: 2 } },
  treads: { 2: { price: 150, weight: 2, minBattle: 1 }, 3: { price: 250, weight: 1, minBattle: 2 } },
};

/** Salvage for each level of a mod track (level 1 first). Always on offer, an action a level. */
export const DEPOT_TRACKS: Record<TrackId, readonly number[]> = {
  harden: [40, 60, 90],
  traverse: [35, 55, 80],
  plate: [30, 45, 70],
  capacitor: [45, 70, 100],
  load: [40, 60, 90],
};
