import { describe, expect, it } from 'vitest';
import { ADDONS, trailerOf, type TrailerAddon } from '../../src/content/addons';
import { CHASSIS, HARDPOINT_SIZES } from '../../src/content/chassis';
import { DEPOT_ADDONS, DEPOT_TRACKS, DEPOT_WEAPONS } from '../../src/content/depot';
import { TRAILER_MODULES, type ModuleId } from '../../src/content/trailer';
import { DEPOT, MASS, RIPPLE_GAP } from '../../src/content/tuning';
import { GRADES, TRACKS, trackMax } from '../../src/content/upgrades';
import { WEAPONS, type WeaponId } from '../../src/content/weapons';
import { parseRun, serializeRun } from '../../src/save/runSave';
import { bayName, hitchPoint, IDLE_COMMAND, loadMass, massCapacity, mountPosition, treadSets, type PlayerCommand } from '../../src/sim/behemoth';
import { addonDef, applyAction, channelsOf, damageOf, genOdds, loadOf, onBoard, openDepot, partKind, quote, tracksOf, type DepotState } from '../../src/sim/depot';
import { newRun, restoreBehemoth, snapshotBehemoth, type RunState } from '../../src/sim/run';
import { createWorld, stepWorld, type World } from '../../src/sim/world';

/**
 * The Nov 24, 2026 batch (SPEC §15 "Heavy refits"): a weapon of every size at every depot,
 * generations by sector, bigger trailers, upgrades for the outboard treads, the Auto link, the
 * twin turret, the titan cannon, and the swarm pod's reload.
 */

const sizeOf = (id: WeaponId) => WEAPONS[id].size!;

/** A run at a depot with plenty of salvage; `set` fills in its stock. */
function atDepot(run: RunState = newRun(11), set: Partial<DepotState> = {}, salvage = 3000): RunState {
  return { ...run, battle: 1, next: 'depot', salvage, depot: { ...openDepot({ seed: run.seed, battle: 1 }, run.behemoth), ...set } };
}

function battle(run: RunState): World {
  const w = createWorld({ seed: 1, frameWidth: 480, fieldRows: 16, behemoth: run.behemoth });
  w.encounter.off = true;
  w.behemoth.autoEnabled.fill(false);
  return w;
}

function step(w: World, cmd: Partial<PlayerCommand> = {}): void {
  stepWorld(w, { ...IDLE_COMMAND, aimX: w.behemoth.x + 150, aimY: w.behemoth.y, ...cmd });
}

describe('a weapon of every size at every depot', () => {
  it('stocks at least one S, one M, and one L, listed biggest first', () => {
    const stock = newRun(3).behemoth;
    for (let key = 0; key < 200; key++) {
      for (const sector of [0, 2, 4]) {
        const weapons = openDepot({ seed: 3, battle: 1 }, stock, key, sector).stock.map((i) => i.weapon);
        for (const size of HARDPOINT_SIZES) expect(weapons.some((id) => sizeOf(id) === size)).toBe(true);
        const order = weapons.map((id) => HARDPOINT_SIZES.indexOf(sizeOf(id)));
        expect(order).toEqual([...order].sort((a, b) => a - b));
        expect(new Set(weapons).size).toBe(weapons.length);
        expect(weapons.length).toBeGreaterThanOrEqual(DEPOT.stock[0]);
        expect(weapons.length).toBeLessThanOrEqual(DEPOT.stock[1]);
      }
    }
  });

  it("each size's sure pick is one the Behemoth doesn't already carry", () => {
    const stock = newRun(3).behemoth;
    for (let key = 0; key < 200; key++) {
      const weapons = openDepot({ seed: 3, battle: 1 }, stock, key).stock.map((i) => i.weapon);
      for (const size of HARDPOINT_SIZES) expect(weapons.some((id) => sizeOf(id) === size && !onBoard(stock, id))).toBe(true);
    }
  });
});

