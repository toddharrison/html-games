import { describe, expect, it } from 'vitest';
import { DIRECTIVES, DIRECTIVE_IDS } from '../../src/content/directives';
import { DIRECTIVE, ENCOUNTER, RUN, SECTOR_MAP, TERRAIN_GEN } from '../../src/content/tuning';
import { IDLE_COMMAND } from '../../src/sim/behemoth';
import { destroyEnemy, spawnEnemy } from '../../src/sim/enemies';
import type { SimEvent } from '../../src/sim/events';
import type { ObjectiveState } from '../../src/sim/objective';
import {
  battleAlertPace,
  battleLength,
  battleObjective,
  battlePar,
  completeBattle,
  directiveAsk,
  directiveFor,
  newRun,
  objectiveTakenBy,
  requiredTargets,
  summarizeRun,
  type RunState,
} from '../../src/sim/run';
import { generateMap, objectiveNode } from '../../src/sim/sectorMap';
import { createWorld, stepWorld, type World, type WorldOptions } from '../../src/sim/world';
import { parseRun, serializeRun } from '../../src/save/runSave';

const OPTS = { seed: 1, frameWidth: 324, fieldRows: 21 };
const TS = TERRAIN_GEN.tileSize;

/** A quiet field (no posts, no waves) and a Behemoth that can't break. */
function world(opts: Partial<WorldOptions>): World {
  const w = createWorld({ ...OPTS, ...opts });
  w.encounter.posts = [];
  w.encounter.alert.next = 1e9;
  const b = w.behemoth;
  b.reactor.hp = b.reactor.max = 1e9;
  b.treads.hp = b.treads.max = 1e9;
  for (const z of Object.values(b.armor)) z.hp = z.max = 1e9;
  b.autoEnabled.fill(false);
  return w;
}

function step(w: World, n: number, throttle: -1 | 0 | 1 = 0): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    stepWorld(w, { ...IDLE_COMMAND, throttle, aimX: w.behemoth.x + 200, aimY: w.behemoth.y });
    out.push(...w.events.splice(0));
  }
  return out;
}

/** The run, standing at sector `s`'s objective battle. */
function atObjective(run: RunState, s: number): RunState {
  const at = { sector: s, node: objectiveNode(run.map, s)!.id };
  return { ...run, at, path: [at], next: 'battle' };
}

const objective = (o: Partial<ObjectiveState>): ObjectiveState => ({
  mode: 'assault',
  total: 0,
  destroyed: 0,
  lost: 0,
  fortress: null,
  convoySpeed: 0,
  alarm: 0,
  alarmed: false,
  command: null,
  ...o,
});

describe('directives on the map', () => {
  it('a run draws its Directive from the seed unless it names one; all three come up', () => {
    expect(newRun(5).directive).toBe(directiveFor(5));
    expect(newRun(5, 'class2', [], {}, [], undefined, 'interdiction').directive).toBe('interdiction');
    const drawn = new Set(Array.from({ length: 40 }, (_, i) => directiveFor(i)));
    expect([...drawn].sort()).toEqual([...DIRECTIVE_IDS].sort());
  });

  it('every sector’s objective battle is fought in the Directive’s mode; nothing else on the map changes', () => {
    for (const id of DIRECTIVE_IDS) {
      const map = generateMap(9, id);
      const plain = generateMap(9);
      map.sectors.forEach((sector, s) => {
        expect(objectiveNode(map, s)!.battle!.mode).toBe(DIRECTIVES[id].mode);
        sector.nodes.forEach((n, i) => {
          if (n.layer === sector.layers - 1) return;
          expect(n).toEqual(plain.sectors[s]!.nodes[i]);
        });
      });
    }
  });

  it('only objective battles take the Directive’s shape', () => {
    const run = newRun(4, 'class2', [], {}, [], undefined, 'breakthrough');
    const open = { ...run, at: { sector: 0, node: 0 }, next: 'battle' as const };
    expect(battleLength(open)).toBe(RUN.battleLength);
    expect(battleAlertPace(open)).toBe(1);
    expect(battlePar(open)).toBeNull();
    const obj = atObjective(run, 0);
    expect(battleLength(obj)).toBe(RUN.battleLength * DIRECTIVES.breakthrough.length);
    expect(battleAlertPace(obj)).toBe(DIRECTIVES.breakthrough.alertPace);
    expect(battlePar(obj)).toBe(Math.round((RUN.battleLength * 1.3 * 1.2) / 36));
    expect(directiveAsk('breakthrough', 'class2')).toMatch(/^Extract within \d:\d\d$/);
    expect(directiveAsk('interdiction', 'class2')).toBe('Stop 3 of 5 haulers');
    expect(directiveAsk('decapitation', 'class2')).toBe('Destroy the command post');
  });
});

