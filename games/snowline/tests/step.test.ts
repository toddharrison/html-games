// Unit tests for movement, sight, and viewpoints, on a hand-built flat world.

import { describe, expect, it } from 'vitest';
import { BASE_STEP_TICKS, FOOT_HALF_W, FORD_WET, START_MINUTE, SUB, TICKS_PER_MINUTE, VIEWPOINT_REVEAL } from '../src/content/balance.ts';
import { F, FLAG, T } from '../src/content/terrain.ts';
import { newGame } from '../src/sim/newGame.ts';
import { candidate } from '../src/sim/protagonist.ts';
import { dealRules } from '../src/sim/rules.ts';
import type { Command, GameState, SimEvent } from '../src/sim/state.ts';
import { easePace, isExplored, routeCost, sightCircles, step } from '../src/sim/step.ts';
import { idx, stepTicks, type World } from '../src/sim/world.ts';
import { runTo } from '../src/tools/runner.ts';
import { flatWorld } from './sample.ts';

function setup(edit?: (w: World) => void, walk?: 'grid' | 'free'): { state: GameState; world: World } {
  const world = flatWorld();
  edit?.(world);
  return { state: newGame('flat', candidate('flat', 0), world, dealRules('flat'), walk), world };
}

function run(state: GameState, world: World, commands: Command[], ticks: number): SimEvent[] {
  const events: SimEvent[] = [];
  runTo(state, world, commands, state.tick + ticks, (e) => events.push(...e));
  return events;
}

