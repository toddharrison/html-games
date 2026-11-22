import { DETONATION, MASS } from '../../src/content/tuning';
import { describe, expect, it } from 'vitest';
import { CHASSIS, type ChassisDef } from '../../src/content/chassis';
import { WEAPONS } from '../../src/content/weapons';
import {
  applyHit,
  canSelfDestruct,
  createBehemoth,
  damageComponent,
  pickInternal,
  reloadScale,
  stepSelfDestruct,
  turretTraverseScale,
  hitArc,
  hullSide,
  IDLE_COMMAND,
  lateralLimit,
  loadMass,
  massCapacity,
  massScale,
  mountPosition,
  mountWorldAngle,
  speedLimits,
  stepMovement,
  stepTurrets,
  treadSpeedScale,
  turretWorldAngle,
  type PlayerCommand,
} from '../../src/sim/behemoth';
import type { SimEvent } from '../../src/sim/events';
import { SIM_DT } from '../../src/sim/loop';
import { Rng } from '../../src/sim/rng';

const FIELD = 256;
const c = CHASSIS.class2;

function make() {
  return createBehemoth(c, { turret: WEAPONS.heavyCannon }, 100, FIELD / 2);
}

function run(b: ReturnType<typeof make>, cmd: Partial<PlayerCommand>, seconds: number) {
  const full = { ...IDLE_COMMAND, ...cmd };
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) stepMovement(b, full, SIM_DT, FIELD);
}

describe('Behemoth movement', () => {
  it('starts and settles at cruise speed with no input', () => {
    const b = make();
    run(b, {}, 5);
    expect(b.vx).toBeCloseTo(speedLimits(b).cruise, 5);
  });

  it('surges toward top speed gradually (momentum)', () => {
    const b = make();
    const lim = speedLimits(b);
    run(b, { throttle: 1 }, 0.5);
    expect(b.vx).toBeGreaterThan(lim.cruise);
    expect(b.vx).toBeLessThan(lim.top);
    run(b, { throttle: 1 }, 10);
    expect(b.vx).toBeCloseTo(lim.top, 5);
  });

  it('drifts back to cruise after a surge is released', () => {
    const b = make();
    run(b, { throttle: 1 }, 10);
    run(b, {}, 10);
    expect(b.vx).toBeCloseTo(speedLimits(b).cruise, 5);
  });

  it('brakes only down to minimum speed, never stops or reverses', () => {
    const b = make();
    const x0 = b.x;
    run(b, { throttle: -1 }, 30);
    expect(b.vx).toBeCloseTo(speedLimits(b).min, 5);
    expect(b.x).toBeGreaterThan(x0);
  });

  it('steers laterally and stays inside the field', () => {
    const b = make();
    run(b, { steer: 1 }, 1);
    expect(b.vy).toBeGreaterThan(0);
    expect(b.heading).toBeGreaterThan(0);
    run(b, { steer: 1 }, 30);
    expect(b.y).toBeCloseTo(FIELD - c.width / 2, 5);
    expect(b.vy).toBe(0);
    run(b, { steer: -1 }, 30);
    expect(b.y).toBeCloseTo(c.width / 2, 5);
  });

  it('eases into and out of a turn (no snap in sideways acceleration)', () => {
    const b = make();
    const jerkStep = c.lateral.jerk * SIM_DT;
    let prevA = 0;
    for (let i = 0; i < 240; i++) {
      stepMovement(b, { ...IDLE_COMMAND, steer: i < 120 ? 1 : 0 }, SIM_DT, FIELD);
      expect(Math.abs(b.ay - prevA)).toBeLessThanOrEqual(jerkStep + 1e-9);
      expect(Math.abs(b.ay)).toBeLessThanOrEqual(c.lateral.accel + 1e-9);
      prevA = b.ay;
    }
    expect(b.vy).toBe(0); // settled straight, not overshooting into a counter-turn
    expect(b.heading).toBe(0);
  });

  it('straightens out before the field edge instead of snapping square', () => {
    const b = make();
    let biggest = 0;
    for (let i = 0; i < 900; i++) {
      const before = b.vy;
      stepMovement(b, { ...IDLE_COMMAND, steer: 1 }, SIM_DT, FIELD);
      biggest = Math.max(biggest, Math.abs(b.vy - before));
    }
    expect(b.y).toBeCloseTo(FIELD - c.width / 2, 1);
    expect(biggest).toBeLessThanOrEqual(c.lateral.accel * SIM_DT + 1e-9);
  });

  it('caps lateral speed relative to forward speed', () => {
    const b = make();
    run(b, { throttle: -1, steer: 1 }, 2);
    expect(Math.abs(b.vy)).toBeLessThanOrEqual(b.vx * c.lateral.maxRatio + 1e-9);
  });
});

