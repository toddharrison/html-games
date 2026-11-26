// One simulation tick (SPEC 5): step(state, world, commands) -> events. It mutates `state` in place and
// reads nothing but its arguments.

import { FIRE_LIGHT, TICKS_PER_MINUTE, VIEWPOINT_REACH, VIEWPOINT_REVEAL } from '../content/balance.ts';
import { ITEMS, itemDef } from '../content/items.ts';
import { MSG, who } from '../content/messages.ts';
import { T } from '../content/terrain.ts';
import { startAction, startUse, workTask } from './actions.ts';
import { bodyMinute, slowFactor } from './body.ts';
import { resolvePending, spoil } from './food.ts';
import { carryLimit, give, load } from './inventory.ts';
import { say } from './log.ts';
import type { Command, Dir, GameState, SimEvent } from './state.ts';
import { blockedBySystems, commandHooks, minuteHooks, tickHooks } from './systems.ts';
import { clock, sightRadius } from './time.ts';
import { idx, inBounds, passable, stepTicks, type World } from './world.ts';

const DX = [0, 1, 0, -1] as const;
const DY = [-1, 0, 1, 0] as const;

/** Advance the game by one tick. `commands` are the ones stamped with this tick, in the order given. */
export function step(state: GameState, world: World, commands: readonly Command[]): SimEvent[] {
  const events: SimEvent[] = [];
  if (state.over) return events;
  for (const cmd of commands) apply(state, world, cmd, events);
  const moved = movePlayer(state, world, events);
  if (moved || state.task) state.exerting = true;
  workTask(state, world, events);
  tickHooks(state, world, events);
  state.tick++;
  if (state.tick % TICKS_PER_MINUTE === 0 && !state.over) minute(state, world, events);
  return events;
}

function minute(s: GameState, w: World, events: SimEvent[]): void {
  bodyMinute(s, w, { exerting: s.exerting }, events);
  s.exerting = false;
  if (s.over) return;
  resolvePending(s, events);
  minuteHooks(s, w, events);
  if (s.over) return;
  reveal(s);
  const c = clock(s.tick);
  const wh = who(s.protagonist);
  if (s.sleep) {
    if (s.tick >= s.sleep.until) wake(s, MSG.wake(wh), events);
    else if (!s.sleep.awake && s.vitals.hydration < 6) wake(s, MSG.wakeThirst(wh), events);
    else if (!s.sleep.awake && s.vitals.warmth < 8) wake(s, MSG.wakeCold(wh), events);
  } else if (s.vitals.rest <= 0) {
    s.task = null;
    s.sleep = { until: s.tick + 240 * TICKS_PER_MINUTE, awake: false };
    say(s, MSG.collapse(wh), events);
    events.push({ type: 'sleep' });
  }
  if (c.minute % 60 === 0) {
    events.push({ type: 'hour', hour: c.hour });
    spoil(s, events);
    warnings(s, events);
  }
}

/** Now and then, the body speaks up (SPEC 2, pillar 2: feel it before reading a number). */
function warnings(s: GameState, events: SimEvent[]): void {
  if (s.sleep) return;
  const v = s.vitals;
  const w = who(s.protagonist);
  if (clock(s.tick).hour % 3 !== 0) return;
  if (v.warmth < 20) say(s, MSG.cold(w), events);
  else if (v.hydration < 20) say(s, MSG.thirsty(w), events);
  else if (v.nutrition < 15) say(s, MSG.hungry(w), events);
  else if (v.rest < 15) say(s, MSG.tired(w), events);
}

export function wake(s: GameState, text: string, events: SimEvent[]): void {
  s.sleep = null;
  say(s, text, events);
  events.push({ type: 'wake' });
}

