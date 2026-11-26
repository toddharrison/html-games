// The weather where the survivor stands. Calm until the weather system arrives (M4, sim/weather.ts).

import type { GameState } from './state.ts';

export function weatherNow(s: GameState): { temp: number; wind: number; wetting: boolean; hot: boolean } {
  void s;
  return { temp: 0, wind: 0, wetting: false, hot: false };
}
