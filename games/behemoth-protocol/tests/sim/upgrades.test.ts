import { describe, expect, it } from 'vitest';
import { CHASSIS } from '../../src/content/chassis';
import { DEPOT_GRADES, DEPOT_TRACKS } from '../../src/content/depot';
import { DEPOT } from '../../src/content/tuning';
import { ADDONS } from '../../src/content/addons';
import { ARMOR_PARTS, armorArcsOf, GRADES, NO_UPGRADES, TRACKS, type TrackId, type Upgrades } from '../../src/content/upgrades';
import { WEAPONS } from '../../src/content/weapons';
import {
  autoReach,
  cookOff,
  createBehemoth,
  detonationRadius,
  fireControlSpread,
  loadMass,
  massCapacity,
  reactorOutput,
  revealRadius,
  type BehemothState,
} from '../../src/sim/behemoth';
import { applyAction, damageOf, openDepot, quote, tracksOf, type DepotAction } from '../../src/sim/depot';
import type { SimEvent } from '../../src/sim/events';
import { newRun, restoreBehemoth, snapshotBehemoth, type RunState } from '../../src/sim/run';
import { fitChassis, upgradeMass } from '../../src/sim/upgrades';
import { fromV12, parseRun, serializeRun } from '../../src/save/runSave';

/** Component upgrades (SPEC §5.6): Gen 2/3 core components and leveled part mods. */

const c = CHASSIS.class2;
const loadout = () => Object.fromEntries(Object.entries(c.loadout).map(([slot, id]) => [slot, WEAPONS[id]]));
const make = (u: Upgrades = NO_UPGRADES, addons: string[] = []): BehemothState =>
  createBehemoth(c, loadout(), 0, 0, addons as never[], [], u);
const ring = (b: BehemothState, id = 'main') => b.turrets.find((t) => t.def.id === id)!;
const slot = (b: BehemothState, id: string) => b.hardpoints.find((h) => h.slot.id === id)!;

/** A run at the depot after `battle` battles, with plenty of salvage. */
function atDepot(salvage = 2000, battle = 1, run: RunState = newRun(11)): RunState {
  return { ...run, battle, next: 'depot', salvage, depot: openDepot({ seed: run.seed, battle }, run.behemoth) };
}

/** The same run with exactly these grades for sale. */
function selling(run: RunState, items: [keyof typeof GRADES, 2 | 3][]): RunState {
  return { ...run, depot: { ...run.depot!, grades: items.map(([component, gen]) => ({ component, gen, sold: false })) } };
}

