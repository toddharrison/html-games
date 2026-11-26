// Setting up each system at the start of a run (the weather's forecast, the animals, the run's events).
// Later systems add their setup here.

import type { GameState } from './state.ts';
import type { World } from './world.ts';
import { makeForecast } from './weather.ts';
import { spawnAnimals } from './animals.ts';
import { planArc } from './arc.ts';

export function startSystems(s: GameState, w: World): void {
  s.weather = makeForecast(s.rng.weather);
  spawnAnimals(s, w);
  s.arc = planArc(s);
}
