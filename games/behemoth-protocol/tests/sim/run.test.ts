import { CALLSIGNS } from '../../src/content/callsigns';
import { DOCTRINES } from '../../src/content/doctrines';
import { DEPOT, RUN, SECTOR_MAP } from '../../src/content/tuning';
import { describe, expect, it } from 'vitest';
import { IDLE_COMMAND, damageComponent } from '../../src/sim/behemoth';
import { spawnEnemy } from '../../src/sim/enemies';
import {
  battleEnemy,
  battleSeed,
  battleThreat,
  completeBattle,
  currentBattle,
  enterMapNode,
  leaveDepot,
  newRun,
  restoreBehemoth,
  snapshotBehemoth,
  type RunState,
} from '../../src/sim/run';
import { openDepot } from '../../src/sim/depot';
import { depotKey, reachable, type MapPos } from '../../src/sim/sectorMap';
import { createWorld, stepWorld, type World } from '../../src/sim/world';

const OPTS = { seed: 3, frameWidth: 480, fieldRows: 16 };

function drive(w: World, maxSteps: number, until: (w: World) => boolean) {
  for (let i = 0; i < maxSteps && !until(w); i++) {
    stepWorld(w, { ...IDLE_COMMAND, aimX: w.behemoth.x + 200, aimY: w.behemoth.y });
  }
}

describe('run state', () => {
  it('a new run starts on the map, at the foot of sector 1, with the chassis loadout at full integrity', () => {
    const run = newRun(42);
    expect(run.battle).toBe(0);
    expect(run.next).toBe('map');
    expect(run.at).toBeNull();
    expect(run.map.sectors).toHaveLength(SECTOR_MAP.sectors);
    const b = restoreBehemoth(run.behemoth, 0, 0);
    expect(b.treads.hp).toBe(b.treads.max);
    expect(b.hardpoints.find((h) => h.slot.id === 'turret')?.weapon?.id).toBe('heavyCannon');
    expect(b.hardpoints.find((h) => h.slot.id === 'spine')?.ammo).toBe(24);
  });

  it('a snapshot round-trips damage, weapons, and ammo', () => {
    const b = restoreBehemoth(newRun(1).behemoth, 0, 0);
    b.treads.hp = 37;
    b.armor.left.hp = 5;
    b.reactor.hp = 50;
    const rack = b.hardpoints.find((h) => h.slot.id === 'spine')!;
    rack.ammo = 7;
    damageComponent(b, 'prow', Infinity, []);
    b.hardpoints.find((h) => h.slot.id === 'flankL')!.weapon = null;

    const back = restoreBehemoth(snapshotBehemoth(b), 10, 20);
    expect(back.treads.hp).toBe(37);
    expect(back.armor.left.hp).toBe(5);
    expect(back.reactor.hp).toBe(50);
    expect(back.hardpoints.find((h) => h.slot.id === 'spine')!.ammo).toBe(7);
    expect(back.hardpoints.find((h) => h.slot.id === 'prow')!.integrity.hp).toBe(0);
    expect(back.hardpoints.find((h) => h.slot.id === 'flankL')!.weapon).toBeNull();
    expect([back.x, back.y]).toEqual([10, 20]);
    // Power refills between battles (SPEC §8.1).
    expect(back.power.stored).toBe(back.power.max);
  });

  it('the opening battle uses the run seed; later battles get their own', () => {
    const run = newRun(99);
    expect(battleSeed(run)).toBe(99);
    const first = enterMapNode(run, { sector: 0, node: 0 });
    expect(battleSeed(first)).toBe(99);
    const later = { ...run, at: { sector: 1, node: run.map.sectors[1]!.nodes.findIndex((n) => n.battle) } };
    expect(battleSeed(later)).not.toBe(99);
  });

  it('threat and the encounter mix come from the node: deeper is harder, the doctrine picks the units', () => {
    const run = newRun(1);
    const last = run.map.sectors.length - 1;
    const objective = { ...run, at: { sector: last, node: run.map.sectors[last]!.nodes.length - 1 } };
    expect(battleThreat(objective)).toBeGreaterThan(battleThreat(run));
    expect(battleThreat(objective)).toBe(currentBattle(objective).threat);
    expect(battleEnemy(run)).toEqual({ threat: battleThreat(run), mix: DOCTRINES.combined.mix, postScale: 1, waveScale: 1 });
  });

  it('only a reachable node can be entered; a battle node opens the battle', () => {
    const run = newRun(5);
    expect(enterMapNode(run, { sector: 1, node: 0 })).toBe(run);
    const next = enterMapNode(run, { sector: 0, node: 0 });
    expect(next).toMatchObject({ next: 'battle', at: { sector: 0, node: 0 }, path: [{ sector: 0, node: 0 }], depot: null });
  });
});

/** Walks the run onto the first reachable depot node (entering battles on the way), or null. */
function toDepot(seed: number): { run: RunState; pos: MapPos } | null {
  let run = enterMapNode(newRun(seed), { sector: 0, node: 0 });
  for (let step = 0; step < 6; step++) {
    const options = reachable(run.map, run.at);
    const depot = options.find((p) => run.map.sectors[p.sector]!.nodes[p.node]!.kind === 'depot');
    if (depot) return { run, pos: depot };
    run = enterMapNode(run, options[0]!);
  }
  return null;
}

