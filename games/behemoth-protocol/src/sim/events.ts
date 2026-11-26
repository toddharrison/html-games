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
/** `friendly`: the enemy's own artillery (SPEC §7). */
export type KillCause = 'shot' | 'crushed' | 'blast' | 'trailer' | 'hazard' | 'friendly';

/** Where banked salvage came from: a unit destroyed, a structure knocked down, or a mode's target (its objective share). */
export type SalvageSource = 'unit' | 'tile' | 'objective';

/**
 * Things that happened during sim steps, for the renderer (effects, sound) to consume.
 * The sim only appends; whoever renders drains the list.
 */
export type SimEvent =
  | { type: 'fire'; owner: Owner; weapon: WeaponId; x: number; y: number; angle: number; slot?: string }
  /** A point-defense mount (`weapon`) fired at a round in flight from (x0, y0). */
  | { type: 'intercept'; weapon: WeaponId; x0: number; y0: number; x: number; y: number; hit: boolean }
  /** `plasma`: a plasma glob splashing (it leaves a pool, if it didn't land in water); `fire`: a thermobaric fireball. */
  | { type: 'explosion'; x: number; y: number; radius: number; plasma?: boolean; fire?: boolean }
  /**
   * A laser fired: drawn from (x0, y0) to where it stopped; `hit` = it struck a unit, cover, or
   * mine. `slot`: the player hardpoint that fired it (the renderer pins the beam to its barrel).
   */
  | { type: 'beam'; weapon: WeaponId; x0: number; y0: number; x1: number; y1: number; hit: boolean; slot: string }
  /**
   * A flame from (x, y) along `angle`, reaching `reach`, `cone` radians either side (SPEC §6
   * flamethrower). `owner`: an enemy's is the kind that burns the hull, and is drawn hotter.
   */
  | { type: 'flame'; owner: Owner; x: number; y: number; angle: number; reach: number; cone: number; slot: string }
  /** A railgun or coilgun slug from (x0, y0) to where it stopped; `hits`: each unit and wall it went through. */
  | { type: 'rail'; weapon: WeaponId; x0: number; y0: number; x1: number; y1: number; hits: { x: number; y: number }[] }
  /** Lightning from the muzzle through each point in turn (units struck, or cover); `hit`: it struck something. */
  | { type: 'arc'; weapon: WeaponId; points: { x: number; y: number }[]; hit: boolean }
  /** An EMP pulse from (x, y) out to `radius`; `caught`: the vehicles it knocked out; `mines`: the mines it killed. */
  | { type: 'emp'; x: number; y: number; radius: number; caught: number; mines: number }
  /** A pulse killed a mine at (x, y) without setting it off: one in the ground, or one in a flinger's throw. */
  | { type: 'mineFried'; x: number; y: number }
  /** A plasma pool burning the Behemoth's treads or its trailer, at the contact point. */
  | { type: 'plasmaBurn'; x: number; y: number }
  /**
   * A round hit the ground, cover, a drone, or a unit. `armor`: a bullet struck a vehicle's
   * armored face (the front glances off; a flank or rear hit also raises `facingHit`).
   */
  | { type: 'impact'; x: number; y: number; armor?: Facing }
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
  /** An armored train (SPEC §7.3) pulls out of its station as the battle opens; `gun`: it has a railway gun. */
  | { type: 'trainStart'; x: number; y: number; engines: number; gun: boolean }
  /** Vehicles stranded behind a wreck (`cars` of them) are abandoned by their crews; the scuttling charges are counting down. */
  | { type: 'trainAbandoned'; x: number; y: number; cars: number }
  /** A scuttling charge went off under an abandoned vehicle. */
  | { type: 'trainScuttle'; x: number; y: number }
  /** A vehicle destroyed on the rails wrecked there and parted the chain; `behind` vehicles are piling into it. */
  | { type: 'trainBroken'; x: number; y: number; heading: number; behind: number }
  /**
   * A vehicle left the rails, piling into a wreck or a break ahead of it. `first`: the train itself
   * ran onto a break in the line (this one starts the pile); `sunk`: into a river.
   */
  | { type: 'trainDerail'; x: number; y: number; heading: number; first: boolean; sunk: boolean }
  /** An attack train has started up the line from behind the frame (`TRAIN.raid`), on `track` (0 the armored train's, 1 the second). */
  | { type: 'trainRaid'; x: number; y: number; track: 0 | 1; cars: number }
  /** A Gauntlet's last attack train has been destroyed or has got away. */
  | { type: 'raidsOver'; x: number; y: number }
  /** A train's front has gone into a crossover's tunnel (`Terrain.underground`): it comes out on the other side of the field. `raid`: an attack train's. */
  | { type: 'trainTunnel'; x: number; y: number; raid: boolean }
  /** Fire reached an oil spill (`sim/spills.ts`): the whole slick is alight. */
  | { type: 'oilIgnite'; x: number; y: number; radius: number }
  /** A shield car's plate stopped one of the Behemoth's shots (`EnemyDef.shield`). */
  | { type: 'shieldBlock'; x: number; y: number }
  /**
   * A train's piece under way ran into the Behemoth on the track ahead of it (SPEC-armored-train.md §T10).
   * `raid`: an attack train's. `blast`: it was led by an engine, which went up against the hull (this radius).
   */
  | { type: 'trainStrike'; x: number; y: number; raid: boolean; blast: number | null }
  /** A train's engine plowed through a wreck across its track that was no part of its own train (`TRAIN.plow`): the wreck is swept away. */
  | { type: 'trainPlow'; x: number; y: number; heading: number; raid: boolean }
  /** A masked unit's cover came off (`EnemyDef.masked`, a train's ambush car), toward `side` (the sign of sim y) of it. */
  | { type: 'unmask'; id: number; x: number; y: number; heading: number; side: number }
  /** An enemy flamethrower's stream is on the hull at (x, y). */
  | { type: 'hullBurn'; x: number; y: number }
  /** A train's mine flinger lobbed a mine from (x0, y0) onto (x, y); it lands in `flight` s. */
  | { type: 'mineFlung'; x0: number; y0: number; x: number; y: number; flight: number }
  /** The train is stopped for good (no engine left running, or derailed): the Intercept is taken. */
  | { type: 'trainStopped'; x: number; y: number; derailed: boolean }
  /**
   * Salvage banked (SPEC §8.1): a kill, a structure knocked down, or a battle mode's target's share
   * of the objective bonus, at the world point it came from (the renderer flies it to the hull).
   */
  | { type: 'salvage'; x: number; y: number; amount: number; source: SalvageSource }
  /** `mat` is what the tile was: a bridge that fell has already turned into the river under it. */
  | { type: 'tileChanged'; col: number; row: number; state: TileState; mat: MaterialId }
  /** A whole bridge span came down (shot out, or overloaded). */
  | { type: 'bridgeCollapse'; x: number; y: number; tiles: number; mat: MaterialId }
  /** The machine drove into something; `trailer` when it was the trailer in tow that met it. */
  | { type: 'collision'; obstacle: ObstacleClass; x: number; y: number; trailer?: true }
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
   * hauler) escaped off the far end. `done` once no targets are left either way. `stranded`: a
   * train's engines (this many) left behind a wreck, which count as destroyed (SPEC §7.3).
   */
  | { type: 'objective'; what: 'destroyed' | 'lost'; enemy: EnemyId; x: number; y: number; done: boolean; stranded?: number }
  /** A convoy's mine layer dropped a mine, or a train's flung mine went live (world point of the tile's center). */
  | { type: 'mineLaid'; x: number; y: number }
  /** A unit started painting the hull for a guided missile (`EnemyDef.lockOn`); it fires in `time` s unless the lock breaks. */
  | { type: 'lockOn'; id: number; x: number; y: number; time: number }
  /** A lock-on was thrown off (the unit was hit, or lost sight of the hull). */
  | { type: 'lockBroken'; id: number; x: number; y: number }
  /** A trapdoor team's lid lifting (SPEC §7.4): the telegraph before it fires. */
  | { type: 'lidOpen'; id: number; x: number; y: number }
  /** A trapdoor team pulling its lid down at fire coming its way (SPEC §7.4). */
  | { type: 'lidDuck'; id: number; x: number; y: number }
  /** The Behemoth came within range of the Chase convoy for the first time: it scatters (`MODES.chase.convoy.alarm`). */
  | { type: 'convoyAlarm'; x: number; y: number }
  /** A bomb truck started its run at the Behemoth (SPEC §7.4). */
  | { type: 'charge'; id: number; x: number; y: number }
  /** A mini-boss came into view for the first time (`EnemyDef.callout`). */
  | { type: 'sighted'; enemy: EnemyId; x: number; y: number }
  /** A battery's volley went up: its target zone is marked, the first round lands in `flight` s (SPEC §7). */
  | { type: 'barrage'; x: number; y: number; radius: number; flight: number }
  /** The Behemoth crossed the extraction line: battle won (SPEC §4.4). */
  /** A storm's squall building (rising) or dying away (SPEC §4.6). */
  | { type: 'squall'; rising: boolean }
  /** Lightning will strike at (x, y) in `time` s (SPEC §4.6 thunderstorm): the warning glow. */
  | { type: 'lightningMark'; x: number; y: number; time: number }
  /** Lightning struck: down onto the first point, then leaping through the rest; `hit`: it struck a unit (not just the ground). */
  | { type: 'lightning'; points: { x: number; y: number }[]; hit: boolean }
  | { type: 'extracted' }
  | { type: 'reactorCritical'; fuse: number }
  | { type: 'detonation'; x: number; y: number; radius: number; kills: number };