describe('tread integrity scaling', () => {
  it('scales all speeds toward zero, gradually', () => {
    expect(treadSpeedScale(1)).toBe(1);
    expect(treadSpeedScale(0)).toBe(0);
    let prev = 0;
    for (let i = 1; i <= 10; i++) {
      const k = treadSpeedScale(i / 10);
      expect(k).toBeGreaterThan(prev);
      expect(k - prev).toBeLessThan(0.2); // no cliff
      prev = k;
    }
  });

  it('a damaged Behemoth settles at a lower cruise', () => {
    const b = make();
    b.treads.hp = b.treads.max * 0.5;
    run(b, {}, 10);
    expect(b.vx).toBeCloseTo(speedLimits(b).cruise, 5);
    const healthy = make();
    expect(b.vx).toBeLessThan(speedLimits(healthy).cruise);
    expect(speedLimits(b).min).toBeLessThan(speedLimits(healthy).min);
  });

  it('immobilized means it grinds to a halt and cannot steer', () => {
    const b = make();
    b.treads.hp = 0;
    b.immobilized = true;
    run(b, { throttle: 1, steer: 1 }, 10);
    expect(b.vx).toBe(0);
    expect(b.vy).toBe(0);
  });
});

describe('mass and tread capacity', () => {
  const loaded = (extra: Record<string, keyof typeof WEAPONS>) => {
    const ids = { ...c.loadout, ...extra };
    return createBehemoth(c, Object.fromEntries(Object.entries(ids).map(([slot, id]) => [slot, WEAPONS[id]])), 100, FIELD / 2);
  };

  it('is exactly the rated speed at capacity, gently faster below, steeply slower above', () => {
    expect(massScale(280, 280)).toBe(1);
    expect(massScale(0, 280)).toBeCloseTo(1 + MASS.underload, 9);
    // Below capacity: adding 10% of the rating costs 1.5%; above it, the same costs 20%.
    expect(massScale(196, 280) - massScale(224, 280)).toBeCloseTo(MASS.underload * 0.1, 9);
    expect(massScale(280, 280) - massScale(308, 280)).toBeCloseTo(MASS.overload * 0.1, 9);
    let prev = Infinity;
    for (let m = 0; m <= 600; m += 20) {
      const k = massScale(m, 280);
      expect(k).toBeLessThanOrEqual(prev);
      expect(k).toBeGreaterThanOrEqual(MASS.floor);
      prev = k;
    }
    expect(massScale(10_000, 280)).toBe(MASS.floor);
  });

  it('the starting loadout fits within the tread capacity', () => {
    const b = loaded({});
    expect(loadMass(b)).toBe(245);
    expect(loadMass(b)).toBeLessThan(massCapacity(b));
    expect(speedLimits(b).cruise).toBeGreaterThan(c.speed.cruise);
  });

  it('a wrecked weapon still weighs; an empty slot does not', () => {
    const b = loaded({});
    const before = loadMass(b);
    damageComponent(b, 'prow', 1000, []);
    expect(loadMass(b)).toBe(before);
    b.hardpoints.find((h) => h.slot.id === 'prow')!.weapon = null;
    expect(loadMass(b)).toBe(before - WEAPONS.autocannon.mass!);
  });

  it('an overloaded Behemoth is slower, accelerates and steers more weakly', () => {
    const light = loaded({});
    const heavy = loaded({ turret: 'siegeHowitzer', prow: 'bunkerBuster', spine: 'mortar' });
    expect(loadMass(heavy)).toBeGreaterThan(massCapacity(heavy));
    expect(speedLimits(heavy).cruise).toBeLessThan(speedLimits(light).cruise * 0.85);
    expect(lateralLimit(heavy)).toBeLessThan(lateralLimit(light));
    // Both start at their own cruise; the heavy one gains less speed in the same surge.
    expect(heavy.vx).toBeCloseTo(speedLimits(heavy).cruise, 9);
    run(light, { throttle: 1 }, 1);
    run(heavy, { throttle: 1 }, 1);
    expect(heavy.vx - speedLimits(heavy).cruise).toBeLessThan(light.vx - speedLimits(light).cruise);
  });

  it('mass and tread damage stack', () => {
    const b = loaded({ turret: 'siegeHowitzer', prow: 'bunkerBuster' });
    const healthy = speedLimits(b).cruise;
    b.treads.hp = b.treads.max / 2;
    expect(speedLimits(b).cruise).toBeCloseTo(healthy * treadSpeedScale(0.5), 9);
  });
});

