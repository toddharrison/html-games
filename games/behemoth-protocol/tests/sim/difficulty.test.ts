import { describe, expect, it } from 'vitest';
import { DEFAULT_DIFFICULTY, DIFFICULTIES, DIFFICULTY_IDS, difficultyBrief, type DifficultyId } from '../../src/content/difficulties';
import { MAP_EVENTS } from '../../src/content/mapEvents';
import { MODES } from '../../src/content/modes';
import { fromV14, parseRun, serializeRun } from '../../src/save/runSave';
import { parseScores, SCORES_VERSION } from '../../src/save/scores';
import { IDLE_COMMAND } from '../../src/sim/behemoth';
import { destroyEnemy, spawnEnemy } from '../../src/sim/enemies';
import { chooseEventOption, drawOutcome, effectLines } from '../../src/sim/mapEvents';
import { objectiveBonus } from '../../src/sim/objective';
import { hashSeed } from '../../src/sim/rng';
import { battleEnemy, battleThreat, completeBattle, currentBattle, enterMapNode, newRun, salvageGain, salvageScale, summarizeRun, type RunState } from '../../src/sim/run';
import { bankSalvage, paySalvage, salvageWorth } from '../../src/sim/salvage';
import { scoreEntry } from '../../src/sim/scores';
import { nodeAt, reachable } from '../../src/sim/sectorMap';
import { createWorld, stepWorld, type World } from '../../src/sim/world';

const OPTS = { seed: 1, frameWidth: 324, fieldRows: 21 };

/** A run of each difficulty on one seed, standing at its opening battle. */
function runAt(difficulty: DifficultyId, seed = 3): RunState {
  const run = newRun(seed, 'class2', [], {}, [], undefined, undefined, difficulty);
  return enterMapNode(run, reachable(run.map, null)[0]!);
}

function quiet(w: World): World {
  w.encounter.off = true;
  return w;
}

