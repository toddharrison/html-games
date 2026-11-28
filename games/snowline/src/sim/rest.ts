// Lying down (SPEC 7.1): resting or sleeping for a while, from the rest menu (a sleep command) or a
// shelter or bed clicked (camp.ts). Kept apart from step.ts so the camp's actions can use it without an
// import cycle.

import { TICKS_PER_MINUTE } from '../content/balance.ts';
import { MSG, who } from '../content/messages.ts';
import { say } from './log.ts';
import type { GameState, SimEvent } from './state.ts';

/** Lie down to rest (`awake`) or sleep for a while: from the rest menu, or a lean-to or bed clicked. */
export function lieDown(s: GameState, minutes: number, awake: boolean, events: SimEvent[], text?: string): void {
  s.sleep = { until: s.tick + Math.max(1, Math.round(minutes)) * TICKS_PER_MINUTE, awake, from: s.tick };
  s.player.intent = -1;
  s.player.queued = -1;
  say(s, text ?? (awake ? MSG.rest(who(s.protagonist)) : MSG.sleep(who(s.protagonist))), events);
  events.push({ type: 'sleep' });
}
