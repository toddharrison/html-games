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
import { screen } from './screen';
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
  screen,
};

const step = (e: Enemy, d: BehaviorDef, w: World, dt: number) => (STEPS[d.kind] as (e: Enemy, d: BehaviorDef, w: World, dt: number) => Goal | null)(e, d, w, dt);

/**
 * What the unit wants this tick: the goal of its role if the battle gave it one (dropped once the
 * role has nothing left to do), else its own behavior's; or in the last stand its siege ring (unless
 * it has none: convoys and bomb trucks keep running). Reached by `navigate`, with the unit's weave
 * on top if it has one.
 */
export function behave(e: Enemy, w: World, dt: number): Velocity {
  const own = e.def.behavior;
  const sieging = w.lastStand !== null && own.siege !== null;
  let goal: Goal | null;
  if (sieging) goal = besiege(e, own.siege!, w, dt);
  else {
    goal = e.role ? step(e, e.role, w, dt) : null;
    if (!goal) {
      e.role = undefined;
      goal = step(e, own, w, dt);
    }
  }
  const v = goal ? navigate(e, w, goal, dt) : { vx: 0, vy: 0 };
  return own.weave && !sieging ? weave(e, own.weave, w, dt, v) : v;
}
