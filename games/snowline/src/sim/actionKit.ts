// Shared pieces for actions (SPEC 5.2): the action types and the helpers every system's actions use.
// Systems export their own lists of actions; sim/actions.ts gathers them.

import { DAY, SEASONS } from '../content/balance.ts';
import { itemDef } from '../content/items.ts';
import { MSG, who } from '../content/messages.ts';
import type { SkillId } from '../content/protagonists.ts';
import { itemName } from './food.ts';
import { giveOrDrop } from './inventory.ts';
import { say } from './log.ts';
import { nextRange } from './rng.ts';
import { level } from './skills.ts';
import type { Dir, GameState, SimEvent } from './state.ts';
import { lightsOf } from './surroundings.ts';
import { clock, daylight } from './time.ts';
import { idx, inBounds, type World } from './world.ts';

const DX = [0, 1, 0, -1] as const;
const DY = [-1, 0, 1, 0] as const;

export interface ActionOption {
  action: string;
  tile: number;
  label: string;
  minutes: number;
  /** Why it can't be done just now (picked over, stripped, hands full); the menu shows it greyed out with this. */
  spent?: string;
}

export interface ActionDef {
  id: string;
  /** The label if this can be done to `tile` now, or null. `front` is true for the faced tile. */
  offer(s: GameState, w: World, tile: number, front: boolean): string | null;
  /** For something on offer: why it can't be done again yet (a few words), or null if it can. */
  spent?(s: GameState, w: World, tile: number): string | null;
  /** Game minutes it takes, before skill and condition. */
  minutes: number | ((s: GameState, w: World, tile: number) => number);
  skill?: SkillId;
  /** Needs daylight or firelight to do. */
  needsLight?: boolean;
  /** Started only by a command that names it (placing from the Make panel), never offered in a menu or by a click. */
  unlisted?: boolean;
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
  return lightsOf(s).some((l) => (l.x - p.x) * (l.x - p.x) + (l.y - p.y) * (l.y - p.y) <= l.radius * l.radius);
}

export function day(s: GameState): number {
  return clock(s.tick).day;
}

export function inSeason(s: GameState, what: keyof typeof SEASONS): boolean {
  const [a, b] = SEASONS[what];
  const d = day(s);
  return d >= a && d <= b;
}

/** Is this tile's food back yet? (What never grows back is counted in `taken` instead: `supplyLeft`.) */
export function ready(s: GameState, tile: number): boolean {
  return (s.regrow[tile] ?? 0) <= s.tick;
}

export function deplete(s: GameState, tile: number, days: number): void {
  s.regrow[tile] = s.tick + days * DAY;
}

/** How many more times a harvest that never comes back can be taken from a tile (of `supply`). */
export function supplyLeft(s: GameState, tile: number, kind: string, supply: number): number {
  return Math.max(0, supply - (s.taken[`${kind}${tile}`] ?? 0));
}

/** Take once from a harvest that never comes back. */
export function useSupply(s: GameState, tile: number, kind: string): void {
  const key = `${kind}${tile}`;
  s.taken[key] = (s.taken[key] ?? 0) + 1;
}

/** A `spent` for a harvest that never comes back: `why` once it's used up. */
export const spentWhenUsedUp =
  (why: string, kind: string, supply: number) =>
  (s: GameState, _w: World, tile: number): string | null =>
    supplyLeft(s, tile, kind, supply) > 0 ? null : why;

/** A `spent` for a harvest that grows back: `why` once it's been taken, until it's back. */
export const spentUntilBack =
  (why: string) =>
  (s: GameState, _w: World, tile: number): string | null =>
    ready(s, tile) ? null : why;

export function yieldRoll(s: GameState, lo: number, hi: number, skill: SkillId): number {
  return nextRange(s.rng['skill-checks'], lo, hi) + Math.floor(level(s, skill) / 2);
}

/**
 * Take `n` of an item into the inventory, after a log line saying what was found or made. What doesn't
 * fit is set down at the survivor's feet, to pick up later, and the log says so. Returns how many were
 * set down. `t` is when food was gathered (now, by default).
 */
export function receive(s: GameState, k: string, n: number, events: SimEvent[], d?: number, t?: number): number {
  const left = giveOrDrop(s, k, n, d, t ?? (itemDef(k).food ? s.tick : undefined));
  if (left > 0) {
    say(s, MSG.setDown(who(s.protagonist), left < n ? 'the rest' : n === 1 ? 'it' : 'them'), events);
    s.memory.full = (s.memory.full ?? 0) + 1;
  }
  return left;
}

/** Gather `n` of an item, saying what was found; what didn't fit is set down at the survivor's feet. Returns how many went in the inventory. */
export function gather(s: GameState, k: string, n: number, events: SimEvent[], d?: number, noun?: string): number {
  say(s, MSG.found(who(s.protagonist), n, noun ?? itemName(s, { k, n, d })), events);
  events.push({ type: 'pickup' });
  return n - receive(s, k, n, events, d);
}