describe('turret', () => {
  it('traverses toward the aim point at a limited rate', () => {
    const b = make();
    // Aim straight "up" (-y): a 90° turn.
    const ring = b.turrets[0]!;
    stepTurrets(b, b.x, b.y - 100, 0.5);
    const rate = (ring.def.traverseDegPerSec * Math.PI) / 180;
    expect(Math.abs(ring.angle)).toBeCloseTo(rate * 0.5, 5);
    for (let i = 0; i < 300; i++) stepTurrets(b, b.x + ring.def.pivot.x, b.y - 100, SIM_DT);
    expect(turretWorldAngle(b, ring)).toBeCloseTo(-Math.PI / 2, 3);
  });

  it('takes the shortest way around', () => {
    const b = make();
    const ring = b.turrets[0]!;
    ring.angle = Math.PI * 0.9;
    stepTurrets(b, b.x - 100, b.y + 30, SIM_DT); // target just past PI
    expect(ring.angle).toBeGreaterThan(Math.PI * 0.9 - 0.01);
  });

  // A test chassis with a second, faster ring aft, and a coaxial slot offset to the main ring's right.
  const twin: ChassisDef = {
    ...c,
    turrets: [...c.turrets, { id: 'aft', pivot: { x: -10, y: 0 }, traverseDegPerSec: 150, slot: 'aftGun' }],
    hardpoints: [
      ...c.hardpoints,
      { ...c.hardpoints[0]!, id: 'aftGun', name: 'Aft', mount: { x: -10, y: 0 }, ring: 'aft' },
      { ...c.hardpoints[0]!, id: 'coax', name: 'Coax', size: 'M', mount: { x: 4, y: 3 }, ring: 'main' },
    ],
  };

  it('each ring traverses at its own rate; its slots turn with it', () => {
    const b = createBehemoth(twin, { turret: WEAPONS.heavyCannon, aftGun: WEAPONS.heavyCannon }, 100, FIELD / 2);
    const [main, aft] = b.turrets;
    stepTurrets(b, b.x, b.y - 100, 0.25);
    expect(Math.abs(aft!.angle)).toBeCloseTo(2 * Math.abs(main!.angle), 5);
    const coax = b.hardpoints.find((h) => h.slot.id === 'coax')!;
    expect(mountWorldAngle(b, coax)).toBeCloseTo(turretWorldAngle(b, main!), 9);
    // Turned 90° to the left, the coax (3 to the right of the pivot) now sits 3 ahead of it.
    main!.angle = -Math.PI / 2;
    const p = mountPosition(b, coax);
    expect(p.x).toBeCloseTo(b.x + 4 + 3, 9);
    expect(p.y).toBeCloseTo(b.y, 9);
  });

  it('a destroyed main slot sticks only its own ring', () => {
    const b = createBehemoth(twin, { turret: WEAPONS.heavyCannon, aftGun: WEAPONS.heavyCannon }, 100, FIELD / 2);
    b.hardpoints.find((h) => h.slot.id === 'aftGun')!.integrity.hp = 0;
    stepTurrets(b, b.x, b.y - 100, 0.25);
    expect(b.turrets[1]!.angle).toBe(0);
    expect(b.turrets[0]!.angle).not.toBe(0);
  });
});

