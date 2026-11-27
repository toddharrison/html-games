// One simulation tick (SPEC 5): step(state, world, commands) -> events. It mutates `state` in place and
// reads nothing but its arguments.

import { CORNER_EASE, FOOT_HALF_H, FOOT_HALF_W, SUB, TAP_TICKS, TICKS_PER_MINUTE, VIEWPOINT_REACH, VIEWPOINT_REVEAL } from '../content/balance.ts';
import { ITEMS, itemDef } from '../content/items.ts';
import { MSG, who } from '../content/messages.ts';
import { FLAG, T } from '../content/terrain.ts';
import { startAction, startUse, workTask } from './actions.ts';
import { bodyMinute, slowFactor } from './body.ts';
import { resolvePending, spoil } from './food.ts';
import { carryLimit, give, load } from './inventory.ts';
import { say } from './log.ts';
import type { Command, Dir, GameState, SimEvent } from './state.ts';
import { blockedBySystems, commandHooks, minuteHooks, tickHooks } from './systems.ts';
import { lightsOf, shelterAt } from './surroundings.ts';
import { startCraft } from './craft.ts';
import { reflect } from './insight.ts';
import { remember } from './memory.ts';
import { clock } from './time.ts';
import { sightOf } from './sight.ts';
import { stepHazards } from './hazards.ts';
import { animalAt } from './animals.ts';
import { addCondition } from './body.ts';
import { ANIMAL_TEXT } from '../content/animalText.ts';
import { idx, inBounds, passable, stepTicks, type World } from './world.ts';
import { findRoute } from './route.ts';

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
    if (s.tick >= s.sleep.until) wake(s, w, MSG.wake(wh), events);
    else if (!s.sleep.awake && s.vitals.hydration < 6) wake(s, w, MSG.wakeThirst(wh), events);
    else if (!s.sleep.awake && s.vitals.warmth < 8 && s.tick - s.sleep.from > 600 && (s.memory['woke-cold'] ?? -1e9) < s.tick - 1800) {
      s.memory['woke-cold'] = s.tick;
      wake(s, w, MSG.wakeCold(wh), events);
    }
  } else if (s.vitals.rest <= 0) {
    s.task = null;
    s.sleep = { until: s.tick + 240 * TICKS_PER_MINUTE, awake: false, from: s.tick };
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

export function wake(s: GameState, w: World, text: string, events: SimEvent[]): void {
  const slept = s.sleep && !s.sleep.awake ? s.tick - s.sleep.from : 0;
  s.sleep = null;
  say(s, text, events);
  events.push({ type: 'wake' });
  if (slept >= 180 * TICKS_PER_MINUTE) {
    if (shelterAt(s, w, s.player.x, s.player.y).rain > 0.5) remember(s, 'slept-sheltered');
    reflect(s, events);
  }
}

function apply(state: GameState, world: World, cmd: Command, events: SimEvent[]): void {
  const p = state.player;
  switch (cmd.c) {
    case 'move':
      if (state.sleep && !state.sleep.awake) break;
      if (state.sleep) state.sleep = null;
      if (state.task) state.task = null;
      p.route = null;
      p.intent = cmd.dir;
      p.queued = cmd.dir;
      if (state.walk === 'free') {
        p.vx = DX[cmd.dir];
        p.vy = DY[cmd.dir];
        p.nudge = TAP_TICKS;
      }
      break;
    case 'halt':
      p.intent = -1;
      if (state.walk === 'free') p.vx = p.vy = 0;
      break;
    case 'walk': {
      if (state.sleep && !state.sleep.awake) break;
      const dx = Math.sign(cmd.dx);
      const dy = Math.sign(cmd.dy);
      if (dx || dy) {
        if (state.sleep) state.sleep = null;
        if (state.task) state.task = null;
        p.route = null;
      }
      if (state.walk !== 'free') {
        // On the grid, walking is stepping toward the direction last pressed.
        if (cmd.dir >= 0 && (dx || dy)) p.intent = p.queued = cmd.dir;
        else p.intent = -1;
        break;
      }
      p.vx = dx;
      p.vy = dy;
      p.intent = dx || dy ? cmd.dir : -1;
      if (cmd.dir >= 0 && (dx || dy)) {
        p.queued = cmd.dir;
        p.nudge = TAP_TICKS;
      }
      break;
    }
    case 'face':
      if (state.sleep && !state.sleep.awake) break;
      p.facing = cmd.dir;
      p.bumped = false;
      break;
    case 'act':
      startAction(state, world, cmd.action, cmd.tile, events);
      break;
    case 'use':
      startUse(state, world, cmd.action, cmd.slot, events);
      break;
    case 'sleep':
      if (state.task || state.sleep) break;
      state.sleep = { until: state.tick + Math.max(1, Math.round(cmd.minutes)) * TICKS_PER_MINUTE, awake: cmd.awake, from: state.tick };
      p.intent = -1;
      p.queued = -1;
      say(state, cmd.awake ? MSG.rest(who(state.protagonist)) : MSG.sleep(who(state.protagonist)), events);
      events.push({ type: 'sleep' });
      break;
    case 'wake':
      if (state.sleep) wake(state, world, MSG.wake(who(state.protagonist)), events);
      break;
    case 'craft':
      startCraft(state, world, cmd.recipe, events);
      break;
    case 'cancel':
      state.task = null;
      p.route = null;
      break;
    case 'goto':
      startRoute(state, world, cmd, events);
      break;
    case 'debug-teleport':
      if (!passable(world, cmd.x, cmd.y)) break;
      p.x = p.fromX = cmd.x;
      p.y = p.fromY = cmd.y;
      p.stepLeft = p.stepTotal = 0;
      if (state.walk === 'free') {
        p.fx = p.lastFx = cmd.x * SUB + SUB / 2;
        p.fy = p.lastFy = cmd.y * SUB + SUB / 2;
      }
      state.task = null;
      events.push({ type: 'teleport' });
      reveal(state);
      break;
    case 'debug-fire': {
      // On the faced tile if it's open ground, else where the survivor stands.
      const fx = p.x + DX[p.facing];
      const fy = p.y + DY[p.facing];
      const [x, y] = passable(world, fx, fy) && !state.fires.some((f) => f.x === fx && f.y === fy) ? [fx, fy] : [p.x, p.y];
      if (!state.fires.some((f) => f.x === x && f.y === y)) {
        state.fires.push({ x, y, fuel: 720, coals: 0, banked: false, smoke: 0, signal: false });
        state.fires.sort((a, b) => a.y - b.y || a.x - b.x);
        events.push({ type: 'fire-lit', x, y });
        reveal(state);
      }
      break;
    }
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
  if (state.walk === 'free') return moveFree(state, world, events);
  const p = state.player;
  if (p.stepLeft > 0) p.stepLeft--;
  if (p.stepLeft > 0) return true;
  if (state.sleep || state.task) return false;
  let dir: Dir | -1 = p.queued >= 0 ? p.queued : p.intent;
  p.queued = -1;
  if (dir === -1 && p.route) dir = nextOnRoute(state, world, events);
  if (dir === -1) return false;
  if (dir !== p.facing) p.bumped = false;
  p.facing = dir;
  const nx = p.x + DX[dir];
  const ny = p.y + DY[dir];
  if (!canEnter(state, world, nx, ny)) {
    if (!p.bumped) {
      events.push({ type: 'bump', x: nx, y: ny });
      if (animalAt(state, nx, ny)?.kind === 'porcupine' && !state.conditions.some((c) => c.id === 'quills')) {
        addCondition(state, 'quills', 60);
        say(state, ANIMAL_TEXT.quills(who(state.protagonist)), events);
      }
    }
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
  entered(state, world, events);
  return true;
}

/** What comes of setting foot on a new tile (the survivor's x, y): counted, wet feet, hazards, sight. */
function entered(state: GameState, world: World, events: SimEvent[]): void {
  const p = state.player;
  const to = idx(p.x, p.y);
  state.stats.distance++;
  const t = world.terrain[to]!;
  // On a fallen tree across the stream, feet stay dry (worldgen bridges.ts).
  const onLog = world.flags[to]! & FLAG.bridge;
  if (!onLog && t === T.shallows) p.wet = 100;
  else if (!onLog && (t === T.stream || t === T.gravel)) p.wet = Math.max(p.wet, 60);
  events.push({ type: 'step', x: p.x, y: p.y, terrain: t });
  state.memory['last-step'] = state.tick;
  stepHazards(state, world, to, events);
  reveal(state);
  visitViewpoints(state, world, events);
}

// ---- Free walking (prototype, SPEC 5.2) ----

/** Does the survivor's footprint fit with their feet at (fx, fy): every tile under it open (bar the one they stand on). */
function fits(state: GameState, world: World, fx: number, fy: number): boolean {
  const p = state.player;
  const x0 = Math.floor((fx - FOOT_HALF_W) / SUB);
  const x1 = Math.floor((fx + FOOT_HALF_W - 1) / SUB);
  const y0 = Math.floor((fy - FOOT_HALF_H) / SUB);
  const y1 = Math.floor((fy + FOOT_HALF_H - 1) / SUB);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x === p.x && y === p.y && x === Math.floor(fx / SUB) && y === Math.floor(fy / SUB)) continue;
      if (!canEnter(state, world, x, y)) return false;
    }
  }
  return true;
}

