import { describe, expect, it } from 'vitest';
import { CONDITIONS, CONDITION_IDS, conditionName, STORM_NAMES } from '../../src/content/conditions';
import { BIOME_IDS } from '../../src/content/biomes';
import { CONCEALMENT, CONDITION } from '../../src/content/tuning';
import { WEAPONS } from '../../src/content/weapons';
import { autoReach, IDLE_COMMAND } from '../../src/sim/behemoth';
import { behemothMarked, beyondSight, conditionSpread, createCondition, enemyCanSee, hoverScale, sightRadius } from '../../src/sim/conditions';
import { spawnEnemy } from '../../src/sim/enemies';
import type { SimEvent } from '../../src/sim/events';
import { battleCondition, enterMapNode, newRun } from '../../src/sim/run';
import { generateMap, reachable } from '../../src/sim/sectorMap';
import { missileLockTarget, spawnProjectile } from '../../src/sim/weapons';
import { createWorld, stepWorld, type World, type WorldOptions } from '../../src/sim/world';

const OPTS = { seed: 1, frameWidth: 324, fieldRows: 21 };

/** A quiet field (no posts, no waves), autos off, and a Behemoth that can't break. */
function world(opts: Partial<WorldOptions> = {}): World {
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

function step(w: World, n: number): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    stepWorld(w, { ...IDLE_COMMAND, aimX: w.behemoth.x + 200, aimY: w.behemoth.y });
    out.push(...w.events.splice(0));
  }
  return out;
}

/** A unit straight ahead of the Behemoth, `d` units from its center, on open ground. */
function unitAhead(w: World, d: number, id: 'lightTank' | 'heavyTank' = 'heavyTank') {
  const b = w.behemoth;
  const e = spawnEnemy(w, id, b.x + d, b.y);
  e.cooldown = 1e9;
  return e;
}

describe('condition content', () => {
  it('every condition has a name, intel, a banner, and a weight in every biome', () => {
    for (const id of CONDITION_IDS) {
      const def = CONDITIONS[id];
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.intel.length).toBeGreaterThan(0);
      for (const biome of BIOME_IDS) expect(def.weight[biome]).toBeGreaterThan(0);
    }
  });

  it('a storm takes its biome name', () => {
    expect(conditionName('storm', 'desert')).toBe('Sandstorm');
    expect(conditionName('storm', 'arctic')).toBe('Blizzard');
    expect(conditionName('night', 'desert')).toBe('Night');
    for (const biome of BIOME_IDS) expect(STORM_NAMES[biome].length).toBeGreaterThan(0);
  });
});

describe('sight', () => {
  it('a clear battle has no limit, and nothing is hidden by it', () => {
    const w = world();
    expect(w.condition).toBeNull();
    expect(sightRadius(w)).toBeNull();
    const e = unitAhead(w, 300);
    step(w, 1);
    expect(beyondSight(w, e)).toBe(false);
    expect(e.hidden).toBe(false);
  });

  it('night: the sight radius, scaled by the sensors', () => {
    const w = world({ condition: 'night' });
    expect(sightRadius(w)).toBeCloseTo(CONDITION.night.sight * autoReach(w.behemoth));
    const full = sightRadius(w)!;
    w.behemoth.sensors.hp = 0;
    expect(sightRadius(w)!).toBeLessThan(full);
  });

  it('night: a unit past sight is hidden, one inside it shows', () => {
    const w = world({ condition: 'night' });
    const far = unitAhead(w, CONDITION.night.sight + 60);
    const near = unitAhead(w, CONDITION.night.sight - 40, 'lightTank');
    step(w, 1);
    expect(far.hidden).toBe(true);
    expect(near.hidden).toBe(false);
    // Hidden means no lock either.
    expect(missileLockTarget(w, far.x, far.y, 20)?.id).not.toBe(far.id);
  });

  it('night: a muzzle flash, a telegraph, or a hit gives a unit away; objective targets always show', () => {
    const w = world({ condition: 'night' });
    const e = unitAhead(w, CONDITION.night.sight + 80);
    step(w, 1);
    expect(e.hidden).toBe(true);
    e.exposed = CONCEALMENT.afterFire;
    step(w, 1);
    expect(e.hidden).toBe(false);
    e.exposed = 0;
    e.windup = 0.5;
    expect(beyondSight(w, e)).toBe(false);
    e.windup = 0;
    e.objective = true;
    expect(beyondSight(w, e)).toBe(false);
  });

  it('spawning a unit in the dark hides it at once', () => {
    const w = world({ condition: 'night' });
    expect(unitAhead(w, 400).hidden).toBe(true);
  });
});