describe('difficulty content', () => {
  it('Hard is the game as tuned; each easier one pays more and fields no more', () => {
    expect(DIFFICULTIES.hard).toMatchObject({ salvage: 1, threat: 1 });
    expect(DIFFICULTIES.normal.salvage).toBeGreaterThan(1);
    expect(DIFFICULTIES.normal.threat).toBeLessThanOrEqual(1);
    expect(DIFFICULTIES.easy.salvage).toBeGreaterThanOrEqual(DIFFICULTIES.normal.salvage);
    expect(DIFFICULTIES.easy.threat).toBeLessThan(DIFFICULTIES.normal.threat);
    expect(DIFFICULTIES.easy.threat).toBeGreaterThan(0);
    for (const id of DIFFICULTY_IDS) expect(DIFFICULTIES[id].id).toBe(id);
    expect(DIFFICULTY_IDS).toContain(DEFAULT_DIFFICULTY);
  });

  it('each one is summed up in a line from its numbers, in characters the pixel font has', () => {
    const pct = (scale: number) => `${Math.round(Math.abs(scale - 1) * 1000) / 10}%`;
    expect(difficultyBrief('easy')).toBe(`defenders -${pct(DIFFICULTIES.easy.threat)}, salvage +${pct(DIFFICULTIES.easy.salvage)}`);
    // Only what a difficulty changes is named.
    const normal = [...(DIFFICULTIES.normal.threat !== 1 ? [`defenders -${pct(DIFFICULTIES.normal.threat)}`] : []), `salvage +${pct(DIFFICULTIES.normal.salvage)}`];
    expect(difficultyBrief('normal')).toBe(normal.join(', '));
    // A half step is shown, not rounded away.
    expect(difficultyBrief('easy')).toBe('defenders -15%, salvage +25%');
    expect(difficultyBrief('normal')).toBe('defenders -7.5%, salvage +12.5%');
    expect(difficultyBrief('hard')).not.toMatch(/%/);
    for (const id of DIFFICULTY_IDS) expect(difficultyBrief(id)).toMatch(/^[A-Za-z0-9 .,:;'\-/%!?+()*<>=#]+$/);
  });
});

describe('a run’s difficulty', () => {
  it('a bare run is Hard, and the same seed draws the same map at every difficulty', () => {
    expect(newRun(3).difficulty).toBe('hard');
    const hard = runAt('hard');
    for (const id of DIFFICULTY_IDS) {
      const run = runAt(id);
      expect(run.difficulty).toBe(id);
      expect(run.map).toEqual(hard.map);
      expect(run.callsign).toBe(hard.callsign);
    }
  });

  it('scales the threat every battle is bought with: its node’s, times the difficulty’s share', () => {
    const node = currentBattle(runAt('hard')).threat;
    expect(battleThreat(runAt('hard'))).toBe(node);
    expect(battleThreat(runAt('normal'))).toBeCloseTo(node * DIFFICULTIES.normal.threat);
    expect(battleThreat(runAt('easy'))).toBeCloseTo(node * DIFFICULTIES.easy.threat);
    expect(battleThreat(runAt('easy'))).toBeLessThan(battleThreat(runAt('normal')));
    // The node itself is untouched (events shift it; the map shows the same intel).
    expect(currentBattle(runAt('easy')).threat).toBe(node);
    // The battle's forces, and so its posts, waves, and wave cap, are sized by it.
    const easy = runAt('easy');
    expect(battleEnemy(easy).threat).toBe(battleThreat(easy));
    const forces = battleEnemy(easy);
    const w = createWorld({ ...OPTS, seed: currentBattle(easy).seed, behemoth: easy.behemoth, ...forces });
    expect(w.threat).toBe(battleThreat(easy));
    const sized = (run: RunState) => {
      const world = createWorld({ ...OPTS, seed: currentBattle(run).seed, behemoth: run.behemoth, ...battleEnemy(run) });
      return world.encounter.posts.reduce((n, p) => n + p.units.length, 0);
    };
    const total = (id: DifficultyId) => [3, 4, 5, 6, 7, 8, 9, 10].reduce((n, seed) => n + sized(runAt(id, seed)), 0);
    expect(total('easy')).toBeLessThan(total('hard'));
    expect(total('easy')).toBeLessThanOrEqual(total('normal'));
    expect(total('normal')).toBeLessThanOrEqual(total('hard'));
  });

  it('pays its bonus on the extraction reward', () => {
    for (const id of DIFFICULTY_IDS) {
      const run = runAt(id);
      const w = quiet(createWorld({ ...OPTS, behemoth: run.behemoth, battleLength: 200, salvageScale: salvageScale(run) }));
      for (let i = 0; i < 60 * 30 && w.extractedAt === null; i++) stepWorld(w, IDLE_COMMAND);
      expect(w.extractedAt).not.toBeNull();
      const banked = w.stats.salvage;
      const after = completeBattle(run, w);
      const reward = currentBattle(run).salvage;
      expect(after.lastBattle!.bonus).toBe(salvageWorth(reward, DIFFICULTIES[id].salvage));
      expect(after.salvage).toBe(banked + salvageGain(run, reward));
      expect(after.earned).toBe(after.salvage);
    }
    expect(salvageGain(runAt('hard'), 25)).toBe(25);
    expect(salvageGain(runAt('normal'), 100)).toBe(salvageWorth(100, DIFFICULTIES.normal.salvage));
  });

  it('pays its bonus on what an event finds, but not on what one costs', () => {
    const at = (id: DifficultyId, seed: number) => {
      let run: RunState = { ...newRun(seed, 'class2', [], {}, [], undefined, undefined, id), salvage: 200 };
      const start = reachable(run.map, null)[0]!;
      run = { ...run, at: start, path: [start] };
      const pos = reachable(run.map, start)[0]!;
      const node = nodeAt(run.map, pos)!;
      node.kind = 'event';
      node.battle = null;
      node.event = { id: 'convoy', seed: hashSeed(seed, 0xe7e8, pos.sector, pos.node), fog: false };
      return enterMapNode(run, pos);
    };
    // A seed whose first option draws its plain find (salvage and nothing else).
    const option = MAP_EVENTS.convoy.options[0]!;
    const plain = option.outcomes.findIndex((o) => o.effects.length === 1 && o.effects[0]!.kind === 'salvage');
    expect(plain).toBeGreaterThanOrEqual(0);
    const effect = option.outcomes[plain]!.effects[0]!;
    const find = effect.kind === 'salvage' ? effect.amount : 0;
    let seed = 1;
    while (drawOutcome(nodeAt(at('hard', seed).map, at('hard', seed).at!)!.event!.seed, 'convoy', 0) !== plain) seed++;
    for (const id of DIFFICULTY_IDS) {
      const after = chooseEventOption(at(id, seed), 0);
      expect(after.salvage - 200).toBe(salvageWorth(find, DIFFICULTIES[id].salvage));
      expect(after.earned).toBe(after.salvage - 200);
    }
    expect(effectLines([{ kind: 'salvage', amount: 40 }], 1.15)).toEqual(['+46 salvage']);
    expect(effectLines([{ kind: 'salvage', amount: -40 }], 1.15)).toEqual(['-40 salvage']);
  });
});

describe('salvage in battle', () => {
  it('a kill pays the bonus', () => {
    const w = quiet(createWorld({ ...OPTS, salvageScale: 1.15 }));
    const e = spawnEnemy(w, 'heavyTank', w.behemoth.x + 120, w.behemoth.y);
    destroyEnemy(w, e, 'shot');
    expect(w.stats.salvage).toBe(Math.floor(e.def.salvage * 1.15 + 1e-9));
    expect(w.events.find((ev) => ev.type === 'salvage')).toMatchObject({ amount: w.stats.salvage, source: 'unit' });
  });

  it('small payments carry their fractions, so the total is the Hard total times the scale', () => {
    const w = quiet(createWorld({ ...OPTS, salvageScale: 1.15 }));
    const amounts: number[] = [];
    for (let i = 0; i < 40; i++) {
      paySalvage(w, 0, 0, 3, 'tile');
      const ev = w.events.at(-1)!;
      amounts.push(ev.type === 'salvage' ? ev.amount : 0);
    }
    expect(w.stats.salvage).toBe(Math.floor(40 * 3 * 1.15 + 1e-9));
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(w.stats.salvage);
    // Each payment is its Hard worth or one more.
    expect(new Set(amounts)).toEqual(new Set([3, 4]));
    // At Hard nothing is added and nothing carried.
    const hard = quiet(createWorld(OPTS));
    for (let i = 0; i < 40; i++) paySalvage(hard, 0, 0, 3, 'tile');
    expect(hard.stats.salvage).toBe(120);
    expect(hard.salvageCarry).toBe(0);
    // A scale that lands on whole numbers pays them (no float shortfall), and exact banking is exact.
    const even = quiet(createWorld({ ...OPTS, salvageScale: 1.15 }));
    paySalvage(even, 0, 0, 20, 'unit');
    expect(even.stats.salvage).toBe(23);
    bankSalvage(even, 0, 0, 7, 'unit');
    expect(even.stats.salvage).toBe(30);
  });

  it('an objective’s shares are scaled as a whole: they add up to the bonus the banners show', () => {
    const scale = 1.15;
    const w = createWorld({ ...OPTS, salvageScale: scale, objective: { mode: 'chase', strength: 'normal' } });
    w.encounter.posts = [];
    w.encounter.alert.next = 1e9;
    const targets = w.enemies.filter((e) => e.objective);
    expect(targets.length).toBeGreaterThan(1);
    w.events.length = 0;
    for (const t of targets) destroyEnemy(w, t, 'shot');
    const paid = w.events.reduce((n, e) => n + (e.type === 'salvage' && e.source === 'objective' ? e.amount : 0), 0);
    expect(paid).toBe(objectiveBonus(w.objective, scale));
    expect(paid).toBe(salvageWorth(MODES.chase.bonus, scale));
    expect(objectiveBonus(w.objective)).toBe(MODES.chase.bonus);
  });
});

describe('difficulty in the saves', () => {
  it('round-trips in the run save; a version 14 save was Hard; an unknown one is a broken save', () => {
    const run = runAt('easy');
    expect(parseRun(serializeRun(run))).toEqual(run);
    const { difficulty: _d, ...old } = newRun(5);
    expect((fromV14(old) as RunState).difficulty).toBe('hard');
    expect(parseRun(JSON.stringify({ version: 14, run: old }))!.difficulty).toBe('hard');
    expect(parseRun(serializeRun({ ...run, difficulty: 'brutal' as DifficultyId }))).toBeNull();
  });

  it('goes on the run summary and the score list; an older score reads as Hard', () => {
    const summary = summarizeRun({ ...runAt('easy'), next: 'won' });
    expect(summary.difficulty).toBe('easy');
    const entry = scoreEntry(summary, '2026-11-24');
    expect(entry.difficulty).toBe('easy');
    const { difficulty: _d, ...old } = entry;
    const file = JSON.stringify({ version: SCORES_VERSION, scores: [entry, { ...old, score: entry.score - 1 }, { ...old, difficulty: 'brutal' }] });
    expect(parseScores(file).map((e) => e.difficulty)).toEqual(['easy', 'hard']);
  });
});

describe('a run’s length', () => {
  it('is three sectors unless the run setup says otherwise; a one-sector run ends on its only objective', () => {
    expect(newRun(3).map.sectors).toHaveLength(3);
    const short = newRun(3, 'class2', [], {}, [], undefined, 'breakthrough', 'normal', 1);
    const long = newRun(3, 'class2', [], {}, [], undefined, 'breakthrough', 'normal', 5);
    expect(short.map.sectors).toHaveLength(1);
    expect(long.map.sectors).toHaveLength(5);
    expect(short.map.sectors[0]).toEqual(long.map.sectors[0]);
    expect(parseRun(serializeRun(long))).toEqual(long);
    expect(summarizeRun({ ...long, next: 'won' }).sectors).toBe(5);
    // Its objective decides the Directive: extracted inside par, the run is won.
    const sector = short.map.sectors[0]!;
    const at = { sector: 0, node: sector.nodes.find((n) => n.layer === sector.layers - 1)!.id };
    const run: RunState = { ...short, at, path: [at], next: 'battle' };
    const w = quiet(createWorld({ ...OPTS, behemoth: run.behemoth, battleLength: 200 }));
    for (let i = 0; i < 60 * 30 && w.extractedAt === null; i++) stepWorld(w, IDLE_COMMAND);
    expect(completeBattle(run, w).next).toBe('won');
    // The same battle in the long run only takes its sector.
    const longRun: RunState = { ...long, at, path: [at], next: 'battle' };
    expect(completeBattle(longRun, w).next).toBe('map');
  });
});
