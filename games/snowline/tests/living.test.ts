// M4: the living world. Weather, animals and their dealt tempers, fishing and hunting, illness and
// injury, remedies, winter. Hand-built worlds and deals, and a real seed where it matters.

import { describe, expect, it } from 'vitest';
import { ANIMALS, KINDS } from '../src/content/animals.ts';
import { F, T, WATER } from '../src/content/terrain.ts';
import { availableActions } from '../src/sim/actions.ts';
import { animalCanEnter } from '../src/sim/animals.ts';
import { count, drop, give } from '../src/sim/inventory.ts';
import { fact, knowsTechnique } from '../src/sim/knowledge.ts';
import { newGame } from '../src/sim/newGame.ts';
import { candidate, type Protagonist } from '../src/sim/protagonist.ts';
import { dealRules, type Rules } from '../src/sim/rules.ts';
import type { Animal, GameState, SimEvent } from '../src/sim/state.ts';
import { step } from '../src/sim/step.ts';
import { ALL, snowBand, weatherAt } from '../src/sim/weather.ts';
import { idx, type World } from '../src/sim/world.ts';
import { runTo, startScenario } from '../src/tools/runner.ts';
import { calm, flatWorld } from './sample.ts';

const MIN = 10;
const DAY = 14400;
const FRONT = idx(128, 129);

function setup(opts: { edit?: (w: World) => void; rules?: (r: Rules) => void; who?: Partial<Protagonist> } = {}) {
  const world = flatWorld();
  opts.edit?.(world);
  const rules = dealRules('flat');
  opts.rules?.(rules);
  const state = newGame('flat', { ...candidate('flat', 0), background: 'city', trait: 'restless', tool: 'hatchet', pockets: [], ...opts.who }, world, rules);
  calm(state);
  state.vitals = { health: 100, hydration: 100, nutrition: 100, rest: 100, warmth: 100, morale: 60 };
  return { state, world };
}

const minutes = (s: GameState, w: World, n: number, out?: SimEvent[]) => runTo(s, w, [], s.tick + n * MIN, out ? (e) => out.push(...e) : undefined);

function act(s: GameState, w: World, action: string, tile: number): void {
  step(s, w, [{ t: s.tick, c: 'act', action, tile }]);
  if (!s.task) throw new Error(`${action} did not start: ${availableActions(s, w).map((a) => a.action).join(', ')}`);
  for (let k = 0; s.task && !s.over && k < 100000; k++) step(s, w, []);
}

function animal(s: GameState, kind: Animal['kind'], x: number, y: number): Animal {
  const a: Animal = { id: 900 + s.animals.length, kind, x, y, hx: x, hy: y, mode: 'wander', t: 1, timer: 0, tx: -1, ty: -1, mark: 0, bull: false, gone: 0 };
  s.animals.push(a);
  return a;
}

/** Set the time to a given hour on the current day. */
function at(s: GameState, hour: number): void {
  const now = (s.tick / 10 + 14 * 60 + 30) % 1440;
  let delta = hour * 60 - now;
  if (delta < 0) delta += 1440;
  s.tick += Math.round(delta) * 10;
  s.tick -= s.tick % 10;
}

