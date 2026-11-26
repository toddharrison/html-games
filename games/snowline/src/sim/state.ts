// The GameState type (SPEC 11.3, rule 7): plain, JSON-serialisable data with no class instances or
// functions. With the world (rebuilt from the seed), it is everything the simulation knows.

import type { AnimalKind } from '../content/animals.ts';
import type { ConditionId } from '../content/conditions.ts';
import type { SkillId } from '../content/protagonists.ts';
import type { Protagonist } from './protagonist.ts';
import type { RngState, StreamName } from './rng.ts';
import type { Rules } from './rules.ts';

/** Facing and movement directions: north, east, south, west. */
export type Dir = 0 | 1 | 2 | 3;

export interface PlayerState {
  x: number;
  y: number;
  facing: Dir;
  /** The tile the current step started from, for the renderer to slide between. */
  fromX: number;
  fromY: number;
  /** Ticks left in the current step, and its full length. 0 when standing. */
  stepLeft: number;
  stepTotal: number;
  /** The direction held down, or -1. */
  intent: Dir | -1;
  /** A direction pressed since the last step began; taken once even if already released. -1 if none. */
  queued: Dir | -1;
  /** Already bumped into what's in front; quiet until the survivor moves or turns. */
  bumped: boolean;
  /** How wet the clothes are, 0–100. */
  wet: number;
}

/** The five vitals and morale, each 0–100 (SPEC 7.1). */
export interface Vitals {
  health: number;
  hydration: number;
  nutrition: number;
  rest: number;
  warmth: number;
  morale: number;
}

/** A stack of items: kind, count, the dealt thing it is (`d`), and the tick the oldest was gathered (`t`). */
export interface Item {
  k: string;
  n: number;
  d?: number;
  t?: number;
}

/** An illness or injury in progress (SPEC 7.7). It shows from `since` and is gone at `until`. */
export interface Condition {
  id: ConditionId;
  sev: number;
  since: number;
  until: number;
}

/** A fire (SPEC 8.3): minutes of fuel left, then minutes the coals stay hot; banked coals keep all night. */
export interface Fire {
  x: number;
  y: number;
  fuel: number;
  coals: number;
  banked: boolean;
  /** Minutes of thick smoke left (green boughs, smoky wood): what search aircraft see. */
  smoke: number;
  /** Built as a signal fire on open high ground (SPEC 10). */
  signal: boolean;
}

/** An animal (SPEC 9). `t` counts ticks to its next step; `mode` is what it's doing; `gone` counts down a hunted one's return. */
export interface Animal {
  id: number;
  kind: AnimalKind;
  x: number;
  y: number;
  /** Its home. */
  hx: number;
  hy: number;
  mode: 'wander' | 'flee' | 'warn' | 'leave' | 'stalk' | 'gone';
  t: number;
  timer: number;
  /** Where it is heading (jays), or -1. */
  tx: number;
  ty: number;
  /** The survivor's distance walked when it began to warn (did they move?). */
  mark: number;
  /** What a pack rat is carrying home. */
  carry?: Item;
  /** The herd's bull (elk). */
  bull: boolean;
  gone: number;
}

/** A camp improvement (SPEC 7.6) on a tile; a cache holds items. */
export interface Build {
  kind: string;
  x: number;
  y: number;
  items?: Item[];
}

/**
 * Something learned about this valley's rules (SPEC 6.6). `key` is `<row>:<index>` (`plant:3`), or
 * `<row>:<index>:<outcome>` for a suspicion about one particular outcome.
 */
export interface Fact {
  key: string;
  level: 'suspected' | 'known';
  /** What the survivor believes it is: an outcome from the row's deck, or a word like `safe`. */
  value: string;
  /** How it was learned, for the notes ("tasted", "watched jays"). */
  how: string;
  tick: number;
}

/** Something the survivor is busy with (SPEC 5.2): it takes ticks and moving cancels it. */
export interface Task {
  action: string;
  /** The tile it is done to, or -1. */
  tile: number;
  /** The inventory slot it uses, or -1. */
  slot: number;
  left: number;
  total: number;
}

/** Items lying on the ground at a tile. */
export interface Stash {
  x: number;
  y: number;
  items: Item[];
}

/** A line in the message log. */
export interface LogEntry {
  t: number;
  text: string;
}

