// What can be done to a tile from where the survivor could stand beside it (SPEC 5.2, 12.4): what a click
// offers. It asks each action's own offer, as if the survivor already stood next to the tile and faced it,
// so the mouse never offers anything the keyboard couldn't do once there. Reads state; changes nothing.

import { availableActions, type ActionOption } from './actions.ts';
import type { Dir, GameState } from './state.ts';
import { canEnter } from './step.ts';
import { idx, inBounds, type World } from './world.ts';

const DX = [0, 1, 0, -1] as const;
const DY = [-1, 0, 1, 0] as const;

/** Actions done from where the survivor stands that are about the trout clicked on (watching it). */
const FROM_BESIDE = new Set(['watch-fish']);
/** Actions done standing on the tile clicked (lying down in a lean-to): the survivor walks onto it first. */
const ON_TILE = new Set(['sleep-in', 'rest-in']);

export interface Reach extends ActionOption {
  /** Do it to the tile (faced) or from where the survivor ends up standing. */
  at: 'front' | 'here';
  /** Walk onto the tile first, then do it there. */
  onto?: true;
}

/** Where the survivor would stand to work on (x, y): where they are if beside it, else the open side nearest them. */
export function standFor(s: GameState, w: World, x: number, y: number): { x: number; y: number; facing: Dir } | null {
  const p = s.player;
  let best: { x: number; y: number; facing: Dir } | null = null;
  let bd = Infinity;
  for (let d = 0; d < 4; d++) {
    const sx = x - DX[d]!;
    const sy = y - DY[d]!;
    const mine = sx === p.x && sy === p.y;
    if (!mine && !canEnter(s, w, sx, sy)) continue;
    const dist = mine ? -1 : Math.abs(sx - p.x) + Math.abs(sy - p.y);
    if (dist < bd) {
      bd = dist;
      best = { x: sx, y: sy, facing: d as Dir };
    }
  }
  return best;
}

/** Everything that could be done to (x, y), with how long it takes. */
export function actionsAt(s: GameState, w: World, x: number, y: number): Reach[] {
  if (!inBounds(x, y) || s.over || (s.sleep && !s.sleep.awake)) return [];
  const p = s.player;
  const tile = idx(x, y);
  if (x === p.x && y === p.y) {
    // Watching the trout is offered by clicking a trout, not the ground underfoot (it's done from here, so
    // it's on this tile's list too).
    return availableActions(s, w)
      .filter((o) => o.tile === tile && !(FROM_BESIDE.has(o.action) && !s.fish.some((f) => idx(f.x, f.y) === tile)))
      .map((o) => ({ ...o, at: 'here' as const }));
  }
  const out: Reach[] = [];
  if (canEnter(s, w, x, y)) {
    const on: GameState = { ...s, sleep: null, task: null, player: { ...p, x, y, stepLeft: 0, route: null } };
    for (const o of availableActions(on, w)) if (o.tile === tile && ON_TILE.has(o.action)) out.push({ ...o, at: 'here', onto: true });
  }
  const stand = standFor(s, w, x, y);
  if (!stand) return out;
  const there: GameState = { ...s, sleep: null, task: null, player: { ...p, x: stand.x, y: stand.y, facing: stand.facing, stepLeft: 0, route: null } };
  const opts = availableActions(there, w);
  for (const o of opts) {
    if (o.tile === tile && !ON_TILE.has(o.action)) out.push({ ...o, at: 'front' });
    else if (FROM_BESIDE.has(o.action) && s.fish.some((f) => idx(f.x, f.y) === tile)) out.push({ ...o, tile, at: 'here' });
  }
  return out;
}
