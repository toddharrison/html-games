// Setting up each system at the start of a run (the weather's forecast, the animals, the run's events).
// Later systems add their setup here.

import type { GameState } from './state.ts';
import type { World } from './world.ts';

export function startSystems(s: GameState, w: World): void {
  void s;
  void w;
}
