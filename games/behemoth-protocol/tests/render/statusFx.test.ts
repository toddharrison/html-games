import { describe, expect, it } from 'vitest';
import { CHASSIS } from '../../src/content/chassis';
import { WEAPONS } from '../../src/content/weapons';
import {
  armorStage,
  ARMOR_STAGES,
  BarrelHeat,
  ComponentFx,
  componentAnchors,
  damageLevel,
  heatColor,
  HEAT_COOL_PER_SEC,
  HEAT_PER_SHOT,
  hullToSim,
  visualLevel,
  UnitFx,
  type StatusEmitter,
} from '../../src/render/statusFx';
import { createBehemoth } from '../../src/sim/behemoth';
import { Rng } from '../../src/sim/rng';

const c = CHASSIS.class2;
const make = () =>
  createBehemoth(c, Object.fromEntries(Object.entries(c.loadout).map(([slot, id]) => [slot, WEAPONS[id]])), 100, 50);
const at = { x: 100, y: 50, heading: 0, turret: 0 };

function recorder() {
  const log: { kind: keyof StatusEmitter; x: number; y: number }[] = [];
  const out: StatusEmitter = {
    sparks: (x, y) => log.push({ kind: 'sparks', x, y }),
    smokePuff: (x, y) => log.push({ kind: 'smokePuff', x, y }),
    heavySmoke: (x, y) => log.push({ kind: 'heavySmoke', x, y }),
    flame: (x, y) => log.push({ kind: 'flame', x, y }),
    ember: (x, y) => log.push({ kind: 'ember', x, y }),
  };
  return { log, out };
}

function run(fx: ComponentFx, b: ReturnType<typeof make>, seconds: number, out: StatusEmitter) {
  for (let i = 0; i < seconds * 60; i++) fx.update(b, at, 1 / 60, out);
}

describe('damage levels', () => {
  it('match the HUD thresholds and reach destroyed at zero', () => {
    expect(damageLevel(1)).toBe('ok');
    expect(damageLevel(0.61)).toBe('ok');
    expect(damageLevel(0.6)).toBe('amber');
    expect(damageLevel(0.3)).toBe('red');
    expect(damageLevel(0.15)).toBe('critical');
    expect(damageLevel(0)).toBe('destroyed');
  });

  it('keeps destroyed core components burning, while weapons go to a smoldering stub', () => {
    expect(visualLevel(0, true)).toBe('critical');
    expect(visualLevel(0, false)).toBe('destroyed');
  });

  it('wears armor through every stage from clean to battered', () => {
    expect(armorStage(1)).toBe(0);
    expect(armorStage(0.8)).toBe(0);
    expect(armorStage(0.79)).toBe(1);
    expect(armorStage(0.6)).toBe(1);
    expect(armorStage(0.59)).toBe(2);
    expect(armorStage(0)).toBe(ARMOR_STAGES);
  });
});

describe('barrel heat', () => {
  it('builds under sustained fire, caps at 1, and cools off', () => {
    const heat = new BarrelHeat();
    // The main cannon at its full rate (1.5 s reload) for 30 s.
    for (let t = 0; t < 30; t += 1.5) {
      heat.onFire('turret', 'heavyCannon');
      heat.step(1.5);
    }
    expect(heat.get('turret')).toBeGreaterThan(0.6);
    heat.onFire('turret', 'heavyCannon');
    for (let i = 0; i < 10; i++) heat.onFire('turret', 'heavyCannon');
    expect(heat.get('turret')).toBe(1);
    heat.step(1 / HEAT_COOL_PER_SEC);
    expect(heat.get('turret')).toBe(0);
  });

  it('stays cool after a single shot, and ignores weapons that do not heat', () => {
    const heat = new BarrelHeat();
    heat.onFire('turret', 'heavyCannon');
    expect(heat.get('turret')).toBe(HEAT_PER_SHOT.heavyCannon);
    heat.onFire('spine', 'missileRack');
    expect(heat.get('spine')).toBe(0);
  });

  it('goes from dull red to bright orange', () => {
    const red = (c: number) => c >> 16;
    const green = (c: number) => (c >> 8) & 0xff;
    expect(red(heatColor(1))).toBeGreaterThan(red(heatColor(0.2)));
    expect(green(heatColor(1))).toBeGreaterThan(green(heatColor(0.2)) + 60);
  });
});

