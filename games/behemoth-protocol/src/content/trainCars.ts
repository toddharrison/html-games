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

export type TrainCarId =
  | 'engine'
  | 'railwayGun'
  | 'gunCar'
  | 'twinGunCar'
  | 'autocannonCar'
  | 'howitzerCar'
  | 'rocketCar'
  | 'missileCar'
  | 'troopCar'
  | 'ambushCar'
  | 'mineCar'
  | 'shieldCar'
  | 'caboose'
  | 'ammoCar'
  | 'boxcar';

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
   * deflected and slides along it as against rock. Its wreck is as solid.
   */
  massive?: boolean;
  /**
   * Destroyed, it goes up in a blast of this size, on its neighbors and on the Behemoth if it's
   * close (an ammo car, the railway gun's magazine).
   */
  volatile?: { radius: number; damage: number };
  /** An armed car's draw on the train's threat budget (§T6). Missing: never drawn for it. */
  cost?: number;
  /** Destroyed or abandoned, this many squads of `unit` jump out beside it (a troop car). */
  troops?: { unit: EnemyId; squads: number };
  /**
   * Troops may ride on its roof (any car with nothing up there in their way: no turret, arm, or
   * hopper). With odds `odds`, drawn as the train is made up, it carries `squads` of `unit`, spaced
   * `spacing` apart along it, each in a sandbagged nest that keeps `cover` of what's shot at them
   * off them (as a wood or a building does for troops on the ground, `MaterialDef.protection`).
   * They fight from up there and can be shot off it; they go with the car when it's wrecked, and
   * climb down to fight on foot when it's abandoned (`sim/trainCars.ts`).
   */
  riders?: { unit: EnemyId; squads: number; spacing: number; cover: number; odds: number };
  /** Lobs mines onto the Behemoth's line (a mine flinger). */
  fling?: MineFlingDef;
  /** Seconds into the battle its gun first fires (the railway gun's opening shell); missing: as any unit. */
  firstShot?: number;
  /** Its letter on the HUD's train strip. */
  glyph: string;
}

/** Troops on a car's roof (`TrainCarDef.riders`): two infantry squads in sandbagged nests, unless the car says otherwise. Each car has its own odds of carrying them. */
const ROOF = { unit: 'infantry', squads: 2, spacing: 16, cover: 0.5 } as const;

export const TRAIN_CARS: Record<TrainCarId, TrainCarDef> = {
  engine: { id: 'engine', name: 'Engine', short: 'engine', enemy: 'trainEngine', length: 52, width: 22, engine: true, massive: true, glyph: 'E' },
  // The lead section's big gun (§T7): it shells the Behemoth from anywhere on the train, and goes
  // quiet once the hull is close. Its magazine goes up when it's destroyed.
  railwayGun: {
    id: 'railwayGun',
    name: 'Railway gun',
    short: 'railgun',
    enemy: 'trainRailwayGun',
    length: 68,
    width: 20,
    massive: true,
    volatile: { radius: 70, damage: 100 },
    firstShot: 4,
    glyph: 'R',
  },
  gunCar: { id: 'gunCar', name: 'Gun car', short: 'gun', enemy: 'trainGunCar', length: 38, width: 18, cost: 2, glyph: 'G' },
  // Two of the gun car's turrets, fore and aft: the train's heaviest broadside.
  twinGunCar: { id: 'twinGunCar', name: 'Twin gun car', short: 'twin', enemy: 'trainTwinGunCar', length: 38, width: 18, cost: 3.5, glyph: 'D' },
  // A quick-firing mount: bursts of light shells at anything inside 220.
  autocannonCar: { id: 'autocannonCar', name: 'Autocannon car', short: 'auto', enemy: 'trainAutocannonCar', length: 38, width: 18, cost: 1.5, glyph: 'C' },
  // A howitzer that shells a marked zone where the hull will be (the field battery's fire, a pair of rounds).
  howitzerCar: { id: 'howitzerCar', name: 'Howitzer car', short: 'howitzer', enemy: 'trainHowitzerCar', length: 38, width: 18, cost: 2.5, glyph: 'H' },
  // A rack of unguided rockets, fired in a ripple.
  rocketCar: { id: 'rocketCar', name: 'Rocket car', short: 'rockets', enemy: 'trainRocketCar', length: 38, width: 18, cost: 2, glyph: 'K' },
  missileCar: { id: 'missileCar', name: 'Missile car', short: 'missile', enemy: 'trainMissileCar', length: 38, width: 18, cost: 2, glyph: 'M' },
  troopCar: {
    id: 'troopCar',
    name: 'Troop car',
    short: 'troop',
    enemy: 'trainTroopCar',
    length: 38,
    width: 18,
    cost: 1.5,
    troops: { unit: 'infantry', squads: 2 },
    riders: { ...ROOF, odds: 0.5 },
    glyph: 'T',
  },
  // A boxcar until the hull is alongside: then its sides come off a gun deck (`EnemyDef.masked`).
  ambushCar: { id: 'ambushCar', name: 'Ambush car', short: 'ambush', enemy: 'trainAmbushCar', length: 38, width: 18, cost: 4, glyph: 'Q' },
  mineCar: {
    id: 'mineCar',
    name: 'Mine flinger',
    short: 'mines',
    enemy: 'trainMineCar',
    length: 38,
    width: 18,
    cost: 1.5,
    fling: { every: 6, retry: 0.5, lead: 3, flight: 1.2, arm: 0.5, live: 5, range: 260 },
    glyph: 'F',
  },
  // A loader's arm with an armor plate on it, swung between the Behemoth and the train: it stops
  // direct fire (`EnemyDef.shield`). Lobbed shells go over it.
  shieldCar: { id: 'shieldCar', name: 'Shield car', short: 'shield', enemy: 'trainShieldCar', length: 38, width: 18, cost: 2, glyph: 'S' },
  // An attack train's armored tail: three weapons and thick plate. Never drawn for an armored train.
  caboose: { id: 'caboose', name: 'Armored caboose', short: 'caboose', enemy: 'trainCaboose', length: 40, width: 20, glyph: 'Z' },
  // Unarmed, and the counter to its neighbors: it goes up on them.
  ammoCar: { id: 'ammoCar', name: 'Ammo car', short: 'ammo', enemy: 'trainAmmoCar', length: 38, width: 18, volatile: { radius: 60, damage: 90 }, riders: { ...ROOF, squads: 1, odds: 0.25 }, glyph: 'A' },
  boxcar: { id: 'boxcar', name: 'Boxcar', short: 'box', enemy: 'trainBoxcar', length: 38, width: 18, riders: { ...ROOF, odds: 0.3 }, glyph: 'B' },
};

