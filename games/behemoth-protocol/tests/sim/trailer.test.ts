import { DEPOT, MASS, TRAILER_MINE } from '../../src/content/tuning';
import { describe, expect, it } from 'vitest';
import { ADDONS, type TrailerAddon } from '../../src/content/addons';
import { CHASSIS } from '../../src/content/chassis';
import { DEPOT_ADDONS, DEPOT_MODULES } from '../../src/content/depot';
import { TRAILER_MODULES, type ModuleId } from '../../src/content/trailer';
import { WEAPONS } from '../../src/content/weapons';
import { parseRun, serializeRun } from '../../src/save/runSave';
import {
  bayOf,
  capacitorSize,
  createBehemoth,
  damageComponent,
  hitchPoint,
  IDLE_COMMAND,
  igniteReactor,
  loadMass,
  powerOutput,
  reactorOutput,
  speedLimits,
  type BehemothState,
  type PlayerCommand,
} from '../../src/sim/behemoth';
import { applyAction, fits, loadOf, openDepot, quote } from '../../src/sim/depot';
import { spawnEnemy } from '../../src/sim/enemies';
import type { Enemy } from '../../src/sim/entities';
import { newRun, restoreBehemoth, snapshotBehemoth, type RunState } from '../../src/sim/run';
import { trailerBlast } from '../../src/sim/trailer';
import { spawnProjectile } from '../../src/sim/weapons';
import { createWorld, stepWorld, type World } from '../../src/sim/world';

const c = CHASSIS.class2;
const T = ADDONS.trailer as TrailerAddon;
const OPTS = { seed: 1, frameWidth: 480, fieldRows: 21 };

function make(bays: (ModuleId | null)[] = [], addons: ('trailer' | 'outerTreads')[] = ['trailer']): BehemothState {
  const loadout = Object.fromEntries(Object.entries(c.loadout).map(([slot, id]) => [slot, WEAPONS[id]]));
  return createBehemoth(c, loadout, 300, 168, addons, bays);
}

function world(bays: (ModuleId | null)[] = []): World {
  const w = createWorld({ ...OPTS, behemoth: newRun(1, 'class2', ['trailer'], {}, bays).behemoth });
  w.encounter.off = true;
  w.behemoth.autoEnabled.fill(false);
  return w;
}

function steps(w: World, n: number, cmd: Partial<PlayerCommand> = {}) {
  for (let i = 0; i < n; i++) stepWorld(w, { ...IDLE_COMMAND, aimX: w.behemoth.x + 200, aimY: w.behemoth.y, ...cmd });
}

/** A unit that holds still and never fires. */
function parked(w: World, x: number, y: number, id: 'lightTank' | 'heavyTank' = 'lightTank'): Enemy {
  const e = spawnEnemy(w, id, x, y);
  e.def = { ...e.def, maxSpeed: 0, accel: 0, fireRange: 0 };
  e.vx = 0;
  return e;
}

const trailer = (b: BehemothState) => b.trailer!;
const events = (w: World, type: string) => w.events.filter((e) => e.type === type);

