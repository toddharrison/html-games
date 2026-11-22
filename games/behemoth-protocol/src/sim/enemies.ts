import { ENEMIES, type EnemyId, type EnemyTurretDef, type Facing, type GunTarget } from '../content/enemies';
import { CONCEALMENT, ENEMY } from '../content/tuning';
import { WEAPONS, type WeaponDef } from '../content/weapons';
import { BEHAVIORS } from './ai';
import { besiege, joinSiege } from './ai/besiege';
import { hiddenNow } from './concealment';
import { enemyCanSee, hoverScale } from './conditions';
import { allocId, type Enemy, type EnemyGun } from './entities';
import type { KillCause } from './events';
import { frameRight } from './frame';
import { footprint, hitched } from './behemoth';
import { angleDiff, circleIntersectsRect, clamp, rotateToward, type Rect } from './math';
import { objectiveTaken } from './objective';
import { roundSpec } from './projectiles';
import { spawnProjectile } from './weapons';
import type { World } from './world';
import { paySalvage } from './salvage';

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
    guns: (def.turrets ?? []).map((t) => ({
      def: t,
      weapon: WEAPONS[t.weapon],
      turret: Math.atan2(b.y - y, b.x - x),
      cooldown: w.rng.range(...ENEMY.firstCooldown),
      windup: 0,
      salvoLeft: 0,
      salvoTimer: 0,
    })),
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
  e.hidden = hiddenNow(w, e);
  w.enemies.push(e);
  return e;
}

export function destroyEnemy(w: World, e: Enemy, cause: KillCause): void {
  if (!e.alive) return;
  e.alive = false;
  w.stats.kills++;
  // Final-blast kills count toward progression like any other (SPEC §5.1).
  if (cause === 'blast') {
    w.stats.blastKills++;
    const best = w.stats.blastBest;
    if (!best || e.def.threat > ENEMIES[best].threat) w.stats.blastBest = e.def.id;
  }
  w.events.push({ type: 'enemyDestroyed', id: e.id, enemy: e.def.id, x: e.x, y: e.y, cause });
  paySalvage(w, e.x, e.y, e.def.salvage, 'unit');
  if (e.objective) objectiveTaken(w, e);
}

