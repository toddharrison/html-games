// The survivor's thoughts (SPEC 12.2): the tutorial as what the kid thinks next.

import { describe, expect, it } from 'vitest';
import { BEAR_TRAIL_THOUGHT, CLUES, FIRE_THOUGHTS, FIRST_THOUGHTS, NOTICING } from '../src/content/thoughtText.ts';
import { ALL } from '../src/sim/weather.ts';
import { clue } from '../src/sim/thoughts.ts';
import { L } from '../src/content/loose.ts';
import { T, TRAIL_BY, WATER } from '../src/content/terrain.ts';
import { give } from '../src/sim/inventory.ts';
import { newGame } from '../src/sim/newGame.ts';
import { candidate } from '../src/sim/protagonist.ts';
import { dealRules } from '../src/sim/rules.ts';
import type { GameState, SimEvent } from '../src/sim/state.ts';
import { step } from '../src/sim/step.ts';
import { idx, type World } from '../src/sim/world.ts';
import { calm, flatWorld } from './sample.ts';
import { HOUR, MIN, START_MINUTE } from '../src/content/balance.ts';

const FRONT = idx(128, 129);

/** A calm day, and the kid as the crash usually leaves them (nothing pressing), unless `seed` deals otherwise. */
function setup(seed = 'flat', usual = true) {
  const world = flatWorld();
  world.terrain[FRONT] = T.shallows;
  world.water[FRONT] = WATER.lake;
  const state = newGame(seed, { ...candidate('flat', 0), background: 'city', trait: 'restless', tool: 'knife', pockets: [] }, world, dealRules('flat'));
  calm(state);
  if (usual) {
    state.player.wet = 0;
    state.vitals = { ...state.vitals, hydration: 70, nutrition: 72, warmth: 80 };
  }
  return { state, world };
}

/** Run for some game minutes, keeping the survivor fed and rested so only the tutorial speaks; returns the thoughts. */
function live(s: GameState, w: World, minutes: number, keepWell = true): { text: string; hint: string; tick: number }[] {
  const out: { text: string; hint: string; tick: number }[] = [];
  for (let k = 0; k < minutes * MIN && !s.over; k++) {
    if (keepWell) s.vitals = { ...s.vitals, hydration: Math.max(s.vitals.hydration, 85), nutrition: 90, rest: 90, warmth: 90 };
    for (const e of step(s, w, []) as SimEvent[]) if (e.type === 'thought') out.push({ text: e.text, hint: e.hint, tick: s.tick });
  }
  return out;
}

