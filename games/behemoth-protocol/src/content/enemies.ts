import { ambusher, charge, convoy, fixed, holdAhead, raider, skirmisher, stalker, type BehaviorDef } from './behaviors';
import type { BiomeId } from './biomes';
import type { ObstacleClass } from './obstacles';
import type { UnitMobility } from './terrain';
import type { TargetClass, WeaponId } from './weapons';

/**
 * Enemy unit definitions (SPEC §7). Where a unit drives is its behavior, a reusable piece with the
 * unit's own settings (content/behaviors.ts); weapons, armor, and the unit's special rules are here.
 */

export type EnemyId =
  | 'lightTank'
  | 'heavyTank'
  | 'missileLauncher'
  | 'infantry'
  | 'weaponsTeam'
  | 'gunEmplacement'
  | 'rocketBunker'
  | 'weaponTower'
  | 'hauler'
  | 'mineLayer'
  | 'hovercraft'
  | 'commandPost'
  | 'artillery'
  | 'siegeTank'
  | 'hedgeGun'
  | 'bombTruck'
  | 'skiTroops'
  | 'trapdoorTeam'
  | 'spiderWalker'
  | 'trainEngine'
  | 'trainRailwayGun'
  | 'trainGunCar'
  | 'trainTwinGunCar'
  | 'trainAutocannonCar'
  | 'trainHowitzerCar'
  | 'trainRocketCar'
  | 'trainMissileCar'
  | 'trainTroopCar'
  | 'trainMineCar'
  | 'trainAmmoCar'
  | 'trainBoxcar';

/** Which side of a vehicle a hit lands on, relative to its hull heading (SPEC §7 "Facing armor"). */
export type Facing = 'front' | 'flank' | 'rear';

/** Damage multiplier for each facing. */
export type FacingArmor = Record<Facing, number>;

/**
 * Most vehicles: tougher from the front, soft from behind. Provisional (SPEC §16 Q13); the tank
 * destroyer (front ~×0.4) and fixed emplacements (front only) get their own.
 */
const VEHICLE_FACING: FacingArmor = { front: 0.75, flank: 1, rear: 1.5 };

/** Fixed emplacements: armored on the front only (SPEC §7), open behind. */
const EMPLACEMENT_FACING: FacingArmor = { front: 0.5, flank: 1, rear: 1.5 };

/** A superheavy: a glacis plate few guns get through, and the usual soft engine deck behind. */
const SUPERHEAVY_FACING: FacingArmor = { front: 0.5, flank: 1, rear: 1.6 };

/** An armored train's engine (SPEC §7.3): thick all round, no soft side. */
const ENGINE_FACING: FacingArmor = { front: 0.8, flank: 0.8, rear: 0.8 };

/** Rolling stock: the same plate on every side. */
const CAR_FACING: FacingArmor = { front: 1, flank: 1, rear: 1 };

/** A concrete bunker: thick all round, a little thinner at the back door. */
const BUNKER_FACING: FacingArmor = { front: 0.6, flank: 0.8, rear: 1 };

/**
 * Where a unit enters (`sim/spawner.ts`): ahead or behind the frame, ahead only, in cover ahead, or
 * dug in ahead near a side of the field ('edge': fixed units, which can't drive in from anywhere),
 * or dug into a hedgerow ahead, off the Behemoth's line ('hedge', SPEC §7.4 hedge gun; a wood if
 * there's no hedge), or dug into open sand beside the Behemoth's line ('burrow', SPEC §7.4
 * trapdoor team; a post's holes close together). 'objective' units are placed by their battle mode
 * (`sim/objective.ts`) and never drawn into a mix.
 */
export type SpawnPlacement = 'edges' | 'ahead' | 'cover' | 'edge' | 'hedge' | 'burrow' | 'objective';

/**
 * What a unit's extra turret shoots at (SPEC §7 siege tank: each turret tracks its own target).
 * 'behemoth': the hull. 'support': the Behemoth's support first: a repair drone that's out, then
 * the trailer, then the hull.
 */
export type GunTarget = 'behemoth' | 'support';

/** A turret beyond the unit's main one (which turns on the unit's center with `EnemyDef.weapon`). */
export interface EnemyTurretDef {
  weapon: WeaponId;
  /** Where it turns, in hull space (x forward, y to the right). */
  pivot: { x: number; y: number };
  turretDegPerSec: number;
  fireRange: number;
  aimTime: number;
  target: GunTarget;
}