describe('free walking (SPEC 5.2, prototype)', () => {
  const feet = (s: GameState): [number, number] => [s.player.fx!, s.player.fy!];

  it('walks a tile in the ticks a grid step takes, smoothly, and the tile under the feet is where the survivor is', () => {
    const { state, world } = setup(undefined, 'free');
    const [x0] = feet(state);
    run(state, world, [{ t: 0, c: 'walk', dx: 1, dy: 0, dir: 1 }], 3);
    expect(feet(state)[0]! - x0, 'half a tile in 3 ticks').toBeGreaterThan(SUB / 2 - 10);
    expect(state.player.x, 'from the centre, half a tile is over the edge onto the next').toBe(129);
    run(state, world, [], BASE_STEP_TICKS * 5 - 3);
    expect(state.player.x).toBe(133);
    expect(state.player.facing).toBe(1);
  });

  it('eases into a slower ground over a few ticks instead of a jolt, and starts off at full speed', () => {
    const { state, world } = setup((w) => {
      for (let y = 120; y < 140; y++) for (let x = 130; x < 140; x++) w.terrain[idx(x, y)] = T.marsh;
    }, 'free');
    const fast = Math.round(SUB / BASE_STEP_TICKS);
    const slow = Math.round(SUB / stepTicks(world, idx(130, 128), idx(131, 128)));
    const moves: number[] = [];
    let x = feet(state)[0]!;
    for (let t = 0; t < 24; t++) {
      run(state, world, t ? [] : [{ t: 0, c: 'walk', dx: 1, dy: 0, dir: 1 }], 1);
      moves.push(feet(state)[0]! - x);
      x = feet(state)[0]!;
    }
    expect(moves[0], 'no wind-up from a standstill').toBe(fast);
    expect(moves.at(-1), 'settles at the marsh speed').toBe(slow);
    for (let k = 1; k < moves.length; k++) {
      const gap = moves[k - 1]! - slow;
      expect(moves[k - 1]! - moves[k]!, `tick ${k}: at most half the gap closed`).toBeLessThanOrEqual(Math.max(1, gap >> 1));
    }
    expect(moves.filter((m) => m > slow && m < fast).length, 'some ticks in between').toBeGreaterThanOrEqual(3);
  });

  it('easePace closes half the gap a tick, at least one unit, either way', () => {
    expect(easePace(40, 20)).toBe(30);
    expect(easePace(20, 40)).toBe(30);
    expect(easePace(21, 20)).toBe(20);
    expect(easePace(20, 21)).toBe(21);
    expect(easePace(20, 20)).toBe(20);
  });

  it('walks on a slant with two keys, as fast overall, so slower along each axis', () => {
    const { state, world } = setup(undefined, 'free');
    const [x0, y0] = feet(state);
    run(state, world, [{ t: 0, c: 'walk', dx: 1, dy: 1, dir: 2 }], 30);
    const [x1, y1] = feet(state);
    expect(x1! - x0!).toBe(y1! - y0!);
    expect(Math.hypot(x1! - x0!, y1! - y0!) / 30).toBeCloseTo(SUB / BASE_STEP_TICKS, -1);
    expect(state.player.facing, 'faces the key pressed last').toBe(2);
  });

  it('stops at what blocks, slides along it on a slant, and bumps once', () => {
    const { state, world } = setup((w) => {
      for (let y = 120; y < 140; y++) w.feature[idx(130, y)] = F.thicket;
    }, 'free');
    const events = run(state, world, [{ t: 0, c: 'walk', dx: 1, dy: 0, dir: 1 }], 40);
    expect(state.player.x).toBe(129);
    expect(feet(state)[0]! + FOOT_HALF_W, 'up against the thicket').toBe(130 * SUB);
    expect(events.filter((e) => e.type === 'bump')).toHaveLength(1);
    run(state, world, [{ t: state.tick, c: 'walk', dx: 1, dy: 1, dir: 2 }], 30);
    expect(state.player.x, 'still against it').toBe(129);
    expect(state.player.y, 'slid along it').toBeGreaterThan(130);
  });

  it('a tap walks a little, less than a tile', () => {
    const { state, world } = setup(undefined, 'free');
    const [x0] = feet(state);
    run(state, world, [{ t: 0, c: 'walk', dx: -1, dy: 0, dir: 3 }, { t: 0, c: 'walk', dx: 0, dy: 0, dir: -1 }], 20);
    const moved = x0! - feet(state)[0]!;
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThan(SUB);
  });

  it('a click walks there over the grid, on a slant where it can, and faces it', () => {
    const { state, world } = setup(undefined, 'free');
    run(state, world, [{ t: 0, c: 'goto', x: 134, y: 133, onto: false, action: null, at: 'front' }], 80);
    expect(state.player.route).toBeNull();
    const { x, y, facing } = state.player;
    expect(Math.abs(x - 134) + Math.abs(y - 133)).toBe(1);
    expect([x + [0, 1, 0, -1][facing]!, y + [-1, 0, 1, 0][facing]!]).toEqual([134, 133]);
  });

  it('a move command walks one way until halted (as the bot and old replays send)', () => {
    const { state, world } = setup(undefined, 'free');
    run(state, world, [{ t: 0, c: 'move', dir: 2 }, { t: BASE_STEP_TICKS * 3, c: 'halt' }], 30);
    expect(state.player.y).toBe(131);
  });
});