describe('weather (SPEC 6.5)', () => {
  it('the forecast comes from the seed alone, whatever the player does', () => {
    const a = startScenario({ seed: 'forecast', protagonist: 0, commands: [], ticks: 0 });
    const b = startScenario({ seed: 'forecast', protagonist: 3, commands: [], ticks: 0 });
    runTo(a.state, a.world, [{ t: 1, c: 'move', dir: 1 }], 3000);
    expect(b.state.weather).toEqual(a.state.weather);
    expect(startScenario({ seed: 'other', protagonist: 0, commands: [], ticks: 0 }).state.weather.f).not.toEqual(a.state.weather.f);
  });

  it('has one severe storm, in its window, and every kind of weather over a run', () => {
    const { state } = startScenario({ seed: 'storms', protagonist: 0, commands: [], ticks: 0 });
    const severe = state.weather.f.filter((v) => ALL[v] === 'severe').length;
    expect(severe).toBe(4);
    expect(state.weather.severeDay).toBeGreaterThanOrEqual(18);
    expect(state.weather.severeDay).toBeLessThanOrEqual(30);
    expect(new Set(state.weather.f.map((v) => ALL[v])).size).toBeGreaterThanOrEqual(6);
  });

  it('the snowline comes down a band every ten days from day 30', () => {
    expect(snowBand(20 * DAY)).toBe(4);
    expect(snowBand(30 * DAY)).toBe(3);
    expect(snowBand(41 * DAY)).toBe(2);
    expect(snowBand(62 * DAY)).toBe(0);
  });

  it('rain soaks the survivor in the open, not under the overhang, and puts out an uncovered fire', () => {
    const { state, world } = setup({ edit: (w) => (w.terrain[idx(140, 140)] = T.shelter) });
    state.weather.f = state.weather.f.map(() => ALL.indexOf('rain'));
    state.fires.push({ x: 128, y: 129, fuel: 120, coals: 0, banked: false, smoke: 0, signal: false });
    minutes(state, world, 30);
    expect(state.player.wet).toBeGreaterThan(15);
    expect(state.fires).toHaveLength(0);
    // A fire beside the overhang floor is covered.
    state.fires.push({ x: 140, y: 141, fuel: 120, coals: 0, banked: false, smoke: 0, signal: false });
    minutes(state, world, 30);
    expect(state.fires).toHaveLength(1);
  });

  it('a foretelling sign becomes known after storms follow it', () => {
    const { state, world } = setup({ rules: (r) => (r.signs = ['foretells', 'noise', 'noise', 'noise', 'noise', 'noise', 'noise']) });
    // Alternate a day of clear with a stormy night, so the sign has storms to foretell.
    state.weather.f = state.weather.f.map((_, i) => ALL.indexOf(i % 8 === 6 || i % 8 === 7 ? 'thunderstorm' : 'clear'));
    for (let d = 0; d < 14 && fact(state, 'sign', 0)?.level !== 'known'; d++) {
      minutes(state, world, 1440);
      state.vitals = { health: 100, hydration: 100, nutrition: 100, rest: 100, warmth: 100, morale: 60 };
    }
    expect(fact(state, 'sign', 0)).toMatchObject({ level: 'known', value: 'foretells' });
  });

  it('winter ends a run that lasts too long', () => {
    const { state, world } = setup();
    state.tick = 71 * DAY + 9 * 600 * 10;
    for (let k = 0; k < 2 && !state.over; k++) {
      minutes(state, world, 1440);
      state.vitals = { health: 100, hydration: 100, nutrition: 100, rest: 100, warmth: 100, morale: 60 };
    }
    expect(state.over?.cause).toBe('winter');
  });
});

describe('animals (SPEC 9)', () => {
  it('a real valley has its animals, each where it can stand', () => {
    const { state, world } = startScenario({ seed: 'first-light', protagonist: 0, commands: [], ticks: 0 });
    for (const k of KINDS) expect(state.animals.filter((a) => a.kind === k).length, k).toBe(ANIMALS[k].count);
    for (const a of state.animals) expect(animalCanEnter({ ...state, player: { ...state.player, x: -1, y: -1 } }, world, a, a.x, a.y), a.kind).toBe(true);
    runTo(state, world, [], 6000);
    expect(state.animals.some((a) => a.x !== a.hx || a.y !== a.hy)).toBe(true);
  });

  it('prey runs from the survivor', () => {
    const { state, world } = setup();
    at(state, 7);
    const hare = animal(state, 'hare', 128, 131);
    step(state, world, [{ t: state.tick, c: 'move', dir: 2 }]);
    runTo(state, world, [{ t: state.tick, c: 'halt' }], state.tick + 60);
    expect(hare.mode === 'flee' || Math.abs(hare.y - state.player.y) > 2).toBe(true);
  });

  function bear(deterrent: 'face' | 'noise' | 'fire') {
    const t = setup({ rules: (r) => (r.tempers[0] = { boldness: 'wary', deterrent, warning: 0 }) });
    at(t.state, 10);
    const b = animal(t.state, 'bear', 128, 131);
    return { ...t, b };
  }

  it('a bear crowded warns; shouting turns one that backs off from noise, and its temper is known', () => {
    const { state, world, b } = bear('noise');
    const ev: SimEvent[] = [];
    minutes(state, world, 3, ev);
    expect(b.mode).toBe('warn');
    act(state, world, 'shout', idx(128, 128));
    minutes(state, world, 10, ev);
    expect(b.mode === 'leave' || b.mode === 'wander').toBe(true);
    expect(state.conditions.some((c) => c.id === 'wound')).toBe(false);
    expect(fact(state, 'temper', 0)).toMatchObject({ level: 'known' });
    expect(fact(state, 'temper', 0)!.value).toContain('backs off from noise');
  });

  it('standing still facing one that only fire turns gets the survivor hurt', () => {
    const { state, world, b } = bear('fire');
    state.player.facing = 2;
    minutes(state, world, 15);
    expect(b.mode === 'leave' || b.mode === 'wander').toBe(true);
    expect(state.conditions.some((c) => c.id === 'wound')).toBe(true);
  });

  it('backing well away always works', () => {
    const { state, world, b } = bear('fire');
    minutes(state, world, 3);
    expect(b.mode).toBe('warn');
    runTo(state, world, [{ t: state.tick, c: 'move', dir: 0 }], state.tick + 70);
    step(state, world, [{ t: state.tick, c: 'halt' }]);
    minutes(state, world, 6);
    expect(state.conditions.some((c) => c.id === 'wound')).toBe(false);
  });

  it('jays steal food left lying out, and pack rats carry small things to the midden', () => {
    const { state, world } = setup();
    at(state, 10);
    drop(state, 120, 128, { k: 'pine-nuts', n: 2 });
    animal(state, 'jay', 121, 128);
    minutes(state, world, 30);
    expect(state.stashes.find((s) => s.x === 120)?.items[0]?.n ?? 0).toBeLessThan(2);
    const s2 = setup();
    at(s2.state, 23);
    s2.world.midden = { x: 100, y: 100 };
    drop(s2.state, 110, 100, { k: 'paperclip', n: 1 });
    animal(s2.state, 'packrat', 108, 100);
    minutes(s2.state, s2.world, 60);
    expect(s2.state.stashes.some((st) => st.x === 110)).toBe(false);
    expect(s2.state.stashes.some((st) => st.y === 101 && st.items.some((i) => i.k === 'paperclip'))).toBe(true);
  });

  it('watching jays at a patch marks the plant as suspected safe', () => {
    const { state, world } = setup({
      edit: (w) => {
        w.feature[idx(132, 128)] = F.plant;
        w.data[idx(132, 128)] = 0;
        w.patches = [{ role: 'safe', thing: 0, center: { x: 132, y: 128 }, tiles: [{ x: 132, y: 128 }] }];
      },
      rules: (r) => (r.plants[0] = 'nourishing'),
    });
    at(state, 10);
    animal(state, 'jay', 133, 128);
    minutes(state, world, 40);
    expect(fact(state, 'plant', 0)).toMatchObject({ level: 'suspected', value: 'safe' });
  });

  it('a porcupine walked into leaves quills', () => {
    const { state, world } = setup();
    at(state, 23);
    animal(state, 'porcupine', 128, 129).t = 1e9;
    runTo(state, world, [{ t: state.tick, c: 'move', dir: 2 }, { t: state.tick + 5, c: 'halt' }], state.tick + 10);
    expect(state.conditions.some((c) => c.id === 'quills')).toBe(true);
    act(state, world, 'pull-quills', idx(128, 128));
    expect(state.conditions.some((c) => c.id === 'quills')).toBe(false);
  });
});

