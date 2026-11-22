import { describe, expect, it } from 'vitest';
import { DOCTRINES } from '../../src/content/doctrines';
import { ENEMIES } from '../../src/content/enemies';
import { OBSTACLE_CLASSES } from '../../src/content/obstacles';
import { RAM } from '../../src/content/tuning';
import { IDLE_COMMAND, ramRating } from '../../src/sim/behemoth';
import { gunPivot, gunTarget, spawnEnemy } from '../../src/sim/enemies';
import type { Enemy } from '../../src/sim/entities';
import { newRun } from '../../src/sim/run';
import { createWorld, stepWorld, type World } from '../../src/sim/world';

const OPTS = { seed: 1, frameWidth: 324, fieldRows: 21 };
const DEF = ENEMIES.siegeTank;

function world(trailer = false): World {
  const w = createWorld({ ...OPTS, ...(trailer ? { behemoth: newRun(1, 'class2', ['trailer'], {}, []).behemoth } : {}) });
  w.encounter.off = true;
  w.behemoth.autoEnabled.fill(false);
  for (let c = 0; c < 120; c++) {
    for (let r = 0; r < w.terrain.rows; r++) {
      const t = w.terrain.tile(c, r);
      if (t) Object.assign(t, { mat: 'ground', state: 'intact', hp: 0 });
    }
  }
  return w;
}

function steps(w: World, n: number) {
  for (let i = 0; i < n; i++) stepWorld(w, { ...IDLE_COMMAND, aimX: w.behemoth.x + 200, aimY: w.behemoth.y });
}

/** A siege tank parked ahead, broadside, both guns ready. */
function parked(w: World, dx = 150, dy = 40, fire = true): Enemy {
  const b = w.behemoth;
  const e = spawnEnemy(w, 'siegeTank', b.x + dx, b.y + dy);
  e.def = { ...e.def, maxSpeed: 0, accel: 0, ...(fire ? {} : { fireRange: 0, turrets: [] }) };
  e.vx = 0;
  e.heading = Math.PI / 2;
  if (!fire) e.guns = [];
  for (const g of [e, ...e.guns]) {
    g.cooldown = 0;
    g.turret = Math.atan2(b.y - e.y, b.x - e.x);
  }
  return e;
}

const fired = (w: World) => new Set(w.events.flatMap((ev) => (ev.type === 'fire' && ev.owner === 'enemy' ? [ev.weapon] : [])));

describe('siege tank', () => {
  it('carries a second turret with its own weapon, cycle, and telegraph', () => {
    const w = world();
    const e = parked(w);
    expect(e.guns).toHaveLength(1);
    expect(e.guns[0]!.weapon?.id).toBe('siegeAutocannon');
    steps(w, 1);
    // Both lay their guns at once, each for its own aim time.
    expect(e.windup).toBeGreaterThan(0);
    expect(e.guns[0]!.windup).toBeGreaterThan(0);
    const seen = new Set<string>();
    for (let i = 0; i < 120; i++) {
      steps(w, 1);
      for (const id of fired(w)) seen.add(id);
      w.events.length = 0;
    }
    expect(seen).toEqual(new Set(['siegeCannon', 'siegeAutocannon']));
  });

  it('the rear gun turns on its own pivot on the engine deck', () => {
    const w = world();
    const e = parked(w);
    e.heading = 0;
    const p = gunPivot(e, e.guns[0]!.def.pivot);
    expect(p.x).toBeCloseTo(e.x + DEF.turrets![0]!.pivot.x);
    expect(p.y).toBeCloseTo(e.y);
  });

  it('the rear gun goes for a drone that is out, then the trailer, then the hull', () => {
    const w = world(true);
    const b = w.behemoth;
    const t = b.trailer!;
    expect(gunTarget(w, { x: b.x + 100, y: b.y }, 'support')).toMatchObject({ x: t.x, y: t.y });
    expect(gunTarget(w, { x: b.x + 100, y: b.y }, 'behemoth')).toMatchObject({ x: b.x, y: b.y });
    w.drones.push({ id: 999, bay: 0, x: b.x - 5, y: b.y + 30, heading: 0, hp: 10, radius: 3, task: 'repair', target: null, spot: 0, working: false, alive: true });
    expect(gunTarget(w, { x: b.x + 100, y: b.y }, 'support')).toMatchObject({ x: b.x - 5, y: b.y + 30 });
    const bare = world();
    expect(gunTarget(bare, { x: 0, y: 0 }, 'support')).toMatchObject({ x: bare.behemoth.x, y: bare.behemoth.y });
  });

  it('survives a ram at cruise: hurt by impact and ram gear, shoved aside, the Behemoth pays a heavy ram', () => {
    const w = world();
    const b = w.behemoth;
    const e = parked(w, b.chassis.length / 2 + 6, 6, false);
    const armor = b.armor.frontLeft.hp + b.armor.frontRight.hp;
    const speed = b.vx;
    let rams = 0;
    for (let i = 0; i < 90 && e.alive; i++) {
      steps(w, 1);
      rams += w.events.filter((ev) => ev.type === 'collision' && ev.obstacle === 'heavy').length;
      w.events.length = 0;
    }
    expect(e.alive).toBe(true);
    expect(rams).toBe(1);
    const expected = DEF.ramDamage! * (speed / b.chassis.speed.cruise) * (1 + RAM.gearDamage * ramRating(b));
    expect(DEF.hp - e.hp).toBeCloseTo(expected, 0);
    // Off to the side it was on, clear of the hull.
    expect(e.y).toBeGreaterThan(b.y + b.chassis.width / 2);
    expect(b.armor.frontLeft.hp + b.armor.frontRight.hp).toBeLessThan(armor);
    expect(OBSTACLE_CLASSES[DEF.obstacle].speedDip).toBeGreaterThan(0);
  });

  it('a ram that finishes it crushes it', () => {
    const w = world();
    const b = w.behemoth;
    const e = parked(w, b.chassis.length / 2 + 6, 6, false);
    e.hp = 5;
    steps(w, 30);
    expect(e.alive).toBe(false);
    expect(w.stats.kills).toBe(1);
  });

  it('is called out once, the first time it comes into view', () => {
    const w = world();
    parked(w, 150, 40, false);
    steps(w, 1);
    expect(w.events.filter((ev) => ev.type === 'sighted')).toHaveLength(1);
    w.events.length = 0;
    steps(w, 30);
    expect(w.events.filter((ev) => ev.type === 'sighted')).toHaveLength(0);
  });

  it('an armored fist fields it (and combined arms, rarely); its front is nearly proof', () => {
    expect(DOCTRINES.armoredFist.mix.siegeTank).toBeGreaterThan(0);
    expect(DOCTRINES.combined.mix.siegeTank ?? 0).toBeLessThan(DOCTRINES.armoredFist.mix.siegeTank!);
    expect(DEF.facing!.front).toBeLessThan(ENEMIES.heavyTank.facing!.front);
  });
});
