import { wrapAngle } from '../sim/math';

/**
 * Render interpolation between fixed 60 Hz sim steps. Before each step the scene captures the
 * fields it draws; at render time each value is blended from the captured (previous) state toward
 * the current one by `alpha`, the fraction of a step left in the accumulator. Rendering runs at
 * most one step behind the sim, and motion stays even at any display refresh rate.
 *
 * Objects are keyed by identity, so entities created since the last capture just draw where they
 * are.
 */
export class Interp {
  alpha = 1;
  private readonly prev = new WeakMap<object, number[]>();

  /** Remember an object's drawn values (in a fixed order) before a sim step. */
  capture(o: object, values: readonly number[]): void {
    const p = this.prev.get(o);
    if (p) for (let i = 0; i < values.length; i++) p[i] = values[i]!;
    else this.prev.set(o, values.slice());
  }

  /** Value `i` of `o`, blended from its captured value toward `current`. */
  lerp(o: object, i: number, current: number): number {
    const p = this.prev.get(o)?.[i];
    return p === undefined ? current : p + (current - p) * this.alpha;
  }

  /** Same as `lerp`, the short way around for angles. */
  lerpAngle(o: object, i: number, current: number): number {
    const p = this.prev.get(o)?.[i];
    return p === undefined ? current : p + wrapAngle(current - p) * this.alpha;
  }
}

/** Where a view should draw something this frame. */
export interface Pose {
  x: number;
  y: number;
  /** Body heading (sim radians). */
  heading: number;
  /** Turret angle in world space (enemies; the Behemoth's rings are interpolated per ring). */
  turret: number;
}

interface Posed {
  x: number;
  y: number;
  heading?: number;
}

/** Capture order shared by `capturePose` and `pose`. */
export function capturePose(ip: Interp, o: Posed, turret = 0): void {
  ip.capture(o, [o.x, o.y, o.heading ?? 0, turret]);
}

export function pose(ip: Interp, o: Posed, turret = 0): Pose {
  return {
    x: ip.lerp(o, 0, o.x),
    y: ip.lerp(o, 1, o.y),
    heading: ip.lerpAngle(o, 2, o.heading ?? 0),
    turret: ip.lerpAngle(o, 3, turret),
  };
}
