import type { BehaviorId } from '../../content/enemies';
import type { Enemy } from '../entities';
import type { World } from '../world';
import { ambusher } from './ambusher';
import { charge } from './charge';
import { convoy } from './convoy';
import { fixed } from './fixed';
import { holdAhead } from './holdAhead';
import { skier } from './skier';
import { skirmisher } from './skirmisher';
import { stalker } from './stalker';

/** A behavior decides where a unit wants to go this tick (as a desired velocity). */
export type Behavior = (e: Enemy, w: World, dt: number) => { vx: number; vy: number };

export const BEHAVIORS: Record<BehaviorId, Behavior> = {
  skirmisher,
  holdAhead,
  ambusher,
  fixed,
  convoy,
  charge,
  skier,
  stalker,
};