describe('generations by sector', () => {
  it('the odds table: nothing Gen 3 in sector 1, and the last row serves every later sector', () => {
    expect(genOdds(0, 3)).toBe(0);
    expect(genOdds(0)).toBe(1);
    expect(genOdds(99, 3)).toBe(genOdds(DEPOT.genOdds.length - 1, 3));
    expect(genOdds(-1, 2)).toBe(genOdds(0, 2));
    // Gen 2 and Gen 3 only ever get likelier; Gen 1 only ever less so.
    for (let s = 1; s < DEPOT.genOdds.length; s++) {
      expect(genOdds(s, 2)).toBeGreaterThanOrEqual(genOdds(s - 1, 2));
      expect(genOdds(s, 3)).toBeGreaterThan(genOdds(s - 1, 3));
      expect(genOdds(s, 1)).toBeLessThanOrEqual(genOdds(s - 1, 1));
    }
  });

  it('what depots offer gets better sector by sector', () => {
    const stock = newRun(7).behemoth;
    const tally = (sector: number) => {
      let gen3 = 0;
      let grades = 0;
      let gen2Weapons = 0;
      let weapons = 0;
      let superTrailers = 0;
      for (let key = 0; key < 400; key++) {
        const d = openDepot({ seed: 7, battle: 1 }, stock, key, sector);
        grades += d.grades.length;
        gen3 += d.grades.filter((g) => g.gen === 3).length;
        weapons += d.stock.length;
        gen2Weapons += d.stock.filter((i) => (DEPOT_WEAPONS[i.weapon]!.gen ?? 1) > 1).length;
        superTrailers += d.addons.filter((a) => a.addon === 'superTrailer').length;
      }
      return { gen3: gen3 / grades, gen2: gen2Weapons / weapons, superTrailers };
    };
    const [first, third, fifth] = [tally(0), tally(2), tally(4)];
    expect(first.gen3).toBe(0);
    expect(first.superTrailers).toBe(0);
    expect(third.gen3).toBeGreaterThan(0.15);
    expect(fifth.gen3).toBeGreaterThan(third.gen3);
    expect(third.gen2).toBeGreaterThan(first.gen2);
    expect(fifth.gen2).toBeGreaterThan(third.gen2);
    expect(fifth.superTrailers).toBeGreaterThan(third.superTrailers);
    expect(third.superTrailers).toBeGreaterThan(0);
  });

  it("a map depot's stock is drawn for its sector", () => {
    const run = newRun(5, 'class2', [], {}, [], undefined, undefined, 'hard', 5);
    const late = openDepot(run, run.behemoth, 1234, 4);
    expect(openDepot(run, run.behemoth, 1234, 4)).toEqual(late);
    expect(JSON.stringify(openDepot(run, run.behemoth, 1234, 0))).not.toBe(JSON.stringify(late));
  });
});

