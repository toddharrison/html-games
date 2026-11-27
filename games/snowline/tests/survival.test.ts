// M2: the survival core on hand-built worlds and hand-built deals (SPEC 11.4: a test that depends on a
// dealt rule builds its own deal).

import { describe, expect, it } from 'vitest';
import { F, T, WATER } from '../src/content/terrain.ts';
import { availableActions, itemActions } from '../src/sim/actions.ts';
import { count, give, take } from '../src/sim/inventory.ts';
import { fact } from '../src/sim/knowledge.ts';
import { SCHEMA, newGame } from '../src/sim/newGame.ts';
import { candidate, type Protagonist } from '../src/sim/protagonist.ts';
import { dealRules, type Rules } from '../src/sim/rules.ts';
import { decodeRun, encodeRun } from '../src/sim/runCode.ts';
import type { Command, GameState, SimEvent } from '../src/sim/state.ts';
import { step } from '../src/sim/step.ts';
import { idx, type World } from '../src/sim/world.ts';
import { migrate, restore, toRecord } from '../src/platform/saves.ts';
import { runTo, stateHash } from '../src/tools/runner.ts';
import { calm, flatWorld } from './sample.ts';
import { START_MINUTE } from '../src/content/balance.ts';

const MIN = 10;
const DAY = 14400;

function who(over: Partial<Protagonist> = {}): Protagonist {
  return { ...candidate('flat', 0), background: 'city', trait: 'restless', tool: 'knife', pockets: [], ...over };
}

function setup(edit?: (w: World) => void, rulesEdit?: (r: Rules) => void, p: Partial<Protagonist> = {}) {
  const world = flatWorld();
  edit?.(world);
  const rules = dealRules('flat');
  rulesEdit?.(rules);
  const state = newGame('flat', who(p), world, rules);
  calm(state);
  return { state, world };
}

function run(state: GameState, world: World, ticks: number, commands: Command[] = []): SimEvent[] {
  const out: SimEvent[] = [];
  runTo(state, world, commands, state.tick + ticks, (e) => out.push(...e));
  return out;
}

/** Do an action on a tile and wait for it to finish. */
function act(state: GameState, world: World, action: string, tile: number): SimEvent[] {
  const ev: SimEvent[] = [];
  ev.push(...step(state, world, [{ t: state.tick, c: 'act', action, tile }]));
  expect(state.task, `${action} started`).not.toBeNull();
  for (let k = 0; state.task && !state.over && k < 100000; k++) ev.push(...step(state, world, []));
  return ev;
}

function use(state: GameState, world: World, action: string, slot: number): SimEvent[] {
  const ev: SimEvent[] = [];
  ev.push(...step(state, world, [{ t: state.tick, c: 'use', action, slot }]));
  for (let k = 0; state.task && !state.over && k < 100000; k++) ev.push(...step(state, world, []));
  return ev;
}

const FRONT = idx(128, 129); // the survivor starts at (128,128) facing south

describe('the body', () => {
  it('starts the run carrying the tool and pockets', () => {
    const { state } = setup(undefined, undefined, { tool: 'hatchet', pockets: ['candy-bar', 'watch'] });
    expect(count(state, 'hatchet')).toBe(1);
    expect(count(state, 'candy-bar')).toBe(1);
    expect(count(state, 'watch')).toBe(1);
  });

  it('with no water, thirst kills in about three days', () => {
    const { state, world } = setup();
    state.vitals.nutrition = 100;
    run(state, world, 2 * DAY);
    expect(state.vitals.hydration).toBe(0);
    expect(state.over).toBeNull();
    run(state, world, 2 * DAY);
    expect(state.over?.cause).toBe('thirst');
    expect(state.over!.tick).toBeLessThan(3.6 * DAY);
  });

  it('nutrition lasts about five days, and rest drains in a day awake', () => {
    const { state, world } = setup();
    state.vitals.nutrition = 100;
    state.vitals.rest = 100;
    run(state, world, DAY / 2);
    expect(state.vitals.nutrition).toBeGreaterThan(88);
    expect(state.vitals.rest).toBeLessThan(65);
  });

  it('collapses into sleep when rest runs out, and sleep restores it', () => {
    const { state, world } = setup();
    state.vitals.rest = 0.5;
    run(state, world, 20 * MIN);
    expect(state.sleep).not.toBeNull();
    run(state, world, 240 * MIN);
    expect(state.sleep).toBeNull();
    expect(state.vitals.rest).toBeGreaterThan(30);
  });

  it('sleeps until asked, then wakes', () => {
    const { state, world } = setup();
    step(state, world, [{ t: 0, c: 'sleep', minutes: 60, awake: false }]);
    expect(state.sleep).not.toBeNull();
    run(state, world, 61 * MIN);
    expect(state.sleep).toBeNull();
  });

  it('is colder at night and higher up, and a fire warms', () => {
    const { state, world } = setup((w) => w.band.fill(0));
    run(state, world, 10 * 60 * MIN); // to half past midnight
    state.vitals.warmth = 50;
    run(state, world, 4 * 60 * MIN); // the small hours
    const cold = state.vitals.warmth;
    expect(cold).toBeLessThan(50);
    step(state, world, [{ t: state.tick, c: 'debug-fire' }]);
    run(state, world, 60 * MIN);
    expect(state.vitals.warmth).toBeGreaterThan(cold);
  });
});

