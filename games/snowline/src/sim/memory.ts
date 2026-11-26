// The survivor's memory of what has happened (fires lit, fires failed, nights by a fire), as counts.
// Reflection and insights read it (SPEC 8.1).

import type { GameState } from './state.ts';

/** Add to a count and return the new value. */
export function remember(s: GameState, key: string, n = 1): number {
  s.memory[key] = (s.memory[key] ?? 0) + n;
  return s.memory[key]!;
}

export function recall(s: GameState, key: string): number {
  return s.memory[key] ?? 0;
}