describe('clicked walks (SPEC 5.2)', () => {
  /** A stream two tiles wide across the map at rows 132–133, everything seen; a log over it at column `logX`, if any. */
  function across(logX?: number) {
    const { state, world } = setup((w) => {
      for (let x = 0; x < 256; x++) for (const y of [132, 133]) {
        w.terrain[idx(x, y)] = T.stream;
        if (x === logX) w.flags[idx(x, y)]! |= FLAG.bridge;
      }
    }, 'grid');
    state.explored.fill(-1);
    return { state, world };
  }
  const path = (s: GameState, w: World, x: number, y: number) => {
    const seen: string[] = [];
    step(s, w, [{ t: s.tick, c: 'goto', x, y, onto: true, action: null, at: 'front' }]);
    seen.push(`${s.player.x},${s.player.y}`);
    for (let k = 0; k < 2000 && s.player.route; k++) {
      step(s, w, []);
      seen.push(`${s.player.x},${s.player.y}`);
    }
    return seen;
  };

  it('goes round by a log a few tiles off the line rather than wading', () => {
    const { state, world } = across(131);
    const walked = path(state, world, 128, 136);
    expect(walked).toContain('131,132');
    expect(walked.some((t) => t === '128,132' || t === '129,132' || t === '130,132')).toBe(false);
    expect(state.player.wet).toBe(0);
  });

  it('wades when the only log is far out of the way', () => {
    const { state, world } = across(160);
    const walked = path(state, world, 128, 136);
    expect(walked).not.toContain('160,132');
    expect([state.player.x, state.player.y]).toEqual([128, 136]);
    expect(state.player.wet).toBeGreaterThan(0);
  });

  it('crosses at gravel shallows, wet to the ankles only', () => {
    const { state, world } = across();
    for (const y of [132, 133]) world.flags[idx(131, y)]! |= FLAG.ford;
    const walked = path(state, world, 128, 136);
    expect(walked).toContain('131,132');
    expect(state.player.wet, 'wet to the ankles (drying a little since)').toBeGreaterThan(FORD_WET - 3);
    expect(state.player.wet).toBeLessThanOrEqual(FORD_WET);
  });

  it('takes a game trail when it is little out of the way', () => {
    const { state, world } = setup((w) => {
      for (let y = 120; y <= 140; y++) w.flags[idx(130, y)]! |= FLAG.trail;
    }, 'grid');
    state.explored.fill(-1);
    const walked = path(state, world, 131, 138);
    expect(walked.filter((t) => t.startsWith('130,')).length).toBeGreaterThan(5);
  });

  it('would rather the ground it has seen', () => {
    const cost = (seen: boolean) => {
      const { state, world } = setup(undefined, 'grid');
      state.explored.fill(seen ? -1 : 0);
      return routeCost(state, world, idx(128, 128), idx(129, 128));
    };
    expect(cost(false)).toBeGreaterThan(cost(true));
  });
});

describe('movement', () => {
  it('a step on open ground takes 6 ticks (on the grid)', () => {
    const { state, world } = setup(undefined, 'grid');
    run(state, world, [{ t: 0, c: 'move', dir: 1 }], 1);
    expect(state.player.x).toBe(129);
    expect(state.player.stepTotal).toBe(BASE_STEP_TICKS);
    run(state, world, [{ t: 1, c: 'halt' }], 20);
    expect(state.player.x).toBe(129);
  });

  it('holding a direction walks a tile every step', () => {
    const { state, world } = setup();
    run(state, world, [{ t: 0, c: 'move', dir: 2 }], BASE_STEP_TICKS * 5);
    expect(state.player.y).toBe(128 + 5);
    expect(state.player.facing).toBe(2);
  });

  it('a tap shorter than a tick still takes one step', () => {
    const { state, world } = setup();
    run(state, world, [{ t: 0, c: 'move', dir: 3 }, { t: 0, c: 'halt' }], 30);
    expect(state.player.x).toBe(127);
  });

  it('a tap during a step is taken when the step ends (on the grid)', () => {
    const { state, world } = setup(undefined, 'grid');
    run(state, world, [{ t: 0, c: 'move', dir: 1 }, { t: 1, c: 'halt' }, { t: 2, c: 'move', dir: 2 }, { t: 3, c: 'halt' }], 30);
    expect([state.player.x, state.player.y]).toEqual([129, 129]);
  });

  it('walks among trees, slower than in the open', () => {
    const world = flatWorld();
    world.feature[idx(1, 0)] = F.conifer;
    expect(stepTicks(world, idx(0, 0), idx(1, 0))).toBeGreaterThan(stepTicks(world, idx(1, 0), idx(2, 0)));
    const { state, world: w2 } = setup((w) => {
      w.feature[idx(129, 128)] = F.conifer;
    });
    run(state, w2, [{ t: 0, c: 'move', dir: 1 }], 12);
    expect(state.player.x, 'walked onto the tree tile, and on').toBeGreaterThanOrEqual(129);
  });

  it('blocked by thickets and cliffs, with one bump, facing the way pushed', () => {
    const { state, world } = setup((w) => {
      w.feature[idx(129, 128)] = F.thicket;
      w.terrain[idx(128, 127)] = T.cliff;
    });
    const events = run(state, world, [{ t: 0, c: 'move', dir: 1 }], 40);
    expect(state.player.x).toBe(128);
    expect(events.filter((e) => e.type === 'bump')).toHaveLength(1);
    run(state, world, [{ t: state.tick, c: 'move', dir: 0 }], 10);
    expect(state.player.y).toBe(128);
    expect(state.player.facing).toBe(0);
  });

  it('rough ground and climbing cost more', () => {
    const world = flatWorld();
    world.terrain[idx(1, 0)] = T.marsh;
    expect(stepTicks(world, idx(0, 0), idx(1, 0))).toBe(10);
    world.elev[idx(0, 1)] = 8;
    expect(stepTicks(world, idx(0, 0), idx(0, 1))).toBe(BASE_STEP_TICKS + 4);
    expect(stepTicks(world, idx(0, 1), idx(0, 0))).toBe(BASE_STEP_TICKS);
    world.flags[idx(2, 0)] = FLAG.trail;
    world.terrain[idx(2, 0)] = T.forest;
    expect(stepTicks(world, idx(1, 0), idx(2, 0))).toBe(BASE_STEP_TICKS);
  });

  it('never walks off the map', () => {
    const { state, world } = setup((w) => {
      w.start = { x: 0, y: 0 };
    });
    state.player.x = state.player.y = 0;
    run(state, world, [{ t: 0, c: 'move', dir: 0 }], 30);
    run(state, world, [{ t: state.tick, c: 'move', dir: 3 }], 30);
    expect([state.player.x, state.player.y]).toEqual([0, 0]);
  });
});

