import { BARRAGE, CONCEALMENT } from '../content/tuning';
import type { BeamSpec, ProjectileSpec, RoundSpec, ShellSpec, TargetClass, WeaponDef } from '../content/weapons';
import { applyHit, footprint, hitArc, hitched, inTrailer } from './behemoth';
import type { Enemy, Projectile } from './entities';
import type { KillCause } from './events';
import { damageDrone, droneAt } from './drones';
import { destroyEnemy, hitFacing } from './enemies';
import { clamp, pointInRect, rotateToward } from './math';
import { spawnPool } from './pools';
import { hitTrailer, mineAt, triggerMine } from './trailer';
import type { World } from './world';

/**
 * Projectile flight and detonation. Kinds (SPEC §13.1 reusable pieces):
 * - shell: flies straight, bursts at the aim distance or on the first thing it hits; a lobbed
 *   shell arcs over everything and bursts only at the aim distance (indirect fire)
 * - bullet: flies straight, hits the first unit or cover in its path, fizzles at max range
 * - missile: homes on its locked target (or flies to the aim point) and bursts on contact
 * Beams (lasers) don't fly: `fireBeam` resolves them the moment they fire.
 */

/** Max distance moved per collision substep, so fast rounds can't tunnel past small targets. */
const SUBSTEP = 4;
/** A missile without a live target bursts this close to its destination. */
const MISSILE_ARRIVE = 5;

/** The projectile a weapon fires. Point defense and lasers fire none, so this throws for them. */
export function roundSpec(weapon: WeaponDef): ProjectileSpec {
  const spec = weapon.projectile;
  if (spec.kind === 'intercept' || spec.kind === 'beam') throw new Error(`${weapon.id} fires no projectiles`);
  return spec;
}

/** What a weapon fires that does damage: a projectile or a beam. Throws for point defense. */
export function shotSpec(weapon: WeaponDef): RoundSpec {
  const spec = weapon.projectile;
  if (spec.kind === 'intercept') throw new Error(`${weapon.id} fires no rounds`);
  return spec;
}

export function roundRange(spec: RoundSpec): number {
  return spec.kind === 'shell' ? spec.maxRange : spec.range;
}

/** How hard a round hits a target class (SPEC §6 "best against"; 1 = normal). */
export function damageMultiplier(spec: RoundSpec, cls: TargetClass): number {
  return spec.vs?.[cls] ?? 1;
}

/** How finely a beam is traced for cover and mines. */
const BEAM_STEP = 2;
/** A beam hits a unit whose body comes this close to its line. */
const BEAM_WIDTH = 1;

/**
 * A player laser (SPEC §6): hits the first unit, armed mine, or cover along its line, out to its
 * range, all at once. Returns where the beam ended and whether it struck something.
 */
export function fireBeam(w: World, weapon: WeaponDef, x: number, y: number, angle: number): { x: number; y: number; hit: boolean } {
  const spec = weapon.projectile as BeamSpec;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);

  // The nearest unit the line passes through.
  let reach = spec.range;
  let target: Enemy | null = null;
  for (const e of w.enemies) {
    if (!e.alive) continue;
    const along = (e.x - x) * dx + (e.y - y) * dy;
    const across = Math.abs(-(e.x - x) * dy + (e.y - y) * dx);
    const r = e.def.radius + BEAM_WIDTH;
    if (across > r) continue;
    const t = Math.max(0, along - Math.sqrt(r * r - across * across));
    if (t < reach && along > 0) {
      reach = t;
      target = e;
    }
  }

  // Cover or a mine before it stops the beam.
  for (let d = 0; d < reach; d += BEAM_STEP) {
    const px = x + dx * d;
    const py = y + dy * d;
    if (py < -8 || py > w.terrain.height + 8) return { x: px, y: py, hit: false };
    const mine = mineAt(w, px, py);
    if (mine) {
      triggerMine(mine);
      return { x: px, y: py, hit: true };
    }
    if (w.terrain.blocksShotAt(px, py)) {
      const ts = w.terrain.tileSize;
      w.terrain.damage(Math.floor(px / ts), Math.floor(py / ts), spec.tileDamage, w.events);
      return { x: px, y: py, hit: true };
    }
  }
  const end = { x: x + dx * reach, y: y + dy * reach };
  if (!target) return { ...end, hit: false };
  damageEnemy(w, target, spec, spec.damage, { dx, dy, ...end });
  return { ...end, hit: true };
}

