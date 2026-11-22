import type { ObstacleClass } from './obstacles';
import type { UnitMobility } from './terrain';
import type { TargetClass, WeaponId } from './weapons';

/** Enemy unit definitions (SPEC §7). Behavior is a reusable piece chosen per unit. */

/**
 * - skirmisher: circles the Behemoth at range (light tanks)
 * - holdAhead: keeps a spot ahead of the Behemoth within an arc, falling back as it advances
 *   (heavy tanks hold close and straight ahead; missile launchers far off and to the side)
 * - ambusher: walks to nearby cover and holds there as the Behemoth passes (infantry)
 * - fixed: never moves; only the turret turns (fortress guns, SPEC §4.4 Breach; field batteries)
 * - convoy: drives up the lane toward the far end at the convoy's speed, slowing as it's damaged
 *   (SPEC §4.4 Chase)
 */
export type BehaviorId = 'skirmisher' | 'holdAhead' | 'ambusher' | 'fixed' | 'convoy';

export type EnemyId =
  | 'lightTank'
  | 'heavyTank'
  | 'missileLauncher'
  | 'infantry'
  | 'gunEmplacement'
  | 'rocketBunker'
  | 'weaponTower'
  | 'hauler'
  | 'mineLayer'
  | 'hovercraft'
  | 'commandPost'
  | 'artillery'
  | 'siegeTank';

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

/** A concrete bunker: thick all round, a little thinner at the back door. */
const BUNKER_FACING: FacingArmor = { front: 0.6, flank: 0.8, rear: 1 };

/**
 * Where a unit enters (`sim/spawner.ts`): ahead or behind the frame, ahead only, in cover ahead, or
 * dug in ahead near a side of the field ('edge': fixed units, which can't drive in from anywhere).
 * 'objective' units are placed by their battle mode (`sim/objective.ts`) and never drawn into a mix.
 */
export type SpawnPlacement = 'edges' | 'ahead' | 'cover' | 'edge' | 'objective';

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
  /** Engagement range for opening fire. */
  fireRange: number;
  /**
   * Aim telegraph: seconds the unit visibly lines up before each shot, so the player can react.
   * Big attacks get longer telegraphs. Units only open fire while inside the visible frame
   * (SPEC §7 fairness rules).
   */
  aimTime: number;
  behavior: BehaviorId;
  /**
   * Behavior tuning. `minRange`..`maxRange` is the preferred distance from the Behemoth
   * (ambusher: how far it will walk to reach cover). `angularSpeed` (rad/s) is how fast it drifts
   * around its target point. `rearInset` is how far inside the frame's trailing edge (fraction
   * of frame length) it holds when behind. `arc` (degrees) limits positions to
   * within that bearing of straight ahead (holdAhead).
   */
  engage: { minRange: number; maxRange: number; angularSpeed: number; rearInset: number; arc: number };
  /**
   * Last stand (SPEC §5.1): once the Behemoth is Immobilized every unit drops its usual behavior
   * and closes to a ring this far from it (`besiege`), from any side.
   */
  siege: { minRange: number; maxRange: number };
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
  /** A mini-boss: the banner called when it first comes into view. */
  callout?: string;
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
    behavior: 'skirmisher',
    engage: { minRange: 70, maxRange: 120, angularSpeed: 0.35, rearInset: 0.15, arc: 180 },
    siege: { minRange: 60, maxRange: 100 },
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
    behavior: 'holdAhead',
    engage: { minRange: 85, maxRange: 135, angularSpeed: 0.25, rearInset: 0.2, arc: 25 },
    siege: { minRange: 70, maxRange: 115 },
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
    behavior: 'holdAhead',
    engage: { minRange: 150, maxRange: 210, angularSpeed: 0.2, rearInset: 0.2, arc: 65 },
    siege: { minRange: 140, maxRange: 200 },
    spawn: 'ahead',
    threat: 1.5,
    salvage: 8,
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
    behavior: 'ambusher',
    engage: { minRange: 0, maxRange: 80, angularSpeed: 0, rearInset: 0, arc: 180 },
    siege: { minRange: 45, maxRange: 90 },
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
    behavior: 'fixed',
    engage: { minRange: 0, maxRange: 0, angularSpeed: 0, rearInset: 0, arc: 180 },
    siege: { minRange: 0, maxRange: 0 },
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
    behavior: 'fixed',
    engage: { minRange: 0, maxRange: 0, angularSpeed: 0, rearInset: 0, arc: 180 },
    siege: { minRange: 0, maxRange: 0 },
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
    behavior: 'fixed',
    engage: { minRange: 0, maxRange: 0, angularSpeed: 0, rearInset: 0, arc: 180 },
    siege: { minRange: 0, maxRange: 0 },
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
    behavior: 'fixed',
    engage: { minRange: 0, maxRange: 0, angularSpeed: 0, rearInset: 0, arc: 180 },
    siege: { minRange: 0, maxRange: 0 },
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
    behavior: 'convoy',
    engage: { minRange: 0, maxRange: 0, angularSpeed: 0, rearInset: 0, arc: 180 },
    siege: { minRange: 60, maxRange: 100 },
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
    behavior: 'convoy',
    engage: { minRange: 0, maxRange: 0, angularSpeed: 0, rearInset: 0, arc: 180 },
    siege: { minRange: 60, maxRange: 100 },
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
    behavior: 'fixed',
    engage: { minRange: 0, maxRange: 0, angularSpeed: 0, rearInset: 0, arc: 180 },
    siege: { minRange: 0, maxRange: 0 },
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
    behavior: 'holdAhead',
    engage: { minRange: 100, maxRange: 150, angularSpeed: 0.15, rearInset: 0.2, arc: 20 },
    siege: { minRange: 80, maxRange: 130 },
    spawn: 'ahead',
    threat: 4,
    salvage: 45,
    // The rear deck's autocannon: for the drones and the trailer while the main gun works the hull.
    turrets: [{ weapon: 'siegeAutocannon', pivot: { x: -9, y: 0 }, turretDegPerSec: 140, fireRange: 200, aimTime: 0.5, target: 'support' }],
    ramDamage: 90,
    callout: 'Siege tank sighted\nGo for its flanks',
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
    fireRange: 150,
    aimTime: 0.4,
    behavior: 'skirmisher',
    engage: { minRange: 60, maxRange: 110, angularSpeed: 0.6, rearInset: 0.12, arc: 180 },
    siege: { minRange: 60, maxRange: 100 },
    spawn: 'edges',
    threat: 1.25,
    salvage: 6,
  },
};

/** The sides of the battlefield a last-stand wave can come in from. */
export type WaveSide = 'ahead' | 'behind' | 'left' | 'right';
