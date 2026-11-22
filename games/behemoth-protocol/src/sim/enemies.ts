import { ENEMIES, type EnemyId, type Facing } from '../content/enemies';
import { CONCEALMENT, ENEMY } from '../content/tuning';
import { WEAPONS } from '../content/weapons';
import { BEHAVIORS } from './ai';
import { besiege, joinSiege } from './ai/besiege';
import { concealed } from './concealment';
import { allocId, type Enemy } from './entities';
import type { KillCause } from './events';
import { frameRight } from './frame';
import { footprint } from './behemoth';
import { angleDiff, circleIntersectsRect, clamp, rotateToward, type Rect } from './math';
import { objectiveTaken } from './objective';
import { roundSpec } from './projectiles';
import { spawnProjectile } from './weapons';
import type { World } from './world';

/** Shared enemy systems: spawning an instance, movement over terrain, turret, and firing. */

export function spawnEnemy(w: World, id: EnemyId, x: number, y: number): Enemy {
  const def = ENEMIES[id];
  const b = w.behemoth;
  const e: Enemy = {
    id: allocId(w),
    def,
    weapon: def.weapon ? WEAPONS[def.weapon] : null,
    x,
    y,
    vx: Math.min(b.vx, def.maxSpeed),
    vy: 0,
    heading: x < b.x ? 0 : Math.PI,
    reversing: false,
    turret: Math.atan2(b.y - y, b.x - x),
    hp: def.hp,
    cooldown: w.rng.range(...ENEMY.firstCooldown),
    windup: 0,
    salvoLeft: 0,
    salvoTimer: 0,
    alive: true,
    hidden: false,
    exposed: 0,
    objective: false,
    ai: {
      orbitAngle: Math.atan2(y - b.y, x - b.x),
      orbitDir: w.rng.sign(),
      orbitRange: w.rng.range(def.engage.minRange, def.engage.maxRange),
      retargetIn: w.rng.range(2, 5),
      anchor: null,
    },
  };
  if (w.lastStand) joinSiege(e, w);
  e.hidden = concealed(w, e);
  w.enemies.push(e);
  return e;
}

export function destroyEnemy(w: World, e: Enemy, cause: KillCause): void {
  if (!e.alive) return;
  e.alive = false;
  w.stats.kills++;
  // Final-blast kills count toward progression like any other (SPEC §5.1).
  if (cause === 'blast') w.stats.blastKills++;
  w.stats.salvage += e.def.salvage;
  w.events.push({ type: 'enemyDestroyed', id: e.id, enemy: e.def.id, x: e.x, y: e.y, cause });
  if (e.objective) objectiveTaken(w, e);
}

export function stepEnemies(w: World, dt: number): void {
  // Nothing left to fight once the Behemoth is gone; survivors hold where they are.
  if (w.behemoth.destroyed) return;
  for (const e of w.enemies) {
    if (!e.alive) continue;
    moveEnemy(w, e, dt);
    aimAndFire(w, e, dt);
  }
}

function moveEnemy(w: World, e: Enemy, dt: number): void {
  // Fixed positions never move; only their turrets turn.
  if (e.def.maxSpeed <= 0) return;
  const t = w.terrain;
  // In the last stand everyone drops their usual behavior and closes in, except a convoy, which
  // keeps running for the far end.
  const want = (w.lastStand && e.def.behavior !== 'convoy' ? besiege : BEHAVIORS[e.def.behavior])(e, w, dt);

  const mob = e.def.mobility;
  // Terrain slows small units (forest, rubble). Never fully zero, so a unit pushed into a
  // bad tile can still get out.
  const cap = e.def.maxSpeed * Math.max(ENEMY.minTerrainSpeed, t.speedAt(e.x, e.y, mob));
  let dvx = want.vx - e.vx;
  let dvy = want.vy - e.vy;
  const dm = Math.hypot(dvx, dvy);
  const maxDv = e.def.accel * dt;
  if (dm > maxDv) {
    dvx *= maxDv / dm;
    dvy *= maxDv / dm;
  }
  e.vx += dvx;
  e.vy += dvy;
  const m = Math.hypot(e.vx, e.vy);
  if (m > cap) {
    e.vx *= cap / m;
    e.vy *= cap / m;
  }

  // Impassable tiles (intact buildings): slide along whichever axis is free; if forward is
  // blocked, swerve sideways in the orbit direction to get around.
  const r = e.def.radius;
  const hull = stoppedHull(w);
  const nx = e.x + e.vx * dt;
  if (t.speedAt(nx + Math.sign(e.vx) * r, e.y, mob) === 0) {
    e.vx = 0;
    e.vy += e.ai.orbitDir * e.def.accel * dt;
  } else if (hull && entersHull(hull, e, nx, e.y)) {
    e.vx = 0;
  } else {
    e.x = nx;
  }
  const y0 = e.y;
  const ny = e.y + e.vy * dt;
  if (t.speedAt(e.x, ny + Math.sign(e.vy) * r, mob) === 0 || (hull && entersHull(hull, e, e.x, ny))) {
    e.vy = 0;
  } else {
    e.y = ny;
  }
  // Units stay on the field. One arriving from beyond an edge (last-stand flanks) can only move in.
  e.y = clamp(e.y, Math.min(r, y0), Math.max(t.height - r, y0));

  steerHull(w, e, dt);
}

