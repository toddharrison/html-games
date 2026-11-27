// The kid's notebook gets wet (SPEC 8.1, 12.1): it rides in a pocket, so when the kid is soaked
// (wading, a fall in the water, rain with no shelter) it soaks through too, and it dries slowly after.
// Each soaking leaves a tide mark; time spent soaked leaves damage that never mends. What was written
// before a soaking smudges; what's written after is clean. Kept in `memory`, so saves carry it; the
// journal and the map draw it (ui/journal.ts, render/kidMap.ts).

import type { GameState } from './state.ts';

/** How wet the notebook is now (0–100), how many times it's been soaked, its lasting damage (0–100), and when it was last soaked (tick, or -1). */
export interface NotebookWear {
  damp: number;
  soakings: number;
  damage: number;
  soakedAt: number;
}

/** Clothes this wet soak the notebook through. */
const SOAKS_AT = 30;
/** A notebook this wet is soaked: a tide mark, and damage while it stays so. */
const SOAKED = 50;
/** How fast it takes up water from soaked clothes (a share of the difference a minute), and dries (points a minute). */
const TAKE_UP = 0.25;
const DRY = 0.2;
/** Damage a minute, fully soaked; nothing below `SOAKED`. About 20 soaked minutes leave a point. */
const HARM = 0.05;

export function notebookWear(s: GameState): NotebookWear {
  return {
    damp: s.memory['notebook-damp'] ?? 0,
    soakings: s.memory['notebook-soakings'] ?? 0,
    damage: s.memory['notebook-damage'] ?? 0,
    soakedAt: s.memory['notebook-soaked-at'] ?? -1,
  };
}

/** Each game minute: the notebook takes up water from soaked clothes, or dries; soaked, it's harmed. */
export function notebookMinute(s: GameState): void {
  const was = s.memory['notebook-damp'] ?? 0;
  const wet = s.player.wet;
  let damp = was;
  if (wet >= SOAKS_AT && wet > damp) damp = Math.min(100, damp + (wet - damp) * TAKE_UP);
  else damp = Math.max(0, damp - DRY);
  if (damp === was) return;
  s.memory['notebook-damp'] = damp;
  if (was < SOAKED && damp >= SOAKED) {
    s.memory['notebook-soakings'] = (s.memory['notebook-soakings'] ?? 0) + 1;
    s.memory['notebook-soaked-at'] = s.tick;
  }
  if (damp >= SOAKED) {
    s.memory['notebook-damage'] = Math.min(100, (s.memory['notebook-damage'] ?? 0) + (HARM * (damp - SOAKED)) / (100 - SOAKED) + HARM / 4);
    // Still soaked: what's written so far is under water too.
    s.memory['notebook-soaked-at'] = s.tick;
  }
}
