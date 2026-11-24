/**
 * Difficulties (SPEC §3; user request, Nov 2026): picked with the Directive at the start of a run and
 * fixed for it. **Hard is the game as tuned**: every number in the other tables is a Hard number.
 * The easier ones scale two things from there: what salvage pays, and the threat every battle's
 * defenders are bought with.
 *
 * The numbers are from autopilot playtests (Nov 24, 2026; FEATURES.md §9 "Difficulty"), for the user
 * to confirm in play. What they showed:
 * - **Threat is the strong lever, salvage the weak one.** An autopilot that takes half damage (a
 *   stand-in for a good pilot) completes about 1 run in 4 on Hard. Salvage alone, +15% to +50%,
 *   moved that by 0 to 9 points; 15% less threat moved it to about 44%, 25% less to about 63%.
 *   So Normal cuts threat too, or it plays like Hard.
 * - **Less threat is less to kill**: a battle won at 0.85 threat pays about 8% less than on Hard,
 *   at 0.75 about 9% less. The salvage bonuses are set over that: a battle won pays about 15% more
 *   than Hard on Normal and about 27% more on Easy.
 */

export type DifficultyId = 'easy' | 'normal' | 'hard';
/** Easiest first, as the picker lists them. */
export const DIFFICULTY_IDS: readonly DifficultyId[] = ['easy', 'normal', 'hard'];

export interface DifficultyDef {
  id: DifficultyId;
  name: string;
  /**
   * Multiplier on salvage earned (1.15 = 15% more): kills, structures, objective shares, the
   * extraction bonus, and what an event pays. Prices, costs, and resale are never scaled.
   */
  salvage: number;
  /**
   * Multiplier on every battle's threat (0.85 = 15% fewer points to buy defenders with): its posts,
   * its alert waves and their cap, and an armored train's armed cars. The last stand's waves, and
   * what a mode fields by the node's strength (fortress guns, haulers, raiders), aren't scaled.
   */
  threat: number;
}

export const DIFFICULTIES: Record<DifficultyId, DifficultyDef> = {
  easy: { id: 'easy', name: 'Easy', salvage: 1.4, threat: 0.75 },
  normal: { id: 'normal', name: 'Normal', salvage: 1.25, threat: 0.85 },
  hard: { id: 'hard', name: 'Hard', salvage: 1, threat: 1 },
};

/** What the run setup opens on, every time (user's call, Nov 2026). */
export const DEFAULT_DIFFICULTY: DifficultyId = 'normal';

/** A difficulty's rules in a line, from its numbers (so the picker follows the tuning). */
export function difficultyBrief(id: DifficultyId): string {
  const d = DIFFICULTIES[id];
  const pct = (scale: number) => `${scale >= 1 ? '+' : '-'}${Math.round(Math.abs(scale - 1) * 100)}%`;
  const parts = [...(d.threat !== 1 ? [`defenders ${pct(d.threat)}`] : []), ...(d.salvage !== 1 ? [`salvage ${pct(d.salvage)}`] : [])];
  return parts.length > 0 ? parts.join(', ') : 'the enemy at full strength, salvage at its bare worth';
}