describe('component effects', () => {
  it('gives off nothing while every component is healthy', () => {
    const { log, out } = recorder();
    run(new ComponentFx(), make(), 5, out);
    expect(log).toHaveLength(0);
  });

  it('escalates from sparks to smoke to fire as integrity drops', () => {
    const kinds = (frac: number) => {
      const b = make();
      b.sensors.hp = b.sensors.max * frac;
      const { log, out } = recorder();
      const rng = new Rng(7);
      run(new ComponentFx(() => rng.next()), b, 10, out);
      return new Set(log.map((e) => e.kind));
    };
    expect(kinds(0.5)).toEqual(new Set(['sparks', 'smokePuff']));
    expect(kinds(0.25)).toEqual(new Set(['sparks', 'smokePuff', 'heavySmoke']));
    expect(kinds(0.1)).toEqual(new Set(['sparks', 'smokePuff', 'heavySmoke', 'flame', 'ember']));
  });

  it('emits from where the damaged component sits on the hull', () => {
    const b = make();
    b.reactor.hp = b.reactor.max * 0.2;
    const rng = new Rng(3);
    const { log, out } = recorder();
    run(new ComponentFx(() => rng.next()), b, 5, out);
    expect(log.length).toBeGreaterThan(0);
    const [reactor] = componentAnchors(b, 'reactor');
    for (const e of log) {
      expect(Math.abs(e.x - (at.x + reactor!.x))).toBeLessThanOrEqual(1.5);
      expect(Math.abs(e.y - (at.y + reactor!.y))).toBeLessThanOrEqual(1.5);
    }
  });

  it('keeps a destroyed weapon smoldering', () => {
    const b = make();
    b.hardpoints.find((h) => h.slot.id === 'prow')!.integrity.hp = 0;
    const { log, out } = recorder();
    run(new ComponentFx(), b, 5, out);
    expect(log.length).toBeGreaterThan(0);
    expect(new Set(log.map((e) => e.kind))).toEqual(new Set(['smokePuff', 'heavySmoke']));
  });

  it('maps hull points through the hull heading', () => {
    const p = hullToSim({ x: 10, y: 20, heading: Math.PI / 2, turret: 0 }, { x: 5, y: 0 });
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(25);
  });
});

describe('enemy vehicle damage effects', () => {
  const unit = (frac: number) => ({ id: 1, x: 40, y: 30, frac, radius: 7 });
  const runUnits = (fx: UnitFx, frac: number, seconds: number, out: StatusEmitter) => {
    for (let i = 0; i < seconds * 60; i++) fx.update([unit(frac)], 1 / 60, out);
  };

  it('stays quiet on a healthy vehicle', () => {
    const { log, out } = recorder();
    runUnits(new UnitFx(), 0.9, 5, out);
    expect(log).toHaveLength(0);
  });

  it('escalates to smoke and fire as the vehicle is worn down, around the hull', () => {
    const kinds = (frac: number) => {
      const rng = new Rng(5);
      const { log, out } = recorder();
      runUnits(new UnitFx(() => rng.next()), frac, 10, out);
      for (const e of log) {
        expect(Math.abs(e.x - 40)).toBeLessThanOrEqual(7);
        expect(Math.abs(e.y - 30)).toBeLessThanOrEqual(7);
      }
      return new Set(log.map((e) => e.kind));
    };
    expect(kinds(0.5)).toEqual(new Set(['sparks', 'smokePuff']));
    expect(kinds(0.25).has('heavySmoke')).toBe(true);
    expect(kinds(0.1)).toEqual(new Set(['sparks', 'smokePuff', 'heavySmoke', 'flame', 'ember']));
  });

  it('stops emitting for a unit that is gone', () => {
    const fx = new UnitFx();
    const { log, out } = recorder();
    runUnits(fx, 0.1, 1, out);
    const n = log.length;
    for (let i = 0; i < 60; i++) fx.update([], 1 / 60, out);
    expect(log.length).toBe(n);
  });
});
