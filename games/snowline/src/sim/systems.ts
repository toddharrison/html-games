// The hooks later systems plug into the step (fire, weather, animals, the run's events): per tick, per
// game minute, extra commands, and tiles they open or block. Each system registers here, in a fixed
// order, so the step stays short and the order systems run in never changes by accident.

import type { Command, GameState, SimEvent } from './state.ts';
import type { World } from './world.ts';
import { fireMinute } from './fire.ts';

type Hook = (s: GameState, w: World, events: SimEvent[]) => void;

const TICK: Hook[] = [];
const MINUTE: Hook[] = [];

export function tickHooks(s: GameState, w: World, events: SimEvent[]): void {
  for (const h of TICK) h(s, w, events);
}

export function minuteHooks(s: GameState, w: World, events: SimEvent[]): void {
  fireMinute(s, w, events, 0, () => false);
  for (const h of MINUTE) h(s, w, events);
}

/** Commands a later system handles (crafting, building, ...). */
export function commandHooks(s: GameState, w: World, cmd: Command, events: SimEvent[]): void {
  void s;
  void w;
  void cmd;
  void events;
}

/**
 * Whether something in the state overrides the map at a tile: false opens a tile the map blocks (the
 * rockslide's gap after the storm), true blocks one; null leaves the map's answer.
 */
export function blockedBySystems(s: GameState, w: World, x: number, y: number): boolean | null {
  void w;
  // A fire is not walked through.
  if (s.fires.some((f) => f.x === x && f.y === y)) return true;
  return null;
}