describe('hits', () => {
  const pose = (heading: number) => ({ x: 0, y: 0, heading });

  it('maps hit direction to armor arcs relative to the hull', () => {
    expect(hitArc(pose(0), 1, 0, 30, 5)).toBe('frontRight');
    expect(hitArc(pose(0), 1, 0, 30, -5)).toBe('frontLeft');
    expect(hitArc(pose(0), -1, 0, -30, 5)).toBe('rear');
    expect(hitArc(pose(0), 0, 1, 0, 20)).toBe('right');
    expect(hitArc(pose(0), 0, -1, 0, -20)).toBe('left');
    // Turned 90° to +y: a shot from +y is now frontal, and +x is the hull's left.
    expect(hitArc(pose(Math.PI / 2), 0, 1, 5, 30)).toBe('frontLeft');
    expect(hitArc(pose(Math.PI / 2), 0, 1, -5, 30)).toBe('frontRight');
  });

  it('a front hit dead on the centerline goes to the side it came from', () => {
    expect(hitArc(pose(0), 1, 0.2, 30, 0)).toBe('frontRight');
    expect(hitArc(pose(0), 1, -0.2, 30, 0)).toBe('frontLeft');
  });

  it('angling the hull puts fire from straight ahead on its leading corner', () => {
    // Nose turned 20° to the right: a round from ahead striking the nose box at center or a little
    // right of it lands on the front-left, the corner swung forward.
    for (const y of [-4, 0, 4, 8]) expect(hitArc(pose(0.35), 1, 0, 32, y)).toBe('frontLeft');
    for (const y of [-8, -4, 0, 4]) expect(hitArc(pose(-0.35), 1, 0, 32, y)).toBe('frontRight');
  });

  it('hullSide measures across the hull in hull space', () => {
    expect(hullSide({ x: 10, y: 10, heading: 0 }, 50, 13)).toBeCloseTo(3);
    expect(hullSide({ x: 0, y: 0, heading: Math.PI / 2 }, 4, 50)).toBeCloseTo(-4);
  });

  it('armor absorbs damage first; only the overflow reaches an internal component', () => {
    const b = make();
    const events: SimEvent[] = [];
    b.armor.rear.hp = 5;
    applyHit(b, 'rear', 12, new Rng(1), events, 0, 0);
    expect(b.armor.rear.hp).toBe(0);
    const internal = events.filter((e) => e.type === 'componentDamaged');
    expect(internal).toHaveLength(1);
    expect(internal[0]!.type === 'componentDamaged' && internal[0]!.amount).toBe(7);
    expect(events.some((e) => e.type === 'behemothHit')).toBe(true);
  });

  it('intact armor stops the whole hit', () => {
    const b = make();
    const events: SimEvent[] = [];
    applyHit(b, 'frontLeft', 30, new Rng(1), events, 0, 0);
    expect(b.armor.frontLeft.hp).toBe(b.armor.frontLeft.max - 30);
    expect(b.armor.frontRight.hp).toBe(b.armor.frontRight.max);
    expect(events.some((e) => e.type === 'componentDamaged')).toBe(false);
  });

  it('picks internals by the arc exposure table (seeded), skipping empty and destroyed parts', () => {
    const b = make();
    const rng = new Rng(3);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 3000; i++) {
      const id = pickInternal(b, 'rear', rng);
      counts[id] = (counts[id] ?? 0) + 1;
    }
    // Rear: the reactor is the most exposed; sensors aren't reachable; empty slots never come up.
    expect(counts.reactor!).toBeGreaterThan(counts.treads!);
    expect(counts.sensors).toBeUndefined();
    expect(counts.spine).toBeUndefined();
    expect(counts.turret).toBeGreaterThan(0);

    b.reactor.hp = 0;
    b.treads.hp = 0;
    b.fireControl.hp = 0;
    b.magazine.hp = 0;
    for (let i = 0; i < 200; i++) expect(pickInternal(b, 'rear', rng)).toBe('turret');
  });

  it('is deterministic for a given seed', () => {
    const picks = (seed: number) => {
      const rng = new Rng(seed);
      return Array.from({ length: 50 }, () => pickInternal(make(), 'left', rng)).join();
    };
    expect(picks(9)).toBe(picks(9));
  });

  it('losing all tread integrity immobilizes', () => {
    const b = make();
    const events: SimEvent[] = [];
    damageComponent(b, 'treads', 1000, events);
    expect(b.treads.hp).toBe(0);
    expect(b.immobilized).toBe(true);
    expect(events.filter((e) => e.type === 'immobilized')).toHaveLength(1);
    expect(events.some((e) => e.type === 'componentDestroyed' && e.component === 'treads')).toBe(true);
  });

  it('destroying the reactor lights the fuse and stops the Behemoth driving', () => {
    const b = make();
    const events: SimEvent[] = [];
    damageComponent(b, 'reactor', 1000, events);
    expect(b.reactorFuse).toBe(c.reactor.fuse);
    expect(events.some((e) => e.type === 'reactorCritical')).toBe(true);
    run(b, { throttle: 1 }, 10);
    expect(b.vx).toBe(0);
  });
});