describe('grades', () => {
  it('Gen 1 everywhere is the chassis itself', () => {
    expect(fitChassis(c, NO_UPGRADES)).toBe(c);
    expect(make().chassis).toBe(c);
  });

  it('a Gen 3 reactor makes more power, holds more, blows bigger, is tougher, and weighs more', () => {
    const base = make();
    const b = make({ grades: { reactor: 3 }, mods: {} });
    const g = GRADES.reactor[3];
    expect(reactorOutput(b)).toBeCloseTo(reactorOutput(base) * g.output!);
    expect(b.power.max).toBe(Math.round(c.reactor.capacitor * g.capacitor!));
    expect(b.power.stored).toBe(b.power.max);
    expect(b.reactor).toEqual({ hp: Math.round(c.reactor.hp * g.hp), max: Math.round(c.reactor.hp * g.hp) });
    expect(detonationRadius(b) - detonationRadius(base)).toBeCloseTo(c.reactor.blastRadius * (g.blast! - 1));
    expect(loadMass(b)).toBe(loadMass(base) + g.mass);
    // The chassis table is untouched.
    expect(CHASSIS.class2.reactor.output).toBe(c.reactor.output);
  });

  it('Gen 2 fire control adds a channel and tightens auto fire', () => {
    const b = make({ grades: { fireControl: 2 }, mods: {} });
    expect(b.chassis.fireControl.channels).toBe(c.fireControl.channels + 1);
    expect(fireControlSpread(b)).toBeCloseTo(GRADES.fireControl[2].spread!);
    // A third weapon on Auto survives a reload with the extra channel, and not without it.
    const run = newRun(1, 'class2', ['sponsonL'], { sponsonL: 'autocannon' });
    for (const id of ['prow', 'spine', 'sponsonL']) run.behemoth.hardpoints.find((h) => h.slot === id)!.binding = 'auto';
    const autos = (b: BehemothState) => b.hardpoints.filter((h) => h.binding === 'auto' && h.slot.id !== 'pd' && !h.slot.id.startsWith('flank')).length;
    expect(autos(restoreBehemoth(run.behemoth, 0, 0))).toBe(2);
    expect(autos(restoreBehemoth({ ...run.behemoth, grades: { fireControl: 2 } }, 0, 0))).toBe(3);
  });

  it('Gen 3 sensors reveal farther and let autos reach farther', () => {
    const base = make();
    const b = make({ grades: { sensors: 3 }, mods: {} });
    expect(revealRadius(b)).toBeCloseTo(revealRadius(base) * GRADES.sensors[3].reveal!);
    expect(autoReach(b)).toBeCloseTo(autoReach(base) * GRADES.sensors[3].reach!);
  });

  it('a Gen 2 magazine softens a cook-off', () => {
    const blast = (b: BehemothState) => {
      const events: SimEvent[] = [];
      cookOff(b, events);
      return events.find((e) => e.type === 'cookOff')!;
    };
    const base = blast(make());
    const soft = blast(make({ grades: { magazine: 2 }, mods: {} }));
    expect(soft.type === 'cookOff' && base.type === 'cookOff' && soft.damage).toBeCloseTo((base.type === 'cookOff' ? base.damage : 0) * GRADES.magazine[2].cookOff!);
  });

  it('Gen 2 treads carry more and take more punishment', () => {
    const b = make({ grades: { treads: 2 }, mods: {} });
    expect(massCapacity(b)).toBe(Math.round(c.massCapacity * GRADES.treads[2].capacity!));
    expect(b.treads.max).toBe(Math.round(c.treadHp * GRADES.treads[2].hp));
  });
});

describe('mods', () => {
  it('traverse on the turret speeds its ring; on the prow, its own mount', () => {
    const b = make({ grades: {}, mods: { turret: { traverse: 2 }, prow: { traverse: 1 } } });
    expect(ring(b).def.traverseDegPerSec).toBeCloseTo(c.turrets[0]!.traverseDegPerSec * (1 + 2 * TRACKS.traverse.per));
    expect(slot(b, 'prow').slot.traverse).toBeCloseTo(1 + TRACKS.traverse.per);
    expect(slot(b, 'turret').slot.traverse).toBeUndefined();
  });

  it('a dorsal ring takes its own traverse mod', () => {
    const b = make({ grades: {}, mods: { dorsalRing: { traverse: 1 } } }, ['dorsalRing']);
    expect(ring(b, 'dorsal').def.traverseDegPerSec).toBeCloseTo(c.addonMounts.dorsalRing!.turret!.traverseDegPerSec * (1 + TRACKS.traverse.per));
  });

  it('harden raises a part, plate one armor zone, the cap bank the capacitor; each level weighs', () => {
    const base = make();
    const b = make({ grades: {}, mods: { turret: { harden: 3 }, sensors: { harden: 1 }, 'armor.left': { plate: 2 }, reactor: { capacitor: 1 } } });
    expect(slot(b, 'turret').integrity.max).toBe(Math.round(60 * (1 + 3 * TRACKS.harden.per)));
    expect(b.sensors.max).toBe(Math.round(c.sensorsHp * (1 + TRACKS.harden.per)));
    expect(b.armor.left.max).toBe(Math.round(c.armor.left * (1 + 2 * TRACKS.plate.per)));
    expect(b.armor.right.max).toBe(c.armor.right);
    expect(b.power.max).toBe(Math.round(c.reactor.capacitor * (1 + TRACKS.capacitor.per)));
    const tons = 3 * TRACKS.harden.mass + TRACKS.harden.mass + 2 * TRACKS.plate.mass + TRACKS.capacitor.mass;
    expect(loadMass(b)).toBeCloseTo(loadMass(base) + tons);
  });

  it('grades and mods survive a snapshot and restore', () => {
    const u: Upgrades = { grades: { reactor: 2, sensors: 3 }, mods: { prow: { harden: 1, traverse: 2 } } };
    const s = snapshotBehemoth(make(u));
    expect(s.grades).toEqual(u.grades);
    expect(s.mods).toEqual(u.mods);
    expect(restoreBehemoth(s, 0, 0).reactor.max).toBe(make(u).reactor.max);
  });
});

