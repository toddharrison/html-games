// The message log (SPEC 12.2): short, plain, past-tense sentences.

import type { GameState, SimEvent } from './state.ts';

const KEEP = 300;

export function say(s: GameState, text: string, events?: SimEvent[]): void {
  s.log.push({ t: s.tick, text });
  if (s.log.length > KEEP) s.log.splice(0, s.log.length - KEEP);
  events?.push({ type: 'say', text });
}
