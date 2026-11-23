import type { ScreenDef } from '../../content/behaviors';
import type { Enemy } from '../entities';
import type { World } from '../world';
import type { Goal } from './nav';
import { inFrame } from './steer';

/**
 * Screen (SPEC §4.4 Chase escorts): hold between the Behemoth and the battle's moving target nearest
 * it (the hauler it's about to reach), `standoff` out toward the hull but never past halfway, and
 * `spread` to the unit's own side of that line (`orbitDir`), keeping pace with the target. Null when
 * there's nothing left to screen.
 */
export function screen(e: Enemy, d: ScreenDef, w: World, _dt: number): Goal | null {
  const b = w.behemoth;
  let ward: Enemy | null = null;
  let best = Infinity;
  for (const o of w.enemies) {
    if (!o.alive || !o.objective || o.def.maxSpeed <= 0) continue;
    const dist = Math.hypot(o.x - b.x, o.y - b.y);
    if (dist < best) {
      best = dist;
      ward = o;
    }
  }
  if (!ward) return null;
  const ux = (b.x - ward.x) / (best || 1);
  const uy = (b.y - ward.y) / (best || 1);
  const out = Math.min(d.standoff, best / 2);
  const side = e.ai.orbitDir * d.spread;
  const p = inFrame(e, w, ward.x + ux * out - uy * side, ward.y + uy * out + ux * side);
  return { x: p.x, y: p.y, mode: 'pace', vel: { vx: ward.vx, vy: ward.vy } };
}