/**
 * Move the feet `speed` along (vx, vy), one axis at a time, as far as each goes: so walking into a wall
 * at a slant slides along it. Walking straight into the edge of a corner eases round it.
 */
function slide(state: GameState, world: World, vx: number, vy: number, speed: number): void {
  const p = state.player;
  if (vx) {
    let k = speed;
    while (k > 0 && !fits(state, world, p.fx! + vx * k, p.fy!)) k--;
    if (k > 0) p.fx! += vx * k;
    else if (!vy) ease(state, world, 1, vx, speed);
  }
  if (vy) {
    let k = speed;
    while (k > 0 && !fits(state, world, p.fx!, p.fy! + vy * k)) k--;
    if (k > 0) p.fy! += vy * k;
    else if (!vx) ease(state, world, 0, vy, speed);
  }
}

/** Blocked going along one axis: if a small shift across would clear the corner, make it (toward the nearer side). */
function ease(state: GameState, world: World, along: 0 | 1, dir: number, speed: number): void {
  const p = state.player;
  for (let d = 1; d <= CORNER_EASE; d++) {
    for (const sgn of [-1, 1]) {
      const ok = along === 1 ? fits(state, world, p.fx! + dir * speed, p.fy! + sgn * d) : fits(state, world, p.fx! + sgn * d, p.fy! + dir * speed);
      if (!ok) continue;
      const k = Math.min(speed, d);
      if (along === 1 && fits(state, world, p.fx!, p.fy! + sgn * k)) p.fy! += sgn * k;
      else if (along === 0 && fits(state, world, p.fx! + sgn * k, p.fy!)) p.fx! += sgn * k;
      return;
    }
  }
}

