import type { ArmorArc } from '../content/chassis';
import type { EnemyId, Facing } from '../content/enemies';
import type { ObstacleClass } from '../content/obstacles';
import type { MaterialId, TileState } from '../content/terrain';
import type { WeaponId } from '../content/weapons';

/** Abstract hit direction relative to the target's hull (SPEC §4.1: never a screen angle). */
export type Arc = ArmorArc | 'top';

export type Owner = 'player' | 'enemy';

/**
 * `blast` is the reactor's detonation (it counts toward the final-blast tally); `trailer` a trailer
 * going up; `hazard` the terrain (a fuel tank going up, the ground giving way under a vehicle).
 */
export type KillCause = 'shot' | 'crushed' | 'blast' | 'trailer' | 'hazard';

/**
 * Things that happened during sim steps, for the renderer (effects, sound) to consume.
 * The sim only appends; whoever renders drains the list.
 */
export type SimEvent =
  | { type: 'fire'; owner: Owner; weapon: WeaponId; x: number; y: number; angle: number; slot?: string }
  /** A point-defense mount (`weapon`) fired at a round in flight from (x0, y0). */
  | { type: 'intercept'; weapon: WeaponId; x0: number; y0: number; x: number; y: number; hit: boolean }
  /** `plasma`: a plasma glob splashing (it leaves a pool, if it didn't land in water). */
  | { type: 'explosion'; x: number; y: number; radius: number; plasma?: boolean }
  /** A laser fired: drawn from (x0, y0) to where it stopped; `hit` = it struck a unit, cover, or mine. */
  | { type: 'beam'; weapon: WeaponId; x0: number; y0: number; x1: number; y1: number; hit: boolean }
  /** A plasma pool burning the Behemoth's treads or its trailer, at the contact point. */
  | { type: 'plasmaBurn'; x: number; y: number }
  | { type: 'impact'; x: number; y: number }
  | { type: 'behemothHit'; arc: Arc; damage: number; x: number; y: number }
  /** A round struck the trailer (its armor first). */
  | { type: 'trailerHit'; damage: number; x: number; y: number }
  /** The trailer is gone: cut loose (now the mine `mine`), or wrecked where it stood. */
  | { type: 'trailerLost'; how: 'jettisoned'; mine: number }
  | { type: 'trailerLost'; how: 'wrecked'; x: number; y: number }
  /** A trailer went up: wrecked while hitched (`mine` null) or a jettisoned one blowing. */
  | { type: 'trailerBlast'; x: number; y: number; radius: number; mine: number | null; kills: number }
  /** A repair drone was shot down, caught in a blast, or went down with its bay. */
  | { type: 'droneLost'; x: number; y: number }
  /** Immobilized: the drones swarm the treads to get it moving again (once a battle). */
  | { type: 'reviveStarted' }
  /** The revive worked: the treads turn again and the last stand is over. */
  | { type: 'revived'; x: number; y: number }
  /** Every drone was lost before the revive was done. */
  | { type: 'reviveFailed' }
  /** A bunker passed a full load forward to a weapon that ran dry. */
  | { type: 'reloaded'; slot: string }
  /** A direct hit on a vehicle's flank or rear, where its armor is thinner (SPEC §7). */
  | { type: 'facingHit'; facing: Exclude<Facing, 'front'>; x: number; y: number }
  | { type: 'enemyDestroyed'; id: number; enemy: EnemyId; x: number; y: number; cause: KillCause }
  /** `mat` is what the tile was: a bridge that fell has already turned into the river under it. */
  | { type: 'tileChanged'; col: number; row: number; state: TileState; mat: MaterialId }
  /** A whole bridge span came down (shot out, or overloaded). */
  | { type: 'bridgeCollapse'; x: number; y: number; tiles: number }
  | { type: 'collision'; obstacle: ObstacleClass; x: number; y: number }
  /** Armor grinding along rock: sparks at the contact point. */
  | { type: 'scrape'; x: number; y: number }
  | { type: 'componentDamaged'; component: string; amount: number }
  | { type: 'componentDestroyed'; component: string }
  /**
   * The magazine cooked off (SPEC §5.1): `damage` is the blast; `vented` = blowout panels sent it
   * up through the deck instead of into the hull.
   */
  | { type: 'cookOff'; damage: number; vented: boolean }
  | { type: 'immobilized' }
  /** The camera has stopped and the last stand begins (SPEC §5.1). */
  | { type: 'lastStand' }
  | { type: 'wave'; wave: number; units: number }
  /** The alert clock's reinforcement wave `wave` is on its way (SPEC §4.2). */
  | { type: 'alert'; wave: number }
  /**
   * A battle mode's target (SPEC §4.4) destroyed, or lost: passed and left behind, or (a convoy
   * hauler) escaped off the far end. `done` once no targets are left either way.
   */
  | { type: 'objective'; what: 'destroyed' | 'lost'; enemy: EnemyId; x: number; y: number; done: boolean }
  /** A convoy's mine layer dropped a mine (world point of the tile's center). */
  | { type: 'mineLaid'; x: number; y: number }
  /** The Behemoth crossed the extraction line: battle won (SPEC §4.4). */
  | { type: 'extracted' }
  | { type: 'reactorCritical'; fuse: number }
  | { type: 'detonation'; x: number; y: number; radius: number; kills: number };