describe('decapitation', () => {
  const spec = { mode: 'breach' as const, strength: 'objective' as const, command: true };

  it('a Decapitation objective’s fortress holds a command post; other Breach battles don’t', () => {
    const run = newRun(4, 'class2', [], {}, [], undefined, 'decapitation');
    expect(battleObjective(atObjective(run, 1))).toEqual(spec);
    const other = newRun(4, 'class2', [], {}, [], undefined, 'interdiction');
    expect(battleObjective(atObjective(other, 1), 'breach').command).toBeUndefined();
  });

  it('the post stands on a clear pad behind the bunkers, placed with the guns, tallied apart from them', () => {
    const w = world({ objective: spec });
    const plan = w.terrain.fortress()!;
    expect(plan.keep).not.toBeNull();
    const k = plan.keep!;
    expect(k.col).toBe(plan.col + TERRAIN_GEN.fortLine.bunkerBehind + DIRECTIVE.keep.behind);
    expect(w.objective.command?.state).toBe('waiting');
    const guns = w.objective.total;
    for (let i = 0; i < 60 * 300 && w.objective.fortress; i++) step(w, 1, 1);
    for (let c = k.col; c < k.col + DIRECTIVE.keep.cols; c++) {
      for (let r = k.rows[0]; r < k.rows[1]; r++) expect(w.terrain.tileAt((c + 0.5) * TS, (r + 0.5) * TS)?.mat).toBe('road');
    }
    const post = w.enemies.find((e) => e.def.id === 'commandPost')!;
    expect(post).toBeDefined();
    expect(post.objective).toBe(true);
    expect(w.objective.command?.state).toBe('standing');
    expect(w.objective.total).toBe(guns);
    expect(post.x).toBeGreaterThan(plan.col * TS);
  });

  it('destroying the post cuts the alert clock: no more waves, nothing queued', () => {
    const w = world({ objective: spec });
    for (let i = 0; i < 60 * 300 && w.objective.fortress; i++) step(w, 1, 1);
    const post = w.enemies.find((e) => e.def.id === 'commandPost')!;
    w.encounter.alert.next = 0.5;
    w.encounter.alert.queue = 5;
    destroyEnemy(w, post, 'shot');
    const events = [...w.events.splice(0), ...step(w, 60 * 3)];
    expect(events).toContainEqual(expect.objectContaining({ type: 'objective', what: 'destroyed', enemy: 'commandPost' }));
    expect(events.some((e) => e.type === 'alert')).toBe(false);
    expect(w.encounter.alert).toMatchObject({ cut: true, queue: 0 });
    expect(w.objective.destroyed).toBe(0);
    expect(objectiveTakenBy(DIRECTIVES.decapitation, w.objective, 100, null)).toBe(true);
  });

  it('a post left behind is lost, and the objective missed, however many guns fell', () => {
    const o = objective({ mode: 'breach', total: 5, destroyed: 5, command: { x: 0, y: 0, state: 'lost' } });
    expect(objectiveTakenBy(DIRECTIVES.decapitation, o, 100, null)).toBe(false);
  });

  it('the pad pushes the fortress back from the extraction line, never past it', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const w = world({ seed, objective: spec, battleLength: 2400 });
      const k = w.terrain.fortress()!.keep!;
      expect((k.col + DIRECTIVE.keep.cols) * TS).toBeLessThan(w.exitX);
    }
  });
});