describe('component effects', () => {
  it('a damaged turret mount traverses and reloads slower; a destroyed one is stuck', () => {
    const b = make();
    const turret = b.hardpoints.find((h) => h.slot.id === 'turret')!;
    const ring = b.turrets[0]!;
    expect(turretTraverseScale(b, ring)).toBe(1);
    expect(reloadScale(turret)).toBe(1);
    turret.integrity.hp = turret.integrity.max / 2;
    expect(turretTraverseScale(b, ring)).toBeCloseTo(0.675);
    expect(reloadScale(turret)).toBeCloseTo(1.5);
    turret.integrity.hp = 0;
    const before = ring.angle;
    stepTurrets(b, b.x, b.y + 100, SIM_DT);
    expect(ring.angle).toBe(before);
  });
});

describe('self-destruct', () => {
  it('is only available when Immobilized or with the reactor critical', () => {
    const b = make();
    expect(canSelfDestruct(b)).toBe(false);
    b.reactor.hp = b.reactor.max * c.reactor.criticalAt;
    expect(canSelfDestruct(b)).toBe(true);
    b.reactor.hp = b.reactor.max;
    b.immobilized = true;
    expect(canSelfDestruct(b)).toBe(true);
  });

  it('needs the key held for the full delay; releasing resets it', () => {
    const b = make();
    b.immobilized = true;
    const events: SimEvent[] = [];
    const hold = (seconds: number, held: boolean) => {
      for (let i = 0; i < Math.round(seconds / SIM_DT); i++) stepSelfDestruct(b, held, SIM_DT, events);
    };
    hold(DETONATION.selfDestructHold * 0.8, true);
    hold(SIM_DT, false);
    expect(b.selfDestructHeld).toBe(0);
    expect(b.reactorFuse).toBeNull();
    hold(DETONATION.selfDestructHold + 0.1, true);
    expect(b.reactorFuse).not.toBeNull();
  });

  it('does nothing on a healthy, mobile Behemoth', () => {
    const b = make();
    const events: SimEvent[] = [];
    for (let i = 0; i < 300; i++) stepSelfDestruct(b, true, SIM_DT, events);
    expect(b.reactorFuse).toBeNull();
  });
});