export const TRAIN_CAR_IDS = Object.keys(TRAIN_CARS) as TrainCarId[];

/** One of everything (`?train=all`, to look the cars over): an engine, the railway gun, then every other car in the table's order. */
export function sampleTrain(): TrainCarId[] {
  return ['engine', TRAIN_LAYOUT.gun, ...TRAIN_CAR_IDS.filter((id) => !TRAIN_CARS[id].engine && id !== TRAIN_LAYOUT.gun)];
}

/**
 * A train's vehicles from a layout string (`?train=engine,gun,ammo,box,...`), front to back: each
 * name a car's id or its `short` name; unknown names are skipped. `all` is one of everything
 * (`sampleTrain`).
 */
export function parseTrain(text: string): TrainCarId[] {
  if (text.trim() === 'all') return sampleTrain();
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
 * Its budget for armed cars is `budget.base` plus `budget.perThreat` for each point of the node's
 * threat (about a third of its cars armed on a run's first Intercept, half on its last), split
 * between the sections by weights running from `split.lead` at the front to `split.tail` at the
 * back, so the train gets harder toward the front.
 */
export const TRAIN_LAYOUT: {
  sections: ByStrength;
  cars: ByStrength;
  ammo: ByStrength;
  budget: { base: ByStrength; perThreat: number };
  gun: TrainCarId;
  split: { lead: number; tail: number };
  /** An attack train (`TRAIN.raid`): an engine and this many cars (a range), drawn by the doctrine's odds; a caboose takes the last one's place. */
  raid: { cars: readonly [number, number] };
} = {
  sections: { normal: 4, strong: 5, objective: 5 },
  cars: { normal: 6, strong: 6, objective: 7 },
  ammo: { normal: 2, strong: 3, objective: 3 },
  budget: { base: { normal: 8, strong: 12, objective: 16 }, perThreat: 1.15 },
  gun: 'railwayGun',
  split: { lead: 1.5, tail: 0.75 },
  raid: { cars: [2, 3] },
};

/**
 * How each doctrine arms its trains (§T6): the odds of each armed car, and hovercraft riding with
 * the train beyond the mode's escorts.
 */
export const TRAIN_DOCTRINE: Record<DoctrineId, { weights: Partial<Record<TrainCarId, number>>; escorts?: number }> = {
  combined: { weights: { ambushCar: 0.6, gunCar: 1, twinGunCar: 0.6, autocannonCar: 1, howitzerCar: 1, rocketCar: 1, missileCar: 1, troopCar: 1, mineCar: 1, shieldCar: 0.7 } },
  armoredFist: { weights: { ambushCar: 0.8, gunCar: 2, twinGunCar: 1.5, autocannonCar: 1, howitzerCar: 0.5, rocketCar: 0.5, missileCar: 1, troopCar: 1, mineCar: 0.5, shieldCar: 1 } },
  longGuns: { weights: { ambushCar: 0.4, gunCar: 1, twinGunCar: 0.5, autocannonCar: 0.5, howitzerCar: 2, rocketCar: 1.5, missileCar: 2, troopCar: 0.5, mineCar: 1, shieldCar: 0.5 } },
  entrenched: { weights: { ambushCar: 0.6, gunCar: 1, twinGunCar: 0.5, autocannonCar: 1.5, howitzerCar: 1, rocketCar: 0.5, missileCar: 0.5, troopCar: 2, mineCar: 2, shieldCar: 1 } },
  raiders: { weights: { ambushCar: 1.2, gunCar: 1, twinGunCar: 0.5, autocannonCar: 1.5, howitzerCar: 1, rocketCar: 1.5, missileCar: 1, troopCar: 1, mineCar: 1.5, shieldCar: 0.5 }, escorts: 1 },
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
