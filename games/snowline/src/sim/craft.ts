// Crafting (SPEC 8.2): recipes locked behind techniques, made from what is carried, taking time and
// sometimes failing at low skill. The recipes themselves arrive in M3 (content/recipes.ts).

import type { GameState } from './state.ts';
import type { World } from './world.ts';

export interface CraftOption {
  recipe: string;
  label: string;
  minutes: number;
  /** What's lacking, or '' if it can be made now. */
  missing: string;
}

export function craftOptions(s: GameState, w: World): CraftOption[] {
  void s;
  void w;
  return [];
}
