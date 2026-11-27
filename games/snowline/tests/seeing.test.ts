// M7, seeing and touching (SPEC 5.2, 6.7, 7.4): loose things on the ground, walking somewhere by a click,
// trout in the water, and things that wash up or are noticed.

import { describe, expect, it } from 'vitest';
import { DEBRIS } from '../src/content/discoveries.ts';
import { L, LOOSE } from '../src/content/loose.ts';
import { F, T, WATER } from '../src/content/terrain.ts';
import { availableActions } from '../src/sim/actions.ts';
import { count, give } from '../src/sim/inventory.ts';
import { knowsTechnique } from '../src/sim/knowledge.ts';
import { looseAt } from '../src/sim/loose.ts';
import { ALL, periodAt } from '../src/sim/weather.ts';
import { newGame } from '../src/sim/newGame.ts';
import { debrisSites } from '../src/sim/notice.ts';
import { candidate } from '../src/sim/protagonist.ts';
import { actionsAt } from '../src/sim/reach.ts';
import { dealRules } from '../src/sim/rules.ts';
import type { Command, GameState } from '../src/sim/state.ts';
import type { CommandBody } from '../src/platform/session.ts';
import { step } from '../src/sim/step.ts';
import { idx, type World } from '../src/sim/world.ts';
import { runTo, startScenario } from '../src/tools/runner.ts';
import { calm, flatWorld } from './sample.ts';

const MIN = 10;

function setup(edit?: (w: World) => void) {
  const world = flatWorld();
  edit?.(world);
  const rules = dealRules('flat');
  const state = newGame('flat', { ...candidate('flat', 0), background: 'city', trait: 'restless', tool: 'hatchet', pockets: [] }, world, rules);
  calm(state);
  state.vitals = { health: 100, hydration: 100, nutrition: 100, rest: 100, warmth: 100, morale: 60 };
  return { state, world };
}

function run(s: GameState, w: World, cmds: CommandBody[], ticks: number): void {
  step(s, w, cmds.map((c) => ({ ...c, t: s.tick }) as Command));
  for (let k = 0; k < ticks && !s.over; k++) step(s, w, []);
}

describe('loose things (SPEC 6.7)', () => {
  it('lie on the default valley in every kind, near the start too', () => {
    const { world } = startScenario({ seed: 'first-light', protagonist: 0, commands: [], ticks: 0 });
    const counts = new Array(LOOSE.length).fill(0);
    for (const l of world.loose) counts[l]++;
    for (let l = 1; l < LOOSE.length; l++) expect(counts[l], LOOSE[l]!.id).toBeGreaterThan(0);
    let near = 0;
    for (let y = world.start.y - 6; y <= world.start.y + 6; y++) for (let x = world.start.x - 6; x <= world.start.x + 6; x++) if (world.loose[idx(x, y)]) near++;
    expect(near).toBeGreaterThanOrEqual(4);
  });

  it('only lie on open, passable ground', () => {
    const { world } = startScenario({ seed: 'first-light', protagonist: 0, commands: [], ticks: 0 });
    for (let i = 0; i < world.loose.length; i++) if (world.loose[i]) expect(world.feature[i]).toBe(F.none);
  });

  it('are picked up, give what they are, and come back days later', () => {
    const { state, world } = setup((w) => (w.loose[idx(128, 129)] = L.twigs));
    run(state, world, [{ c: 'act', action: 'gather-loose', tile: idx(128, 129) }], 200);
    expect(count(state, 'stick')).toBeGreaterThanOrEqual(2);
    expect(looseAt(state, world, idx(128, 129))).toBe(0);
    state.tick += LOOSE[L.twigs]!.regrow * 14400;
    expect(looseAt(state, world, idx(128, 129))).toBe(L.twigs);
  });

  it('loose stones, once taken, are gone for the run', () => {
    const { state, world } = setup((w) => (w.loose[idx(128, 129)] = L.stones));
    run(state, world, [{ c: 'act', action: 'gather-loose', tile: idx(128, 129) }], 200);
    expect(count(state, 'stone')).toBeGreaterThanOrEqual(1);
    state.tick += 60 * 14400;
    expect(looseAt(state, world, idx(128, 129))).toBe(0);
  });

  it('a hard wind brings down fresh twigs before they would come back', () => {
    const { state, world } = setup((w) => (w.loose[idx(128, 129)] = L.twigs));
    run(state, world, [{ c: 'act', action: 'gather-loose', tile: idx(128, 129) }], 200);
    state.tick += 3 * 600; // hours on, still calm
    expect(looseAt(state, world, idx(128, 129))).toBe(0);
    state.weather.f[periodAt(state.tick) + 1] = ALL.indexOf('wind');
    expect(looseAt(state, world, idx(128, 129)), 'not before the wind comes').toBe(0);
    state.tick += 6 * 600;
    expect(looseAt(state, world, idx(128, 129))).toBe(L.twigs);
  });

  it('the ground itself no longer gives anything: a bare meadow offers nothing to gather', () => {
    const { state, world } = setup();
    expect(availableActions(state, world).filter((o) => o.action !== 'drink')).toEqual([]);
  });

  it('a branch gives sticks and a piece of the nearby tree\'s wood', () => {
    const { state, world } = setup((w) => {
      w.loose[idx(128, 129)] = L.branch;
      w.feature[idx(129, 129)] = F.aspen;
    });
    run(state, world, [{ c: 'act', action: 'gather-loose', tile: idx(128, 129) }], 300);
    expect(count(state, 'stick')).toBeGreaterThanOrEqual(2);
    expect(state.inventory.find((i) => i.k === 'firewood')?.d).toBe(4);
  });

  it('tracks are looked at, not picked up, and name a dangerous animal in the notes', () => {
    const { state, world } = setup((w) => (w.loose[idx(128, 129)] = L.tracksBear));
    expect(availableActions(state, world).map((o) => o.action)).toEqual(['look-tracks']);
    run(state, world, [{ c: 'act', action: 'look-tracks', tile: idx(128, 129) }], 100);
    expect(state.known.seen).toContain('temper:0');
    expect(state.log.at(-1)!.text).toMatch(/bear/);
  });
});

