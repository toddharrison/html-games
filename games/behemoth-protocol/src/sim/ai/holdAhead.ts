import type { HoldAheadDef } from '../../content/behaviors';
import { hullWidth } from '../behemoth';
import type { Enemy } from '../entities';
import { clamp } from '../math';
import type { World } from '../world';
import type { Goal } from './nav';
import { inFrame } from './steer';

/**
 * Hold-ahead behavior: keep a spot in front of the Behemoth, within `arc` of straight
 * ahead, at the preferred range, drifting slowly across the arc. As the Behemoth advances the unit
 * falls back to keep its distance, so a surge can run down anything slower than top speed.
 *
 * Heavy tanks use a narrow arc and short range (a frontal line that hammers the front armor);
 * missile launchers a wide arc at long range (glass cannons hanging back at the edge of view).
 *
 * A unit that finds itself beside or behind the Behemoth drives up a lane alongside it rather
 * than through it.
 */
export function holdAhead(e: Enemy, d: HoldAheadDef, w: World, dt: number): Goal {
  const b = w.behemoth;
  const o = d.orbit;
  const ai = e.ai;
  const arc = (d.arc * Math.PI) / 180;

  ai.retargetIn -= dt;
  if (ai.retargetIn <= 0) {
    ai.retargetIn = w.rng.range(...d.replan.every);
    if (w.rng.chance(d.replan.flip)) ai.orbitDir = ai.orbitDir === 1 ? -1 : 1;
    ai.orbitRange = w.rng.range(o.minRange, o.maxRange);
  }
  ai.orbitAngle = clamp(ai.orbitAngle + ai.orbitDir * o.angularSpeed * dt, -arc, arc);
  if (Math.abs(ai.orbitAngle) >= arc) ai.orbitDir = ai.orbitAngle > 0 ? -1 : 1;

  let tx = b.x + Math.cos(ai.orbitAngle) * ai.orbitRange;
  let ty = b.y + Math.sin(ai.orbitAngle) * ai.orbitRange;

  // Beside or behind the hull: go around it, up a lane on whichever side the unit is on. (A unit
  // already ahead of the prow doesn't dodge: if the Behemoth outruns it, it gets run down.)
  if (e.x < b.x + b.chassis.length / 2) {
    const side = Math.sign(e.y - b.y) || ai.orbitDir;
    ty = b.y + side * (hullWidth(b) / 2 + e.def.radius + d.laneGap);
    tx = Math.max(tx, e.x + d.laneStep);
  }

  const p = inFrame(e, w, tx, ty);
  return { x: p.x, y: p.y, mode: 'pace' };
}