describe('bigger trailers', () => {
  const heavy = ADDONS.heavyTrailer as TrailerAddon;
  const big = ADDONS.superTrailer as TrailerAddon;

  it('come with three and four bays, each longer, heavier, and tougher than the last', () => {
    const [a, b, c] = [ADDONS.trailer as TrailerAddon, heavy, big];
    expect([a, b, c].map((t) => t.bays.length)).toEqual([2, 3, 4]);
    for (const [small, large] of [[a, b], [b, c]] as const) {
      expect(large.length).toBeGreaterThan(small.length);
      expect(large.mass).toBeGreaterThan(small.mass);
      expect(large.hp).toBeGreaterThan(small.hp);
      expect(large.armor).toBeGreaterThan(small.armor);
      expect(DEPOT_ADDONS[large.id]!.price).toBeGreaterThan(DEPOT_ADDONS[small.id]!.price);
    }
    // Every bay sits on the bed, and no two overlap (a module is 11 long).
    for (const t of [a, b, c]) {
      for (const bay of t.bays) expect(Math.abs(bay.x) + 5.5).toBeLessThanOrEqual(t.length / 2);
      for (let i = 1; i < t.bays.length; i++) expect(t.bays[i - 1]!.x - t.bays[i]!.x).toBeGreaterThanOrEqual(11);
    }
    expect(CHASSIS.class2.addonMounts.heavyTrailer?.hitch).toEqual(CHASSIS.class2.addonMounts.trailer?.hitch);
  });

  it('a four-bay trailer tows four modules: pods in the far bays fire, and the treads feel the towed share', () => {
    const bays: ModuleId[] = ['ammoBunker', 'auxGenerator', 'missilePod', 'missileErector'];
    const b = restoreBehemoth(newRun(1, 'class2', ['superTrailer'], {}, bays).behemoth, 300, 168);
    const t = b.trailer!;
    expect(t.def.id).toBe('superTrailer');
    expect(t.bays.map((bay) => bay?.def.id)).toEqual(bays);
    expect(t.x).toBeCloseTo(hitchPoint(b).x - big.towBar - big.length / 2);
    expect(b.hardpoints.find((h) => h.slot.id === 'bay2')?.weapon?.id).toBe('podMissiles');
    expect(b.hardpoints.find((h) => h.slot.id === 'bay3')?.weapon?.id).toBe('erectorMissile');
    const bare = restoreBehemoth(newRun(1).behemoth, 300, 168);
    const towed = big.mass + bays.reduce((sum, id) => sum + TRAILER_MODULES[id].mass, 0);
    expect(loadMass(b)).toBeCloseTo(loadMass(bare) + MASS.towed * towed);
    // It survives a snapshot and a save.
    const again = parseRun(serializeRun(newRun(1, 'class2', ['superTrailer'], {}, bays)));
    expect(again?.behemoth.trailer?.bays.map((bay) => bay?.module)).toEqual(bays);
    expect(snapshotBehemoth(b).addons.map((a) => a.id)).toEqual(['superTrailer']);
  });

  it('a Behemoth tows one trailer: of several, the first', () => {
    const s = newRun(1, 'class2', ['heavyTrailer', 'trailer', 'superTrailer']).behemoth;
    expect(s.addons.map((a) => a.id)).toEqual(['heavyTrailer']);
    expect(s.trailer?.bays.length).toBe(3);
    expect(trailerOf(s.addons.map((a) => a.id))?.id).toBe('heavyTrailer');
    // A save with two is refused.
    const two = JSON.parse(serializeRun(newRun(1, 'class2', ['trailer']))) as { run: RunState };
    two.run.behemoth.addons.push({ id: 'heavyTrailer', hp: 95 });
    expect(parseRun(JSON.stringify(two))).toBeNull();
  });

  it('names its bays front to rear', () => {
    expect([0, 1].map((i) => bayName(i))).toEqual(['Front bay', 'Rear bay']);
    expect([0, 1, 2].map((i) => bayName(i, 3))).toEqual(['Front bay', 'Mid bay', 'Rear bay']);
    expect([0, 1, 2, 3].map((i) => bayName(i, 4))).toEqual(['Front bay', 'Bay 2', 'Bay 3', 'Rear bay']);
  });

  it('a bigger one swaps in over the one in tow: the modules move across, and the old frame sells back', () => {
    const start = newRun(11, 'class2', ['trailer'], {}, ['missilePod', 'ammoBunker']);
    let run = atDepot(start, { addons: [{ addon: 'superTrailer', sold: false }, { addon: 'trailer', sold: false }] });
    const q = quote(run, { kind: 'installAddon', stock: 0 });
    expect(q).toEqual({ ok: true, salvage: DEPOT_ADDONS.superTrailer!.price - Math.floor(DEPOT_ADDONS.trailer!.price * DEPOT.resale), actions: 1 });
    run = applyAction(run, { kind: 'installAddon', stock: 0 });
    const s = run.behemoth;
    expect(s.addons.map((a) => a.id)).toEqual(['superTrailer']);
    expect(s.addons[0]!.hp).toBe(big.hp);
    expect(s.trailer).toMatchObject({ armor: big.armor });
    expect(s.trailer!.bays.map((bay) => bay?.module ?? null)).toEqual(['missilePod', 'ammoBunker', null, null]);
    // The pod's launcher came across with its ammo.
    expect(s.hardpoints.find((h) => h.slot === 'bay0')).toMatchObject({ weapon: 'podMissiles', ammo: WEAPONS.podMissiles.ammo });
    expect(restoreBehemoth(s, 0, 0).trailer?.bays.length).toBe(4);
    // The two new bays take modules.
    run = { ...run, depot: { ...run.depot!, modules: [{ module: 'droneBay', sold: false }] } };
    run = applyAction(run, { kind: 'installModule', stock: 0, bay: 3 });
    expect(run.behemoth.trailer!.bays[3]?.module).toBe('droneBay');
    // Nothing smaller goes on over it.
    expect(quote(run, { kind: 'installAddon', stock: 1 })).toEqual({ ok: false, reason: 'No bigger' });
  });

  it('a worn frame sells back for less, and a depot never offers a trailer no bigger than the one in tow', () => {
    const start = newRun(11, 'class2', ['heavyTrailer']);
    start.behemoth.addons[0]!.hp = heavy.hp / 2;
    const run = atDepot(start, { addons: [{ addon: 'superTrailer', sold: false }] });
    const q = quote(run, { kind: 'installAddon', stock: 0 });
    expect(q.ok && q.salvage).toBe(DEPOT_ADDONS.superTrailer!.price - Math.floor(DEPOT_ADDONS.heavyTrailer!.price * DEPOT.resale * 0.5));
    for (let key = 0; key < 300; key++) {
      const offered = openDepot({ seed: 2, battle: 1 }, start.behemoth, key, 4).addons.map((a) => a.addon);
      expect(offered).not.toContain('trailer');
      expect(offered).not.toContain('heavyTrailer');
    }
  });

  it('removing one takes its modules and pays for them', () => {
    let run = atDepot(newRun(11, 'class2', ['heavyTrailer'], {}, ['missilePod', null, 'ammoBunker']), {}, 0);
    const q = quote(run, { kind: 'removeAddon', addon: 'heavyTrailer' });
    expect(q.ok && q.salvage).toBeLessThan(-Math.floor(DEPOT_ADDONS.heavyTrailer!.price * DEPOT.resale));
    run = applyAction(run, { kind: 'removeAddon', addon: 'heavyTrailer' });
    expect(run.behemoth.trailer).toBeNull();
    expect(run.behemoth.hardpoints.some((h) => h.slot.startsWith('bay'))).toBe(false);
  });
});

