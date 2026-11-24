import type { DifficultyId } from '../content/difficulties';
import type { DirectiveId } from '../content/directives';
import { SCORE } from '../content/tuning';
import type { RunOutcome, RunSummary } from './run';

/**
 * Run scores (user request, Nov 2026): each finished run's score, kept as a short list for the
 * title screen. A run scores for what it destroyed, what it earned, how far it fought, and the
 * Directive (SPEC §3): kills, salvage, battles won, sector objectives taken, and a bonus for the
 * Directive complete.
 */

export interface ScoreEntry {
  callsign: string;
  score: number;
  outcome: RunOutcome;
  /** Sectors reached, of the run's sectors. */
  reached: number;
  sectors: number;
  directive: DirectiveId;
  /** The difficulty it was played at (an entry saved before difficulties reads as Hard). */
  difficulty: DifficultyId;
  seed: number;
  /** When it ended (an ISO date, YYYY-MM-DD). */
  date: string;
}

export function runScore(s: RunSummary): number {
  const taken = s.objectives.filter(Boolean).length;
  return (
    s.kills * SCORE.kill + s.earned * SCORE.salvage + s.battles * SCORE.battle + taken * SCORE.objective + (s.outcome === 'won' ? SCORE.won : 0)
  );
}

export function scoreEntry(s: RunSummary, date: string): ScoreEntry {
  return { callsign: s.callsign, score: runScore(s), outcome: s.outcome, reached: s.reached, sectors: s.sectors, directive: s.directive, difficulty: s.difficulty, seed: s.seed, date };
}

/**
 * The list with `entry` added, best first, cut to `keep` (an equal score goes below the ones already
 * there). `rank` is the entry's place (1-based), or null when it didn't make the list.
 */
export function addScore(list: readonly ScoreEntry[], entry: ScoreEntry, keep: number = SCORE.keep): { list: ScoreEntry[]; rank: number | null } {
  const at = list.findIndex((e) => e.score < entry.score);
  const i = at === -1 ? list.length : at;
  const next = [...list.slice(0, i), entry, ...list.slice(i)].slice(0, keep);
  return { list: next, rank: i < keep ? i + 1 : null };
}
