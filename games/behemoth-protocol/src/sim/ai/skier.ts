import { SKI } from '../../content/tuning';
import { hullBox } from '../behemoth';
import type { Enemy } from '../entities';
import { closestInBox, distanceToBox } from '../math';
import type { World } from '../world';
import { skirmisher } from './skirmisher';

/**
 * Skier (SPEC §7.4 ski troops): sweeps round the Behemoth like a skirmisher, weaving as it goes (a
 * sideways jink that flips every so often, `EnemyDef.evasive`), so a lead is thrown off and the
 * automatic weapons can't track it. It fires on the move (user's call: it never stops to shoot).
 */
export function skier(e: Enemy, w: World, dt: number): { vx: number; vy: number } {
  const v = skirmisher(e, w, dt);
  const ev = e.def.evasive;
  if (!ev) return v;
  const ai = e.ai;
  ai.weaveIn = (ai.weaveIn ?? 0) - dt;
  ai.weaveAge = (ai.weaveAge ?? 0) + dt;
  if (ai.weaveIn <= 0) {
    ai.weave = ai.weave === undefined ? w.rng.sign() : ai.weave === 1 ? -1 : 1;
    ai.weaveIn = w.rng.range(ev.flip[0], ev.flip[1]);
    ai.weaveAge = 0;
  }
  // Across its course: off to one side, then the other.
  const m = Math.hypot(v.vx, v.vy) || 1;
  const s = ev.weave * (ai.weave ?? 1);
  const out = { vx: v.vx - (v.vy / m) * s, vy: v.vy + (v.vx / m) * s };
  // Too close to the hull (a weave toward it, or squeezed against a field edge): ski straight off
  // it at the Behemoth's pace, and swing the circle round to the roomier side of the field.
  const b = w.behemoth;
  const box = hullBox(b);
  const d = distanceToBox(box, e.x, e.y);
  if (d < SKI.clearance) {
    const c = closestInBox(box, e.x, e.y);
    const dx = e.x - c.x;
    const dy = e.y - c.y;
    const n = Math.hypot(dx, dy) || 1;
    ai.orbitAngle = b.y < w.terrain.height / 2 ? Math.PI / 2 : -Math.PI / 2;
    return { vx: b.vx + (dx / n) * e.def.maxSpeed, vy: b.vy + (dy / n) * e.def.maxSpeed };
  }
  return out;
}