/**
 * Where a route wants to go next, as a way on each axis (-1, 0, 1), or null (arrived, or waiting for a
 * new way). Toward the next tile's centre; if the step after turns, cutting the corner toward it.
 */
function steer(state: GameState, world: World, events: SimEvent[], strict: boolean): [number, number] | null {
  const p = state.player;
  const r = p.route!;
  if (r.path.length === 0) {
    arrive(state, world, events);
    return null;
  }
  const d = r.path[0]!;
  const nx = p.x + DX[d];
  const ny = p.y + DY[d];
  if (!canEnter(state, world, nx, ny)) {
    const again = r.tries < 3 ? planRoute(state, world, r.tx, r.ty, r.onto) : null;
    if (!again || again.length === 0) {
      p.route = null;
      if (again) arrive(state, world, events);
      return null;
    }
    r.path = again;
    r.tries++;
    return null;
  }
  let gx = nx * SUB + SUB / 2;
  let gy = ny * SUB + SUB / 2;
  const e = r.path[1];
  if (!strict && e !== undefined && (e & 1) !== (d & 1) && canEnter(state, world, nx + DX[e], ny + DY[e]) && canEnter(state, world, p.x + DX[e], p.y + DY[e])) {
    gx += (DX[e] * SUB * 3) / 8;
    gy += (DY[e] * SUB * 3) / 8;
  }
  const dx = gx - p.fx!;
  const dy = gy - p.fy!;
  const dead = SUB / 10;
  const v: [number, number] = [Math.abs(dx) > dead ? Math.sign(dx) : 0, Math.abs(dy) > dead ? Math.sign(dy) : 0];
  if (!v[0] && !v[1]) return [DX[d], DY[d]];
  return v;
}