export function stepProjectiles(w: World, dt: number): void {
  for (const p of w.projectiles) {
    if (!p.alive) continue;
    if (p.kind === 'missile') steerMissile(w, p, dt);
    const speed = Math.hypot(p.vx, p.vy);
    const n = Math.max(1, Math.ceil((speed * dt) / SUBSTEP));
    const sdt = dt / n;
    for (let i = 0; i < n && p.alive; i++) {
      p.x += p.vx * sdt;
      p.y += p.vy * sdt;
      p.traveled += speed * sdt;
      if (p.owner === 'player') stepPlayerRound(w, p);
      else stepEnemyRound(w, p);
    }
  }
}

function steerMissile(w: World, p: Projectile, dt: number): void {
  const spec = roundSpec(p.weapon);
  if (spec.kind !== 'missile') return;
  if (p.owner === 'player') {
    const t = p.targetId === null ? undefined : w.enemies.find((e) => e.id === p.targetId && e.alive);
    if (t) {
      p.tx = t.x;
      p.ty = t.y;
    } else {
      p.targetId = null;
    }
  } else if (!w.behemoth.destroyed) {
    p.tx = w.behemoth.x;
    p.ty = w.behemoth.y;
  }
  const heading = rotateToward(Math.atan2(p.vy, p.vx), Math.atan2(p.ty - p.y, p.tx - p.x), spec.turnRate * dt);
  p.vx = Math.cos(heading) * spec.speed;
  p.vy = Math.sin(heading) * spec.speed;
}

/** True if the round has gone its full distance (or, for a missile, reached an empty destination). */
function spent(p: Projectile): boolean {
  if (p.traveled >= p.fuse) return true;
  return p.kind === 'missile' && p.targetId === null && Math.hypot(p.tx - p.x, p.ty - p.y) <= MISSILE_ARRIVE;
}

function stepPlayerRound(w: World, p: Projectile): void {
  const spec = roundSpec(p.weapon);
  if (spec.kind === 'shell' && spec.lobbed) {
    if (spent(p) || outOfField(w, p)) detonate(w, p);
    return;
  }
  for (const e of w.enemies) {
    if (e.alive && Math.hypot(e.x - p.x, e.y - p.y) <= e.def.radius + 1.5) {
      if (spec.kind === 'bullet') {
        p.alive = false;
        const armor = e.def.facing ? hitFacing(e, p.vx, p.vy) : undefined;
        damageEnemy(w, e, spec, spec.damage, direct(p));
        w.events.push({ type: 'impact', x: p.x, y: p.y, armor });
      } else {
        detonate(w, p, e);
      }
      return;
    }
  }
  // An armed mine (a jettisoned trailer) goes up when a round hits it.
  const mine = mineAt(w, p.x, p.y);
  if (mine) {
    triggerMine(mine);
    if (spec.kind === 'bullet') {
      p.alive = false;
      w.events.push({ type: 'impact', x: p.x, y: p.y });
    } else {
      detonate(w, p);
    }
    return;
  }
  if (w.terrain.blocksShotAt(p.x, p.y)) {
    if (spec.kind === 'bullet') hitCover(w, p, spec.tileDamage);
    else detonate(w, p);
    return;
  }
  if (spent(p) || outOfField(w, p)) {
    if (spec.kind === 'bullet') p.alive = false;
    else detonate(w, p);
  }
}

