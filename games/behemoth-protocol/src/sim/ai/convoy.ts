import type { ConvoyDef } from '../../content/behaviors';
import { MODES } from '../../content/modes';
import type { Enemy } from '../entities';
import { clamp } from '../math';
import type { World } from '../world';
import type { Goal } from './nav';

/**
 * Convoy (SPEC §4.4 Chase): drive up the guaranteed lane for the far end at the convoy's pace,
 * keeping its own place across the lane (`navigate` finds the ford or bridge where a river crosses,
 * and the way round a town in the lane). Damage slows it (shoot the haulers to catch them); it
 * never turns to fight. The Chase mode's rules (`MODES.chase.convoy`) hold the convoy together:
 * - the column: a healthy vehicle closes up behind the nearest healthy one ahead (the lead never waits);
 * - the alarm: with the Behemoth near, healthy vehicles sprint and spread across the lane;
 * - triage: a badly hurt vehicle gives way, pulling aside out of the column, and is left behind.
 * A mine layer (`mines`) steers onto the hull's line while the hull is close behind it.
 */
export function convoy(e: Enemy, d: ConvoyDef, w: World, _dt: number): Goal {
  const c = MODES.chase.convoy;
  const share = Math.max(0, e.hp / e.def.hp);
  const hurt = c?.hurt ?? 1;
  const base = (w.objective.convoySpeed > 0 ? w.objective.convoySpeed : e.def.maxSpeed * d.idlePace) * (hurt + (1 - hurt) * share);
  const x = e.x + d.lookAhead;
  const lane = w.terrain.laneY(x);
  let offset = e.ai.laneOffset ?? 0;
  let pace = base;
  if (c) {
    const side = Math.sign(offset) || e.ai.orbitDir;
    if (share < c.hurtAt) {
      offset = side * c.aside;
    } else {
      if (w.objective.alarm > 0) {
        pace *= c.sprint;
        offset = side * Math.max(Math.abs(offset), c.spread);
      }
      const ahead = nextAhead(e, w, c.hurtAt);
      if (ahead) pace = clamp(pace + (ahead.x - e.x - c.spacing) * c.cohesion.gain, 0, pace * c.cohesion.max);
    }
  }
  let y = lane + offset;
  const m = d.mines;
  const b = w.behemoth;
  if (m && e.x > b.x && e.x - b.x <= m.range) {
    // Where the hull will be when it reaches this spot, on its present course.
    const t = Math.min(m.lead, (e.x - b.x) / Math.max(1, b.vx));
    y = b.y + b.vy * t;
  }
  return { x, y, mode: 'speed', speed: Math.min(pace, e.def.maxSpeed) };
}

/** The nearest healthy convoy vehicle ahead of this one (the one it keeps station on). */
function nextAhead(e: Enemy, w: World, hurtAt: number): Enemy | null {
  let best: Enemy | null = null;
  for (const o of w.enemies) {
    if (o === e || !o.alive || o.def.behavior.kind !== 'convoy' || o.x <= e.x || o.hp / o.def.hp < hurtAt) continue;
    if (!best || o.x < best.x) best = o;
  }
  return best;
}