describe('depot nodes', () => {
  it('open a depot with the supply caches added, and sibling depots stock different goods', () => {
    let siblings = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const found = toDepot(seed);
      expect(found).not.toBeNull();
      const { run, pos } = found!;
      const at = enterMapNode({ ...run, cache: 2 }, pos);
      expect(at.next).toBe('depot');
      expect(at.cache).toBe(0);
      expect(at.depot).toMatchObject({ actions: DEPOT.actions + 2, total: DEPOT.actions + 2 });
      expect(leaveDepot(at)).toMatchObject({ next: 'map', depot: null });
      // The depots before the sector's objective, side by side.
      const sector = run.map.sectors[0]!;
      const row = sector.nodes.filter((n) => n.layer === sector.layers - 2).map((n) => ({ sector: 0, node: n.id }));
      if (row.length > 1) {
        siblings++;
        const stock = (p: MapPos) => JSON.stringify(openDepot(run, run.behemoth, depotKey(p)).stock);
        expect(stock(row[0]!)).not.toBe(stock(row[1]!));
      }
    }
    expect(siblings).toBeGreaterThan(0);
  });
});

describe('extraction', () => {
  it('crossing the extraction line wins: spawns stop and enemies hold fire', () => {
    const w = createWorld({ ...OPTS, battleLength: 300 });
    expect(w.exitX).toBe(w.behemoth.x + 300);
    drive(w, 60 * 30, (w) => w.extractedAt !== null);
    expect(w.extractedAt).not.toBeNull();
    expect(w.behemoth.x).toBeGreaterThanOrEqual(w.exitX);

    const e = spawnEnemy(w, 'lightTank', w.behemoth.x + 120, w.behemoth.y);
    e.cooldown = 0;
    const before = w.enemies.length;
    drive(w, 60 * 10, () => false);
    expect(w.projectiles.filter((p) => p.owner === 'enemy')).toHaveLength(0);
    expect(w.enemies.length).toBeLessThanOrEqual(before);
  });

  it('an Immobilized Behemoth never extracts', () => {
    const w = createWorld({ ...OPTS, battleLength: 120 });
    damageComponent(w.behemoth, 'treads', Infinity, w.events);
    drive(w, 60 * 20, () => false);
    expect(w.extractedAt).toBeNull();
  });

  it('a won battle carries damage, kills, and salvage into the run, and goes back to the map', () => {
    let run = enterMapNode(newRun(OPTS.seed), { sector: 0, node: 0 });
    const w = createWorld({ ...OPTS, behemoth: run.behemoth, battleLength: 200 });
    w.behemoth.treads.hp = 60;
    w.stats.kills = 4;
    w.stats.salvage = 30;
    drive(w, 60 * 30, (w) => w.extractedAt !== null);
    run = completeBattle(run, w);
    expect(run.battle).toBe(1);
    expect(run.next).toBe('map');
    expect(run.kills).toBe(4);
    expect(run.salvage).toBe(30 + RUN.extractionBonus);
    expect(run.behemoth.treads).toBeLessThanOrEqual(60);
    expect(run.lastBattle).toMatchObject({ battle: 1, kills: 4, salvage: 30, bonus: RUN.extractionBonus });
    expect(run.depot).toBeNull();

    // The next battle starts with that damage.
    const w2 = createWorld({ ...OPTS, seed: battleSeed(run), behemoth: run.behemoth, threat: battleThreat(run) });
    expect(w2.behemoth.treads.hp).toBe(run.behemoth.treads);
    expect(w2.threat).toBe(battleThreat(run));
  });

  it('a node’s reward and cache are paid on extraction; the last objective wins the run', () => {
    const run = newRun(OPTS.seed);
    const last = run.map.sectors.length - 1;
    const objective = run.map.sectors[last]!.nodes.length - 1;
    // Breakthrough: a short battle at cruise is well inside its par.
    const atObjective: RunState = { ...run, directive: 'breakthrough', at: { sector: last, node: objective } };
    atObjective.map = structuredClone(run.map);
    atObjective.map.sectors[last]!.nodes[objective]!.battle!.cache = true;
    const w = createWorld({ ...OPTS, behemoth: run.behemoth, battleLength: 400 });
    drive(w, 60 * 30, (w) => w.extractedAt !== null);
    const done = completeBattle(atObjective, w);
    expect(done.next).toBe('won');
    expect(done.objectives).toEqual([true]);
    expect(done.cache).toBe(1);
    expect(done.salvage).toBe(RUN.extractionBonus + SECTOR_MAP.objective.salvage);
  });
});

describe('doctrine mix', () => {
  it('the spawner only fields units in the battle’s mix', () => {
    const w = createWorld({ ...OPTS, mix: { lightTank: 1 }, threat: 12 });
    drive(w, 60 * 40, () => false);
    expect(w.enemies.length).toBeGreaterThan(0);
    expect(w.enemies.every((e) => e.def.id === 'lightTank')).toBe(true);
  });
});

describe('callsigns', () => {
  it('names each run from its seed, from the list, and varies across seeds', () => {
    expect(newRun(5).callsign).toBe(newRun(5).callsign);
    const names = new Set(Array.from({ length: 40 }, (_, i) => newRun(i + 1).callsign));
    for (const n of names) expect(CALLSIGNS.some((c) => c.name === n)).toBe(true);
    expect(names.size).toBeGreaterThan(20);
  });

  it('lists each name once, with notes that fit a side-panel line', () => {
    expect(new Set(CALLSIGNS.map((c) => c.name)).size).toBe(CALLSIGNS.length);
    for (const c of CALLSIGNS) expect(c.note.length, c.name).toBeLessThanOrEqual(30);
  });
});