describe('outboard treads take the upgrades the main treads take', () => {
  const outer = ADDONS.outerTreads;
  if (outer.kind !== 'treads') throw new Error('outerTreads is a tread set');

  it('the depot offers them Harden and Load, like the treads', () => {
    const s = newRun(11, 'class2', ['outerTreads']).behemoth;
    expect(partKind(s, 'outerTreads')).toBe('treads');
    expect(tracksOf(s, 'outerTreads')).toEqual(tracksOf(s, 'treads'));
    expect(tracksOf(s, 'outerTreads')).toEqual(['harden', 'load']);
    // Other add-ons with parts of their own still take none; mounts take what their slot takes.
    const all = newRun(11, 'class2', ['ramPlow', 'blowoutPanels', 'trailer', 'sponsonL']).behemoth;
    for (const id of ['ramPlow', 'blowoutPanels', 'trailer']) expect(tracksOf(all, id)).toEqual([]);
    expect(tracksOf(all, 'sponsonL')).toEqual(['harden', 'traverse']);
  });

  it('a Load level raises their capacity, a Harden level their integrity (a worn set keeps its share)', () => {
    let run = atDepot(newRun(11, 'class2', ['outerTreads']));
    run.behemoth.addons[0]!.hp = outer.hp / 2;
    const before = loadOf(run.behemoth);
    run = applyAction(run, { kind: 'mod', part: 'outerTreads', track: 'load' });
    const loaded = loadOf(run.behemoth);
    expect(loaded.capacity).toBe(before.capacity + Math.round(outer.capacity * TRACKS.load.per));
    expect(loaded.mass).toBe(before.mass + TRACKS.load.mass);
    expect(run.salvage).toBe(3000 - DEPOT_TRACKS.load[0]!);
    run = applyAction(run, { kind: 'mod', part: 'outerTreads', track: 'harden' });
    const max = Math.round(outer.hp * (1 + TRACKS.harden.per));
    expect(damageOf(run.behemoth, 'outerTreads')).toEqual({ missing: max / 2, max });
    // In battle: the set's own maximum and capacity, the chassis' set untouched.
    const b = restoreBehemoth(run.behemoth, 0, 0);
    const [inner, outerSet] = treadSets(b);
    expect(inner!.capacity).toBe(CHASSIS.class2.massCapacity);
    expect(outerSet).toMatchObject({ id: 'outerTreads', capacity: Math.round(outer.capacity * (1 + TRACKS.load.per)) });
    expect(outerSet!.integrity).toEqual({ hp: max / 2, max });
    // A repair restores it to the hardened maximum.
    run = applyAction(run, { kind: 'repair', component: 'outerTreads' });
    expect(run.behemoth.addons[0]!.hp).toBe(max);
  });

  it("the treads' grade is every set's: Gen 3 treads lift the outboard pods too", () => {
    const g = GRADES.treads[3];
    let run = atDepot(newRun(11, 'class2', ['outerTreads']), { grades: [{ component: 'treads', gen: 3, sold: false }] });
    run.behemoth.addons[0]!.hp = outer.hp / 4;
    run = applyAction(run, { kind: 'installGrade', stock: 0 });
    const fitted = addonDef(run.behemoth, 'outerTreads');
    expect(fitted).toMatchObject({ hp: Math.round(outer.hp * g.hp), capacity: Math.round(outer.capacity * g.capacity!) });
    // The outboard set keeps the share of integrity it had; the main set arrives whole.
    expect(run.behemoth.addons[0]!.hp).toBeCloseTo(Math.round(outer.hp * g.hp) / 4);
    const b = restoreBehemoth(run.behemoth, 0, 0);
    expect(massCapacity(b)).toBe(Math.round(CHASSIS.class2.massCapacity * g.capacity!) + Math.round(outer.capacity * g.capacity!));
    // A fresh set bought afterward comes at the grade fitted.
    let later = atDepot(newRun(11), { grades: [{ component: 'treads', gen: 3, sold: false }], addons: [{ addon: 'outerTreads', sold: false }] });
    later = applyAction(applyAction(later, { kind: 'installGrade', stock: 0 }), { kind: 'installAddon', stock: 0 });
    expect(later.behemoth.addons[0]).toEqual({ id: 'outerTreads', hp: Math.round(outer.hp * g.hp) });
  });

  it('their mods sell with them, and are gone if a new set is bought', () => {
    let run = atDepot(newRun(11, 'class2', ['outerTreads']));
    run = applyAction(applyAction(run, { kind: 'mod', part: 'outerTreads', track: 'load' }), { kind: 'mod', part: 'outerTreads', track: 'load' });
    const spent = DEPOT_TRACKS.load[0]! + DEPOT_TRACKS.load[1]!;
    const q = quote(run, { kind: 'removeAddon', addon: 'outerTreads' });
    expect(q.ok && q.salvage).toBe(-Math.floor((DEPOT_ADDONS.outerTreads!.price + spent) * DEPOT.resale));
    run = applyAction(run, { kind: 'removeAddon', addon: 'outerTreads' });
    expect(run.behemoth.mods['outerTreads']).toBeUndefined();
    // The save keeps an outboard set's mods.
    const kept = atDepot(newRun(11, 'class2', ['outerTreads'], {}, [], { grades: {}, mods: { outerTreads: { load: 2, harden: 1 } } }));
    expect(parseRun(serializeRun(kept))?.behemoth.mods).toEqual({ outerTreads: { load: 2, harden: 1 } });
  });
});