/** Something due to happen later: a taste's effect, an illness showing. */
export interface Pending {
  t: number;
  kind: 'taste' | 'eat' | 'water-ill' | 'wood' | 'sign';
  d: number;
}

/** How the run ended. */
export interface Outcome {
  kind: 'death' | 'rescue';
  cause: string;
  tick: number;
}

export interface GameState {
  /** The save format's version (SPEC 11.6). */
  schema: number;
  seed: string;
  protagonist: Protagonist;
  tick: number;
  /** The play-time random streams. (The world and deal streams are used up at generation.) */
  rng: Record<StreamName, RngState>;
  player: PlayerState;
  vitals: Vitals;
  conditions: Condition[];
  inventory: Item[];
  /** Experience in each skill; the level (0–5) comes from it (sim/skills.ts). */
  skills: Record<SkillId, number>;
  /** Explored tiles, as a bitset: tile i is bit (i & 31) of word (i >> 5). */
  explored: number[];
  /** Which of the world's viewpoints have been reached, by index. */
  viewpoints: boolean[];
  fires: Fire[];
  builds: Build[];
  /** Counts of things that have happened, for reflection and insights (SPEC 8.1). Looked up, never iterated. */
  memory: Record<string, number>;
  /** A lightning-struck snag still smouldering, and until when (SPEC 8.3, captured fire). */
  smoulder: { x: number; y: number; until: number } | null;
  /** The run's weather, fixed at the start (SPEC 6.5): an index into weather.ts's ALL for each 3-hour period. */
  weather: { f: number[]; severeDay: number };
  animals: Animal[];
  /** What each dealt thing is in this valley (SPEC 6.6). Re-dealt from the seed on load. */
  rules: Rules;
  /**
   * What the survivor has learned: valley facts, techniques (SPEC 8.1), and the dealt things they have
   * come across (`seen`, keys like `plant:3`), which are the rows of the valley notes.
   */
  known: { facts: Fact[]; techniques: string[]; seen: string[] };
  task: Task | null;
  /** Asleep (or resting awake) until a tick. */
  sleep: { until: number; awake: boolean; from: number } | null;
  stashes: Stash[];
  /** Tile index -> the tick its food or wood comes back. Looked up, never iterated. */
  regrow: Record<string, number>;
  pending: Pending[];
  /** Recent drinks by water body, for working out which water made the survivor ill. */
  drinks: { w: number; t: number }[];
  log: LogEntry[];
  over: Outcome | null;
  stats: { discoveries: number; meals: number; distance: number };
  /** The survivor walked or worked this game minute (for the body's drains). */
  exerting: boolean;
}

/** A command (SPEC 11.3, rule 4): the only way input reaches the simulation. `t` is its tick. */
export type Command =
  | { t: number; c: 'move'; dir: Dir }
  | { t: number; c: 'halt' }
  | { t: number; c: 'act'; action: string; tile: number }
  | { t: number; c: 'use'; action: string; slot: number }
  | { t: number; c: 'craft'; recipe: string }
  | { t: number; c: 'sleep'; minutes: number; awake: boolean }
  | { t: number; c: 'wake' }
  | { t: number; c: 'cancel' }
  | { t: number; c: 'debug-teleport'; x: number; y: number }
  | { t: number; c: 'debug-fire' }
  | { t: number; c: 'debug-give'; k: string; d: number; n: number }
  | { t: number; c: 'debug-vital'; vital: keyof Vitals; value: number };

/** What happened in a tick, for sound, text, and the HUD (SPEC 12.3: hooks from the start). */
export type SimEvent =
  | { type: 'step'; x: number; y: number; terrain: number }
  | { type: 'bump'; x: number; y: number }
  | { type: 'viewpoint'; index: number }
  | { type: 'hour'; hour: number }
  | { type: 'teleport' }
  | { type: 'fire-lit'; x: number; y: number }
  | { type: 'say'; text: string }
  | { type: 'task-start'; action: string }
  | { type: 'task-done'; action: string }
  | { type: 'eat' }
  | { type: 'drink' }
  | { type: 'pickup' }
  | { type: 'sick' }
  | { type: 'discovery'; key: string }
  | { type: 'sleep' }
  | { type: 'wake' }
  | { type: 'over'; kind: 'death' | 'rescue' }
  | { type: 'weather'; id: string }
  | { type: 'lightning' }
  | { type: 'animal'; kind: string; what: string };
