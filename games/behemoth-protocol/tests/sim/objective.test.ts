import { describe, expect, it } from 'vitest';
import { MODES, MODE_IDS } from '../../src/content/modes';
import { TERRAIN_GEN } from '../../src/content/tuning';
import { IDLE_COMMAND, type PlayerCommand } from '../../src/sim/behemoth';
import { viaFord } from '../../src/sim/ai/crossing';
import { destroyEnemy, spawnEnemy } from '../../src/sim/enemies';
import type { SimEvent } from '../../src/sim/events';
import { frameRight } from '../../src/sim/frame';
import { objectiveBonus, objectiveComplete, planFortress } from '../../src/sim/objective';
import { battleObjective, completeBattle, enterMapNode, newRun } from '../../src/sim/run';
import { generateMap } from '../../src/sim/sectorMap';
import { hashSeed } from '../../src/sim/rng';
import { Terrain } from '../../src/sim/terrain';
import { createWorld, stepWorld, type World, type WorldOptions } from '../../src/sim/world';
import { parseRun, serializeRun } from '../../src/save/runSave';

const OPTS = { seed: 1, frameWidth: 324, fieldRows: 21 };
const TS = TERRAIN_GEN.tileSize;
const CHUNK = TERRAIN_GEN.chunkCols;

/** A quiet field (no posts, no waves) and a Behemoth that can't break. */
function world(opts: Partial<WorldOptions> & { objective: WorldOptions['objective'] }): World {
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

function run(w: World, n: number, cmd: Partial<PlayerCommand> = {}, events: SimEvent[] = []): SimEvent[] {
  for (let i = 0; i < n; i++) {
    stepWorld(w, { ...IDLE_COMMAND, aimX: w.behemoth.x + 200, aimY: w.behemoth.y, ...cmd });
    events.push(...w.events);
    w.events.length = 0;
  }
  return events;
}

/** Steps until the frame has spawned the fortress guns. */
function reachFortress(w: World): void {
  for (let i = 0; i < 60 * 300 && w.objective.fortress; i++) run(w, 1, { throttle: 1 });
}

const targets = (w: World) => w.enemies.filter((e) => e.alive && e.objective);

describe('modes on the map', () => {
  it('the opening battle is an Assault; later battles draw all three modes, Assault the commonest', () => {
    const count: Record<string, number> = { assault: 0, breach: 0, chase: 0 };
    for (let seed = 1; seed <= 40; seed++) {
      const map = generateMap(seed);
      expect(map.sectors[0]!.nodes[0]!.battle!.mode).toBe('assault');
      for (const s of map.sectors) for (const n of s.nodes) if (n.battle && !(s === map.sectors[0] && n.layer === 0)) count[n.battle.mode]!++;
    }
    for (const m of MODE_IDS) expect(count[m]).toBeGreaterThan(0);
    expect(count.assault).toBeGreaterThan(count.breach!);
    expect(count.assault).toBeGreaterThan(count.chase!);
  });

  it('the save keeps a Breach or Chase node and rejects a mode it doesn’t know', () => {
    const bad = (mode: string) => {
      const file = JSON.parse(serializeRun(enterMapNode(newRun(3), { sector: 0, node: 0 })));
      file.run.map.sectors[0].nodes[0].battle.mode = mode;
      return parseRun(JSON.stringify(file));
    };
    expect(bad('breach')).not.toBeNull();
    expect(bad('chase')).not.toBeNull();
    expect(bad('duel')).toBeNull();
  });

  it('the battle’s objective is its node’s mode and strength; a practice override wins', () => {
    const run = enterMapNode(newRun(3), { sector: 0, node: 0 });
    expect(battleObjective(run)).toEqual({ mode: 'assault', strength: 'normal' });
    expect(battleObjective(run, 'chase')).toEqual({ mode: 'chase', strength: 'normal' });
  });

  it('an Assault has no targets and pays no objective bonus', () => {
    const w = world({ objective: { mode: 'assault', strength: 'normal' } });
    expect(w.objective.total).toBe(0);
    expect(objectiveBonus(w.objective)).toBe(0);
    expect(w.enemies).toHaveLength(0);
  });
});

describe('breach', () => {
  it('the fortress stands about two-thirds of the way up, clear of rivers, the same for the same seed', () => {
    let dry = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const recipe = { biome: 'temperate' as const, approach: 'river' as const };
      const terrainSeed = hashSeed(seed, 0x7e44);
      const spec = planFortress(seed, terrainSeed, 21, recipe, 70, 5070, 'normal');
      expect(planFortress(seed, terrainSeed, 21, recipe, 70, 5070, 'normal')).toEqual(spec);
      const x = spec.col * TS;
      expect(x).toBeGreaterThan(70 + 5000 * 0.45);
      expect(x).toBeLessThan(70 + 5000 * 0.8);
      expect(spec.guns).toBe(MODES.breach.fortress!.guns.normal);
      // No water or bank anywhere along the wall, its trap belt, or its bunkers.
      const t = new Terrain(terrainSeed, 21, { ...recipe, fortress: spec });
      t.ensure(0, (spec.col + CHUNK) * TS);
      const wet = (c: number) => Array.from({ length: 21 }, (_, r) => t.tile(c, r)!.mat).some((m) => m === 'water' || m === 'shallows');
      if (![spec.col - 4, spec.col - 3, spec.col, spec.col + 2].some(wet)) dry++;
    }
    // Rivers come about every other chunk on this approach; the wall still finds dry ground.
    expect(dry).toBe(12);
  });

  it('the wall holds a gap for each gun and its gates; the rest of it is wall', () => {
    const spec = { col: 40, guns: 4, gates: 2, gateWidth: [3, 4] as const };
    const t = new Terrain(7, 21, { biome: 'temperate', approach: null, fortress: spec });
    t.ensure(0, 60 * TS);
    const plan = t.fortress()!;
    expect(plan.col).toBe(40);
    expect(plan.embrasures).toHaveLength(4);
    expect(plan.gates).toHaveLength(2);
    for (const [a, b] of plan.embrasures) {
      expect(b - a).toBe(2);
      for (let r = a; r < b; r++) expect(t.tile(40, r)!.mat).toBe('ground');
      for (const [g0, g1] of plan.gates) expect(b <= g0 || a >= g1).toBe(true);
    }
    const open = (r: number) => [...plan.gates, ...plan.embrasures].some(([a, b]) => r >= a && r < b);
    for (let r = 0; r < 21; r++) if (!open(r)) expect(['wall', 'rock']).toContain(t.tile(40, r)!.mat);
  });

  it('a narrow field still fits the guns: the gates narrow first', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const t = new Terrain(seed, 18, { biome: 'temperate', approach: null, fortress: { col: 40, guns: 5, gates: 2, gateWidth: [3, 4] } });
      const plan = t.fortress()!;
      expect(plan.embrasures).toHaveLength(5);
      const all = [...plan.gates, ...plan.embrasures].sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < all.length; i++) expect(all[i]![0]).toBeGreaterThanOrEqual(all[i - 1]![1]);
      expect(all.at(-1)![1]).toBeLessThanOrEqual(18);
    }
  });

  it('places its guns as the frame reaches the wall: targets, set in the wall, facing the approach, never moving', () => {
    const w = world({ objective: { mode: 'breach', strength: 'strong' } });
    const plan = w.terrain.fortress()!;
    expect(w.objective.total).toBe(plan.embrasures.length);
    expect(targets(w)).toHaveLength(0);
    reachFortress(w);
    const guns = targets(w);
    expect(guns).toHaveLength(w.objective.total);
    expect(frameRight(w.frame)).toBeLessThan(plan.col * TS);
    for (const g of guns) {
      expect(g.x).toBeCloseTo((plan.col + 0.5) * TS);
      expect(g.heading).toBeCloseTo(Math.PI);
      expect(MODES.breach.fortress!.units).toContain(g.def.id);
    }
    const where = guns.map((g) => [g.x, g.y]);
    run(w, 120, { throttle: -1 });
    expect(targets(w).map((g) => [g.x, g.y])).toEqual(where);
    // They're armed and they fire.
    const fired = run(w, 600, { throttle: -1 }).filter((e) => e.type === 'fire' && e.owner === 'enemy');
    expect(fired.length).toBeGreaterThan(0);
  });

  it('every gun destroyed completes it and pays the whole bonus; some pay their share', () => {
    const w = world({ objective: { mode: 'breach', strength: 'normal' } });
    reachFortress(w);
    const guns = targets(w);
    const events: SimEvent[] = [];
    destroyEnemy(w, guns[0]!, 'shot');
    events.push(...w.events.splice(0));
    expect(w.objective.destroyed).toBe(1);
    expect(objectiveBonus(w.objective)).toBe(Math.round(MODES.breach.bonus / guns.length));
    for (const g of guns.slice(1)) destroyEnemy(w, g, 'shot');
    events.push(...w.events.splice(0));
    expect(objectiveComplete(w.objective)).toBe(true);
    expect(objectiveBonus(w.objective)).toBe(MODES.breach.bonus);
    const calls = events.filter((e) => e.type === 'objective');
    expect(calls).toHaveLength(guns.length);
    expect(calls.at(-1)).toMatchObject({ what: 'destroyed', done: true });
  });

  it('plowing into a gun destroys it (a heavy ram)', () => {
    const w = world({ objective: { mode: 'breach', strength: 'normal' } });
    reachFortress(w);
    const g = targets(w)[0]!;
    const b = w.behemoth;
    g.x = b.x + b.chassis.length / 2 + 2;
    g.y = b.y;
    const events = run(w, 30, { throttle: 1 });
    expect(g.alive).toBe(false);
    expect(w.objective.destroyed).toBe(1);
    expect(events.some((e) => e.type === 'collision' && e.obstacle === 'heavy')).toBe(true);
  });

  it('guns left behind are lost, and the battle still extracts', () => {
    const w = world({ objective: { mode: 'breach', strength: 'normal' }, battleLength: 2400 });
    // Keep the guns from being rammed: move them to the field edges, out of the lane.
    reachFortress(w);
    for (const [i, g] of targets(w).entries()) g.y = i % 2 === 0 ? 12 : w.terrain.height - 12;
    const events = run(w, 60 * 200, { throttle: 1 });
    expect(w.extractedAt).not.toBeNull();
    expect(w.objective.destroyed + w.objective.lost).toBe(w.objective.total);
    expect(events.some((e) => e.type === 'objective' && e.what === 'lost')).toBe(true);
  });

  it('a won battle reports the objective and adds its share to the bonus', () => {
    const run0 = enterMapNode(newRun(3), { sector: 0, node: 0 });
    const w = world({ objective: { mode: 'breach', strength: 'normal' } });
    reachFortress(w);
    const guns = targets(w);
    destroyEnemy(w, guns[0]!, 'shot');
    w.extractedAt = w.time;
    const won = completeBattle(run0, w);
    expect(won.lastBattle!.objective).toEqual({ mode: 'breach', destroyed: 1, total: guns.length });
    expect(won.lastBattle!.bonus).toBe(currentSalvage(run0) + Math.round(MODES.breach.bonus / guns.length));
  });
});