describe('the Auto link: a third weapon on Auto, at a price', () => {
  it('is a one-level fire-control upgrade, always on offer and dear', () => {
    const s = newRun(11).behemoth;
    expect(partKind(s, 'fireControl')).toBe('fireControl');
    expect(tracksOf(s, 'fireControl')).toEqual(['harden', 'channel']);
    expect(tracksOf(s, 'sensors')).toEqual(['harden']);
    expect(trackMax('channel', DEPOT.maxModLevel)).toBe(1);
    expect(trackMax('harden', DEPOT.maxModLevel)).toBe(DEPOT.maxModLevel);
    // Dearer than any other upgrade level, and than a Gen 2 fire control.
    const others = (Object.keys(DEPOT_TRACKS) as (keyof typeof DEPOT_TRACKS)[]).filter((t) => t !== 'channel').flatMap((t) => DEPOT_TRACKS[t]);
    expect(DEPOT_TRACKS.channel[0]!).toBeGreaterThan(Math.max(...others) * 2);
  });

  it('takes the stock two channels to three, once', () => {
    let run = atDepot();
    expect(channelsOf(run.behemoth).max).toBe(2);
    const q = quote(run, { kind: 'mod', part: 'fireControl', track: 'channel' });
    expect(q).toEqual({ ok: true, salvage: DEPOT_TRACKS.channel[0], actions: 1 });
    run = applyAction(run, { kind: 'mod', part: 'fireControl', track: 'channel' });
    expect(channelsOf(run.behemoth).max).toBe(3);
    expect(quote(run, { kind: 'mod', part: 'fireControl', track: 'channel' })).toEqual({ ok: false, reason: 'Maxed' });
    expect(restoreBehemoth(run.behemoth, 0, 0).chassis.fireControl.channels).toBe(3);
    // Three weapons can now go on Auto; a fourth can't.
    for (const slot of ['prow', 'spine']) run = applyAction(run, { kind: 'bind', slot, binding: 'auto' });
    run = { ...run, depot: { ...run.depot!, addons: [{ addon: 'sponsonL', sold: false }, { addon: 'sponsonR', sold: false }], stock: [{ weapon: 'rotaryGun', sold: false }, { weapon: 'flakCannon', sold: false }] } };
    run = applyAction(applyAction(run, { kind: 'installAddon', stock: 0 }), { kind: 'install', slot: 'sponsonL', stock: 0 });
    run = applyAction(run, { kind: 'bind', slot: 'sponsonL', binding: 'auto' });
    expect(channelsOf(run.behemoth)).toEqual({ used: 3, max: 3 });
    run = { ...run, depot: { ...run.depot!, actions: 5 } };
    run = applyAction(applyAction(run, { kind: 'installAddon', stock: 1 }), { kind: 'install', slot: 'sponsonR', stock: 1 });
    expect(quote(run, { kind: 'bind', slot: 'sponsonR', binding: 'auto' })).toEqual({ ok: false, reason: 'No channel' });
  });

  it("stacks on a better fire control's own channels, and goes with the part it's fitted to", () => {
    const u = { grades: { fireControl: 2 as const }, mods: { fireControl: { channel: 1 } } };
    const run = newRun(11, 'class2', [], {}, [], u);
    expect(channelsOf(run.behemoth).max).toBe(2 + GRADES.fireControl[2].channels! + 1);
    // A level past its cap isn't a save this game wrote.
    const bad = JSON.parse(serializeRun(run)) as { run: RunState };
    bad.run.behemoth.mods['fireControl'] = { channel: 2 };
    expect(parseRun(JSON.stringify(bad))).toBeNull();
    // Replacing the fire control sells the link back with it.
    let depot = atDepot(newRun(11, 'class2', [], {}, [], { grades: {}, mods: { fireControl: { channel: 1 } } }), { grades: [{ component: 'fireControl', gen: 2, sold: false }] });
    depot = applyAction(depot, { kind: 'installGrade', stock: 0 });
    expect(depot.behemoth.mods['fireControl']).toBeUndefined();
    expect(channelsOf(depot.behemoth).max).toBe(3);
  });
});

