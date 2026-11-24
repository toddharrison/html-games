import type { DoctrineId } from './doctrines';
import type { EnemyId } from './enemies';
import type { ByStrength } from './modes';

/**
 * Armored train cars (SPEC §4.4 Intercept, §7.3; docs/SPEC-armored-train.md §T6, §T7). A train is
 * a chain of vehicles on the battle's rail line, front to back, in **sections**: an engine and the
 * cars it pulls. Each vehicle is a unit on the field (`enemy`: its armor, weapons, and salvage are
 * in content/enemies.ts, its guns in content/weapons.ts); what's here is its place in the train and
 * what it does beyond shooting. How a train runs (pace, cutting loose, derailing, collisions) is
 * `TRAIN` in tuning.ts; how one is put together from a node's threat is `buildTrain` (sim/train.ts).
 */

export type TrainCarId = 'engine' | 'railwayGun' | 'gunCar' | 'missileCar' | 'troopCar' | 'mineCar' | 'ammoCar' | 'boxcar';

/**
 * A mine flinger's throw (§T6): every `every` s, while the car is in the frame, it lobs a mine onto
 * the Behemoth's line where the hull will be `lead` s from now, if that's open ground within `range`.
 * The mine is in the air `flight` s, lies in plain sight `arm` s, and is then a live mine (a
 * `mine` tile, which the treads set off). At most `live` of its mines are out at once. A throw it
 * can't make (no open ground there, too far, too many out) is tried again `retry` s later.
 */
export interface MineFlingDef {
  every: number;
  retry: number;
  lead: number;
  flight: number;
  arm: number;
  live: number;
  range: number;
}

export interface TrainCarDef {
  id: TrainCarId;
  name: string;
  /** Its name in a practice layout (`?train=engine,gun,ammo,box`). */
  short: string;
  /** The unit it is on the field. */
  enemy: EnemyId;
  /** Its length along the track and its width across it (world units): the train's spacing and its collisions. */
  length: number;
  width: number;
  /** Pulls its section: one of the Intercept's targets. Every section starts with one. */
  engine?: boolean;
  /**
   * Too big to crush (§T10): a ram damages it but doesn't shove it (it's on rails), and the hull is
   * deflected and slides along it as against rock. Its hulk and its wreck are as solid.
   */
  massive?: boolean;
  /**
   * Destroyed, it goes up in a blast of this size (on its neighbors, and the Behemoth if it's close)
   * and the chain parts there (an ammo car), unless `holds` (the railway gun's magazine).
   */
  volatile?: { radius: number; damage: number; holds?: boolean };
  /** An armed car's draw on the train's threat budget (§T6). Missing: never drawn for it. */
  cost?: number;
  /** Destroyed or cut loose, this many squads of `unit` jump out beside it (a troop car). */
  troops?: { unit: EnemyId; squads: number };
  /** Lobs mines onto the Behemoth's line (a mine flinger). */
  fling?: MineFlingDef;
  /** Seconds into the battle its gun first fires (the railway gun's opening shell); missing: as any unit. */
  firstShot?: number;
  /** Its letter on the HUD's train strip. */
  glyph: string;
}