export interface EnemyDef {
  id: EnemyId;
  name: string;
  hp: number;
  /** Which weapon damage modifiers apply (SPEC §6 "best against"). */
  targetClass: TargetClass;
  /**
   * Damage multipliers by the side a direct hit strikes (SPEC §7). Splash counts as a flank hit
   * and lobbed shells as a rear (top) hit. Omitted = no facing (infantry).
   */
  facing?: FacingArmor;
  /**
   * Top speed it will back up at, keeping its front toward the Behemoth while it falls back. A
   * faster retreat turns tail and shows its rear (SPEC §7). 0 = never backs up.
   */
  reverseSpeed: number;
  /** Collision/hit radius in world units. */
  radius: number;
  /** What the Behemoth meets when it drives over this unit. */
  obstacle: ObstacleClass;
  /** How terrain slows it (tracked vehicles, troops on foot, or a hovercraft over water). */
  mobility: UnitMobility;
  /** Hides in concealing terrain (forest) until revealed (SPEC §4.5). */
  canHide: boolean;
  maxSpeed: number;
  accel: number;
  /** Turret traverse (deg/s); for infantry, how fast the squad turns to face a target. */
  turretDegPerSec: number;
  /** Null: unarmed (convoy vehicles). */
  weapon: WeaponId | null;
  /** What the main gun shoots at (default the hull; 'support': a drone that's out, then the trailer, then the hull). */
  target?: GunTarget;
  /** Engagement range for opening fire. */
  fireRange: number;
  /**
   * Aim telegraph: seconds the unit visibly lines up before each shot, so the player can react.
   * Big attacks get longer telegraphs. Units only open fire while inside the visible frame
   * (SPEC §7 fairness rules).
   */
  aimTime: number;
  /** Where it drives, and its last-stand ring (content/behaviors.ts). */
  behavior: BehaviorDef;
  spawn: SpawnPlacement;
  /** What it costs from a battle's threat budget (posts, alert waves, last-stand waves). */
  threat: number;
  salvage: number;
  /** More turrets, each with its own weapon, aim, and target (SPEC §7 siege tank). Missing = just the main one. */
  turrets?: readonly EnemyTurretDef[];
  /**
   * Too big to crush (SPEC §7 siege tank): a ram at cruise speed deals this much damage (ram gear
   * adds to it, `RAM.gearDamage`) and shoves it aside, and it only dies if that finishes it.
   * Missing = crushed outright, like everything else.
   */
  ramDamage?: number;
  /**
   * The banner called when it first comes into view: for each unit (`per: 'unit'`, a mini-boss), or
   * only the first one of its kind in a run (`per: 'run'`, SPEC §7.4 biome units).
   */
  callout?: { text: string; per: 'unit' | 'run' };
  /**
   * Laid for crossfire (SPEC §7.4 hedge gun): dug in facing across the field toward the Behemoth's
   * line, the gun turns only `arc` degrees either side of that, so it fires on the hull as it goes
   * by, into its flank, and never at it head-on.
   */
  crossfire?: { arc: number };
  /** A biome's own unit (SPEC §7.4): found only in that biome, whatever the doctrine's mix says. */
  biome?: BiomeId;
  /**
   * It carries a bomb (SPEC §7.4 bomb truck): however it dies (shot, rammed, caught in a blast, or
   * driving into the hull) it goes up in a blast of this size, and the hull takes far more from it
   * at contact (`BOMB`). Enemy fire never sets it off: friendly fire passes it by.
   */
  bomb?: { radius: number; damage: number };
  /**
   * A lidded hole (SPEC §7.4 trapdoor team): shut, nothing touches it but the treads (rounds pass
   * over, blasts and splash do nothing, the autos and missile locks ignore it). It stays unseen until
   * it first opens or the sensors sweep it, and is marked from then on. Once the hull comes level,
   * the lid lifts for `lift` s (the telegraph), the team lines up and fires (`aimTime`), lingers
   * `linger` s, and shuts for `shut` s; a lid that's had no shot after `maxOpen` s shuts anyway.
   */
  trapdoor?: { lift: number; linger: number; shut: readonly [number, number]; maxOpen: number };
  /**
   * The aim telegraph is a lock-on (SPEC §7 heavy weapons team): a designator beam on the hull for
   * the whole `aimTime`, with a lock tone. Breaking the line of sight, or a hit on the unit, breaks
   * the lock, and it starts over after `relock` seconds.
   */
  lockOn?: { relock: number };
  /**
   * Fires from beyond the frame (SPEC-armored-train.md §T7 railway gun): the one exception to the
   * rule that nothing fires from off screen. Only for area fire, whose marked zone is the warning.
   */
  offscreen?: boolean;
}

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  lightTank: {
    id: 'lightTank',
    name: 'Light tank',
    hp: 30,
    targetClass: 'light',
    facing: VEHICLE_FACING,
    // Circles too fast to back up: ahead of the Behemoth it shows its tail.
    reverseSpeed: 20,
    radius: 7,
    obstacle: 'light',
    mobility: 'tracked',
    canHide: false,
    maxSpeed: 72,
    accel: 90,
    turretDegPerSec: 180,
    weapon: 'lightTankGun',
    fireRange: 160,
    aimTime: 0.45,
    behavior: skirmisher({
      orbit: { minRange: 70, maxRange: 120, angularSpeed: 0.35 },
      rearInset: 0.15,
      fallBack: 50,
      siege: { minRange: 60, maxRange: 100, angularSpeed: 0.35, coverReach: 0 },
    }),
    spawn: 'edges',
    threat: 1,
    salvage: 5,
  },
  heavyTank: {
    id: 'heavyTank',
    name: 'Heavy tank',
    hp: 90,
    targetClass: 'heavy',
    facing: VEHICLE_FACING,
    // The line: backs up at full speed, so it only shows its rear once it's been passed.
    reverseSpeed: 45,
    radius: 9,
    obstacle: 'medium',
    mobility: 'tracked',
    canHide: false,
    // Barely faster than the Behemoth's cruise: it can hold the line ahead, but a surge runs it down.
    maxSpeed: 42,
    accel: 30,
    turretDegPerSec: 70,
    weapon: 'heavyTankGun',
    fireRange: 210,
    aimTime: 0.7,
    behavior: holdAhead({
      orbit: { minRange: 85, maxRange: 135, angularSpeed: 0.25 },
      arc: 25,
      rearInset: 0.2,
      fallBack: 40,
      siege: { minRange: 70, maxRange: 115, angularSpeed: 0.25, coverReach: 0 },
    }),
    spawn: 'ahead',
    threat: 2,
    salvage: 12,
  },
  missileLauncher: {
    id: 'missileLauncher',
    name: 'Missile launcher',
    hp: 18,
    targetClass: 'light',
    facing: VEHICLE_FACING,
    // Turns and runs when the Behemoth comes on at cruise.
    reverseSpeed: 30,
    radius: 7,
    obstacle: 'light',
    mobility: 'tracked',
    canHide: false,
    maxSpeed: 56,
    accel: 60,
    turretDegPerSec: 90,
    weapon: 'launcherMissiles',
    fireRange: 300,
    // A missile lock: the longest telegraph so far.
    aimTime: 1.1,
    behavior: holdAhead({
      orbit: { minRange: 150, maxRange: 210, angularSpeed: 0.2 },
      arc: 65,
      rearInset: 0.2,
      fallBack: 40,
      siege: { minRange: 140, maxRange: 200, angularSpeed: 0.2, coverReach: 0 },
    }),
    spawn: 'ahead',
    threat: 1.5,
    salvage: 8,
  },
  weaponsTeam: {
    // Two soldiers and a guided missile on a tripod: they dig into cover well off the Behemoth's
    // path, out-range the squads, and paint the hull for a long lock before the missile goes.
    id: 'weaponsTeam',
    name: 'Heavy weapons team',
    hp: 12,
    targetClass: 'infantry',
    reverseSpeed: 0,
    radius: 5,
    obstacle: 'trivial',
    mobility: 'foot',
    canHide: true,
    maxSpeed: 14,
    accel: 50,
    turretDegPerSec: 120,
    weapon: 'guidedMissile',
    fireRange: 240,
    // The lock: long enough to see it coming and do something about it.
    aimTime: 2.2,
    behavior: ambusher({ reach: 100, siege: { minRange: 110, maxRange: 170, angularSpeed: 0, coverReach: 100 } }),
    spawn: 'cover',
    threat: 1.5,
    salvage: 6,
    lockOn: { relock: 1.5 },
  },
  infantry: {
    id: 'infantry',
    name: 'Infantry squad',
    hp: 14,
    targetClass: 'infantry',
    reverseSpeed: 0,
    radius: 5,
    obstacle: 'trivial',
    mobility: 'foot',
    canHide: true,
    maxSpeed: 18,
    accel: 60,
    turretDegPerSec: 360,
    weapon: 'infantryRockets',
    fireRange: 115,
    aimTime: 0.6,
    behavior: ambusher({ reach: 80, siege: { minRange: 45, maxRange: 90, angularSpeed: 0, coverReach: 80 } }),
    spawn: 'cover',
    threat: 1,
    salvage: 3,
  },
  gunEmplacement: {
    id: 'gunEmplacement',
    name: 'Gun emplacement',
    hp: 110,
    targetClass: 'heavy',
    facing: EMPLACEMENT_FACING,
    reverseSpeed: 0,
    radius: 10,
    // Plowing through one is like plowing through a bunker.
    obstacle: 'heavy',
    mobility: 'tracked',
    canHide: false,
    maxSpeed: 0,
    accel: 0,
    turretDegPerSec: 40,
    weapon: 'emplacementGun',
    fireRange: 270,
    aimTime: 0.9,
    behavior: fixed(),
    spawn: 'objective',
    threat: 3,
    salvage: 20,
  },
  rocketBunker: {
    id: 'rocketBunker',
    name: 'Rocket bunker',
    hp: 120,
    targetClass: 'heavy',
    facing: BUNKER_FACING,
    reverseSpeed: 0,
    radius: 10,
    obstacle: 'heavy',
    mobility: 'tracked',
    canHide: false,
    maxSpeed: 0,
    accel: 0,
    turretDegPerSec: 120,
    weapon: 'bunkerRockets',
    fireRange: 190,
    aimTime: 0.7,
    behavior: fixed(),
    spawn: 'objective',
    threat: 3,
    salvage: 20,
  },
  weaponTower: {
    id: 'weaponTower',
    name: 'Weapon tower',
    hp: 90,
    targetClass: 'heavy',
    // A tall, slim tower: thick plate on the face toward the approach.
    facing: EMPLACEMENT_FACING,
    reverseSpeed: 0,
    radius: 9,
    obstacle: 'heavy',
    mobility: 'tracked',
    canHide: false,
    maxSpeed: 0,
    accel: 0,
    turretDegPerSec: 90,
    weapon: 'towerGuns',
    fireRange: 240,
    aimTime: 0.6,
    behavior: fixed(),
    spawn: 'objective',
    threat: 3,
    salvage: 20,
  },
  commandPost: {
    // Decapitation's target (SPEC §3): unarmed, but while it stands the fortress keeps calling in
    // reinforcements; destroying it stops the alert clock (`sim/objective.ts`).
    id: 'commandPost',
    name: 'Command post',
    hp: 220,
    targetClass: 'heavy',
    facing: BUNKER_FACING,
    reverseSpeed: 0,
    radius: 12,
    obstacle: 'heavy',
    mobility: 'tracked',
    canHide: false,
    maxSpeed: 0,
    accel: 0,
    turretDegPerSec: 0,
    weapon: null,
    fireRange: 0,
    aimTime: 0,
    behavior: fixed(),
    spawn: 'objective',
    threat: 4,
    salvage: 40,
  },
  hauler: {
    id: 'hauler',
    name: 'Armored hauler',
    hp: 70,
    targetClass: 'heavy',
    facing: VEHICLE_FACING,
    reverseSpeed: 0,
    radius: 9,
    // Big enough to feel when it's run down.
    obstacle: 'medium',
    mobility: 'tracked',
    canHide: false,
    // The convoy sets the pace (`MODES.chase.convoy.speed`); this is only the ceiling.
    maxSpeed: 60,
    accel: 40,
    turretDegPerSec: 0,
    weapon: null,
    fireRange: 0,
    aimTime: 0,
    behavior: convoy(),
    spawn: 'objective',
    threat: 2,
    // A hold full of supplies.
    salvage: 25,
  },
  mineLayer: {
    id: 'mineLayer',
    name: 'Mine layer',
    hp: 40,
    targetClass: 'light',
    facing: VEHICLE_FACING,
    reverseSpeed: 0,
    radius: 7,
    obstacle: 'light',
    mobility: 'tracked',
    canHide: false,
    maxSpeed: 60,
    accel: 40,
    turretDegPerSec: 0,
    weapon: null,
    fireRange: 0,
    aimTime: 0,
    // Saves its mines while nothing is following, and drops them on the hull's line.
    behavior: convoy({ mines: { range: 400, lead: 1.5 } }),
    spawn: 'objective',
    threat: 1.5,
    salvage: 8,
  },
  artillery: {
    // Area denial (SPEC §7): dug in near a side of the field, it lays a volley on the ground the
    // Behemoth is about to cross. The zone is marked as the shells go up, so a change of speed or
    // course gets clear; driving straight at the battery gets under its minimum range.
    id: 'artillery',
    name: 'Field battery',
    // Tough enough to get a second volley off while the Behemoth closes on it.
    hp: 75,
    targetClass: 'light',
    // Guns behind an earth berm toward the front; open behind.
    facing: EMPLACEMENT_FACING,
    reverseSpeed: 0,
    radius: 10,
    // Guns and limbers: they go under the treads with a crunch.
    obstacle: 'medium',
    mobility: 'tracked',
    canHide: false,
    maxSpeed: 0,
    accel: 0,
    turretDegPerSec: 30,
    weapon: 'batteryShells',
    fireRange: 330,
    // Laying the guns: a long glint before the volley goes up.
    aimTime: 1.2,
    behavior: fixed(),
    spawn: 'edge',
    threat: 2,
    salvage: 14,
  },
  siegeTank: {
    // Mini-boss (SPEC §7): a superheavy that holds the line ahead with two turrets, each tracking
    // its own target. Its front is nearly proof against the guns, so it pays to angle in for a
    // flank, or drive it down: it's too big to crush, but a ram hurts it badly.
    id: 'siegeTank',
    name: 'Siege tank',
    // A mini-boss: about 20 s under everything a stock Behemoth has, head-on.
    hp: 360,
    targetClass: 'heavy',
    facing: SUPERHEAVY_FACING,
    // Backs up at its full (slow) speed, so its glacis stays toward the Behemoth until it's passed.
    reverseSpeed: 30,
    radius: 13,
    obstacle: 'heavy',
    mobility: 'tracked',
    canHide: false,
    // Slower than the Behemoth's cruise: it can't hold its distance for long.
    maxSpeed: 30,
    accel: 16,
    turretDegPerSec: 35,
    weapon: 'siegeCannon',
    fireRange: 260,
    aimTime: 1,
    behavior: holdAhead({
      orbit: { minRange: 100, maxRange: 150, angularSpeed: 0.15 },
      arc: 20,
      rearInset: 0.2,
      siege: { minRange: 80, maxRange: 130, angularSpeed: 0.15, coverReach: 0 },
    }),
    spawn: 'ahead',
    threat: 4,
    salvage: 45,
    // The rear deck's autocannon: for the drones and the trailer while the main gun works the hull.
    turrets: [{ weapon: 'siegeAutocannon', pivot: { x: -9, y: 0 }, turretDegPerSec: 140, fireRange: 200, aimTime: 0.5, target: 'support' }],
    ramDamage: 90,
    callout: { text: 'Siege tank sighted\nGo for its flanks', per: 'unit' },
  },
  hedgeGun: {
    // Temperate's own unit (SPEC §7.4): a towed anti-tank gun dug into a hedgerow beside the path,
    // facing across it. Unseen until it fires or the sensors sweep it; it waits for the hull to come
    // level and puts a fast shot into its flank. Tear through the hedge and it goes under the treads.
    id: 'hedgeGun',
    name: 'Hedge gun',
    // Small and light once found: two or three autocannon bursts at its shield, one main-gun shell.
    hp: 24,
    targetClass: 'light',
    // The gun shield faces the path; the trail and crew behind it are open.
    facing: EMPLACEMENT_FACING,
    reverseSpeed: 0,
    radius: 6,
    obstacle: 'light',
    mobility: 'tracked',
    canHide: true,
    maxSpeed: 0,
    accel: 0,
    turretDegPerSec: 50,
    weapon: 'hedgeGunShot',
    fireRange: 240,
    // A short glint: the ambush is that it's hidden, not that the shot is quick to come.
    aimTime: 0.8,
    behavior: fixed(),
    spawn: 'hedge',
    threat: 1.5,
    salvage: 8,
    callout: { text: 'Hedge guns\nThey hide in the hedgerows', per: 'run' },
    // Within 45° of square on: from there its shots meet the hull's flank (SPEC §5.1 arcs).
    crossfire: { arc: 45 },
    biome: 'temperate',
  },
  spiderWalker: {
    // The wasteland's own unit (SPEC §7.4): a six-legged walker that strides over the rubble,
    // wrecks, craters, and rock that slow or stop everything else, works round behind the Behemoth,
    // and goes for what's back there: a repair drone that's out, the trailer, the rear armor.
    id: 'spiderWalker',
    name: 'Spider walker',
    // Tougher than a light tank, short of a heavy: it has to be dealt with, not brushed off.
    hp: 55,
    targetClass: 'light',
    facing: VEHICLE_FACING,
    // It turns to keep its guns on the hull rather than backing off.
    reverseSpeed: 0,
    radius: 8,
    obstacle: 'medium',
    mobility: 'walker',
    canHide: false,
    // Faster than the Behemoth's cruise (it catches up from behind), slower than its surge.
    maxSpeed: 50,
    accel: 60,
    turretDegPerSec: 160,
    weapon: 'walkerGuns',
    target: 'support',
    fireRange: 190,
    aimTime: 0.6,
    // How far behind the hull's tail (or the trailer's) it holds, and how far inside the frame.
    behavior: stalker({
      hold: { minRange: 45, maxRange: 85 },
      rearInset: 0.12,
      fallBack: 30,
      siege: { minRange: 60, maxRange: 110, angularSpeed: 0, coverReach: 0 },
    }),
    spawn: 'edges',
    threat: 2.5,
    salvage: 18,
    callout: { text: 'Spider walkers\nThey hunt your rear', per: 'run' },
    biome: 'wasteland',
  },
  trapdoorTeam: {
    // Desert's own unit (SPEC §7.4, the user's idea): troops in a lidded hole in the sand, like a
    // trapdoor spider. They let the hull come level, lift the lid, put a rocket into its flank or
    // rear, and shut it again; shut, they can't be hurt (user's call: not even by a heavy blast).
    // Shoot them while the lid is up, or drive over the hole.
    id: 'trapdoorTeam',
    name: 'Trapdoor team',
    hp: 12,
    targetClass: 'infantry',
    reverseSpeed: 0,
    radius: 5,
    obstacle: 'trivial',
    mobility: 'foot',
    // Hidden by the lid, not by cover (`trapdoor`).
    canHide: false,
    maxSpeed: 0,
    accel: 0,
    turretDegPerSec: 360,
    weapon: 'trapdoorRocket',
    // Long enough for a second lift as the hull draws away (user request: longer range).
    fireRange: 200,
    // A quick pop-up shot: the lid lifting is the telegraph, and they stay up a moment after.
    aimTime: 0.35,
    behavior: fixed(),
    spawn: 'burrow',
    threat: 1.25,
    salvage: 5,
    callout: { text: 'Trapdoor teams\nShoot while the lid is up', per: 'run' },
    biome: 'desert',
    trapdoor: { lift: 0.4, linger: 0.5, shut: [3, 4], maxOpen: 2 },
  },
  skiTroops: {
    // Arctic's own unit (SPEC §7.4): the only fast troops. They sweep round the Behemoth over the
    // snow, weaving so the automatic weapons can't track them, and fire rockets into the treads
    // from the flanks and rear without stopping (user's calls). Aim at them yourself.
    id: 'skiTroops',
    name: 'Ski troops',
    // Three skiers, a little lighter than a squad.
    hp: 10,
    targetClass: 'infantry',
    reverseSpeed: 0,
    radius: 5,
    obstacle: 'trivial',
    mobility: 'ski',
    canHide: false,
    // On snow, nearly a light tank's pace; off it (rock, rubble, towns), a squad's (`SKI.offSnow`).
    maxSpeed: 62,
    // Quick on their edges: the weave snaps from side to side.
    accel: 140,
    turretDegPerSec: 360,
    weapon: 'infantryRockets',
    fireRange: 125,
    aimTime: 0.6,
    // Wider than a light tank's circle: mostly out past the AP guns' reach (75), dipping into it.
    // The weave throws off a lead, and the autos can't track it (`EVASION`).
    behavior: skirmisher({
      orbit: { minRange: 85, maxRange: 120, angularSpeed: 0.55 },
      rearInset: 0.15,
      fallBack: 40,
      siege: { minRange: 45, maxRange: 90, angularSpeed: 0.55, coverReach: 0 },
      weave: { speed: 34, flip: [0.35, 0.8], clearance: 20 },
    }),
    spawn: 'edges',
    threat: 1.25,
    salvage: 4,
    callout: { text: 'Ski troops\nToo quick for the autos', per: 'run' },
    biome: 'arctic',
  },
  bombTruck: {
    // Industrial's own unit (SPEC §7.4): a truck with a bomb on its bed that drives flat out at the
    // Behemoth and goes up on contact. It strobes like a self-destructing Behemoth from the moment it
    // starts its run (user's call), so the answer is to shoot it first, ideally beside its friends or
    // a tank farm.
    id: 'bombTruck',
    name: 'Bomb truck',
    // Fragile: one autocannon burst or a main-gun shell.
    hp: 14,
    targetClass: 'light',
    facing: VEHICLE_FACING,
    reverseSpeed: 0,
    radius: 6,
    obstacle: 'light',
    mobility: 'tracked',
    canHide: false,
    // Faster than the Behemoth's cruise, slower than its surge: it closes about 2.5 s after it shows.
    maxSpeed: 55,
    accel: 70,
    turretDegPerSec: 0,
    weapon: null,
    fireRange: 0,
    aimTime: 0,
    behavior: charge(),
    // Never from behind the frame: a truck you can't see coming isn't fair.
    spawn: 'ahead',
    threat: 1.25,
    salvage: 4,
    callout: { text: 'Bomb trucks\nShoot them before they reach you', per: 'run' },
    biome: 'industrial',
    // A fuel tank's blast and then some (40 / 50).
    bomb: { radius: 36, damage: 60 },
  },
  hovercraft: {
    id: 'hovercraft',
    name: 'Hovercraft',
    hp: 22,
    targetClass: 'light',
    facing: VEHICLE_FACING,
    // Skids around rather than backing off.
    reverseSpeed: 0,
    radius: 7,
    obstacle: 'light',
    mobility: 'hover',
    canHide: false,
    // The fastest thing on the field: raids and gets away.
    maxSpeed: 90,
    accel: 110,
    turretDegPerSec: 220,
    weapon: 'hoverGun',
    // What a raid from behind finds first: a drone that's out, the trailer, then the hull.
    target: 'support',
    fireRange: 150,
    aimTime: 0.4,
    // Hit-and-run from the rear: waits wide on a flank (on the water if it can), sweeps in over the
    // rear quarter, and breaks off fast (`raider`).
    behavior: raider({
      rearInset: 0.12,
      siege: { minRange: 60, maxRange: 100, angularSpeed: 0.6, coverReach: 0 },
    }),
    spawn: 'edges',
    threat: 1.25,
    salvage: 6,
  },
  trainEngine: {
    // An armored train's engine (SPEC §4.4 Intercept, §7.3): it pulls its section, and it's the
    // mode's target. It never drives itself: the train puts it on the line each step
    // (`sim/train.ts`). Unarmed, thick all round, and too big to crush.
    id: 'trainEngine',
    name: 'Engine',
    hp: 260,
    targetClass: 'heavy',
    facing: ENGINE_FACING,
    reverseSpeed: 0,
    radius: 15,
    obstacle: 'heavy',
    mobility: 'tracked',
    canHide: false,
    maxSpeed: 0,
    accel: 0,
    turretDegPerSec: 0,
    weapon: null,
    fireRange: 0,
    aimTime: 0,
    behavior: fixed(),
    spawn: 'objective',
    // The train is the battle's set piece: its vehicles cost the alert clock nothing.
    threat: 0,
    salvage: 30,
    ramDamage: 60,
  },
  trainRailwayGun: {
    // The lead section's railway gun (SPEC-armored-train.md §T7): a huge gun on a long car behind
    // the lead engine. It shells the Behemoth from anywhere on the train, on screen or off, and
    // can't lay its gun on anything closer than its minimum range. Too big to crush.
    id: 'trainRailwayGun',
    name: 'Railway gun',
    hp: 320,
    targetClass: 'heavy',
    facing: ENGINE_FACING,
    reverseSpeed: 0,
    // One hit circle for a 60-long car: its ends are a little harder to hit than its middle.
    radius: 18,
    obstacle: 'heavy',
    mobility: 'tracked',
    canHide: false,
    maxSpeed: 0,
    accel: 0,
    turretDegPerSec: 30,
    weapon: 'railwayGunShell',
    fireRange: 1200,
    aimTime: 1,
    behavior: fixed(),
    spawn: 'objective',
    threat: 0,
    salvage: 45,
    ramDamage: 60,
    offscreen: true,
  },
  trainGunCar: {
    // A turret on a flatcar with the fortress gun in it: the train's hardest shots (§T6).
    id: 'trainGunCar',
    name: 'Gun car',
    hp: 150,
    targetClass: 'heavy',
    facing: CAR_FACING,
    reverseSpeed: 0,
    radius: 13,
    obstacle: 'heavy',
    mobility: 'tracked',
    canHide: false,
    maxSpeed: 0,
    accel: 0,
    turretDegPerSec: 40,
    weapon: 'emplacementGun',
    fireRange: 270,
    aimTime: 0.9,
    behavior: fixed(),
    spawn: 'objective',
    threat: 0,
    salvage: 20,
  },
  trainTwinGunCar: {
    // Two of the gun car's turrets on one long mount, fore and aft, each laid on its own (§T6).
    id: 'trainTwinGunCar',
    name: 'Twin gun car',
    hp: 190,
    targetClass: 'heavy',
    facing: CAR_FACING,
    reverseSpeed: 0,
    radius: 13,
    obstacle: 'heavy',
    mobility: 'tracked',
    canHide: false,
    maxSpeed: 0,
    accel: 0,
    turretDegPerSec: 0,
    weapon: null,
    fireRange: 0,
    aimTime: 0,
    behavior: fixed(),
    spawn: 'objective',
    threat: 0,
    salvage: 28,
    turrets: [
      { weapon: 'emplacementGun', pivot: { x: 9, y: 0 }, turretDegPerSec: 40, fireRange: 270, aimTime: 0.9, target: 'behemoth' },
      { weapon: 'emplacementGun', pivot: { x: -9, y: 0 }, turretDegPerSec: 40, fireRange: 270, aimTime: 0.9, target: 'behemoth' },
    ],
  },
  trainAutocannonCar: {
    // A quick-firing mount: short bursts at anything that comes inside its reach (§T6).
    id: 'trainAutocannonCar',
    name: 'Autocannon car',
    hp: 130,
    targetClass: 'heavy',
    facing: CAR_FACING,
    reverseSpeed: 0,
    radius: 13,
    obstacle: 'heavy',
    mobility: 'tracked',
    canHide: false,
    maxSpeed: 0,
    accel: 0,
    turretDegPerSec: 150,
    weapon: 'trainAutocannon',
    fireRange: 220,
    aimTime: 0.5,
    behavior: fixed(),
    spawn: 'objective',
    threat: 0,
    salvage: 16,
  },
  trainHowitzerCar: {
    // A howitzer on a turntable: it marks a zone where the hull will be and drops a pair of rounds
    // on it (the field battery's fire; it can't lay its gun on what's close, §T6).
    id: 'trainHowitzerCar',
    name: 'Howitzer car',
    hp: 130,
    targetClass: 'heavy',
    facing: CAR_FACING,
    reverseSpeed: 0,
    radius: 13,
    obstacle: 'heavy',
    mobility: 'tracked',
    canHide: false,
    maxSpeed: 0,
    accel: 0,
    turretDegPerSec: 40,
    weapon: 'trainHowitzer',
    fireRange: 320,
    aimTime: 0.9,
    behavior: fixed(),
    spawn: 'objective',
    threat: 0,
    salvage: 20,
  },
  trainRocketCar: {
    // A rack of unguided rockets, rippled off at the hull: wild, but a lot of them (§T6).
    id: 'trainRocketCar',
    name: 'Rocket car',
    hp: 120,
    targetClass: 'heavy',
    facing: CAR_FACING,
    reverseSpeed: 0,
    radius: 13,
    obstacle: 'heavy',
    mobility: 'tracked',
    canHide: false,
    maxSpeed: 0,
    accel: 0,
    turretDegPerSec: 70,
    weapon: 'trainRockets',
    fireRange: 250,
    aimTime: 1,
    behavior: fixed(),
    spawn: 'objective',
    threat: 0,
    salvage: 18,
  },
  trainMissileCar: {
    // A rack of the missile launcher's homing missiles, fired in pairs (§T6).
    id: 'trainMissileCar',
    name: 'Missile car',
    hp: 130,
    targetClass: 'heavy',
    facing: CAR_FACING,
    reverseSpeed: 0,
    radius: 13,
    obstacle: 'heavy',
    mobility: 'tracked',
    canHide: false,
    maxSpeed: 0,
    accel: 0,
    turretDegPerSec: 90,
    weapon: 'trainMissiles',
    fireRange: 300,
    aimTime: 1.1,
    behavior: fixed(),
    spawn: 'objective',
    threat: 0,
    salvage: 20,
  },
  trainTroopCar: {
    // Riflemen with rockets at firing slits down both sides, aimed low at the treads: short range,
    // so it punishes hugging the train (§T6). Its squads jump out when it's destroyed or cut loose.
    id: 'trainTroopCar',
    name: 'Troop car',
    hp: 140,
    targetClass: 'heavy',
    facing: CAR_FACING,
    reverseSpeed: 0,
    radius: 13,
    obstacle: 'heavy',
    mobility: 'tracked',
    canHide: false,
    maxSpeed: 0,
    accel: 0,
    turretDegPerSec: 360,
    weapon: 'troopRockets',
    fireRange: 110,
    aimTime: 0.6,
    behavior: fixed(),
    spawn: 'objective',
    threat: 0,
    salvage: 15,
  },
  trainMineCar: {
    // A mine flinger: it lobs mines onto the Behemoth's line ahead of it (its throw is
    // `TrainCarDef.fling`, worked by the train, sim/train.ts). No gun.
    id: 'trainMineCar',
    name: 'Mine flinger',
    hp: 120,
    targetClass: 'heavy',
    facing: CAR_FACING,
    reverseSpeed: 0,
    radius: 13,
    obstacle: 'heavy',
    mobility: 'tracked',
    canHide: false,
    maxSpeed: 0,
    accel: 0,
    turretDegPerSec: 0,
    weapon: null,
    fireRange: 0,
    aimTime: 0,
    behavior: fixed(),
    spawn: 'objective',
    threat: 0,
    salvage: 15,
  },
  trainAmmoCar: {
    // Unarmed and thin-skinned: destroyed, it goes up (`TrainCarDef.volatile`) on its neighbors.
    id: 'trainAmmoCar',
    name: 'Ammo car',
    hp: 70,
    targetClass: 'heavy',
    facing: CAR_FACING,
    reverseSpeed: 0,
    radius: 13,
    obstacle: 'heavy',
    mobility: 'tracked',
    canHide: false,
    maxSpeed: 0,
    accel: 0,
    turretDegPerSec: 0,
    weapon: null,
    fireRange: 0,
    aimTime: 0,
    behavior: fixed(),
    spawn: 'objective',
    threat: 0,
    salvage: 8,
  },
  trainBoxcar: {
    // Unarmed cargo: it fills the places in a train the node's threat doesn't arm.
    id: 'trainBoxcar',
    name: 'Boxcar',
    hp: 90,
    targetClass: 'heavy',
    facing: CAR_FACING,
    reverseSpeed: 0,
    radius: 13,
    obstacle: 'heavy',
    mobility: 'tracked',
    canHide: false,
    maxSpeed: 0,
    accel: 0,
    turretDegPerSec: 0,
    weapon: null,
    fireRange: 0,
    aimTime: 0,
    behavior: fixed(),
    spawn: 'objective',
    threat: 0,
    // A hold full of supplies.
    salvage: 12,
  },
};

/** The sides of the battlefield a last-stand wave can come in from. */
export type WaveSide = 'ahead' | 'behind' | 'left' | 'right';