describe('hunting and fishing (SPEC 7.4)', () => {
  it('a thrown spear can kill a hare, and dressing it gives meat and a hide', () => {
    const { state, world } = setup();
    at(state, 7);
    state.skills.hunting = 200;
    give(state, 'hard-spear', 1);
    for (let k = 0; k < 20 && !count(state, 'game'); k++) {
      const h = animal(state, 'hare', 128, 130);
      h.t = 1e9;
      act(state, world, 'throw-spear', idx(128, 128));
      state.animals = [];
    }
    expect(count(state, 'game', 0)).toBe(1);
    const slot = state.inventory.findIndex((i) => i.k === 'game');
    step(state, world, [{ t: state.tick, c: 'use', action: 'dress', slot }]);
    minutes(state, world, 25);
    expect(count(state, 'meat')).toBe(2);
    expect(count(state, 'hide')).toBe(1);
  });

  it('missing fish teaches the survivor to aim low', () => {
    const { state, world } = setup({ edit: (w) => ((w.terrain[FRONT] = T.gravel), (w.water[FRONT] = WATER.streamA)) });
    give(state, 'spear', 1);
    let fish = 0;
    for (let k = 0; k < 20; k++) {
      // A trout holding on the faced gravel, calm (SPEC 7.4).
      state.fish = [{ id: k + 1, x: 128, y: 129, hx: 128, hy: 129, t: 1e9, spook: 0 }];
      act(state, world, 'spear-fish', FRONT);
      fish = count(state, 'fish');
      state.vitals.rest = state.vitals.hydration = state.vitals.nutrition = state.vitals.warmth = 100;
      at(state, 10);
    }
    expect(knowsTechnique(state, 'aim-low')).toBe(true);
    expect(fish).toBeGreaterThan(0);
  });

  it('a snare set near hares catches one at night', () => {
    const { state, world } = setup();
    give(state, 'snare', 1);
    const slot = state.inventory.findIndex((i) => i.k === 'snare');
    step(state, world, [{ t: state.tick, c: 'use', action: 'set-snare', slot }]);
    minutes(state, world, 11);
    expect(state.builds.some((b) => b.kind === 'snare')).toBe(true);
    for (let k = 0; k < 6; k++) animal(state, 'hare', 128, 133 + k).t = 1e9;
    for (let n = 0; n < 10 && !state.builds[0]!.items?.length; n++) {
      minutes(state, world, 1440);
      state.vitals = { health: 100, hydration: 100, nutrition: 100, rest: 100, warmth: 100, morale: 60 };
    }
    expect(state.builds[0]!.items?.length).toBe(1);
    act(state, world, 'snare-take', FRONT);
    expect(count(state, 'game', 0)).toBe(1);
  });
});