describe('night: muzzle flashes', () => {
  it('the enemy only sees a dark Behemoth up close; once it fires, everyone in range can', () => {
    const w = world({ condition: 'night' });
    const b = w.behemoth;
    const far = unitAhead(w, b.chassis.length / 2 + CONDITION.night.enemySight + 40);
    const near = unitAhead(w, b.chassis.length / 2 + CONDITION.night.enemySight - 20, 'lightTank');
    expect(behemothMarked(w)).toBe(false);
    expect(enemyCanSee(w, far)).toBe(false);
    expect(enemyCanSee(w, near)).toBe(true);
    spawnProjectile(w, 'player', WEAPONS.autocannon, b.x, b.y, 0);
    expect(behemothMarked(w)).toBe(true);
    expect(enemyCanSee(w, far)).toBe(true);
    step(w, Math.ceil(CONDITION.night.flashMark * 60) + 2);
    expect(behemothMarked(w)).toBe(false);
    // The Behemoth has driven on meanwhile: put the unit back out of sight.
    far.x = b.x + b.chassis.length / 2 + CONDITION.night.enemySight + 40;
    far.y = b.y;
    expect(enemyCanSee(w, far)).toBe(false);
  });

  it('a unit that cannot see the Behemoth never lines up a shot', () => {
    const w = world({ condition: 'night' });
    const b = w.behemoth;
    const far = unitAhead(w, b.chassis.length / 2 + CONDITION.night.enemySight + 40);
    far.cooldown = 0;
    step(w, 120);
    expect(far.windup).toBe(0);
    expect(far.salvoLeft).toBe(0);
  });

  it("an enemy's shot doesn't mark the Behemoth", () => {
    const w = world({ condition: 'night' });
    spawnProjectile(w, 'enemy', WEAPONS.lightTankGun, w.behemoth.x + 100, w.behemoth.y, Math.PI);
    expect(behemothMarked(w)).toBe(false);
  });

  it("a clear battle never blinds anyone or widens anyone's fire", () => {
    const w = world();
    expect(conditionSpread(w)).toBe(1);
    expect(enemyCanSee(w, unitAhead(w, 1000))).toBe(true);
  });
});

describe('storm: squalls', () => {
  it('calm at the start; a squall builds, holds, and dies away, with events', () => {
    const w = world({ condition: 'storm' });
    const c = w.condition!;
    expect(c.squall).toBe(0);
    expect(sightRadius(w)).toBeNull();
    const g = c.gust!;
    expect(g.start).toBeGreaterThanOrEqual(CONDITION.storm.first[0]);
    expect(g.start).toBeLessThanOrEqual(CONDITION.storm.first[1]);
    const events = step(w, Math.ceil(g.full * 60) + 1);
    expect(c.squall).toBe(1);
    expect(sightRadius(w)).toBeCloseTo(CONDITION.storm.sight * autoReach(w.behemoth));
    expect(conditionSpread(w)).toBeCloseTo(CONDITION.storm.spread);
    expect(hoverScale(w)).toBeCloseTo(CONDITION.storm.hover);
    expect(events.filter((e) => e.type === 'squall' && e.rising)).toHaveLength(1);
    const later = step(w, Math.ceil((g.end - w.time) * 60) + 2);
    expect(c.squall).toBe(0);
    expect(later.some((e) => e.type === 'squall' && !e.rising)).toBe(true);
    // The next one is scheduled after a gap.
    expect(c.gust!.start - g.end).toBeGreaterThanOrEqual(CONDITION.storm.gap[0]);
  });

  it('the schedule is the same for the same seed, and its own stream leaves combat draws alone', () => {
    const a = createCondition('storm', 7)!;
    const b = createCondition('storm', 7)!;
    expect(a.gust).toEqual(b.gust);
    const clear = world();
    const storm = world({ condition: 'storm' });
    expect(storm.rng.next()).toBe(clear.rng.next());
  });

  it('a squall blinds both sides past its sight', () => {
    const w = world({ condition: 'storm' });
    const e = unitAhead(w, w.behemoth.chassis.length / 2 + CONDITION.storm.sight + 60);
    step(w, 1);
    expect(e.hidden).toBe(false);
    expect(enemyCanSee(w, e)).toBe(true);
    w.condition!.squall = 1;
    expect(beyondSight(w, e)).toBe(true);
    expect(enemyCanSee(w, e)).toBe(false);
    // Firing doesn't help in a storm: the flash is lost in it.
    spawnProjectile(w, 'player', WEAPONS.autocannon, w.behemoth.x, w.behemoth.y, 0);
    expect(enemyCanSee(w, e)).toBe(false);
  });

  it('night is never squally, and only a storm slows hovercraft', () => {
    const w = world({ condition: 'night' });
    step(w, 60 * 40);
    expect(w.condition!.squall).toBe(0);
    expect(hoverScale(w)).toBe(1);
  });
});

describe('conditions on the map', () => {
  const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1);

  it('the opening battle is always clear; about the tuned share of the rest have a condition', () => {
    let battles = 0;
    let withCondition = 0;
    for (const seed of SEEDS) {
      const map = generateMap(seed);
      expect(map.sectors[0]!.nodes[0]!.battle!.condition).toBeNull();
      for (const s of map.sectors)
        for (const n of s.nodes) {
          if (!n.battle || n.battle.seed === seed) continue;
          battles++;
          if (n.battle.condition) withCondition++;
          expect(n.battle.condition === null || CONDITION_IDS.includes(n.battle.condition)).toBe(true);
        }
    }
    expect(withCondition / battles).toBeGreaterThan(CONDITION.chance - 0.08);
    expect(withCondition / battles).toBeLessThan(CONDITION.chance + 0.08);
  });

  it('the same seed draws the same conditions', () => {
    const a = generateMap(5).sectors.flatMap((s) => s.nodes.map((n) => n.battle?.condition ?? null));
    const b = generateMap(5).sectors.flatMap((s) => s.nodes.map((n) => n.battle?.condition ?? null));
    expect(a).toEqual(b);
  });

  it("the run's battle takes its node's condition, and a practice override replaces it", () => {
    let run = newRun(3);
    run = enterMapNode(run, reachable(run.map, null)[0]!);
    expect(battleCondition(run)).toBeNull();
    expect(battleCondition(run, 'night')).toBe('night');
    const node = run.map.sectors[0]!.nodes[0]!;
    node.battle!.condition = 'storm';
    expect(battleCondition(run)).toBe('storm');
    expect(battleCondition(run, null)).toBeNull();
  });
});
