import { FIRE, TRAILER_MINE } from '../content/tuning';
import {
  applyHit,
  damageComponent,
  hitArc,
  hitched,
  hitchPoint,
  hullBox,
  placeTrailer,
  type BayState,
  type BehemothState,
  type ComponentId,
  type PlayerCommand,
  type TrailerState,
} from './behemoth';
import { blastDrones } from './drones';
import { destroyEnemy } from './enemies';
import { allocId, sealed, type Mine } from './entities';
import { fireBurst } from './fire';
import { distanceToBox } from './math';
import type { KillCause, SimEvent } from './events';
import { TIMER_SLACK } from './loop';
import type { Rng } from './rng';
import type { World } from './world';

/**
 * The trailer in battle (SPEC §5.5): it follows the hitch, takes the hits that reach it, feeds
 * spare ammo forward, and goes up when it's wrecked. Jettisoned, it lies in the track as a mine.
 */

/** Tow, bunkers, jettison, and the cook-off of a wrecked trailer. Runs after the hull has moved. */
export function stepTrailer(w: World, cmd: PlayerCommand, dt: number): void {
  const b = w.behemoth;
  const t = hitched(b);
  if (!t || b.destroyed) return;
  // The trailer swings in behind the hitch: it heads toward where the hitch is now.
  const h = hitchPoint(b);
  placeTrailer(b, Math.atan2(h.y - t.y, h.x - t.x));
  if (t.frame.hp <= 0) {
    wreckTrailer(w);
    return;
  }
  stepBunkers(b, t, dt, w.events);
  stepJettison(w, t, cmd.jettison && w.extractedAt === null && b.reactorFuse === null, dt);
}

/**
 * A round hit the trailer: its armor absorbs what it can, and the rest strikes the frame or a
 * working module, weighted by exposure. Armor-bypassing strikes have nothing to aim at here.
 */
export function hitTrailer(b: BehemothState, t: TrailerState, damage: number, rng: Rng, events: SimEvent[], x: number, y: number): void {
  events.push({ type: 'trailerHit', damage, x, y });
  wearTrailer(b, t, damage, rng, events);
}

/** Damage to the trailer with no hit to show for it (what it crushes, `collision.ts`): armor first, as `hitTrailer`. */
export function wearTrailer(b: BehemothState, t: TrailerState, damage: number, rng: Rng, events: SimEvent[]): void {
  if (b.invulnerable) return;
  const absorbed = Math.min(Math.max(0, t.armor.hp), damage);
  t.armor.hp -= absorbed;
  const through = damage - absorbed;
  if (through <= 0) return;
  const options: { id: ComponentId; weight: number }[] = [];
  if (t.frame.hp > 0) options.push({ id: 'trailer', weight: t.def.exposure.frame });
  t.bays.forEach((bay, i) => {
    if (bay && bay.integrity.hp > 0) options.push({ id: `bay${i}`, weight: t.def.exposure.module });
  });
  const id = rng.weighted(options, (o) => o.weight)?.id ?? 'trailer';
  damageComponent(b, id, through, events);
}

/**
 * Share of a module's contents still in it (it scales the module's part of the blast): a pod's
 * missiles, a bunker's loads; a working generator is all there. Wrecked modules add nothing.
 */
function contents(b: BehemothState, i: number, bay: BayState): number {
  if (bay.integrity.hp <= 0) return 0;
  switch (bay.def.kind) {
    case 'pod': {
      const h = b.hardpoints.find((hp) => hp.slot.id === `bay${i}`);
      const full = h?.weapon?.ammo ?? 0;
      return full > 0 && h?.ammo != null ? h.ammo / full : 0;
    }
    case 'bunker':
      return bay.def.loads > 0 ? bay.loads / bay.def.loads : 0;
    case 'generator':
      return 1;
    case 'drones':
      return bay.def.drones > 0 ? bay.loads / bay.def.drones : 0;
  }
}

/** How big the trailer's blast is: the frame's, plus each module's by what's left in it. */
export function trailerBlast(b: BehemothState, t: TrailerState): { radius: number; damage: number } {
  let radius = t.def.blast.radius;
  let damage = t.def.blast.damage;
  t.bays.forEach((bay, i) => {
    if (!bay) return;
    const f = contents(b, i, bay);
    radius += bay.def.blast.radius * f;
    damage += bay.def.blast.damage * f;
  });
  return { radius, damage };
}