describe('walking somewhere by a click (SPEC 5.2)', () => {
  it('walks beside the thing, faces it, and does what was asked', () => {
    const { state, world } = setup((w) => (w.loose[idx(134, 131)] = L.stones));
    run(state, world, [{ c: 'goto', x: 134, y: 131, onto: false, action: 'gather-loose', at: 'front' }], 1500);
    expect(Math.abs(state.player.x - 134) + Math.abs(state.player.y - 131)).toBe(1);
    expect(count(state, 'stone')).toBeGreaterThanOrEqual(1);
    expect(state.player.route).toBeNull();
  });

  it('walks round what blocks the way', () => {
    const { state, world } = setup((w) => {
      for (let y = 120; y <= 136; y++) w.feature[idx(131, y)] = F.boulder;
    });
    run(state, world, [{ c: 'goto', x: 134, y: 128, onto: true, action: null, at: 'front' }], 3000);
    expect([state.player.x, state.player.y]).toEqual([134, 128]);
  });

  it('says so when there is no way there, and a direction key cancels a walk', () => {
    const { state, world } = setup((w) => {
      for (let y = 125; y <= 131; y++) for (let x = 135; x <= 141; x++) if (y === 125 || y === 131 || x === 135 || x === 141) w.terrain[idx(x, y)] = T.cliff;
    });
    run(state, world, [{ c: 'goto', x: 138, y: 128, onto: true, action: null, at: 'front' }], 5);
    expect(state.player.route).toBeNull();
    expect(state.log.at(-1)!.text).toMatch(/no way/);
    run(state, world, [{ c: 'goto', x: 128, y: 140, onto: true, action: null, at: 'front' }], 20);
    expect(state.player.route).not.toBeNull();
    run(state, world, [{ c: 'move', dir: 1 }, { c: 'halt' }], 30);
    expect(state.player.route).toBeNull();
  });

  it('a click offers what the keyboard would, once there', () => {
    const { state, world } = setup((w) => (w.loose[idx(134, 131)] = L.grass));
    expect(actionsAt(state, world, 134, 131).map((o) => o.action)).toEqual(['gather-loose']);
    expect(actionsAt(state, world, 140, 140)).toEqual([]);
  });
});