describe('the twin turret', () => {
  const guns: Record<string, WeaponId> = { twinTurret: 'heavyCannon' };

  it('adds a second L mount on the main ring, the two guns either side of the centerline', () => {
    const run = newRun(1, 'class2', ['twinTurret'], guns);
    const b = restoreBehemoth(run.behemoth, 300, 168);
    const [main, second] = ['turret', 'twinTurret'].map((id) => b.hardpoints.find((h) => h.slot.id === id)!);
    expect(second!.slot).toMatchObject({ size: 'L', ring: 'main', position: 'turret' });
    expect(main!.slot.mount.y).toBe(-second!.slot.mount.y);
    expect(main!.slot.mount.y).toBeLessThan(0);
    expect(b.turrets.length).toBe(1);
    expect(loadMass(b)).toBe(loadMass(restoreBehemoth(newRun(1).behemoth, 0, 0)) + ADDONS.twinTurret.mass + WEAPONS.heavyCannon.mass!);
    // Without it, the main gun is back on the centerline.
    expect(restoreBehemoth(newRun(1).behemoth, 0, 0).hardpoints.find((h) => h.slot.id === 'turret')!.slot.mount.y).toBe(0);
    // Both turn with the ring: swung a quarter turn, they're fore and aft of the pivot.
    b.turrets[0]!.angle = Math.PI / 2;
    const [pm, ps] = [mountPosition(b, main!), mountPosition(b, second!)];
    expect(pm.y).toBeCloseTo(ps.y);
    expect(pm.x - ps.x).toBeCloseTo(second!.slot.mount.y - main!.slot.mount.y);
  });

  it('a coax moves between the two guns', () => {
    const b = restoreBehemoth(newRun(1, 'class2', ['coax', 'twinTurret']).behemoth, 0, 0);
    expect(b.hardpoints.find((h) => h.slot.id === 'coax')!.slot.mount.y).toBe(0);
    expect(restoreBehemoth(newRun(1, 'class2', ['coax']).behemoth, 0, 0).hardpoints.find((h) => h.slot.id === 'coax')!.slot.mount.y).not.toBe(0);
  });

  it('on one trigger the two guns ripple: neither fires twice running, a gap apart', () => {
    const w = battle(newRun(1, 'class2', ['twinTurret'], guns));
    const shots: { slot: string; t: number }[] = [];
    for (let i = 0; i < 300; i++) {
      step(w, { fireMain: true });
      for (const ev of w.events) if (ev.type === 'fire' && ev.owner === 'player' && ev.slot) shots.push({ slot: ev.slot, t: w.time });
      w.events.length = 0;
    }
    expect(new Set(shots.map((s) => s.slot))).toEqual(new Set(['turret', 'twinTurret']));
    for (let i = 1; i < shots.length; i++) {
      expect(shots[i]!.slot).not.toBe(shots[i - 1]!.slot);
      expect(shots[i]!.t - shots[i - 1]!.t).toBeGreaterThanOrEqual(RIPPLE_GAP - 1e-6);
    }
    // Twice the guns, twice the shells: more than one gun alone manages in the same time.
    expect(shots.length).toBeGreaterThan(Math.floor(5 / WEAPONS.heavyCannon.reload) + 1);
  });

  it('a depot bolts it on empty; its mount takes an L gun and Harden, never Auto', () => {
    let run = atDepot(newRun(11), { addons: [{ addon: 'twinTurret', sold: false }], stock: [{ weapon: 'titanCannon', sold: false }, { weapon: 'autocannon', sold: false }] });
    run = applyAction(run, { kind: 'installAddon', stock: 0 });
    expect(run.behemoth.hardpoints.at(-1)).toMatchObject({ slot: 'twinTurret', weapon: null });
    expect(quote(run, { kind: 'install', slot: 'twinTurret', stock: 1 })).toEqual({ ok: false, reason: 'Wrong size' });
    run = applyAction(run, { kind: 'install', slot: 'twinTurret', stock: 0 });
    expect(run.behemoth.hardpoints.at(-1)).toMatchObject({ slot: 'twinTurret', weapon: 'titanCannon' });
    expect(partKind(run.behemoth, 'twinTurret')).toBe('coax');
    expect(tracksOf(run.behemoth, 'twinTurret')).toEqual(['harden']);
    expect(quote(run, { kind: 'bind', slot: 'twinTurret', binding: 'auto' })).toEqual({ ok: false, reason: 'Not allowed' });
    // The main ring's traverse upgrade is still the turret's.
    expect(tracksOf(run.behemoth, 'turret')).toEqual(['harden', 'traverse']);
    // Taking the turret back off sells the second gun with it.
    const off = quote(run, { kind: 'removeAddon', addon: 'twinTurret' });
    expect(off.ok && off.salvage).toBe(-(Math.floor(DEPOT_ADDONS.twinTurret!.price * DEPOT.resale) + Math.floor(DEPOT_WEAPONS.titanCannon!.price * DEPOT.resale)));
    run = applyAction(run, { kind: 'removeAddon', addon: 'twinTurret' });
    expect(run.behemoth.hardpoints.some((h) => h.slot === 'twinTurret')).toBe(false);
    expect(parseRun(serializeRun(run))).not.toBeNull();
  });
});

