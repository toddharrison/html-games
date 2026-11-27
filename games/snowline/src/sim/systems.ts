// The hooks later systems plug into the step (fire, weather, animals, the run's events): per tick, per
// game minute, extra commands, and tiles they open or block. Each system registers here, in a fixed
// order, so the step stays short and the order systems run in never changes by accident.

import type { Command, GameState, SimEvent } from './state.ts';
import type { World } from './world.ts';
import { fireMinute, strikeSnag } from './fire.ts';
import { rainOn, weatherMinute, weatherNow } from './weather.ts';
import { animalAt, animalsTick, blocks } from './animals.ts';
import { hazardsMinute } from './hazards.ts';
import { trapsHour } from './hunting.ts';
import { sightOf } from './sight.ts';
import { arcMinute, arcOpens } from './arc.ts';
import { idx } from './world.ts';
import { fishMinute, fishTick } from './fish.ts';
import { noticeMinute } from './notice.ts';
import { thinkMinute } from './thoughts.ts';

type Hook = (s: GameState, w: World, events: SimEvent[]) => void;

const TICK: Hook[] = [];
const MINUTE: Hook[] = [];

export function tickHooks(s: GameState, w: World, events: SimEvent[]): void {
  animalsTick(s, w, events, sightOf(s));
  fishTick(s, w, events);
  for (const h of TICK) h(s, w, events);
}

export function minuteHooks(s: GameState, w: World, events: SimEvent[]): void {
  const wind = weatherNow(s, w).wind;
  fireMinute(s, w, events, wind, (f) => rainOn(s, w, f));
  weatherMinute(s, w, events, () => strikeSnag(s, w, events));
  hazardsMinute(s, w, events);
  arcMinute(s, w, events);
  if (s.tick % 600 === 0) trapsHour(s, w, events);
  fishMinute(s, w);
  noticeMinute(s, w, events);
  thinkMinute(s, w, events);
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
  // A fire is not walked through, nor a big animal.
  if (s.fires.some((f) => f.x === x && f.y === y)) return true;
  const a = animalAt(s, x, y);
  if (a && blocks(a)) return true;
  if (arcOpens(s, w, idx(x, y))) return false;
  return null;
}
