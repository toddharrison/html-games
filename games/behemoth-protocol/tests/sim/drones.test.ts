import { DEPOT } from '../../src/content/tuning';
import { describe, expect, it } from 'vitest';
import type { AddonId } from '../../src/content/addons';
import { DEPOT_MODULES } from '../../src/content/depot';
import { TRAILER_MODULES, type DroneBayModule, type ModuleId } from '../../src/content/trailer';
import { WEAPONS } from '../../src/content/weapons';
import { component, damageComponent, IDLE_COMMAND, type PlayerCommand } from '../../src/sim/behemoth';
import { applyAction, openDepot, quote } from '../../src/sim/depot';
import { damageDrone } from '../../src/sim/drones';
import { newRun, restoreBehemoth, snapshotBehemoth, type RunState } from '../../src/sim/run';
import { trailerBlast } from '../../src/sim/trailer';
import { spawnProjectile } from '../../src/sim/weapons';
import { createWorld, stepWorld, type World } from '../../src/sim/world';

const D = TRAILER_MODULES.droneBay as DroneBayModule;
const OPTS = { seed: 1, frameWidth: 480, fieldRows: 21 };

function world(bays: (ModuleId | null)[] = ['droneBay'], addons: AddonId[] = ['trailer']): World {
  const w = createWorld({ ...OPTS, behemoth: newRun(1, 'class2', addons, {}, bays).behemoth });
  w.encounter.off = true;
  w.behemoth.autoEnabled.fill(false);
  return w;
}

function steps(w: World, n: number, cmd: Partial<PlayerCommand> = {}) {
  for (let i = 0; i < n; i++) stepWorld(w, { ...IDLE_COMMAND, aimX: w.behemoth.x + 200, aimY: w.behemoth.y, ...cmd });
}

const treads = (w: World) => component(w.behemoth, 'treads')!;
const bay = (w: World) => w.behemoth.trailer!.bays[0]!;
const events = (w: World, type: string) => w.events.filter((e) => e.type === type);

describe('repair drones', () => {
  it('stay docked until the treads are worn, then patch them from the pool and fly home', () => {
    const w = world();
    damageComponent(w.behemoth, 'treads', 5, w.events);
    steps(w, 30);
    expect(w.drones).toHaveLength(0); // 95%: not worth a sortie
    damageComponent(w.behemoth, 'treads', 25, w.events); // 70%
    steps(w, 1);
    expect(w.drones).toHaveLength(D.drones);
    steps(w, 60 * 20);
    // Driving wears the treads too (crushing trees), so the drones may have patched a bit more.
    expect(treads(w).hp).toBeCloseTo(treads(w).max, 3);
    expect(D.pool - bay(w).pool).toBeGreaterThanOrEqual(30);
    expect(bay(w).pool).toBeGreaterThan(0);
    expect(w.drones).toHaveLength(0);
    expect(bay(w).loads).toBe(D.drones);
  });

  it('patch no more than the pool each battle; the next battle starts with a full one', () => {
    const w = world();
    damageComponent(w.behemoth, 'treads', 80, w.events);
    let patched = 0;
    for (let i = 0; i < 60 * 40; i++) {
      const before = treads(w).hp;
      steps(w, 1);
      patched += Math.max(0, treads(w).hp - before);
    }
    expect(patched).toBeCloseTo(D.pool, 0); // net of wear in the same steps
    expect(bay(w).pool).toBe(0);
    expect(treads(w).hp).toBeLessThan(treads(w).max);
    expect(w.drones).toHaveLength(0);
    const next = restoreBehemoth(snapshotBehemoth(w.behemoth), 0, 0);
    expect(next.trailer!.bays[0]!.pool).toBe(D.pool);
  });

  it('work on the most worn tread set', () => {
    const w = world(['droneBay'], ['trailer', 'outerTreads']);
    damageComponent(w.behemoth, 'treads', 20, w.events);
    damageComponent(w.behemoth, 'outerTreads', 50, w.events);
    steps(w, 1);
    expect(w.drones.every((d) => d.target === 'outerTreads')).toBe(true);
  });

  it('drain power while they are out, and hover idle with the capacitor dry', () => {
    const run = (worn: boolean) => {
      const w = world();
      if (worn) damageComponent(w.behemoth, 'treads', 30, w.events);
      w.behemoth.power.stored = 0;
      steps(w, 60);
      return w.behemoth.power.stored;
    };
    expect(run(false) - run(true)).toBeCloseTo(D.drones * D.power, 1);

    const w = world();
    const b = w.behemoth;
    b.chassis = { ...b.chassis, reactor: { ...b.chassis.reactor, output: 0 } };
    b.power.stored = 0;
    damageComponent(b, 'treads', 30, w.events);
    steps(w, 60 * 5);
    expect(w.drones).toHaveLength(D.drones);
    expect(treads(w).hp).toBe(70);
    expect(w.drones.some((d) => d.working)).toBe(false);
  });

  it('an enemy round that reaches a drone hits it, not the hull; lost drones stay lost', () => {
    const w = world();
    const b = w.behemoth;
    damageComponent(b, 'treads', 30, w.events);
    steps(w, 60 * 2);
    const d = w.drones[0]!;
    const armor = { ...b.armor.left };
    const right = { ...b.armor.right };
    // A heavy round coming at it from just beside it, from outside the hull.
    const side = d.y < b.y ? -1 : 1;
    const spec = WEAPONS.heavyTankGun.projectile;
    const lead = !('speed' in spec) ? 0 : (30 / spec.speed) * b.vx; // the drone keeps pace with the hull
    spawnProjectile(w, 'enemy', WEAPONS.heavyTankGun, d.x + lead, d.y + side * 30, side < 0 ? Math.PI / 2 : -Math.PI / 2);
    w.events.length = 0;
    steps(w, 30);
    expect(events(w, 'droneLost')).toHaveLength(1);
    expect(bay(w).loads).toBe(D.drones - 1);
    expect(b.armor.left.hp).toBe(armor.hp);
    expect(b.armor.right.hp).toBe(right.hp);
    expect(snapshotBehemoth(b).trailer!.bays[0]!.loads).toBe(D.drones - 1);
  });

  it('a wrecked bay takes its drones with it; so does a trailer blast', () => {
    const w = world();
    damageComponent(w.behemoth, 'treads', 30, w.events);
    steps(w, 30);
    damageComponent(w.behemoth, 'bay0', 999, w.events);
    steps(w, 1);
    expect(w.drones).toHaveLength(0);
    expect(bay(w).loads).toBe(0);
  });

  it('add to the trailer blast by how many are left', () => {
    const w = world();
    const full = trailerBlast(w.behemoth, w.behemoth.trailer!);
    bay(w).loads = 0;
    const empty = trailerBlast(w.behemoth, w.behemoth.trailer!);
    expect(full.radius - empty.radius).toBeCloseTo(D.blast.radius);
  });
});

