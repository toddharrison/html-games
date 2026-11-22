import type { Enemy } from '../entities';
import type { World } from '../world';
import { inFrame, pursue } from './steer';

/**
 * Skirmisher behavior (light tanks): circle the Behemoth at a preferred range, matching its
 * forward speed, occasionally changing orbit direction and distance. It keeps its orbit point
 * inside the visible frame, well clear of the trailing edge, so the player can always see who's
 * shooting from behind. Returns a desired velocity;
 * movement and firing are shared systems in enemies.ts.
 */
export function skirmisher(e: Enemy, w: World, dt: number): { vx: number; vy: number } {
  const b = w.behemoth;
  const o = e.def.engage;
  const ai = e.ai;

  ai.retargetIn -= dt;
  if (ai.retargetIn <= 0) {
    ai.retargetIn = w.rng.range(3, 7);
    if (w.rng.chance(0.4)) ai.orbitDir = ai.orbitDir === 1 ? -1 : 1;
    ai.orbitRange = w.rng.range(o.minRange, o.maxRange);
  }
  ai.orbitAngle += ai.orbitDir * o.angularSpeed * dt;

  const t = inFrame(e, w, b.x + Math.cos(ai.orbitAngle) * ai.orbitRange + b.vx * 0.6, b.y + Math.sin(ai.orbitAngle) * ai.orbitRange);
  return pursue(e, w, t.x, t.y);
}