describe('water', () => {
  const lake = (w: World) => {
    w.terrain[FRONT] = T.shallows;
    w.water[FRONT] = WATER.lake;
  };

  it('drinking raises hydration and notes the source', () => {
    const { state, world } = setup(lake);
    state.vitals.hydration = 40;
    act(state, world, 'drink', FRONT);
    expect(state.vitals.hydration).toBeGreaterThan(55);
    expect(state.known.seen).toContain('water:0');
  });

  it('the foul source makes the survivor ill days later, and they suspect it', () => {
    const { state, world } = setup(lake, (r) => {
      r.water = ['foul', 'usual', 'usual'];
    });
    for (let k = 0; k < 40 && !state.pending.some((p) => p.kind === 'water-ill'); k++) {
      state.vitals.hydration = 10;
      act(state, world, 'drink', FRONT);
    }
    const ill = state.pending.find((p) => p.kind === 'water-ill');
    expect(ill, 'foul water made them ill within 40 drinks').toBeDefined();
    expect(ill!.t - state.tick).toBeGreaterThanOrEqual(2 * DAY - 400 * MIN);
    state.vitals.hydration = 100;
    state.vitals.nutrition = 100;
    run(state, world, ill!.t - state.tick + MIN);
    expect(state.conditions.some((c) => c.id === 'waterborne')).toBe(true);
    expect(fact(state, 'water', 0)).toMatchObject({ level: 'suspected', value: 'foul' });
  });

  it('a beaver dam on the map tells which source is foul', () => {
    const { state, world } = setup((w) => {
      w.feature[FRONT] = F.beaverDam;
      w.waterCauseSites = [{ x: 0, y: 0 }, { x: 128, y: 129 }, { x: 1, y: 1 }];
    });
    act(state, world, 'examine-cause', FRONT);
    expect(fact(state, 'water', 1)).toMatchObject({ level: 'known', value: 'foul' });
  });
});