describe('depot grades', () => {
  it('stocks only grades above what is fitted, seeded per depot; Gen 3 waits for the second depot', () => {
    let gen3First = false;
    let any = false;
    for (let seed = 1; seed <= 40; seed++) {
      const run = newRun(seed);
      const a = openDepot({ seed, battle: 1 }, run.behemoth);
      expect(openDepot({ seed, battle: 1 }, run.behemoth)).toEqual(a);
      expect(a.grades.length).toBeLessThanOrEqual(DEPOT.gradeStock[1]);
      any ||= a.grades.length > 0;
      gen3First ||= a.grades.some((g) => g.gen === 3);
      const upgraded = { ...run.behemoth, grades: { reactor: 2 as const } };
      for (const g of openDepot({ seed, battle: 3 }, upgraded).grades) expect(g.component === 'reactor' && g.gen <= 2).toBe(false);
    }
    expect(any).toBe(true);
    expect(gen3First).toBe(false);
  });

  it('installing a grade replaces the part whole, drops its mods, credits the old one, and uses an action', () => {
    let run = selling(atDepot(), [['reactor', 2]]);
    run.behemoth.reactor = 30;
    run.behemoth.mods = { reactor: { harden: 1 } };
    // The Gen 1 reactor's mods are worth something on resale; Gen 1 itself isn't sold anywhere.
    const credit = Math.floor(DEPOT_TRACKS.harden[0]! * DEPOT.resale * (30 / Math.round(c.reactor.hp * 1.2)));
    const q = quote(run, { kind: 'installGrade', stock: 0 });
    expect(q).toEqual({ ok: true, salvage: DEPOT_GRADES.reactor[2].price - credit, actions: 1 });
    run = applyAction(run, { kind: 'installGrade', stock: 0 });
    expect(run.behemoth.grades.reactor).toBe(2);
    expect(run.behemoth.mods.reactor).toBeUndefined();
    expect(run.behemoth.reactor).toBe(Math.round(c.reactor.hp * GRADES.reactor[2].hp));
    expect(run.depot!.grades[0]!.sold).toBe(true);
    expect(run.depot!.actions).toBe(DEPOT.actions - 1);
    expect(quote(run, { kind: 'installGrade', stock: 0 })).toEqual({ ok: false, reason: 'Sold' });
  });

  it('a grade at or below the one fitted can not be installed', () => {
    const run = selling(atDepot(), [['sensors', 2]]);
    run.behemoth.grades = { sensors: 3 };
    expect(quote(run, { kind: 'installGrade', stock: 0 })).toEqual({ ok: false, reason: 'Gen 3 fitted' });
  });

  it('swapping a Gen 2 for a Gen 3 credits the Gen 2', () => {
    const run = selling(atDepot(), [['treads', 3]]);
    run.behemoth.grades = { treads: 2 };
    run.behemoth.treads = Math.round(c.treadHp * GRADES.treads[2].hp);
    const credit = Math.floor(DEPOT_GRADES.treads[2].price * DEPOT.resale);
    expect(quote(run, { kind: 'installGrade', stock: 0 })).toMatchObject({ ok: true, salvage: DEPOT_GRADES.treads[3].price - credit });
  });
});

