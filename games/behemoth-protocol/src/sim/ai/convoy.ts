import type { ConvoyDef } from '../../content/behaviors';
import { MODES } from '../../content/modes';
import type { Enemy } from '../entities';
import type { World } from '../world';
import type { Goal } from './nav';

/**
 * Convoy (SPEC §4.4 Chase): drive up the guaranteed lane for the far end at the convoy's pace,
 * keeping its own place across the lane (`navigate` finds the ford or bridge where a river crosses,
 * and the way round a town in the lane). Damage slows it (shoot the haulers to catch them); it
 * never turns to fight.
 */
export function convoy(e: Enemy, d: ConvoyDef, w: World, _dt: number): Goal {
  const hurt = MODES.chase.convoy?.hurt ?? 1;
  const base = w.objective.convoySpeed > 0 ? w.objective.convoySpeed : e.def.maxSpeed * d.idlePace;
  const pace = base * (hurt + (1 - hurt) * Math.max(0, e.hp / e.def.hp));
  const x = e.x + d.lookAhead;
  return { x, y: w.terrain.laneY(x) + (e.ai.laneOffset ?? 0), mode: 'speed', speed: pace };
}
