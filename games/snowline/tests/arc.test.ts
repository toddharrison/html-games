// M5: the arc of a run. Flights, the severe storm and its rockslide, the wreckage and the beacon,
// signal fires, and the bot.

import { describe, expect, it } from 'vitest';
import { FLAG, T } from '../src/content/terrain.ts';
import { flightNow, signalChance } from '../src/sim/arc.ts';
import { count, drop, give } from '../src/sim/inventory.ts';
import { newGame } from '../src/sim/newGame.ts';
import { candidate } from '../src/sim/protagonist.ts';
import { dealRules } from '../src/sim/rules.ts';
import type { GameState } from '../src/sim/state.ts';
import { canEnter, step } from '../src/sim/step.ts';
import { ALL } from '../src/sim/weather.ts';
import { idx, type World } from '../src/sim/world.ts';
import { playBot } from '../src/tools/bot.ts';
import { runTo } from '../src/tools/runner.ts';
import { calm, flatWorld } from './sample.ts';
import { START_MINUTE } from '../src/content/balance.ts';

const MIN = 10;
const DAY = 14400;

function setup(edit?: (w: World) => void) {
  const world = flatWorld();
  edit?.(world);
  const state = newGame('flat', { ...candidate('flat', 0), background: 'city', trait: 'restless', tool: 'hatchet', pockets: ['mirror'] }, world, dealRules('flat'));
  calm(state);
  return { state, world };
}

const fresh = (s: GameState) => (s.vitals = { health: 100, hydration: 100, nutrition: 100, rest: 100, warmth: 100, morale: 60 });

describe('flights (SPEC 10)', () => {
  it('two or three search flights in days 2–10, and late ones from day 40', () => {
    // The flights are planned from the run's own events stream: a flat world does as well as a real
    // valley, without generating one (four took 25 s on CI).
    for (const seed of ['a', 'b', 'c', 'd']) {
      const state = newGame(seed, candidate(seed, 0), flatWorld(), dealRules(seed));
      const search = state.arc.flights.filter((f) => !f.late);
      const late = state.arc.flights.filter((f) => f.late);
      expect(search.length).toBeGreaterThanOrEqual(2);
      expect(search.length).toBeLessThanOrEqual(3);
      for (const f of search) {
        const day = Math.floor((f.t / 10 + START_MINUTE) / 1440) + 1;
        expect(day).toBeGreaterThanOrEqual(2);
        expect(day).toBeLessThanOrEqual(10);
      }
      expect(late.length).toBeGreaterThan(2);
    }
  });

  it('no smoke, no chance; a smoky fire high and open on the knoll is likely seen', () => {
    const { state, world } = setup((w) => (w.knoll = { x: 128, y: 120 }));
    expect(signalChance(state, world)).toBe(0);
    world.band.fill(2);
    state.fires.push({ x: 128, y: 120, fuel: 300, coals: 0, banked: false, smoke: 300, signal: true });
    expect(signalChance(state, world)).toBeGreaterThan(0.8);
  });

  it('a seen signal brings rescue; a missed flight is a blow', () => {
    const seen = setup((w) => ((w.knoll = { x: 128, y: 120 }), w.band.fill(2)));
    seen.state.arc.flights = [{ t: 200, late: false }];
    seen.state.fires.push({ x: 128, y: 120, fuel: 600, coals: 0, banked: false, smoke: 600, signal: true });
    seen.state.rng.events = { s: [1, 2, 3, 4], n: 0 };
    runTo(seen.state, seen.world, [], 200 + 13 * MIN);
    expect(seen.state.arc.rescueAt).toBeGreaterThan(0);
    fresh(seen.state);
    runTo(seen.state, seen.world, [], seen.state.arc.rescueAt + MIN);
    expect(seen.state.over).toMatchObject({ kind: 'rescue', cause: 'search aircraft' });
    const missed = setup();
    missed.state.arc.flights = [{ t: 200, late: false }];
    missed.state.vitals.morale = 60;
    runTo(missed.state, missed.world, [], 200 + 13 * MIN);
    expect(missed.state.vitals.morale).toBeLessThan(45);
    expect(missed.state.over).toBeNull();
  });

  it('the mirror can be flashed while an aircraft is overhead', () => {
    const { state, world } = setup();
    state.arc.flights = [{ t: 100, late: false }];
    runTo(state, world, [], 110);
    expect(flightNow(state)).not.toBeNull();
    step(state, world, [{ t: state.tick, c: 'act', action: 'flash-mirror', tile: idx(128, 128) }]);
    runTo(state, world, [], state.tick + 30);
    expect(state.memory['mirror-at']).toBeGreaterThan(0);
  });
});

