// The survivor's thoughts (SPEC 12.2): the tutorial as what the kid thinks next.

import { describe, expect, it } from 'vitest';
import { BEAR_TRAIL_THOUGHT, FIRE_THOUGHTS, FIRST_THOUGHTS, RETURNING_THOUGHTS } from '../src/content/thoughtText.ts';
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
import { START_MINUTE } from '../src/content/balance.ts';

const MIN = 10;
const FRONT = idx(128, 129);

function setup() {
  const world = flatWorld();
  world.terrain[FRONT] = T.shallows;
  world.water[FRONT] = WATER.lake;
  const state = newGame('flat', { ...candidate('flat', 0), background: 'city', trait: 'restless', tool: 'knife', pockets: [] }, world, dealRules('flat'));
  calm(state);
  return { state, world };
}

/** Run for some game minutes, keeping the survivor fed and rested so only the tutorial speaks; returns the thoughts. */
function live(s: GameState, w: World, minutes: number, keepWell = true): { text: string; hint: string; tick: number }[] {
  const out: { text: string; hint: string; tick: number }[] = [];
  for (let k = 0; k < minutes * MIN && !s.over; k++) {
    if (keepWell) s.vitals = { ...s.vitals, hydration: Math.max(s.vitals.hydration, 60), nutrition: 90, rest: 90, warmth: 90 };
    for (const e of step(s, w, []) as SimEvent[]) if (e.type === 'thought') out.push({ text: e.text, hint: e.hint, tick: s.tick });
  }
  return out;
}

describe('thoughts (SPEC 12.2)', () => {
  it('the first is the cold coming: the snow on the peaks means a fire before dark, and it says how', () => {
    const { state, world } = setup();
    const t = live(state, world, 25);
    expect(t[0]?.text).toBe(FIRST_THOUGHTS.cold.text);
    expect(t[0]?.hint).toMatch(/Make/);
    expect(t[0]!.tick).toBeGreaterThanOrEqual(200);
    expect(state.log.some((l) => l.text === `“${FIRST_THOUGHTS.cold.text}”`)).toBe(true);
  });

  it('then water, and waits for the player before the next idea, then moves on after a drink', () => {
    const { state, world } = setup();
    expect(live(state, world, 90).map((t) => t.text)).toEqual([FIRST_THOUGHTS.cold.text, FIRST_THOUGHTS.water.text]);
    step(state, world, [{ t: state.tick, c: 'act', action: 'drink', tile: FRONT }]);
    const next = live(state, world, 60);
    expect(next[0]?.text).toBe(FIRST_THOUGHTS.gather.text);
  });

  it('carrying tinder brings the idea of striking rock for a fire', () => {
    const { state, world } = setup();
    state.vitals.hydration = 100;
    give(state, 'tinder', 2, 0);
    give(state, 'stick', 2);
    const texts = live(state, world, 120).map((t) => t.text);
    expect(texts).toContain(FIRST_THOUGHTS.fire.text);
    expect(texts).not.toContain(FIRST_THOUGHTS.gather.text);
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
    for (let k = 1; k < t.length; k++) expect(t[k]!.tick - t[k - 1]!.tick).toBeGreaterThanOrEqual(300);
    const firsts = t.filter((x) => Object.values(FIRST_THOUGHTS).some((f) => f.text === x.text)).map((x) => x.text);
    expect(new Set(firsts).size).toBe(firsts.length);
  });

  it('thirst comes back as a thought, but not every minute', () => {
    const { state, world } = setup();
    state.vitals.hydration = 100;
    live(state, world, 30);
    state.vitals.hydration = 10;
    const t = live(state, world, 4 * 60, false).filter((x) => x.text === RETURNING_THOUGHTS.thirsty.text);
    expect(t.length).toBe(1);
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