describe('the trailer on the Behemoth', () => {
  it('sits behind the hitch with its bays; pods add a hardpoint with their own launcher', () => {
    const b = make(['missilePod', 'ammoBunker']);
    const t = trailer(b);
    const h = hitchPoint(b);
    expect(t.status).toBe('hitched');
    expect(t.x).toBeCloseTo(h.x - T.towBar - T.length / 2);
    expect(t.y).toBeCloseTo(b.y);
    expect(t.bays.map((bay) => bay?.def.id ?? null)).toEqual(['missilePod', 'ammoBunker']);
    const pod = b.hardpoints.find((hp) => hp.slot.id === 'bay0')!;
    expect(pod.slot.position).toBe('trailer');
    expect(pod.weapon?.id).toBe('podMissiles');
    expect(pod.ammo).toBe(WEAPONS.podMissiles.ammo);
    // The pod's integrity is its hardpoint's; the frame's is the add-on's.
    expect(bayOf(b, 0)!.integrity).toBe(pod.integrity);
    expect(t.frame).toBe(b.addons.find((a) => a.def.id === 'trailer')!.integrity);
    expect(b.hardpoints.some((hp) => hp.slot.id === 'bay1')).toBe(false);
  });

  it('bays are ignored without a trailer', () => {
    const b = make(['missilePod'], []);
    expect(b.trailer).toBeNull();
    expect(b.hardpoints.some((hp) => hp.slot.position === 'trailer')).toBe(false);
  });

  it('the treads feel the towed share of its mass, and none once it is gone', () => {
    const bare = make([], []);
    const b = make(['missilePod', 'ammoBunker']);
    const towed = MASS.towed * (T.mass + TRAILER_MODULES.missilePod.mass + TRAILER_MODULES.ammoBunker.mass);
    expect(loadMass(b)).toBeCloseTo(loadMass(bare) + towed);
    expect(speedLimits(b).cruise).toBeLessThan(speedLimits(bare).cruise);
    trailer(b).status = 'jettisoned';
    expect(loadMass(b)).toBeCloseTo(loadMass(bare));
  });

  it('an auxiliary generator adds output and capacitor while it works and is in tow', () => {
    const gen = TRAILER_MODULES.auxGenerator;
    const b = make(['auxGenerator']);
    expect(powerOutput(b)).toBeCloseTo(reactorOutput(b) + (gen.kind === 'generator' ? gen.output : 0));
    expect(capacitorSize(b)).toBe(c.reactor.capacitor + (gen.kind === 'generator' ? gen.capacitor : 0));
    expect(b.power.stored).toBe(capacitorSize(b));
    damageComponent(b, 'bay0', 1e9, []);
    expect(powerOutput(b)).toBeCloseTo(reactorOutput(b));
    expect(capacitorSize(b)).toBe(c.reactor.capacitor);
  });

  it('follows the hitch round a turn without ever swinging past its limit', () => {
    const w = world();
    const b = w.behemoth;
    const reach = T.towBar + T.length / 2;
    let swing = 0;
    for (let i = 0; i < 600; i++) {
      steps(w, 1, { steer: i < 300 ? 1 : -1 });
      const t = trailer(b);
      const h = hitchPoint(b);
      expect(Math.hypot(h.x - t.x, h.y - t.y)).toBeCloseTo(reach);
      swing = Math.max(swing, Math.abs(t.heading - b.heading));
    }
    expect(swing).toBeGreaterThan(0.05);
    expect(swing).toBeLessThanOrEqual((T.maxSwing * Math.PI) / 180 + 1e-9);
    // Straight on again, it lines up behind.
    steps(w, 300);
    expect(trailer(b).heading).toBeCloseTo(b.heading, 2);
  });
});

describe('hits on the trailer', () => {
  it('fire from behind hits the trailer first: its armor, not the hull', () => {
    const w = world();
    const b = w.behemoth;
    const t = trailer(b);
    const rear = b.armor.rear.hp;
    spawnProjectile(w, 'enemy', WEAPONS.lightTankGun, t.x - 60, t.y, 0);
    steps(w, 40);
    expect(t.armor.hp).toBeLessThan(T.armor);
    expect(b.armor.rear.hp).toBe(rear);
    expect(events(w, 'trailerHit').length).toBeGreaterThan(0);
  });

  it('wrecked while hitched it cooks off: enemies nearby, the rear armor, and the pods go with it', () => {
    const w = world(['missilePod', 'ammoBunker']);
    const b = w.behemoth;
    const t = trailer(b);
    const near = parked(w, t.x - 30, t.y + 20);
    const far = parked(w, t.x - 400, t.y);
    const big = trailerBlast(b, t);
    expect(big.radius).toBeGreaterThan(T.blast.radius);
    damageComponent(b, 'trailer', 1e9, w.events);
    const rear = b.armor.rear.hp;
    steps(w, 1);
    expect(t.status).toBe('wrecked');
    expect(near.alive).toBe(false);
    expect(far.alive).toBe(true);
    expect(b.armor.rear.hp).toBeLessThan(rear);
    expect(events(w, 'trailerBlast')).toHaveLength(1);
    // Gone for good: no mass, and the next battle starts without it.
    const s = snapshotBehemoth(b);
    expect(s.trailer).toBeNull();
    expect(s.addons.some((a) => a.id === 'trailer')).toBe(false);
    expect(s.hardpoints.some((h) => h.slot === 'bay0')).toBe(false);
  });

  it('the blast grows with what is left in it', () => {
    const b = make(['missilePod', 'ammoBunker']);
    const full = trailerBlast(b, trailer(b));
    b.hardpoints.find((h) => h.slot.id === 'bay0')!.ammo = 0;
    bayOf(b, 1)!.loads = 0;
    const spent = trailerBlast(b, trailer(b));
    expect(spent).toEqual(T.blast);
    expect(full.damage).toBeGreaterThan(spent.damage);
  });

  it('goes up with the reactor', () => {
    const w = world(['ammoBunker']);
    const b = w.behemoth;
    igniteReactor(b, w.events);
    steps(w, 200);
    expect(b.destroyed).toBe(true);
    expect(trailer(b).status).toBe('wrecked');
    expect(events(w, 'trailerBlast')).toHaveLength(1);
  });
});