describe('the revive', () => {
  function immobilize(w: World) {
    damageComponent(w.behemoth, 'treads', 999, w.events);
  }

  it('Immobilized, the drones swarm the treads; done, the treads turn again and the last stand is over', () => {
    const w = world();
    immobilize(w);
    steps(w, 1);
    expect(w.lastStand).not.toBeNull();
    expect(events(w, 'reviveStarted')).toHaveLength(1);
    expect(w.drones).toHaveLength(D.drones);
    let t = 0;
    while (w.behemoth.immobilized && t < 60 * 20) {
      steps(w, 1);
      t++;
    }
    expect(w.behemoth.immobilized).toBe(false);
    expect(w.lastStand).toBeNull();
    expect(w.revived).toBe(true);
    expect(events(w, 'revived')).toHaveLength(1);
    expect(treads(w).hp).toBeCloseTo(treads(w).max * D.revive.fraction, 3);
    // About the work time with every drone on it, plus the flight over.
    expect(t / 60).toBeGreaterThan(D.revive.work / D.drones);
    expect(t / 60).toBeLessThan(D.revive.work / D.drones + 2);
    // It moves again, and the camera follows.
    const x = w.behemoth.x;
    steps(w, 60 * 3);
    expect(w.behemoth.x).toBeGreaterThan(x + 5);
  });

  it('works once a battle', () => {
    const w = world();
    immobilize(w);
    steps(w, 60 * 10);
    expect(w.revived).toBe(true);
    w.events.length = 0;
    immobilize(w);
    steps(w, 60 * 10);
    expect(w.behemoth.immobilized).toBe(true);
    expect(events(w, 'reviveStarted')).toHaveLength(0);
    expect(w.lastStand).not.toBeNull();
  });

  it('fails if every drone is shot down first', () => {
    const w = world();
    immobilize(w);
    steps(w, 60);
    for (const d of [...w.drones]) damageDrone(w, d, 999);
    steps(w, 1);
    expect(events(w, 'reviveFailed')).toHaveLength(1);
    steps(w, 60 * 10);
    expect(w.behemoth.immobilized).toBe(true);
    expect(w.revive).toBeNull();
  });

  it('needs drones: an empty bay does nothing', () => {
    const w = world();
    bay(w).loads = 0;
    immobilize(w);
    steps(w, 60 * 10);
    expect(w.behemoth.immobilized).toBe(true);
    expect(events(w, 'reviveStarted')).toHaveLength(0);
  });
});

describe('drone bays at the depot', () => {
  it('replace lost drones as a rearm, priced per drone', () => {
    const run: RunState = newRun(1, 'class2', ['trailer'], {}, ['droneBay']);
    run.behemoth.trailer!.bays[0]!.loads = 0;
    run.depot = openDepot(run, run.behemoth);
    run.salvage = 1000;
    const q = quote(run, { kind: 'rearm', slot: 'bay0' });
    expect(q).toEqual({ ok: true, salvage: DEPOT.rearmBase + D.drones * DEPOT_MODULES.droneBay.loadPrice!, actions: 1 });
    const after = applyAction(run, { kind: 'rearm', slot: 'bay0' });
    expect(after.behemoth.trailer!.bays[0]!.loads).toBe(D.drones);
  });
});
