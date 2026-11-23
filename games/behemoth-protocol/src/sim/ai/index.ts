import type { BehaviorDef, BehaviorKind } from '../../content/behaviors';
import type { Enemy } from '../entities';
import type { World } from '../world';
import { ambusher } from './ambusher';
import { besiege } from './besiege';
import { charge } from './charge';
import { convoy } from './convoy';
import { fixed } from './fixed';
import { holdAhead } from './holdAhead';
import { navigate, type Goal, type Velocity } from './nav';
import { skirmisher } from './skirmisher';
import { stalker } from './stalker';
import { weave } from './weave';

/** A behavior's step: where the unit wants to be this tick, from its def (content/behaviors.ts); null = stay put. */
type Step<K extends BehaviorKind> = (e: Enemy, d: Extract<BehaviorDef, { kind: K }>, w: World, dt: number) => Goal | null;

const STEPS: { [K in BehaviorKind]: Step<K> } = {
  skirmisher,
  holdAhead,
  ambusher,
  fixed,
  convoy,
  charge,
  stalker,
};

/**
 * What the unit wants this tick: its own behavior's goal, or in the last stand its siege ring
 * (unless it has none: convoys and bomb trucks keep their own), reached by `navigate`, with a weave
 * on top if it has one.
 */
export function behave(e: Enemy, w: World, dt: number): Velocity {
  const d = e.def.behavior;
  const sieging = w.lastStand !== null && d.siege !== null;
  const goal = sieging ? besiege(e, d.siege!, w, dt) : (STEPS[d.kind] as (e: Enemy, d: BehaviorDef, w: World, dt: number) => Goal | null)(e, d, w, dt);
  const v = goal ? navigate(e, w, goal, dt) : { vx: 0, vy: 0 };
  return d.weave && !sieging ? weave(e, d.weave, w, dt, v) : v;
}