/** Cut the trailer off: its pods go dead with it and its bunkers stop feeding. */
function cutLoose(b: BehemothState, t: TrailerState, status: TrailerState['status']): void {
  t.status = status;
  t.jettisonHeld = 0;
  for (const [i, bay] of t.bays.entries()) {
    if (!bay) continue;
    bay.feeding = null;
    const pod = b.hardpoints.find((h) => h.slot.id === `bay${i}`);
    if (pod) pod.salvo = null;
  }
}

/** Wrecked while hitched: it cooks off on the spot, and the Behemoth's rear takes a share. */
export function wreckTrailer(w: World, cause: KillCause = 'trailer'): void {
  const b = w.behemoth;
  const t = hitched(b);
  if (!t) return;
  const { radius, damage } = trailerBlast(b, t);
  cutLoose(b, t, 'wrecked');
  for (const bay of t.bays) if (bay) bay.integrity.hp = 0;
  w.events.push({ type: 'trailerLost', how: 'wrecked', x: t.x, y: t.y });
  const kills = blast(w, t.x, t.y, radius, damage, cause);
  fireBurst(w, t.x, t.y, radius * FIRE.detonationReach, FIRE.burn);
  if (!b.destroyed) applyHit(b, 'rear', damage * TRAILER_MINE.hitched, w.rng, w.events, t.x, t.y);
  w.events.push({ type: 'trailerBlast', x: t.x, y: t.y, radius, mine: null, kills });
}

function stepJettison(w: World, t: TrailerState, held: boolean, dt: number): void {
  if (!held) {
    t.jettisonHeld = 0;
    return;
  }
  t.jettisonHeld += dt;
  if (t.jettisonHeld < TRAILER_MINE.jettisonHold) return;
  const b = w.behemoth;
  const { radius, damage } = trailerBlast(b, t);
  cutLoose(b, t, 'jettisoned');
  const mine: Mine = {
    id: allocId(w),
    x: t.x,
    y: t.y,
    heading: t.heading,
    vx: b.vx * Math.cos(b.heading) - b.vy * Math.sin(b.heading),
    vy: b.vx * Math.sin(b.heading) + b.vy * Math.cos(b.heading),
    arm: TRAILER_MINE.armDelay,
    life: TRAILER_MINE.life,
    fuse: null,
    radius: Math.max(t.def.length, t.def.width) / 2,
    blastRadius: radius,
    blastDamage: damage,
    alive: true,
  };
  // Its modules stay as they were (it's drawn intact), but nothing in it works once it's unhitched.
  w.mines.push(mine);
  w.events.push({ type: 'trailerLost', how: 'jettisoned', mine: mine.id });
}

/**
 * Bunkers refill munitions weapons that run dry, one full load at a time after a short transfer.
 * Two bunkers never feed the same weapon.
 */
function stepBunkers(b: BehemothState, t: TrailerState, dt: number, events: SimEvent[]): void {
  for (const bay of t.bays) {
    if (!bay || bay.def.kind !== 'bunker') continue;
    if (bay.integrity.hp <= 0) {
      bay.feeding = null;
      continue;
    }
    if (bay.feeding) {
      const f = bay.feeding;
      const h = b.hardpoints.find((hp) => hp.slot.id === f.slot);
      if (!h?.weapon?.ammo || h.integrity.hp <= 0) {
        bay.feeding = null;
        continue;
      }
      f.timer -= dt;
      if (f.timer > TIMER_SLACK) continue;
      h.ammo = h.weapon.ammo;
      bay.loads--;
      bay.feeding = null;
      events.push({ type: 'reloaded', slot: h.slot.id });
      continue;
    }
    if (bay.loads <= 0) continue;
    const fed = new Set(t.bays.flatMap((o) => (o?.feeding ? [o.feeding.slot] : [])));
    const dry = b.hardpoints.find((h) => h.weapon?.ammo !== undefined && h.ammo === 0 && h.integrity.hp > 0 && !fed.has(h.slot.id));
    if (dry) bay.feeding = { slot: dry.slot.id, timer: bay.def.reload };
  }
}

/** Seconds left on a bunker's transfer into this slot, or null if none is on its way. */
export function feedingInto(b: BehemothState, slot: string): number | null {
  for (const bay of hitched(b)?.bays ?? []) if (bay?.feeding?.slot === slot) return bay.feeding.timer;
  return null;
}

