// One simulation tick (SPEC 5): step(state, world, commands) -> events. It mutates `state` in place and
// reads nothing but its arguments.

import { FIRE_LIGHT, TICKS_PER_MINUTE, VIEWPOINT_REACH, VIEWPOINT_REVEAL } from '../content/balance.ts';
import type { Command, Dir, GameState, SimEvent } from './state.ts';
import { clock, sightRadius } from './time.ts';
import { idx, inBounds, passable, stepTicks, type World } from './world.ts';

const DX = [0, 1, 0, -1] as const;
const DY = [-1, 0, 1, 0] as const;

/** Advance the game by one tick. `commands` are the ones stamped with this tick, in the order given. */
export function step(state: GameState, world: World, commands: readonly Command[]): SimEvent[] {
  const events: SimEvent[] = [];
  for (const cmd of commands) apply(state, world, cmd, events);
  movePlayer(state, world, events);
  state.tick++;
  if (state.tick % TICKS_PER_MINUTE === 0) {
    reveal(state);
    const c = clock(state.tick);
    if (c.minute % 60 === 0) events.push({ type: 'hour', hour: c.hour });
  }
  return events;
}

function apply(state: GameState, world: World, cmd: Command, events: SimEvent[]): void {
  const p = state.player;
  switch (cmd.c) {
    case 'move':
      p.intent = cmd.dir;
      p.queued = cmd.dir;
      break;
    case 'halt':
      p.intent = -1;
      break;
    case 'debug-teleport':
      if (!passable(world, cmd.x, cmd.y)) break;
      p.x = p.fromX = cmd.x;
      p.y = p.fromY = cmd.y;
      p.stepLeft = p.stepTotal = 0;
      events.push({ type: 'teleport' });
      reveal(state);
      break;
    case 'debug-fire':
      if (!state.lights.some((l) => l.x === p.x && l.y === p.y)) {
        state.lights.push({ x: p.x, y: p.y, radius: FIRE_LIGHT });
        events.push({ type: 'fire-lit', x: p.x, y: p.y });
        reveal(state);
      }
      break;
  }
}

function movePlayer(state: GameState, world: World, events: SimEvent[]): void {
  const p = state.player;
  if (p.stepLeft > 0) p.stepLeft--;
  if (p.stepLeft > 0) return;
  const dir: Dir | -1 = p.queued >= 0 ? p.queued : p.intent;
  p.queued = -1;
  if (dir === -1) return;
  if (dir !== p.facing) p.bumped = false;
  p.facing = dir;
  const nx = p.x + DX[dir];
  const ny = p.y + DY[dir];
  if (!passable(world, nx, ny)) {
    if (!p.bumped) events.push({ type: 'bump', x: nx, y: ny });
    p.bumped = true;
    return;
  }
  const ticks = stepTicks(world, idx(p.x, p.y), idx(nx, ny));
  p.fromX = p.x;
  p.fromY = p.y;
  p.x = nx;
  p.y = ny;
  p.stepTotal = ticks;
  p.stepLeft = ticks;
  p.bumped = false;
  events.push({ type: 'step', x: nx, y: ny, terrain: world.terrain[idx(nx, ny)]! });
  reveal(state);
  visitViewpoints(state, world, events);
}

function visitViewpoints(state: GameState, world: World, events: SimEvent[]): void {
  const p = state.player;
  world.viewpoints.forEach((v, index) => {
    if (state.viewpoints[index]) return;
    if (Math.abs(v.x - p.x) > VIEWPOINT_REACH || Math.abs(v.y - p.y) > VIEWPOINT_REACH) return;
    state.viewpoints[index] = true;
    markCircle(state, v.x, v.y, VIEWPOINT_REVEAL);
    events.push({ type: 'viewpoint', index });
  });
}

/** Mark explored what the survivor can see now: their sight, and any firelit ground they can see into. */
export function reveal(state: GameState): void {
  const p = state.player;
  const r = sightRadius(state.tick);
  markCircle(state, p.x, p.y, r);
  for (const l of state.lights) {
    const reach = r + l.radius;
    const dx = l.x - p.x;
    const dy = l.y - p.y;
    if (dx * dx + dy * dy <= reach * reach) markCircle(state, l.x, l.y, l.radius);
  }
}

/** Set the explored bit for every tile within `r` of (cx, cy). */
export function markCircle(state: GameState, cx: number, cy: number, r: number): void {
  const r2 = r * r + r;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (!inBounds(x, y)) continue;
      const i = idx(x, y);
      state.explored[i >> 5] = (state.explored[i >> 5]! | (1 << (i & 31))) >>> 0;
    }
  }
}

export function isExplored(state: GameState, i: number): boolean {
  return ((state.explored[i >> 5]! >>> (i & 31)) & 1) === 1;
}

/** The lights on the map and the survivor's own sight, for the renderer's darkness (SPEC 12.1). */
export function sightCircles(state: GameState): { x: number; y: number; r: number; fire: boolean }[] {
  const out = [{ x: state.player.x, y: state.player.y, r: sightRadius(state.tick), fire: false }];
  for (const l of state.lights) out.push({ x: l.x, y: l.y, r: l.radius, fire: true });
  return out;
}