describe('the ammo bunker', () => {
  it('refills a weapon that runs dry after the transfer, one load at a time', () => {
    const w = world(['ammoBunker']);
    const b = w.behemoth;
    const rack = b.hardpoints.find((h) => h.weapon?.id === 'missileRack')!;
    const bunker = bayOf(b, 0)!;
    const def = TRAILER_MODULES.ammoBunker;
    rack.ammo = 0;
    steps(w, 2);
    expect(bunker.feeding?.slot).toBe(rack.slot.id);
    steps(w, Math.ceil((def.kind === 'bunker' ? def.reload : 0) * 60));
    expect(rack.ammo).toBe(WEAPONS.missileRack.ammo);
    expect(bunker.loads).toBe((def.kind === 'bunker' ? def.loads : 0) - 1);
    expect(events(w, 'reloaded')).toHaveLength(1);
  });

  it('a wrecked bunker feeds nothing', () => {
    const w = world(['ammoBunker']);
    const b = w.behemoth;
    const rack = b.hardpoints.find((h) => h.weapon?.id === 'missileRack')!;
    damageComponent(b, 'bay0', 1e9, w.events);
    rack.ammo = 0;
    steps(w, 600);
    expect(rack.ammo).toBe(0);
  });
});

describe('jettison', () => {
  const hold = Math.ceil(TRAILER_MINE.jettisonHold * 60) + 1;

  it('needs the key held; then the trailer lies in the track as a mine and its pods go dead', () => {
    const w = world(['missilePod']);
    const b = w.behemoth;
    const before = speedLimits(b).cruise;
    steps(w, hold - 10, { jettison: true });
    steps(w, 1);
    expect(trailer(b).status).toBe('hitched');
    steps(w, hold, { jettison: true });
    expect(trailer(b).status).toBe('jettisoned');
    expect(w.mines).toHaveLength(1);
    expect(speedLimits(b).cruise).toBeGreaterThan(before);
    // The pod no longer fires.
    steps(w, 30, { fireMissile: true, aimX: b.x + 300 });
    expect(w.projectiles.some((p) => p.weapon.id === 'podMissiles')).toBe(false);
    // It coasts to a stop and the Behemoth drives on.
    steps(w, 120);
    const m = w.mines[0]!;
    expect(Math.hypot(m.vx, m.vy)).toBe(0);
    expect(b.x - m.x).toBeGreaterThan(80);
  });

  it('an enemy nearby sets it off only once it is armed; the blast kills', () => {
    const w = world(['ammoBunker']);
    const b = w.behemoth;
    steps(w, hold, { jettison: true });
    const m = w.mines[0]!;
    const e = parked(w, m.x - 20, m.y, 'heavyTank');
    steps(w, 30);
    expect(w.mines).toHaveLength(1);
    steps(w, Math.ceil(TRAILER_MINE.armDelay * 60) + 30);
    expect(w.mines).toHaveLength(0);
    expect(e.alive).toBe(false);
    expect(events(w, 'trailerBlast')).toHaveLength(1);
    expect(w.stats.kills).toBe(1);
    expect(b.destroyed).toBe(false);
  });

  it('blows on its own when its time runs out, or when a round hits it', () => {
    const a = world();
    steps(a, hold, { jettison: true });
    steps(a, Math.ceil(TRAILER_MINE.life * 60) + 2);
    expect(a.mines).toHaveLength(0);
    expect(events(a, 'trailerBlast')).toHaveLength(1);

    const s = world();
    steps(s, hold, { jettison: true });
    steps(s, Math.ceil(TRAILER_MINE.armDelay * 60) + 5);
    const m = s.mines[0]!;
    spawnProjectile(s, 'enemy', WEAPONS.lightTankGun, m.x - 40, m.y, 0);
    steps(s, 30);
    expect(s.mines).toHaveLength(0);
  });

  it('a jettisoned trailer is not in the next battle', () => {
    const w = world(['missilePod']);
    steps(w, hold, { jettison: true });
    const s = snapshotBehemoth(w.behemoth);
    expect(s.trailer).toBeNull();
    expect(s.hardpoints.some((h) => h.slot === 'bay0')).toBe(false);
  });
});

