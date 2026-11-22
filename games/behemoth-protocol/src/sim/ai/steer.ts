import type { Enemy } from '../entities';
import { frameRight } from '../frame';
import { clamp } from '../math';
import type { World } from '../world';
import { viaFord } from './crossing';

/** Shared steering pieces for behaviors. */

/**
 * Clamp a target point into the visible frame, holding well clear of the trailing edge, so units
 * attacking from behind stay in view (SPEC §7 fairness rules).
 */
export function inFrame(e: Enemy, w: World, x: number, y: number): { x: number; y: number } {
  const margin = e.def.radius + 4;
  const f = w.frame;
  const rearHold = f.left + Math.max(margin + 8, f.config.width * e.def.engage.rearInset);
  return {
    x: clamp(x, rearHold, frameRight(f) - margin - 8),
    y: clamp(y, margin, w.terrain.height - margin),
  };
}

/**
 * Desired velocity to reach a point that moves with the Behemoth: match its velocity, plus a
 * chase term toward the point, capped at the unit's top speed.
 */
export function keepPace(e: Enemy, w: World, tx: number, ty: number): { vx: number; vy: number } {
  const b = w.behemoth;
  const dx = tx - e.x;
  const dy = ty - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const max = e.def.maxSpeed;
  const chase = Math.min(max, d * 1.5);
  const vx = b.vx + (dx / d) * chase;
  const vy = b.vy + (dy / d) * chase;
  const m = Math.hypot(vx, vy);
  return m > max ? { vx: (vx * max) / m, vy: (vy * max) / m } : { vx, vy };
}

/** Desired velocity to walk to a fixed point and stop there. */
export function goTo(e: Enemy, tx: number, ty: number): { vx: number; vy: number } {
  const dx = tx - e.x;
  const dy = ty - e.y;
  const d = Math.hypot(dx, dy);
  if (d < 1.5) return { vx: 0, vy: 0 };
  const speed = Math.min(e.def.maxSpeed, d * 2);
  return { vx: (dx / d) * speed, vy: (dy / d) * speed };
}

/** `keepPace` toward a target, unless it lies across a river this unit can't wade: then a ford first. */
export function pursue(e: Enemy, w: World, tx: number, ty: number): { vx: number; vy: number } {
  const ford = viaFord(e, w, tx, ty);
  return ford ? goTo(e, ford.x, ford.y) : keepPace(e, w, tx, ty);
}