describe('thoughts (SPEC 12.2)', () => {
  it('with nothing pressing, the first idea is the wreck, and it says how', () => {
    const { state, world } = setup();
    const t = live(state, world, 25);
    expect(t[0]?.text).toBe(FIRST_THOUGHTS.wreck.text);
    expect(t[0]?.hint).toMatch(/wreck/);
    expect(t[0]!.tick).toBeGreaterThanOrEqual(200);
    expect(state.log.some((l) => l.text === `“${FIRST_THOUGHTS.wreck.text}”`)).toBe(true);
  });

  it('what is noticed first comes from how the crash left the kid', () => {
    const first = (edit: (s: GameState) => void) => {
      const { state, world } = setup();
      edit(state);
      return live(state, world, 25, false)[0]?.text;
    };
    expect(first((s) => (s.vitals.hydration = 52))).toBe(NOTICING.thirsty[0]!.text);
    expect(first((s) => (s.vitals.nutrition = 50))).toBe(NOTICING.hungry[0]!.text);
    expect(first((s) => ((s.player.wet = 60), (s.vitals.warmth = 60)))).toBe(NOTICING.wetCold[0]!.text);
  });

  it('and how the crash left the kid is dealt per run, so the start differs', () => {
    const starts = new Set<string>();
    for (let k = 0; k < 24; k++) {
      const { state } = setup(`start-${k}`, false);
      starts.add(`${state.vitals.hydration}/${state.vitals.nutrition}/${state.player.wet}`);
    }
    expect(starts.size).toBe(4);
  });

  it('the wind through the jacket, when the wind is up and the kid is out in it', () => {
    const { state, world } = setup();
    state.weather.f = state.weather.f.map(() => ALL.indexOf('wind'));
    state.vitals.warmth = 65;
    const t = live(state, world, 25, false);
    expect(t[0]?.text).toBe(NOTICING.wind[0]!.text);
    expect(t[0]?.text).toMatch(/right through my jacket/);
  });

  it('the cold comes in the afternoon, and the fire after it; carrying tinder brings striking rock', () => {
    const { state, world } = setup();
    give(state, 'tinder', 2, 0);
    give(state, 'stick', 2);
    const before = live(state, world, 14 * 60 - START_MINUTE - 5).map((t) => t.text);
    expect(before).not.toContain(FIRST_THOUGHTS.cold.text);
    const after = live(state, world, 2 * 60).map((t) => t.text);
    expect(after[0]).toBe(FIRST_THOUGHTS.cold.text);
    expect(after).toContain(FIRST_THOUGHTS.fire.text);
    expect(after).not.toContain(FIRST_THOUGHTS.gather.text);
  });

  it('feeling the cold early brings the fire sooner', () => {
    const { state, world } = setup();
    state.player.wet = 60;
    state.vitals.warmth = 60;
    const t = live(state, world, 90, false).map((x) => x.text);
    expect(t.slice(0, 2)).toEqual([NOTICING.wetCold[0]!.text, FIRST_THOUGHTS.cold.text]);
  });

  it('evening brings shelter, and dark brings caution, even with the first ideas not yet acted on', () => {
    const { state, world } = setup();
    const texts = live(state, world, 20 * 60 + 30 - START_MINUTE).map((t) => t.text); // until 20:30
    expect(texts).toContain(FIRST_THOUGHTS.shelter.text);
    expect(texts).toContain(FIRST_THOUGHTS.dark.text);
  });

  it('never two within half an hour, and each first-evening thought only once', () => {
    const { state, world } = setup();
    const t = live(state, world, 30 * 60);
    for (let k = 1; k < t.length; k++) expect(t[k]!.tick - t[k - 1]!.tick).toBeGreaterThanOrEqual(30 * MIN);
    const firsts = t.filter((x) => Object.values(FIRST_THOUGHTS).some((f) => f.text === x.text)).map((x) => x.text);
    expect(new Set(firsts).size).toBe(firsts.length);
  });

  it('thirst comes back as a thought, in another wording, but not every minute', () => {
    const { state, world } = setup();
    state.vitals.hydration = 100;
    live(state, world, 30);
    state.vitals.hydration = 10;
    const t = live(state, world, 4 * 60, false).filter((x) => NOTICING.thirsty.some((n) => n.text === x.text));
    expect(t.map((x) => x.text)).toEqual([NOTICING.thirsty[0]!.text]);
    state.tick += 8 * HOUR;
    state.vitals.hydration = 10;
    const again = live(state, world, 60, false).filter((x) => NOTICING.thirsty.some((n) => n.text === x.text));
    expect(again.map((x) => x.text)).toEqual([NOTICING.thirsty[1]!.text]);
  });

  it("a failure's clue comes at once, then a surer one, then nothing more", () => {
    const { state } = setup();
    const ev: SimEvent[] = [];
    expect(clue(state, 'dudTinder', ev, { tinder: 'grey fluff', other: '. Maybe the pale curls' })).toBe(1);
    expect(clue(state, 'dudTinder', ev, { tinder: 'grey fluff', other: '. Maybe the pale curls' })).toBe(2);
    expect(clue(state, 'dudTinder', ev, { tinder: 'grey fluff', other: '' })).toBe(2);
    const said = ev.filter((e) => e.type === 'thought');
    expect(said).toHaveLength(2);
    expect(said[1]).toMatchObject({ text: 'The grey fluff is no good. I need a different kind of tinder. Maybe the pale curls.' });
    expect(CLUES.dudTinder).toHaveLength(2);
  });

  it("on a bear's trail with its prints in sight, the warning comes at once, and not again for a while", () => {
    const { state, world } = setup();
    world.trails[idx(128, 128)] = TRAIL_BY.bear;
    world.loose[idx(130, 129)] = L.tracksBear;
    state.vitals.hydration = 100;
    const t = live(state, world, 150).filter((x) => x.text === BEAR_TRAIL_THOUGHT.text);
    expect(t.length).toBe(1);
    expect(t[0]!.tick, 'as soon as the first quiet minutes are over').toBeLessThanOrEqual(220);
    expect(t[0]!.hint).toMatch(/prints/);
  });

  it('nothing is thought asleep', () => {
    const { state, world } = setup();
    step(state, world, [{ t: 0, c: 'sleep', minutes: 120, awake: false }]);
    expect(live(state, world, 100)).toEqual([]);
  });

  it('says what each step toward the first fire means, soon after it, and only the latest', () => {
    const { state, world } = setup();
    state.vitals.hydration = 100;
    live(state, world, 30);
    // Sparks off a rock: take a piece of it.
    state.known.facts.push({ key: 'stone:1', level: 'known', value: 'sparks', how: 'test', tick: state.tick });
    expect(live(state, world, 15).map((t) => t.text)).toContain(FIRE_THOUGHTS.sparked.text);
    // Lit before the kid said anything about laying it: only the fire itself is news.
    state.memory['fires-lit'] = 1;
    const later = live(state, world, 15).map((t) => t.text);
    expect(later).toContain(FIRE_THOUGHTS.lit.text);
    expect(later).not.toContain(FIRE_THOUGHTS.laid.text);
    expect(live(state, world, 60).map((t) => t.text)).not.toContain(FIRE_THOUGHTS.laid.text);
  });
});