/** On a new tile while following a route: one step of it done, or off it (slid round something), so find the way again. */
function followed(state: GameState, world: World, fromX: number, fromY: number): void {
  const p = state.player;
  const r = p.route;
  if (!r || !r.path.length) return;
  const d = r.path[0]!;
  if (fromX + DX[d] === p.x && fromY + DY[d] === p.y) {
    r.path.shift();
    return;
  }
  const e = r.path[1];
  if (e !== undefined && fromX + DX[d] + DX[e] === p.x && fromY + DY[d] + DY[e] === p.y) {
    r.path.splice(0, 2);
    return;
  }
  const again = planRoute(state, world, r.tx, r.ty, r.onto);
  if (again) r.path = again;
  else p.route = null;
}

/**
 * Free walking: the survivor's feet move over the grid in any of eight directions, at the speed of the
 * ground underfoot (a tile in a grid step's ticks), and stop against anything that blocks. Entering a
 * new tile does all a step did.
 */
function moveFree(state: GameState, world: World, events: SimEvent[]): boolean {
  const p = state.player;
  if (p.fx === undefined || p.fy === undefined) {
    p.fx = p.x * SUB + SUB / 2;
    p.fy = p.y * SUB + SUB / 2;
  }
  p.lastFx = p.fx;
  p.lastFy = p.fy;
  p.stepLeft = p.stepTotal = 0;
  if (state.sleep || state.task) return false;
  let vx = p.vx ?? 0;
  let vy = p.vy ?? 0;
  if (!vx && !vy && (p.nudge ?? 0) > 0 && p.queued >= 0) {
    vx = DX[p.queued as Dir];
    vy = DY[p.queued as Dir];
  }
  if (p.nudge) p.nudge--;
  if (!p.nudge) p.queued = -1;
  let routed = false;
  if (!vx && !vy && p.route) {
    const v = steer(state, world, events, false);
    if (!v) return false;
    [vx, vy] = v;
    routed = true;
  }
  if (!vx && !vy) return false;
  // Face the way walked; on a slant, keep facing whichever of its two ways the survivor already was.
  const ns: Dir = vy < 0 ? 0 : 2;
  const ew: Dir = vx > 0 ? 1 : 3;
  const face: Dir = vx && vy ? (p.facing === ns || p.facing === ew ? p.facing : ew) : vy ? ns : ew;
  if (face !== p.facing) p.bumped = false;
  p.facing = face;
  // The speed: a tile in the ticks a grid step onto the tile ahead would take; √2 slower on a slant.
  const here = idx(p.x, p.y);
  const ax = p.x + vx;
  const ay = p.y + vy;
  const ahead = inBounds(ax, ay) && canEnter(state, world, ax, ay) ? idx(ax, ay) : here;
  let ticks = stepTicks(world, here, ahead) * slowFactor(state);
  if (load(state) > carryLimit(state) * 0.8) ticks *= 1.3;
  let speed = Math.max(1, Math.round(SUB / Math.max(1, ticks)));
  if (vx && vy) speed = Math.max(1, Math.round((speed * 181) / 256));
  const [bx, by] = [p.fx, p.fy];
  slide(state, world, vx, vy, speed);
  if (routed && p.fx === bx && p.fy === by) {
    // Cutting the corner caught on something: head for the next tile's centre instead.
    const v = steer(state, world, events, true);
    if (v) slide(state, world, v[0], v[1], speed);
  }
  if (p.fx === bx && p.fy === by) {
    const fx = p.x + DX[face];
    const fy = p.y + DY[face];
    if (!p.bumped) {
      events.push({ type: 'bump', x: fx, y: fy });
      if (animalAt(state, fx, fy)?.kind === 'porcupine' && !state.conditions.some((c) => c.id === 'quills')) {
        addCondition(state, 'quills', 60);
        say(state, ANIMAL_TEXT.quills(who(state.protagonist)), events);
      }
    }
    p.bumped = true;
    return false;
  }
  p.bumped = false;
  const tx = Math.floor(p.fx / SUB);
  const ty = Math.floor(p.fy / SUB);
  if (tx !== p.x || ty !== p.y) {
    const [fromX, fromY] = [p.x, p.y];
    p.fromX = fromX;
    p.fromY = fromY;
    p.x = tx;
    p.y = ty;
    // A new tile this tick: what watches for a step starting (fish) sees one.
    p.stepLeft = p.stepTotal = 1;
    followed(state, world, fromX, fromY);
    entered(state, world, events);
  }
  return true;
}