describe('depot mods', () => {
  const mod = (part: string, track: TrackId): DepotAction => ({ kind: 'mod', part, track });

  it('offers harden and traverse on mounts and rings, only harden on a coax, plate on armor, a cap bank on the reactor, load on the treads', () => {
    const run = newRun(1, 'class2', ['coax']);
    expect(tracksOf(run.behemoth, 'turret')).toEqual(['harden', 'traverse']);
    expect(tracksOf(run.behemoth, 'prow')).toEqual(['harden', 'traverse']);
    expect(tracksOf(run.behemoth, 'coax')).toEqual(['harden']);
    expect(tracksOf(run.behemoth, 'armor.front')).toEqual(['plate']);
    expect(tracksOf(run.behemoth, 'armor.left')).toEqual(['plate']);
    // The front halves are one part now.
    expect(tracksOf(run.behemoth, 'armor.frontLeft')).toEqual([]);
    expect(tracksOf(run.behemoth, 'reactor')).toEqual(['harden', 'capacitor']);
    expect(tracksOf(run.behemoth, 'treads')).toEqual(['harden', 'load']);
    expect(tracksOf(run.behemoth, 'sensors')).toEqual(['harden']);
    expect(tracksOf(run.behemoth, 'ramPlow')).toEqual([]);
  });

  it('one front plate thickens both front halves', () => {
    expect(ARMOR_PARTS).toEqual(['armor.front', 'armor.rear', 'armor.left', 'armor.right']);
    expect(armorArcsOf('armor.front')).toEqual(['frontLeft', 'frontRight']);
    let run = atDepot();
    run.behemoth.armor.frontLeft = 40;
    run = applyAction(run, mod('armor.front', 'plate'));
    const fitted = fitChassis(c, { grades: {}, mods: run.behemoth.mods });
    expect(fitted.armor.frontLeft).toBe(Math.round(c.armor.frontLeft * (1 + TRACKS.plate.per)));
    expect(fitted.armor.frontRight).toBe(Math.round(c.armor.frontRight * (1 + TRACKS.plate.per)));
    expect(fitted.armor.left).toBe(c.armor.left);
    // Each half keeps its own share of integrity.
    expect(run.behemoth.armor.frontLeft).toBe(48);
    expect(run.behemoth.armor.frontRight).toBe(fitted.armor.frontRight);
    expect(run.depot!.actions).toBe(DEPOT.actions - 1);
  });

  it('the treads Load mod carries more, but three levels stay short of outboard treads', () => {
    const per = (level: number) => fitChassis(c, { grades: {}, mods: { treads: { load: level } } }).massCapacity;
    expect(per(1)).toBe(Math.round(c.massCapacity * (1 + TRACKS.load.per)));
    const gain = per(DEPOT.maxModLevel) - c.massCapacity;
    expect(gain).toBeGreaterThan(0);
    const outboard = ADDONS.outerTreads;
    expect(outboard.kind === 'treads' && gain < outboard.capacity).toBe(true);
    // It stacks with a grade, and adds its tons.
    expect(fitChassis(c, { grades: { treads: 2 }, mods: { treads: { load: 1 } } }).massCapacity).toBe(
      Math.round(c.massCapacity * GRADES.treads[2].capacity! * (1 + TRACKS.load.per)),
    );
    expect(upgradeMass({ grades: {}, mods: { treads: { load: 2 } } })).toBe(2 * TRACKS.load.mass);
  });

  it('each level costs its price and an action, keeps the share of integrity, and stops at the max', () => {
    let run = atDepot(5000);
    run.behemoth.sensors = c.sensorsHp / 2;
    run = { ...run, depot: { ...run.depot!, actions: 10 } };
    for (let level = 1; level <= DEPOT.maxModLevel; level++) {
      const before = run;
      expect(quote(run, mod('sensors', 'harden'))).toEqual({ ok: true, salvage: DEPOT_TRACKS.harden[level - 1], actions: 1 });
      run = applyAction(run, mod('sensors', 'harden'));
      expect(run.behemoth.mods.sensors?.harden).toBe(level);
      expect(run.salvage).toBe(before.salvage - DEPOT_TRACKS.harden[level - 1]!);
      const d = damageOf(run.behemoth, 'sensors')!;
      expect(d.max).toBe(Math.round(c.sensorsHp * (1 + level * TRACKS.harden.per)));
      expect(run.behemoth.sensors / d.max).toBeCloseTo(0.5, 1);
    }
    expect(quote(run, mod('sensors', 'harden'))).toEqual({ ok: false, reason: 'Maxed' });
    expect(run.depot!.actions).toBe(10 - DEPOT.maxModLevel);
  });

  it('a destroyed part stays destroyed when hardened (no cheap repair)', () => {
    let run = atDepot();
    run.behemoth.hardpoints.find((h) => h.slot === 'prow')!.hp = 0;
    run = applyAction(run, mod('prow', 'harden'));
    expect(run.behemoth.hardpoints.find((h) => h.slot === 'prow')!.hp).toBe(0);
  });

  it('plating an armor zone keeps its share and adds to the re-plate', () => {
    let run = atDepot();
    run.behemoth.armor.left = 40;
    run = applyAction(run, mod('armor.left', 'plate'));
    expect(run.behemoth.armor.left).toBe(48);
    expect(quote(run, { kind: 'repairArmor' })).toMatchObject({ ok: true, salvage: DEPOT.repairBase + Math.ceil(48 * DEPOT.perHp.armor) });
  });

  it('traverse does nothing for a fixed weapon, so it is refused', () => {
    const run = atDepot();
    expect(WEAPONS.missileRack.traverseDegPerSec).toBe(0);
    expect(quote(run, mod('spine', 'traverse'))).toEqual({ ok: false, reason: 'Fixed weapon' });
    expect(quote(run, mod('coax', 'traverse'))).toEqual({ ok: false, reason: "Doesn't apply" });
  });

  it('a mount keeps its mods when its weapon is swapped; a sponson takes them (and their value) with it', () => {
    let run = atDepot(5000, 1, newRun(1, 'class2', ['sponsonR'], { sponsonR: 'autocannon' }));
    run = applyAction(run, mod('prow', 'harden'));
    run = applyAction(run, { kind: 'remove', slot: 'prow' });
    expect(run.behemoth.mods.prow?.harden).toBe(1);
    run = applyAction(run, mod('sponsonR', 'harden'));
    const q = quote(run, { kind: 'removeAddon', addon: 'sponsonR' });
    const without = quote({ ...run, behemoth: { ...run.behemoth, mods: { prow: { harden: 1 } } } }, { kind: 'removeAddon', addon: 'sponsonR' });
    expect(q.ok && without.ok && without.salvage - q.salvage).toBe(Math.floor(DEPOT_TRACKS.harden[0]! * DEPOT.resale));
    run = applyAction(run, { kind: 'removeAddon', addon: 'sponsonR' });
    expect(run.behemoth.mods.sponsonR).toBeUndefined();
  });
});

