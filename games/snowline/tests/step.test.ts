// Unit tests for movement, sight, and viewpoints, on a hand-built flat world.

import { describe, expect, it } from 'vitest';
import { BASE_STEP_TICKS, START_MINUTE, TICKS_PER_MINUTE, VIEWPOINT_REVEAL } from '../src/content/balance.ts';
import { F, FLAG, T } from '../src/content/terrain.ts';
import { newGame } from '../src/sim/newGame.ts';
import { candidate } from '../src/sim/protagonist.ts';
import { dealRules } from '../src/sim/rules.ts';
import type { Command, GameState, SimEvent } from '../src/sim/state.ts';
import { isExplored, sightCircles, step } from '../src/sim/step.ts';
import { idx, stepTicks, type World } from '../src/sim/world.ts';
import { runTo } from '../src/tools/runner.ts';
import { flatWorld } from './sample.ts';

function setup(edit?: (w: World) => void): { state: GameState; world: World } {
  const world = flatWorld();
  edit?.(world);
  return { state: newGame('flat', candidate('flat', 0), world, dealRules('flat')), world };
}

function run(state: GameState, world: World, commands: Command[], ticks: number): SimEvent[] {
  const events: SimEvent[] = [];
  runTo(state, world, commands, state.tick + ticks, (e) => events.push(...e));
  return events;
}

describe('movement', () => {
  it('a step on open ground takes 6 ticks', () => {
    const { state, world } = setup();
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

  it('a tap during a step is taken when the step ends', () => {
    const { state, world } = setup();
    run(state, world, [{ t: 0, c: 'move', dir: 1 }, { t: 1, c: 'halt' }, { t: 2, c: 'move', dir: 2 }, { t: 3, c: 'halt' }], 30);
    expect([state.player.x, state.player.y]).toEqual([129, 129]);
  });

  it('blocked by trees and cliffs, with one bump, facing the way pushed', () => {
    const { state, world } = setup((w) => {
      w.feature[idx(129, 128)] = F.conifer;
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
