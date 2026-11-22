import { describe, expect, it } from 'vitest';
import { SCORE } from '../../src/content/tuning';
import { loadScores, parseScores, recordScore, SCORES_KEY } from '../../src/save/scores';
import { newRun, summarizeRun, type RunSummary } from '../../src/sim/run';
import { addScore, runScore, scoreEntry } from '../../src/sim/scores';

function storage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
}

function summary(over: Partial<RunSummary> = {}): RunSummary {
  return { ...summarizeRun({ ...newRun(7), next: 'won' }), ...over };
}

describe('run scores', () => {
  it('counts kills, salvage, battles, objectives taken, and a Directive complete', () => {
    const s = summary({ kills: 40, earned: 900, battles: 8, objectives: [true, false, true], outcome: 'won' });
    expect(runScore(s)).toBe(40 * SCORE.kill + 900 * SCORE.salvage + 8 * SCORE.battle + 2 * SCORE.objective + SCORE.won);
    expect(runScore({ ...s, outcome: 'destroyed' })).toBe(runScore(s) - SCORE.won);
  });

  it('keeps the list best first, cut short, and says where a run placed', () => {
    const at = (score: number) => ({ ...scoreEntry(summary(), '2026-11-22'), score });
    let list = [at(500), at(300)];
    const mid = addScore(list, at(400), 3);
    expect(mid.rank).toBe(2);
    expect(mid.list.map((e) => e.score)).toEqual([500, 400, 300]);
    // A tie goes under the runs already there; off the end of a full list, it doesn't place.
    expect(addScore(mid.list, at(300), 3).rank).toBeNull();
    list = addScore(mid.list, at(600), 3).list;
    expect(list.map((e) => e.score)).toEqual([600, 500, 400]);
  });

  it('saves to its own namespaced key, and reads back only what parses', () => {
    const st = storage();
    expect(SCORES_KEY.startsWith('behemoth-protocol/')).toBe(true);
    expect(recordScore(summary({ kills: 10 }), st, '2026-11-20')).toBe(1);
    expect(recordScore(summary({ kills: 50, callsign: 'Belial' }), st, '2026-11-21')).toBe(1);
    expect(recordScore(summary({ kills: 20 }), st, '2026-11-22')).toBe(2);
    const scores = loadScores(st);
    expect(scores.map((e) => e.callsign)[0]).toBe('Belial');
    expect(scores).toHaveLength(3);
    expect(scores[2]!.date).toBe('2026-11-20');
    expect(parseScores('not json')).toEqual([]);
    expect(parseScores(JSON.stringify({ version: 99, scores: [] }))).toEqual([]);
    expect(parseScores(JSON.stringify({ version: 1, scores: [{ callsign: 'x' }, scores[0]] }))).toHaveLength(1);
    // No storage at all: nothing breaks.
    expect(loadScores(null)).toEqual([]);
  });
});
