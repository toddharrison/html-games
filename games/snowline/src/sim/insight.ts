// Reflection (SPEC 8.1): a night's sleep may surface a technique the survivor has the makings of but
// hasn't put together, the in-world hint for a stuck player. Accidents, observation, and failure teach
// the rest where they happen (striking a stone, watching fish, missing them).

import { technique } from '../content/insights.ts';
import { CRAFT_MSG } from '../content/fireText.ts';
import { who } from '../content/messages.ts';
import { BACKGROUNDS } from '../content/protagonists.ts';
import { has } from './inventory.ts';
import { knowsTechnique, learnTechnique } from './knowledge.ts';
import { say } from './log.ts';
import { recall } from './memory.ts';
import { chance } from './rng.ts';
import type { GameState, SimEvent } from './state.ts';
import { clock } from './time.ts';

/** When each technique is ripe for reflection: what the survivor has seen or done. In priority order. */
const RIPE: [string, (s: GameState) => boolean][] = [
  ['kindling', (s) => recall(s, 'fire-fails') >= 1],
  ['tinder-nest', (s) => recall(s, 'fire-fails') >= 2],
  ['cord', (s) => has(s, 'fibre')],
  ['bough-bed', (s) => recall(s, 'slept-on-ground') >= 1],
  ['reflector', (s) => recall(s, 'fire-at-night') >= 1],
  ['bow-drill', (s) => knowsTechnique(s, 'cord') && clock(s.tick).day >= 3 && recall(s, 'fires-lit') === 0],
  ['bark-vessel', (s) => has(s, 'bark')],
  ['spear', (s) => has(s, 'sharp-stick') || recall(s, 'shallows') >= 2],
  ['bank-fire', (s) => recall(s, 'fire-at-night') >= 1],
  ['carry-embers', (s) => recall(s, 'fires-lit') >= 2],
  ['hot-stones', (s) => knowsTechnique(s, 'bark-vessel') && recall(s, 'fires-lit') >= 1],
  ['walls', (s) => recall(s, 'slept-sheltered') >= 2],
  ['woodpile', (s) => recall(s, 'fires-lit') >= 2 && clock(s.tick).day >= 3],
  ['fire-harden', (s) => (has(s, 'spear') || has(s, 'sharp-stick')) && recall(s, 'fires-lit') >= 1],
  ['basket', (s) => has(s, 'bark') && knowsTechnique(s, 'cord') && recall(s, 'full') >= 1],
  ['smoking', (s) => recall(s, 'spoiled') >= 1 && recall(s, 'fires-lit') >= 1],
  ['signal', (s) => s.viewpoints.some(Boolean) && recall(s, 'fires-lit') >= 1],
  ['cache', (s) => recall(s, 'stolen') >= 1 || recall(s, 'bear-seen') >= 1],
  ['snare', (s) => knowsTechnique(s, 'cord') && recall(s, 'seen-hare') >= 1],
  ['bow', (s) => knowsTechnique(s, 'cord') && (has(s, 'spear') || has(s, 'hard-spear')) && clock(s.tick).day >= 6],
  ['weir', (s) => recall(s, 'watched-fish') >= 1],
  ['warm-layers', (s) => has(s, 'hide') && s.vitals.warmth < 50],
  ['splint', (s) => s.conditions.some((c) => c.id === 'sprain')],
];

/** The techniques ripe for reflection now, in priority order. */
export function ripe(s: GameState): string[] {
  return RIPE.filter(([id, ok]) => !knowsTechnique(s, id) && ok(s)).map(([id]) => id);
}

/** After a real night's sleep: perhaps one insight (SPEC 8.1). Readers reflect more often. */
export function reflect(s: GameState, events: SimEvent[]): void {
  const options = ripe(s);
  if (!options.length) return;
  const mult = BACKGROUNDS.find((b) => b.id === s.protagonist.background)?.mods.reflection ?? 1;
  if (!chance(s.rng.events, Math.min(0.95, 0.55 * mult))) return;
  const id = options[0]!;
  say(s, CRAFT_MSG.reflect(who(s.protagonist)), events);
  learnTechnique(s, id, technique(id).learned, events);
}
