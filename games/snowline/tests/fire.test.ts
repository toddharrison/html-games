// M3: fire and craft, on hand-built worlds and deals.

import { describe, expect, it } from 'vitest';
import { F, T, WATER } from '../src/content/terrain.ts';
import { availableActions } from '../src/sim/actions.ts';
import { sleepQuality } from '../src/sim/body.ts';
import { craftOptions } from '../src/sim/craft.ts';
import { strikeSnag } from '../src/sim/fire.ts';
import { count, give } from '../src/sim/inventory.ts';
import { fact, knowsTechnique } from '../src/sim/knowledge.ts';
import { newGame } from '../src/sim/newGame.ts';
import { candidate, type Protagonist } from '../src/sim/protagonist.ts';
import { dealRules, type Rules } from '../src/sim/rules.ts';
import type { GameState, SimEvent } from '../src/sim/state.ts';
import { step } from '../src/sim/step.ts';
import { idx, type World } from '../src/sim/world.ts';
import { runTo } from '../src/tools/runner.ts';
import { calm, flatWorld } from './sample.ts';

const MIN = 10;
const FRONT = idx(128, 129);
const HERE = idx(128, 128);

function setup(opts: { edit?: (w: World) => void; rules?: (r: Rules) => void; who?: Partial<Protagonist> } = {}) {
  const world = flatWorld();
  opts.edit?.(world);
  const rules = dealRules('flat');
  opts.rules?.(rules);
  const state = newGame('flat', { ...candidate('flat', 0), background: 'city', trait: 'restless', tool: 'hatchet', pockets: [], ...opts.who }, world, rules);
  state.vitals = { health: 100, hydration: 100, nutrition: 100, rest: 100, warmth: 100, morale: 60 };
  calm(state);
  return { state, world };
}

function act(s: GameState, w: World, action: string, tile: number): SimEvent[] {
  const ev = step(s, w, [{ t: s.tick, c: 'act', action, tile }]);
  if (!s.task) throw new Error(`${action} did not start: ${availableActions(s, w).map((a) => a.action).join(', ')}`);
  for (let k = 0; s.task && k < 100000; k++) ev.push(...step(s, w, []));
  return ev;
}

function use(s: GameState, w: World, action: string, k: string): void {
  const slot = s.inventory.findIndex((i) => i.k === k);
  step(s, w, [{ t: s.tick, c: 'use', action, slot }]);
  for (let n = 0; s.task && n < 100000; n++) step(s, w, []);
}

function craft(s: GameState, w: World, recipe: string): void {
  step(s, w, [{ t: s.tick, c: 'craft', recipe }]);
  if (!s.task) throw new Error(`craft ${recipe} did not start: ${JSON.stringify(craftOptions(s, w).find((o) => o.recipe === recipe))}`);
  for (let n = 0; s.task && n < 100000; n++) step(s, w, []);
}

const minutes = (s: GameState, w: World, n: number) => runTo(s, w, [], s.tick + n * MIN);

describe('stone (SPEC 6.6, 8.3)', () => {
  for (const o of ['sparks', 'edge', 'crumbles', 'inert'] as const) {
    it(`striking a ${o} stone tells what it is`, () => {
      const { state, world } = setup({
        edit: (w) => {
          w.feature[FRONT] = F.outcrop;
          w.data[FRONT] = 2;
        },
        rules: (r) => (r.stones[2] = o),
      });
      act(state, world, 'strike-outcrop', FRONT);
      expect(fact(state, 'stone', 2)).toMatchObject({ level: 'known', value: o });
      expect(knowsTechnique(state, 'sparks')).toBe(o === 'sparks');
    });
  }

  it('a piece of the outcrop can be carried, and struck again', () => {
    const { state, world } = setup({ edit: (w) => ((w.feature[FRONT] = F.outcrop), (w.data[FRONT] = 1)), rules: (r) => (r.stones[1] = 'sparks') });
    act(state, world, 'take-stone', FRONT);
    expect(count(state, 'stone', 1)).toBe(1);
    use(state, world, 'strike', 'stone');
    expect(fact(state, 'stone', 1)?.value).toBe('sparks');
  });
});

/** Ready to light by sparks: the known spark-stone, tinder of a given outcome, and sticks. */
function sparksReady(tinder: 'catches' | 'slow' | 'fails') {
  const { state, world } = setup({ rules: (r) => ((r.stones[0] = 'sparks'), (r.tinders[0] = tinder)) });
  give(state, 'stone', 1, 0);
  state.known.facts.push({ key: 'stone:0', level: 'known', value: 'sparks', how: 'test', tick: 0 });
  give(state, 'tinder', 8, 0);
  give(state, 'stick', 8);
  return { state, world };
}