function stepEnemyRound(w: World, p: Projectile): void {
  const b = w.behemoth;
  const spec = roundSpec(p.weapon);
  // Artillery arcs over everything and comes down where it was laid.
  if (spec.kind === 'shell' && spec.lobbed) {
    if (spent(p)) shellBurst(w, p, spec);
    else if (outOfField(w, p)) p.alive = false;
    return;
  }
  // A repair drone in the way takes the round (they hover over the tread pods).
  const drone = droneAt(w, p.x, p.y);
  if (drone) {
    damageDrone(w, drone, spec.damage);
    p.alive = false;
    w.events.push({ type: 'impact', x: p.x, y: p.y });
    return;
  }
  // The trailer is a target of its own: a round that reaches it first (fire from behind) hits it.
  const t = b.destroyed ? null : hitched(b);
  if (t && inTrailer(t, p.x, p.y)) {
    hitTrailer(b, t, spec.damage, w.rng, w.events, p.x, p.y);
    p.alive = false;
    if (spec.kind !== 'bullet' && spec.blastRadius > 0) w.events.push({ type: 'explosion', x: p.x, y: p.y, radius: spec.blastRadius });
    return;
  }
  if (!b.destroyed && pointInRect(p.x, p.y, footprint(b))) {
    applyHit(b, hitArc(b, -p.vx, -p.vy, p.x, p.y), spec.damage, w.rng, w.events, p.x, p.y, spec.strike);
    p.alive = false;
    if (spec.kind !== 'bullet' && spec.blastRadius > 0) w.events.push({ type: 'explosion', x: p.x, y: p.y, radius: spec.blastRadius });
    return;
  }
  const mine = mineAt(w, p.x, p.y);
  if (mine) {
    triggerMine(mine);
    w.events.push({ type: 'impact', x: p.x, y: p.y });
    p.alive = false;
    return;
  }
  if (w.terrain.blocksShotAt(p.x, p.y) && !inShelter(w, p)) {
    hitCover(w, p, spec.tileDamage, false);
    return;
  }
  if (spent(p) || outOfField(w, p)) {
    w.events.push({ type: 'impact', x: p.x, y: p.y });
    p.alive = false;
  }
}

/**
 * An enemy shell coming down (SPEC §7 artillery): the burst catches the Behemoth (on the armor
 * facing the way the shell came, falling off over its radius), the trailer, the enemy's own units
 * (at `BARRAGE.friendlyFire`), mines, and the ground.
 */
function shellBurst(w: World, p: Projectile, spec: ShellSpec): void {
  p.alive = false;
  const r = spec.blastRadius;
  const b = w.behemoth;
  w.events.push({ type: 'explosion', x: p.x, y: p.y, radius: r });
  if (!b.destroyed) {
    const box = footprint(b);
    const at = { x: clamp(p.x, box.x0, box.x1), y: clamp(p.y, box.y0, box.y1) };
    const d = Math.hypot(p.x - at.x, p.y - at.y);
    if (d <= r) {
      applyHit(b, hitArc(b, -p.vx, -p.vy, at.x, at.y), spec.damage * (1 - (0.5 * d) / r), w.rng, w.events, at.x, at.y, spec.strike);
    }
    const t = hitched(b);
    const dt = t ? Math.max(0, Math.hypot(p.x - t.x, p.y - t.y) - t.def.width / 2) : Infinity;
    if (t && dt <= r) hitTrailer(b, t, spec.damage * (1 - (0.5 * dt) / r), w.rng, w.events, p.x, p.y);
  }
  for (const m of w.mines) if (Math.hypot(m.x - p.x, m.y - p.y) <= r + m.radius) triggerMine(m);
  for (const e of w.enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y) - e.def.radius;
    if (d < r) damageEnemy(w, e, spec, spec.damage * BARRAGE.friendlyFire * (1 - (0.5 * Math.max(0, d)) / r), 'top', 'friendly');
  }
  burstTerrain(w, p.x, p.y, r, spec.tileDamage, false);
}

/** A burst's damage to the tiles around it, falling off to half at its edge. `credit`: knocked-down tiles pay salvage. */
function burstTerrain(w: World, x: number, y: number, r: number, tileDamage: number, credit: boolean): void {
  const ts = w.terrain.tileSize;
  const reach = r + ts * 0.5;
  for (let c = Math.floor((x - r) / ts); c <= Math.floor((x + r) / ts); c++) {
    for (let row = Math.floor((y - r) / ts); row <= Math.floor((y + r) / ts); row++) {
      const d = Math.hypot((c + 0.5) * ts - x, (row + 0.5) * ts - y);
      if (d < reach) w.terrain.damage(c, row, tileDamage * (1 - 0.5 * (d / reach)), w.events, credit);
    }
  }
}

/** A round fired out of a building passes through that building's own walls. */
function inShelter(w: World, p: Projectile): boolean {
  if (!p.shelter) return false;
  const ts = w.terrain.tileSize;
  return Math.floor(p.x / ts) === p.shelter.col && Math.floor(p.y / ts) === p.shelter.row;
}

