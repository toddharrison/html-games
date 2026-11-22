import { MODES } from '../../content/modes';
import type { Enemy } from '../entities';
import type { World } from '../world';
import { viaFord } from './crossing';

/** How far up the lane a convoy vehicle steers for. */
const LOOK_AHEAD = 60;

/**
 * Convoy (SPEC §4.4 Chase): drive up the guaranteed lane for the far end at the convoy's pace,
 * keeping its own place across the lane, by a ford or bridge where a river crosses. Damage slows
 * it (shoot the haulers to catch them); it never turns to fight.
 */
export function convoy(e: Enemy, w: World, _dt: number): { vx: number; vy: number } {
  const hurt = MODES.chase.convoy?.hurt ?? 1;
  const base = w.objective.convoySpeed > 0 ? w.objective.convoySpeed : e.def.maxSpeed * 0.6;
  const pace = base * (hurt + (1 - hurt) * Math.max(0, e.hp / e.def.hp));
  let tx = e.x + LOOK_AHEAD;
  let ty = w.terrain.laneY(tx) + (e.ai.laneOffset ?? 0);
  const ford = viaFord(e, w, tx, ty);
  if (ford) {
    tx = ford.x;
    ty = ford.y;
  }
  const dx = tx - e.x;
  const dy = ty - e.y;
  const d = Math.hypot(dx, dy) || 1;
  return { vx: (dx / d) * pace, vy: (dy / d) * pace };
}