describe('fire by sparks', () => {
  it('lights in a few tries with tinder that catches, and the tinder becomes known', () => {
    const { state, world } = sparksReady('catches');
    for (let k = 0; k < 8 && state.fires.length === 0; k++) act(state, world, 'fire-sparks', FRONT);
    expect(state.fires).toHaveLength(1);
    expect(fact(state, 'tinder', 0)).toMatchObject({ level: 'known', value: 'catches' });
    expect(state.memory['fires-lit']).toBe(1);
  });

  it('never lights with tinder that fails, and learns that it fails', () => {
    const { state, world } = sparksReady('fails');
    for (let k = 0; k < 6 && count(state, 'tinder') > 0; k++) act(state, world, 'fire-sparks', FRONT);
    expect(state.fires).toHaveLength(0);
    expect(fact(state, 'tinder', 0)).toMatchObject({ level: 'known', value: 'fails' });
  });

  it('is not offered without a known spark-stone', () => {
    const { state, world } = sparksReady('catches');
    state.known.facts = [];
    expect(availableActions(state, world).some((a) => a.action === 'fire-sparks')).toBe(false);
  });
});

describe('fire by bow drill and by captured embers', () => {
  it('the bow drill works only in the dealt drill wood', () => {
    for (const right of [true, false]) {
      const { state, world } = setup({ rules: (r) => ((r.woods[3] = right ? 'drill' : 'smoky'), (r.tinders[0] = 'catches')) });
      give(state, 'bow-drill', 1, 3);
      give(state, 'tinder', 6, 0);
      give(state, 'stick', 8);
      for (let k = 0; k < 6 && state.fires.length === 0; k++) act(state, world, 'fire-drill', FRONT);
      expect(state.fires.length > 0).toBe(right);
      expect(fact(state, 'wood', 3)?.value).toBe(right ? 'drill' : 'not for the drill');
    }
  });

  it('embers from the lightning-struck snag light a fire, and die if carried too long', () => {
    const { state, world } = setup({
      edit: (w) => {
        w.feature[FRONT] = F.snag;
        w.landmarks = [{ kind: 'snag', x: 128, y: 129 }];
      },
      rules: (r) => (r.tinders[0] = 'catches'),
    });
    give(state, 'bark', 2);
    strikeSnag(state, world, []);
    act(state, world, 'snag-embers', FRONT);
    expect(count(state, 'ember-pouch')).toBe(1);
    expect(knowsTechnique(state, 'carry-embers')).toBe(true);
    minutes(state, world, 300);
    expect(count(state, 'ember-pouch')).toBe(0);
  });
});

describe('a fire burning', () => {
  function lit() {
    const { state, world } = setup({ rules: (r) => (r.woods[1] = 'long-burning') });
    state.fires.push({ x: 128, y: 129, fuel: 30, coals: 0, banked: false, smoke: 0, signal: false });
    return { state, world };
  }

  it('burns down to coals, then goes out', () => {
    const { state, world } = lit();
    minutes(state, world, 31);
    expect(state.fires[0]).toMatchObject({ fuel: 0 });
    expect(state.fires[0]!.coals).toBeGreaterThan(0);
    minutes(state, world, 60);
    expect(state.fires).toHaveLength(0);
  });

  it('firewood keeps it going, and teaches what the wood does', () => {
    const { state, world } = lit();
    give(state, 'firewood', 1, 1);
    act(state, world, 'feed-firewood', FRONT);
    expect(state.fires[0]!.fuel).toBeGreaterThan(120);
    minutes(state, world, 45);
    expect(fact(state, 'wood', 1)).toMatchObject({ level: 'known', value: 'long-burning' });
  });

  it('banked coals last the night and come back with a stick', () => {
    const { state, world } = lit();
    state.known.techniques.push('bank-fire');
    act(state, world, 'bank', FRONT);
    minutes(state, world, 8 * 60);
    expect(state.fires).toHaveLength(1);
    give(state, 'stick', 1);
    act(state, world, 'feed-stick', FRONT);
    expect(state.fires[0]!.fuel).toBeGreaterThan(0);
    expect(state.fires[0]!.banked).toBe(false);
  });

  it('cooks food and boils water', () => {
    const { state, world } = lit();
    state.fires[0]!.fuel = 500;
    give(state, 'crayfish', 2, undefined, state.tick);
    use(state, world, 'cook', 'crayfish');
    expect(count(state, 'cooked-crayfish')).toBe(2);
    give(state, 'pot-water', 1, WATER.lake);
    use(state, world, 'boil', 'pot-water');
    expect(count(state, 'pot-boiled')).toBe(1);
    state.vitals.hydration = 40;
    use(state, world, 'drink-vessel', 'pot-boiled');
    expect(state.vitals.hydration).toBeCloseTo(70, 0);
    expect(count(state, 'pot')).toBe(1);
    expect(state.pending.some((p) => p.kind === 'water-ill')).toBe(false);
  });

  it('warms the survivor beside it', () => {
    const { state, world } = lit();
    state.fires[0]!.fuel = 500;
    state.vitals.warmth = 30;
    minutes(state, world, 30);
    expect(state.vitals.warmth).toBeGreaterThan(30);
  });
});