describe('the severe storm and the rockslide (SPEC 6.5, 10)', () => {
  function stormy() {
    const t = setup((w) => {
      w.flags[idx(128, 120)] = FLAG.slideGap;
      w.terrain[idx(128, 120)] = T.cliff;
      w.feature[idx(140, 140)] = 1;
    });
    // A storm from the second period on, for a while.
    t.state.weather.f = t.state.weather.f.map((_, i) => (i >= 6 && i < 8 ? ALL.indexOf('severe') : ALL.indexOf('cloudy')));
    return t;
  }

  it('wrecks the camp, puts out fires, flings things, fells trees, then opens the slide', () => {
    const { state, world } = stormy();
    state.builds.push({ kind: 'lean-to', x: 128, y: 128 }, { kind: 'bed', x: 128, y: 128 }, { kind: 'reflector', x: 130, y: 130 });
    state.fires.push({ x: 130, y: 130, fuel: 500, coals: 0, banked: false, smoke: 0, signal: false });
    drop(state, 125, 125, { k: 'stick', n: 3 });
    expect(canEnter(state, world, 128, 120)).toBe(false);
    runTo(state, world, [], 4 * 600 * MIN / 10 * 10);
    fresh(state);
    expect(state.arc.stormHit).toBe(true);
    expect(state.builds.map((b) => b.kind)).toEqual(['reflector']);
    expect(state.fires).toHaveLength(0);
    expect(state.stashes.reduce((n, st) => n + st.items.reduce((m, i) => m + i.n, 0), 0)).toBe(3);
    runTo(state, world, [], state.tick + 9 * 600);
    expect(state.arc.slide).toBe(true);
    expect(canEnter(state, world, 128, 120)).toBe(true);
  });
});

describe('the wreckage and the beacon (SPEC 10)', () => {
  it('the tail holds the beacon and supplies; switching it on brings rescue in 1–3 days', () => {
    const { state, world } = setup((w) => (w.feature[idx(128, 129)] = 12));
    step(state, world, [{ t: 0, c: 'act', action: 'search-tail', tile: idx(128, 129) }]);
    runTo(state, world, [], 25 * MIN);
    for (const k of ['beacon', 'pot', 'matches', 'fishing-line', 'first-aid', 'ration-pack']) expect(count(state, k), k).toBeGreaterThan(0);
    const slot = state.inventory.findIndex((i) => i.k === 'beacon');
    step(state, world, [{ t: state.tick, c: 'use', action: 'beacon-on', slot }]);
    runTo(state, world, [], state.tick + 5 * MIN);
    const at = state.arc.rescueAt;
    expect(at - state.tick).toBeGreaterThanOrEqual(DAY - 10 * MIN);
    expect(at - state.tick).toBeLessThanOrEqual(3 * DAY + 600 * MIN);
    for (let d = 0; d < 4 && !state.over; d++) {
      give(state, 'ration-pack', 0);
      fresh(state);
      runTo(state, world, [], state.tick + DAY);
    }
    expect(state.over).toMatchObject({ kind: 'rescue', cause: 'beacon' });
  });
});

describe('the bot (SPEC 11.4)', () => {
  it('plays a few days of a real valley in both modes without getting stuck', () => {
    for (const knows of [false, true]) {
      const r = playBot('bot-test', 0, knows, 3);
      expect(r.days).toBeGreaterThan(1);
      if (knows) expect(r.firstFireDay).toBeGreaterThan(0);
    }
  });
});