/** The opening node's extraction reward. */
function currentSalvage(r: ReturnType<typeof newRun>): number {
  return r.map.sectors[0]!.nodes[0]!.battle!.salvage;
}

describe('chase', () => {
  it('the convoy starts just ahead: haulers (the targets), a mine layer at the tail, an escort screen', () => {
    const w = world({ objective: { mode: 'chase', strength: 'normal' } });
    const c = MODES.chase.convoy!;
    expect(targets(w)).toHaveLength(c.haulers.normal);
    expect(w.objective.total).toBe(c.haulers.normal);
    expect(w.enemies.filter((e) => e.def.id === 'mineLayer')).toHaveLength(c.layers.normal);
    expect(w.enemies.filter((e) => e.def.id === 'lightTank' || e.def.id === 'hovercraft')).toHaveLength(c.escorts.normal);
    for (const e of w.enemies.filter((x) => x.def.behavior === 'convoy')) {
      expect(e.x).toBeGreaterThan(w.behemoth.x + 80);
      expect(e.weapon).toBeNull();
    }
    const layer = w.enemies.find((e) => e.def.id === 'mineLayer')!;
    for (const h of targets(w)) expect(h.x).toBeGreaterThan(layer.x);
  });

  it('runs a little faster than the Behemoth cruises; a damaged hauler slows down', () => {
    const w = world({ objective: { mode: 'chase', strength: 'normal' } });
    expect(w.objective.convoySpeed).toBeCloseTo(MODES.chase.convoy!.speed * w.behemoth.chassis.speed.cruise);
    const [a, b] = targets(w);
    b!.hp = b!.def.hp * 0.2;
    const x0 = [a!.x, b!.x];
    run(w, 300);
    const da = a!.x - x0[0]!;
    const db = b!.x - x0[1]!;
    expect(da / 5).toBeGreaterThan(w.behemoth.chassis.speed.cruise * 0.95);
    expect(db).toBeLessThan(da * 0.8);
  });

  it('a hauler past the extraction line has escaped: lost, not a kill', () => {
    const w = world({ objective: { mode: 'chase', strength: 'normal' }, battleLength: 900 });
    const events = run(w, 60 * 25, { throttle: -1 });
    expect(w.objective.lost).toBeGreaterThan(0);
    expect(w.objective.destroyed).toBe(0);
    expect(events.some((e) => e.type === 'objective' && e.what === 'lost')).toBe(true);
  });

  it('the mine layer drops mines in plain sight behind it', () => {
    const w = world({ objective: { mode: 'chase', strength: 'normal' } });
    const events = run(w, 60 * 10, { throttle: -1 });
    const laid = events.filter((e) => e.type === 'mineLaid');
    expect(laid.length).toBeGreaterThan(0);
    for (const m of laid) {
      if (m.type !== 'mineLaid') continue;
      const t = w.terrain.tileAt(m.x, m.y);
      if (t?.mat === 'mine') expect(t.seen).toBe(true);
    }
  });

  it('running a hauler down destroys it and counts', () => {
    const w = world({ objective: { mode: 'chase', strength: 'normal' } });
    const h = targets(w)[0]!;
    const b = w.behemoth;
    h.x = b.x + b.chassis.length / 2 + 1;
    h.y = b.y;
    h.hp = 1e-3;
    run(w, 2, { throttle: 1 });
    expect(h.alive).toBe(false);
    expect(w.objective.destroyed).toBe(1);
  });
});

describe('hovercraft', () => {
  it('skims over water and ice that stop tracked vehicles, and never needs a ford', () => {
    const w = createWorld({ ...OPTS, seed: 4 });
    const t = w.terrain;
    // Find a deep-water tile ahead.
    t.ensure(0, 4000);
    let at: { x: number; y: number } | null = null;
    for (let c = 10; c < 250 && !at; c++) for (let r = 0; r < t.rows && !at; r++) if (t.tile(c, r)?.mat === 'water') at = { x: (c + 0.5) * TS, y: (r + 0.5) * TS };
    expect(at).not.toBeNull();
    expect(t.speedAt(at!.x, at!.y, 'tracked')).toBe(0);
    expect(t.speedAt(at!.x, at!.y, 'hover')).toBe(1);
    const hc = spawnEnemy(w, 'hovercraft', at!.x - 200, at!.y);
    expect(viaFord(hc, w, at!.x + 200, at!.y)).toBeNull();
  });
});
