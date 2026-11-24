import { rotateToward } from './math';
import type { Enemy } from './entities';
import type { World } from './world';

/**
 * A shield on an arm (`EnemyDef.shield`: an armored train's shield car, SPEC-armored-train.md §T6):
 * an armor plate held out from the unit on a loader's arm, square to it. The arm is the unit's
 * `turret`. It swings toward the Behemoth once that's in range, so the plate stands between the
 * Behemoth and the car, and stows along the hull otherwise. The plate stops the Behemoth's direct
 * fire: anything that flies flat (bullets, shells, missiles), beams, and slugs. Lobbed shells go
 * over it, blasts reach round it, and it turns only so fast, so it can be flanked.
 */

/** Swings every shield's arm. A unit that's out of the fight (stunned, abandoned, underground) leaves it where it is. */
export function stepShields(w: World, dt: number): void {
  const b = w.behemoth;
  for (const e of w.enemies) {
    const s = e.def.shield;
    if (!s || !e.alive || e.stunned || e.ai.charging || e.ai.under) continue;
    const near = !b.destroyed && Math.hypot(b.x - e.x, b.y - e.y) <= s.range;
    const want = near ? Math.atan2(b.y - e.y, b.x - e.x) : e.heading;
    e.turret = rotateToward(e.turret, want, ((s.degPerSec * Math.PI) / 180) * dt);
  }
}

/** A shield's plate on the ground: a segment `width` long, `reach` out along the arm. */
export function shieldPlate(e: Enemy): { x0: number; y0: number; x1: number; y1: number } | null {
  const s = e.def.shield;
  if (!s || !e.alive || e.ai.under) return null;
  const c = Math.cos(e.turret);
  const n = Math.sin(e.turret);
  const x = e.x + c * s.reach;
  const y = e.y + n * s.reach;
  return { x0: x - (n * s.width) / 2, y0: y + (c * s.width) / 2, x1: x + (n * s.width) / 2, y1: y - (c * s.width) / 2 };
}

/**
 * Where a shot from (x0, y0) to (x1, y1) is stopped by a shield's plate, as a share of the way
 * (0–1), or null if no plate is in its way. A shot starting right at a plate (within a hair) is
 * already through it.
 */
export function shieldStop(w: World, x0: number, y0: number, x1: number, y1: number): number | null {
  let best: number | null = null;
  const dx = x1 - x0;
  const dy = y1 - y0;
  for (const e of w.enemies) {
    const p = shieldPlate(e);
    if (!p) continue;
    const px = p.x1 - p.x0;
    const py = p.y1 - p.y0;
    const denom = dx * py - dy * px;
    if (Math.abs(denom) < 1e-9) continue;
    const t = ((p.x0 - x0) * py - (p.y0 - y0) * px) / denom;
    const u = ((p.x0 - x0) * dy - (p.y0 - y0) * dx) / denom;
    if (t < 1e-6 || t > 1 || u < 0 || u > 1) continue;
    if (best === null || t < best) best = t;
  }
  return best;
}
