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

export function pointInRect(x: number, y: number, rect: Rect): boolean {
  return x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1;
}