describe('dealt plants (SPEC 6.6)', () => {
  const patch = (d: number) => (w: World) => {
    w.feature[FRONT] = F.plant;
    w.data[FRONT] = d;
  };
  const deal = (outcome: 'nourishing' | 'poor' | 'sickening' | 'deadly') => (r: Rules) => {
    r.plants[0] = outcome;
  };

  const pickOption = (state: GameState, world: World) => availableActions(state, world).find((o) => o.action === 'pick' && o.tile === FRONT);

  it('picking gives handfuls, then the patch is bare for days, and the menu says so', () => {
    const { state, world } = setup(patch(0), deal('nourishing'));
    expect(pickOption(state, world)?.spent).toBeUndefined();
    act(state, world, 'pick', FRONT);
    const got = count(state, 'plant', 0);
    expect(got).toBeGreaterThanOrEqual(2);
    expect(state.known.seen).toContain('plant:0');
    expect(pickOption(state, world)?.spent).toBe('picked over for now');
    step(state, world, [{ t: state.tick, c: 'act', action: 'pick', tile: FRONT }]);
    expect(state.task, 'a picked-over patch takes no time').toBeNull();
    expect(count(state, 'plant', 0)).toBe(got);
    state.tick += 10 * DAY;
    expect(pickOption(state, world)?.spent).toBeUndefined();
  });

  it('berries go out of season after the first month', () => {
    const { state, world } = setup(patch(0), deal('nourishing'));
    state.tick = 31 * DAY;
    expect(pickOption(state, world)?.spent).toBe('out of season');
    step(state, world, [{ t: state.tick, c: 'act', action: 'pick', tile: FRONT }]);
    expect(state.task).toBeNull();
    expect(count(state, 'plant', 0)).toBe(0);
  });

  it('what does not fit is set down at the survivor\'s feet', () => {
    const { state, world } = setup(patch(0), deal('nourishing'));
    while (state.inventory.length < 8) give(state, 'stone', 1, state.inventory.length);
    give(state, 'stone', 99, 0);
    const before = state.inventory.map((i) => ({ ...i }));
    const ev = act(state, world, 'pick', FRONT);
    expect(state.inventory).toEqual(before);
    const st = state.stashes.find((t) => t.x === state.player.x && t.y === state.player.y);
    expect(st?.items).toEqual([expect.objectContaining({ k: 'plant', d: 0 })]);
    expect(st!.items[0]!.n).toBeGreaterThanOrEqual(2);
    expect(ev.some((e) => e.type === 'say' && /set them down at/.test(e.text))).toBe(true);
  });

  for (const o of ['nourishing', 'poor', 'sickening', 'deadly'] as const) {
    it(`a taste of a ${o} plant is survivable and tells something`, () => {
      const { state, world } = setup(undefined, deal(o));
      give(state, 'plant', 1, 0, 0);
      use(state, world, 'taste', state.inventory.findIndex((i) => i.k === 'plant'));
      run(state, world, 4 * 60 * MIN);
      expect(state.over).toBeNull();
      const f = fact(state, 'plant', 0)!;
      if (o === 'nourishing' || o === 'poor') expect(f).toMatchObject({ level: 'suspected', value: 'safe' });
      else expect(f).toMatchObject({ level: 'known', value: o });
    });
  }

  it('a full portion of the deadly plant kills', () => {
    const { state, world } = setup(undefined, deal('deadly'));
    state.vitals.hydration = 100;
    give(state, 'plant', 1, 0, 0);
    use(state, world, 'eat', state.inventory.findIndex((i) => i.k === 'plant'));
    run(state, world, 2 * DAY);
    expect(state.over?.cause).toBe('deadly-poisoning');
  });

  it('eating a nourishing plant feeds and makes it known', () => {
    const { state, world } = setup(undefined, deal('nourishing'));
    state.vitals.nutrition = 30;
    give(state, 'plant', 2, 0, 0);
    use(state, world, 'eat', state.inventory.findIndex((i) => i.k === 'plant'));
    expect(state.vitals.nutrition).toBeGreaterThan(36);
    run(state, world, 40 * MIN);
    expect(fact(state, 'plant', 0)).toMatchObject({ level: 'known', value: 'nourishing' });
  });

  it('watching a patch in daylight: jays eat the safe ones', () => {
    const safe = setup(patch(0), deal('poor'));
    act(safe.state, safe.world, 'watch', FRONT);
    expect(fact(safe.state, 'plant', 0)).toMatchObject({ level: 'suspected', value: 'safe' });
    const bad = setup(patch(0), deal('sickening'));
    act(bad.state, bad.world, 'watch', FRONT);
    expect(fact(bad.state, 'plant', 0)).toMatchObject({ level: 'suspected', value: 'unsafe' });
  });

  it('a known fact is never downgraded by a later suspicion', () => {
    const { state, world } = setup(patch(0), deal('nourishing'));
    give(state, 'plant', 1, 0, 0);
    use(state, world, 'eat', state.inventory.findIndex((i) => i.k === 'plant'));
    run(state, world, 40 * MIN);
    act(state, world, 'watch', FRONT);
    expect(fact(state, 'plant', 0)!.level).toBe('known');
  });
});

describe('floor foods (SPEC 6.6: always the same)', () => {
  it('cattail roots from reeds, shellfish from the shallows', () => {
    const { state, world } = setup((w) => {
      w.terrain[FRONT] = T.reeds;
      w.terrain[idx(128, 128)] = T.shallows;
    });
    act(state, world, 'dig-cattail', FRONT);
    expect(count(state, 'cattail-root')).toBeGreaterThan(0);
    act(state, world, 'feel-shallows', idx(128, 128));
    expect(count(state, 'crayfish') + count(state, 'mussels')).toBeGreaterThan(0);
    expect(state.player.wet).toBeGreaterThan(80);
  });

  it('nothing to forage in the dark', () => {
    const { state, world } = setup((w) => (w.terrain[FRONT] = T.reeds));
    state.tick = (24 * 60 - START_MINUTE) * MIN; // midnight
    step(state, world, [{ t: state.tick, c: 'act', action: 'dig-cattail', tile: FRONT }]);
    expect(state.task).toBeNull();
  });

  it('food spoils', () => {
    const { state, world } = setup();
    give(state, 'crayfish', 2, undefined, 0);
    run(state, world, 2 * DAY);
    expect(count(state, 'crayfish')).toBe(0);
  });
});