describe('run save', () => {
  it('round-trips grades, mods, and grades for sale', () => {
    let run = selling(atDepot(), [['magazine', 2]]);
    run = applyAction(run, { kind: 'mod', part: 'turret', track: 'traverse' });
    run.behemoth.grades = { reactor: 2 };
    expect(parseRun(serializeRun(run))).toEqual(run);
  });

  it('a version 7 save loads with Gen 1 parts, no mods, and no grades for sale', () => {
    const run = atDepot();
    const { grades: _g, mods: _m, ...behemoth } = run.behemoth;
    const { grades: _d, ...depot } = run.depot!;
    const loaded = parseRun(JSON.stringify({ version: 7, run: { ...run, behemoth, depot } }));
    expect(loaded?.behemoth.grades).toEqual({});
    expect(loaded?.behemoth.mods).toEqual({});
    expect(loaded?.depot?.grades).toEqual([]);
  });

  it('rejects a grade or mod level that does not exist', () => {
    const run = newRun(3);
    expect(parseRun(serializeRun({ ...run, behemoth: { ...run.behemoth, grades: { reactor: 4 as never } } }))).toBeNull();
    expect(parseRun(serializeRun({ ...run, behemoth: { ...run.behemoth, mods: { turret: { harden: 9 } } } }))).toBeNull();
    expect(parseRun(serializeRun({ ...run, behemoth: { ...run.behemoth, mods: { turret: { warp: 1 } as never } } }))).toBeNull();
  });
});

describe('save v13: one front plate', () => {
  it('merges the two front halves\' Plate mods at the higher level, leaving other mods alone', () => {
    const run = newRun(1);
    const old = { ...run, behemoth: { ...run.behemoth, mods: { 'armor.frontLeft': { plate: 1 }, 'armor.frontRight': { plate: 2 }, turret: { traverse: 1 } } } };
    const migrated = fromV12(old) as RunState;
    expect(migrated.behemoth.mods).toEqual({ 'armor.front': { plate: 2 }, turret: { traverse: 1 } });
    // Through the loader, from a v12 file.
    const loaded = parseRun(JSON.stringify({ version: 12, run: old }));
    expect(loaded?.behemoth.mods['armor.front']).toEqual({ plate: 2 });
    expect(fromV12(run)).toBe(run);
  });
});