/**
 * Swing the hull toward the unit's course. A vehicle falling back from the Behemoth slowly enough
 * backs up instead, so it keeps its front armor toward it (SPEC §7 "Facing armor").
 */
function steerHull(w: World, e: Enemy, dt: number): void {
  const speed = Math.hypot(e.vx, e.vy);
  if (speed <= 4) return;
  const course = Math.atan2(e.vy, e.vx);
  if (!e.def.facing) {
    e.heading = course;
    return;
  }
  const b = w.behemoth;
  const r = ENEMY.reverse;
  const off = Math.abs(angleDiff(course, Math.atan2(e.y - b.y, e.x - b.x)));
  const slow = speed < e.def.reverseSpeed * (e.reversing ? r.speedSlack : 1);
  e.reversing = slow && off < (e.reversing ? r.stop : r.start);
  e.heading = rotateToward(e.heading, e.reversing ? course + Math.PI : course, ENEMY.hullTurnRate * dt);
}

/**
 * The side of a vehicle a round strikes, from the way it was traveling (dx, dy) and the hull's
 * heading: front or rear within 45° of the hull's axis, a flank between (SPEC §7).
 */
export function hitFacing(e: Enemy, dx: number, dy: number): Facing {
  const off = Math.abs(angleDiff(e.heading, Math.atan2(-dy, -dx)));
  return off <= Math.PI / 4 ? 'front' : off >= (3 * Math.PI) / 4 ? 'rear' : 'flank';
}

/**
 * The Behemoth's footprint once it has ground to a halt in the last stand: a solid obstacle units
 * slide along. (While it's moving, anything it touches is crushed instead.)
 */
function stoppedHull(w: World): Rect | null {
  return w.lastStand && w.behemoth.vx < 0.5 ? footprint(w.behemoth) : null;
}

/** Moving to (x, y) would put the unit against the hull when it isn't already. */
function entersHull(hull: Rect, e: Enemy, x: number, y: number): boolean {
  return circleIntersectsRect(x, y, e.def.radius, hull) && !circleIntersectsRect(e.x, e.y, e.def.radius, hull);
}

function aimAndFire(w: World, e: Enemy, dt: number): void {
  if (!e.weapon) return;
  const b = w.behemoth;
  const spec = roundSpec(e.weapon);
  const d = Math.hypot(b.x - e.x, b.y - e.y);
  // Lead the target by the round's flight time (missiles home, so they just point at it).
  const lead = spec.kind === 'missile' ? 0 : d / spec.speed;
  const ax = b.x + b.vx * lead;
  const ay = b.y + b.vy * lead;
  const want = Math.atan2(ay - e.y, ax - e.x);
  e.turret = rotateToward(e.turret, want, ((e.def.turretDegPerSec * Math.PI) / 180) * dt);

  e.cooldown -= dt;
  // The Behemoth has extracted: the battle is over, and so is any shot being lined up.
  if (w.extractedAt !== null) {
    e.windup = 0;
    e.salvoLeft = 0;
    return;
  }
  // Fairness: never fire from off-screen. Leaving the frame mid-aim cancels the shot (and the
  // rest of a volley).
  const margin = e.def.radius + 4;
  const onScreen =
    e.x >= w.frame.left + margin && e.x <= frameRight(w.frame) - margin && e.y >= 0 && e.y <= w.terrain.height;
  if (!onScreen) {
    e.windup = 0;
    e.salvoLeft = 0;
    return;
  }

  if (e.salvoLeft > 0) {
    e.salvoTimer -= dt;
    if (e.salvoTimer <= 0) fireRound(w, e);
    return;
  }

  if (e.windup > 0) {
    // Telegraph in progress: the turret keeps tracking, then the shot (or volley) goes off.
    e.windup -= dt;
    if (e.windup > 0) return;
    e.windup = 0;
    e.cooldown = e.weapon.reload * w.rng.range(...ENEMY.reloadJitter);
    if (blocked(w, e)) return;
    e.salvoLeft = e.weapon.salvo?.count ?? 1;
    fireRound(w, e);
    return;
  }

  if (e.cooldown > 0 || d > e.def.fireRange) return;
  if (Math.abs(angleDiff(e.turret, want)) > ENEMY.aimTolerance) return;
  if (blocked(w, e)) return;
  e.windup = e.def.aimTime;
}

/** Direct fire needs a clear line to the Behemoth; homing missiles can fly around cover. */
function blocked(w: World, e: Enemy): boolean {
  if (e.weapon?.projectile.kind === 'missile') return false;
  return w.terrain.lineBlocked(e.x, e.y, w.behemoth.x, w.behemoth.y);
}

function fireRound(w: World, e: Enemy): void {
  if (!e.weapon) return;
  const mx = e.x + Math.cos(e.turret) * e.weapon.muzzle;
  const my = e.y + Math.sin(e.turret) * e.weapon.muzzle;
  // Out of a building's windows: the round ignores the walls of the tile the unit stands in.
  const ts = w.terrain.tileSize;
  const col = Math.floor(e.x / ts);
  const row = Math.floor(e.y / ts);
  spawnProjectile(w, 'enemy', e.weapon, mx, my, e.turret, w.terrain.blocksShot(col, row) ? { shelter: { col, row } } : {});
  e.salvoLeft--;
  e.exposed = CONCEALMENT.afterFire;
  e.salvoTimer = e.weapon.salvo?.interval ?? 0;
}
