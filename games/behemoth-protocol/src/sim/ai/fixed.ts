import type { Enemy } from '../entities';
import type { World } from '../world';

/** Fixed positions (fortress guns, SPEC §4.4 Breach) never move; only their turrets turn. */
export function fixed(_e: Enemy, _w: World, _dt: number): { vx: number; vy: number } {
  return { vx: 0, vy: 0 };
}
