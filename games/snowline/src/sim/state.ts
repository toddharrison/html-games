// The GameState type (SPEC 11.3, rule 7): plain, JSON-serialisable data with no class instances or
// functions. With the world (rebuilt from the seed), it is everything the simulation knows.

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
}

/** A light source on the map. Fires arrive in M3; for now only the debug console makes one. */
export interface Light {
  x: number;
  y: number;
  radius: number;
}

export interface GameState {
  /** The save format's version (SPEC 11.6). */
  schema: 1;
  seed: string;
  protagonist: Protagonist;
  tick: number;
  /** The play-time random streams. (The world and deal streams are used up at generation.) */
  rng: Record<StreamName, RngState>;
  player: PlayerState;
  /** Explored tiles, as a bitset: tile i is bit (i & 31) of word (i >> 5). */
  explored: number[];
  /** Which of the world's viewpoints have been reached, by index. */
  viewpoints: boolean[];
  lights: Light[];
  /** What each dealt thing is in this valley (SPEC 6.6). Re-dealt from the seed on load. */
  rules: Rules;
  /** What the survivor has learned of the rules. Filled in from M2. */
  known: { facts: string[] };
}

/** A command (SPEC 11.3, rule 4): the only way input reaches the simulation. `t` is its tick. */
export type Command =
  | { t: number; c: 'move'; dir: Dir }
  | { t: number; c: 'halt' }
  | { t: number; c: 'debug-teleport'; x: number; y: number }
  | { t: number; c: 'debug-fire' };

/** What happened in a tick, for sound, text, and the HUD (SPEC 12.3: hooks from the start). */
export type SimEvent =
  | { type: 'step'; x: number; y: number; terrain: number }
  | { type: 'bump'; x: number; y: number }
  | { type: 'viewpoint'; index: number }
  | { type: 'hour'; hour: number }
  | { type: 'teleport' }
  | { type: 'fire-lit'; x: number; y: number };