function apply(state: GameState, world: World, cmd: Command, events: SimEvent[]): void {
  const p = state.player;
  switch (cmd.c) {
    case 'move':
      if (state.sleep && !state.sleep.awake) break;
      if (state.sleep) state.sleep = null;
      if (state.task) state.task = null;
      p.intent = cmd.dir;
      p.queued = cmd.dir;
      break;
    case 'halt':
      p.intent = -1;
      break;
    case 'act':
      startAction(state, world, cmd.action, cmd.tile, events);
      break;
    case 'use':
      startUse(state, world, cmd.action, cmd.slot, events);
      break;
    case 'sleep':
      if (state.task || state.sleep) break;
      state.sleep = { until: state.tick + Math.max(1, Math.round(cmd.minutes)) * TICKS_PER_MINUTE, awake: cmd.awake };
      p.intent = -1;
      p.queued = -1;
      say(state, cmd.awake ? MSG.rest(who(state.protagonist)) : MSG.sleep(who(state.protagonist)), events);
      events.push({ type: 'sleep' });
      break;
    case 'wake':
      if (state.sleep) wake(state, MSG.wake(who(state.protagonist)), events);
      break;
    case 'cancel':
      state.task = null;
      break;
    case 'debug-teleport':
      if (!passable(world, cmd.x, cmd.y)) break;
      p.x = p.fromX = cmd.x;
      p.y = p.fromY = cmd.y;
      p.stepLeft = p.stepTotal = 0;
      state.task = null;
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
    case 'debug-give':
      if (cmd.k in ITEMS) give(state, cmd.k, cmd.n, cmd.d >= 0 ? cmd.d : undefined, itemDef(cmd.k).food ? state.tick : undefined);
      break;
    case 'debug-vital':
      state.vitals[cmd.vital] = Math.max(0, Math.min(100, cmd.value));
      break;
    default:
      commandHooks(state, world, cmd, events);
  }
}

function movePlayer(state: GameState, world: World, events: SimEvent[]): boolean {
  const p = state.player;
  if (p.stepLeft > 0) p.stepLeft--;
  if (p.stepLeft > 0) return true;
  if (state.sleep || state.task) return false;
  const dir: Dir | -1 = p.queued >= 0 ? p.queued : p.intent;
  p.queued = -1;
  if (dir === -1) return false;
  if (dir !== p.facing) p.bumped = false;
  p.facing = dir;
  const nx = p.x + DX[dir];
  const ny = p.y + DY[dir];
  if (!canEnter(state, world, nx, ny)) {
    if (!p.bumped) events.push({ type: 'bump', x: nx, y: ny });
    p.bumped = true;
    return false;
  }
  const to = idx(nx, ny);
  let ticks = stepTicks(world, idx(p.x, p.y), to) * slowFactor(state);
  if (load(state) > carryLimit(state) * 0.8) ticks *= 1.3;
  ticks = Math.max(1, Math.round(ticks));
  p.fromX = p.x;
  p.fromY = p.y;
  p.x = nx;
  p.y = ny;
  p.stepTotal = ticks;
  p.stepLeft = ticks;
  p.bumped = false;
  state.stats.distance++;
  const t = world.terrain[to]!;
  if (t === T.shallows) p.wet = 100;
  else if (t === T.stream || t === T.gravel) p.wet = Math.max(p.wet, 60);
  events.push({ type: 'step', x: nx, y: ny, terrain: t });
  reveal(state);
  visitViewpoints(state, world, events);
  return true;
}

/** Can the survivor step onto this tile: the map allows it, and nothing built or fallen blocks it. */
export function canEnter(state: GameState, world: World, x: number, y: number): boolean {
  if (!inBounds(x, y)) return false;
  const override = blockedBySystems(state, world, x, y);
  return override === null ? passable(world, x, y) : !override;
}

function visitViewpoints(state: GameState, world: World, events: SimEvent[]): void {
  const p = state.player;
  world.viewpoints.forEach((v, index) => {
    if (state.viewpoints[index]) return;
    if (Math.abs(v.x - p.x) > VIEWPOINT_REACH || Math.abs(v.y - p.y) > VIEWPOINT_REACH) return;
    state.viewpoints[index] = true;
    markCircle(state, v.x, v.y, VIEWPOINT_REVEAL);
    state.vitals.morale = Math.min(100, state.vitals.morale + 8);
    state.stats.discoveries++;
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