describe('the titan cannon', () => {
  const [heavy, titan] = [WEAPONS.heavyCannon, WEAPONS.titanCannon];

  it("is the heavy cannon, bigger: still an L main gun, the same shells, more of everything but rate", () => {
    expect(titan).toMatchObject({ size: 'L', role: 'main', category: 'ballistic' });
    expect(Object.keys(titan.shells!)).toEqual(Object.keys(heavy.shells!));
    expect(titan.mass!).toBeGreaterThan(heavy.mass!);
    expect(titan.reload).toBeGreaterThan(heavy.reload);
    for (const shell of Object.keys(heavy.shells!) as (keyof NonNullable<typeof heavy.shells>)[]) {
      const [a, b] = [heavy.shells![shell]!, titan.shells![shell]!];
      expect(b.kind).toBe(a.kind);
      expect(b.damage).toBeGreaterThan(a.damage);
      if (a.kind === 'shell' && b.kind === 'shell') {
        expect(b.blastRadius).toBeGreaterThan(a.blastRadius);
        expect(b.maxRange).toBeGreaterThan(a.maxRange);
      }
    }
    // Sustained fire is a little ahead too, not just the single shell.
    expect(titan.shells!.he!.damage / titan.reload).toBeGreaterThan(heavy.shells!.he!.damage / heavy.reload);
    expect(DEPOT_WEAPONS.titanCannon!.price).toBeGreaterThan(DEPOT_WEAPONS.heavyCannon!.price);
  });

  it('goes on the turret at a depot, takes a shell choice, and fires', () => {
    let run = atDepot(newRun(11), { stock: [{ weapon: 'titanCannon', sold: false }] });
    expect(quote(run, { kind: 'install', slot: 'prow', stock: 0 })).toEqual({ ok: false, reason: 'Wrong size' });
    run = applyAction(run, { kind: 'install', slot: 'turret', stock: 0 });
    run = applyAction(run, { kind: 'shell', slot: 'turret', shell: 'ap' });
    expect(run.behemoth.hardpoints.find((h) => h.slot === 'turret')).toMatchObject({ weapon: 'titanCannon', shell: 'ap' });
    const w = battle(run);
    for (let i = 0; i < 3; i++) step(w, { fireMain: true });
    const round = w.projectiles.find((p) => p.weapon.id === 'titanCannon');
    expect(round?.weapon.projectile).toBe(titan.shells!.ap);
  });
});

describe('the swarm pod', () => {
  it('is ready again almost as soon as its last missile is away', () => {
    expect(WEAPONS.swarmPod.reload).toBeLessThanOrEqual(0.5);
    const w = battle(newRun(1, 'class2', [], { spine: 'swarmPod' }));
    const pod = w.behemoth.hardpoints.find((h) => h.slot.id === 'spine')!;
    const full = pod.ammo!;
    // Three seconds on the trigger: a salvo is about half a second, so three are away (it was one every 6.5 s).
    for (let i = 0; i < 180; i++) step(w, { fireMissile: true });
    expect(full - pod.ammo!).toBeGreaterThanOrEqual(3);
  });
});
