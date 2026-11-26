// Menu contents that come from the simulation: what to rest for, and what can be made.

import { craftOptions } from '../sim/craft.ts';
import type { GameState } from '../sim/state.ts';
import { clock } from '../sim/time.ts';
import type { World } from '../sim/world.ts';

export interface RestOption {
  label: string;
  minutes: number;
  awake: boolean;
}

/** Minutes from now until a time of day (the next one). */
function until(s: GameState, hour: number, minute = 0): number {
  const now = clock(s.tick).minute;
  const target = hour * 60 + minute;
  return ((target - now + 1440) % 1440) || 1440;
}

export function restOptions(s: GameState): RestOption[] {
  return [
    { label: 'Sit and rest for an hour', minutes: 60, awake: true },
    { label: 'Sleep for three hours', minutes: 180, awake: false },
    { label: 'Sleep until first light', minutes: until(s, 5, 45), awake: false },
    { label: 'Sleep until the sun is up', minutes: until(s, 7, 30), awake: false },
  ];
}

export function craftMenu(s: GameState, w: World, run: (recipe: string, label: string) => void) {
  return craftOptions(s, w).map((o) => ({
    label: o.label,
    hint: o.missing ? `needs ${o.missing}` : `${o.minutes} min`,
    disabled: !!o.missing,
    run: () => run(o.recipe, o.label),
  }));
}