export const TRAIN_CARS: Record<TrainCarId, TrainCarDef> = {
  engine: { id: 'engine', name: 'Engine', short: 'engine', enemy: 'trainEngine', length: 40, width: 24, engine: true, massive: true, glyph: 'E' },
  // The lead section's big gun (§T7): it shells the Behemoth from anywhere on the train, and goes
  // quiet once the hull is close. Its magazine goes up when it's destroyed, but the chain holds.
  railwayGun: {
    id: 'railwayGun',
    name: 'Railway gun',
    short: 'railgun',
    enemy: 'trainRailwayGun',
    length: 60,
    width: 24,
    massive: true,
    volatile: { radius: 70, damage: 100, holds: true },
    firstShot: 4,
    glyph: 'R',
  },
  gunCar: { id: 'gunCar', name: 'Gun car', short: 'gun', enemy: 'trainGunCar', length: 34, width: 22, cost: 2, glyph: 'G' },
  missileCar: { id: 'missileCar', name: 'Missile car', short: 'missile', enemy: 'trainMissileCar', length: 34, width: 22, cost: 2, glyph: 'M' },
  troopCar: {
    id: 'troopCar',
    name: 'Troop car',
    short: 'troop',
    enemy: 'trainTroopCar',
    length: 34,
    width: 22,
    cost: 1.5,
    troops: { unit: 'infantry', squads: 2 },
    glyph: 'T',
  },
  mineCar: {
    id: 'mineCar',
    name: 'Mine flinger',
    short: 'mines',
    enemy: 'trainMineCar',
    length: 34,
    width: 22,
    cost: 1.5,
    fling: { every: 6, retry: 0.5, lead: 3, flight: 1.2, arm: 0.5, live: 5, range: 260 },
    glyph: 'F',
  },
  // Unarmed, and the counter to its neighbors: it goes up, and parts the chain.
  ammoCar: { id: 'ammoCar', name: 'Ammo car', short: 'ammo', enemy: 'trainAmmoCar', length: 34, width: 22, volatile: { radius: 60, damage: 90 }, glyph: 'A' },
  boxcar: { id: 'boxcar', name: 'Boxcar', short: 'box', enemy: 'trainBoxcar', length: 34, width: 22, glyph: 'B' },
};

export const TRAIN_CAR_IDS = Object.keys(TRAIN_CARS) as TrainCarId[];

/**
 * A train's vehicles from a layout string (`?train=engine,gun,ammo,box,...`), front to back: each
 * name a car's id or its `short` name; unknown names are skipped.
 */
export function parseTrain(text: string): TrainCarId[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .flatMap((s) => {
      const id = s in TRAIN_CARS ? (s as TrainCarId) : TRAIN_CAR_IDS.find((c) => TRAIN_CARS[c].short === s);
      return id ? [id] : [];
    });
}

/**
 * How a train is put together (§T4, §T6), by the node's strength: its sections and the cars behind
 * each engine (the railway gun rides behind the lead engine, on top of these), and the ammo cars.
 * The node's threat is its budget for armed cars, split between the sections tail to lead by `split`
 * (`middle` is shared by the sections between the tail and the lead), so the train gets harder
 * toward the front.
 */
export const TRAIN_LAYOUT: {
  sections: ByStrength;
  cars: ByStrength;
  ammo: ByStrength;
  gun: TrainCarId;
  split: { tail: number; middle: number; lead: number };
} = {
  sections: { normal: 3, strong: 3, objective: 4 },
  cars: { normal: 4, strong: 5, objective: 5 },
  ammo: { normal: 1, strong: 2, objective: 2 },
  gun: 'railwayGun',
  split: { tail: 0.25, middle: 0.35, lead: 0.4 },
};

/**
 * How each doctrine arms its trains (§T6): the odds of each armed car, and hovercraft riding with
 * the train beyond the mode's escorts.
 */
export const TRAIN_DOCTRINE: Record<DoctrineId, { weights: Partial<Record<TrainCarId, number>>; escorts?: number }> = {
  combined: { weights: { gunCar: 1, missileCar: 1, troopCar: 1, mineCar: 1 } },
  armoredFist: { weights: { gunCar: 2, missileCar: 1, troopCar: 1, mineCar: 0.5 } },
  longGuns: { weights: { gunCar: 1, missileCar: 2, troopCar: 0.5, mineCar: 1 } },
  entrenched: { weights: { gunCar: 1, missileCar: 0.5, troopCar: 2, mineCar: 2 } },
  raiders: { weights: { gunCar: 1, missileCar: 1, troopCar: 1, mineCar: 1.5 }, escorts: 1 },
};

/** A train of engines and boxcars only, front to back (practice, and tests of how a train runs). */
export function plainTrain(strength: keyof ByStrength): TrainCarId[] {
  const out: TrainCarId[] = [];
  for (let s = 0; s < TRAIN_LAYOUT.sections[strength]; s++) {
    out.push('engine');
    for (let c = 0; c < TRAIN_LAYOUT.cars[strength]; c++) out.push('boxcar');
  }
  return out;
}
