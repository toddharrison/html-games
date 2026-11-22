import { WALKER } from '../../content/tuning';
import { hitched, hullWidth } from '../behemoth';
import type { Enemy } from '../entities';
import type { World } from '../world';
import { goTo, inFrame, pursue } from './steer';

/**
 * Stalker (SPEC §7.4 spider walker): works round behind the Behemoth and holds there, `engage`
 * range behind its tail (the trailer's, when one is in tow), a little off to one side, well inside
 * the frame (SPEC §7 fairness rules: rear attackers stay in view). Met ahead, it first steps out
 * of the hull's path into a lane beside it and lets the hull go by, rather than walking into the
 * treads. Now and then it changes sides and distance.
 */
export function stalker(e: Enemy, w: World, dt: number): { vx: number; vy: number } {
  const b = w.behemoth;
  const o = e.def.engage;
  const ai = e.ai;
  ai.retargetIn -= dt;
  if (ai.retargetIn <= 0) {
    ai.retargetIn = w.rng.range(4, 8);
    if (w.rng.chance(0.35)) ai.orbitDir = ai.orbitDir === 1 ? -1 : 1;
    ai.orbitRange = w.rng.range(o.minRange, o.maxRange);
  }
  const t = hitched(b);
  const tail = b.x - b.chassis.length / 2 - (t ? t.def.towBar + t.def.length : 0);
  const lane = hullWidth(b) / 2 + WALKER.sideGap;
  const across = e.y - b.y;
  // Still ahead of the tail and within the hull's lane: step out of the way first, on the side
  // it's on, and stand there while the hull goes by.
  if (e.x > tail - e.def.radius && Math.abs(across) < lane) {
    const side = across !== 0 ? Math.sign(across) : ai.orbitDir;
    const p = inFrame(e, w, e.x, b.y + side * (lane + 10));
    return goTo(e, p.x, p.y);
  }
  const p = inFrame(e, w, tail - ai.orbitRange, b.y + ai.orbitDir * lane * 0.5);
  return pursue(e, w, p.x, p.y);
}
