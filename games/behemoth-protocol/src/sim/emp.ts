import { EMP } from '../content/tuning';
import type { PulseSpec, WeaponDef } from '../content/weapons';
import { MATERIALS } from '../content/terrain';
import { hullWidth } from './behemoth';
import { markFlash } from './conditions';
import type { Enemy } from './entities';
import { fryFlung } from './trainCars';
import type { World } from './world';

/**
 * EMP (SPEC §6 EMP emitter): a pulse out from the emitter that knocks out every vehicle in reach
 * for a few seconds (`Enemy.stunned`: it stops dead, its guns stop tracking, and any shot it was
 * lining up or volley it was firing is lost), fries enemy missiles in flight, and kills the mines
 * in reach for good, swept or not, without setting them off (`Terrain.pulse`; a train flinger's
 * mines in the air too). Troops on foot aren't affected, nor is the Behemoth's own jettisoned
 * trailer. `stepEnemies` holds a stunned unit still.
 */

/** Whether a pulse can knock out this unit: any vehicle or emplacement, never troops on foot. */
function empable(e: Enemy): boolean {
  return e.alive && e.def.mobility !== 'foot';
}

/** Whether a unit's body is within a pulse's reach from (x, y). */
function inReach(e: Enemy, x: number, y: number, radius: number): boolean {
  return Math.hypot(e.x - x, e.y - y) - e.def.radius <= radius;
}

/** Knock a unit out for `seconds` (never shortening a longer stun), and drop whatever it was firing. */
export function stun(e: Enemy, seconds: number): void {
  e.stunned = Math.max(e.stunned ?? 0, seconds);
  e.vx = 0;
  e.vy = 0;
  for (const g of [e, ...e.guns]) {
    g.windup = 0;
    g.salvoLeft = 0;
    delete g.zone;
  }
}

/**
 * Whether a swept, live mine lies in the hull's own path within `EMP.mineAhead` of its nose (and
 * within `radius` of the emitter at (x, y)): the treads are about to roll onto it.
 */
function mineAhead(w: World, x: number, y: number, radius: number): boolean {
  const b = w.behemoth;
  const t = w.terrain;
  const ts = t.tileSize;
  const fx = Math.cos(b.heading);
  const fy = Math.sin(b.heading);
  const nose = b.chassis.length / 2;
  const half = hullWidth(b) / 2 + ts / 2;
  const far = nose + EMP.mineAhead;
  for (let c = Math.floor((b.x - far) / ts); c <= Math.floor((b.x + far) / ts); c++) {
    for (let r = Math.max(0, Math.floor((b.y - far) / ts)); r <= Math.min(t.rows - 1, Math.floor((b.y + far) / ts)); r++) {
      const tile = t.tile(c, r);
      if (!tile || !tile.seen || tile.state !== 'intact' || !MATERIALS[tile.mat].empTo) continue;
      const cx = (c + 0.5) * ts;
      const cy = (r + 0.5) * ts;
      const dx = cx - b.x;
      const dy = cy - b.y;
      const along = dx * fx + dy * fy;
      if (along < 0 || along > far || Math.abs(dy * fx - dx * fy) > half) continue;
      if (Math.hypot(cx - x, cy - y) <= radius) return true;
    }
  }
  return false;
}

/**
 * Whether a pulse on Auto is worth its power now: `EMP.autoMin` working vehicles in reach, a bomb
 * truck, an enemy missile closing, or a swept mine in the hull's path.
 */
export function pulseWorth(w: World, x: number, y: number, spec: PulseSpec): boolean {
  let n = 0;
  for (const e of w.enemies) {
    if (!empable(e) || (e.stunned ?? 0) > EMP.renew || !inReach(e, x, y, spec.radius)) continue;
    if (e.def.bomb) return true;
    n++;
  }
  if (n >= EMP.autoMin) return true;
  if (w.projectiles.some((p) => p.alive && p.owner === 'enemy' && p.kind === 'missile' && Math.hypot(p.x - x, p.y - y) <= spec.radius)) return true;
  return mineAhead(w, x, y, spec.radius);
}

/** Fire a pulse from (x, y). Pushes a `fire` event (sound) and an `emp` event (the ring, and how many vehicles and mines it caught). */
export function firePulse(w: World, weapon: WeaponDef, x: number, y: number, slot: string): void {
  const spec = weapon.projectile as PulseSpec;
  markFlash(w);
  let caught = 0;
  for (const e of w.enemies) {
    if (!empable(e) || !inReach(e, x, y, spec.radius)) continue;
    stun(e, spec.stun * (spec.stunVs?.[e.def.targetClass] ?? 1));
    caught++;
  }
  for (const p of w.projectiles) {
    if (!p.alive || p.owner !== 'enemy' || p.kind !== 'missile' || Math.hypot(p.x - x, p.y - y) > spec.radius) continue;
    p.alive = false;
    w.events.push({ type: 'impact', x: p.x, y: p.y });
  }
  const mines = w.terrain.pulse(x, y, spec.radius, w.events) + fryFlung(w, x, y, spec.radius);
  w.events.push({ type: 'fire', owner: 'player', weapon: weapon.id, x, y, angle: 0, slot });
  w.events.push({ type: 'emp', x, y, radius: spec.radius, caught, mines });
}
