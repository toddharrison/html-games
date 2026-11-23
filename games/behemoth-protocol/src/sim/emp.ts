import { EMP } from '../content/tuning';
import type { PulseSpec, WeaponDef } from '../content/weapons';
import { markFlash } from './conditions';
import type { Enemy } from './entities';
import type { World } from './world';

/**
 * EMP (SPEC §6 EMP emitter): a pulse out from the emitter that knocks out every vehicle in reach
 * for a few seconds (`Enemy.stunned`: it stops dead, its guns stop tracking, and any shot it was
 * lining up or volley it was firing is lost) and fries enemy missiles in flight. Troops on foot
 * aren't affected. `stepEnemies` holds a stunned unit still.
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
 * Whether a pulse on Auto is worth its power now: `EMP.autoMin` working vehicles in reach, a bomb
 * truck, or an enemy missile closing.
 */
export function pulseWorth(w: World, x: number, y: number, spec: PulseSpec): boolean {
  let n = 0;
  for (const e of w.enemies) {
    if (!empable(e) || (e.stunned ?? 0) > EMP.renew || !inReach(e, x, y, spec.radius)) continue;
    if (e.def.bomb) return true;
    n++;
  }
  if (n >= EMP.autoMin) return true;
  return w.projectiles.some((p) => p.alive && p.owner === 'enemy' && p.kind === 'missile' && Math.hypot(p.x - x, p.y - y) <= spec.radius);
}

/** Fire a pulse from (x, y). Pushes a `fire` event (sound) and an `emp` event (the ring, and how many it caught). */
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
  w.events.push({ type: 'fire', owner: 'player', weapon: weapon.id, x, y, angle: 0, slot });
  w.events.push({ type: 'emp', x, y, radius: spec.radius, caught });
}
