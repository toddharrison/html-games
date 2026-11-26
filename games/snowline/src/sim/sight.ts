// How far the survivor sees (SPEC 6.4): daylight, less in fog, less again with broken glasses.

import { WEATHER } from '../content/weather.ts';
import type { GameState } from './state.ts';
import { sightRadius } from './time.ts';
import { weatherAt } from './weather.ts';

export function sightOf(s: GameState): number {
  let r = sightRadius(s.tick);
  const fog = WEATHER[weatherAt(s)].fog;
  if (fog > 0) r = Math.max(2, Math.round(r * (1 - fog)));
  if (s.memory['glasses-broken'] && r > 5) r -= 3;
  return r;
}
