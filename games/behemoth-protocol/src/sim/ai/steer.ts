import { STEER } from '../../content/tuning';
import type { Enemy } from '../entities';
import { frameRight } from '../frame';
import { clamp } from '../math';
import type { World } from '../world';

/** Shared steering pieces for behaviors. */

/**
 * Clamp a target point into the visible frame, holding well clear of the trailing edge, so units
 * attacking from behind stay in view (SPEC §7 fairness rules).
 */
export function inFrame(e: Enemy, w: World, x: number, y: number): { x: number; y: number } {
  const margin = e.def.radius + 4;
  const f = w.frame;
  const rearHold = f.left + Math.max(margin + STEER.frameMargin, f.config.width * e.def.behavior.rearInset);
  return {
    x: clamp(x, rearHold, frameRight(f) - margin - STEER.frameMargin),
    y: clamp(y, margin, w.terrain.height - margin),
  };
}

/**
 * Desired velocity to reach a point that moves with the Behemoth (or with `ref`, another unit's
 * velocity): match its velocity, plus a chase term toward the point, capped at the unit's top speed.
 */
export function keepPace(e: Enemy, w: World, tx: number, ty: number, ref?: { vx: number; vy: number }): { vx: number; vy: number } {
  const b = ref ?? w.behemoth;
  const dx = tx - e.x;
  const dy = ty - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const max = e.def.maxSpeed;
  const chase = Math.min(max, d * STEER.paceGain);
  return capped(e, b.vx + (dx / d) * chase, b.vy + (dy / d) * chase);
}

/** A velocity held to the unit's top speed. */
export function capped(e: Enemy, vx: number, vy: number): { vx: number; vy: number } {
  const m = Math.hypot(vx, vy);
  const max = e.def.maxSpeed;
  return m > max ? { vx: (vx * max) / m, vy: (vy * max) / m } : { vx, vy };
}

/** Desired velocity to walk to a fixed point and stop there. */
export function goTo(e: Enemy, tx: number, ty: number): { vx: number; vy: number } {
  const dx = tx - e.x;
  const dy = ty - e.y;
  const d = Math.hypot(dx, dy);
  if (d < STEER.arrived) return { vx: 0, vy: 0 };
  const speed = Math.min(e.def.maxSpeed, d * STEER.arriveGain);
  return { vx: (dx / d) * speed, vy: (dy / d) * speed };
}