/** `credit`: knocking the tile down pays salvage (the player's rounds, not the enemy's). */
function hitCover(w: World, p: Projectile, tileDamage: number, credit = true): void {
  const ts = w.terrain.tileSize;
  w.terrain.damage(Math.floor(p.x / ts), Math.floor(p.y / ts), tileDamage, w.events, credit);
  w.events.push({ type: 'impact', x: p.x, y: p.y });
  p.alive = false;
}

function outOfField(w: World, p: Projectile): boolean {
  return p.y < -8 || p.y > w.terrain.height + 8;
}

/** Burst: full damage to a direct-hit target, falling-off splash to units and terrain. */
function detonate(w: World, p: Projectile, target?: Enemy): void {
  p.alive = false;
  const spec = roundSpec(p.weapon);
  if (spec.kind === 'bullet') return;
  const r = spec.blastRadius;
  if (target) damageEnemy(w, target, spec, spec.damage, direct(p));

  if (r <= 0) {
    w.events.push({ type: 'impact', x: p.x, y: p.y });
    return;
  }
  const pool = spec.kind === 'shell' ? spec.pool : undefined;
  w.events.push(pool ? { type: 'explosion', x: p.x, y: p.y, radius: r, plasma: true } : { type: 'explosion', x: p.x, y: p.y, radius: r });
  if (spec.kind === 'shell' && spec.pool) spawnPool(w, p.x, p.y, spec, spec.pool);
  for (const m of w.mines) if (Math.hypot(m.x - p.x, m.y - p.y) <= r + m.radius) triggerMine(m);

  // A lobbed shell comes down on top of whatever it catches.
  const from = spec.kind === 'shell' && spec.lobbed ? 'top' : 'splash';
  for (const e of w.enemies) {
    if (!e.alive || e === target) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y) - e.def.radius;
    if (d < r) damageEnemy(w, e, spec, spec.damage * (1 - (0.5 * Math.max(0, d)) / r), from);
  }

  burstTerrain(w, p.x, p.y, r, spec.tileDamage, true);
}

/** Share of the damage a unit avoids where it stands: troops on foot use cover (SPEC §4.5). */
export function coverProtection(w: World, e: Enemy): number {
  return e.def.mobility === 'foot' ? w.terrain.protectionAt(e.x, e.y) : 0;
}

/**
 * How a hit reached a unit: a direct hit by a round traveling (dx, dy), striking at (x, y); splash
 * from a burst or a burning pool; or from above (a lobbed shell).
 */
export type HitFrom = { dx: number; dy: number; x: number; y: number } | 'splash' | 'top';

/** A projectile's direct hit, from the way it's flying. */
function direct(p: Projectile): HitFrom {
  return { dx: p.vx, dy: p.vy, x: p.x, y: p.y };
}

/**
 * Facing armor (SPEC §7): a vehicle's multiplier for the side the hit lands on. Splash counts as
 * a flank hit and a top hit as a rear one. A direct hit on a flank or the rear throws its own
 * spark (`facingHit`), so players learn to go for them.
 */
export function facingMultiplier(w: World, e: Enemy, spec: RoundSpec, from: HitFrom): number {
  const armor = e.def.facing;
  if (!armor) return 1;
  if (from === 'splash') return armor.flank;
  if (from === 'top') return armor.rear;
  const facing = hitFacing(e, from.dx, from.dy);
  if (facing !== 'front') w.events.push({ type: 'facingHit', facing, x: from.x, y: from.y });
  const m = armor[facing];
  // Armor-piercing rounds ignore part of the armor, never part of a weak spot's bonus.
  return m < 1 ? m + (1 - m) * (spec.penetration ?? 0) : m;
}

export function damageEnemy(w: World, e: Enemy, spec: RoundSpec, amount: number, from: HitFrom, cause: KillCause = 'shot'): void {
  e.hp -= amount * damageMultiplier(spec, e.def.targetClass) * facingMultiplier(w, e, spec, from) * (1 - coverProtection(w, e));
  e.exposed = Math.max(e.exposed, CONCEALMENT.afterHit);
  if (e.hp <= 0) destroyEnemy(w, e, cause);
}
