import type { StalkerDef } from '../../content/behaviors';
import { hullWidth } from '../behemoth';
import type { Enemy } from '../entities';
import type { World } from '../world';
import type { Goal } from './nav';
import { inFrame, tailX } from './steer';

/**
 * Stalker (SPEC §7.4 spider walker): works round behind the Behemoth and holds there, `hold`
 * behind its tail (the trailer's, when one is in tow), a little off to one side, well inside
 * the frame (SPEC §7 fairness rules: rear attackers stay in view). Met ahead, it first steps out
 * of the hull's path into a lane beside it and lets the hull go by, rather than walking into the
 * treads. Now and then it changes sides and distance.
 */
export function stalker(e: Enemy, d: StalkerDef, w: World, dt: number): Goal {
  const b = w.behemoth;
  const o = d.hold;
  const ai = e.ai;
  ai.retargetIn -= dt;
  if (ai.retargetIn <= 0) {
    ai.retargetIn = w.rng.range(...d.replan.every);
    if (w.rng.chance(d.replan.flip)) ai.orbitDir = ai.orbitDir === 1 ? -1 : 1;
    ai.orbitRange = w.rng.range(o.minRange, o.maxRange);
  }
  const tail = tailX(b);
  const lane = hullWidth(b) / 2 + d.sideGap;
  const across = e.y - b.y;
  // Still ahead of the tail and within the hull's lane: step out of the way first, on the side
  // it's on, and stand there while the hull goes by.
  if (e.x > tail - e.def.radius && Math.abs(across) < lane) {
    const side = across !== 0 ? Math.sign(across) : ai.orbitDir;
    const p = inFrame(e, w, e.x, b.y + side * (lane + d.stepAside));
    return { x: p.x, y: p.y, mode: 'arrive' };
  }
  const p = inFrame(e, w, tail - ai.orbitRange, b.y + ai.orbitDir * lane * d.across);
  return { x: p.x, y: p.y, mode: 'pace' };
}