describe('interdiction and breakthrough', () => {
  it('Interdiction takes 3 of 5 haulers (rounded up for a short convoy)', () => {
    expect(requiredTargets(0.6, 5)).toBe(3);
    expect(requiredTargets(0.6, 4)).toBe(3);
    expect(requiredTargets(0.6, 1)).toBe(1);
    const def = DIRECTIVES.interdiction;
    expect(objectiveTakenBy(def, objective({ mode: 'chase', total: 5, destroyed: 2, lost: 3 }), 100, null)).toBe(false);
    expect(objectiveTakenBy(def, objective({ mode: 'chase', total: 5, destroyed: 3, lost: 2 }), 100, null)).toBe(true);
  });

  it('Breakthrough is taken by extracting within par', () => {
    const def = DIRECTIVES.breakthrough;
    expect(objectiveTakenBy(def, objective({}), 200, 217)).toBe(true);
    expect(objectiveTakenBy(def, objective({}), 218, 217)).toBe(false);
  });

  it('a faster alert clock sends its first wave sooner', () => {
    const slow = createWorld({ ...OPTS });
    const fast = createWorld({ ...OPTS, alertPace: 1.25 });
    expect(fast.encounter.alert.next).toBeCloseTo(ENCOUNTER.alert.firstWave / 1.25);
    expect(slow.encounter.alert.next).toBeCloseTo(ENCOUNTER.alert.firstWave);
  });
});

describe('the run’s result', () => {
  /** A battle the Behemoth has extracted from in `time` seconds, its objective `o`. */
  function extracted(o: Partial<ObjectiveState>, time = 100): World {
    const w = world({});
    w.objective = objective(o);
    w.extractedAt = time;
    return w;
  }

  it('taking a sector’s objective earns depot actions; missing it only loses them', () => {
    const run = atObjective(newRun(6, 'class2', [], {}, [], undefined, 'interdiction'), 0);
    const intel = objectiveNode(run.map, 0)!.battle!;
    intel.cache = false;
    const taken = completeBattle(run, extracted({ mode: 'chase', total: 5, destroyed: 4, lost: 1 }));
    expect(taken.objectives).toEqual([true]);
    expect(taken.next).toBe('map');
    expect(taken.cache).toBe(DIRECTIVE.sectorReward);
    expect(taken.lastBattle!.taken).toBe(true);
    const missed = completeBattle(run, extracted({ mode: 'chase', total: 5, destroyed: 1, lost: 4 }));
    expect(missed.objectives).toEqual([false]);
    expect(missed.next).toBe('map');
    expect(missed.cache).toBe(0);
  });

  it('the last sector’s objective decides the Directive', () => {
    const run = atObjective(newRun(6, 'class2', [], {}, [], undefined, 'interdiction'), SECTOR_MAP.sectors - 1);
    const won = completeBattle({ ...run, objectives: [true, false] }, extracted({ mode: 'chase', total: 5, destroyed: 3, lost: 2 }));
    expect(won.next).toBe('won');
    expect(won.objectives).toEqual([true, false, true]);
    const failed = completeBattle(run, extracted({ mode: 'chase', total: 5, destroyed: 2, lost: 3 }));
    expect(failed.next).toBe('failed');
  });

  it('a plain battle reports no objective result and keeps the totals', () => {
    const run = { ...newRun(6), at: { sector: 0, node: 0 }, next: 'battle' as const };
    const w = extracted({}, 120);
    w.stats.salvage = 40;
    const done = completeBattle(run, w);
    expect(done.lastBattle!.taken).toBeUndefined();
    expect(done.objectives).toEqual([]);
    expect(done.time).toBe(120);
    expect(done.earned).toBe(40 + done.lastBattle!.bonus);
  });

  it('sums up a won, failed, or destroyed run', () => {
    const run: RunState = { ...newRun(6, 'class2', [], {}, [], undefined, 'decapitation'), battle: 8, kills: 150, earned: 900, time: 1200 };
    const won = summarizeRun({ ...run, next: 'won', at: { sector: 2, node: 0 }, objectives: [true, true, true] });
    expect(won).toMatchObject({ outcome: 'won', reached: 3, sectors: 3, battles: 8, kills: 150, earned: 900, time: 1200, blast: null });
    expect(summarizeRun({ ...run, next: 'failed' }).outcome).toBe('failed');
    const final = { stats: { kills: 12, blastKills: 7, salvage: 50, blastBest: 'heavyTank' as const }, time: 90, stand: { time: 20, wave: 2 } };
    const lost = summarizeRun({ ...run, at: { sector: 1, node: 3 } }, final);
    expect(lost).toMatchObject({ outcome: 'destroyed', reached: 2, kills: 162, earned: 950, time: 1290 });
    expect(lost.blast).toEqual({ kills: 7, best: 'heavyTank', stand: { time: 20, waves: 2 } });
  });

  it('the final blast remembers the biggest thing it took out', () => {
    const w = world({});
    const units = (['lightTank', 'heavyTank', 'infantry'] as const).map((id, i) => spawnEnemy(w, id, 400 + i * 30, w.terrain.height / 2));
    destroyEnemy(w, units[0]!, 'shot');
    expect(w.stats.blastBest).toBeNull();
    for (const e of units.slice(1)) destroyEnemy(w, e, 'blast');
    expect(w.stats.blastKills).toBe(2);
    expect(w.stats.blastBest).toBe('heavyTank');
  });
});