/** Jettisoned trailers: coast to a stop, then wait to be set off. */
export function stepMines(w: World, dt: number): void {
  if (w.mines.length === 0) return;
  for (const m of w.mines) {
    if (!m.alive) continue;
    const speed = Math.hypot(m.vx, m.vy);
    if (speed > 0) {
      const k = Math.max(0, speed - TRAILER_MINE.decel * dt) / speed;
      m.vx *= k;
      m.vy *= k;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
    }
    m.arm -= dt;
    m.life -= dt;
    if (m.fuse === null) {
      const near = m.arm <= 0 && w.enemies.some((e) => e.alive && Math.hypot(e.x - m.x, e.y - m.y) - e.def.radius <= TRAILER_MINE.trigger);
      if (m.life <= 0) m.fuse = 0;
      else if (near) m.fuse = TRAILER_MINE.fuse;
    }
    if (m.fuse !== null) {
      m.fuse -= dt;
      if (m.fuse <= 0) blowMine(w, m);
    }
  }
  w.mines = w.mines.filter((m) => m.alive);
}

/** A round or a blast reached an armed mine: it goes up next step. */
export function triggerMine(m: Mine): void {
  if (m.alive && m.arm <= 0) m.fuse = Math.min(m.fuse ?? 0, 0);
}

/** The armed mine a point is on, if any (for rounds). */
export function mineAt(w: World, x: number, y: number): Mine | undefined {
  return w.mines.find((m) => m.alive && m.arm <= 0 && Math.hypot(x - m.x, y - m.y) <= m.radius);
}

function blowMine(w: World, m: Mine): void {
  m.alive = false;
  const kills = blast(w, m.x, m.y, m.blastRadius, m.blastDamage, 'trailer');
  fireBurst(w, m.x, m.y, m.blastRadius * FIRE.detonationReach, FIRE.burn);
  // Too close to its own cargo going up, the Behemoth takes a share on the arc facing it.
  hullBlast(w, m.x, m.y, m.blastRadius, m.blastDamage * TRAILER_MINE.hitched);
  w.events.push({ type: 'trailerBlast', x: m.x, y: m.y, radius: m.blastRadius, mine: m.id, kills });
}

/** Full damage at the center, `edge` of it at the edge. */
function falloff(d: number, radius: number, edge: number = TRAILER_MINE.edge): number {
  return 1 - (1 - edge) * Math.min(1, Math.max(0, d) / radius);
}

/**
 * The Behemoth near a blast: it takes `damage` (falling off with distance to its footprint) on the
 * arc facing it. Returns whether it reached the hull.
 */
export function hullBlast(w: World, x: number, y: number, radius: number, damage: number, edge: number = TRAILER_MINE.edge): boolean {
  const b = w.behemoth;
  if (b.destroyed) return false;
  const d = distanceToBox(hullBox(b), x, y);
  if (d >= radius) return false;
  applyHit(b, hitArc(b, x - b.x, y - b.y, x, y), damage * falloff(d, radius, edge), w.rng, w.events, x, y);
  return true;
}

/**
 * A blast (a trailer going up, explosive terrain): units in the radius take falling-off damage,
 * terrain is battered, rounds in flight are swallowed, and other mines in reach go off too. Returns
 * the kills. It doesn't touch the Behemoth (see `hullBlast`).
 */
export function blast(w: World, x: number, y: number, radius: number, damage: number, cause: KillCause, edge: number = TRAILER_MINE.edge, fire = false): number {
  w.events.push(fire ? { type: 'explosion', x, y, radius, fire } : { type: 'explosion', x, y, radius });
  let kills = 0;
  for (const e of w.enemies) {
    // A shut trapdoor shrugs off any blast (SPEC §7.4, user's call).
    if (!e.alive || sealed(e)) continue;
    const d = Math.hypot(e.x - x, e.y - y) - e.def.radius;
    if (d >= radius) continue;
    e.hp -= damage * falloff(d, radius, edge);
    if (e.hp <= 0) {
      destroyEnemy(w, e, cause);
      kills++;
    }
  }
  const t = w.terrain;
  const ts = t.tileSize;
  for (let c = Math.floor((x - radius) / ts); c <= Math.floor((x + radius) / ts); c++) {
    for (let r = Math.max(0, Math.floor((y - radius) / ts)); r <= Math.min(t.rows - 1, Math.floor((y + radius) / ts)); r++) {
      const d = Math.hypot((c + 0.5) * ts - x, (r + 0.5) * ts - y);
      if (d <= radius) t.damage(c, r, damage * falloff(d, radius, edge), w.events);
    }
  }
  for (const p of w.projectiles) if (Math.hypot(p.x - x, p.y - y) <= radius) p.alive = false;
  blastDrones(w, x, y, radius, damage);
  for (const m of w.mines) if (m.alive && Math.hypot(m.x - x, m.y - y) <= radius + m.radius) triggerMine(m);
  return kills;
}