describe('the tool chain (SPEC 8.2)', () => {
  it('fibre, cord, a sharp stick, a spear, and a fire-hardened spear', () => {
    const { state, world } = setup({ edit: (w) => (w.terrain[FRONT] = T.reeds) });
    state.skills.crafting = 200;
    state.known.techniques.push('cord', 'spear', 'fire-harden');
    act(state, world, 'fibre', FRONT);
    expect(count(state, 'fibre')).toBe(3);
    craft(state, world, 'cord');
    expect(count(state, 'cord')).toBe(1);
    give(state, 'stick', 1);
    craft(state, world, 'sharp-stick');
    craft(state, world, 'spear');
    expect(count(state, 'spear')).toBe(1);
    expect(craftOptions(state, world).find((o) => o.recipe === 'hard-spear')?.missing).toContain('fire');
    state.fires.push({ x: 128, y: 129, fuel: 500, coals: 0, banked: false, smoke: 0, signal: false });
    craft(state, world, 'hard-spear');
    expect(count(state, 'hard-spear')).toBe(1);
  });

  it('recipes are locked until their technique is known', () => {
    const { state, world } = setup();
    expect(craftOptions(state, world).some((o) => o.recipe === 'cord')).toBe(false);
    expect(craftOptions(state, world).some((o) => o.recipe === 'sharp-stick')).toBe(true);
  });

  it('the hatchet cuts wood fastest, the knife slowest', () => {
    const time = (tool: string) => {
      const { state, world } = setup({ edit: (w) => (w.feature[FRONT] = F.conifer), who: { tool } });
      return availableActions(state, world).find((a) => a.action === 'cut-wood')!.minutes;
    };
    expect(time('hatchet')).toBeLessThan(time('multitool'));
    expect(time('multitool')).toBeLessThan(time('knife'));
  });

  it('each tree gives its own dealt wood', () => {
    const { state, world } = setup({ edit: (w) => (w.feature[FRONT] = F.aspen) });
    act(state, world, 'cut-wood', FRONT);
    expect(count(state, 'firewood', 4)).toBeGreaterThan(0);
    expect(state.known.seen).toContain('wood:4');
  });
});

describe('camp (SPEC 7.6)', () => {
  it('a bough bed and a wall make for better sleep', () => {
    const { state, world } = setup({ edit: (w) => (w.terrain[HERE] = T.shelter) });
    const before = sleepQuality(state, world);
    give(state, 'boughs', 4);
    craft(state, world, 'build:bed');
    state.known.techniques.push('walls');
    give(state, 'stick', 6);
    give(state, 'cord', 1);
    craft(state, world, 'build:wall');
    expect(state.builds.map((b) => b.kind).sort()).toEqual(['bed', 'wall']);
    expect(sleepQuality(state, world)).toBeGreaterThan(before);
  });

  it('a lean-to is shelter away from the overhang', () => {
    const { state, world } = setup();
    give(state, 'stick', 8);
    give(state, 'boughs', 4);
    craft(state, world, 'build:lean-to');
    expect(state.builds[0]?.kind).toBe('lean-to');
  });

  it('food hung in the cache comes back down', () => {
    const { state, world } = setup({ edit: (w) => (w.feature[FRONT] = F.conifer) });
    state.known.techniques.push('cache');
    give(state, 'cord', 2);
    craft(state, world, 'build:cache');
    give(state, 'pine-nuts', 4);
    act(state, world, 'cache-store', FRONT);
    expect(count(state, 'pine-nuts')).toBe(0);
    act(state, world, 'cache-take', FRONT);
    expect(count(state, 'pine-nuts')).toBe(4);
  });
});

describe('reflection (SPEC 8.1)', () => {
  it('sleeping on what was seen brings an insight', () => {
    const { state, world } = setup();
    give(state, 'fibre', 3);
    for (let night = 0; night < 8 && !knowsTechnique(state, 'cord'); night++) {
      state.vitals.rest = 40;
      step(state, world, [{ t: state.tick, c: 'sleep', minutes: 300, awake: false }]);
      minutes(state, world, 301);
      state.vitals.hydration = state.vitals.nutrition = 100;
    }
    expect(knowsTechnique(state, 'cord')).toBe(true);
  });
});