describe('trout in the water (SPEC 7.4)', () => {
  const stream = (w: World) => {
    for (let x = 120; x <= 140; x++) for (let y = 132; y <= 133; y++) {
      w.terrain[idx(x, y)] = T.stream;
      w.water[idx(x, y)] = WATER.streamA;
    }
  };

  it('turn up in the water near the survivor, and are dropped when they leave', () => {
    const { state, world } = setup(stream);
    runTo(state, world, [], state.tick + 120 * MIN);
    expect(state.fish.length).toBeGreaterThan(0);
    for (const f of state.fish) expect(world.terrain[idx(f.x, f.y)]).toBe(T.stream);
    run(state, world, [{ c: 'debug-teleport', x: 128, y: 60 }], 2 * MIN);
    expect(state.fish).toEqual([]);
  });

  it('scatter from a survivor walking up', () => {
    const { state, world } = setup(stream);
    state.fish = [{ id: 1, x: 128, y: 132, hx: 128, hy: 132, t: 1e6, spook: 0 }];
    state.player.y = state.player.fromY = 130;
    let spooked = false;
    for (let k = 0; k < 30 && !spooked; k++) {
      state.player.y = state.player.fromY = 130;
      state.fish[0]!.x = 128;
      state.fish[0]!.y = 132;
      run(state, world, [{ c: 'move', dir: 2 }, { c: 'halt' }], 0);
      spooked = state.fish[0]!.spook > 0;
    }
    expect(spooked).toBe(true);
  });

  it('watching them long enough teaches to aim low, without a single miss', () => {
    const { state, world } = setup(stream);
    state.player.y = state.player.fromY = 131;
    for (let k = 0; k < 3; k++) {
      state.fish = [{ id: k + 1, x: 129, y: 132, hx: 129, hy: 132, t: 1e6, spook: 0 }];
      state.tick += 14400 - ((state.tick + 14 * 600 + 300) % 14400) + 12 * 600;
      run(state, world, [{ c: 'act', action: 'watch-fish', tile: idx(128, 131) }], 200);
    }
    expect(knowsTechnique(state, 'aim-low')).toBe(true);
    expect(state.memory['fish-miss'] ?? 0).toBe(0);
  });

  it('a spear is thrown at the fish on the faced tile, and only when there is one', () => {
    const { state, world } = setup(stream);
    give(state, 'spear', 1);
    state.player.y = state.player.fromY = 131;
    state.player.facing = 2;
    expect(availableActions(state, world).some((o) => o.action === 'spear-fish')).toBe(false);
    state.fish = [{ id: 1, x: 128, y: 132, hx: 128, hy: 132, t: 1e6, spook: 0 }];
    expect(availableActions(state, world).some((o) => o.action === 'spear-fish')).toBe(true);
  });
});

describe('wreckage washes up and things are noticed (SPEC 6.7)', () => {
  it('each piece lands on a different shore tile near the crash, at its time', () => {
    const { state, world } = startScenario({ seed: 'first-light', protagonist: 0, commands: [], ticks: 0 });
    const sites = debrisSites(state, world);
    expect(new Set(sites).size).toBe(DEBRIS.length);
    for (const at of sites) {
      expect(Math.max(Math.abs((at % 256) - world.crash.x), Math.abs(Math.floor(at / 256) - world.crash.y))).toBeLessThanOrEqual(30);
      expect([idx((at % 256) + 1, Math.floor(at / 256)), at - 1, at - 256, at + 256].some((n) => world.water[n] === WATER.lake)).toBe(true);
    }
    calm(state);
    runTo(state, world, [], DEBRIS[0]!.after * MIN + MIN);
    expect(state.stashes.some((st) => idx(st.x, st.y) === sites[0] && st.items.some((it) => it.k === 'cord'))).toBe(true);
  });

  it('the survivor notices a landmark the first time it comes near in daylight, once', () => {
    const { state, world } = setup((w) => {
      w.feature[idx(131, 128)] = F.bones;
      w.landmarks.push({ kind: 'bones', x: 131, y: 128 });
    });
    const events: string[] = [];
    runTo(state, world, [], state.tick + 3 * MIN, (ev) => ev.forEach((e) => events.push(e.type)));
    expect(events.filter((e) => e === 'notice').length).toBe(1);
    expect(state.log.some((l) => /Bones/.test(l.text))).toBe(true);
  });
});
