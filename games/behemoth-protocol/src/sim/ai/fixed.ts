import type { FixedDef } from '../../content/behaviors';
import type { Enemy } from '../entities';
import type { World } from '../world';
import type { Goal } from './nav';

/** Fixed positions (fortress guns, SPEC §4.4 Breach) never move; only their turrets turn. */
export function fixed(_e: Enemy, _d: FixedDef, _w: World, _dt: number): Goal | null {
  return null;
}
