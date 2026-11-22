import type { EnemyDef } from '../content/enemies';
import type { PoolSpec, ProjectileKind, ShellSpec, WeaponDef } from '../content/weapons';
import type { Owner } from './events';

/** Plain-data entities. Systems in other modules operate on them. */

export interface Enemy {
  id: number;
  def: EnemyDef;
  /** Null: unarmed (convoy vehicles). */
  weapon: WeaponDef | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Which way the hull faces (it backs up when falling back, so not always its course). */
  heading: number;
  /** Backing away from the Behemoth, front armor toward it (SPEC §7 "Facing armor"). */
  reversing: boolean;
  /** Turret angle in world space. */
  turret: number;
  hp: number;
  cooldown: number;
  /** Seconds left in the aim telegraph before a shot; 0 = not aiming. */
  windup: number;
  /** Salvo weapons: rounds left in the volley being fired, and time to the next one. */
  salvoLeft: number;
  salvoTimer: number;
  alive: boolean;
  /** Concealed from the player (SPEC §4.5): not drawn, not auto-targeted, can't be locked on to. */
  hidden: boolean;
  /** Seconds it stays visible after firing or being hit, even in concealing terrain. */
  exposed: number;
  /** One of the battle mode's targets (SPEC §4.4: a fortress gun, a convoy hauler). */
  objective: boolean;
  ai: AiMemory;
}

/** Behavior state. Each behavior uses the fields it needs (see content/enemies.ts BehaviorId). */
export interface AiMemory {
  /** Bearing from the Behemoth to the unit's target point (radians). */
  orbitAngle: number;
  /** Which way the bearing drifts. */
  orbitDir: 1 | -1;
  /** Preferred distance from the Behemoth. */
  orbitRange: number;
  /** Seconds until the behavior rethinks its plan. */
  retargetIn: number;
  /** Ambusher: the cover spot it's heading for or holding; null = none chosen yet. */
  anchor: { x: number; y: number } | null;
  /** Convoy: its place across the lane (world units off the lane's center). */
  laneOffset?: number;
  /** Mine layer: seconds until its next mine, and mines left. */
  mineIn?: number;
  minesLeft?: number;
  /** Area fire: the zone the volley being fired is laid on (SPEC §7 artillery). */
  zone?: { x: number; y: number; radius: number };
}

/**
 * A target zone marked on the ground (SPEC §7 artillery): a battery's volley is on its way into
 * it. Drawn from the moment the shells go up until the last one lands.
 */
export interface Barrage {
  x: number;
  y: number;
  radius: number;
  /** Sim time it was marked, when the first round lands, and when the last one does. */
  from: number;
  lands: number;
  until: number;
}

export interface Projectile {
  id: number;
  owner: Owner;
  weapon: WeaponDef;
  /** Flight behavior, from the weapon's projectile spec. */
  kind: ProjectileKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  traveled: number;
  /** Distance after which it detonates (aim point) or fizzles. */
  fuse: number;
  /** Missiles: the unit they're locked on to (null = dumb-fired at a point). */
  targetId: number | null;
  /** Missiles: where they're heading (the target's last known position, or the aim point). */
  tx: number;
  ty: number;
  alive: boolean;
  /** The tile it was fired from inside (a garrisoned building): its walls don't stop it. */
  shelter?: { col: number; row: number };
}

/**
 * A burning patch on the ground (plasma, SPEC §6): it damages every unit and terrain tile inside it
 * for a few seconds, and the Behemoth too if it drives over it.
 */
export interface Pool {
  id: number;
  x: number;
  y: number;
  /** The round that left it (its `vs` scales the damage to units) and its pool tuning. */
  spec: ShellSpec;
  pool: PoolSpec;
  /** Seconds it has burned. */
  age: number;
  /** Seconds until its next damage tick. */
  tick: number;
  /** Damage ticks left; it's gone after the last. */
  ticks: number;
}

/**
 * A jettisoned trailer lying in the track (SPEC §5.5): it coasts to a stop, then blows when an
 * enemy comes close or a round hits it once it's armed, or on its own when its time runs out.
 */
export interface Mine {
  id: number;
  x: number;
  y: number;
  heading: number;
  vx: number;
  vy: number;
  /** Seconds until an enemy or a hit can set it off. */
  arm: number;
  /** Seconds until it blows on its own. */
  life: number;
  /** Seconds to the blast once set off; null = not set off. */
  fuse: number | null;
  /** Its body, for hits: a circle around its center. */
  radius: number;
  /** Its blast, fixed by what it carried when it was cut loose. */
  blastRadius: number;
  blastDamage: number;
  alive: boolean;
}

/**
 * A repair drone out of its bay (SPEC §5.1): flying to its work spot over a tread pod, patching
 * it, or flying home. Docked drones aren't entities; the bay just counts them.
 */
export interface Drone {
  id: number;
  /** Index of the trailer bay it belongs to. */
  bay: number;
  x: number;
  y: number;
  heading: number;
  hp: number;
  /** Its body (units), for hits. */
  radius: number;
  /** Patching a tread set from its bay's pool, reviving the treads, or going home to dock. */
  task: 'repair' | 'revive' | 'return';
  /** The tread set it's working on (repair, revive). */
  target: string | null;
  /** Which of the set's anchor points it works at. */
  spot: number;
  /** At its spot, powered, and working this step (for the renderer's sparks). */
  working: boolean;
  alive: boolean;
}

/** Allocate a unique entity id from the world's counter. */
export function allocId(w: { nextId: number }): number {
  return w.nextId++;
}
