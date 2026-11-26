// Shared pieces for actions (SPEC 5.2): the action types and the helpers every system's actions use.
// Systems export their own lists of actions; sim/actions.ts gathers them.

import { SEASONS } from '../content/balance.ts';
import { itemDef } from '../content/items.ts';
import { MSG, who } from '../content/messages.ts';
import type { SkillId } from '../content/protagonists.ts';
import { itemName } from './food.ts';
import { give } from './inventory.ts';
import { say } from './log.ts';
import { nextRange } from './rng.ts';
import { level } from './skills.ts';
import type { Dir, GameState, SimEvent } from './state.ts';
import { clock, daylight } from './time.ts';
import { idx, inBounds, type World } from './world.ts';

const DX = [0, 1, 0, -1] as const;
const DY = [-1, 0, 1, 0] as const;

export interface ActionOption {
  action: string;
  tile: number;
  label: string;
  minutes: number;
}

export interface ActionDef {
  id: string;
  /** The label if this can be done to `tile` now, or null. `front` is true for the faced tile. */
  offer(s: GameState, w: World, tile: number, front: boolean): string | null;
  /** Game minutes it takes, before skill and condition. */
  minutes: number | ((s: GameState, w: World, tile: number) => number);
  skill?: SkillId;
  /** Needs daylight or firelight to do. */
  needsLight?: boolean;
  done(s: GameState, w: World, tile: number, events: SimEvent[]): void;
}

export interface ItemActionDef {
  id: string;
  offer(s: GameState, w: World, slot: number): string | null;
  minutes: number;
  done(s: GameState, w: World, slot: number, events: SimEvent[]): void;
}

/** The tile the survivor faces, or -1 off the map. */
export function frontTile(s: GameState): number {
  const p = s.player;
  const x = p.x + DX[p.facing as Dir];
  const y = p.y + DY[p.facing as Dir];
  return inBounds(x, y) ? idx(x, y) : -1;
}

/** Light enough to work: daylight, or a fire close by. */
export function canSee(s: GameState): boolean {
  if (daylight(s.tick) >= 20) return true;
  const p = s.player;
  return s.lights.some((l) => (l.x - p.x) * (l.x - p.x) + (l.y - p.y) * (l.y - p.y) <= l.radius * l.radius);
}

export function day(s: GameState): number {
  return clock(s.tick).day;
}

export function inSeason(s: GameState, what: keyof typeof SEASONS): boolean {
  const [a, b] = SEASONS[what];
  const d = day(s);
  return d >= a && d <= b;
}

/** Is this tile's food or wood back yet? */
export function ready(s: GameState, tile: number): boolean {
  return (s.regrow[tile] ?? 0) <= s.tick;
}

export function deplete(s: GameState, tile: number, days: number): void {
  s.regrow[tile] = s.tick + days * 14400;
}

export function yieldRoll(s: GameState, lo: number, hi: number, skill: SkillId): number {
  return nextRange(s.rng['skill-checks'], lo, hi) + Math.floor(level(s, skill) / 2);
}

/** Gather `n` of an item into the inventory, saying what was found and what didn't fit. */
export function gather(s: GameState, k: string, n: number, events: SimEvent[], d?: number, noun?: string): number {
  const w = who(s.protagonist);
  const got = give(s, k, n, d, itemDef(k).food ? s.tick : undefined);
  if (got > 0) {
    say(s, MSG.found(w, got, noun ?? itemName(s, { k, n: got, d })), events);
    events.push({ type: 'pickup' });
  }
  if (got < n) say(s, MSG.full(w), events);
  return got;
}