describe('illness, injury, remedies (SPEC 7.7)', () => {
  it('insects bite at dusk by the water, and the dealt insect herb keeps them off', () => {
    const bitten = setup({ edit: (w) => (w.terrain[FRONT] = T.reeds) });
    at(bitten.state, 19);
    minutes(bitten.state, bitten.world, 120);
    expect(bitten.state.conditions.some((c) => c.id === 'bites')).toBe(true);
    const safe = setup({ edit: (w) => (w.terrain[FRONT] = T.reeds), rules: (r) => (r.remedies[2] = 'insects') });
    at(safe.state, 19);
    give(safe.state, 'herb', 1, 2);
    const slot = safe.state.inventory.findIndex((i) => i.k === 'herb');
    step(safe.state, safe.world, [{ t: safe.state.tick, c: 'use', action: 'herb-insects', slot }]);
    minutes(safe.state, safe.world, 120);
    expect(safe.state.conditions.some((c) => c.id === 'bites')).toBe(false);
    expect(fact(safe.state, 'remedy', 2)).toMatchObject({ level: 'known', value: 'insects' });
  });

  it('the wrong herb does nothing; the stomach herb eases food poisoning', () => {
    const { state, world } = setup({ rules: (r) => ((r.remedies[0] = 'wound'), (r.remedies[1] = 'stomach')) });
    state.conditions.push({ id: 'food-poisoning', sev: 60, since: 0, until: 18000 });
    give(state, 'herb', 1, 0);
    give(state, 'herb', 1, 1);
    let slot = state.inventory.findIndex((i) => i.k === 'herb' && i.d === 0);
    step(state, world, [{ t: state.tick, c: 'use', action: 'herb-stomach', slot }]);
    minutes(state, world, 12);
    expect(state.conditions[0]!.sev).toBeGreaterThan(55);
    expect(fact(state, 'remedy', 0)).toMatchObject({ level: 'suspected', value: 'not for the stomach' });
    slot = state.inventory.findIndex((i) => i.k === 'herb' && i.d === 1);
    step(state, world, [{ t: state.tick, c: 'use', action: 'herb-stomach', slot }]);
    minutes(state, world, 12);
    expect(state.conditions[0]?.sev ?? 0).toBeLessThan(20);
    expect(fact(state, 'remedy', 1)).toMatchObject({ level: 'known', value: 'stomach' });
  });

  it('a wound left uncleaned may go bad; cleaned with boiled water it does not', () => {
    let infected = 0;
    for (let k = 0; k < 20 && infected === 0; k++) {
      const { state, world } = setup();
      for (let j = 0; j < k * 3; j++) state.rng.health.s[j % 4] = (state.rng.health.s[j % 4]! * 31 + 7) >>> 0;
      state.conditions.push({ id: 'wound', sev: 40, since: 0, until: 30000 });
      minutes(state, world, 13 * 60);
      if (state.conditions.some((c) => c.id === 'infection')) infected++;
    }
    expect(infected).toBeGreaterThan(0);
    const { state, world } = setup();
    state.conditions.push({ id: 'wound', sev: 40, since: 0, until: 30000 });
    give(state, 'boiled-water', 1);
    const slot = state.inventory.findIndex((i) => i.k === 'boiled-water');
    step(state, world, [{ t: state.tick, c: 'use', action: 'clean-wound', slot }]);
    minutes(state, world, 13 * 60);
    expect(state.conditions.some((c) => c.id === 'infection')).toBe(false);
  });

  it('walking scree in the dark risks a fall', () => {
    const { state, world } = setup({ edit: (w) => w.terrain.fill(T.scree) });
    at(state, 1);
    state.vitals.rest = 15;
    for (let k = 0; k < 80 && !state.conditions.some((c) => c.id === 'sprain'); k++) {
      runTo(state, world, [{ t: state.tick, c: 'move', dir: (k % 4) as 0 }, { t: state.tick + 12, c: 'halt' }], state.tick + 40);
    }
    expect(state.conditions.some((c) => c.id === 'sprain')).toBe(true);
  });
});

describe('determinism with the living world', () => {
  it('the same seed and input give the same weather, animals, and state', () => {
    const a = startScenario({ seed: 'alive', protagonist: 0, commands: [], ticks: 0 });
    const b = startScenario({ seed: 'alive', protagonist: 0, commands: [], ticks: 0 });
    runTo(a.state, a.world, [], 2 * DAY);
    runTo(b.state, b.world, [], 2 * DAY);
    expect(JSON.stringify(a.state.animals)).toBe(JSON.stringify(b.state.animals));
    expect(weatherAt(a.state)).toBe(weatherAt(b.state));
  });
});