describe('sight and the map', () => {
  it('explores round the start, and more as the survivor walks', () => {
    const { state, world } = setup();
    expect(isExplored(state, idx(128, 128))).toBe(true);
    expect(isExplored(state, idx(128, 160))).toBe(false);
    run(state, world, [{ t: 0, c: 'move', dir: 2 }], BASE_STEP_TICKS * 20);
    expect(isExplored(state, idx(128, 160))).toBe(true);
  });

  it('a viewpoint reveals a wide area, once', () => {
    const { state, world } = setup();
    const far = idx(128, 100 - VIEWPOINT_REVEAL + 2);
    expect(isExplored(state, far)).toBe(false);
    const events = run(state, world, [{ t: 0, c: 'move', dir: 0 }], BASE_STEP_TICKS * 40);
    expect(events.filter((e) => e.type === 'viewpoint')).toHaveLength(1);
    expect(state.viewpoints[0]).toBe(true);
    expect(isExplored(state, far)).toBe(true);
  });

  it('sight shrinks at night, and a fire lights its own circle', () => {
    const { state, world } = setup();
    expect(sightCircles(state)[0]!.r).toBeGreaterThan(10);
    const toMidnight = (24 * 60 - START_MINUTE) * TICKS_PER_MINUTE;
    run(state, world, [{ t: toMidnight - 5, c: 'debug-fire' }], toMidnight);
    const circles = sightCircles(state);
    expect(circles[0]!.r).toBe(2);
    expect(circles[1]).toMatchObject({ x: 128, y: 129, fire: true, r: 6 });
  });

  it('announces the hour', () => {
    const { state, world } = setup();
    const events = run(state, world, [], 60 * TICKS_PER_MINUTE);
    expect(events.filter((e) => e.type === 'hour')).toHaveLength(1);
  });

  it('teleports only onto open ground', () => {
    const { state, world } = setup((w) => {
      w.terrain[idx(10, 10)] = T.deep;
    });
    step(state, world, [{ t: 0, c: 'debug-teleport', x: 10, y: 10 }]);
    expect(state.player.x).toBe(128);
    step(state, world, [{ t: 1, c: 'debug-teleport', x: 20, y: 20 }]);
    expect([state.player.x, state.player.y]).toEqual([20, 20]);
  });
});