describe('trailer snapshots and saves', () => {
  it('round-trips damage, loads, and pod ammo', () => {
    const b = make(['missilePod', 'ammoBunker']);
    const t = trailer(b);
    t.armor.hp = 12;
    t.frame.hp = 30;
    bayOf(b, 1)!.integrity.hp = 9;
    bayOf(b, 1)!.loads = 1;
    const pod = b.hardpoints.find((h) => h.slot.id === 'bay0')!;
    pod.integrity.hp = 20;
    pod.ammo = 5;
    const r = restoreBehemoth(snapshotBehemoth(b), 0, 0);
    expect(r.trailer!.armor.hp).toBe(12);
    expect(r.trailer!.frame.hp).toBe(30);
    expect(bayOf(r, 1)!.integrity.hp).toBe(9);
    expect(bayOf(r, 1)!.loads).toBe(1);
    expect(bayOf(r, 0)!.integrity.hp).toBe(20);
    expect(r.hardpoints.find((h) => h.slot.id === 'bay0')!.ammo).toBe(5);
  });

  it('the run save keeps the trailer and loads version 2 saves without one', () => {
    const run = newRun(3, 'class2', ['trailer'], {}, ['auxGenerator', null]);
    run.depot = openDepot({ seed: 3, battle: 1 }, run.behemoth);
    expect(parseRun(serializeRun(run))).toEqual(run);
    const v2 = JSON.parse(serializeRun(newRun(3))) as { version: number; run: { behemoth: Record<string, unknown> } };
    v2.version = 2;
    delete v2.run.behemoth['trailer'];
    expect(parseRun(JSON.stringify(v2))?.behemoth.trailer).toBeNull();
    // A trailer without its add-on (or the reverse) is malformed.
    const bad = JSON.parse(serializeRun(run)) as { run: { behemoth: { addons: unknown[] } } };
    bad.run.behemoth.addons = [];
    expect(parseRun(JSON.stringify(bad))).toBeNull();
  });
});