describe('the save', () => {
  it('keeps the Directive and the objectives; rejects a Directive it doesn’t know', () => {
    const run = { ...newRun(8, 'class2', [], {}, [], undefined, 'breakthrough'), objectives: [true, false], earned: 300, time: 400 };
    const loaded = parseRun(serializeRun(run))!;
    expect(loaded).toMatchObject({ directive: 'breakthrough', objectives: [true, false], earned: 300, time: 400 });
    const bad = JSON.parse(serializeRun(run));
    bad.run.directive = 'conquest';
    expect(parseRun(JSON.stringify(bad))).toBeNull();
    const badObjectives = JSON.parse(serializeRun(run));
    badObjectives.run.objectives = ['yes'];
    expect(parseRun(JSON.stringify(badObjectives))).toBeNull();
  });

  it('a version 10 save takes the Directive its last objective was already showing', () => {
    for (const [mode, directive] of [
      ['breach', 'decapitation'],
      ['chase', 'interdiction'],
      ['assault', 'breakthrough'],
    ] as const) {
      const file = JSON.parse(serializeRun(newRun(12)));
      file.version = 10;
      for (const k of ['directive', 'objectives', 'earned', 'time']) delete file.run[k];
      const sectors = file.run.map.sectors;
      sectors.forEach((s: { layers: number; nodes: { layer: number; battle: { mode: string } }[] }, i: number) => {
        const node = s.nodes.find((n) => n.layer === s.layers - 1)!;
        node.battle.mode = i === sectors.length - 1 ? mode : 'chase';
      });
      file.run.at = { sector: 1, node: 0 };
      file.run.path = [file.run.at];
      const loaded = parseRun(JSON.stringify(file))!;
      expect(loaded.directive).toBe(directive);
      loaded.map.sectors.forEach((_, s) => expect(objectiveNode(loaded.map, s)!.battle!.mode).toBe(DIRECTIVES[directive].mode));
      expect(loaded.objectives).toEqual([true]);
      expect(loaded.time).toBe(0);
    }
  });
});