// ---- Walking somewhere (SPEC 5.2) ----

type Goto = Extract<Command, { c: 'goto' }>;

/** Is (x, y) where a route to (tx, ty) ends: on it, or beside it (four-way) if not walking onto it. */
function routeGoal(tx: number, ty: number, onto: boolean): (x: number, y: number) => boolean {
  return onto ? (x, y) => x === tx && y === ty : (x, y) => Math.abs(x - tx) + Math.abs(y - ty) === 1;
}

function planRoute(state: GameState, world: World, tx: number, ty: number, onto: boolean): Dir[] | null {
  const p = state.player;
  return findRoute(
    p.x,
    p.y,
    tx,
    ty,
    routeGoal(tx, ty, onto),
    (x, y) => canEnter(state, world, x, y),
    (from, to) => stepTicks(world, from, to),
  );
}

function startRoute(state: GameState, world: World, cmd: Goto, events: SimEvent[]): void {
  const p = state.player;
  if (state.over || (state.sleep && !state.sleep.awake) || !inBounds(cmd.x, cmd.y)) return;
  if (state.sleep) state.sleep = null;
  state.task = null;
  p.intent = -1;
  p.queued = -1;
  // Already there, or doing it where they stand.
  const here = cmd.x === p.x && cmd.y === p.y;
  const path = here && (cmd.onto || cmd.at === 'here') ? [] : planRoute(state, world, cmd.x, cmd.y, cmd.onto);
  if (!path) {
    p.route = null;
    say(state, MSG.noWay(), events);
    return;
  }
  p.route = { path, tx: cmd.x, ty: cmd.y, onto: cmd.onto, action: cmd.action, at: cmd.at, tries: 0 };
  if (path.length === 0 && p.stepLeft === 0) arrive(state, world, events);
}

/** The next step of the route, or -1 once there (starting what was asked). Finds the way again if blocked. */
function nextOnRoute(state: GameState, world: World, events: SimEvent[]): Dir | -1 {
  const p = state.player;
  const r = p.route!;
  if (r.path.length === 0) {
    arrive(state, world, events);
    return -1;
  }
  const d = r.path[0]!;
  if (!canEnter(state, world, p.x + DX[d], p.y + DY[d])) {
    const again = r.tries < 3 ? planRoute(state, world, r.tx, r.ty, r.onto) : null;
    if (!again || again.length === 0) {
      p.route = null;
      if (again) arrive(state, world, events);
      return -1;
    }
    r.path = again;
    r.tries++;
  }
  return r.path.shift()!;
}

function arrive(state: GameState, world: World, events: SimEvent[]): void {
  const p = state.player;
  const r = p.route;
  p.route = null;
  if (!r) return;
  const dx = r.tx - p.x;
  const dy = r.ty - p.y;
  if (Math.abs(dx) + Math.abs(dy) === 1) {
    const dir: Dir = dx === 1 ? 1 : dx === -1 ? 3 : dy === 1 ? 2 : 0;
    if (dir !== p.facing) p.bumped = false;
    p.facing = dir;
  }
  if (!r.action) return;
  const tile = r.at === 'here' ? idx(p.x, p.y) : idx(r.tx, r.ty);
  startAction(state, world, r.action, tile, events);
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
  const r = sightOf(state);
  markCircle(state, p.x, p.y, r);
  for (const l of lightsOf(state)) {
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
  const out = [{ x: state.player.x, y: state.player.y, r: sightOf(state), fire: false }];
  for (const l of lightsOf(state)) out.push({ x: l.x, y: l.y, r: l.radius, fire: true });
  return out;
}