describe('inventory', () => {
  it('stacks, and stops at the slot and weight limits', () => {
    const { state } = setup();
    state.inventory = [];
    expect(give(state, 'pine-nuts', 20)).toBe(20);
    expect(state.inventory.length).toBe(3);
    expect(give(state, 'firewood', 100)).toBeLessThan(100);
    expect(take(state, 'pine-nuts', 5)).toBe(true);
    expect(count(state, 'pine-nuts')).toBe(15);
  });

  it('drops to the ground and picks back up', () => {
    const { state, world } = setup();
    give(state, 'stick', 3);
    const slot = state.inventory.findIndex((i) => i.k === 'stick');
    use(state, world, 'drop', slot);
    expect(count(state, 'stick')).toBe(0);
    expect(state.stashes).toHaveLength(1);
    expect(availableActions(state, world).some((a) => a.action === 'pick-up')).toBe(true);
    act(state, world, 'pick-up', idx(128, 128));
    expect(count(state, 'stick')).toBe(3);
    expect(state.stashes).toHaveLength(0);
  });

  it('offers eating and tasting for the right things', () => {
    const { state, world } = setup();
    give(state, 'plant', 1, 2, 0);
    give(state, 'stick', 1);
    const plant = itemActions(state, world, state.inventory.findIndex((i) => i.k === 'plant')).map((a) => a.action);
    const stick = itemActions(state, world, state.inventory.findIndex((i) => i.k === 'stick')).map((a) => a.action);
    expect(plant).toEqual(expect.arrayContaining(['eat', 'taste', 'drop']));
    expect(stick).not.toContain('eat');
  });
});

describe('starting facts (SPEC 6.6)', () => {
  it('every background but City kid starts with one valley fact', () => {
    for (const bg of ['scout', 'angler', 'hunter', 'farm', 'runner', 'reader']) {
      const { state } = setup(undefined, undefined, { background: bg });
      expect(state.known.facts.filter((f) => f.level === 'known'), bg).toHaveLength(1);
    }
    expect(setup(undefined, undefined, { background: 'city' }).state.known.facts).toHaveLength(0);
  });

  it('the angler knows the foul water', () => {
    const { state } = setup(undefined, (r) => (r.water = ['usual', 'usual', 'foul']), { background: 'angler' });
    expect(fact(state, 'water', 2)).toMatchObject({ level: 'known', value: 'foul' });
  });
});

describe('saves and run codes', () => {
  it('a saved run carries on exactly as if it had never stopped', () => {
    const a = setup();
    const b = setup();
    const cmds: Command[] = [
      { t: 3, c: 'move', dir: 1 },
      { t: 200, c: 'halt' },
      { t: 400, c: 'sleep', minutes: 30, awake: true },
    ];
    runTo(a.state, a.world, cmds, 300);
    const saved = JSON.parse(JSON.stringify(toRecord(a.state)));
    const back = restore(saved, dealRules('flat'));
    back.rules = a.state.rules;
    runTo(back, a.world, cmds, 1200);
    runTo(b.state, b.world, cmds, 1200);
    expect(stateHash(back)).toBe(stateHash(b.state));
  });

  it('a save from before the valleys changed is refused, not loaded into a different valley', () => {
    const { state } = setup();
    const rec = JSON.parse(JSON.stringify(toRecord(state)));
    expect(() => migrate({ ...rec, schema: SCHEMA - 1 })).toThrow(/older version/);
    expect(migrate(rec).schema).toBe(SCHEMA);
  });

  it('a run code holds the seed and the protagonist', () => {
    const p = candidate('some seed', 4);
    expect(decodeRun(encodeRun('some seed', p))).toEqual({ seed: 'some seed', protagonist: p });
    expect(decodeRun(encodeRun('Ünïcødé ✓', p))?.seed).toBe('Ünïcødé ✓');
    expect(decodeRun('first-light')).toBeNull();
    expect(decodeRun('SL1.%%%')).toBeNull();
  });
});
