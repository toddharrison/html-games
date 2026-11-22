/** Small numeric helpers shared by sim systems. Pure, no allocation-heavy code. */

export const TAU = Math.PI * 2;

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Move `current` toward `target` by at most `maxDelta`. */
export function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(target, current + maxDelta);
  return Math.max(target, current - maxDelta);
}

/**
 * Moves velocity `v` toward `target` along an S-curve: the acceleration `a` changes at no more than
 * `jerk` per second, up to `maxAccel`, and eases back to zero as `v` arrives, so a change of
 * velocity starts and settles smoothly instead of snapping. Returns the new velocity and
 * acceleration.
 */
export function easeToward(
  v: number,
  a: number,
  target: number,
  maxAccel: number,
  jerk: number,
  dt: number,
): { v: number; a: number } {
  const dv = target - v;
  // The most acceleration that can still be eased back to zero by the time `v` gets there, judged
  // one step ahead (without it, the fixed step lags the curve and arrives with acceleration left).
  const rem = Math.max(0, Math.abs(dv) - Math.max(0, Math.sign(dv) * a) * dt);
  const want = Math.sign(dv) * Math.min(maxAccel, Math.sqrt(2 * jerk * rem));
  const na = approach(a, want, jerk * dt);
  const nv = v + na * dt;
  // Arrived (or would cross): settle on the target.
  if (dv === 0 ? na === 0 : (target - nv) * dv <= 0) return { v: target, a: 0 };
  return { v: nv, a: na };
}

/** Wrap an angle into (-PI, PI]. */
export function wrapAngle(a: number): number {
  a = a % TAU;
  if (a <= -Math.PI) a += TAU;
  else if (a > Math.PI) a -= TAU;
  return a;
}

/** Signed shortest difference `to - from`, in (-PI, PI]. */
export function angleDiff(from: number, to: number): number {
  return wrapAngle(to - from);
}

/** Rotate `current` toward `target` along the shortest arc by at most `maxDelta` radians. */
export function rotateToward(current: number, target: number, maxDelta: number): number {
  const d = angleDiff(current, target);
  if (Math.abs(d) <= maxDelta) return wrapAngle(target);
  return wrapAngle(current + Math.sign(d) * maxDelta);
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function circleIntersectsRect(cx: number, cy: number, r: number, rect: Rect): boolean {
  const nx = clamp(cx, rect.x0, rect.x1);
  const ny = clamp(cy, rect.y0, rect.y1);
  return (cx - nx) ** 2 + (cy - ny) ** 2 <= r * r;
}

/**
 * A rectangle turned to a heading about its center (SPEC §4.2: the Behemoth's hull as it steers):
 * `hl` half its length along the heading, `hw` half its width across, `c`/`s` the heading's cosine
 * and sine.
 */
export interface Box {
  x: number;
  y: number;
  hl: number;
  hw: number;
  c: number;
  s: number;
}

export function orientedBox(x: number, y: number, hl: number, hw: number, heading: number): Box {
  return { x, y, hl, hw, c: Math.cos(heading), s: Math.sin(heading) };
}

/** A point in the box's own frame: `u` along its heading, `v` across it (+ = to its right in sim terms). */
export function toBox(box: Box, x: number, y: number): { u: number; v: number } {
  const dx = x - box.x;
  const dy = y - box.y;
  return { u: dx * box.c + dy * box.s, v: -dx * box.s + dy * box.c };
}

/** Inside the box, grown by `pad` on every side. */
export function pointInBox(box: Box, x: number, y: number, pad = 0): boolean {
  const { u, v } = toBox(box, x, y);
  return Math.abs(u) <= box.hl + pad && Math.abs(v) <= box.hw + pad;
}

/** The point of the box (edge or inside) nearest (x, y). */
export function closestInBox(box: Box, x: number, y: number): { x: number; y: number } {
  const { u, v } = toBox(box, x, y);
  const cu = clamp(u, -box.hl, box.hl);
  const cv = clamp(v, -box.hw, box.hw);
  return { x: box.x + cu * box.c - cv * box.s, y: box.y + cu * box.s + cv * box.c };
}

/** Distance from (x, y) to the box (0 inside). */
export function distanceToBox(box: Box, x: number, y: number): number {
  const { u, v } = toBox(box, x, y);
  return Math.hypot(Math.max(0, Math.abs(u) - box.hl), Math.max(0, Math.abs(v) - box.hw));
}

export function circleIntersectsBox(box: Box, cx: number, cy: number, r: number): boolean {
  return distanceToBox(box, cx, cy) <= r;
}

/** The axis-aligned rect that just holds the box. */
export function boxBounds(box: Box): Rect {
  const ex = box.hl * Math.abs(box.c) + box.hw * Math.abs(box.s);
  const ey = box.hl * Math.abs(box.s) + box.hw * Math.abs(box.c);
  return { x0: box.x - ex, y0: box.y - ey, x1: box.x + ex, y1: box.y + ey };
}

/** Whether an axis-aligned rect overlaps the box (separating axes; rects that only touch don't count). */
export function rectIntersectsBox(box: Box, rect: Rect): boolean {
  const b = boxBounds(box);
  if (rect.x1 <= b.x0 || rect.x0 >= b.x1 || rect.y1 <= b.y0 || rect.y0 >= b.y1) return false;
  // The rect's corners projected onto the box's own axes.
  let u0 = Infinity;
  let u1 = -Infinity;
  let v0 = Infinity;
  let v1 = -Infinity;
  for (const x of [rect.x0, rect.x1]) {
    for (const y of [rect.y0, rect.y1]) {
      const p = toBox(box, x, y);
      u0 = Math.min(u0, p.u);
      u1 = Math.max(u1, p.u);
      v0 = Math.min(v0, p.v);
      v1 = Math.max(v1, p.v);
    }
  }
  return u1 > -box.hl && u0 < box.hl && v1 > -box.hw && v0 < box.hw;
}