describe('the trailer at the depot', () => {
  function atDepot(bays: (ModuleId | null)[] | null, salvage = 2000): RunState {
    const run = bays ? newRun(11, 'class2', ['trailer'], {}, bays) : newRun(11);
    const depot = openDepot({ seed: run.seed, battle: 1 }, run.behemoth);
    depot.modules = (Object.keys(TRAILER_MODULES) as ModuleId[]).map((module) => ({ module, sold: false }));
    return { ...run, battle: 1, next: 'depot', salvage, depot };
  }
  const stock = (id: ModuleId) => (Object.keys(TRAILER_MODULES) as ModuleId[]).indexOf(id);

  it('modules are only stocked when there is a trailer to put them in, or one for sale', () => {
    for (let battle = 1; battle < 30; battle++) {
      const bare = openDepot({ seed: 4, battle }, newRun(4).behemoth);
      expect(bare.modules.length > 0).toBe(bare.addons.some((a) => a.addon === 'trailer'));
      const withTrailer = openDepot({ seed: 4, battle }, newRun(4, 'class2', ['trailer']).behemoth);
      expect(withTrailer.modules.length).toBeGreaterThanOrEqual(DEPOT.moduleStock[0]);
      expect(withTrailer.modules.length).toBeLessThanOrEqual(DEPOT.moduleStock[1]);
    }
  });

  it('bolting on a trailer gives it empty bays; removing it takes its modules', () => {
    let run = atDepot(null);
    run.depot!.addons = [{ addon: 'trailer', sold: false }];
    run = applyAction(run, { kind: 'installAddon', stock: 0 });
    expect(run.behemoth.trailer).toEqual({ armor: T.armor, bays: [null, null] });
    expect(quote(run, { kind: 'installModule', stock: stock('missilePod'), bay: 5 })).toEqual({ ok: false, reason: 'No such bay' });
    run = applyAction(run, { kind: 'installModule', stock: stock('missilePod'), bay: 1 });
    expect(run.behemoth.hardpoints.find((h) => h.slot === 'bay1')?.weapon).toBe('podMissiles');
    const salvage = run.salvage;
    run = applyAction(run, { kind: 'removeAddon', addon: 'trailer' });
    // The frame and the pod in it both sell back.
    expect(run.salvage).toBe(salvage + Math.floor(DEPOT_ADDONS.trailer!.price * DEPOT.resale) + Math.floor(DEPOT_MODULES.missilePod.price * DEPOT.resale));
    expect(run.behemoth.trailer).toBeNull();
    expect(run.behemoth.hardpoints.some((h) => h.slot === 'bay1')).toBe(false);
    expect(quote(run, { kind: 'installModule', stock: stock('ammoBunker'), bay: 0 })).toEqual({ ok: false, reason: 'No trailer' });
  });

  it('a module costs an action and replaces what was in the bay (which sells back); taking one out pays back too', () => {
    let run = atDepot(['missilePod', null]);
    const back = (m: ModuleId) => Math.floor(DEPOT_MODULES[m].price * DEPOT.resale);
    const q = quote(run, { kind: 'installModule', stock: stock('ammoBunker'), bay: 0 });
    expect(q).toEqual({ ok: true, salvage: DEPOT_MODULES.ammoBunker.price - back('missilePod'), actions: 1 });
    run = applyAction(run, { kind: 'installModule', stock: stock('ammoBunker'), bay: 0 });
    expect(run.behemoth.trailer!.bays[0]).toEqual({ module: 'ammoBunker', hp: TRAILER_MODULES.ammoBunker.hp, loads: 2 });
    expect(run.behemoth.hardpoints.some((h) => h.slot === 'bay0')).toBe(false);
    expect(run.depot!.actions).toBe(DEPOT.actions - 1);
    expect(quote(run, { kind: 'removeModule', bay: 0 })).toEqual({ ok: true, salvage: -back('ammoBunker'), actions: 0 });
    expect(quote(run, { kind: 'removeModule', bay: 1 })).toEqual({ ok: false, reason: 'Empty' });
    run = applyAction(run, { kind: 'removeModule', bay: 0 });
    expect(run.behemoth.trailer!.bays).toEqual([null, null]);
  });

  it("a pod's launcher is built in: nothing else goes there, and it can't be taken off alone", () => {
    const run = atDepot(['missilePod', null]);
    expect(fits(run.behemoth, 'bay0', 'missileRack')).toBe(false);
    expect(quote(run, { kind: 'remove', slot: 'bay0' })).toEqual({ ok: false, reason: 'Built in' });
  });

  it('repairs, rearms, and re-plating cover the trailer', () => {
    let run = atDepot(['missilePod', 'ammoBunker']);
    const s = run.behemoth;
    s.addons.find((a) => a.id === 'trailer')!.hp = 30;
    s.trailer!.armor = 10;
    s.trailer!.bays[1] = { module: 'ammoBunker', hp: 10, loads: 0 };
    s.hardpoints.find((h) => h.slot === 'bay0')!.ammo = 2;
    expect(quote(run, { kind: 'repair', component: 'trailer' })).toEqual({ ok: true, salvage: DEPOT.repairBase + Math.ceil(40 * DEPOT.perHp.frame), actions: 1 });
    expect(quote(run, { kind: 'repair', component: 'bay1' })).toEqual({ ok: true, salvage: DEPOT.repairBase + 30 * DEPOT.perHp.hardpoint, actions: 1 });
    expect(quote(run, { kind: 'rearm', slot: 'bay1' })).toEqual({ ok: true, salvage: DEPOT.rearmBase + 2 * DEPOT_MODULES.ammoBunker.loadPrice!, actions: 1 });
    expect(quote(run, { kind: 'rearm', slot: 'bay0' })).toEqual({ ok: true, salvage: DEPOT.rearmBase + 10 * DEPOT_MODULES.missilePod.roundPrice!, actions: 1 });
    const armor = quote(run, { kind: 'repairArmor' });
    expect(armor.ok && armor.salvage).toBe(DEPOT.repairBase + Math.ceil((T.armor - 10) * DEPOT.perHp.armor));
    run = applyAction(run, { kind: 'repairArmor' });
    expect(run.behemoth.trailer!.armor).toBe(T.armor);
    run = applyAction(run, { kind: 'rearm', slot: 'bay1' });
    expect(run.behemoth.trailer!.bays[1]!.loads).toBe(2);
    run = applyAction(run, { kind: 'repair', component: 'bay1' });
    expect(run.behemoth.trailer!.bays[1]!.hp).toBe(TRAILER_MODULES.ammoBunker.hp);
  });

  it('the load readout counts the towed share', () => {
    const run = atDepot(['missilePod', null]);
    const bare = loadOf(newRun(11).behemoth);
    expect(loadOf(run.behemoth).mass).toBeCloseTo(bare.mass + MASS.towed * (T.mass + TRAILER_MODULES.missilePod.mass));
  });
});
