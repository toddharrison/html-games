import { DIFFICULTIES } from '../content/difficulties';
import { DIRECTIVES } from '../content/directives';
import { addScore, scoreEntry, type ScoreEntry } from '../sim/scores';
import type { RunSummary } from '../sim/run';
import { browserStorage, safe, type StorageLike } from './runSave';

/**
 * The score list (user request, Nov 2026): the best finished runs, for the title screen. Versioned
 * JSON in localStorage beside the run save; kept when a run ends (the run save goes, this stays).
 */

export const SCORES_KEY = 'behemoth-protocol/scores';
export const SCORES_VERSION = 1;

const OUTCOMES = ['won', 'failed', 'destroyed'];

/** A well-formed entry; one saved before difficulties has none (`parseScores` reads it as Hard). */
function isEntry(v: unknown): v is Omit<ScoreEntry, 'difficulty'> & { difficulty?: ScoreEntry['difficulty'] } {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  const num = (k: string) => typeof e[k] === 'number' && Number.isFinite(e[k] as number);
  return (
    typeof e['callsign'] === 'string' &&
    num('score') &&
    OUTCOMES.includes(e['outcome'] as string) &&
    num('reached') &&
    num('sectors') &&
    typeof e['directive'] === 'string' &&
    e['directive'] in DIRECTIVES &&
    (e['difficulty'] === undefined || (typeof e['difficulty'] === 'string' && e['difficulty'] in DIFFICULTIES)) &&
    num('seed') &&
    typeof e['date'] === 'string'
  );
}

/** The list in a scores file; a broken or unknown file reads as empty (entries that don't parse are dropped). */
export function parseScores(text: string): ScoreEntry[] {
  try {
    const file = JSON.parse(text) as unknown;
    if (typeof file !== 'object' || file === null) return [];
    const f = file as Record<string, unknown>;
    if (f['version'] !== SCORES_VERSION || !Array.isArray(f['scores'])) return [];
    return f['scores']
      .filter(isEntry)
      .map((e): ScoreEntry => ({ ...e, difficulty: e.difficulty ?? 'hard' }))
      .sort((a, b) => b.score - a.score);
  } catch {
    return [];
  }
}

export function loadScores(storage: StorageLike | null = browserStorage()): ScoreEntry[] {
  const text = safe(() => storage?.getItem(SCORES_KEY) ?? null, null);
  return text === null ? [] : parseScores(text);
}

/** Adds a finished run to the list and saves it. Returns its place (1-based), or null if it didn't make the list. */
export function recordScore(summary: RunSummary, storage: StorageLike | null = browserStorage(), date = new Date().toISOString().slice(0, 10)): number | null {
  const { list, rank } = addScore(loadScores(storage), scoreEntry(summary, date));
  if (rank !== null && storage) safe(() => storage.setItem(SCORES_KEY, JSON.stringify({ version: SCORES_VERSION, scores: list })), undefined);
  return rank;
}