export function stepEnemies(w: World, dt: number): void {
  // Nothing left to fight once the Behemoth is gone; survivors hold where they are.
  if (w.behemoth.destroyed) return;
  for (const e of w.enemies) {
    if (!e.alive) continue;
    moveEnemy(w, e, dt);
    aimAndFire(w, e, dt);
    if (e.ai.ramIn) e.ai.ramIn = Math.max(0, e.ai.ramIn - dt);
    // A mini-boss is called out the first time it comes into view.
    if (e.def.callout && !e.ai.sighted && !e.hidden && e.x <= frameRight(w.frame) && e.x >= w.frame.left) {
      e.ai.sighted = true;
      w.events.push({ type: 'sighted', enemy: e.def.id, x: e.x, y: e.y });
    }
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
  // A storm's squalls knock hovercraft about (SPEC §4.6).
  const cap = e.def.maxSpeed * Math.max(ENEMY.minTerrainSpeed, t.speedAt(e.x, e.y, mob)) * (mob === 'hover' ? hoverScale(w) : 1);
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

/** How a gun is laid: its traverse, reach, telegraph, pivot, and what it shoots at. */
type GunMount = Omit<EnemyTurretDef, 'weapon'>;

const CENTER = { x: 0, y: 0 };

/** Every gun on the unit: the main one (on its center), then any extra turrets. */
function aimAndFire(w: World, e: Enemy, dt: number): void {
  const d = e.def;
  aimGun(w, e, e, { turretDegPerSec: d.turretDegPerSec, fireRange: d.fireRange, aimTime: d.aimTime, pivot: CENTER, target: 'behemoth' }, dt);
  for (const g of e.guns) aimGun(w, e, g, g.def, dt);
}

/** Where a gun's turret turns, in the world, for a hull at (x, y) facing `heading`. */
export function gunPivot(e: { x: number; y: number; heading: number }, pivot: { x: number; y: number }): { x: number; y: number } {
  const c = Math.cos(e.heading);
  const s = Math.sin(e.heading);
  return { x: e.x + pivot.x * c - pivot.y * s, y: e.y + pivot.x * s + pivot.y * c };
}

/**
 * What a gun shoots at, and how it's moving. A 'support' gun goes for a repair drone that's out,
 * then the trailer, then the hull (SPEC §7 siege tank).
 */
export function gunTarget(w: World, at: { x: number; y: number }, target: GunTarget): { x: number; y: number; vx: number; vy: number } {
  const b = w.behemoth;
  if (target === 'support') {
    let best: { x: number; y: number } | null = null;
    for (const dr of w.drones) {
      if (dr.alive && (!best || Math.hypot(dr.x - at.x, dr.y - at.y) < Math.hypot(best.x - at.x, best.y - at.y))) best = dr;
    }
    if (best) return { x: best.x, y: best.y, vx: b.vx, vy: b.vy };
    const t = hitched(b);
    if (t) return { x: t.x, y: t.y, vx: b.vx, vy: b.vy };
  }
  return { x: b.x, y: b.y, vx: b.vx, vy: b.vy };
}

function aimGun(w: World, e: Enemy, g: EnemyGun, m: GunMount, dt: number): void {
  if (!g.weapon) return;
  const weapon = g.weapon;
  const spec = roundSpec(weapon);
  const at = gunPivot(e, m.pivot);
  const tgt = gunTarget(w, at, m.target);
  const d = Math.hypot(tgt.x - at.x, tgt.y - at.y);
  // Lead the target by the round's flight time (missiles home, so they just point at it; a
  // battery lays its guns on the zone it will mark).
  const lead = weapon.barrage ? barrageLead(weapon) : spec.kind === 'missile' ? 0 : d / spec.speed;
  const want = Math.atan2(tgt.y + tgt.vy * lead - at.y, tgt.x + tgt.vx * lead - at.x);
  g.turret = rotateToward(g.turret, want, ((m.turretDegPerSec * Math.PI) / 180) * dt);

  g.cooldown -= dt;
  // The Behemoth has extracted: the battle is over, and so is any shot being lined up.
  if (w.extractedAt !== null) {
    g.windup = 0;
    g.salvoLeft = 0;
    return;
  }
  // Fairness: never fire from off-screen. Leaving the frame mid-aim cancels the shot (and the
  // rest of a volley).
  const margin = e.def.radius + 4;
  const onScreen =
    e.x >= w.frame.left + margin && e.x <= frameRight(w.frame) - margin && e.y >= 0 && e.y <= w.terrain.height;
  if (!onScreen) {
    g.windup = 0;
    g.salvoLeft = 0;
    return;
  }

  if (g.salvoLeft > 0) {
    g.salvoTimer -= dt;
    if (g.salvoTimer <= 0) fireRound(w, e, g, at);
    return;
  }

  if (g.windup > 0) {
    // A lock-on needs its line of sight the whole way (SPEC §7 heavy weapons team).
    if (e.def.lockOn && g === e && blocked(w, weapon, at, tgt)) {
      breakLock(w, e);
      return;
    }
    // Telegraph in progress: the turret keeps tracking, then the shot (or volley) goes off.
    g.windup -= dt;
    if (g.windup > 0) return;
    g.windup = 0;
    g.cooldown = weapon.reload * w.rng.range(...ENEMY.reloadJitter);
    if (blocked(w, weapon, at, tgt)) return;
    if (weapon.barrage && !markBarrage(w, g, at)) return;
    g.salvoLeft = weapon.salvo?.count ?? 1;
    fireRound(w, e, g, at);
    return;
  }

  if (g.cooldown > 0 || d > m.fireRange) return;
  // Lobbed fire can't be laid on anything inside its minimum range.
  if (spec.kind === 'shell' && spec.lobbed && d < spec.minRange) return;
  if (Math.abs(angleDiff(g.turret, want)) > ENEMY.aimTolerance) return;
  if (blocked(w, weapon, at, tgt)) return;
  // In the dark or a squall the enemy can't line up on what it can't see (SPEC §4.6).
  if (!enemyCanSee(w, e)) return;
  g.windup = m.aimTime;
  if (e.def.lockOn && g === e) w.events.push({ type: 'lockOn', id: e.id, x: e.x, y: e.y, time: m.aimTime });
}

/**
 * A lock-on thrown off (SPEC §7 heavy weapons team): the unit was hit, or lost sight of the hull,
 * while painting it. Nothing fires; it tries again after `relock`.
 */
export function breakLock(w: World, e: Enemy): void {
  if (!e.def.lockOn || e.windup <= 0) return;
  e.windup = 0;
  e.cooldown = Math.max(e.cooldown, e.def.lockOn.relock);
  w.events.push({ type: 'lockBroken', id: e.id, x: e.x, y: e.y });
}

/**
 * Direct fire needs a clear line to its target; homing missiles fly around cover and lobbed shells
 * over it. A guided missile (`sight`) needs the line too: its launcher steers it in.
 */
function blocked(w: World, weapon: WeaponDef, from: { x: number; y: number }, to: { x: number; y: number }): boolean {
  const spec = weapon.projectile;
  if ((spec.kind === 'missile' && !spec.sight) || (spec.kind === 'shell' && spec.lobbed)) return false;
  return w.terrain.lineBlocked(from.x, from.y, to.x, to.y);
}

/**
 * How far ahead a battery lays its zone (s): where the Behemoth will be, on its present course and
 * speed, when the middle of the volley lands.
 */
export function barrageLead(weapon: WeaponDef): number {
  const salvo = weapon.salvo ?? { count: 1, interval: 0 };
  return (weapon.barrage?.flight ?? 0) + ((salvo.count - 1) * salvo.interval) / 2;
}

/**
 * Area fire (SPEC §7 artillery): fixes the target zone where the Behemoth is headed and marks it on
 * the ground for as long as the volley is on its way. The zone stays inside the guns' range band.
 * False if there's nowhere in range to lay it (the Behemoth has closed inside the minimum range).
 */
function markBarrage(w: World, g: EnemyGun, at: { x: number; y: number }): boolean {
  const weapon = g.weapon!;
  const bar = weapon.barrage!;
  const spec = roundSpec(weapon);
  if (spec.kind !== 'shell') return false;
  const b = w.behemoth;
  const lead = barrageLead(weapon);
  let x = b.x + b.vx * lead;
  let y = clamp(b.y + b.vy * lead, 0, w.terrain.height);
  const d = Math.hypot(x - at.x, y - at.y);
  if (d < spec.minRange) return false;
  if (d > spec.maxRange) {
    x = at.x + ((x - at.x) * spec.maxRange) / d;
    y = at.y + ((y - at.y) * spec.maxRange) / d;
  }
  g.zone = { x, y, radius: bar.radius };
  const salvo = weapon.salvo ?? { count: 1, interval: 0 };
  const now = w.time;
  w.barrages.push({ x, y, radius: bar.radius, from: now, lands: now + bar.flight, until: now + bar.flight + (salvo.count - 1) * salvo.interval });
  w.events.push({ type: 'barrage', x, y, radius: bar.radius, flight: bar.flight });
  return true;
}

function fireRound(w: World, e: Enemy, g: EnemyGun, at: { x: number; y: number }): void {
  if (!g.weapon) return;
  const mx = at.x + Math.cos(g.turret) * g.weapon.muzzle;
  const my = at.y + Math.sin(g.turret) * g.weapon.muzzle;
  const zone = g.weapon.barrage ? g.zone : undefined;
  if (zone) {
    // Somewhere in the zone, landing `flight` seconds from now.
    const a = w.rng.range(0, Math.PI * 2);
    const r = zone.radius * Math.sqrt(w.rng.next());
    const tx = zone.x + Math.cos(a) * r;
    const ty = zone.y + Math.sin(a) * r;
    const reach = Math.max(1, Math.hypot(tx - mx, ty - my));
    spawnProjectile(w, 'enemy', g.weapon, mx, my, Math.atan2(ty - my, tx - mx), { fuse: reach, speed: reach / g.weapon.barrage!.flight, tx, ty });
  } else {
    // Out of a building's windows: the round ignores the walls of the tile the unit stands in.
    const ts = w.terrain.tileSize;
    const col = Math.floor(e.x / ts);
    const row = Math.floor(e.y / ts);
    spawnProjectile(w, 'enemy', g.weapon, mx, my, g.turret, w.terrain.blocksShot(col, row) ? { shelter: { col, row } } : {});
  }
  g.salvoLeft--;
  e.exposed = CONCEALMENT.afterFire;
  g.salvoTimer = g.weapon.salvo?.interval ?? 0;
}
