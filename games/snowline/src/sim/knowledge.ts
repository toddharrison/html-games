// What the survivor knows (SPEC 6.6, 8.1): valley facts (this valley's dealt rules, suspected or known),
// techniques (the same in every valley), and the dealt things they have come across. The UI shows only
// what is here, never GameState.rules.

import { DANGER_ANIMALS, PLANTS, REMEDIES, SIGNS, STONES, TINDERS, WATER_SOURCES, WOODS } from '../content/decks.ts';
import { say } from './log.ts';
import type { Fact, GameState, SimEvent } from './state.ts';

export type Row = 'plant' | 'remedy' | 'stone' | 'wood' | 'tinder' | 'water' | 'temper' | 'sign';

export const ROWS: { row: Row; title: string; things: readonly { name: string }[] }[] = [
  { row: 'plant', title: 'Wild plants', things: PLANTS },
  { row: 'remedy', title: 'Remedies', things: REMEDIES },
  { row: 'stone', title: 'Stone', things: STONES },
  { row: 'wood', title: 'Wood', things: WOODS },
  { row: 'tinder', title: 'Tinder', things: TINDERS },
  { row: 'water', title: 'Water', things: WATER_SOURCES },
  { row: 'temper', title: 'Animals', things: DANGER_ANIMALS },
  { row: 'sign', title: 'Weather signs', things: SIGNS },
];

export function key(row: Row, i: number): string {
  return `${row}:${i}`;
}

/** Note that the survivor has come across a dealt thing: it gets a row in the valley notes. */
export function see(s: GameState, row: Row, i: number): void {
  const k = key(row, i);
  if (!s.known.seen.includes(k)) s.known.seen.push(k);
}

export function fact(s: GameState, row: Row, i: number): Fact | null {
  return s.known.facts.find((f) => f.key === key(row, i)) ?? null;
}

/** The dealt thing of a row the survivor knows to have this outcome (its index), or -1. */
export function knownWith(s: GameState, row: Row, value: string): number {
  const f = s.known.facts.find((x) => x.key.startsWith(`${row}:`) && x.level === 'known' && x.value === value);
  return f ? Number(f.key.split(':')[1]) : -1;
}

export function knows(s: GameState, row: Row, i: number): boolean {
  return fact(s, row, i)?.level === 'known';
}

/**
 * Learn something about a dealt thing. A known fact is never downgraded to a suspicion. Returns true
 * if this was new (and says so in the log, and counts as a discovery).
 */
export function learn(s: GameState, row: Row, i: number, level: 'suspected' | 'known', value: string, how: string, events: SimEvent[]): boolean {
  see(s, row, i);
  const k = key(row, i);
  const old = s.known.facts.find((f) => f.key === k);
  if (old && (old.level === 'known' || (old.level === level && old.value === value))) return false;
  const f: Fact = { key: k, level, value, how, tick: s.tick };
  if (old) Object.assign(old, f);
  else s.known.facts.push(f);
  s.known.facts.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  if (level === 'known') {
    s.stats.discoveries++;
    s.vitals.morale = Math.min(100, s.vitals.morale + 5);
  }
  events.push({ type: 'discovery', key: k });
  return true;
}

export function knowsTechnique(s: GameState, id: string): boolean {
  return s.known.techniques.includes(id);
}

/** Learn a technique. Returns true if it was new. */
export function learnTechnique(s: GameState, id: string, text: string, events: SimEvent[]): boolean {
  if (s.known.techniques.includes(id)) return false;
  s.known.techniques.push(id);
  s.known.techniques.sort();
  s.stats.discoveries++;
  s.vitals.morale = Math.min(100, s.vitals.morale + 6);
  say(s, text, events);
  events.push({ type: 'discovery', key: `technique:${id}` });
  return true;
}

/** A dealt thing's name as the survivor knows it: its look, and what has been learned ("red berries: safe"). */
export function thingName(s: GameState, row: Row, i: number): string {
  const base = ROWS.find((r) => r.row === row)!.things[i]?.name ?? '?';
  const f = fact(s, row, i);
  if (!f) return base;
  return `${base} (${f.level === 'suspected' ? `${f.value}?` : f.value})`;
}

/** The bare name of a dealt thing, as it looks. */
export function lookName(row: Row, i: number): string {
  return ROWS.find((r) => r.row === row)!.things[i]?.name ?? '?';
}
