import type { SkirmisherDef } from '../../content/behaviors';
import type { Enemy } from '../entities';
import type { World } from '../world';
import type { Goal } from './nav';
import { inFrame } from './steer';

/**
 * Skirmisher behavior (light tanks, hovercraft, ski troops): circle the Behemoth at a preferred
 * range, matching its forward speed, occasionally changing orbit direction and distance. It keeps
 * its orbit point inside the visible frame, well clear of the trailing edge, so the player can
 * always see who's shooting from behind. Returns where it wants to be; getting there is `navigate`'s
 * job, and movement and firing are shared systems in enemies.ts.
 */
export function skirmisher(e: Enemy, d: SkirmisherDef, w: World, dt: number): Goal {
  const b = w.behemoth;
  const o = d.orbit;
  const ai = e.ai;

  ai.retargetIn -= dt;
  if (ai.retargetIn <= 0) {
    ai.retargetIn = w.rng.range(...d.replan.every);
    if (w.rng.chance(d.replan.flip)) ai.orbitDir = ai.orbitDir === 1 ? -1 : 1;
    ai.orbitRange = w.rng.range(o.minRange, o.maxRange);
  }
  ai.orbitAngle += ai.orbitDir * o.angularSpeed * dt;

  const p = inFrame(e, w, b.x + Math.cos(ai.orbitAngle) * ai.orbitRange + b.vx * d.lead, b.y + Math.sin(ai.orbitAngle) * ai.orbitRange);
  return { x: p.x, y: p.y, mode: 'pace' };
}
