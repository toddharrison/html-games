// Menu contents that come from the simulation: what to rest for. (What can be made is the Make page, ui/make.ts.)

import type { GameState } from '../sim/state.ts';
import { minutesUntil } from '../sim/time.ts';

export interface RestOption {
  label: string;
  minutes: number;
  awake: boolean;
}

export function restOptions(s: GameState): RestOption[] {
  return [
    { label: 'Sit and rest for an hour', minutes: 60, awake: true },
    { label: 'Sleep for three hours', minutes: 180, awake: false },
    { label: 'Sleep until first light', minutes: minutesUntil(s.tick, 5, 45), awake: false },
    { label: 'Sleep until the sun is up', minutes: minutesUntil(s.tick, 7, 30), awake: false },
  ];
}
